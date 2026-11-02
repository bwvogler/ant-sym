import type { Mode, Stance } from "./colony.ts";

// An ant's responses to what it touches and carries, pure. Choosing a mode is
// the ant's one big decision (colony.ts, a `Policy`); these are the small
// ones that used to be fixed mechanics: whether to pick food up, where to go
// while carrying, whether to put it down here, which trail to lay and how
// much, how hard to shy from alarm, how loudly to raise it in a fight. Each
// is a function of a small situation (`Touch`), so each can later be a
// cached Jev question asked only when its moment comes, like the mode.
// `localResponses` is exactly the old mechanics (tests/golden.test.ts pins
// that); later behaviour MRs (docs/PRD.md §14) change them one at a time,
// each against the assays in experiment.ts.

/** What an ant can hold. Soil and eggs come with digging and brood (behaviour MR 2). */
export const ITEMS = ["none", "food"] as const;
export type Item = (typeof ITEMS)[number];

/**
 * What a response may depend on: few values, so an answer could be cached per situation. The
 * colony fills one shared object per call, so a response must read it and not keep it.
 */
export interface Touch {
  mode: Mode;
  carrying: Item;
  /** inside its own nest's radius */
  atNest: boolean;
  /** an enemy within the colony's enemy range (always true in a fight) */
  enemy: boolean;
  stance: Stance;
}

export type Trail = "food" | "home" | "none";

export interface Responses {
  /** Touching food with empty jaws: take one unit? */
  get(t: Touch): boolean;
  /** Carrying: what to do (asked every step while carrying; the mode policy is not asked then). */
  carry(t: Touch): Mode;
  /** Carrying, at a place it could put the load down (today only its nest): put it down? */
  drop(t: Touch): boolean;
  /** Which trail to lay this step. */
  trail(t: Touch): Trail;
  /** How much of it, as a share of the colony's `deposit`. */
  trailRate(t: Touch): number;
  /** How hard to steer away from alarm, as a share of the colony's `alarmAvoid` (0 = ignore it). */
  alarmGain(t: Touch): number;
  /** In a fight: alarm laid, as a share of the fight's `alarm` rate. */
  raiseAlarm(t: Touch): number;
}

/** The old mechanics, unchanged: take food unless fighting, carry it home, put it down there, mark the way, shy from alarm unless fighting, always raise it in a fight. */
export const localResponses: Responses = {
  get: (t) => t.mode !== "fight",
  carry: () => "return",
  drop: (t) => t.atNest,
  trail: (t) => (t.carrying === "food" ? "food" : "home"),
  trailRate: () => 1,
  alarmGain: (t) => (t.mode === "fight" ? 0 : 1),
  raiseAlarm: () => 1,
};

/** Responses with some hooks replaced (experiments, tests): the rest stay local. */
export function responses(over: Partial<Responses> = {}): Responses {
  return { ...localResponses, ...over };
}

/** Every situation a response can be asked in: 4 modes × 2 items × at nest × enemy × 3 stances = 96. */
export function touchKey(t: Touch): string {
  return `${t.mode}|${t.carrying}|${t.atNest ? "nest" : "out"}|${t.enemy ? "enemy" : "clear"}|${t.stance}`;
}
