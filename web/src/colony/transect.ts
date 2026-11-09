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
/**
 * The least 2D distance between holes (one-world §3 rule 3), between cell centres in world units: the same value and
 * measure as game.ts's NEST_GAP between nests' centres (a test pins them equal), one gap for one world.
 */
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
  for (let i = 1; i < holes.length; i++)
    if (holes[i]!.x === holes[i - 1]!.x && holes[i]!.y === holes[i - 1]!.y) throw new Error(`makeTransect: holes ${i - 1} and ${i} are the same cell`);
  const margin = opts.margin ?? MARGIN;
  const s0 = opts.s0 ?? 0;
  if (!Number.isInteger(margin) || margin < 0) throw new Error(`makeTransect: margin ${margin} is not a whole number of cells`);
  if (!Number.isInteger(s0)) throw new Error(`makeTransect: s0 ${s0} is not a whole column`);
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

/**
 * P(s): the plane cell over column s, into CELL[0], CELL[1] (no allocation); false when s is off the line. The cell can
 * lie off the generated plane (a margin running past its edge): read it through world.ts, where ground not generated
 * reads as rock, as one-world §3 has beyond the line's ends.
 */
export function cellAt(t: Transect, s: number): boolean {
  if (!Number.isInteger(s) || s < t.sMin || s > t.sMax) return false;
  const i = s - t.sMin;
  CELL[0] = t.cells[2 * i]!;
  CELL[1] = t.cells[2 * i + 1]!;
  return true;
}

const cellKey = (x: number, y: number): number => (y + 32768) * 131072 + (x + 32768);
const byCell = new WeakMap<Transect, Map<number, number[]>>();

/** Every column over plane cell (x, y), in order; empty when the line doesn't pass through it. Indexed once per line. */
export function columnsOver(t: Transect, x: number, y: number): readonly number[] {
  let index = byCell.get(t);
  if (!index) {
    index = new Map();
    for (let i = 0; i < t.cells.length / 2; i++) {
      const key = cellKey(t.cells[2 * i]!, t.cells[2 * i + 1]!);
      const cols = index.get(key);
      if (cols) cols.push(t.sMin + i);
      else index.set(key, [t.sMin + i]);
    }
    byCell.set(t, index);
  }
  return index.get(cellKey(x, y)) ?? [];
}

/**
 * The line grown by a new hole beyond one end. Columns already on the line keep their cells, except the old end's
 * margin, which the new segment replaces. A line of one hole has no direction yet, so its first founding re-aims both
 * margins: straight on from the new segment at either end.
 */
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
  // Cut every part of the line within the clearance of the vertex: not only the end segment, since the one before it
  // can pass as near as 12·sin 60° ≈ 10.4 when this hole was founded at the hole gap and the turn limit.
  return segs.flatMap((sg) => outsideDisc(sg, vx, vy, CLEARANCE));
}

/** The parts of segment `sg` outside the disc of radius r round (ox, oy): none, one or two pieces. */
function outsideDisc(sg: Seg, ox: number, oy: number, r: number): Seg[] {
  const [x1, y1, x2, y2] = sg;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const a = dx * dx + dy * dy;
  const b = 2 * ((x1 - ox) * dx + (y1 - oy) * dy);
  const c = (x1 - ox) ** 2 + (y1 - oy) ** 2 - r * r;
  const disc = b * b - 4 * a * c;
  if (a === 0 || disc <= 0) return [sg];
  const root = Math.sqrt(disc);
  const t1 = (-b - root) / (2 * a);
  const t2 = (-b + root) / (2 * a);
  if (t2 <= 0 || t1 >= 1) return [sg];
  const at = (t: number): [number, number] => [x1 + dx * t, y1 + dy * t];
  const out: Seg[] = [];
  if (t1 > 0) out.push([x1, y1, ...at(t1)]);
  if (t2 < 1) out.push([...at(t2), x2, y2]);
  return out;
}

/** 4 × the squared distance between two cells' centres: a whole number (half-cells across, rows of height √3/2 down), so ties are exact. */
function dist4(ax: number, ay: number, bx: number, by: number): number {
  const dx = 2 * (ax - bx) + (ay & 1) - (by & 1);
  const dy = ay - by;
  return dx * dx + 3 * dy * dy;
}

/** The parts of rule 2 that depend only on the line and the end it grows: built once per transect and end. */
interface EndRule {
  ex: number;
  ey: number;
  old: Seg[];
}
const endRules = new WeakMap<Transect, Partial<Record<End, EndRule>>>();

function endRule(t: Transect, end: End): EndRule {
  let have = endRules.get(t);
  if (!have) endRules.set(t, (have = {}));
  const got = have[end];
  if (got) return got;
  const [ex, ey] = outward(t.holes, end);
  return (have[end] = { ex, ey, old: standing(t, end) });
}

/** Rule 2's verdict for a new segment from vertex (vx, vy) by (nx, ny), length nl: null when it holds. */
function fold(t: Transect, end: End, vx: number, vy: number, nx: number, ny: number, nl: number): Refusal | null {
  const { ex, ey, old } = endRule(t, end);
  const turn = Math.acos(Math.max(-1, Math.min(1, (ex * nx + ey * ny) / nl)));
  if (turn > MAX_TURN + 1e-12) return "turn";
  // The new segment and its margin to come run straight on from the vertex: one segment, from the edge of the
  // vertex's clearance (excused) to the margin's far end.
  const reach = nl + t.margin;
  const fresh: Seg = [vx + (nx / nl) * CLEARANCE, vy + (ny / nl) * CLEARANCE, vx + (nx / nl) * reach, vy + (ny / nl) * reach];
  for (const b of old) if (meets(fresh, b)) return "crosses";
  // A hair of slack: at the 120° limit the clearance holds exactly, and rounding must not refuse it.
  for (const b of old) if (segSeg(fresh, b) < CLEARANCE - 1e-9) return "clearance";
  return null;
}

/**
 * Whether a colony may be founded with its hole at plane cell `p` (one-world §3), and at which end the line would grow.
 * The rules:
 *  1. its nearest hole (2D, between cell centres, compared exactly) is an end: a tie with an interior hole is refused;
 *     a tie between the two ends grows at V₀;
 *  2. the new segment turns back on the end segment by at most 120°, and away from the shared vertex (beyond the
 *     clearance) neither it nor its margin to come crosses the line or comes within the clearance of it, the far end's
 *     margin included;
 *  3. `p` is at least HOLE_GAP_2D from every hole;
 *  4. `p` is open ground (`open`, e.g. world.ts's openCell(map)).
 * They are checked 1, 3, 4, 2: the cheap ones first, and a spot crowding a hole is refused for that ("hole-gap"), not
 * for the turn its nearness makes.
 */
export function canFound(t: Transect, p: Cell, open: (x: number, y: number) => boolean): Founding {
  const h = t.holes;
  const k = h.length - 1;
  // 1. The nearest hole is an end.
  let best = Infinity;
  for (const v of h) best = Math.min(best, dist4(v.x, v.y, p.x, p.y));
  for (let i = 1; i < k; i++) if (dist4(h[i]!.x, h[i]!.y, p.x, p.y) === best) return { ok: false, reason: "interior" };
  const end: End = dist4(h[0]!.x, h[0]!.y, p.x, p.y) === best ? "start" : "end";
  // 3. Room from every hole: the nearest is `best` away.
  if (best < 4 * HOLE_GAP_2D * HOLE_GAP_2D) return { ok: false, reason: "hole-gap" };
  // 4. Open ground.
  if (!open(p.x, p.y)) return { ok: false, reason: "ground" };
  // 2. No folding back: the turn, then crossing and clearance. With one hole there is no line yet to fold back on.
  if (k === 0) return { ok: true, end };
  const v = end === "start" ? h[0]! : h[k]!;
  const vx = cx(v);
  const vy = cy(v);
  const nx = cx(p) - vx;
  const ny = cy(p) - vy;
  const folded = fold(t, end, vx, vy, nx, ny, Math.hypot(nx, ny));
  return folded ? { ok: false, reason: folded } : { ok: true, end };
}

const rounds = new Map<string, Int16Array>();

/**
 * Offsets (dx, dy pairs, flat) of every cell whose centre is within `radius` (world units) of a cell's on an even
 * (parity 0) or odd row, nearest first, ties in discOffsets' order: a round disc, not a hexagon of steps. Cached.
 */
function roundDisc(radius: number, parity: number): Int16Array {
  const key = `${radius}:${parity}`;
  const have = rounds.get(key);
  if (have) return have;
  // A cell `radius` away is at most radius·2/√3 steps away (the long way round a hexagon).
  const offs = discOffsets(Math.ceil((radius * 2) / Math.sqrt(3)))[parity]!;
  const limit = 4 * radius * radius;
  const order: [number, number][] = [];
  for (let i = 0; i < offs.length; i += 2) {
    const d = dist4(offs[i]!, parity + offs[i + 1]!, 0, parity);
    if (d <= limit) order.push([d, i]);
  }
  order.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const out = Int16Array.from(order.flatMap(([, i]) => [offs[i]!, offs[i + 1]!]));
  rounds.set(key, out);
  return out;
}

/**
 * The cell nearest `p` within `radius` of it (world units, as the crow flies: the same reach every way) where canFound
 * holds, with the end it grows; nearest by exact distance, then a fixed order, so a game replays. Null when there is
 * none (a flight with nowhere to land fails: one-world §3, §8).
 */
export function nearestValid(t: Transect, p: Cell, radius: number, open: (x: number, y: number) => boolean): { cell: Cell; end: End } | null {
  const offs = roundDisc(radius, p.y & 1);
  for (let i = 0; i < offs.length; i += 2) {
    const cell = { x: p.x + offs[i]!, y: p.y + offs[i + 1]! };
    const f = canFound(t, cell, open);
    if (f.ok) return { cell, end: f.end };
  }
  return null;
}
