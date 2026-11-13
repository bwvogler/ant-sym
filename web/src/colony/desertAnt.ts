import { localResponses } from "./responses.ts";
import { MARKS } from "./pheromone.ts";
import { defineSchema, legendOf } from "./schema.ts";
import type { ModeRuleText, Species } from "./species.ts";
import { MODES, type LaneWords, type Mode, type Policy, type SpeciesSituation } from "./vocab.ts";

// The desert ant, Cataglyphis (docs/desert-ant.md, PRD §60; ja-rf5.3): the first real species on the descriptor (docs/species.md), made only of
// its pieces. Modelled on C. fortis (Dillier & Wehner 2004, full text): one nest, about 200 workers. Its foragers work alone: no trail pheromone
// and no recruitment to a place (Razin et al. 2013, full text; Wolf & Wehner 2000, unverified), so it lays and reads no trail and no alarm, and
// has no follow mode and no stance lane; no corpse removal was found (desert-ant.md §5), so it leaves its dead. Still to come, each its own
// bead: food odour in the air (ja-rf5.4), heat (ja-rf5.5, a field of its situation), the invitation (ja-rf5.6).

/** Its mode lane's fields: what it does, whether it is tired, whether strangers are near. No trails, alarm or stance to sense; heat comes with ja-rf5.5. */
export const DESERT_SCHEMA = defineSchema<SpeciesSituation>([
  { name: "mode", values: MODES },
  { name: "tired", values: [false, true], key: (v) => (v ? "tired" : "fresh") },
  { name: "enemy", values: ["none", "near"] },
]);

/** What Jev reads for the desert ant: a forager alone, by its own vector, with no scent of others to follow. */
export const DESERT_MODE_WORDS: LaneWords<Mode> = {
  legend: legendOf(DESERT_SCHEMA, {
    intro:
      "Each key in `ants` is the situation of one worker of a desert ant colony, empty-jawed, at a moment it chooses what to do. Desert ants forage alone: they lay no scent trail and follow none, and find their way home by counting their steps and the sun. ",
    fields: [
      ["mode", "mode is what it is doing: explore (out searching for food alone), return (home) or fight; follow does not apply to it. "],
      ["tired", "tired means it has searched long outside without finding food: a desert forager's trips are short. "],
      [
        "enemy",
        "enemy says whether ants of another colony are within a few steps: desert ant colonies are hostile to one another. With enemy none there is nobody to fight: an ant that fights then stands where it is and does nothing, and a fight that is over sends it home or back out. ",
      ],
    ],
    outro: "doctrine is how the colony wants its ants to behave: follow it.",
  }),
  criteria: {
    explore: "explore: go out, or keep searching, alone for food",
    return: "return: walk home",
    fight: "fight: attack a stranger within reach (only when enemy is near)",
  },
  // 2: fight only with a stranger near (review of #140 D1, owner 2026-11-13: v1 under Warlike fought with nobody near and stalled)
  version: 2,
  schema: DESERT_SCHEMA,
};

/** Its local rule: home when tired or a fight is over; otherwise out searching, alone (nothing to follow). Strangers in reach are its contact response's. */
export const desertPolicy: Policy = (s) => {
  if (s.tired) return "return";
  if (s.mode === "fight") return "return";
  return "explore";
};

/** desertPolicy in words, for the Learn drawer (ruleTextAgrees holds them equal over every situation of DESERT_SCHEMA). */
export const DESERT_RULE_TEXT: ModeRuleText = {
  rows: [
    { when: "it is tired (searched long outside without finding food)", then: "return", test: (s) => s.tired },
    { when: "it was fighting", then: "return", test: (s) => s.mode === "fight" },
  ],
  otherwise: "Otherwise: go out, or keep searching, alone (there is no trail to follow).",
  otherwiseMode: () => "explore",
};

export const DESERT_ANT: Species = {
  id: "desert",
  name: "Desert ant",
  params: {
    maxAnts: 200,
    // No trail or alarm channel: only the nest's floor marks (it can tell its chambers apart: ja-fnd.5.14).
    channelSet: MARKS,
    homeTrail: 0,
    raidGate: 0,
    stanceGate: 0,
    undertakes: false,
  },
  // Its channel set already keeps it from laying trail or alarm (review of #138: overriding those responses changed nothing). What differs is
  // contact: between Cataglyphis colonies aggression is at its maximum (C. iberica, C. niger: desert-ant.md §5, unverified), so an ant with
  // nothing in its jaws fights a stranger it touches, whatever the odds; a carrier takes its load home (owner, review of #138 D1).
  responses: { ...localResponses, contact: (t) => (t.carrying === "none" ? "fight" : "flee") },
  lanes: { mode: DESERT_MODE_WORDS },
  policy: desertPolicy,
  ruleText: DESERT_RULE_TEXT,
};
