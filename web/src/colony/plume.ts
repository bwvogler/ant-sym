// Food odour in the air (ja-rf5.4, docs/desert-ant.md §3): the smell of the food itself, which a desert ant with empty jaws climbs
// toward food it can't yet see. Steering only: no situation field, no trail laid. Without a wind field the first build is a radial
// gradient from every food cell, through open ground (rock and soil stop it, as they stop scent), out to the species' range.

import { CHUNK, CHUNK_BITS } from "./chunks.ts";
import { nx as stepX, ny as stepY } from "./hex.ts";
import { OPEN, isSky, rockAt, type WorldMap } from "./world.ts";

/**
 * The cells a plume array covers: columns x0 … x0 + w − 1, rows y0 … y0 + h − 1, row-major. A bounded map's plume covers the map (no frame is
 * passed: x0 is the map's and y0 is 0); an endless plane's covers a window round what the plume is for (PRD §66 E6.0.2), since a flat array
 * over an unbounded plane cannot be.
 */
export interface Frame {
  x0: number;
  y0: number;
  w: number;
  h: number;
}

/** Half the columns and rows of a food plume's window on an endless plane, round its colony's hole: the awake reach W (sleep.ts), 2 U. */
export const PLUME_HALF_W = 280;
export const PLUME_HALF_H = 324;

/** The window of a food plume for a colony whose hole is at integer cell (cx, cy): PLUME_HALF_W columns and PLUME_HALF_H rows each way. */
export function plumeFrame(cx: number, cy: number): Frame {
  return { x0: cx - PLUME_HALF_W, y0: cy - PLUME_HALF_H, w: 2 * PLUME_HALF_W + 1, h: 2 * PLUME_HALF_H + 1 };
}

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
export function updatePlume(s: PlumeState, map: WorldMap, range: number, t: number, frame?: Frame): Int16Array {
  const { w, h } = frame ?? map.size;
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
  if (frame) {
    // An endless plane: the food of the chunks that exist in the window (a plume never makes ground: the tick must not generate on a miss
    // for a smell), in row order, so the sources queue as the bounded scan's do.
    const { x0, y0 } = frame;
    for (let y = y0; y < y0 + h; y++)
      for (let cx = x0 >> CHUNK_BITS; cx <= (x0 + w - 1) >> CHUNK_BITS; cx++) {
        const a = map.food.peek(cx, y >> CHUNK_BITS);
        if (a === undefined) continue;
        const row = (y & (CHUNK - 1)) << CHUNK_BITS;
        for (let lx = 0; lx < CHUNK; lx++) {
          const x = (cx << CHUNK_BITS) + lx;
          if (x < x0 || x >= x0 + w || !(a[row | lx]! > 0)) continue;
          const k = (y - y0) * w + x - x0;
          dist[k] = 0;
          cells.push(k);
        }
      }
    spread(dist, map, range, cells, frame);
    return dist;
  }
  const { x0 } = map;
  for (let y = 0; y < h; y++)
    for (let col = 0; col < w; col++)
      if (map.food.get(col + x0, y) > 0) {
        const k = y * w + col;
        dist[k] = 0;
        cells.push(k);
      }
  spread(dist, map, range, cells);
  return dist;
}

/**
 * Spread a plume out from its sources: `cells` holds the source cells' indices (row-major over the map's size), each set
 * to 0 in `dist` and every other cell −1; each open cell within `range` steps of one gets its steps. Rock, soil and sky stop it.
 */
export function spread(dist: Int16Array, map: WorldMap, range: number, cells: number[], frame?: Frame): void {
  const { w, h } = frame ?? map.size;
  const x0 = frame ? frame.x0 : map.x0;
  const y0 = frame ? frame.y0 : 0;
  for (let q = 0; q < cells.length; q++) {
    const k = cells[q];
    const d = dist[k] + 1;
    if (d > range) continue;
    const col = k % w;
    const y = (k - col) / w + y0;
    const x = col + x0;
    for (let dir = 0; dir < 6; dir++) {
      const tx = stepX(x, y, dir);
      const ty = stepY(y, dir);
      if (tx < x0 || ty < y0 || tx >= x0 + w || ty >= y0 + h) continue;
      const t2 = (ty - y0) * w + tx - x0;
      if (dist[t2] >= 0 || rockAt(map, tx, ty) !== OPEN || isSky(map, tx, ty)) continue;
      dist[t2] = d;
      cells.push(t2);
    }
  }
}

/** The odour at cell (cx, cy) of a plume out to `range`: 1 on food, falling to 0 past the range; 0 off the map (or outside its frame). */
export function plumeAt(dist: Int16Array, map: WorldMap, range: number, cx: number, cy: number, frame?: Frame): number {
  const { w, h } = frame ?? map.size;
  const col = cx - (frame ? frame.x0 : map.x0);
  const row = cy - (frame ? frame.y0 : 0);
  if (col < 0 || row < 0 || col >= w || row >= h) return 0;
  const d = dist[row * w + col];
  // A plume built out further than this reader's range (the aphids' is built to the farthest any colony smells) reads 0 past it.
  return d < 0 || d > range ? 0 : 1 - d / (range + 1);
}
