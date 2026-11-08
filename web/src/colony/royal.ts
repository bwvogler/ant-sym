// The queen's scent and new queens, pure (ja-lo8.9; docs/new-queens.md). In the side view the queen's royal mark lies
// on her chamber's floor and doesn't spread (pheromone.ts), so what reaches the brood far from her is what the ants
// carry: an ant that touches her picks up her scent, nestmates share it by contact, and it fades. Her supply is split
// among the ants that touch her, so a big colony carries less of it an ant: the signal dilutes as the nest grows, and
// is faintest far from her. That is how a colony knows it is big without counting (docs/new-queens.md §2).
//
// Nurses decide caste from what they perceive of it (the queen's pheromone acts through the workers: Klobuchar &
// Deslippe 2002, Naturwissenschaften 89: 302–304; Boulay et al. 2009 for bipotent larvae). A young, well-fed larva in a
// chamber with food, whose nurses perceive the scent faint, is reared as a gyne; a gyne larva whose nurses perceive it
// strong is culled. The thresholds and rates are the game's own (design): no paper gives them.

import { ChunkLayer } from "./chunks.ts";
import { discOffsets } from "./hex.ts";

/** Scent a second the queen gives the ants that touch her, × her signal, split among them. */
export const SCENT_SUPPLY = 4;
/** Seconds of her supply the queen holds while no ant touches her: the next to touch her takes it. */
export const SCENT_HELD = 20;
/** Seconds for an ant's scent to fade to 1/e with no contact. */
export const SCENT_FADE = 100;
/** Seconds for an ant's scent to move to the mean of the ants it touches (shared by contact). */
export const SCENT_SHARE = 8;
/** An ant's scent at the start: the colony's steady share, SCENT_SUPPLY × SCENT_FADE spread over its ants. */
export function scentShare(ants: number): number {
  return ants > 0 ? (SCENT_SUPPLY * SCENT_FADE) / ants : 0;
}

/** Below this, as perceived by every nurse within two cells, a larva can be reared as a gyne. */
export const GYNE_MARK = 0.4;
/** At or above this, perceived by a nurse within two cells, a gyne larva is culled. */
export const CULL_MARK = 0.8;
/** Seconds of the cue (faint scent, well fed, food by it) a larva needs to become a gyne. */
export const GYNE_CUE = 4;
/** Seconds of strong scent by a gyne larva before it is culled. */
export const CULL_CUE = 10;
/** A larva is bipotent for its first this many seconds; after that its caste is fixed. */
export const BIPOTENT = 10;
/** A larva this well fed (energy) or better can be reared as a gyne. */
export const GYNE_ENERGY = 0.9;
/** Food lying in the larva's chamber for it to be reared as a gyne. */
export const GYNE_PANTRY = 2;
/** A gyne grows this many times as long as a worker, as larva and as pupa (and is fed brood.ts GYNE_FOOD, 3× a worker's). */
export const GYNE_TIME_X = 2;

/**
 * The most food an alate carries out (her body: the egg, what she was fed as a larva, and what nestmates feed her while
 * she waits), and so the most her daughter colony founds on (Game.found). Alates fatten in the nest before the flight.
 */
export const ALATE_RESERVE = 24;
/** Food a second nestmates feed a waiting alate from the chamber she is in (two or more of them by her; fewer, less). */
export const ALATE_FEED = 0.5;
/** Seconds an alate stays in the nest after she ecloses before she walks out to fly (where she meets nestmates). */
export const ALATE_WAIT = 60;
/** Seconds an alate takes a cell as she walks out. */
export const ALATE_STEP = 0.4;

/** A winged virgin queen (ja-lo8.9), from a gyne pupa: she waits, walks out along the tunnels, and flies at the hole. */
export interface Alate {
  x: number;
  y: number;
  /** seconds since she eclosed */
  t: number;
  /** seconds to her next step out */
  step: number;
  /** the fungus in her, its strain, her resistance (stepped by the fungus as the queen's is) */
  load: number;
  strain: number;
  resist: number;
  /** her body, in food (up to ALATE_RESERVE): out of her mother's economy, it is what her daughter founds on */
  food: number;
}

/** An alate that has flown from colony `mother`'s hole (Game takes it from Colony.flown). */
export interface Flight {
  mother: number;
  x: number;
  y: number;
  load: number;
  strain: number;
  at: number;
  /** her body, in food (Alate.food): her daughter's reserve */
  food: number;
}

/**
 * Sums and counts of a value on each cell this tick, for the mean of what the ants within one cell carry. Rebuilt every
 * tick like hunger.ts FeltGrid (not saved).
 */
export class SumGrid {
  readonly sum = new ChunkLayer((n) => new Float32Array(n), 0);
  readonly count = new ChunkLayer((n) => new Float32Array(n), 0);
  #touched: number[] = [];

  reset(): void {
    const t = this.#touched;
    for (let k = 0; k < t.length; k += 2) {
      this.sum.set(t[k] as number, t[k + 1] as number, 0);
      this.count.set(t[k] as number, t[k + 1] as number, 0);
    }
    t.length = 0;
  }

  add(x: number, y: number, v: number): void {
    if (x < 0 || y < 0) return;
    const c = this.count.get(x, y);
    if (c === 0) this.#touched.push(x, y);
    this.count.set(x, y, c + 1);
    this.sum.set(x, y, this.sum.get(x, y) + v);
  }

  /** The mean within one cell of (x, y), or NaN with nobody there. */
  mean(x: number, y: number): number {
    const o = discOffsets(1)[y & 1] as Int16Array;
    let s = 0;
    let n = 0;
    for (let k = 0; k < o.length; k += 2) {
      const ax = x + (o[k] as number);
      const ay = y + (o[k + 1] as number);
      if (ax < 0 || ay < 0) continue;
      s += this.sum.get(ax, ay);
      n += this.count.get(ax, ay);
    }
    return n > 0 ? s / n : NaN;
  }
}
