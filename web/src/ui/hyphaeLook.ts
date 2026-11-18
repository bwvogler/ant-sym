// How the mycelium's hyphae are drawn (owner, 2026-11-16: "more squiggly, not so angular and straight; the more chaotic the
// nicer; branch a lot more like real life"). Drawing only: the cells, their parents and the sim stay as they are, so the golden
// masters and the P1 numbers do not move.
//
// - **Wander.** Every point is bent by one smooth, seeded warp of the world (a few octaves of value noise). It depends on the
//   point's place alone, so a cell never moves as the mycelium grows, and cells that share an edge or a branch point bend alike and
//   stay joined.
// - **Curves.** A run of cells between two branch points is drawn as one spline through its bent centres, not hex to hex.
// - **Fuzz.** Short twigs, some forked, off the thin hyphae at places and angles fixed by each cell's key: the look of a far denser
//   mycelium than the sim's one branch in seven cells, for nothing.

/** A hash of two integers and a salt, in [0, 1). */
export function hash(a: number, b: number, salt = 0): number {
  let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ Math.imul(salt | 0, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Smooth value noise in [-1, 1]: bilinear between lattice values, eased. */
export function noise(x: number, y: number, salt: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const u = fx * fx * (3 - 2 * fx);
  const v = fy * fy * (3 - 2 * fy);
  const a = hash(ix, iy, salt);
  const b = hash(ix + 1, iy, salt);
  const c = hash(ix, iy + 1, salt);
  const d = hash(ix + 1, iy + 1, salt);
  return (a + (b - a) * u + (c - a + (a - b - c + d) * u) * v) * 2 - 1;
}

/** The warp's octaves: frequency (per cell) and amplitude (cells). Slow, wide wanders and quicker small ones. */
const OCTAVES = [
  { f: 0.42, a: 0.42 },
  { f: 1.1, a: 0.25 },
  { f: 2.7, a: 0.11 },
] as const;

/** Where world point (x, y) is drawn: bent by the warp. Written to `out` (two numbers) to allocate nothing. */
export function wander(x: number, y: number, out: number[]): void {
  let dx = 0;
  let dy = 0;
  for (let o = 0; o < OCTAVES.length; o++) {
    const { f, a } = OCTAVES[o]!;
    dx += a * noise(x * f, y * f, 2 * o + 1);
    dy += a * noise(x * f + 37.2, y * f + 11.8, 2 * o + 2);
  }
  out[0] = x + dx;
  out[1] = y + dy;
}

/** The most the warp moves a point, in cells. */
export const MAX_WANDER = Math.SQRT2 * OCTAVES.reduce((s, o) => s + o.a, 0);

/** The minimum view of a path the helpers draw into (a Path2D has it). */
export interface PathLike {
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  bezierCurveTo(c1x: number, c1y: number, c2x: number, c2y: number, x: number, y: number): void;
  quadraticCurveTo(cx: number, cy: number, x: number, y: number): void;
}

/** A Catmull-Rom spline through the points (x0, y0, x1, y1, …), as cubic Béziers: it passes through every point. */
export function smoothThrough(path: PathLike, pts: readonly number[]): void {
  const n = pts.length / 2;
  if (n < 2) return;
  path.moveTo(pts[0]!, pts[1]!);
  for (let i = 0; i < n - 1; i++) {
    const i0 = Math.max(0, i - 1) * 2;
    const i1 = i * 2;
    const i2 = (i + 1) * 2;
    const i3 = Math.min(n - 1, i + 2) * 2;
    path.bezierCurveTo(
      pts[i1]! + (pts[i2]! - pts[i0]!) / 6,
      pts[i1 + 1]! + (pts[i2 + 1]! - pts[i0 + 1]!) / 6,
      pts[i2]! - (pts[i3]! - pts[i1]!) / 6,
      pts[i2 + 1]! - (pts[i3 + 1]! - pts[i1 + 1]!) / 6,
      pts[i2]!,
      pts[i2 + 1]!,
    );
  }
}

/** A run of cells between branch points (or a branch point and a tip), the first being where it leaves its parent. */
export interface Chain {
  /** the cell keys, first to last: the parent it leaves, then the cells it passes */
  cells: number[];
  /** a cord (a thick trunk) */
  cord: boolean;
}

/**
 * The chains of a hyphal tree: each run of cells that carries on one at a time, cut at every branch point and wherever the
 * cord status changes. `parent` maps a cell to the one it grew from (`none` for a root), as Hyphae.parent does.
 */
export function chainsOf(parent: ReadonlyMap<number, number>, cords: ReadonlySet<number>, none: number): Chain[] {
  const kids = new Map<number, number[]>();
  for (const [k, p] of parent)
    if (p !== none) {
      const a = kids.get(p);
      if (a) a.push(k);
      else kids.set(p, [k]);
    }
  /** the one cell `k` hands on to, if the run carries on through it */
  const onward = (k: number): number | undefined => {
    const c = kids.get(k);
    return c && c.length === 1 && cords.has(c[0]!) === cords.has(k) ? c[0] : undefined;
  };
  const out: Chain[] = [];
  for (const [k, p] of parent) {
    if (p === none) continue;
    // p hands this cell on (a run through p: p has a parent, this is its only child, and the cord status is the same)? Then it is in p's chain.
    const pp = parent.get(p);
    if (pp !== undefined && pp !== none && onward(p) === k) continue;
    const cells = [p, k];
    for (let c = onward(k); c !== undefined; c = onward(c)) cells.push(c);
    out.push({ cells, cord: cords.has(k) });
  }
  return out;
}

/**
 * The twigs of one cell of a thin hypha: up to one off each side, each a short curve (now and then forked), fixed by the cell's
 * key. `(x, y)` is the cell's drawn spot in px and `angle` the way the hypha runs there; `px` is a cell's size in px; `density` is
 * the chance of a twig on each side. Draws into `path`.
 */
export function twigsOf(path: PathLike, key: number, x: number, y: number, angle: number, px: number, density = 0.3): void {
  for (const side of [-1, 1] as const) {
    const salt = side < 0 ? 7 : 19;
    if (hash(key, 1, salt) >= density) continue;
    const theta = angle + side * (0.5 + 0.9 * hash(key, 3, salt));
    const len = px * (0.6 + 1.3 * hash(key, 4, salt));
    const bend = (hash(key, 5, salt) - 0.5) * 1.1 * len;
    const ex = x + Math.cos(theta) * len;
    const ey = y + Math.sin(theta) * len;
    const cx = (x + ex) / 2 - Math.sin(theta) * bend;
    const cy = (y + ey) / 2 + Math.cos(theta) * bend;
    path.moveTo(x, y);
    path.quadraticCurveTo(cx, cy, ex, ey);
    if (hash(key, 6, salt) < 0.4) {
      // a fork 60 % of the way along, leaning back out the way the twig bends
      const t = 0.6;
      const fx = (1 - t) * (1 - t) * x + 2 * (1 - t) * t * cx + t * t * ex;
      const fy = (1 - t) * (1 - t) * y + 2 * (1 - t) * t * cy + t * t * ey;
      const phi = theta - side * (0.5 + 0.6 * hash(key, 8, salt));
      path.moveTo(fx, fy);
      path.lineTo(fx + Math.cos(phi) * len * 0.55, fy + Math.sin(phi) * len * 0.55);
    }
  }
}
