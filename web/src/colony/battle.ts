import { ChunkLayer } from "./chunks.ts";
import type { Colony } from "./colony.ts";
import type { Recognition } from "./recognition.ts";
import type { WorldSize } from "./world.ts";

// Fights, pure. An ant with enemies in the 3×3 cells around it is in a fight:
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
    const cx = Math.min(w - 1, Math.max(0, Math.floor(colony.x[i] as number)));
    const cy = Math.min(h - 1, Math.max(0, Math.floor(colony.y[i] as number)));
    out.add(cx, cy);
  }
  return out;
}

/** Sum of a grid over the (2r+1)² cells around (cx, cy), clipped to the map. */
export function around(grid: CountGrid, size: WorldSize, cx: number, cy: number, r = 1): number {
  let s = 0;
  for (let y = Math.max(0, cy - r); y <= Math.min(size.h - 1, cy + r); y++) for (let x = Math.max(0, cx - r); x <= Math.min(size.w - 1, cx + r); x++) s += grid.get(x, y);
  return s;
}

/**
 * Resolve one dt of fighting between colonies; `grids[k]` is colony k's occupancy. With `rec` (built this
 * tick), enemies are strangers by odour; without it, every ant of another colony. Returns the deaths per colony.
 */
export function resolveFights(colonies: Colony[], grids: CountGrid[], dt: number, rng: () => number, p: FightParams = DEFAULT_FIGHT, rec: Recognition | null = null): number[] {
  const deaths: number[][] = colonies.map(() => []);
  colonies.forEach((c, k) => {
    const size = c.map.size;
    for (let i = 0; i < c.n; i++) {
      if (!c.alive[i]) continue;
      const cx = Math.min(size.w - 1, Math.max(0, Math.floor(c.x[i] as number)));
      const cy = Math.min(size.h - 1, Math.max(0, Math.floor(c.y[i] as number)));
      let enemies = 0;
      if (rec) {
        rec.look(c.odour[i] as number, rec.params.tolerance);
        enemies = rec.around(cx, cy, size.w, size.h) * (1 - (c.calm[i] as number));
        if (enemies < 1e-6) continue;
      } else {
        for (let j = 0; j < grids.length; j++) {
          const g = grids[j] as CountGrid;
          if (j !== k && g.any(cx - 1, cy - 1, cx + 1, cy + 1)) enemies += around(g, size, cx, cy);
        }
        if (enemies === 0) continue;
      }
      const allies = Math.max(1, around(grids[k] as CountGrid, size, cx, cy));
      // A calmed encounter (under half an enemy) does not raise the alarm; with no fungus every enemy is whole.
      // A quiet ant (the fungus's, C3) lays (1 − quiet) of it: a skirmish need not recruit the colony.
      const loud = 1 - (c.quiet[i] as number);
      if (enemies >= 0.5 && loud > 0) c.ph.deposit("alarm", c.x[i] as number, c.y[i] as number, p.alarm * dt * loud);
      if (rng() < 1 - Math.exp((-p.rate * dt * enemies) / allies)) deaths[k]!.push(i);
    }
  });
  colonies.forEach((c, k) => {
    for (const i of deaths[k]!) c.kill(i);
  });
  return deaths.map((d) => d.length);
}
