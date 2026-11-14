import type { JevAnswer, JevRequest } from "../../shared/jev.ts";
import { decodeSituation, localPolicy, localStance, SITUATIONS } from "./colony.ts";
import {
  DOCTRINES,
  MODE_CRITERIA,
  packModeRequest,
  packStanceRequest,
  policyContext,
  readMode,
  readStance,
  situationKey,
  stanceContext,
  stanceKey,
  STANCE_CRITERIA,
} from "./colonyBrain.ts";
import type { FungalSituation } from "./fungalPolicy.ts";
import { askedLevers } from "./fungus.ts";
import { weightedValid } from "./weighted.ts";
import {
  AIMS,
  askedIn,
  FUNGUS_BATCH,
  fungalKey,
  fungusContext,
  packFungusRequest,
  readLevels,
  validLevels,
  worthAsking,
} from "./fungusBrain.ts";
import {
  GROWTH_BATCH,
  GROWTH_SCHEMA,
  growthContext,
  growthKey,
  localGrowthChoice,
  packGrowthRequest,
  readGrowth,
  validGrowth,
  type GrowthChoice,
} from "./growthBrain.ts";
import type { GrowthSituation } from "./hyphae.ts";
import { type LaneWords, STANCE_SCHEMA, type Situation, type SpeciesSituation, type Stance, type StanceSituation } from "./vocab.ts";

// What is known about each kind of question (lane) beyond its brain (colonyBrain.ts, fungusBrain.ts): the counter it feeds, the id its items carry, the
// prefix of its cache contexts, whether its answers are counted as hits and misses, whether a reply makes the ants reconsider, and how
// many situations a request carries. One row a lane: ui/colonyJev.ts, ui/prompt.ts and the Learn panel read it instead of switching on a name
// (docs/refactor.md S4). A new lane adds its row here and its lane object in ui/colonyJev.ts. Never imported from
// colony.ts or fungus.ts: it sits above the brains (a cycle otherwise).

export type LaneName = "mode" | "stance" | "fungus" | "growth";

/** The counters of ColonyJevState that count situations sent, by lane. */
export type SentCounter = "asked" | "stancesAsked" | "fungusAsked" | "growthAsked";

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
  // The fungus's hyphal tips (ja-2bw.5): a tip asks its policy at every step, so answers take hold by themselves.
  growth: {
    idPrefix: "g",
    counter: "growthAsked",
    contextPrefix: "growth-",
    countsHits: false,
    reconsiders: false,
    perRequest: GROWTH_BATCH,
  },
};

/** The lane whose cache contexts start this way, if any. */
export function laneOfContext(context: string): LaneName | null {
  for (const name of Object.keys(LANE_KINDS) as LaneName[]) if (context.startsWith(LANE_KINDS[name].contextPrefix)) return name;
  return null;
}

// ——— What each lane does (docs/refactor.md S4.2, ja-fnd.5.2.3) ———
//
// A lane's row holds its brain's own functions in one shape, so a consumer can loop over the lanes without knowing which is which. They are
// stateless: the words a lane asks under (a colony's doctrine, the fungus's aim) and the fungus's menu are the caller's, passed in where a
// function needs them, because both change while a game runs (ui/colonyJev.ts re-contexts a lane when its words change and rebuilds the
// fungus's asked levers when its menu does). Nothing here is new behaviour: each function is the brain's own, as colonyJev.ts wires it today
// (laneRegistry.char.test.ts and laneWiring.char.test.ts pin that, laneBinding.test.ts that the rows agree).

/** The counters of ColonyJevState that count answers kept, by lane. */
export type CachedCounter = "cached" | "stancesCached" | "fungusCached" | "growthCached";

/** A lane spec that is known to have the optional members `K` (the ants' lanes have a local rule and enumerate their situations; the fungus has `asks`). */
type Has<L, K extends keyof L> = L & { [P in K]-?: NonNullable<L[P]> };

export interface LaneSpec<Sit, Ans extends string, Ctx, Variant extends string = string> {
  readonly name: LaneName;
  /** the flags and sizes of the lane (LANE_KINDS) */
  readonly kind: LaneKind;
  /** the ColonyJevState counters it feeds: situations sent, answers kept */
  readonly counters: { readonly asked: SentCounter; readonly cached: CachedCounter };
  /** the forms its cache context takes besides the words: [""] for one, the fungus's "top" and "side" views */
  readonly variants: readonly Variant[];
  /** a situation the Learn panel shows and costs a question by */
  readonly sample: Sit;
  /** the name of the words in a request's state and in the shipped precache's bundles: a colony's doctrine, the fungus's aim */
  readonly wordsField: "doctrine" | "aim";
  /** the preset words the page ships answers for */
  readonly presets: readonly { readonly id: string; readonly text: string }[];
  /** whether the lane lets its queue fill before it sends less than a full batch (the fungus: its legend is most of a small request) */
  readonly gather: boolean;
  /** situations to a request when not the client's batch (absent: the client's; ColonyJevOptions.batch, 100) */
  readonly batch: number | null;
  /** the cache key for a situation; `ctx` is the lane's own context: the fungus's menu (the levers asked are in the key), nothing for an ant */
  key(s: Sit, ctx: Ctx, lane?: LaneWords<Ans>): string;
  /** one request for many situations, each with the key it was asked under, under `words`; `lane` is a species' own legend and criteria (absent: the generic ant's; the fungus's has none yet) */
  pack(items: { id: string; key: string; situation: Sit }[], words: string, lane?: LaneWords<Ans>): JevRequest;
  /** the answer to item `id`, asked under `key`, or null when it is not one the question allowed (the choices of `lane`'s criteria, when given) */
  read(answers: Record<string, JevAnswer>, id: string, situation: Sit, key: string, lane?: LaneWords<Ans>): Ans | null;
  /** whether a stored answer is one this lane's question could have given for `key` */
  valid(key: string, answer: string, lane?: LaneWords<Ans>): boolean;
  /** the cache context under `words`, for a variant of the lane (see `variants`; none: the first), and a species' own `lane` words */
  contextOf(words: string, variant?: Variant, lane?: LaneWords<Ans>): string;
  /** whether a situation is worth asking at all (absent: always) */
  asks?(s: Sit, ctx: Ctx): boolean;
  /** the local rule's answer (absent: the lane's local rule is not a pure function of the situation: the fungus's is a Game method) */
  local?(s: Sit): Ans;
  /** every situation the lane can be asked in (absent: not enumerable: the fungus's are the ones a game meets) */
  all?(lane?: LaneWords<Ans>): Sit[];
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

// Its answers are strings, not modes: Jev's mode with its probabilities (weighted.ts); `topOf` is the mode it chose, `pick` draws one.
const modeLane: Has<LaneSpec<Situation, string, undefined>, "local" | "all"> = {
  name: "mode",
  kind: LANE_KINDS.mode,
  counters: { asked: "asked", cached: "cached" },
  variants: [""],
  sample: SAMPLE_SITUATION,
  wordsField: "doctrine",
  presets: DOCTRINES,
  gather: false,
  batch: null,
  key: (s, _ctx, lane) => (lane?.schema ? lane.schema.key(s as SpeciesSituation) : situationKey(s)),
  pack: (items, words, lane) => packModeRequest(items, words, lane),
  read: (answers, id, _situation, _key, lane) => readMode(answers, id, lane ? Object.keys(lane.criteria) : undefined),
  // A kept answer is weighted (Jev's probabilities over the modes, weighted.ts) or a bare mode; every option must be one the lane allows.
  valid: (_key, answer, lane) => weightedValid(answer, (m) => Object.keys(lane?.criteria ?? MODE_CRITERIA).includes(m)),
  contextOf: (words, _variant, lane) => policyContext(words, lane),
  local: localPolicy,
  all: (lane) =>
    lane?.schema
      ? Array.from({ length: lane.schema.size }, (_, c) => lane.schema!.decode(c))
      : Array.from({ length: SITUATIONS }, (_, c) => decodeSituation(c)),
};

const stanceLane: Has<LaneSpec<StanceSituation, Stance, undefined>, "local" | "all"> = {
  name: "stance",
  kind: LANE_KINDS.stance,
  counters: { asked: "stancesAsked", cached: "stancesCached" },
  variants: [""],
  sample: SAMPLE_STANCE,
  wordsField: "doctrine",
  presets: DOCTRINES,
  gather: false,
  batch: null,
  key: (s) => stanceKey(s),
  pack: (items, words, lane) => packStanceRequest(items, words, lane),
  read: (answers, id, _situation, _key, lane) => readStance(answers, id, lane ? Object.keys(lane.criteria) : undefined),
  valid: (_key, answer, lane) => Object.keys(lane?.criteria ?? STANCE_CRITERIA).includes(answer),
  contextOf: (words, _variant, lane) => stanceContext(words, lane),
  local: localStance,
  all: () => Array.from({ length: STANCE_SCHEMA.size }, (_, c) => STANCE_SCHEMA.decode(c)),
};

// The levers asked (the menu's, a queen's or a worker's, in table order) are in each key, so a question is packed and its answer read and kept
// against the levers it asked, whatever the menu is by the time it lands: only `key` and `asks` read the menu.
/** The two forms of the fungus's cache context (fungusContext): the top-down view, and the side view (a nest underground). */
export type FungusView = "top" | "side";

const fungusLane: Has<LaneSpec<FungalSituation, string, ReadonlySet<string>, FungusView>, "asks"> = {
  name: "fungus",
  kind: LANE_KINDS.fungus,
  counters: { asked: "fungusAsked", cached: "fungusCached" },
  variants: ["top", "side"],
  sample: SAMPLE_FUNGAL,
  wordsField: "aim",
  presets: AIMS,
  gather: true,
  batch: FUNGUS_BATCH,
  key: (s, menu) => fungalKey(s, askedLevers(menu, s.task === "queen")),
  pack: (items, words) =>
    packFungusRequest(
      items.map((it) => ({ ...it, asked: askedIn(it.key) })),
      words,
    ),
  read: (answers, id, _situation, key) => readLevels(answers, id, askedIn(key)),
  valid: validLevels,
  contextOf: (words, variant = "top") => fungusContext(words, variant),
  asks: (s, menu) => worthAsking(askedLevers(menu, s.task === "queen")),
};

export const SAMPLE_GROWTH: GrowthSituation = { ahead: "soil", exposed: "wall", supply: "ample", run: "short" };

// The growth lane (ja-2bw.5): asked under the fungus's aim, the same words as the fungus lane. Its `local` is the rule as a function of the
// situation alone (what a live check compares Jev with); a tip in the game plays the fuller rule while a situation has no answer.
const growthLane: Has<LaneSpec<GrowthSituation, GrowthChoice, undefined>, "local" | "all"> = {
  name: "growth",
  kind: LANE_KINDS.growth,
  counters: { asked: "growthAsked", cached: "growthCached" },
  variants: [""],
  sample: SAMPLE_GROWTH,
  wordsField: "aim",
  presets: AIMS,
  gather: true,
  batch: GROWTH_BATCH,
  key: (s) => growthKey(s),
  pack: (items, words) => packGrowthRequest(items, words),
  read: (answers, id) => readGrowth(answers, id),
  valid: validGrowth,
  contextOf: (words) => growthContext(words),
  local: localGrowthChoice,
  all: () => Array.from({ length: GROWTH_SCHEMA.size }, (_, c) => GROWTH_SCHEMA.decode(c)),
};

/** Every lane, by name, typed. */
export const LANES = { mode: modeLane, stance: stanceLane, fungus: fungusLane, growth: growthLane } as const;

/**
 * A lane with its situation type forgotten, for code that loops over the lanes (the scripts' tables, the Learn panel): the one place the
 * cast is made, so no consumer repeats it. Each function takes the lane's own situation; `ctx` is the fungus's menu (required, so a forgotten menu is a compile error; an ant's lane ignores it: pass undefined).
 */
export interface ErasedLane {
  readonly name: LaneName;
  readonly kind: LaneKind;
  readonly counters: { readonly asked: SentCounter; readonly cached: CachedCounter };
  readonly variants: readonly string[];
  readonly sample: unknown;
  readonly wordsField: "doctrine" | "aim";
  readonly presets: readonly { readonly id: string; readonly text: string }[];
  readonly gather: boolean;
  readonly batch: number | null;
  key(s: unknown, ctx: ReadonlySet<string> | undefined, lane?: LaneWords): string;
  pack(items: { id: string; key: string; situation: unknown }[], words: string, lane?: LaneWords): JevRequest;
  read(answers: Record<string, JevAnswer>, id: string, situation: unknown, key: string, lane?: LaneWords): string | null;
  valid(key: string, answer: string, lane?: LaneWords): boolean;
  contextOf(words: string, variant?: string, lane?: LaneWords): string;
  asks?(s: unknown, ctx: ReadonlySet<string> | undefined): boolean;
  local?(s: unknown): string;
  all?(lane?: LaneWords): unknown[];
}
/** Every lane, in the order the page asks them. */
export const LANE_LIST: readonly ErasedLane[] = [LANES.mode, LANES.stance, LANES.fungus, LANES.growth];
