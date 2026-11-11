// Energy and hunger, pure (ja-xu6.1, owner 2026-11-08; docs/PRD.md §50.18). In the side view, where a colony has a
// queen and brood, every adult, larva and the queen has energy (0..1) that drains with time and is refilled by eating.
// An adult that runs out dies of hunger, and so does a larva.
//
// Hunger travels by touch, not by smell. Hungry larvae beg with movements that nurses feel, and starved and fed larvae
// smell alike (Peignier et al. 2019, Front. Ecol. Evol. 7:398). In Myrmica rubra a "gradient of hunger" runs from the
// larvae through the nurses to the foragers (cited there). So a begging larva, or a queen who can't lay for want of food,
// is felt by the ants within one cell, and each ant passes on a little less of what it felt to the ants it touches.
// The felt need is what draws an old ant, who otherwise forages, to carry food inside: a response threshold
// (Bonabeau, Theraulaz & Deneubourg 1996) that age raises.

import { ChunkLayer } from "./chunks.ts";
import { discOffsets } from "./hex.ts";

/** Energy an adult uses a second inside the nest: from full to empty in 40 minutes. */
export const ADULT_DRAIN = 1 / 2400;
/** Energy an adult uses a second out on the ground, foraging (twice the rate inside). */
export const ADULT_DRAIN_OUT = 2 / 2400;
/** An adult tops itself up where food lies in its own nest, or from a well-fed nestmate, once its energy is below this. */
export const EAT_BELOW = 0.7;
/** Below this an adult is hungry: it begs of the nestmates it touches, and porters bring it a meal (colony.ts #portView). */
export const ADULT_BEG_BELOW = 0.4;
/** Energy one unit of food gives an adult: eight meals from empty a unit (about a fifth of a unit an ant-hour inside). */
export const ENERGY_PER_FOOD = 8;

/** Energy a larva uses a second: an unfed larva dies in ten minutes. */
export const LARVA_DRAIN = 1 / 600;
/** Energy one unit of food gives a larva (food goes to its energy first, then to its growth). */
export const LARVA_ENERGY_PER_FOOD = 2;
/** A larva begs once its energy is below this (after about two minutes unfed). */
export const BEG_BELOW = 0.8;

/** Energy the queen uses a second: an unfed queen dies in an hour. */
export const QUEEN_DRAIN = 1 / 3600;
/** How strongly a queen who can't lay for want of food begs, at most. */
export const QUEEN_BEG = 0.8;
/** Seconds a queen goes without laying for want of food before she begs (rising to QUEEN_BEG over as many again). */
export const QUEEN_WAIT = 20;

/** The share of what an ant felt that it passes on to the ants it touches. */
export const PASS = 0.9;
/** Seconds for an ant's felt need to rise to what it feels now. */
export const NEED_RISE = 2;
/** Seconds for it to fade once nothing round it begs: an ant carries it a while as it walks. */
export const NEED_FADE = 60;
/** The felt need at which an old ant (age band 2) is as likely as not to carry food inside or take in brood. */
export const THETA_OLD = 0.3;

/** How strongly a larva with this energy begs: 0 above BEG_BELOW, rising to 1 as it empties. */
export function begOf(energy: number): number {
  return energy >= BEG_BELOW ? 0 : Math.min(1, (BEG_BELOW - energy) / BEG_BELOW);
}

/** The chance a stimulus `s` gets a response from an ant with threshold `theta` (Bonabeau et al. 1996): s² / (s² + θ²). */
export function respond(s: number, theta: number): number {
  if (theta <= 0) return 1;
  const s2 = s * s;
  return s2 / (s2 + theta * theta);
}

/** An ant's felt need after dt, moving toward what it feels now (`felt`): quickly up, slowly down. */
export function feel(need: number, felt: number, dt: number): number {
  const tau = felt > need ? NEED_RISE : NEED_FADE;
  return need + (felt - need) * (1 - Math.exp(-dt / tau));
}

/**
 * What can be felt by touch on each cell this tick: the strongest beg or passed-on need there. A chunked layer that
 * remembers the cells it touched, so a reset clears only those (like battle.ts CountGrid). Rebuilt every tick, so it
 * holds no state between ticks (it is not saved).
 */
export class FeltGrid {
  readonly layer = new ChunkLayer((n) => new Float32Array(n), 0);
  #touched: number[] = [];

  reset(): void {
    const t = this.#touched;
    for (let k = 0; k < t.length; k += 2) this.layer.set(t[k], t[k + 1], 0);
    t.length = 0;
  }

  /** `v` felt on cell (x, y): kept if it is the strongest there. */
  put(x: number, y: number, v: number): void {
    if (v <= 0 || y < 0) return; // a column may be negative (one world's curtain starts at the line's sMin); a row never is
    const old = this.layer.get(x, y);
    if (old === 0) this.#touched.push(x, y);
    if (v > old) this.layer.set(x, y, v);
  }

  get(x: number, y: number): number {
    return y < 0 ? 0 : this.layer.get(x, y);
  }

  /** The strongest felt within `r` cells of (x, y) (one: its own cell and its six neighbours). */
  near(x: number, y: number, r = 1): number {
    const o = discOffsets(r)[y & 1] as Int16Array;
    let m = 0;
    for (let k = 0; k < o.length; k += 2) {
      const v = this.get(x + (o[k]), y + (o[k + 1]));
      if (v > m) m = v;
    }
    return m;
  }
}

/** A well-fed ant shares food by mouth (trophallaxis) above this energy, with a hungry nestmate (below EAT_BELOW) it touches. */
export const SHARE_ABOVE = 0.75;

/** How strongly a hungry adult begs (of its nestmates, by touch): 0 at ADULT_BEG_BELOW and above, 1 when empty. */
export function adultBegOf(energy: number): number {
  return energy >= ADULT_BEG_BELOW ? 0 : Math.min(1, (ADULT_BEG_BELOW - energy) / ADULT_BEG_BELOW);
}

/**
 * The best-fed ant on each cell this tick (index + 1, 0: none), for food shared by mouth: a hungry ant takes from the
 * best-fed within one cell. Rebuilt every tick like FeltGrid.
 */
export class DonorGrid {
  readonly layer = new ChunkLayer((n) => new Float32Array(n), 0); // index + 1: exact well past any colony's size
  #touched: number[] = [];

  reset(): void {
    const t = this.#touched;
    for (let k = 0; k < t.length; k += 2) this.layer.set(t[k], t[k + 1], 0);
    t.length = 0;
  }

  /** Ant i (energy[i]) on cell (x, y): kept if it is the best-fed there. */
  put(x: number, y: number, i: number, energy: ArrayLike<number>): void {
    if (y < 0) return; // a column may be negative (one world's curtain); a row never is
    const old = this.layer.get(x, y);
    if (old === 0) this.#touched.push(x, y);
    if (old === 0 || (energy[i]) > (energy[old - 1])) this.layer.set(x, y, i + 1);
  }

  /** The best-fed ant within one cell of (x, y), or −1. */
  near(x: number, y: number, energy: ArrayLike<number>): number {
    const o = discOffsets(1)[y & 1] as Int16Array;
    let best = -1;
    for (let k = 0; k < o.length; k += 2) {
      const ax = x + (o[k]);
      const ay = y + (o[k + 1]);
      if (ay < 0) continue;
      const v = this.layer.get(ax, ay) - 1;
      if (v >= 0 && (best < 0 || (energy[v]) > (energy[best]))) best = v;
    }
    return best;
  }
}

/** The felt need at which a young or middle-aged ant goes to where food is kept (an old one's is THETA_OLD). */
export const NEED_FETCH = 0.1;
