// The words every part of the colony shares: what an ant's mode, stance and situation may be, the trail levels it senses,
// and the few constants those words carry. A leaf: it imports only the pheromone mark list, so colony.ts, responses.ts, recognition.ts,
// battle.ts and the brains can all use it without importing each other (docs/refactor.md S1).
import { MARKS } from "./pheromone.ts";
import { defineSchema } from "./schema.ts";

export const MODES = ["explore", "follow", "return", "fight"] as const;
export type Mode = (typeof MODES)[number];

export const STANCES = ["forage", "defend", "raid"] as const;
export type Stance = (typeof STANCES)[number];

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

export type Policy = (s: Situation) => Mode;

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
