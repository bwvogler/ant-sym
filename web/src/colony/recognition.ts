import { ChunkLayer } from "./chunks.ts";
import type { Colony } from "./colony.ts";

// Recognition, pure (ja-t4d.3, docs/fungus-policy.md §4.B). Who is an enemy
// is no longer "an ant of another colony" but "an ant whose odour differs
// from mine by more than a tolerance": colony odour is a blend of cuticular
// hydrocarbons, and when it stops differing, aggression stops (Argentine-ant
// supercolonies). Each ant carries an odour in 0..1 (the colonies start at 0
// and 1), all of it local:
//   - an ant smells of its colony: its nest's odour (the gestalt), which
//     drifts toward the mean odour of the ants at the nest;
//   - a host whose fungus runs `blend` also carries the fungus's own odour
//     (FUNGAL, between the colonies'), as a share of up to MAX_MASK: a
//     leafcutter's garden fungus feeds the colony's odour (Acromyrmex);
//   - so a colony full of hosts drifts toward the fungal odour, and two
//     colonies growing the same fungus come to smell alike. A host's share is
//     bounded so it never becomes a stranger to its own nest.
//   - (later) diet, and odour weapons.
// Contact blending (a host relaxing toward the ants it touches) was tried
// first and moved nothing: contacts with strangers are brief fights, and the
// gestalt undoes them at home (PRD §16).
// And the fungus can calm a host: a calming cue (Rickia's n-C23) lowers the
// aggression the host both receives and gives, so it counts as (1 − calm) of
// an enemy to others.
//
// With every ant at its colony's odour and nobody calm, the strangers around
// an ant are exactly the other colony's ants, and fights run as before.

/** Odour bands: an ant is counted in the band of its odour, and strangerhood is judged by band centre (within 1 / 2·BINS). */
export const BINS = 10;

/** The fungus's own odour: halfway between the colonies'. */
export const FUNGAL = 0.5;

/** The largest fungal share of a host's odour: at most MAX_MASK × 0.5 = 0.3 from its nest's, under any tolerance ≥ 0.3. */
export const MAX_MASK = 0.6;

export function binOf(odour: number): number {
  return Math.min(BINS - 1, Math.max(0, Math.floor(odour * BINS)));
}

export function binCentre(b: number): number {
  return (b + 0.5) / BINS;
}

/**
 * Strangers are further apart than tolerance + this. A host at full share sits exactly MAX_MASK × 0.5
 * from its nest, and band centres add up to 1 / 2·BINS more: 0.3 + 0.05 = 0.35, the tolerance itself.
 * Float32 odours and tolerances (and 1 − 0.65 in float64) land a hair either side of that, so without
 * this a host could be a stranger to its own nestmates.
 */
export const STRANGER_EPS = 1e-6;

const BLOCK_BITS = 3;

/** A float per cell, summed, over a map of any size: touched cells only are cleared, 8×8 block sums rule out empty neighbourhoods. */
export class SumGrid {
  readonly layer = new ChunkLayer((n) => new Float32Array(n), 0);
  readonly #blocks = new ChunkLayer((n) => new Float32Array(n), 0);
  #touched: number[] = [];

  reset(): void {
    const t = this.#touched;
    for (let k = 0; k < t.length; k += 2) {
      const x = t[k] as number;
      const y = t[k + 1] as number;
      this.layer.set(x, y, 0);
      this.#blocks.set(x >> BLOCK_BITS, y >> BLOCK_BITS, 0);
    }
    t.length = 0;
  }

  add(x: number, y: number, v: number): void {
    const was = this.layer.get(x, y);
    if (was === 0) this.#touched.push(x, y);
    this.layer.set(x, y, was + v);
    const bx = x >> BLOCK_BITS;
    const by = y >> BLOCK_BITS;
    this.#blocks.set(bx, by, this.#blocks.get(bx, by) + v);
  }

  get(x: number, y: number): number {
    return this.layer.get(x, y);
  }

  any(x0: number, y0: number, x1: number, y1: number): boolean {
    for (let by = y0 >> BLOCK_BITS; by <= y1 >> BLOCK_BITS; by++) for (let bx = x0 >> BLOCK_BITS; bx <= x1 >> BLOCK_BITS; bx++) if (this.#blocks.get(bx, by) > 0) return true;
    return false;
  }
}

export interface RecognitionParams {
  /** odours further apart than this are strangers: what fights are judged by (a host's own perceived tolerance may be wider) */
  tolerance: number;
  /** the nest's odour relaxes toward the mean odour of the ants at it at this rate per second */
  nestDrift: number;
  /** seconds between odour steps (Game.tick) */
  interval: number;
}

export const DEFAULT_RECOGNITION: RecognitionParams = { tolerance: 0.35, nestDrift: 0.03, interval: 0.1 };

/**
 * Every colony's ants, by odour band, each counted as (1 − calm) of an enemy. `look(odour, tolerance)`
 * picks the bands that are strangers to that odour; get / any / strangers then count only those. It
 * implements Colony's CellCounts (with `look`), so an ant's own view of who is a stranger is its own.
 */
export class Recognition {
  params: RecognitionParams;
  readonly bins: SumGrid[] = Array.from({ length: BINS }, () => new SumGrid());
  /** bit b set: band b is a stranger to the odour last looked at, and holds someone */
  #mask = 0;
  /** bit b set: band b holds someone, anywhere (most games use two bands: a check skips the rest) */
  #occupied = 0;
  /** the odour and tolerance the mask was made for: consecutive ants mostly share them */
  #lookOdour = NaN;
  #lookTolerance = NaN;
  #clock = 0;
  /** whether the last odour step found anything to move: false means the gestalt is at rest */
  #moving = true;

  constructor(params: Partial<RecognitionParams> = {}) {
    this.params = { ...DEFAULT_RECOGNITION, ...params };
  }

  /** Rebuild the bands from every living ant. */
  build(colonies: readonly Colony[]): void {
    for (const g of this.bins) g.reset();
    let occupied = 0;
    for (const c of colonies) {
      const { w, h } = c.map.size;
      for (let i = 0; i < c.n; i++) {
        if (!c.alive[i]) continue;
        const cx = Math.min(w - 1, Math.max(0, Math.floor(c.x[i] as number)));
        const cy = Math.min(h - 1, Math.max(0, Math.floor(c.y[i] as number)));
        const weight = 1 - (c.calm[i] as number);
        if (weight <= 0) continue;
        const b = binOf(c.odour[i] as number);
        (this.bins[b] as SumGrid).add(cx, cy, weight);
        occupied |= 1 << b;
      }
    }
    this.#occupied = occupied;
    this.#lookOdour = NaN; // the bands changed: the next look rebuilds its mask
  }

  /** From now on, count the bands that are strangers to `odour` at `tolerance`. */
  look(odour: number, tolerance: number): void {
    if (odour === this.#lookOdour && tolerance === this.#lookTolerance) return;
    let m = 0;
    for (let b = 0; b < BINS; b++) if (Math.abs(binCentre(b) - odour) > tolerance + STRANGER_EPS) m |= 1 << b;
    this.#mask = m & this.#occupied;
    this.#lookOdour = odour;
    this.#lookTolerance = tolerance;
  }

  /** Strangers (weighted) in cell (x, y), to the odour last looked at. */
  get(x: number, y: number): number {
    let s = 0;
    for (let b = 0, m = this.#mask; m; b++, m >>= 1) if (m & 1) s += (this.bins[b] as SumGrid).get(x, y);
    return s;
  }

  any(x0: number, y0: number, x1: number, y1: number): boolean {
    for (let b = 0, m = this.#mask; m; b++, m >>= 1) if (m & 1 && (this.bins[b] as SumGrid).any(x0, y0, x1, y1)) return true;
    return false;
  }

  /** Strangers (weighted) in the (2r+1)² cells around (cx, cy), clipped to w × h, to the odour last looked at. */
  around(cx: number, cy: number, w: number, h: number, r = 1): number {
    let s = 0;
    for (let b = 0, m = this.#mask; m; b++, m >>= 1) {
      if (!(m & 1)) continue;
      const g = this.bins[b] as SumGrid;
      if (!g.any(cx - r, cy - r, cx + r, cy + r)) continue;
      for (let y = Math.max(0, cy - r); y <= Math.min(h - 1, cy + r); y++) for (let x = Math.max(0, cx - r); x <= Math.min(w - 1, cx + r); x++) s += g.get(x, y);
    }
    return s;
  }

  /**
   * Let dt seconds pass for odours, stepping every `interval`: each ant's odour from its nest's and its
   * fungal share, and each nest's odour drifting toward the ants at it. Order-independent: every
   * nest's drift reads odours from before the step.
   */
  advance(colonies: readonly Colony[], dt: number): void {
    this.#clock += dt;
    if (this.#clock + 1e-9 < this.params.interval) return;
    const owed = this.#clock;
    this.#clock = 0;
    this.step(colonies, owed);
  }

  /** One odour step of dt seconds, now. Nothing to do while no ant carries a fungal share and every odour is its nest's. */
  step(colonies: readonly Colony[], dt: number): void {
    let masked = false;
    for (const c of colonies) {
      for (let i = 0; i < c.n; i++)
        if (c.alive[i] && (c.mask[i] as number) > 0) {
          masked = true;
          break;
        }
      if (masked) break;
    }
    if (!masked && !this.#moving) return;
    const drift = 1 - Math.exp(-this.params.nestDrift * dt);
    let moving = false;
    // Nests first, from the odours before the step: each drifts toward the mean of the ants at it.
    for (const c of colonies) {
      const { nest } = c;
      const r2 = nest.r * nest.r;
      let at = 0;
      let sum = 0;
      for (let i = 0; i < c.n; i++) {
        if (!c.alive[i]) continue;
        const dx = (c.x[i] as number) - nest.x;
        const dy = (c.y[i] as number) - nest.y;
        if (dx * dx + dy * dy >= r2) continue;
        at++;
        sum += c.odour[i] as number;
      }
      if (at > 0) {
        const d = (sum / at - c.nestOdour) * drift;
        if (Math.abs(d) > 1e-9) moving = true;
        c.nestOdour = Math.min(1, Math.max(0, c.nestOdour + d));
      }
    }
    // Then every ant: its nest's odour, with its fungal share of the fungus's own.
    for (const c of colonies) {
      const n0 = c.nestOdour;
      for (let i = 0; i < c.n; i++) {
        if (!c.alive[i]) continue;
        const f = Math.min(MAX_MASK, c.mask[i] as number);
        const o = n0 + f * (FUNGAL - n0);
        if (Math.abs(o - (c.odour[i] as number)) > 1e-7) moving = true;
        c.odour[i] = o;
      }
    }
    this.#moving = moving || masked;
  }
}
