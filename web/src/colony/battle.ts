import { BLOCK_BITS, ChunkLayer } from "./chunks.ts";
import { type Colony, type Layer } from "./colony.ts";
import { ENEMY } from "./vocab.ts";
import { CELL, discOffsets } from "./hex.ts";
import type { Recognition } from "./recognition.ts";
import { clampCol, inBounds, type Bounds } from "./world.ts";

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

export interface FightParams {
  /** deaths per second for an ant facing as many enemies as allies */
  rate: number;
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
  const map = layer < 0 ? colony.map : (colony.layers[layer] as Layer).map;
  const h = map.size.h;
  for (let i = 0; i < colony.n; i++) {
    if (!colony.alive[i] || (layer >= 0 && colony.layer[i] !== layer)) continue;
    colony.antCell(i);
    out.add(clampCol(map, CELL[0]), Math.min(h - 1, Math.max(0, CELL[1])));
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
  const deaths: number[][] = colonies.map(() => []);
  colonies.forEach((c, k) => {
    const on = layer < 0 ? null : (c.layers[layer] as Layer);
    const map = (on ?? c).map;
    const ph = (on ?? c).ph;
    for (let i = 0; i < c.n; i++) {
      if (!c.alive[i] || (layer >= 0 && c.layer[i] !== layer)) continue;
      c.antCell(i);
      const cx = clampCol(map, CELL[0]);
      const cy = Math.min(map.size.h - 1, Math.max(0, CELL[1]));
      let enemies = 0;
      if (rec) {
        rec.look(c.odour[i], rec.params.tolerance);
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
        const loud = (1 - c.quiet[i]) * c.responses.raiseAlarm(c.touch(i, true));
        if (loud > 0) ph.deposit("alarm", c.x[i], c.y[i], p.alarm * dt * loud);
      }
      if (rng() < 1 - Math.exp((-p.rate * dt * enemies) / allies)) deaths[k]!.push(i);
    }
  });
  colonies.forEach((c, k) => {
    for (const i of deaths[k]!) c.kill(i);
  });
  return deaths.map((d) => d.length);
}
