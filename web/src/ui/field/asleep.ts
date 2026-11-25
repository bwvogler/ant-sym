// A frozen colony on the map (ja-qpv.4.5, docs/endless-world.md §6 and §8): past the awake cap the sim stops stepping a colony, so the
// page draws it still and at half strength: paused, not dead and not stuck. Drawing only: nothing here is read by the simulation.

import type { Colony } from "../../colony/index.ts";
import type { FieldCtx } from "./ctx.ts";

/** How strongly a sleeping colony's ants, nest, brood, queen and alates draw (owner, 2026-11-24: dimmed and still). */
export const ASLEEP_DIM = 0.5;

/** Whether `col` is asleep this frame: the game froze it (the sensed map copies the frozen set on every step). Nothing sleeps in a game that never freezes. */
export function colonyAsleep(fc: FieldCtx, col: Colony): boolean {
  const asleep = fc.asleep;
  return asleep !== undefined && asleep.size > 0 && asleep.has(fc.colonies.indexOf(col));
}
