// One world's line (docs/one-world.md §3, U1 `ja-lp4.1`), pure: the nests' holes in order, V₀ … V_k, joined by
// straight segments on the hex grid, with a margin past each end. The curtain (everything underground) hangs under
// it: column s of the curtain lies under P(s), the plane cell the line passes through there.
//
// Columns are hex steps (owner, 2026-11-08): a segment's columns are the hex line between its two holes, one per step,
// so neighbouring columns always lie over the same or neighbouring cells. A segment is hexDistance columns long:
// the same as its length running east–west, up to ~15% more at a slant, never less, so the curtain is no shortcut.
//
// s is signed. V₀ starts at s = 0 and the line grows at V₀ into negative s, so what is dug underground never renumbers.

import { CELL, cellOf, centreX, centreY, discOffsets, hexDistance, hexLine } from "./hex.ts";

/** A plane cell. */
export interface Cell {
  x: number;
  y: number;
}

/** Cells past each end hole: one chunk, room for an end colony to dig outward (one-world §3; U2 lays rock beyond). */
export const MARGIN = 64;
/** How near the line may come to itself away from a vertex, in cells (one-world §3 rule 2). */
export const CLEARANCE = 12;
/** The least 2D distance between holes (one-world §3 rule 3): today's NEST_GAP, one gap for one world. */
export const HOLE_GAP_2D = 12;
/** The sharpest turn back a new segment may make on the end segment (one-world §3 rule 2): 120°. */
export const MAX_TURN = (2 * Math.PI) / 3;

/** Which end of the line a founding grows. */
export type End = "start" | "end";

export interface Transect {
  /** the holes in order, V₀ first */
  readonly holes: readonly Cell[];
  /** each hole's column */
  readonly sHole: readonly number[];
  /** the first and last columns, margins included */
  readonly sMin: number;
  readonly sMax: number;
  readonly margin: number;
  /** P(s) for s = sMin … sMax, as flat x, y pairs */
  readonly cells: Int32Array;
}

/** Why a founding is refused: the rule of one-world §3 it breaks. */
export type Refusal = "interior" | "turn" | "crosses" | "clearance" | "hole-gap" | "ground";
export type Founding = { ok: true; end: End } | { ok: false; reason: Refusal };

const cx = (c: Cell): number => centreX(c.x, c.y);
const cy = (c: Cell): number => centreY(c.y);

/**
 * The unit direction the line runs out of an end hole, straight on from its end segment; with one hole, west at the
 * start and east at the end.
 */
function outward(holes: readonly Cell[], end: End): [number, number] {
  const k = holes.length - 1;
  if (k === 0) return end === "start" ? [-1, 0] : [1, 0];
  const [a, b] = end === "start" ? [holes[1]!, holes[0]!] : [holes[k - 1]!, holes[k]!];
  const dx = cx(b) - cx(a);
  const dy = cy(b) - cy(a);
  const len = Math.hypot(dx, dy);
  return [dx / len, dy / len];
}

/** The `margin` cells past an end hole, nearest first: a hex line aimed straight on, far enough to have them all. */
function marginCells(holes: readonly Cell[], end: End, margin: number): Int32Array {
  const v = end === "start" ? holes[0]! : holes[holes.length - 1]!;
  const [ux, uy] = outward(holes, end);
  // A hex step is at most 1 long, so 2·margin of distance is always more than `margin` steps away.
  const fx = cx(v) + ux * 2 * margin;
  const fy = cy(v) + uy * 2 * margin;
  cellOf(fx, fy);
  const line = hexLine(v.x, v.y, CELL[0]!, CELL[1]!);
  return line.subarray(2, 2 + 2 * margin);
}

/** The line through `holes` (in order, at least one) with V₀ at column `s0`. */
export function makeTransect(holes: readonly Cell[], opts: { margin?: number; s0?: number } = {}): Transect {
  if (holes.length === 0) throw new Error("makeTransect: no holes");
  const margin = opts.margin ?? MARGIN;
  const s0 = opts.s0 ?? 0;
  const parts: number[] = [];
  const before = marginCells(holes, "start", margin);
  for (let i = before.length / 2 - 1; i >= 0; i--) parts.push(before[2 * i]!, before[2 * i + 1]!);
  const sHole: number[] = [];
  let s = s0;
  parts.push(holes[0]!.x, holes[0]!.y);
  sHole.push(s);
  for (let i = 1; i < holes.length; i++) {
    const a = holes[i - 1]!;
    const b = holes[i]!;
    const seg = hexLine(a.x, a.y, b.x, b.y);
    for (let j = 2; j < seg.length; j++) parts.push(seg[j]!);
    s += seg.length / 2 - 1;
    sHole.push(s);
  }
  const after = marginCells(holes, "end", margin);
  for (let j = 0; j < after.length; j++) parts.push(after[j]!);
  return { holes: holes.map((h) => ({ x: h.x, y: h.y })), sHole, sMin: s0 - margin, sMax: s + margin, margin, cells: Int32Array.from(parts) };
}

/** P(s): the plane cell over column s, into CELL[0], CELL[1] (no allocation); false when s is off the line. */
export function cellAt(t: Transect, s: number): boolean {
  if (!Number.isInteger(s) || s < t.sMin || s > t.sMax) return false;
  const i = s - t.sMin;
  CELL[0] = t.cells[2 * i]!;
  CELL[1] = t.cells[2 * i + 1]!;
  return true;
}

/** Every column over plane cell (x, y), in order; empty when the line doesn't pass through it. */
export function columnsOver(t: Transect, x: number, y: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < t.cells.length / 2; i++) if (t.cells[2 * i] === x && t.cells[2 * i + 1] === y) out.push(t.sMin + i);
  return out;
}

/** The line grown by a new hole beyond one end. Columns already on the line keep their cells, except the old end's margin. */
export function grow(t: Transect, end: End, cell: Cell): Transect {
  if (end === "end") return makeTransect([...t.holes, cell], { margin: t.margin, s0: t.sHole[0] });
  const v0 = t.holes[0]!;
  return makeTransect([cell, ...t.holes], { margin: t.margin, s0: t.sHole[0]! - hexDistance(cell.x, cell.y, v0.x, v0.y) });
}

type Seg = [number, number, number, number];

function cross(ax: number, ay: number, bx: number, by: number): number {
  return ax * by - ay * bx;
}

/** Whether segments p and q meet (touching counts). */
function meets(p: Seg, q: Seg): boolean {
  const [x1, y1, x2, y2] = p;
  const [x3, y3, x4, y4] = q;
  const d1 = cross(x4 - x3, y4 - y3, x1 - x3, y1 - y3);
  const d2 = cross(x4 - x3, y4 - y3, x2 - x3, y2 - y3);
  const d3 = cross(x2 - x1, y2 - y1, x3 - x1, y3 - y1);
  const d4 = cross(x2 - x1, y2 - y1, x4 - x1, y4 - y1);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return true;
  return (d1 === 0 && onSeg(q, x1, y1)) || (d2 === 0 && onSeg(q, x2, y2)) || (d3 === 0 && onSeg(p, x3, y3)) || (d4 === 0 && onSeg(p, x4, y4));
}

function onSeg([x1, y1, x2, y2]: Seg, px: number, py: number): boolean {
  return Math.min(x1, x2) <= px && px <= Math.max(x1, x2) && Math.min(y1, y2) <= py && py <= Math.max(y1, y2);
}

function pointSeg(px: number, py: number, [x1, y1, x2, y2]: Seg): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const l2 = dx * dx + dy * dy;
  const u = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / l2));
  return Math.hypot(px - x1 - u * dx, py - y1 - u * dy);
}

/** The least distance between two segments that don't meet. */
function segSeg(p: Seg, q: Seg): number {
  return Math.min(pointSeg(p[0], p[1], q), pointSeg(p[2], p[3], q), pointSeg(q[0], q[1], p), pointSeg(q[2], q[3], p));
}

/**
 * The line as it will stay when it grows at `end`: every segment between holes, and the far end's margin. The near
 * end's margin is left out (the new segment replaces it), and the part within the clearance of the end hole is cut
 * off: that is the shared vertex, which rule 2 excuses.
 */
function standing(t: Transect, end: End): Seg[] {
  const h = t.holes;
  const k = h.length - 1;
  const v = end === "start" ? h[0]! : h[k]!;
  const vx = cx(v);
  const vy = cy(v);
  const segs: Seg[] = [];
  for (let i = 0; i < k; i++) segs.push([cx(h[i]!), cy(h[i]!), cx(h[i + 1]!), cy(h[i + 1]!)]);
  const far: End = end === "start" ? "end" : "start";
  const fv = far === "start" ? h[0]! : h[k]!;
  const [ux, uy] = outward(h, far);
  segs.push([cx(fv), cy(fv), cx(fv) + ux * t.margin, cy(fv) + uy * t.margin]);
  const out: Seg[] = [];
  for (const sg of segs) {
    // Cut the part of each segment within the clearance of the vertex. Only the end segment touches it: the rest of
    // the line kept the clearance from it when this hole was founded.
    const atStart = sg[0] === vx && sg[1] === vy;
    const atEnd = sg[2] === vx && sg[3] === vy;
    if (!atStart && !atEnd) {
      out.push(sg);
      continue;
    }
    const len = Math.hypot(sg[2] - sg[0], sg[3] - sg[1]);
    if (len <= CLEARANCE) continue;
    const f = CLEARANCE / len;
    if (atStart) out.push([sg[0] + (sg[2] - sg[0]) * f, sg[1] + (sg[3] - sg[1]) * f, sg[2], sg[3]]);
    else out.push([sg[0], sg[1], sg[2] - (sg[2] - sg[0]) * f, sg[3] - (sg[3] - sg[1]) * f]);
  }
  return out;
}

/** Rule 2's verdict for a new segment from vertex (vx, vy) by (nx, ny), length nl: null when it holds. */
function fold(t: Transect, end: End, vx: number, vy: number, nx: number, ny: number, nl: number): Refusal | null {
  const [ex, ey] = outward(t.holes, end);
  const turn = Math.acos(Math.max(-1, Math.min(1, (ex * nx + ey * ny) / nl)));
  if (turn > MAX_TURN + 1e-12) return "turn";
  // The new segment and its margin to come run straight on from the vertex: one segment, from the edge of the
  // vertex's clearance (excused) to the margin's far end.
  const reach = nl + t.margin;
  const fresh: Seg = [vx + (nx / nl) * CLEARANCE, vy + (ny / nl) * CLEARANCE, vx + (nx / nl) * reach, vy + (ny / nl) * reach];
  const old = standing(t, end);
  for (const b of old) if (meets(fresh, b)) return "crosses";
  // A hair of slack: at the 120° limit the clearance holds exactly, and rounding must not refuse it.
  for (const b of old) if (segSeg(fresh, b) < CLEARANCE - 1e-9) return "clearance";
  return null;
}

/**
 * Whether a colony may be founded with its hole at plane cell `p` (one-world §3), and at which end the line would grow.
 * The rules, in order:
 *  1. its nearest hole (2D, between cell centres) is an end: a tie with an interior hole is refused; a tie between the
 *     two ends grows at V₀;
 *  2. the new segment turns back on the end segment by at most 120°, and away from the shared vertex (beyond the
 *     clearance) neither it nor its margin to come crosses the line or comes within the clearance of it, the far end's
 *     margin included;
 *  3. `p` is at least HOLE_GAP_2D from every hole;
 *  4. `p` is open ground (`open`, e.g. world.ts's openCell(map)).
 */
export function canFound(t: Transect, p: Cell, open: (x: number, y: number) => boolean): Founding {
  const h = t.holes;
  const k = h.length - 1;
  const px = cx(p);
  const py = cy(p);
  // 1. The nearest hole is an end.
  let best = Infinity;
  for (const v of h) best = Math.min(best, Math.hypot(cx(v) - px, cy(v) - py));
  for (let i = 1; i < k; i++) if (Math.hypot(cx(h[i]!) - px, cy(h[i]!) - py) === best) return { ok: false, reason: "interior" };
  const end: End = Math.hypot(cx(h[0]!) - px, cy(h[0]!) - py) === best ? "start" : "end";
  // 2. No folding back: the turn, then crossing and clearance.
  const v = end === "start" ? h[0]! : h[k]!;
  const vx = cx(v);
  const vy = cy(v);
  const nx = px - vx;
  const ny = py - vy;
  const nl = Math.hypot(nx, ny);
  if (nl === 0) return { ok: false, reason: "hole-gap" };
  // With one hole there is no line yet to fold back on: both its margins give way to the new segment.
  const folded = k > 0 ? fold(t, end, vx, vy, nx, ny, nl) : null;
  if (folded) return { ok: false, reason: folded };
  // 3. Room from every hole.
  for (const w of h) if (Math.hypot(cx(w) - px, cy(w) - py) < HOLE_GAP_2D) return { ok: false, reason: "hole-gap" };
  // 4. Open ground.
  if (!open(p.x, p.y)) return { ok: false, reason: "ground" };
  return { ok: true, end };
}

/**
 * The cell nearest `p` (2D, then a fixed order, so a game replays) within `radius` steps where canFound holds, with the
 * end it grows; null when there is none (a flight with nowhere to land fails: one-world §3, §8).
 */
export function nearestValid(t: Transect, p: Cell, radius: number, open: (x: number, y: number) => boolean): { cell: Cell; end: End } | null {
  const offs = discOffsets(radius)[p.y & 1]!;
  const px = cx(p);
  const py = cy(p);
  const order: [number, number][] = [];
  for (let i = 0; i < offs.length; i += 2) {
    const x = p.x + offs[i]!;
    const y = p.y + offs[i + 1]!;
    order.push([Math.hypot(centreX(x, y) - px, centreY(y) - py), i]);
  }
  order.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  for (const [, i] of order) {
    const cell = { x: p.x + offs[i]!, y: p.y + offs[i + 1]! };
    const f = canFound(t, cell, open);
    if (f.ok) return { cell, end: f.end };
  }
  return null;
}
