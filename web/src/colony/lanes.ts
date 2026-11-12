import type { JevAnswer, JevRequest } from "../../shared/jev.ts";
import { localPolicy, localStance } from "./colony.ts";
import {
  packModeRequest,
  packStanceRequest,
  policyContext,
  readMode,
  readStance,
  situationKey,
  stanceContext,
  stanceKey,
} from "./colonyBrain.ts";
import type { FungalSituation } from "./fungalPolicy.ts";
import { askedLevers } from "./fungus.ts";
import { askedIn, FUNGUS_BATCH, fungalKey, fungusContext, packFungusRequest, readLevels, validLevels, worthAsking } from "./fungusBrain.ts";
import { MODES, STANCES, type Mode, type Situation, type Stance, type StanceSituation } from "./vocab.ts";

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

// ——— What each lane does, bound to its inputs (docs/refactor.md S4.2, ja-fnd.5.2.3) ———
//
// A lane is a recipe over its own inputs, its frame: a colony's lanes are asked under its doctrine (`{ words }`), the fungus's under its aim
// and the menu of levers it asks (`{ words, menu }`). `bind(frame)` closes the brain's functions over the frame and gives them one shape, so a
// consumer can loop over the lanes without knowing which is which. Nothing here is new behaviour: each function is the brain's own, as
// colonyJev.ts wires it today (laneRegistry.char.test.ts and laneWiring.char.test.ts pin that, laneBinding.test.ts that this agrees).

/** The counters of ColonyJevState that count answers kept, by lane. */
export type CachedCounter = "cached" | "stancesCached" | "fungusCached";

/** A lane's brain functions, bound to a frame. */
export interface Bound<Sit, Ans extends string> {
  /** the cache key for a situation */
  key(s: Sit): string;
  /** one request for many situations (each with the key it was asked under), under the frame's words */
  pack(items: { id: string; key: string; situation: Sit }[]): JevRequest;
  /** the answer to item `id`, asked under `key`, or null when it is not one the question allowed */
  read(answers: Record<string, JevAnswer>, id: string, situation: Sit, key: string): Ans | null;
  /** whether a stored answer is one this lane's question could have given for `key` */
  valid(key: string, answer: string): boolean;
  /** the cache context under the frame's words, for a variant of the lane (see LaneSpec.variants) */
  context(variant?: string): string;
  /** whether a situation is worth asking at all (absent: always) */
  asks?(s: Sit): boolean;
  /** the local rule's answer (absent: the lane's local rule is not a pure function of the situation) */
  local?(s: Sit): Ans;
}

export interface LaneSpec<Frame, Sit, Ans extends string> {
  readonly name: LaneName;
  /** the flags and sizes of the lane (LANE_KINDS) */
  readonly kind: LaneKind;
  /** the ColonyJevState counters it feeds: situations sent, answers kept */
  readonly counters: { readonly asked: SentCounter; readonly cached: CachedCounter };
  /** the forms its cache context takes besides the words: [""] for one, the fungus's "top" and "side" views */
  readonly variants: readonly string[];
  /** a situation the Learn panel shows and costs a question by */
  readonly sample: Sit;
  bind(frame: Frame): Bound<Sit, Ans>;
}

/** A colony's lanes ask under its doctrine. */
export interface WordsFrame {
  words: string;
}
/** The fungus's lane asks under its aim and the levers on its menu. */
export interface FungusFrame {
  words: string;
  menu: ReadonlySet<string>;
}

export const SAMPLE_SITUATION: Situation = {
  mode: "explore",
  tired: false,
  foodTrail: "faint",
  homeTrail: "strong",
  alarm: "none",
  enemy: "none",
  stance: "forage",
};
export const SAMPLE_STANCE: StanceSituation = {
  stance: "forage",
  ants: "some",
  losses: "none",
  enemyNearNest: false,
  intake: "some",
  larder: "low",
};
export const SAMPLE_FUNGAL: FungalSituation = {
  arousal: "calm",
  touch: "nestmate",
  place: "outside",
  task: "forager",
  carrying: "nothing",
  groomed: false,
};

const modeLane: LaneSpec<WordsFrame, Situation, Mode> = {
  name: "mode",
  kind: LANE_KINDS.mode,
  counters: { asked: "asked", cached: "cached" },
  variants: [""],
  sample: SAMPLE_SITUATION,
  bind: ({ words }) => ({
    key: situationKey,
    pack: (items) => packModeRequest(items, words),
    read: (answers, id) => readMode(answers, id),
    valid: (_key, answer) => (MODES as readonly string[]).includes(answer),
    context: () => policyContext(words),
    local: localPolicy,
  }),
};

const stanceLane: LaneSpec<WordsFrame, StanceSituation, Stance> = {
  name: "stance",
  kind: LANE_KINDS.stance,
  counters: { asked: "stancesAsked", cached: "stancesCached" },
  variants: [""],
  sample: SAMPLE_STANCE,
  bind: ({ words }) => ({
    key: stanceKey,
    pack: (items) => packStanceRequest(items, words),
    read: (answers, id) => readStance(answers, id),
    valid: (_key, answer) => (STANCES as readonly string[]).includes(answer),
    context: () => stanceContext(words),
    local: localStance,
  }),
};

// The levers asked (the menu's, a queen's or a worker's, in table order) are in each key, so a question is packed and its answer read and kept
// against the levers it asked, whatever the menu is by the time it lands. The fungus's local rule is a method on its Game (Fungus.local), so it
// is not here: colonyJev wires it.
const fungusLane: LaneSpec<FungusFrame, FungalSituation, string> = {
  name: "fungus",
  kind: LANE_KINDS.fungus,
  counters: { asked: "fungusAsked", cached: "fungusCached" },
  variants: ["top", "side"],
  sample: SAMPLE_FUNGAL,
  bind: ({ words, menu }) => {
    const asked = (s: FungalSituation) => askedLevers(menu, s.task === "queen");
    return {
      key: (s) => fungalKey(s, asked(s)),
      pack: (items) =>
        packFungusRequest(
          items.map((it) => ({ ...it, asked: askedIn(it.key) })),
          words,
        ),
      read: (answers, id, _situation, key) => readLevels(answers, id, askedIn(key)),
      valid: validLevels,
      context: (variant) => fungusContext(words, variant === "side" ? "side" : "top"),
      asks: (s) => worthAsking(asked(s)),
    };
  },
};

/** Every lane, by name. */
export const LANES = { mode: modeLane, stance: stanceLane, fungus: fungusLane } as const;
/** One lane, whichever it is. */
export type AnyLane = (typeof LANES)[LaneName];
/** Every lane, in the order the page asks them. */
export const LANE_LIST: readonly AnyLane[] = [LANES.mode, LANES.stance, LANES.fungus];
