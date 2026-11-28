import { combatObservers } from "./combatObservation.ts";
import { BLOCK_BITS, ChunkLayer } from "./chunks.ts";
import { type Colony, type Layer } from "./colony.ts";
import { ENEMY } from "./vocab.ts";
import { CELL, cellKey, centreX, centreY, discOffsets } from "./hex.ts";
import { bandDistance, bandKey, keyDistance, STRANGER_EPS, SumGrid, type Recognition } from "./recognition.ts";
import { blocked, clampCol, clampRow, inBounds, type Bounds } from "./world.ts";
import { touch } from "./sense.ts";

// Fights, pure. An ant with enemies in its own cell or the six around it is in a fight:
// it lays alarm in its own colony's field (so allies smell it and, by stance
// or doctrine, come or keep away) and may die. Its chance of dying in dt is
// Lanchester-like: rate × dt × enemies around ÷ allies around, so equal
// numbers trade and the bigger crowd wins. Deaths are decided for everyone
// before anyone is removed, so the order colonies are listed in is no edge.
//
// With a Recognition (the game always passes one), enemies are strangers by
// odour, judged at the healthy tolerance: an ant whose odour has drifted can
// be fought by its own colony, and two colonies that have come to smell
// alike stop fighting. A calming cue counts against both sides: a calm
// neighbour is (1 − calm) of an enemy, and a calm ant takes (1 − calm) of the
// hazard. Allies are still the ant's own colony around it.
// With p.intent enabled, only explicit attackers contribute pressure and their own
// perceived tolerance decides whom they attack; a peaceful victim has no immunity.

export interface FightParams {
  /** deaths per second for an ant facing as many enemies as allies */
  rate: number;
  /** Experimental directed aggression; absent/false preserves legacy fights. */
  intent?: boolean;
  /** Let local workers at even or favorable odds react to a nearby attack from the previous tick. */
  counterattack?: boolean;
  /** Reach of directed attacks measured in hex rings. */
  attackReach?: 0 | 1;
  /** Maximum center-to-center distance for a directed attack, in world units (up to one). */
  attackDistance?: number;
  /** alarm laid per second by an ant in a fight */
  alarm: number;
}

export const DEFAULT_FIGHT: FightParams = { rate: 1.5, alarm: 8 };

/**
 * Ants per cell over a map of any size: a chunked Uint16 layer that remembers which cells it
 * touched, so a reset clears only those (a few thousand ants), never the whole map.
 */
export class CountGrid {
  readonly layer = new ChunkLayer((n) => new Uint16Array(n), 0);
  /** the same counts summed over 8×8 blocks, so an empty neighbourhood is ruled out in a read or two */
  readonly #blocks = new ChunkLayer((n) => new Uint16Array(n), 0);
  #touched: number[] = [];

  /** Every count back to zero. */
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

  add(x: number, y: number, n = 1): void {
    const v = this.layer.get(x, y);
    if (v === 0) this.#touched.push(x, y);
    this.layer.set(x, y, v + n);
    const bx = x >> BLOCK_BITS;
    const by = y >> BLOCK_BITS;
    this.#blocks.set(bx, by, this.#blocks.get(bx, by) + n);
  }

  get(x: number, y: number): number {
    return this.layer.get(x, y);
  }

  any(x0: number, y0: number, x1: number, y1: number): boolean {
    for (let by = y0 >> BLOCK_BITS; by <= y1 >> BLOCK_BITS; by++)
      for (let bx = x0 >> BLOCK_BITS; bx <= x1 >> BLOCK_BITS; bx++) if (this.#blocks.get(bx, by)) return true;
    return false;
  }

  /**
   * The counts for a save (Game.save, U4b): each touched cell in order, as x, y, count. A game's grids are built before
   * fights and kept through the next tick's steps, so a load can't build them again from the ants (some died since).
   */
  saveState(): number[] {
    const t = this.#touched;
    const out: number[] = [];
    for (let k = 0; k < t.length; k += 2) out.push(t[k], t[k + 1], this.layer.get(t[k], t[k + 1]));
    return out;
  }

  /**
   * A saved state back (saveState): reset, then each cell and its block's sum as they were. The block sums are restored
   * for completeness only: `any` reads them, and only resolveFights without recognition calls it, which a Game never
   * does, so no test reaches them (#63's review, N3).
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

/** Ants per cell, one grid per colony: of the ants on layer `layer` (one world, ja-lp4.3), or every ant (−1: the colony's one map). */
export function occupancy(colony: Colony, out: CountGrid, layer = -1): CountGrid {
  out.reset();
  const on = layer < 0 ? null : colony.layers[layer];
  if (layer >= 0 && !on) return out; // a curtain of another line: this colony has no ants there
  const map = (on ?? colony).map;
  for (let i = 0; i < colony.n; i++) {
    if (!colony.alive[i] || (layer >= 0 && colony.layer[i] !== layer)) continue;
    colony.antCell(i);
    out.add(clampCol(map, CELL[0]), clampRow(map, CELL[1]));
  }
  return out;
}

/** Sum of a grid over the cells within `r` steps of (cx, cy) (r = 1: the cell and its six neighbours), clipped to the map. */
export function around(grid: CountGrid, map: Bounds, cx: number, cy: number, r = 1): number {
  let s = 0;
  const o = discOffsets(r)[cy & 1] as Int16Array;
  for (let k = 0; k < o.length; k += 2) {
    const x = cx + o[k];
    const y = cy + o[k + 1];
    if (inBounds(map, x, y)) s += grid.get(x, y);
  }
  return s;
}

// Reused across ticks and layers; only touched cells are cleared. Recognition uses
// target bands (the bands some living ant is in, by key: recognition.ts bandKey), never a list of ant pairs.
// Without recognition, target colonies (by index).
const pressureCache = new WeakMap<Colony, Map<number, SumGrid>>();
/** The most band grids the attack-pressure pool keeps beyond those in use (one axis never reaches it: BINS bands). */
export const PRESSURE_POOL = 64;
/** How many band grids colony c's attack-pressure pool holds (a test reads it: the pool is bounded). */
export const pressurePoolSize = (c: Colony): number => pressureCache.get(c)?.size ?? 0;
function attackPressure(colonies: Colony[], recognition: boolean, layer: number, reach: 0 | 1): Map<number, SumGrid> {
  if (!colonies.length) return new Map();
  let grids = pressureCache.get(colonies[0]);
  if (!grids) pressureCache.set(colonies[0], (grids = new Map()));
  for (const g of grids.values()) g.reset();
  // The bands a victim can be read in: those of the ants living on this layer (a band nobody is in is never read).
  const keys: number[] = [];
  if (recognition) {
    const seen = new Set<number>();
    for (const c of colonies) {
      const on = layer < 0 ? null : c.layers[layer];
      if (layer >= 0 && !on) continue;
      const K = c.odourAxes;
      for (let i = 0; i < c.n; i++) {
        if (!c.alive[i] || (layer >= 0 && c.layer[i] !== layer)) continue;
        const key = bandKey(c.odour, i * K, K);
        if (!seen.has(key)) {
          seen.add(key);
          keys.push(key);
        }
      }
    }
  } else for (let b = 0; b < colonies.length; b++) keys.push(b);
  // The pool keeps the grids of bands no ant is in now (a tick on another layer reads other bands), but not without bound: with
  // continuous odours at K axes the bands ants have passed through are many, so past PRESSURE_POOL it keeps only the bands in use.
  if (grids.size > PRESSURE_POOL) {
    const live = new Set(keys);
    for (const key of grids.keys()) if (!live.has(key)) grids.delete(key);
  }
  colonies.forEach((c, own) => {
    const on = layer < 0 ? null : c.layers[layer];
    if (layer >= 0 && !on) return; // a curtain of another line
    const map = (on ?? c).map;
    for (let i = 0; i < c.n; i++) {
      if (!c.alive[i] || c.attackLayer[i] < 0 || c.attackLayer[i] !== c.layer[i] || (layer >= 0 && c.layer[i] !== layer)) continue;
      const weight = recognition ? 1 - c.calm[i] : 1;
      if (weight <= 0 || blocked(map, c.x[i], c.y[i])) continue;
      c.antCell(i);
      const cx = CELL[0],
        cy = CELL[1];
      const offsets = discOffsets(reach)[cy & 1] as Int16Array;
      for (let k = 0; k < offsets.length; k += 2) {
        const x = cx + offsets[k],
          y = cy + offsets[k + 1];
        if (!inBounds(map, x, y)) continue;
        const tx = centreX(x, y),
          ty = centreY(y);
        // Sample the local path, including its endpoint: no hits into soil/rock.
        let clear = true;
        for (let step = 1; step <= 4; step++) {
          if (blocked(map, c.x[i] + ((tx - c.x[i]) * step) / 4, c.y[i] + ((ty - c.y[i]) * step) / 4)) {
            clear = false;
            break;
          }
        }
        if (!clear) continue;
        for (const b of keys) {
          const stranger = recognition
            ? keyDistance(b, c.odourAxes, c.odour, i * c.odourAxes, c.odourW) > c.tolerance[i] + STRANGER_EPS
            : b !== own;
          if (stranger) {
            let g = grids.get(b);
            if (!g) grids.set(b, (g = new SumGrid()));
            g.add(x, y, weight);
          }
        }
      }
    }
  });
  return grids;
}

type Attacker = { colony: Colony; side: number; ant: number };

function attackBuckets(colonies: Colony[], layer: number): Map<number, Attacker[]> {
  const buckets = new Map<number, Attacker[]>();
  colonies.forEach((colony, side) => {
    for (let ant = 0; ant < colony.n; ant++) {
      const current = colony.layer[ant];
      if (!colony.alive[ant] || colony.attackLayer[ant] < 0 || colony.attackLayer[ant] !== current || (layer >= 0 && layer !== current))
        continue;
      colony.antCell(ant);
      const key = cellKey(CELL[0], CELL[1]);
      const attacker = { colony, side, ant };
      const bucket = buckets.get(key);
      if (bucket) bucket.push(attacker);
      else buckets.set(key, [attacker]);
    }
  });
  return buckets;
}

function distancePressure(
  buckets: Map<number, Attacker[]>,
  victim: Colony,
  side: number,
  ant: number,
  cx: number,
  cy: number,
  map: Layer["map"],
  recognition: boolean,
  distance: number,
): number {
  const x = victim.x[ant];
  const y = victim.y[ant];
  if (!buckets.size || blocked(map, x, y)) return 0;
  const K = victim.odourAxes;
  let pressure = 0;
  // Two rings cover every pair within one world unit, even across cell corners.
  const offsets = discOffsets(2)[cy & 1] as Int16Array;
  for (let k = 0; k < offsets.length; k += 2) {
    const nx = cx + offsets[k],
      ny = cy + offsets[k + 1];
    if (!inBounds(map, nx, ny)) continue;
    const bucket = buckets.get(cellKey(nx, ny));
    if (!bucket) continue;
    for (const attacker of bucket) {
      const source = attacker.colony,
        i = attacker.ant;
      if (source.layer[i] !== victim.layer[ant] || (source === victim && i === ant)) continue;
      if (
        recognition
          ? bandDistance(victim.odour, ant * K, source.odour, i * K, K, source.odourW) <= source.tolerance[i] + STRANGER_EPS
          : side === attacker.side
      )
        continue;
      const sx = source.x[i],
        sy = source.y[i],
        dx = x - sx,
        dy = y - sy;
      if (dx * dx + dy * dy > distance * distance || blocked(map, sx, sy)) continue;
      if (blocked(map, sx + dx / 4, sy + dy / 4) || blocked(map, sx + dx / 2, sy + dy / 2) || blocked(map, x - dx / 4, y - dy / 4))
        continue;
      pressure += recognition ? 1 - source.calm[i] : 1;
    }
  }
  return pressure * (recognition ? 1 - victim.calm[ant] : 1);
}

/**
 * Resolve one dt of fighting between colonies; `grids[k]` is colony k's occupancy. With `rec` (built this
 * tick), enemies are strangers by odour; without it, every ant of another colony. With `layer` (one world, ja-lp4.3),
 * only the ants on that layer fight, on its map, and their alarm goes into their colony's scent there; the grids and
 * `rec` must be that layer's. Returns the deaths per colony.
 */
export function resolveFights(
  colonies: Colony[],
  grids: CountGrid[],
  dt: number,
  rng: () => number,
  p: FightParams = DEFAULT_FIGHT,
  rec: Recognition | null = null,
  layer = -1,
): number[] {
  const distance = p.attackDistance;
  const buckets = p.intent && distance !== undefined && distance > 0 && distance <= 1 ? attackBuckets(colonies, layer) : null;
  const pressure = p.intent && !buckets ? attackPressure(colonies, rec !== null, layer, p.attackReach ?? 1) : null;
  const deaths: number[][] = colonies.map(() => []);
  colonies.forEach((c, k) => {
    const observer = combatObservers.get(c);
    const on = layer < 0 ? null : c.layers[layer];
    if (layer >= 0 && !on) return; // a curtain of another line: none of this colony's ants are on it
    const map = (on ?? c).map;
    const ph = (on ?? c).ph;
    for (let i = 0; i < c.n; i++) {
      if (!c.alive[i] || (layer >= 0 && c.layer[i] !== layer)) continue;
      c.antCell(i);
      const cx = clampCol(map, CELL[0]);
      const cy = clampRow(map, CELL[1]);
      let enemies = 0;
      if (buckets && distance !== undefined) {
        enemies = distancePressure(buckets, c, k, i, cx, cy, map, rec !== null, distance);
        if (enemies < 1e-6) continue;
      } else if (pressure) {
        if (blocked(map, c.x[i], c.y[i])) continue;
        const K = c.odourAxes;
        const band = rec ? bandKey(c.odour, i * K, K) : k;
        enemies = pressure.get(band)?.get(cx, cy) ?? 0;
        // A very narrow tolerance can classify even its own coarse odour band as
        // strange. Other ants in that band may attack, but never this ant itself.
        if (
          rec &&
          c.attackLayer[i] >= 0 &&
          c.attackLayer[i] === c.layer[i] &&
          keyDistance(band, K, c.odour, i * K, c.odourW) > c.tolerance[i] + STRANGER_EPS
        )
          enemies = Math.max(0, enemies - (1 - c.calm[i]));
        enemies *= rec ? 1 - c.calm[i] : 1;
        if (enemies < 1e-6) continue;
      } else if (rec) {
        rec.look(c.odour, i * c.odourAxes, rec.params.tolerance, c.odourW);
        enemies = rec.around(cx, cy, map) * (1 - c.calm[i]);
        if (enemies < 1e-6) continue;
      } else {
        for (let j = 0; j < grids.length; j++) {
          const g = grids[j] as CountGrid;
          if (j !== k && g.any(cx - 1, cy - 1, cx + 1, cy + 1)) enemies += around(g, map, cx, cy);
        }
        if (enemies === 0) continue;
      }
      const allies = Math.max(1, around(grids[k] as CountGrid, map, cx, cy));
      // A calmed encounter (under half an enemy) does not raise the alarm; with no fungus every enemy is whole.
      // A quiet ant (the fungus's, C3) lays (1 − quiet) of it: a skirmish need not recruit the colony.
      // How loudly is its raiseAlarm response (locally: always, × 1).
      if (enemies >= ENEMY) {
        const loud = (1 - c.quiet[i]) * c.responses.raiseAlarm(touch(c, i, true));
        if (loud > 0) ph.deposit("alarm", c.x[i], c.y[i], p.alarm * dt * loud);
      }
      const killed = rng() < 1 - Math.exp((-p.rate * dt * enemies) / allies);
      observer?.exposure(enemies, allies, killed, i);
      if (killed) deaths[k]!.push(i);
    }
  });
  colonies.forEach((c, k) => {
    for (const i of deaths[k]!) c.kill(i);
  });
  return deaths.map((d) => d.length);
}
