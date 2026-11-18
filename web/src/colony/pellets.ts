// Pellets and the midden (docs/refactor.md S3.3, ja-fnd.4.12): a pellet's cell cleared of its dug mark, and the midden scent laid where spoil and the dead are dropped. Moved out of class Colony as functions over the colony, verbatim but for `this` becoming `c`.

import type { Colony, Layer } from "./colony.ts";
import { SOIL_DUG } from "./grid.ts";
import { discOffsets, hexDistance } from "./hex.ts";
import { MIDDEN_SPREAD } from "./tuning.ts";
import { PLANE } from "./vocab.ts";
import { OPEN, rockAt } from "./world.ts";

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

/** Ant i carries no pellet (or corpse) any more: the pellet, what it was, and where it was taking it, all at once. A newborn gets the same through the table (ants.ts `reset`): a field added here is marked there too. */
export function clearPellet(c: Colony, i: number): void {
  c.pellet[i] = 0;
  c.soil[i] = SOIL_DUG;
  c.corpse[i] = 0;
  c.spoilTo[i] = NaN;
  c.staleWalk[i] = 0;
}
