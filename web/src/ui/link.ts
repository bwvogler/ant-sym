import {
  CELL,
  cellOf,
  centreX,
  centreY,
  discOffsets,
  R,
  SIDE,
  STRIP,
  cellAt,
  columnsOver,
  type OneWorld,
  type Transect,
} from "../colony/index.ts";

// One world's two views linked (docs/one-world.md §5, U5.2), pure: a click on the line in the top view opens the side
// view at that column s, and a click on the side view's ground strip (or the sky over it) opens the top view at P(s),
// the plane cell over that column. The field turns a click into world units; these say where the other view centres.

/** A click this near the line (world units, from a line cell's centre) is on it: about three cells. */
export const LINK_REACH = 3;

/** The farthest a click on the plane may be from a line and still pick it, however far the view is zoomed out (world units): about eight cells. */
export const LINK_REACH_MAX = 12;

/**
 * The pick radius (world units) for a click on the plane at `zoom` (device px per world unit, with `dpr` the device pixels per CSS px): the finger's `px`
 * CSS px of screen, held between LINK_REACH (zoomed in, where it is today's three units) and LINK_REACH_MAX (zoomed far out, where a pixel is many cells
 * and a click must still reach a line, but not a neighbour's). Depends only on the zoom, not on where the camera is.
 */
export function pickReach(zoom: number, dpr = 1, px = 14): number {
  const r = zoom > 0 ? (px * dpr) / zoom : LINK_REACH_MAX;
  return Math.max(LINK_REACH, Math.min(LINK_REACH_MAX, r));
}

/**
 * The column of the line cell nearest plane point (wx, wy) within `reach` world units of its centre, or null when the
 * line passes nowhere that near. A cell over two columns (at a bend) gives the first.
 */
export function columnNear(line: Transect, wx: number, wy: number, reach = LINK_REACH): number | null {
  return nearestColumn(line, wx, wy, reach)?.s ?? null;
}

/** columnNear's column with its squared distance (world units) from the click, or null. */
export function nearestColumn(line: Transect, wx: number, wy: number, reach = LINK_REACH): { s: number; d: number } | null {
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
  return best === null ? null : { s: best, d: bestD };
}

/**
 * The pick rule (docs/endless-world.md §8; PRD §66, E5.6): the line a click on the plane at world point (wx, wy) is over. Each line offers its
 * nearest line cell (a hole is one) whose centre is within `reach` world units (inclusive: a cell exactly `reach` away is hit); the line whose cell
 * is nearest wins, and the earlier line wins a tie, as the earlier column does within a line. Null when no line passes that near. It reads only the
 * lines' cells at the point's own cell (never the plane's chunks), so a click far out, or at negative coordinates, generates nothing.
 */
export function lineNear(world: OneWorld, wx: number, wy: number, reach = LINK_REACH): { line: number; s: number } | null {
  let best: { line: number; s: number } | null = null;
  let bestD = Infinity;
  world.lines.forEach((l, li) => {
    const h = nearestColumn(l.line, wx, wy, reach);
    if (h && h.d < bestD) {
      bestD = h.d;
      best = { line: li, s: h.s };
    }
  });
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
