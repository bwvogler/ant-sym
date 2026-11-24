// A clump of aphids, put down by the builder (docs/aphids.md "The mechanic", PRD §78, ja-nzkg.2): the aphids' body, not an
// ant's choice. Each clump makes honeydew on its cells, ordinary food of a sugar's quality, at a rate by how many aphids
// it has, up to a cap a cell; the aphids grow, then crash. Ants find, take and recruit to the honeydew as to any food.
//
// Real aphid colonies grow and crash over weeks; no honeydew rate per aphid was verified (docs/aphids.md "What was not
// found"). Every number here is design, set so that a clump outlasts a sugar stroke (assay B10) without flooding a colony.
// Deterministic: a clump draws no random numbers, so a game with none is the same game as before, tick for tick.

import { cellKey, centreX, centreY, keyX, keyY } from "./hex.ts";
import { spread, type Frame } from "./plume.ts";
import { dropFood, OPEN, rockAt, type WorldMap } from "./world.ts";

/** The clumps' numbers (design marks; docs/aphids.md). Times in game seconds. */
export const APHID = {
  /** aphids a clump starts with, per cell it covers */
  perCell: 3,
  /** how many times its start it grows to, at its peak */
  peak: 3,
  /** when it peaks, from when it was put down */
  peakAt: 150,
  /** when its last aphids are gone */
  endAt: 360,
  /** honeydew per aphid per second, in food units (an ant carries one) */
  honey: 0.02,
  /** the most honeydew a cell holds: the rest is not made (a full leaf drips no more on itself) */
  cellCap: 4,
  /** honeydew's quality: as the builder's sugar (Beckers et al. 1993's 1 M; docs/trails.md) */
  quality: 1.5,
} as const;

/** A clump: its cells, its aphids (as a life curve over its age, less those eaten), and its honeydew owed. Saved with the game. */
export interface AphidClump {
  layer: number;
  /** cell x, y pairs */
  cells: number[];
  /** aphids it started with (APHID.perCell a cell) */
  start: number;
  /** aphids taken by ants (docs/aphids.md: ants eat a few) */
  eaten: number;
  age: number;
  /** honeydew made but not yet put on a cell, in food units (below 1) */
  owed: number;
}

/** The life curve: 1 when put down, growing to APHID.peak at peakAt, falling to 0 at endAt. */
export function aphidLife(age: number): number {
  const { peak, peakAt, endAt } = APHID;
  if (age <= 0) return 1;
  if (age <= peakAt) return Math.pow(peak, age / peakAt);
  if (age >= endAt) return 0;
  return (peak * (endAt - age)) / (endAt - peakAt);
}

/** Aphids in a clump now. */
export function aphidCount(c: AphidClump): number {
  return Math.max(0, c.start * aphidLife(c.age) - c.eaten);
}

/** What the clumps step needs of the game: the clumps and each layer's map. */
export interface AphidWorld {
  aphids: AphidClump[];
  layers: readonly WorldMap[];
}

/**
 * Step every clump `dt` seconds: age it, make its honeydew and put each whole unit on its emptiest open cell under the
 * cap; a clump whose aphids are all gone is dropped (its honeydew stays, as food). Food it adds counts in foodTotal, as
 * regrowth's and the builder's does.
 */
export function stepAphids(w: AphidWorld, dt: number): void {
  if (!w.aphids.length) return;
  w.aphids = w.aphids.filter((c) => {
    c.age += dt;
    const n = aphidCount(c);
    if (n <= 0 && c.age >= APHID.endAt) return false;
    const map = w.layers[c.layer];
    if (!map) return false;
    c.owed += n * APHID.honey * dt;
    while (c.owed >= 1) {
      let best = -1;
      let least: number = APHID.cellCap;
      for (let k = 0; k < c.cells.length; k += 2) {
        const x = c.cells[k] as number;
        const y = c.cells[k + 1] as number;
        if (rockAt(map, x, y) !== OPEN) continue;
        const f = map.food.get(x, y);
        if (f < least) {
          least = f;
          best = k;
        }
      }
      if (best < 0) {
        c.owed = 0; // every cell full: what is not taken is not made
        break;
      }
      const x = c.cells[best] as number;
      const y = c.cells[best + 1] as number;
      dropFood(map, centreX(x, y), centreY(y), 1, APHID.quality);
      map.foodTotal += 1;
      c.owed -= 1;
    }
    return true;
  });
}

/** The cell keys (hex.ts cellKey: any cell of an endless plane) of every clump on `layer`, for a lookup by cell. */
export function aphidCells(clumps: readonly AphidClump[], layer: number): Set<number> {
  const out = new Set<number>();
  for (const c of clumps) {
    if (c.layer !== layer || aphidCount(c) <= 0) continue;
    for (let k = 0; k < c.cells.length; k += 2) out.add(cellKey(c.cells[k]!, c.cells[k + 1]!));
  }
  return out;
}

/**
 * The aphids' odour in the air (docs/aphids.md, finding 1; ja-nzkg.3): a plume out from every living clump's cells, which
 * an empty-jawed ant of a species with `aphidPlume` climbs, as the desert ant climbs its food's (plume.ts). One for the
 * game, shared by its colonies, built out to the farthest any of them smells. Rebuilt every tick while a clump lives (a
 * build is about 25 µs on one world's plane): it follows the clumps and the terrain at once, and needs no saving, since a
 * loaded game builds the same one from the same clumps and map (review of #243, S1: rebuilt only each period, a save made
 * within one of a terrain change loaded a different odour).
 */
export interface AphidOdour {
  /** per plane cell, steps from the nearest living aphid cell through open ground; −1 beyond; null with no clumps */
  dist: Int16Array | null;
  /** the cells `dist` covers when the plane has no edge (an endless plane: a window round the clumps); null: the map's own */
  frame: Frame | null;
  /** how far it was built out */
  range: number;
  /** the game's clumps (Game.aphids), for an ant that takes an aphid to find whose it is */
  clumps: AphidClump[];
}

export const aphidOdour = (): AphidOdour => ({ dist: null, frame: null, range: 0, clumps: [] });

/** The living clump with cell (x, y), or null. */
export function clumpAt(clumps: readonly AphidClump[], x: number, y: number): AphidClump | null {
  for (const c of clumps) {
    if (aphidCount(c) < 1) continue;
    for (let k = 0; k < c.cells.length; k += 2) if (c.cells[k] === x && c.cells[k + 1] === y) return c;
  }
  return null;
}

/** Build the game's aphid odour over `map` (the plane) out to `range` cells from the clumps as they are now; null with none living. */
export function updateAphidOdour(o: AphidOdour, clumps: readonly AphidClump[], layer: number, map: WorldMap, range: number): void {
  const live = range > 0 ? aphidCells(clumps, layer) : new Set<number>();
  if (!live.size) {
    o.dist = null;
    o.frame = null;
    return;
  }
  // An endless plane: the window is the clumps' box and the range round it (PRD §66 E6.0.2); a bounded map's is the map.
  let frame: Frame | null = null;
  if (map.endless) {
    let x0 = Infinity;
    let x1 = -Infinity;
    let y0 = Infinity;
    let y1 = -Infinity;
    for (const k of live) {
      x0 = Math.min(x0, keyX(k));
      x1 = Math.max(x1, keyX(k));
      y0 = Math.min(y0, keyY(k));
      y1 = Math.max(y1, keyY(k));
    }
    frame = { x0: x0 - range - 1, y0: y0 - range - 1, w: x1 - x0 + 2 * range + 3, h: y1 - y0 + 2 * range + 3 };
  }
  const { w, h } = frame ?? map.size;
  const fx0 = frame ? frame.x0 : map.x0;
  const fy0 = frame ? frame.y0 : 0;
  const dist = o.dist && o.dist.length === w * h ? o.dist : new Int16Array(w * h);
  dist.fill(-1);
  const src: number[] = [];
  for (const k of live) {
    const x = keyX(k);
    const y = keyY(k);
    const col = x - fx0;
    const row = y - fy0;
    if (col < 0 || row < 0 || col >= w || row >= h) continue;
    dist[row * w + col] = 0;
    src.push(row * w + col);
  }
  spread(dist, map, range, src, frame ?? undefined);
  o.dist = dist;
  o.frame = frame;
  o.range = range;
}
