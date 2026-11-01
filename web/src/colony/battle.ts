import type { Colony } from "./colony.ts";
import type { WorldSize } from "./world.ts";

// Fights, pure. An ant with enemies in the 3×3 cells around it is in a fight:
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

/** Ants per cell, one grid per colony. */
export function occupancy(colony: Colony, out: Uint16Array): Uint16Array {
  out.fill(0);
  const { w, h } = colony.map.size;
  for (let i = 0; i < colony.n; i++) {
    if (!colony.alive[i]) continue;
    const cx = Math.min(w - 1, Math.max(0, Math.floor(colony.x[i] as number)));
    const cy = Math.min(h - 1, Math.max(0, Math.floor(colony.y[i] as number)));
    out[cy * w + cx] = (out[cy * w + cx] as number) + 1;
  }
  return out;
}

/** Sum of a grid over the 3×3 cells around (cx, cy). */
export function around(grid: Uint16Array, size: WorldSize, cx: number, cy: number, r = 1): number {
  let s = 0;
  for (let y = Math.max(0, cy - r); y <= Math.min(size.h - 1, cy + r); y++) for (let x = Math.max(0, cx - r); x <= Math.min(size.w - 1, cx + r); x++) s += grid[y * size.w + x] as number;
  return s;
}

/** Resolve one dt of fighting between colonies; `grids[k]` is colony k's occupancy. Returns the deaths per colony. */
export function resolveFights(colonies: Colony[], grids: Uint16Array[], dt: number, rng: () => number, p: FightParams = DEFAULT_FIGHT): number[] {
  const deaths: number[][] = colonies.map(() => []);
  colonies.forEach((c, k) => {
    const size = c.map.size;
    for (let i = 0; i < c.n; i++) {
      if (!c.alive[i]) continue;
      const cx = Math.min(size.w - 1, Math.max(0, Math.floor(c.x[i] as number)));
      const cy = Math.min(size.h - 1, Math.max(0, Math.floor(c.y[i] as number)));
      let enemies = 0;
      grids.forEach((g, j) => {
        if (j !== k) enemies += around(g, size, cx, cy);
      });
      if (enemies === 0) continue;
      const allies = Math.max(1, around(grids[k] as Uint16Array, size, cx, cy));
      c.ph.deposit("alarm", c.x[i] as number, c.y[i] as number, p.alarm * dt);
      if (rng() < 1 - Math.exp((-p.rate * dt * enemies) / allies)) deaths[k]!.push(i);
    }
  });
  colonies.forEach((c, k) => {
    for (const i of deaths[k]!) c.kill(i);
  });
  return deaths.map((d) => d.length);
}
