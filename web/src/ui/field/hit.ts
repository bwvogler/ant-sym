// What is under a point of the canvas (ja-fnd.6.3.12, docs/field-split.md): the nearest ant to pick, the chamber to inspect, and where a click on the line
// or the strip asks the page to look. Plain TypeScript over the camera and the game's arrays, so a Node test runs it; the shell passes what it reads.

import { CELL, cellOf, type Colony, CURTAIN, PLANE, type OneWorld, type WorldMap } from "../../colony/index.ts";
import { toWorld, type Camera, type Viewport } from "../camera.ts";
import type { Followed } from "../follow.ts";
import { columnNear, planePoint, stripColumn, stripPoint } from "../link.ts";

/** A click picks the nearest ant within this many CSS px. */
export const PICK_PX = 14;

/** The nearest ant (any colony, on layer `lv`) within PICK_PX of the canvas point (x, y) in device pixels, or null. */
export function pickAnt(
  colonies: readonly Colony[],
  c: Camera,
  v: Viewport,
  dpr: number,
  lv: number,
  x: number,
  y: number,
): Followed | null {
  const [wx, wy] = toWorld(c, v, x, y);
  const reach = (PICK_PX * dpr) / c.zoom;
  let best: Followed | null = null;
  let bestD = reach * reach;
  for (const [k, col] of colonies.entries()) {
    for (let i = 0; i < col.n; i++) {
      if (!col.alive[i] || col.layer[i] !== lv) continue;
      const dx = col.x[i] - wx;
      const dy = col.y[i] - wy;
      const dd = dx * dx + dy * dy;
      if (dd < bestD) {
        bestD = dd;
        best = { k, i, gen: col.gen[i] };
      }
    }
  }
  return best;
}

/** The chamber of `map` under the canvas point, as (colony index, chamber id), or null. */
export function chamberUnder(
  map: WorldMap,
  colonies: readonly Colony[],
  c: Camera,
  v: Viewport,
  x: number,
  y: number,
): { k: number; id: number } | null {
  const chambers = map.chambers;
  if (!chambers) return null;
  const [wx, wy] = toWorld(c, v, x, y);
  cellOf(wx, wy);
  const id = chambers.at(CELL[0], CELL[1]);
  const ch = id >= 0 ? chambers.list[id] : undefined;
  if (!ch) return null;
  // A chamber's colony is its nest's index (Colony.params.nest), not "the player's or not": three colonies and more since ja-lo8.8.
  const k = colonies.findIndex((col) => col.params.nest === ch.colony);
  return k < 0 ? null : { k, id };
}

/**
 * A click on nothing in one world: on the line above, the side view at its column; on the strip below (or the sky over it), the top view at P(s).
 * Where the page is asked to look (the other view, and the point on it), or null when the click is not near the line.
 */
export function linkTarget(
  world: OneWorld,
  lv: number,
  c: Camera,
  v: Viewport,
  x: number,
  y: number,
): { view: number; x: number; y: number } | null {
  const [wx, wy] = toWorld(c, v, x, y);
  if (lv === PLANE) {
    const s = columnNear(world.line, wx, wy);
    if (s === null) return null;
    const q = stripPoint(s);
    return { view: CURTAIN, x: q.x, y: q.y };
  }
  const s = stripColumn(world.line, wx, wy);
  const q = s === null ? null : planePoint(world.line, s);
  return q ? { view: PLANE, x: q.x, y: q.y } : null;
}
