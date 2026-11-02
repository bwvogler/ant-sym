import type { Mode, Stance } from "./colony.ts";

// An ant's responses to what it touches and carries, pure. Choosing a mode is
// the ant's one big decision (colony.ts, a `Policy`); these are the small
// ones that used to be fixed mechanics: whether to pick food up, what to do
// while carrying, whether to put the load down here, which trail to lay and
// how much, how hard to shy from alarm, how loudly to raise it in a fight.
// Each is a function of a small situation (`Touch`), so each can later be a
// cached Jev question asked only when its moment comes, like the mode
// (colonyBrain.ts: RESPONSE_HOOKS). `localResponses` is exactly the colony's
// rules before the hooks (tests/golden.test.ts pins that); later behaviour
// MRs (docs/PRD.md §42) change them one at a time, each against the assays in
// experiment.ts. What the fungus does to an ant (layGain, quiet, gainAlarm…)
// stays outside: it scales what a response decides.

/** What an ant can hold: food, a soil pellet it dug or picked up, a corpse for the midden, or brood it is nursing. */
export const ITEMS = ["none", "food", "soil", "corpse", "brood"] as const;
export type Item = (typeof ITEMS)[number];

/**
 * What a response may depend on: few values, so an answer could be cached per situation. The
 * colony fills one shared object per call, so a response must read it and not keep it.
 */
export interface Touch {
  mode: Mode;
  carrying: Item;
  /** carrying food between chambers (side view, nest slice 5), not home from outside */
  porter: boolean;
  /** an explorer at a soil face, digging */
  digging: boolean;
  /** inside its own nest's radius */
  atNest: boolean;
  /** strangers within the colony's enemy range (always true in a fight) */
  enemy: boolean;
  stance: Stance;
}

export type Trail = "food" | "home" | "none";

export interface Responses {
  /** Touching food with empty jaws: take one unit? */
  get(t: Touch): boolean;
  /** Carrying anything: which mode to be in (asked every step while carrying; the mode policy is not asked then). */
  carry(t: Touch): Mode;
  /** Carrying food, at a place it can put it down (the nest on a top-down map; its chamber in the side view): put it down? */
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

/**
 * The rules before the hooks, unchanged: take food unless fighting; anything carried goes home; put food down
 * where it goes; walking out marks the way home and carrying food the way to it, while soil, corpse and
 * porter carriers lay nothing; shy from alarm unless fighting or digging; always raise it in a fight.
 */
export const localResponses: Responses = {
  get: (t) => t.mode !== "fight",
  carry: () => "return",
  drop: () => true,
  trail: (t) => (t.porter || t.carrying === "soil" || t.carrying === "corpse" ? "none" : t.carrying === "food" ? "food" : "home"),
  trailRate: () => 1,
  alarmGain: (t) => (t.mode === "fight" || t.digging ? 0 : 1),
  raiseAlarm: () => 1,
};

/** Responses with some hooks replaced (experiments, tests, cached answers): the rest stay local. */
export function responses(over: Partial<Responses> = {}): Responses {
  return { ...localResponses, ...over };
}

/** A situation as a cache key: 4 modes × 5 items × porter × digging × at nest × enemy × 3 stances (most combinations never occur). */
export function touchKey(t: Touch): string {
  return `${t.mode}|${t.carrying}|${t.porter ? "porter" : "-"}|${t.digging ? "digging" : "-"}|${t.atNest ? "nest" : "out"}|${t.enemy ? "enemy" : "clear"}|${t.stance}`;
}
