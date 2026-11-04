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
 * Where an ant is, as it can tell: out (on the ground away from its hole, or in a stranger's nest), at its hole (the
 * nest's mouth; on a top-down map, the nest), in its own tunnels, or in one of its own chambers.
 */
export const WHERE = ["out", "hole", "tunnel", "chamber"] as const;
export type Where = (typeof WHERE)[number];

/** How good food tastes (docs/trails.md: Beckers et al. 1993): the map's quality, bucketed. */
export const QUALITY = ["poor", "fair", "rich"] as const;
export type Quality = (typeof QUALITY)[number];
/** Quality below this tastes poor, above QUALITY_RICH rich (the game's ordinary food is 1: fair). */
export const QUALITY_POOR = 0.75;
export const QUALITY_RICH = 1.25;
export function qualityOf(q: number): Quality {
  return q < QUALITY_POOR ? "poor" : q > QUALITY_RICH ? "rich" : "fair";
}

/**
 * Trail laid by a food carrier, by the food's quality, as a share of the colony's `deposit` (behaviour MR 3): *Lasius
 * niger* lays about 43 % more trail for 1 M sugar than for 0.05–0.1 M (Beckers et al. 1993; docs/trails.md), so rich
 * lays 1.44× what poor does.
 */
export const TRAIL_BY_QUALITY: Record<Quality, number> = { poor: 0.83, fair: 1, rich: 1.2 };
/**
 * A food carrier's trail as a share of `deposit` (behaviour MR 3): a quarter, so the food trail no longer sits at the
 * field's cap near the nest and followers can tell a stronger trail from a weaker (PRD §45.3). The home trail keeps
 * the full deposit: weakening it too (deposit 4 → 1) stranded carriers in the side view (314 held on one seed).
 */
export const FOOD_TRAIL = 0.25;

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
  /** where it is (see Where) */
  place: Where;
  /** what `get` is offered: food on the ground, a loose soil pellet off the mound, a corpse, brood to nurse ("none" for the other responses) */
  offered: Item;
  /** strangers within the colony's enemy range (always true in a fight) */
  enemy: boolean;
  stance: Stance;
  /** how good the food is, tasted: the food it carries, or the food `get` offers; "fair" otherwise */
  quality: Quality;
}

export type Trail = "food" | "home" | "none";

/** What a carrier does with its load: take it where it belongs, or put it down where it stands. */
export const CARRY = ["take", "put down"] as const;
export type Carry = (typeof CARRY)[number];

export interface Responses {
  /** Empty jaws, touching something it could take (`offered`: food, loose soil, a corpse, brood): take it? */
  get(t: Touch): boolean;
  /**
   * Carrying anything (asked every step while carrying; the mode policy is not asked then): take it where it belongs
   * (food home to the nest's chambers, a porter's to the chamber that wants it, soil out to the mound, a corpse to the
   * midden, brood to a brood chamber), going home to do it; or put it down here, and be asked afresh. (Carrying no
   * longer has a mode to choose: told to explore or fight with food in its jaws, an ant stranded it, ja-1pm.)
   */
  carry(t: Touch): Carry;
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
  /**
   * Following a food trail to where it ends, and no food there (behaviour MR 3, docs/trails.md: Robinson et al. 2005):
   * "no entry" laid, as a share of the colony's `deposit` (0 = none).
   */
  noEntry(t: Touch): number;
}

/**
 * The rules before the hooks (behaviour MR 3: trailRate follows the quality of food carried): take food unless fighting (soil, corpses and brood: whenever the mechanic offers them); anything carried is taken where it belongs; put food down
 * where it goes; walking out marks the way home and carrying food the way to it, while soil, corpse and
 * porter carriers lay nothing; shy from alarm unless fighting or digging; always raise it in a fight.
 */
export const localResponses: Responses = {
  get: (t) => t.offered !== "food" || t.mode !== "fight",
  carry: () => "take",
  drop: () => true,
  trail: (t) => (t.porter || t.carrying === "soil" || t.carrying === "corpse" ? "none" : t.carrying === "food" ? "food" : "home"),
  trailRate: (t) => (t.carrying === "food" ? FOOD_TRAIL * TRAIL_BY_QUALITY[t.quality] : 1),
  alarmGain: (t) => (t.mode === "fight" || t.digging ? 0 : 1),
  raiseAlarm: () => 1,
  noEntry: () => 1,
};

/** Responses with some hooks replaced (experiments, tests, cached answers): the rest stay local. */
export function responses(over: Partial<Responses> = {}): Responses {
  return { ...localResponses, ...over };
}

/**
 * A situation as a cache key: 4 modes × 5 items × porter × digging × 4 places × 5 offered × enemy × 3 stances, then
 * quality only when it isn't "fair" (so keys from before quality still match: most combinations never occur).
 */
export function touchKey(t: Touch): string {
  return `${t.mode}|${t.carrying}|${t.porter ? "porter" : "-"}|${t.digging ? "digging" : "-"}|${t.place}|${t.offered}|${t.enemy ? "enemy" : "clear"}|${t.stance}${t.quality === "fair" ? "" : `|${t.quality}`}`;
}
