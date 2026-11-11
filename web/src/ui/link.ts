import { CELL, cellOf, centreX, centreY, discOffsets, R, SIDE, STRIP, cellAt, columnsOver, type Transect } from "../colony/index.ts";

// One world's two views linked (docs/one-world.md §5, U5.2), pure: a click on the line in the top view opens the side
// view at that column s, and a click on the side view's ground strip (or the sky over it) opens the top view at P(s),
// the plane cell over that column. The field turns a click into world units; these say where the other view centres.

/** A click this near the line (world units, from a line cell's centre) is on it: about three cells. */
export const LINK_REACH = 3;

/**
 * The column of the line cell nearest plane point (wx, wy) within `reach` world units of its centre, or null when the
 * line passes nowhere that near. A cell over two columns (at a bend) gives the first.
 */
export function columnNear(line: Transect, wx: number, wy: number, reach = LINK_REACH): number | null {
  cellOf(wx, wy);
  const x0 = CELL[0];
  const y0 = CELL[1];
  // A cell within `reach` of the point is within reach + SIDE (the farthest a point lies from its cell's centre) of the
  // click's cell, and cells n steps apart are at least n·R apart: so at most (reach + SIDE) / R steps from it.
  const offs = discOffsets(Math.floor((reach + SIDE) / R))[y0 & 1]!;
  let best: number | null = null;
  let bestD = reach * reach;
  for (let i = 0; i < offs.length; i += 2) {
    const x = x0 + offs[i]!;
    const y = y0 + offs[i + 1]!;
    const cols = columnsOver(line, x, y);
    if (cols.length === 0) continue;
    const dx = centreX(x, y) - wx;
    const dy = centreY(y) - wy;
    const d = dx * dx + dy * dy;
    if (d <= bestD) {
      if (d === bestD && best !== null && cols[0]! >= best) continue;
      bestD = d;
      best = cols[0]!;
    }
  }
  return best;
}

/** Where the side view centres to show column s: on the ground strip there. */
export function stripPoint(s: number): { x: number; y: number } {
  return { x: centreX(s, STRIP), y: centreY(STRIP) };
}

/**
 * The column under side-view point (wx, wy) when it is on the ground strip or the sky over it, read along the strip
 * (the column the strip draws there), or null: below the strip, or off the line's ends.
 */
export function stripColumn(line: Transect, wx: number, wy: number): number | null {
  cellOf(wx, wy);
  if (CELL[1] > STRIP) return null;
  cellOf(wx, centreY(STRIP));
  const s = CELL[0];
  return cellAt(line, s) ? s : null;
}

/** Where the top view centres to show column s: P(s), the plane cell over it (its centre), or null off the line. */
export function planePoint(line: Transect, s: number): { x: number; y: number } | null {
  if (!cellAt(line, s)) return null;
  const x = CELL[0];
  const y = CELL[1];
  return { x: centreX(x, y), y: centreY(y) };
}
