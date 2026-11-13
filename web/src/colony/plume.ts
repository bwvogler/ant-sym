// Food odour in the air (ja-rf5.4, docs/desert-ant.md §3): the smell of the food itself, which a desert ant with empty jaws climbs
// toward food it can't yet see. Steering only: no situation field, no trail laid. Without a wind field the first build is a radial
// gradient from every food cell, through open ground (rock and soil stop it, as they stop scent), out to the species' range.

import { nx as stepX, ny as stepY } from "./hex.ts";
import { OPEN, isSky, rockAt, type WorldMap } from "./world.ts";

/**
 * How often the plume is rebuilt while the food changes (game seconds): odour lags the food a little, as air does. Built at most once
 * in each period of this length, at the first read after the food changed, from the saved state, so a loaded game rebuilds at the
 * same ticks as the unbroken one. A build is ~10 ms on one world's plane (512 × 368, seed 1): every second it cost a desert game
 * +25 % ms/tick, every 4 s +8 %.
 */
export const PLUME_EVERY = 4;

/** The build's queue of cells: scratch, emptied at each build (not state: a save needn't carry it). */
const QUEUE: number[] = [];

/** A colony's plume: what it keeps between ticks (public colony fields, so a save keeps them: colony.ts saveFields). */
export interface PlumeState {
  /** per cell (row-major over the map's size), steps from the nearest food cell through open ground; −1 beyond the range; null before the first build */
  plume: Int16Array | null;
  /** the PLUME_EVERY period it was built in; −1 never */
  plumeEpoch: number;
  /** map.foodLeft when built: the food changed if it moved */
  plumeFood: number;
}

/** Bring `s`'s plume over `map` out to `range` cells up to date at game time `t`: rebuilt in a new period if the food changed. */
export function updatePlume(s: PlumeState, map: WorldMap, range: number, t: number): Int16Array {
  const { w, h } = map.size;
  const epoch = Math.floor(t / PLUME_EVERY);
  const have = s.plume && s.plume.length === w * h ? s.plume : null;
  if (have && (epoch === s.plumeEpoch || s.plumeFood === map.foodLeft)) return have;
  const dist = have ?? new Int16Array(w * h);
  dist.fill(-1);
  const cells = QUEUE;
  cells.length = 0;
  s.plume = dist;
  s.plumeEpoch = epoch;
  s.plumeFood = map.foodLeft;
  const { x0 } = map;
  for (let y = 0; y < h; y++)
    for (let col = 0; col < w; col++)
      if (map.food.get(col + x0, y) > 0) {
        const k = y * w + col;
        dist[k] = 0;
        cells.push(k);
      }
  for (let q = 0; q < cells.length; q++) {
    const k = cells[q];
    const d = dist[k] + 1;
    if (d > range) continue;
    const col = k % w;
    const y = (k - col) / w;
    const x = col + x0;
    for (let dir = 0; dir < 6; dir++) {
      const tx = stepX(x, y, dir);
      const ty = stepY(y, dir);
      if (tx < x0 || ty < 0 || tx >= x0 + w || ty >= h) continue;
      const t2 = ty * w + tx - x0;
      if (dist[t2] >= 0 || rockAt(map, tx, ty) !== OPEN || isSky(map, tx, ty)) continue;
      dist[t2] = d;
      cells.push(t2);
    }
  }
  return dist;
}

/** The odour at cell (cx, cy) of a plume out to `range`: 1 on food, falling to 0 past the range; 0 off the map. */
export function plumeAt(dist: Int16Array, map: WorldMap, range: number, cx: number, cy: number): number {
  const { w, h } = map.size;
  const col = cx - map.x0;
  if (col < 0 || cy < 0 || col >= w || cy >= h) return 0;
  const d = dist[cy * w + col];
  return d < 0 ? 0 : 1 - d / (range + 1);
}
