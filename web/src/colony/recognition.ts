import { decode, encode } from "./save.ts";
import { BLOCK_BITS, ChunkLayer } from "./chunks.ts";
import { TOLERANCE } from "./vocab.ts";
import type { Colony, Layer } from "./colony.ts";
import { CELL, cellOf, discOffsets } from "./hex.ts";
import { clampCol, clampRow, hash01, inBounds, type Bounds } from "./world.ts";

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
// gestalt undoes them at home (PRD §17).
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

/** The largest fungal share of a host's odour: at most MAX_MASK × 0.5 = 0.3 from its nest's with one axis, under any tolerance ≥ 0.3 (more axes: hostCap). */
export const MAX_MASK = 0.6;

/**
 * The farthest the fungus may move a host's odour from its nest's, Euclidean in the odour space (S2 of docs/odour-space.md, PRD §91): a host is never a
 * stranger to its own nest. With one axis it is MAX_MASK × 0.5 = 0.3 (a corner nest at full share), which never binds; with K axes a corner nest sits
 * sqrt(K) × 0.5 from the fungal point, so the share of the way would reach 0.30 × sqrt(K) and break the invariant (worst 0.70 at K = 4, O2 in PRD §91). The
 * cap is the tolerance less the most the bands add on top, half a band's diagonal on every axis, sqrt(K) / (2 BINS): 0.25 at K = 4.
 */
export function hostCap(K: number): number {
  return TOLERANCE - Math.sqrt(K) / (2 * BINS);
}

export function binOf(odour: number): number {
  // A NaN odour is band 0 (Math.min/max of NaN is NaN, which would index nothing and key a map by NaN).
  return odour !== odour ? 0 : Math.min(BINS - 1, Math.max(0, Math.floor(odour * BINS)));
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

/**
 * The salt of a wild site's odour on axis k (Game.wakeSite, wildOdour): axis 0 keeps 101, the one it always had; the others a block of their own (201 up),
 * which no other hash in the colony uses. Axis 1 used 102 before S2, which is wakeSite's rng stream (`hash4(seed, 102, rx, ry)`).
 */
export const odourSalt = (axis: number): number => (axis === 0 ? 101 : 200 + axis);

/** The most axes an odour may have: a band's key (sum of band × BINS^axis) must stay an exact integer in a double. */
export const MAX_AXES = 8;

/**
 * The distance between two odours, ant i's vector at `a[ia..ia+K)` and the other's at `b[ib..ib+K)`: the Euclidean distance, sqrt(sum w_k (a_k − b_k)^2)
 * (docs/odour-space.md, "The mechanic": symmetric, a weight per axis, default 1). With one axis and no weights (the game today) it is |a − b|, with no
 * square root, so every comparison a scalar odour made comes out in the same bits. A stranger is further than tolerance + STRANGER_EPS.
 */
export function odourDistance(
  K: number,
  a: ArrayLike<number>,
  ia: number,
  b: ArrayLike<number>,
  ib: number,
  w: ArrayLike<number> | null = null,
): number {
  if (K === 1 && w === null) return Math.abs(a[ia] - b[ib]);
  let s = 0;
  for (let k = 0; k < K; k++) {
    const d = a[ia + k] - b[ib + k];
    s += (w === null ? 1 : w[k]) * d * d;
  }
  return Math.sqrt(s);
}

/** The band an odour is in, as one number: sum of binOf(axis k) × BINS^k. One axis: binOf itself. */
export function bandKey(odour: ArrayLike<number>, at: number, K: number): number {
  if (K === 1) return binOf(odour[at]);
  let key = 0;
  let m = 1;
  for (let k = 0; k < K; k++) {
    key += binOf(odour[at + k]) * m;
    m *= BINS;
  }
  return key;
}

/** The distance from the centre of band `key` to the odour at b[ib..]: what a band of ants is to a perceiver (odourDistance of the centre vector). */
export function keyDistance(key: number, K: number, b: ArrayLike<number>, ib: number, w: ArrayLike<number> | null = null): number {
  if (K === 1 && w === null) return Math.abs(binCentre(key) - b[ib]);
  let s = 0;
  let r = key;
  for (let k = 0; k < K; k++) {
    const digit = r % BINS;
    r = (r - digit) / BINS;
    const d = binCentre(digit) - b[ib + k];
    s += (w === null ? 1 : w[k]) * d * d;
  }
  return Math.sqrt(s);
}

/** The distance from the centre of the band of the odour at a[ia..] to the odour at b[ib..] (an ant's own band against an ant's own odour, as the band grids see it). */
export function bandDistance(
  a: ArrayLike<number>,
  ia: number,
  b: ArrayLike<number>,
  ib: number,
  K: number,
  w: ArrayLike<number> | null = null,
): number {
  if (K === 1 && w === null) return Math.abs(binCentre(binOf(a[ia])) - b[ib]);
  let s = 0;
  for (let k = 0; k < K; k++) {
    const d = binCentre(binOf(a[ia + k])) - b[ib + k];
    s += (w === null ? 1 : w[k]) * d * d;
  }
  return Math.sqrt(s);
}

/** A colony's odour as K axes: a number is every axis (the diagonal), a list is one per axis (its length is K). */
export function odourVector(spec: number | readonly number[], K: number): Float64Array {
  const v = new Float64Array(K);
  if (typeof spec === "number") v.fill(spec);
  else {
    if (spec.length !== K) throw new Error(`odour: ${spec.length} axes given, the game has ${K}`);
    for (let k = 0; k < K; k++) v[k] = spec[k] as number;
  }
  return v;
}

/** A float per cell, summed, over a map of any size: touched cells only are cleared, 8×8 block sums rule out empty neighbourhoods. */
export class SumGrid {
  readonly layer = new ChunkLayer((n) => new Float32Array(n), 0);
  readonly #blocks = new ChunkLayer((n) => new Float32Array(n), 0);
  #touched: number[] = [];

  /** whether anything has been added since the last reset */
  get used(): boolean {
    return this.#touched.length > 0;
  }

  reset(): void {
    const t = this.#touched;
    for (let k = 0; k < t.length; k += 2) {
      const x = t[k];
      const y = t[k + 1];
      this.layer.set(x, y, 0);
      this.#blocks.set(x >> BLOCK_BITS, y >> BLOCK_BITS, 0);
    }
    t.length = 0;
  }

  /** Free the chunks holding nothing (a game on an endless plane calls this a second: the grid zeroes cells and leaves their chunks, so it grows with the ground it has been over). */
  trim(): void {
    this.layer.dropEmpty();
    this.#blocks.dropEmpty();
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
    for (let by = y0 >> BLOCK_BITS; by <= y1 >> BLOCK_BITS; by++)
      for (let bx = x0 >> BLOCK_BITS; bx <= x1 >> BLOCK_BITS; bx++) if (this.#blocks.get(bx, by) > 0) return true;
    return false;
  }

  /** The sums for a save (Recognition.saveBands): each touched cell in order, as x, y, sum (a float32, exact in JSON). */
  saveState(): number[] {
    const t = this.#touched;
    const out: number[] = [];
    for (let k = 0; k < t.length; k += 2) out.push(t[k], t[k + 1], this.layer.get(t[k], t[k + 1]));
    return out;
  }

  /**
   * A saved state back (saveState): reset, then each cell, and its block's sum added up again. Every value added is
   * positive and a block is only ever tested above 0, so a sum in another order reads the same.
   */
  loadState(saved: readonly number[]): void {
    this.reset();
    for (let k = 0; k < saved.length; k += 3) {
      const x = saved[k];
      const y = saved[k + 1];
      const v = saved[k + 2];
      this.#touched.push(x, y);
      this.layer.set(x, y, v);
      const bx = x >> BLOCK_BITS;
      const by = y >> BLOCK_BITS;
      this.#blocks.set(bx, by, this.#blocks.get(bx, by) + v);
    }
  }
}

export interface RecognitionParams {
  /** odours further apart than this are strangers: what fights are judged by (a host's own perceived tolerance may be wider) */
  tolerance: number;
  /** the nest's odour relaxes toward the mean odour of the ants at it at this rate per second */
  nestDrift: number;
  /** seconds between odour steps (Game.tick) */
  interval: number;
  /** how many numbers an odour is, game-wide (the game's default is 4, S2 of docs/odour-space.md, PRD §91; 1 is the scalar odour of every game before it, kept for the tests that pin it); at most MAX_AXES */
  odourAxes: number;
}

export const DEFAULT_RECOGNITION: RecognitionParams = { tolerance: TOLERANCE, nestDrift: 0.03, interval: 0.1, odourAxes: 4 };

/** Seconds for a daughter colony's odour to drift most of the way from her mother's (ja-lo8.9.1, Colony.odourAim). */
export const ODOUR_DRIFT = 500;

/**
 * Where a daughter's odour drifts to from her mother's (ja-lo8.9.1): 1.5 tolerances away, toward the middle of the odour
 * range, so the two smell like strangers within a sitting unless the fungus's odour levers hold them together. Split
 * colonies of Aphaenogaster senilis differed in body odour within 5 days and could not be reunited by day 20
 * (bioRxiv 614719); how far and how fast here are the game's own (design).
 */
export function driftAim(mother: number, tolerance: number): number {
  const d = 1.5 * tolerance;
  return mother <= 0.5 ? Math.min(1, mother + d) : Math.max(0, mother - d);
}

/**
 * The direction a daughter's odour drifts in: a unit vector of K axes from a hash of the world's seed and the site she lands at (pure: the same on every
 * load and in every game, never the game's stream; S2 of docs/odour-space.md). Each axis a normal draw (Box-Muller over two hashes), so the direction is
 * uniform on the sphere; salts 301 and up are this hash's alone.
 */
export function driftDirection(seed: number, x: number, y: number, K: number): Float64Array {
  const u = new Float64Array(K);
  const sx = Math.floor(x);
  const sy = Math.floor(y);
  let len = 0;
  for (let k = 0; k < K; k++) {
    const a = 1 - hash01(seed, 301 + 2 * k, sx, sy); // (0, 1]
    const b = hash01(seed, 302 + 2 * k, sx, sy);
    u[k] = Math.sqrt(-2 * Math.log(a)) * Math.cos(2 * Math.PI * b);
    len += (u[k] as number) ** 2;
  }
  len = Math.sqrt(len);
  if (len === 0) u[0] = 1;
  else for (let k = 0; k < K; k++) u[k] = (u[k] as number) / len;
  return u;
}

/**
 * driftAim as a vector: where a daughter's odour vector drifts to from her mother's. One axis is driftAim (toward the middle). With more axes the aim sits
 * 1.5 tolerances from the mother in `direction` (driftDirection: fixed by the seed and the site); a component that would leave the cube is turned about
 * the mother (so the distance holds), and past that clamped to it.
 */
export function driftAimVec(mother: ArrayLike<number>, tolerance: number, direction: ArrayLike<number> | null = null): Float64Array {
  const K = mother.length;
  const aim = new Float64Array(K);
  if (K === 1 || direction === null) {
    for (let k = 0; k < K; k++) aim[k] = driftAim(mother[k] as number, tolerance);
    return aim;
  }
  const d = 1.5 * tolerance;
  for (let k = 0; k < K; k++) {
    const m = mother[k] as number;
    let v = m + d * (direction[k] as number);
    if (v < 0 || v > 1) v = m - d * (direction[k] as number);
    aim[k] = Math.min(1, Math.max(0, v));
  }
  return aim;
}

/**
 * Every colony's ants, by odour band, each counted as (1 − calm) of an enemy. `look(odour, at, tolerance)`
 * picks the bands that are strangers to the odour at odour[at..]; get / any / strangers then count only those. It
 * implements Colony's CellCounts (with `look`), so an ant's own view of who is a stranger is its own.
 *
 * A band is a cell of the odour space, BINS a side: its key is the sum of band × BINS^axis, and a band holds a SumGrid only once an
 * ant has landed in it (a map, pooled between builds), so K axes cost the bands occupied, not BINS^K. The bands that are strangers and
 * hold someone are kept as a list of grids in ascending key order, the order the one axis's bit loop summed them in: so one axis
 * sums the same floats in the same order as the 32-bit mask it replaced.
 */
export class Recognition {
  params: RecognitionParams;
  /** the grids of the bands, by key: created on first use, kept between builds (reset, not dropped), freed by trim */
  readonly bins = new Map<number, SumGrid>();
  /** every ant by odour band, each counted once whatever its calm: built only while some ant is calmed (else `bins` are the same) */
  readonly #everyone = new Map<number, SumGrid>();
  /** whether `#everyone` holds this build's ants (some ant was calmed); otherwise read `bins` for it */
  #calmed = false;
  /** the bands that hold someone, ascending by key (most games use two: a look skips the rest): the keys, and their grids alongside */
  #occupied: number[] = [];
  #occupiedGrids: SumGrid[] = [];
  /** the occupied bands' centres, K numbers a band (read by a look beyond one axis, so it need not take a key apart) */
  #centres: Float64Array = new Float64Array(0);
  /** the same, counting every ant (calmed or not) */
  #occupiedEveryone: number[] = [];
  #occupiedEveryoneGrids: SumGrid[] = [];
  #centresEveryone: Float64Array = new Float64Array(0);
  /** the grids of the bands that are strangers to the odour last looked at and hold someone, ascending by key (refilled in place by each look) */
  readonly #mask: SumGrid[] = [];
  /** the same over `#everyone`'s bands, made only while some ant is calmed (else `#mask` is read) */
  readonly #maskEveryone: SumGrid[] = [];
  /** how many of each hold the current look's grids (the arrays only grow: a shorter look does not free them) */
  #maskN = 0;
  #maskEveryoneN = 0;
  /** whether `#mask` stands for both (nobody is calmed) */
  #sameMask = true;
  /** the odour and tolerance the mask was made for: consecutive ants mostly share them */
  #lookOdour: Float64Array;
  #lookTolerance = NaN;
  #clock = 0;
  /** whether the last odour step found anything to move: false means the gestalt is at rest */
  #moving = true;

  /** Free the chunks of every band's grids that hold nothing (see SumGrid.trim), and the grids of the bands nobody is in. */
  trim(): void {
    for (const m of [this.bins, this.#everyone])
      for (const [key, g] of m) {
        g.trim();
        if (!g.used) m.delete(key);
      }
  }

  constructor(params: Partial<RecognitionParams> = {}) {
    this.params = { ...DEFAULT_RECOGNITION, ...params };
    checkAxes(this.params.odourAxes);
    this.#lookOdour = new Float64Array(this.params.odourAxes);
  }

  /** Rebuild the bands from every living ant, or (one world, ja-lp4.3) every living ant on layer `layer`, on its map. */
  build(colonies: readonly Colony[], layer = -1): void {
    for (const g of this.bins.values()) g.reset();
    if (this.#calmed) for (const g of this.#everyone.values()) g.reset();
    let calmed = false;
    for (const c of colonies) {
      for (let i = 0; i < c.n && !calmed; i++) if (c.alive[i] && (layer < 0 || c.layer[i] === layer) && c.calm[i] > 0) calmed = true;
      if (calmed) break;
    }
    this.#calmed = calmed;
    const K = this.params.odourAxes;
    const occupied: number[] = [];
    const everyone: number[] = [];
    for (const c of colonies) {
      if (c.odourAxes !== K) throw new Error(`recognition: a colony with ${c.odourAxes} odour axes in a game of ${K}`);
      const on = layer < 0 ? null : c.layers[layer];
      if (layer >= 0 && !on) continue; // a curtain of another line
      const map = (on ?? c).map;
      let lastKey = -1;
      let lastGrid: SumGrid | null = null;
      for (let i = 0; i < c.n; i++) {
        if (!c.alive[i] || (layer >= 0 && c.layer[i] !== layer)) continue;
        c.antCell(i);
        const cx = clampCol(map, CELL[0]);
        const cy = clampRow(map, CELL[1]);
        const key = bandKey(c.odour, i * K, K);
        if (calmed) {
          const e = gridOf(this.#everyone, key);
          if (!e.used) everyone.push(key);
          e.add(cx, cy, 1);
        }
        const weight = 1 - c.calm[i];
        if (weight <= 0) continue;
        // Consecutive ants mostly share their band: the last one's grid, without asking the map.
        const g: SumGrid = key === lastKey && lastGrid ? lastGrid : gridOf(this.bins, key);
        lastKey = key;
        lastGrid = g;
        if (!g.used) occupied.push(key);
        g.add(cx, cy, weight);
      }
    }
    this.#setOccupied(occupied, calmed ? everyone : null);
  }

  /** From now on, count the bands that are strangers to the odour at odour[at..] (K numbers) at `tolerance`. */
  look(odour: ArrayLike<number>, at: number, tolerance: number): void {
    const K = this.params.odourAxes;
    const last = this.#lookOdour;
    if (tolerance === this.#lookTolerance) {
      let same = true;
      for (let k = 0; k < K; k++)
        if (odour[at + k] !== last[k]) {
          same = false;
          break;
        }
      if (same) return;
    }
    this.#maskN = strangers(this.#mask, this.#occupied, this.#occupiedGrids, this.#centres, K, odour, at, tolerance);
    this.#sameMask = !this.#calmed;
    if (this.#calmed)
      this.#maskEveryoneN = strangers(
        this.#maskEveryone,
        this.#occupiedEveryone,
        this.#occupiedEveryoneGrids,
        this.#centresEveryone,
        K,
        odour,
        at,
        tolerance,
      );
    for (let k = 0; k < K; k++) last[k] = odour[at + k];
    this.#lookTolerance = tolerance;
  }

  /** Strangers (weighted) in cell (x, y), to the odour last looked at. */
  get(x: number, y: number): number {
    let s = 0;
    const m = this.#mask;
    for (let b = 0, n = this.#maskN; b < n; b++) s += (m[b] as SumGrid).get(x, y);
    return s;
  }

  any(x0: number, y0: number, x1: number, y1: number): boolean {
    const m = this.#mask;
    for (let b = 0, n = this.#maskN; b < n; b++) if ((m[b] as SumGrid).any(x0, y0, x1, y1)) return true;
    return false;
  }

  /**
   * Strangers in the cells within `r` steps of (cx, cy) (r = 1: the cell and its six neighbours), clipped to `map`, to the odour last looked at: weighted by
   * (1 − calm), as a fight counts them, or with `byOdour` each counted once, calmed or not (who smells
   * different, which calming does not change: what the fungus senses as contact).
   */
  around(cx: number, cy: number, map: Bounds, r = 1, byOdour = false): number {
    const every = byOdour && !this.#sameMask;
    const m = every ? this.#maskEveryone : this.#mask;
    const n = every ? this.#maskEveryoneN : this.#maskN;
    let s = 0;
    for (let b = 0; b < n; b++) {
      const g = m[b] as SumGrid;
      if (!g.any(cx - r - 1, cy - r, cx + r + 1, cy + r)) continue;
      const o = discOffsets(r)[cy & 1] as Int16Array;
      for (let k = 0; k < o.length; k += 2) {
        const x = cx + o[k];
        const y = cy + o[k + 1];
        if (inBounds(map, x, y)) s += g.get(x, y);
      }
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
        if (c.alive[i] && (c.mask[i] > 0 || c.estrange[i] > 0)) {
          masked = true;
          break;
        }
      if (masked) break;
    }
    const drifting = colonies.some((c) => aimOpen(c));
    if (!masked && !this.#moving && !drifting) return;
    const drift = 1 - Math.exp(-this.params.nestDrift * dt);
    const K = this.params.odourAxes;
    const sum = new Float64Array(K);
    const unit = new Float64Array(K);
    let moving = false;
    // Nests first, from the odours before the step: each drifts toward the mean of the ants at it, axis by axis.
    for (const c of colonies) {
      // The nest is on the home layer (one world: the curtain), and so are the ants at it.
      const home = c.layers[c.home] as Layer;
      const { nest } = home;
      const r2 = nest.r * nest.r;
      let at = 0;
      sum.fill(0);
      // In the side view with a queen, the ants in the colony's royal chambers (nest slice 8: the founding disc, r 3,
      // held few of them once the royal chamber had widened); else the ants within the nest's disc.
      const ch = c.housed ? home.map.chambers : null;
      for (let i = 0; i < c.n; i++) {
        if (!c.alive[i] || c.layer[i] !== c.home) continue;
        if (ch) {
          cellOf(c.x[i], c.y[i]);
          const k = ch.at(CELL[0], CELL[1]);
          const room = k >= 0 ? ch.list[k] : undefined;
          if (!room || room.role !== "royal" || room.colony !== c.params.nest) continue;
        } else {
          const dx = c.x[i] - nest.x;
          const dy = c.y[i] - nest.y;
          if (dx * dx + dy * dy >= r2) continue;
        }
        at++;
        for (let k = 0; k < K; k++) sum[k] += c.odour[i * K + k];
      }
      if (at > 0) {
        for (let k = 0; k < K; k++) {
          const d = (sum[k] / at - c.nestVec[k]) * drift;
          if (Math.abs(d) > 1e-9) moving = true;
          c.nestVec[k] = Math.min(1, Math.max(0, c.nestVec[k] + d));
        }
      }
    }
    // A daughter's nest drifts away from her mother's odour (ja-lo8.9.1), toward its own aim.
    if (drifting) {
      const k = 1 - Math.exp(-dt / ODOUR_DRIFT);
      for (const c of colonies)
        if (aimOpen(c)) {
          for (let a = 0; a < K; a++) c.nestVec[a] += (c.aimVec[a] - c.nestVec[a]) * k;
          moving = true;
        }
    }
    // Then every ant: its nest's odour, with its fungal share of the fungus's own.
    for (const c of colonies) {
      const nest = c.nestVec;
      // The line from the nest to the fungal point, once for the colony: its length and the unit direction along it.
      let dist = 0;
      for (let a = 0; a < K; a++) dist += (FUNGAL - nest[a]) ** 2;
      dist = Math.sqrt(dist);
      // One axis: the cap (0.3) never binds and the direction is the sign, today's arithmetic bit for bit.
      const cap = K > 1 ? hostCap(K) : Infinity;
      for (let a = 0; a < K; a++) unit[a] = dist > 0 ? (FUNGAL - nest[a]) / dist : 0;
      for (let i = 0; i < c.n; i++) {
        if (!c.alive[i]) continue;
        const f = Math.min(MAX_MASK, c.mask[i]);
        // The fungus draws a host toward its own odour by a share of the way, its displacement from the nest at most hostCap in the space.
        const shift = f * dist > cap ? cap / dist : f;
        // The odour weapon (cull) pushes 0.5 × estrange away from the nest's odour: along the line through the fungal point and on past it.
        const push = c.estrange[i] * 0.5;
        for (let a = 0; a < K; a++) {
          const n0 = nest[a];
          const o = Math.min(1, Math.max(0, n0 + shift * (FUNGAL - n0) + push * unit[a]));
          if (Math.abs(o - c.odour[i * K + a]) > 1e-7) moving = true;
          c.odour[i * K + a] = o;
        }
      }
    }
    this.#moving = moving || masked;
  }

  /** What carries over between ticks, for a save (save.ts): its settings and clock. The bands are built afresh every tick. */
  saveState(): Record<string, unknown> {
    return { params: encode(this.params), clock: this.#clock, moving: this.#moving };
  }

  loadState(r: Record<string, unknown>): void {
    const params = decode(r.params) as RecognitionParams;
    if (params.odourAxes !== this.params.odourAxes)
      throw new Error(`save: recognition of ${params.odourAxes} odour axes, this game has ${this.params.odourAxes}`);
    this.params = params;
    this.#clock = r.clock as number;
    this.#moving = r.moving as boolean;
    this.#lookTolerance = NaN; // the look cache is made afresh
  }

  /**
   * The bands as last built (build), for a save (Game.save, U4b): the game builds them before fights and the next tick's
   * steps read them, ants killed since included, so a load must not build them again from the living. `#everyone` only
   * while some ant was calmed: otherwise it is empty. Each occupied band's key and cells, in ascending key order. In today's games the saved `#everyone` can't change play (only
   * Fungus.#touch reads it, after the same tick's build): it is saved for completeness, and no test reaches it (#63's review, N3).
   */
  saveBands(): BandsSave {
    const of = (grids: Map<number, SumGrid>, keys: readonly number[]): [number, number[]][] =>
      keys.map((key) => [key, (grids.get(key) as SumGrid).saveState()]);
    return {
      bins: of(this.bins, this.#occupied),
      everyone: this.#calmed ? of(this.#everyone, this.#occupiedEveryone) : null,
    };
  }

  loadBands(b: BandsSave): void {
    const put = (grids: Map<number, SumGrid>, saved: BandsSave["bins"]): number[] => {
      for (const g of grids.values()) g.reset();
      const keys: number[] = [];
      for (const [key, state] of saved) {
        gridOf(grids, key).loadState(state);
        keys.push(key);
      }
      return keys.sort(ascending);
    };
    const occupied = put(this.bins, b.bins);
    this.#calmed = b.everyone !== null;
    if (b.everyone) this.#setOccupied(occupied, put(this.#everyone, b.everyone));
    else {
      for (const g of this.#everyone.values()) g.reset();
      this.#setOccupied(occupied, null);
    }
  }

  /** The occupied bands (keys, in any order) are now these: sorted ascending, each with its grid; `everyone`: the calmed count's, or null (the same bands). */
  #setOccupied(occupied: number[], everyone: number[] | null): void {
    occupied.sort(ascending);
    this.#occupied = occupied;
    this.#occupiedGrids = occupied.map((key) => this.bins.get(key) as SumGrid);
    const K = this.params.odourAxes;
    this.#centres = K > 1 ? centresOf(occupied, K) : this.#centres;
    if (everyone) {
      everyone.sort(ascending);
      this.#occupiedEveryone = everyone;
      this.#occupiedEveryoneGrids = everyone.map((key) => this.#everyone.get(key) as SumGrid);
      this.#centresEveryone = K > 1 ? centresOf(everyone, K) : this.#centresEveryone;
    } else {
      this.#occupiedEveryone = occupied;
      this.#occupiedEveryoneGrids = this.#occupiedGrids;
      this.#centresEveryone = this.#centres;
    }
    this.#lookTolerance = NaN; // the bands changed: the next look rebuilds its mask
  }
}

const ascending = (a: number, b: number): number => a - b;

/** The centre vectors of bands `keys`, K numbers apiece. */
function centresOf(keys: readonly number[], K: number): Float64Array {
  const out = new Float64Array(keys.length * K);
  keys.forEach((key, b) => {
    let r = key;
    for (let k = 0; k < K; k++) {
      const digit = r % BINS;
      r = (r - digit) / BINS;
      out[b * K + k] = binCentre(digit);
    }
  });
  return out;
}

/** The first n of `out` become the grids of the occupied bands (ascending keys, `grids` alongside) that are strangers to the odour at odour[at..]; returns n. */
function strangers(
  out: SumGrid[],
  keys: readonly number[],
  grids: readonly SumGrid[],
  centres: Float64Array,
  K: number,
  odour: ArrayLike<number>,
  at: number,
  tolerance: number,
): number {
  const far = tolerance + STRANGER_EPS;
  let n = 0;
  if (K === 1) {
    // One axis (every game so far): the band's centre against the odour, as the scalar code judged it.
    const o = odour[at] as number;
    for (let b = 0; b < keys.length; b++) if (Math.abs(binCentre(keys[b] as number) - o) > far) out[n++] = grids[b] as SumGrid;
  } else for (let b = 0; b < keys.length; b++) if (odourDistance(K, centres, b * K, odour, at) > far) out[n++] = grids[b] as SumGrid;
  return n;
}

/** The grid of band `key` in `grids`, made when there is none. */
function gridOf(grids: Map<number, SumGrid>, key: number): SumGrid {
  let g = grids.get(key);
  if (!g) grids.set(key, (g = new SumGrid()));
  return g;
}

/** Whether colony c's nest odour is still drifting toward its aim (a daughter's, driftAim): some axis more than 1e-6 off, an aim being set (NaN is no aim). */
function aimOpen(c: Colony): boolean {
  for (let k = 0; k < c.odourAxes; k++) if (Math.abs(c.aimVec[k] - c.nestVec[k]) > 1e-6) return true;
  return false;
}

function checkAxes(K: number): void {
  if (!Number.isInteger(K) || K < 1 || K > MAX_AXES) throw new Error(`recognition: ${K} odour axes (1 to ${MAX_AXES})`);
}

/** A Recognition's bands in a save (saveBands): each occupied band's key and cells (SumGrid.saveState), ascending by key; the calmed count's when built. */
export interface BandsSave {
  bins: [number, number[]][];
  everyone: [number, number[]][] | null;
}
