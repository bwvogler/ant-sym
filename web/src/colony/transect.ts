// One world's line (docs/one-world.md §3, U1 `ja-lp4.1`), pure: the nests' holes in order, V₀ … V_k, joined by
// segments over the hex grid's tiles, with a margin past each end. The curtain (everything underground) hangs under
// it: column s of the curtain lies under P(s), the plane cell the line passes through there.
//
// Columns are hex steps (owner, 2026-11-08): a segment's columns are a shortest hex path between its two holes, one per
// step, so neighbouring columns always lie over the same or neighbouring cells. A segment is hexDistance columns long:
// the same as its length running east–west, up to ~15% more at a slant, never less, so the curtain is no shortcut. The
// path goes in straight runs along the grid with occasional turns, never more than LINE_BAND off the straight line
// between the holes (hex.ts hexRuns; owner, 2026-11-13, ja-lp4.17), and the founding rule is measured on its tiles.
//
// s is signed. V₀ starts at s = 0 and the line grows at V₀ into negative s, so what is dug underground never renumbers.

import { CELL, cellOf, centreX, centreY, discOffsets, hexDistance, hexRuns } from "./hex.ts";

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
 * The least 2D distance between holes (one-world §3 rule 3), between cell centres in world units. 16 (owner,
 * 2026-11-09; ja-tjo): a founded nest's shaft slants 3 columns to a random side and its royal chamber is a disc of
 * radius 4.5, so two holes 16 apart along the curtain keep their chambers apart (16 − 2 × 3 > 2 × 4.5), as the side
 * view's HOLE_GAP does. At 12, two founded royal chambers shared a cell in 15 of 80 pairs on one world's default
 * curtains (seeds 1–20, transect.test.ts; ja-tjo's side-world count, chambers under 9 apart, was 25 of 80). A test pins it
 * against the dig.
 */
export const HOLE_GAP_2D = 16;
/**
 * How far the line's tiles may stray from the straight line between two holes, in world units (cells): the band its runs
 * turn within (hex.ts hexRuns). 3 (owner, 2026-11-13, ja-lp4.17): a 30° slant turns about every 12 cells, one near a
 * grid axis runs 35 or more, and the tiles stay well inside the founding rule's CLEARANCE of the straight line.
 */
export const LINE_BAND = 3;
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
export type FoundCheck = { ok: true; end: End } | { ok: false; reason: Refusal };

const cx = (c: Cell): number => centreX(c.x, c.y);
const cy = (c: Cell): number => centreY(c.y);

/**
 * The unit direction the line runs out of an end hole, straight on from its end segment; with one hole, west at the
 * start and east at the end. (The lab's founding beyond an end aims along it: Game.foundBeyond.)
 */
export function outward(holes: readonly Cell[], end: End): [number, number] {
  const k = holes.length - 1;
  if (k === 0) return end === "start" ? [-1, 0] : [1, 0];
  const [a, b] = end === "start" ? [holes[1]!, holes[0]!] : [holes[k - 1]!, holes[k]!];
  const dx = cx(b) - cx(a);
  const dy = cy(b) - cy(a);
  const len = Math.hypot(dx, dy);
  return [dx / len, dy / len];
}

/** The tiles of the segment from hole a to hole b, both included: hexDistance + 1 cells in runs (LINE_BAND). */
export function segmentCells(a: Cell, b: Cell): Int32Array {
  return hexRuns(a.x, a.y, b.x, b.y, LINE_BAND);
}

/** The `margin` cells past an end hole, nearest first: runs aimed straight on, far enough to have them all. */
function marginCells(holes: readonly Cell[], end: End, margin: number): Int32Array {
  const v = end === "start" ? holes[0]! : holes[holes.length - 1]!;
  const [ux, uy] = outward(holes, end);
  // A hex step is at most 1 long, so 2·margin of distance is always more than `margin` steps away.
  const fx = cx(v) + ux * 2 * margin;
  const fy = cy(v) + uy * 2 * margin;
  cellOf(fx, fy);
  const line = hexRuns(v.x, v.y, CELL[0]!, CELL[1]!, LINE_BAND);
  return line.subarray(2, 2 + 2 * margin);
}

/** The line through `holes` (in order, at least one) with V₀ at column `s0`. */
export function makeTransect(holes: readonly Cell[], opts: { margin?: number; s0?: number } = {}): Transect {
  if (holes.length === 0) throw new Error("makeTransect: no holes");
  for (let i = 1; i < holes.length; i++)
    if (holes[i]!.x === holes[i - 1]!.x && holes[i]!.y === holes[i - 1]!.y)
      throw new Error(`makeTransect: holes ${i - 1} and ${i} are the same cell`);
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
    const seg = segmentCells(a, b);
    for (let j = 2; j < seg.length; j++) parts.push(seg[j]!);
    s += seg.length / 2 - 1;
    sHole.push(s);
  }
  const after = marginCells(holes, "end", margin);
  for (let j = 0; j < after.length; j++) parts.push(after[j]!);
  return {
    holes: holes.map((h) => ({ x: h.x, y: h.y })),
    sHole,
    sMin: s0 - margin,
    sMax: s + margin,
    margin,
    cells: Int32Array.from(parts),
  };
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

/**
 * The line's signed turn at interior vertex j (hole V_j, 0 < j < k), in degrees: how far the segment out of V_j turns from
 * the one into it, between the holes' centres. Positive turns right as seen from above (the plane's y runs down the
 * screen: clockwise), negative left; 0 straight on, never past ±180. NaN at an end, or off the line. For the side view's
 * labels at each bend ("↱ 35°", one-world §5).
 */
export function turnAt(t: Transect, j: number): number {
  const h = t.holes;
  if (!Number.isInteger(j) || j <= 0 || j >= h.length - 1) return NaN;
  const a = h[j - 1]!;
  const v = h[j]!;
  const b = h[j + 1]!;
  const ux = cx(v) - cx(a);
  const uy = cy(v) - cy(a);
  const wx = cx(b) - cx(v);
  const wy = cy(b) - cy(v);
  return (Math.atan2(ux * wy - uy * wx, ux * wx + uy * wy) * 180) / Math.PI;
}

const cellKey = (x: number, y: number): number => (y + 32768) * 131072 + (x + 32768);
const byCell = new WeakMap<Transect, Map<number, number[]>>();
/** No columns: one shared array, so a miss allocates nothing (the renderer asks for every plane ant, every frame). */
const NONE: readonly number[] = Object.freeze([]);

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
  return index.get(cellKey(x, y)) ?? NONE;
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

/** 4 × the squared distance between two cells' centres: a whole number (half-cells across, rows of height √3/2 down), so ties are exact. */
function dist4(ax: number, ay: number, bx: number, by: number): number {
  const dx = 2 * (ax - bx) + (ay & 1) - (by & 1);
  const dy = ay - by;
  return dx * dx + 3 * dy * dy;
}

/** Within the clearance: 4 × the squared distance between centres under this is nearer than CLEARANCE. */
const NEAR4 = 4 * CLEARANCE * CLEARANCE;
/**
 * How far round the shared vertex rule 2 excuses the clearance, in world units: CLEARANCE, and twice the most a tile lies
 * off its straight line (LINE_BAND and the half cell round the middle), and a cell's slack: 20. The turn limit keeps
 * the two segments' straight lines r apart at r from the vertex (120°: 60° between them), so beyond 20 their tiles are
 * at least 12 apart and the clearance agrees with the turn limit, as it did between straight lines with only CLEARANCE
 * excused. Crossing is still checked beyond CLEARANCE.
 */
export const VERTEX_EXCUSE = CLEARANCE + 2 * LINE_BAND + 2;
const EXCUSE4 = 4 * VERTEX_EXCUSE * VERTEX_EXCUSE;
/** endRule's grid: a tile of the line as it stays, beyond CLEARANCE of the vertex (crossing it refuses). */
const ON = 2;
/** endRule's grid: nearer than CLEARANCE to such a tile beyond VERTEX_EXCUSE of the vertex (coming there refuses). */
const NEAR = 1;

/**
 * The parts of rule 2 that depend only on the line and the end it grows, built once per transect and end: the end
 * segment's direction (for the turn), and a grid over the standing line's tiles and their surroundings, flags ON and
 * NEAR. The line as it will stay is every tile but the growing end's margin (the new segment replaces it). Round the end
 * hole, the shared vertex, rule 2 excuses crossing within CLEARANCE and the clearance within VERTEX_EXCUSE. Every part of
 * the line there is excused, not only the end segment, since the one before it can pass near the vertex when this hole
 * was founded close to the last at the turn limit.
 */
interface EndRule {
  ex: number;
  ey: number;
  /** the grid's first cell and size */
  gx: number;
  gy: number;
  gw: number;
  gh: number;
  grid: Uint8Array;
}
const endRules = new WeakMap<Transect, Partial<Record<End, EndRule>>>();

function endRule(t: Transect, end: End): EndRule {
  let have = endRules.get(t);
  if (!have) endRules.set(t, (have = {}));
  const got = have[end];
  if (got) return got;
  const [ex, ey] = outward(t.holes, end);
  const k = t.holes.length - 1;
  const v = end === "start" ? t.holes[0]! : t.holes[k]!;
  const [lo, hi] = end === "start" ? [t.sHole[0]!, t.sMax] : [t.sMin, t.sHole[k]!];
  const keep: number[] = [];
  for (let s = lo; s <= hi; s++) {
    const i = s - t.sMin;
    const x = t.cells[2 * i]!;
    const y = t.cells[2 * i + 1]!;
    if (dist4(x, y, v.x, v.y) >= NEAR4) keep.push(x, y);
  }
  // A cell nearer than CLEARANCE is fewer than CLEARANCE + 1 columns across and CLEARANCE / R + 1 rows down.
  const padX = CLEARANCE + 1;
  const padY = Math.ceil(CLEARANCE / (Math.sqrt(3) / 2)) + 1;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (let i = 0; i < keep.length; i += 2) {
    x0 = Math.min(x0, keep[i]!);
    x1 = Math.max(x1, keep[i]!);
    y0 = Math.min(y0, keep[i + 1]!);
    y1 = Math.max(y1, keep[i + 1]!);
  }
  if (keep.length === 0) return (have[end] = { ex, ey, gx: 0, gy: 0, gw: 0, gh: 0, grid: new Uint8Array(0) });
  const gx = x0 - padX;
  const gy = y0 - padY;
  const gw = x1 - x0 + 1 + 2 * padX;
  const gh = y1 - y0 + 1 + 2 * padY;
  const grid = new Uint8Array(gw * gh);
  for (let i = 0; i < keep.length; i += 2) {
    const x = keep[i]!;
    const y = keep[i + 1]!;
    grid[(y - gy) * gw + x - gx]! |= ON;
    if (dist4(x, y, v.x, v.y) < EXCUSE4) continue;
    const offs = roundDisc(CLEARANCE, y & 1, true);
    for (let j = 0; j < offs.length; j += 2) grid[(y + offs[j + 1]! - gy) * gw + x + offs[j]! - gx]! |= NEAR;
  }
  return (have[end] = { ex, ey, gx, gy, gw, gh, grid });
}

/**
 * Rule 2's verdict for a new hole at `p` beyond end hole `v`: null when it holds. The turn is measured between the
 * holes' centres; crossing and clearance between tiles: the new segment's and its margin's to come (exactly what grow
 * would lay), against the line as it will stay (endRule), with the shared vertex excused as endRule says. Two shortest
 * hex paths that cross share a tile (hex cells meet only edge to edge), so meeting a tile is crossing.
 */
function fold(t: Transect, end: End, v: Cell, p: Cell): Refusal | null {
  const { ex, ey, gx, gy, gw, gh, grid } = endRule(t, end);
  const nx = cx(p) - cx(v);
  const ny = cy(p) - cy(v);
  const turn = Math.acos(Math.max(-1, Math.min(1, (ex * nx + ey * ny) / Math.hypot(nx, ny))));
  if (turn > MAX_TURN + 1e-12) return "turn";
  const pair = end === "start" ? [p, v] : [v, p];
  const tiles = [segmentCells(v, p), marginCells(pair, end, t.margin)];
  let near = false;
  for (const cells of tiles)
    for (let i = 0; i < cells.length; i += 2) {
      const x = cells[i]! - gx;
      const y = cells[i + 1]! - gy;
      if (x < 0 || y < 0 || x >= gw || y >= gh) continue;
      const g = grid[y * gw + x]!;
      if (g === 0) continue;
      const r4 = dist4(cells[i]!, cells[i + 1]!, v.x, v.y);
      if (g & ON && r4 >= NEAR4) return "crosses";
      if (g & NEAR && r4 >= EXCUSE4) near = true;
    }
  return near ? "clearance" : null;
}

/**
 * Whether a colony may be founded with its hole at plane cell `p` (one-world §3), and at which end the line would grow.
 * The rules:
 *  1. its nearest hole (2D, between cell centres, compared exactly) is an end: a tie with an interior hole is refused;
 *     a tie between the two ends grows at V₀;
 *  2. the new segment turns back on the end segment by at most 120° (between the holes' centres), and away from the
 *     shared vertex (beyond the clearance) neither its tiles nor its margin's to come cross the line's or come within
 *     the clearance of them (between tile centres), the far end's margin included;
 *  3. `p` is at least HOLE_GAP_2D from every hole;
 *  4. `p` is open ground (`open`): in a game, the plane's main open ground (oneWorld.ts mainGround: the open region
 *     the world's holes share, not a pocket closed in by rock; owner, 2026-11-10, PR #62 review D1).
 * They are checked 1, 3, 4, 2: the cheap ones first, and a spot crowding a hole is refused for that ("hole-gap"), not
 * for the turn its nearness makes.
 */
export function canFound(t: Transect, p: Cell, open: (x: number, y: number) => boolean): FoundCheck {
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
  const folded = fold(t, end, end === "start" ? h[0]! : h[k]!, p);
  return folded ? { ok: false, reason: folded } : { ok: true, end };
}

const rounds = new Map<string, Int16Array>();

/**
 * Offsets (dx, dy pairs, flat) of every cell whose centre is within `radius` (world units) of a cell's on an even
 * (parity 0) or odd row (`strict`: nearer than it), nearest first, ties in discOffsets' order: a round disc, not a
 * hexagon of steps. Cached.
 */
function roundDisc(radius: number, parity: number, strict = false): Int16Array {
  const key = `${radius}:${parity}:${strict}`;
  const have = rounds.get(key);
  if (have) return have;
  // A cell `radius` away is at most radius·2/√3 steps away (the long way round a hexagon).
  const offs = discOffsets(Math.ceil((radius * 2) / Math.sqrt(3)))[parity]!;
  const limit = 4 * radius * radius;
  const order: [number, number][] = [];
  for (let i = 0; i < offs.length; i += 2) {
    const d = dist4(offs[i]!, parity + offs[i + 1]!, 0, parity);
    if (strict ? d < limit : d <= limit) order.push([d, i]);
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
export function nearestValid(
  t: Transect,
  p: Cell,
  radius: number,
  open: (x: number, y: number) => boolean,
): { cell: Cell; end: End } | null {
  const offs = roundDisc(radius, p.y & 1);
  for (let i = 0; i < offs.length; i += 2) {
    const cell = { x: p.x + offs[i]!, y: p.y + offs[i + 1]! };
    const f = canFound(t, cell, open);
    if (f.ok) return { cell, end: f.end };
  }
  return null;
}
