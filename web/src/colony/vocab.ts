// The words every part of the colony shares: what an ant's mode, stance and situation may be, the trail levels it senses,
// and the few constants those words carry. A leaf: it imports only the pheromone mark list and the schema helper, so colony.ts, responses.ts, recognition.ts,
// battle.ts and the brains can all use it without importing each other (docs/refactor.md S1).
import { MARKS } from "./pheromone.ts";
import { defineSchema, type Schema } from "./schema.ts";
import type { Draw } from "./weighted.ts";

export const MODES = ["explore", "follow", "return", "fight"] as const;
export type Mode = (typeof MODES)[number];

/** A mode's index in MODES (the per-ant `mode` array holds these). */
export const EXPLORE = 0;
export const FOLLOW = 1;
export const RETURN = 2;
export const FIGHT = 3;

export const STANCES = ["forage", "defend", "raid"] as const;
export type Stance = (typeof STANCES)[number];

/**
 * The words one species asks one lane under (docs/species.md, ja-fnd.5.3.2): the legend Jev reads, the choices it may give with the sentence
 * that describes each (the question's criteria), and the version that retires its cached answers. A context is a hash of all three and the
 * doctrine, so a species with other words has its own cache, and the generic ant's never moves. The functions stay the lane registry's.
 */
export interface LaneWords<C extends string = string> {
  readonly legend: string;
  /** a choice of the lane (a `Mode`, a `Stance`) with its sentence; a species may offer a subset, and a key that is not a choice of the lane fails to compile */
  readonly criteria: Readonly<Partial<Record<C, string>>>;
  readonly version: number;
  /**
   * The mode lane's fields when a species asks its own situation (ja-fnd.5.10): a schema over the generic fields it keeps and the ones it senses
   * itself (Species.sense). Its legend must describe exactly these (build it with legendOf). Absent: the generic SITUATION_SCHEMA. Other lanes ignore it.
   */
  readonly schema?: Schema<SpeciesSituation>;
}

export const TRAILS = ["none", "faint", "strong"] as const;
export type Trail = (typeof TRAILS)[number];
/** Sensor readings at or above these are a faint / strong trail. */
export const FAINT = 0.05;
export const STRONG = 1;

export function trailLevel(v: number): Trail {
  return v >= STRONG ? "strong" : v >= FAINT ? "faint" : "none";
}

/**
 * Where an ant is in its nest (nest slice 3): in a tunnel, or in one of its colony's chambers by that chamber's role
 * (the floor's smell tells it, Heyman et al. 2017). The side view's underground; on the ground, and on the top-down
 * maps, the home trail's level stands in its place.
 */
export const PLACES = ["tunnel", ...MARKS] as const;
export type Place = (typeof PLACES)[number];
/** The situation's home field: the home trail ahead (on the ground), or where in the nest the ant is. */
export const HOMES = [...TRAILS, ...PLACES] as const;
export type Home = (typeof HOMES)[number];
/** What a mode choice may depend on: few values, so an answer can be cached per situation. Carrying ants are never asked: they go home. */
export interface Situation {
  mode: Mode;
  /** out longer than the colony's patience without finding food */
  tired: boolean;
  foodTrail: Trail;
  /** on the ground: the home trail ahead; inside the nest (side view): where it is, a tunnel or a chamber's role */
  homeTrail: Home;
  alarm: Trail;
  /** an ant of another colony within two cells */
  enemy: "none" | "near";
  /** what the colony as a whole is doing (the strategist's choice) */
  stance: Stance;
}

/**
 * The mode lane's fields in the order a code and a cache key read them: 4 × 2 × 3 × 9 × 3 × 2 × 3 = 3,888 situations
 * (home: 3 trail levels or 6 places in the nest). The cache key is `explore|fresh|none|none|none|none|forage`-shaped.
 */
export const SITUATION_SCHEMA = defineSchema<Situation>([
  { name: "mode", values: MODES },
  { name: "tired", values: [false, true], key: (v) => (v ? "tired" : "fresh") },
  { name: "foodTrail", values: TRAILS },
  { name: "homeTrail", values: HOMES },
  { name: "alarm", values: TRAILS },
  { name: "enemy", values: ["none", "near"] },
  { name: "stance", values: STANCES },
]);

/**
 * A mode policy. `draw` (uniform in [0, 1), the colony's own rng, with the temperature it draws at) is for a policy whose answer is a distribution (Jev's
 * probabilities, weighted.ts): it draws once to pick the mode, and the colony re-asks that ant later (`reroll`). A policy
 * that never calls it answers as before, and the game draws nothing more (ja-nan3).
 */
export type Policy = (s: Situation, draw?: Draw) => Mode;

/**
 * A mode-lane situation as a species asks it (ja-fnd.5.10): every generic field (the tick always senses them; a species' schema may leave some out of
 * its key and its question) and the fields of its own that its sensor adds. A species' policy reads its own fields by name.
 */
export type SpeciesSituation = Situation & { readonly [field: string]: unknown };

/** The mode lane's schema under a species' words: its own, or the generic SITUATION_SCHEMA (the same functions, so the generic ant's keys are unchanged). */
export function modeSchema(words?: { readonly schema?: Schema<SpeciesSituation> }): Schema<SpeciesSituation> {
  return words?.schema ?? (SITUATION_SCHEMA as unknown as Schema<SpeciesSituation>);
}

/** Counts per cell, read by integer cell coordinates (the game's enemy grid). */
export interface CellCounts {
  get(x: number, y: number): number;
  /** whether any cell in the rectangle x0..x1 × y0..y1 (inclusive) may hold a count: a cheap early out */
  any(x0: number, y0: number, x1: number, y1: number): boolean;
  /** count, from now on, what is a stranger to this odour at this tolerance (recognition.ts); absent: everything counts */
  look?(odour: number, tolerance: number): void;
}

/** A cell holds an enemy an ant reacts to when its (calm-weighted) strangers reach this. */
export const ENEMY = 0.5;

/** The strategist's coarse view of its own colony: few values, so a stance can be cached per view too. */
export interface StanceSituation {
  stance: Stance;
  /** living ants against the colony's cap */
  ants: "few" | "some" | "many";
  /** ants lost lately (a 30 s fading count) */
  losses: "none" | "some" | "heavy";
  enemyNearNest: boolean;
  /**
   * food brought home lately, per ant (behaviour MR 5, docs/activation.md: a colony knows its food only as the rate
   * foragers bring it in, never as what is left on the map): none, some or plenty
   */
  intake: "none" | "some" | "plenty";
  /** food stored but not yet turned into ants (the colony is at its cap) */
  larder: "low" | "full";
}

/** The strategist's fields: 3 × 3 × 3 × 2 × 3 × 2 = 324 views. */
export const STANCE_SCHEMA = defineSchema<StanceSituation>([
  { name: "stance", values: STANCES },
  { name: "ants", values: ["few", "some", "many"] },
  { name: "losses", values: ["none", "some", "heavy"] },
  { name: "enemyNearNest", values: [false, true], key: (v) => (v ? "enemy" : "clear") },
  { name: "intake", values: ["none", "some", "plenty"], key: (v) => `intake:${v}` },
  { name: "larder", values: ["low", "full"] },
]);

export type StancePolicy = (s: StanceSituation) => Stance;

/** How far an odour may sit from an ant's own before it is a stranger. Tied to MAX_MASK, FUNGAL and BINS (above); colonies built alone use it too. */
export const TOLERANCE = 0.35;

/** One world's layers (docs/one-world.md §2): the plane, the surface, is layer 0; the curtain, underground, layer 1 (a colony's home there). */
export const PLANE = 0;
export const CURTAIN = 1;

/**
 * The steering weights (staging, ja-ykmu; docs/steering.md "The mechanic"): how strongly an ant out searching or following on one
 * world's plane weighs each cue, set per situation by the steer policy. `search` (its random turning) and `memory` (its last
 * find against the food trail) are the ones the biology lets a situation set; `trail`, `home`, `vector` and `nestmates` are
 * design (the Lab switches them on). Alarm keeps its own response (`alarmGain`).
 */
export const STEER_WEIGHTS = ["search", "memory", "trail", "home", "vector", "nestmates"] as const;
export type SteerWeight = (typeof STEER_WEIGHTS)[number];
/** Each weight's three levels: −1, 0 (as the game steers without weights) and +1. What each means is the weight's own (steer.ts). */
export type SteerLevel = -1 | 0 | 1;
export type Steering = Readonly<Record<SteerWeight, SteerLevel>>;
/** Every weight at 0: the game's steering as it was. */
export const NEUTRAL_STEERING: Steering = { search: 0, memory: 0, trail: 0, home: 0, vector: 0, nestmates: 0 };
/** A steering packed into one number for the per-ant store: Σ (level + 1) × 3^k, k the weight's index. */
export function encodeSteering(s: Steering): number {
  let code = 0;
  for (let k = STEER_WEIGHTS.length - 1; k >= 0; k--) code = code * 3 + (s[STEER_WEIGHTS[k] as SteerWeight] + 1);
  return code;
}
/** The packed code of NEUTRAL_STEERING. */
export const STEER_NEUTRAL = encodeSteering(NEUTRAL_STEERING);
/** Weight k's level in a packed code. */
export function steerLevel(code: number, k: number): SteerLevel {
  return ((Math.floor(code / 3 ** k) % 3) - 1) as SteerLevel;
}
export function decodeSteering(code: number): Steering {
  const out: Record<string, SteerLevel> = {};
  STEER_WEIGHTS.forEach((w, k) => (out[w] = steerLevel(code, k)));
  return out as Steering;
}
/** The steer policy: the weights for an ant whose mode policy, in situation `s` (with the mode it now has), sent it exploring or following. */
export type SteerPolicy = (s: Situation) => Steering;
