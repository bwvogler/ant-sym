import { FUNGUS_BATCH } from "./fungusBrain.ts";

// What is known about each kind of question (lane) beyond its brain (colonyBrain.ts, fungusBrain.ts): the counter it feeds, the id its items carry, the
// prefix of its cache contexts, whether its answers are counted as hits and misses, whether a reply makes the ants reconsider, and how
// many situations a request carries. One row a lane: ui/colonyJev.ts, ui/prompt.ts and the Learn panel read it instead of switching on a name
// (docs/refactor.md S4). A new lane adds its row here, its lane object in ui/colonyJev.ts and its sample in ui/prompt.ts. Never imported from
// colony.ts or fungus.ts: it sits above the brains (a cycle otherwise).

export type LaneName = "mode" | "stance" | "fungus";

/** The counters of ColonyJevState that count situations sent, by lane. */
export type SentCounter = "asked" | "stancesAsked" | "fungusAsked";

export interface LaneKind {
  /** the first character of the ids its situations carry in a request (s0, s1, …) */
  readonly idPrefix: string;
  /** the ColonyJevState counter of situations sent */
  readonly counter: SentCounter;
  /** the start of every cache context of this lane (policyContext, stanceContext, fungusContext) */
  readonly contextPrefix: string;
  /** whether a lookup counts as a hit or a miss in the run's tally (the ants' mode choices only) */
  readonly countsHits: boolean;
  /** whether a reply makes the colonies' ants reconsider (the fungus asks its policy every step, so its answers take hold by themselves) */
  readonly reconsiders: boolean;
  /** situations a request carries when costing a question: a hundred, but fewer for the fungus (a question per lever each) */
  readonly perRequest: number;
}

/** Situations a request carries when costing a question (as the page's estimates always have). */
export const PER_REQUEST = 100;

export const LANE_KINDS: Record<LaneName, LaneKind> = {
  mode: { idPrefix: "s", counter: "asked", contextPrefix: "colony-", countsHits: true, reconsiders: true, perRequest: PER_REQUEST },
  stance: {
    idPrefix: "c",
    counter: "stancesAsked",
    contextPrefix: "stance-",
    countsHits: false,
    reconsiders: true,
    perRequest: PER_REQUEST,
  },
  fungus: {
    idPrefix: "h",
    counter: "fungusAsked",
    contextPrefix: "fungus-",
    countsHits: false,
    reconsiders: false,
    perRequest: FUNGUS_BATCH,
  },
};

/** The lane whose cache contexts start this way, if any. */
export function laneOfContext(context: string): LaneName | null {
  for (const name of Object.keys(LANE_KINDS) as LaneName[]) if (context.startsWith(LANE_KINDS[name].contextPrefix)) return name;
  return null;
}
