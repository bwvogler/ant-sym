// A clump of aphids, put down by the builder (docs/aphids.md "The mechanic", PRD §78, ja-nzkg.2): the aphids' body, not an
// ant's choice. Each clump makes honeydew on its cells, ordinary food of a sugar's quality, at a rate by how many aphids
// it has, up to a cap a cell; the aphids grow, then crash. Ants find, take and recruit to the honeydew as to any food.
//
// Real aphid colonies grow and crash over weeks; no honeydew rate per aphid was verified (docs/aphids.md "What was not
// found"). Every number here is design, set so that a clump outlasts a sugar stroke (assay B10) without flooding a colony.
// Deterministic: a clump draws no random numbers, so a game with none is the same game as before, tick for tick.

import { centreX, centreY } from "./hex.ts";
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

/** The cell keys of every clump on `layer`, for a lookup by cell ((y + 0x8000) × 0x10000 + x + 0x8000). */
export function aphidCells(clumps: readonly AphidClump[], layer: number): Set<number> {
  const out = new Set<number>();
  for (const c of clumps) {
    if (c.layer !== layer || aphidCount(c) <= 0) continue;
    for (let k = 0; k < c.cells.length; k += 2) out.add((c.cells[k + 1]! + 0x8000) * 0x10000 + (c.cells[k]! + 0x8000));
  }
  return out;
}
