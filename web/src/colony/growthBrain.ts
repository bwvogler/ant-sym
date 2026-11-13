import type { JevAnswer, JevRequest } from "../../shared/jev.ts";
import { hash } from "./policyCache.ts";
import { defineSchema, legendOf } from "./schema.ts";
import { AHEADS, EXPOSURES, RUNS, SUPPLIES, type GrowthSituation } from "./hyphae.ts";

// The fungus's growth lane, pure (ja-2bw.5, docs/hyphal-growth.md, PRD §63): what a hyphal tip does at its step, from
// what it senses at its point (what is ahead, how exposed it is, its supply), asked under the player's aim for the
// fungus. One choice question per situation; 48 situations, so one request asks them all. The tip carries the answer
// out where the ground and the mass allow, and turns to whichever side it can (only the tip knows which side is free);
// a situation with no answer yet plays the tip's own local rule (hyphae.ts localGrowth), which also reads its body
// (its run since branching, its first heading, the spots near it).

/** Bump when the growth situation, the legend or the question changes: old cached answers no longer apply. */
export const GROWTH_BRAIN_VERSION = 2;

/** The growth situation's fields in the order a code and a cache key read them: 4 × 3 × 2 × 2 = 48 (run since ja-2bw.18). */
export const GROWTH_SCHEMA = defineSchema<GrowthSituation>([
  { name: "ahead", values: AHEADS },
  { name: "exposed", values: EXPOSURES },
  { name: "supply", values: SUPPLIES },
  { name: "run", values: RUNS },
]);
export const GROWTH_SITUATIONS = GROWTH_SCHEMA.size;

/** What Jev may answer for a tip: the tip's own choices, a turn's side left to the tip. */
export const GROWTH_CHOICES = ["grow", "turn", "branch", "rest", "fuse", "fruit"] as const;
export type GrowthChoice = (typeof GROWTH_CHOICES)[number];

export const GROWTH_CRITERIA: Record<GrowthChoice, string> = {
  grow: "grow: grow one cell straight on",
  turn: "turn: grow one cell aside, to whichever side is free (along a wall it slides; from its own hypha it turns away)",
  branch:
    "branch: put out a second tip beside it, both growing on (against a wall met head on, split both ways): the only way the mycelium gains tips, and what a real hypha does after a long run",
  rest: "rest: grow nothing this time, and keep the mass",
  fuse: "fuse: join its own hypha ahead, closing a loop (only when ahead is own): a loop keeps the far part fed if ants cut the hypha",
  fruit:
    "fruit: end this tip for good as a spore spot on the dug cell it touches (only on a wall or in a dug cell): ants walking there pick up spores, but the tip grows no more",
};

/** Requests carry every situation at once: the legend is most of a request, and there are only 48. */
export const GROWTH_BATCH = GROWTH_SITUATIONS;

export const GROWTH_LEGEND = legendOf(GROWTH_SCHEMA, {
  intro:
    "You are a fungus whose mycelium grows through the soil round an ant nest as hyphae: threads whose tips grow a cell at a time. Each key in `tips` is one growing tip, as it senses its point. ",
  fields: [
    [
      "ahead",
      "ahead is the cell it would grow into: soil, open (a tunnel or chamber the ants dug), rock (it can't grow there, or may not yet), or own (its own hypha). ",
    ],
    [
      "exposed",
      "exposed is where the tip is: buried (soil all round), wall (in soil beside a dug tunnel, where ants walk) or open (out in a dug cell). Ants digging cut hyphae in their way. ",
    ],
    [
      "supply",
      "supply is the mass the mycelium can spare for it now: short (growing would spend the last reserve) or ample. Mass grown into hyphae is the fungus's body; spores come from the same mass. ",
    ],
    [
      "run",
      "run is how far the tip has grown since it set out or last branched: short, or long (the length after which a real hypha branches). A mycelium spreads by branching: tips that never branch stay a few threads, reach few tunnels and few ants. ",
    ],
  ],
  outro: "Choose what the tip does. aim is what you want: follow it.",
});

/** The question for tip `id`: one choice among the growth answers. */
export function growthQuestion(id: string): JevRequest["questions"] {
  return {
    [`${id}_grow`]: {
      type: "choice",
      instructions: `Going by the aim, what should tip \`${id}\` do now?`,
      criteria: GROWTH_CRITERIA as Record<string, string>,
    },
  };
}

/** The cache key for a growth situation. */
export function growthKey(s: GrowthSituation): string {
  return GROWTH_SCHEMA.key(s);
}

/** One request for many tips' situations: one shared state (legend, aim, tips), a choice for each. */
export function packGrowthRequest(items: { id: string; situation: GrowthSituation }[], aim: string): JevRequest {
  const tips: Record<string, GrowthSituation> = {};
  const questions: JevRequest["questions"] = {};
  for (const it of items) {
    tips[it.id] = GROWTH_SCHEMA.state(it.situation);
    Object.assign(questions, growthQuestion(it.id));
  }
  return { state: { legend: GROWTH_LEGEND, aim, tips }, questions };
}

/** A tip's answer from a reply, or null when it is missing or not a growth answer (not cached; the local rule covers it). */
export function readGrowth(answers: Record<string, JevAnswer>, id: string): GrowthChoice | null {
  const a = answers[`${id}_grow`];
  if (!a || a.type !== "choice") return null;
  return (GROWTH_CHOICES as readonly string[]).includes(a.choice) ? (a.choice as GrowthChoice) : null;
}

/** Whether a stored answer is one the growth question could have given. */
export function validGrowth(_key: string, answer: string): boolean {
  return (GROWTH_CHOICES as readonly string[]).includes(answer);
}

/** What a cached answer was asked under: a different aim, legend or question is a different cache. */
export function growthContext(aim: string): string {
  return `growth-v${GROWTH_BRAIN_VERSION}-${hash(GROWTH_LEGEND + JSON.stringify(growthQuestion("g0")) + "\u0000" + aim.trim())}`;
}

/**
 * The local rule as a function of the situation alone (the lane's preset, what a live check compares Jev with): short
 * supply rests; its own hypha ahead, turn away; rock ahead, branch (split); a tunnel reached from the soil, fruit; a
 * long run, branch; else grow. A tip in the game plays the fuller rule (hyphae.ts localGrowth), which reads its body
 * too: its run (branching at the growth unit), its first heading, and the spots near it (fruiting spaced).
 */
export function localGrowthChoice(s: GrowthSituation): GrowthChoice {
  if (s.supply === "short") return "rest";
  if (s.ahead === "own") return "turn";
  if (s.ahead === "rock") return "branch";
  if (s.ahead === "open" && s.exposed !== "open") return "fruit";
  if (s.run === "long") return "branch";
  return "grow";
}
