import { atGate } from "./crossing.ts";
import { sunSeen } from "./heat.ts";
import { PLANE } from "./vocab.ts";
import { localResponses } from "./responses.ts";
import { MARKS } from "./pheromone.ts";
import { defineSchema, legendOf } from "./schema.ts";
import { SPECIES, type ModeRuleText, type Species } from "./species.ts";
import { MODES, type LaneWords, type Mode, type Policy, type SpeciesSituation } from "./vocab.ts";

// The desert ant, Cataglyphis (docs/desert-ant.md, PRD §60; ja-rf5.3): the first real species on the descriptor (docs/species.md), made only of
// its pieces. Modelled on C. fortis (Dillier & Wehner 2004, full text): one nest, about 200 workers. Its foragers work alone: no trail pheromone
// and no recruitment to a place (Razin et al. 2013, full text; Wolf & Wehner 2000, unverified), so it lays and reads no trail and no alarm, and
// has no follow mode and no stance lane; no corpse removal was found (desert-ant.md §5), so it leaves its dead. Built since: food odour in the air
// (ja-rf5.4), heat with the sun's height and the night (ja-rf5.5, ja-rf5.12; docs/desert-heat.md). Still to come: the invitation (ja-rf5.6).

/** Its mode lane's fields: what it does, whether it is tired, whether it feels hot (ja-rf5.5), whether the sun stands high (ja-rf5.12), whether strangers are near. No trails, alarm or stance to sense. */
export const DESERT_SCHEMA = defineSchema<SpeciesSituation>([
  { name: "mode", values: MODES },
  { name: "tired", values: [false, true], key: (v) => (v ? "tired" : "fresh") },
  { name: "hot", values: [false, true], key: (v) => (v ? "hot" : "cool") },
  { name: "sun", values: ["low", "high", "down"] },
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
        "hot",
        "hot means its own body is near the heat that kills it: the ground heats over the day, an ant out in the open heats with it and cools only back in the nest, and one that stays out too hot dies. ",
      ],
      [
        "sun",
        "sun is how high the sun stands, as it sees the sky from the open ground or the top of its shaft (deeper in the nest it reads low). low: the ground is bearable. high: the ground is at its hottest, and an ant that sets out or stays out then heats past what it can bear and dies before it gets home. down: night, when a desert ant, which steers by the sky, cannot find food or its way in the dark. ",
      ],
      [
        "enemy",
        "enemy says whether ants of another colony are within a few steps: desert ant colonies are hostile to one another. With enemy none there is nobody to fight: an ant that fights then stands where it is and does nothing, and a fight that is over sends it home or back out. ",
      ],
    ],
    outro: "doctrine is how the colony wants its ants to behave: follow it.",
  }),
  criteria: {
    explore: "explore: go out, or keep searching, alone for food (only while the sun is low and it is not hot)",
    return: "return: walk home",
    fight: "fight: attack a stranger within reach (only when enemy is near)",
  },
  // 2: fight only with a stranger near (review of #140 D1, owner 2026-11-13: v1 under Warlike fought with nobody near and stalled)
  // 3: the hot field (ja-rf5.5); 4: the sun field (ja-rf5.12); 5: the sun down at night (owner, 2026-11-13); 6: the sun's consequence spelled
  // out (v5's answers sent a fresh, cool explorer out at high sun and at night: owner, reword and re-ask)
  // 7: explore conditioned on a low sun and a cool body, as fight on a stranger near (v6's answers still sent foragers out at night: owner)
  version: 7,
  schema: DESERT_SCHEMA,
};

/** Its local rule: home when hot or tired or a fight is over; otherwise out searching, alone (nothing to follow). Strangers in reach are its contact response's. */
export const desertPolicy: Policy = (s) => {
  if ((s as SpeciesSituation).hot) return "return";
  if ((s as SpeciesSituation).sun === "high" || (s as SpeciesSituation).sun === "down") return "return";
  if (s.tired) return "return";
  if (s.mode === "fight") return "return";
  return "explore";
};

/** desertPolicy in words, for the Learn drawer (ruleTextAgrees holds them equal over every situation of DESERT_SCHEMA). */
export const DESERT_RULE_TEXT: ModeRuleText = {
  rows: [
    { when: "it is hot (its body near the heat that kills it)", then: "return", test: (s) => (s as SpeciesSituation).hot === true },
    { when: "the sun stands high (a trip out would cook it)", then: "return", test: (s) => (s as SpeciesSituation).sun === "high" },
    { when: "the sun is down (night: it steers by the sky)", then: "return", test: (s) => (s as SpeciesSituation).sun === "down" },
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
    // Food odour in the air (ja-rf5.4, docs/desert-ant.md §3): C. fortis turns in to food odour up to about 6 m (5.9 m the longest;
    // Buehlmann et al. 2014, a pre-publication draft: unverified). One world's nests are 140 cells apart against C. fortis's ~40 m,
    // about 3.5 cells a metre: 6 m is 21 cells. D3 (PRD §60.4): the first find comes sooner on every seed of 1–20.
    foodPlume: 21,
    // Heat and the sun (ja-rf5.5, ja-rf5.12; docs/desert-heat.md, PRD §60.5): all design but the critical heat, 53.6 °C (C. bombycina, Gehring &
    // Wehner 1995, read through later papers: a borrowing, unverified; the params.ts default). A 10-minute day, a third of it night (owner,
    // 2026-11-13); the ground 25 °C from sunset to sunrise and 56 °C at noon (the air at ant height, 6–7 °C under a surface of about 70 °C:
    // unverified); the nest 30 °C; the body closes on its surroundings in about 30 s, feels hot from 45 °C until back under 34 °C; the sun
    // counts as high from 0.6 of its noon height. Chosen on D5: seeds 1–10 pass 10/10 by the worst seed.
    heatDay: 600,
    heatNight: 1 / 3,
    heatNoon: 56,
    heatTau: 30,
    heatFelt: 45,
    heatSunHigh: 0.6,
  },
  // Its channel set already keeps it from laying trail or alarm (review of #138: overriding those responses changed nothing). What differs is
  // contact: between Cataglyphis colonies aggression is at its maximum (C. iberica, C. niger: desert-ant.md §5, unverified), so an ant with
  // nothing in its jaws fights a stranger it touches, whatever the odds; a carrier takes its load home (owner, review of #138 D1).
  // It senses its own heat (the sense table's own-body row): hot near the heat that kills it.
  // It sees the sun's height where the sky is in view: out on the plane, or at the top of its own shaft (desert-heat.md §2).
  sense: (c, i) => ({ hot: c.hot[i] === 1, sun: c.layer[i] === PLANE || atGate(c, i) ? sunSeen(c.params, c.time) : "low" }),
  responses: { ...localResponses, contact: (t) => (t.carrying === "none" ? "fight" : "flee") },
  lanes: { mode: DESERT_MODE_WORDS },
  policy: desertPolicy,
  ruleText: DESERT_RULE_TEXT,
};

// The page can play it (the start screen's species choice): a save names it by id (species.ts SPECIES).
(SPECIES as Record<string, Species>)[DESERT_ANT.id] = DESERT_ANT;
