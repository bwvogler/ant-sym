import { ChunkLayer } from "./chunks.ts";
import type { Colony } from "./colony.ts";
import { CELL, discOffsets } from "./hex.ts";
import type { WorldSize } from "./world.ts";

// Fights, pure. An ant with enemies in its own cell or the six around it is in a fight:
// it lays alarm in its own colony's field (so allies smell it and, by stance
// or doctrine, come or keep away) and may die. Its chance of dying in dt is
// Lanchester-like: rate × dt × enemies around ÷ allies around, so equal
// numbers trade and the bigger crowd wins. Deaths are decided for everyone
// before anyone is removed, so the order colonies are listed in is no edge.

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
      const x = t[k] as number;
      const y = t[k + 1] as number;
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
    for (let by = y0 >> BLOCK_BITS; by <= y1 >> BLOCK_BITS; by++) for (let bx = x0 >> BLOCK_BITS; bx <= x1 >> BLOCK_BITS; bx++) if (this.#blocks.get(bx, by)) return true;
    return false;
  }
}

const BLOCK_BITS = 3;

/** Ants per cell, one grid per colony. */
export function occupancy(colony: Colony, out: CountGrid): CountGrid {
  out.reset();
  const { w, h } = colony.map.size;
  for (let i = 0; i < colony.n; i++) {
    if (!colony.alive[i]) continue;
    colony.antCell(i);
    out.add(Math.min(w - 1, Math.max(0, CELL[0] as number)), Math.min(h - 1, Math.max(0, CELL[1] as number)));
  }
  return out;
}

/** Sum of a grid over the cells within `r` steps of (cx, cy) (r = 1: the cell and its six neighbours), clipped to the map. */
export function around(grid: CountGrid, size: WorldSize, cx: number, cy: number, r = 1): number {
  let s = 0;
  const o = discOffsets(r)[cy & 1] as Int16Array;
  for (let k = 0; k < o.length; k += 2) {
    const x = cx + (o[k] as number);
    const y = cy + (o[k + 1] as number);
    if (x >= 0 && y >= 0 && x < size.w && y < size.h) s += grid.get(x, y);
  }
  return s;
}

/** Resolve one dt of fighting between colonies; `grids[k]` is colony k's occupancy. Returns the deaths per colony. */
export function resolveFights(colonies: Colony[], grids: CountGrid[], dt: number, rng: () => number, p: FightParams = DEFAULT_FIGHT): number[] {
  const deaths: number[][] = colonies.map(() => []);
  colonies.forEach((c, k) => {
    const size = c.map.size;
    for (let i = 0; i < c.n; i++) {
      if (!c.alive[i]) continue;
      c.antCell(i);
      const cx = Math.min(size.w - 1, Math.max(0, CELL[0] as number));
      const cy = Math.min(size.h - 1, Math.max(0, CELL[1] as number));
      let enemies = 0;
      for (let j = 0; j < grids.length; j++) {
        const g = grids[j] as CountGrid;
        if (j !== k && g.any(cx - 1, cy - 1, cx + 1, cy + 1)) enemies += around(g, size, cx, cy);
      }
      if (enemies === 0) continue;
      const allies = Math.max(1, around(grids[k] as CountGrid, size, cx, cy));
      c.ph.deposit("alarm", c.x[i] as number, c.y[i] as number, p.alarm * dt);
      if (rng() < 1 - Math.exp((-p.rate * dt * enemies) / allies)) deaths[k]!.push(i);
    }
  });
  colonies.forEach((c, k) => {
    for (const i of deaths[k]!) c.kill(i);
  });
  return deaths.map((d) => d.length);
}
