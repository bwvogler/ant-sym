// Pellets and the midden (docs/refactor.md S3.3, ja-fnd.4.12): a loose pellet picked up and taken up, a pellet's cell cleared of its dug mark, and the midden scent laid where spoil and the dead are dropped. Moved out of class Colony as functions over the colony, verbatim but for `this` becoming `c`.

import type { Colony, Layer } from "./colony.ts";
import { NO_CELL, SOIL_DUG, SOIL_FILL, SOIL_LOOSE } from "./grid.ts";
import { discOffsets, hexDistance, nx as stepX, ny as stepY } from "./hex.ts";
import { touch } from "./sense.ts";
import { LOOSE_FILL_PICK, LOOSE_SPREAD, LOOSE_SPREAD_PICK, MIDDEN_SPREAD } from "./tuning.ts";
import { PLANE } from "./vocab.ts";
import { OPEN, groundTop, rockAt, takeLoose } from "./world.ts";

/**
 * One world's plane (U3c): lay `amount` of midden mark on plane cell (x, y), and tapering over MIDDEN_SPREAD cells round
 * it (the side view's taper along the ground, in 2D), on the plane's scent whichever layer is bound. Rock takes none.
 */
export function markMiddenPlane(c: Colony, x: number, y: number, amount: number): void {
  const { map, ph } = c.layers[PLANE] as Layer;
  const offs = discOffsets(MIDDEN_SPREAD)[y & 1] as Int16Array;
  for (let k = 0; k < offs.length; k += 2) {
    const tx = x + offs[k];
    const ty = y + offs[k + 1];
    if (rockAt(map, tx, ty) !== OPEN) continue;
    ph.depositCell("midden", tx, ty, (amount * (MIDDEN_SPREAD + 1 - hexDistance(x, y, tx, ty))) / (MIDDEN_SPREAD + 1));
  }
}

/** Lay `amount` of midden mark on the ground at column `col`, and tapering over MIDDEN_SPREAD columns either side. */
export function markMidden(c: Colony, col: number, amount: number): void {
  if (c.map.surfaceRows !== undefined) return; // one world's curtain: the midden is the plane's (U3c), never its ground strip
  for (let dx = -MIDDEN_SPREAD; dx <= MIDDEN_SPREAD; dx++) {
    const x = col + dx;
    if (x < c.map.x0 || x >= c.map.x0 + c.map.size.w) continue;
    c.ph.depositCell("midden", x, groundTop(c.map, x) - 1, (amount * (MIDDEN_SPREAD + 1 - Math.abs(dx))) / (MIDDEN_SPREAD + 1));
  }
}

/** Ant i carries no pellet (or corpse) any more: the pellet, what it was, and where it was taking it, all at once. A newborn gets the same through the table (ants.ts `reset`): a field added here is marked there too. */
export function clearPellet(c: Colony, i: number): void {
  c.pellet[i] = 0;
  c.soil[i] = SOIL_DUG;
  c.corpse[i] = 0;
  c.spoilTo[i] = NaN;
  c.staleWalk[i] = 0;
}

/**
 * The side view: an explorer on the ground beside loose soil now and then picks up a pellet of it (it comes up
 * easily). From a steep flank (LOOSE_SPREAD_PICK a cell) it carries it a little farther out and drops it again, so
 * the mound spreads and smooths itself as ants rework their spoil; from anywhere on it (LOOSE_FILL_PICK) it takes
 * it down into the nest to refill unused space, as leaf-cutting ants refill excess space (Pielström & Roces).
 * True if it picked one up.
 */
export function pickLoose(c: Colony, i: number, cx: number, cy: number, enemy: boolean): boolean {
  const { map } = c;
  if (!map.loose) return false;
  const u = c.rng();
  if (u >= LOOSE_SPREAD_PICK + LOOSE_FILL_PICK) return false;
  for (let d = 0; d < 6; d++) {
    const tx = stepX(cx, cy, d);
    const ty = stepY(cy, d);
    if (map.loose.get(tx, ty) !== 1 || groundTop(map, tx) !== ty) continue; // only off the top: the mound's surface
    if (c.byAnEntrance(tx, ty)) continue;
    // Spread from a slope standing at its angle of repose (the next column out a row lower): the steep flanks.
    const out = tx >= c.entranceCol ? 1 : -1;
    const steep = groundTop(map, tx + out) - ty >= 1;
    const fill = u < LOOSE_FILL_PICK;
    if (!fill && !steep) continue;
    if (!c.responses.get(touch(c, i, enemy, c.mode[i], "none", "soil"))) return false;
    if (!takeLoose(map, tx, ty)) continue;
    takeUpLoose(c, i, tx, fill);
    return true;
  }
  return false;
}

/** Ant i takes up a loose pellet from column `col` (off the mound's top): down to fill, or spreading it farther out. */
export function takeUpLoose(c: Colony, i: number, col: number, fill: boolean): void {
  c.pellet[i] = 1;
  c.soil[i] = fill ? SOIL_FILL : SOIL_LOOSE;
  c.loosePicked++;
  c.since[i] = 0;
  c.wall[i] = 0;
  c.mx[i] = NaN;
  c.gx[i] = NO_CELL;
  const out = col >= c.entranceCol ? 1 : -1;
  if (fill) c.looseDown++;
  else {
    c.spoilSide[i] = out;
    c.spoilTo[i] = Math.abs(col - c.entranceCol) + LOOSE_SPREAD * (0.5 + c.rng());
    c.spoilT[i] = 0;
  }
}
