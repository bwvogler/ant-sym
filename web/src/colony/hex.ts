// The colony's grid, pure: pointy-top hexagons in "odd-r" offset rows. A
// cell is still two integers (x, y) in the 64×64 chunks (64 is even, so a
// row's parity is the same in a chunk as on the map), but every odd row sits
// half a cell to the right, so each cell has six neighbours, all sharing an
// edge and all the same distance away. Positions (ants, sensors, the nest)
// are in world units: neighbouring centres are 1 apart, rows R = √3/2 apart.
// (Coordinates after Red Blob Games' hex grid guide.)

/** Distance between rows of centres. */
export const R = Math.sqrt(3) / 2;
/** Centre to corner of a hexagon (its circumradius). */
export const SIDE = 1 / Math.sqrt(3);

/** The six ways, clockwise from east (y grows down): east, south-east, south-west, west, north-west, north-east. */
export const E = 0;
export const SE = 1;
export const SW = 2;
export const W = 3;
export const NW = 4;
export const NE = 5;
/** The angle of each way, in radians. */
export const DIR_ANGLE = [0, 1, 2, 3, 4, 5].map((d) => (d * Math.PI) / 3);

/** Neighbour offsets by way, for even rows (index d) and odd rows (index 6 + d). */
const NX = [1, 0, -1, -1, -1, 0, 1, 1, 0, -1, 0, 1];
const NY = [0, 1, 1, 0, -1, -1];

/** The x of cell (x, y)'s neighbour the way `d` (0–5). */
export function nx(x: number, y: number, d: number): number {
  return x + NX[(y & 1) * 6 + d];
}

/** The y of cell (x, y)'s neighbour the way `d` (0–5). */
export function ny(y: number, d: number): number {
  return y + NY[d];
}

/** The world x of cell (x, y)'s centre. */
export function centreX(x: number, y: number): number {
  return x + 0.5 + 0.5 * (y & 1);
}

/** The world y of row y's centres. */
export function centreY(y: number): number {
  return (y + 0.5) * R;
}

/** The cell a world position lies in, written to CELL[0] (x) and CELL[1] (y): no allocation, it runs for every sensor of every ant. */
export const CELL = new Int32Array(2);

/** Find the cell at world (px, py): into CELL. Cube rounding of the fractional axial coordinates. */
export function cellOf(px: number, py: number): void {
  const fr = py / R - 0.5;
  cubeRound(px - 0.5 - fr / 2, fr);
}

/** The axial q of cell (x, y): its column with the rows' half-cell shift taken out. */
function axialQ(x: number, y: number): number {
  return x - ((y - (y & 1)) >> 1);
}

/** The cell nearest fractional axial (fq, fr): into CELL. Round all three cube coordinates, then mend the worst. */
function cubeRound(fq: number, fr: number): void {
  const fs = -fq - fr;
  let q = Math.round(fq);
  let r = Math.round(fr);
  const s = Math.round(fs);
  const dq = Math.abs(q - fq);
  const dr = Math.abs(r - fr);
  const ds = Math.abs(s - fs);
  if (dq > dr && dq > ds) q = -r - s;
  else if (dr > ds) r = -q - s;
  CELL[0] = q + ((r - (r & 1)) >> 1);
  CELL[1] = r;
}

/** The way (0–5) nearest heading h. */
export function dirOf(h: number): number {
  const k = Math.round(h / (Math.PI / 3)) % 6;
  return k < 0 ? k + 6 : k;
}

/** Steps between two cells. */
export function hexDistance(ax: number, ay: number, bx: number, by: number): number {
  const aq = axialQ(ax, ay);
  const bq = axialQ(bx, by);
  const dq = aq - bq;
  const dr = ay - by;
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
}

/**
 * The cells of the straight line from cell (ax, ay) to cell (bx, by), both included, as flat x, y pairs: one cell per
 * step, so `hexDistance + 1` cells and each a neighbour of the last. A lerp in cube coordinates, rounded (Red Blob Games'
 * line drawing), with the same small nudge on both ends, so a line along cell edges always rounds the same way and the
 * line from b to a is the line from a to b reversed.
 */
export function hexLine(ax: number, ay: number, bx: number, by: number): Int32Array {
  const n = hexDistance(ax, ay, bx, by);
  const out = new Int32Array(2 * (n + 1));
  const aq = axialQ(ax, ay) + 1e-6;
  const ar = ay + 2e-6;
  const bq = axialQ(bx, by) + 1e-6;
  const br = by + 2e-6;
  for (let i = 0; i <= n; i++) {
    const t = n === 0 ? 0 : i / n;
    cubeRound(aq + (bq - aq) * t, ar + (br - ar) * t);
    out[2 * i] = CELL[0]!;
    out[2 * i + 1] = CELL[1]!;
  }
  return out;
}

/** 2 × the world x of cell (x, y)'s centre: a whole number, so the straight line's band can be tested exactly. */
const x2 = (x: number, y: number): number => 2 * x + 1 + (y & 1);

/**
 * The way (0–5) nearest the direction (dX2, dY), in half-cells across and rows down (2 × world x, world y ÷ R): the one
 * whose unit step has the largest dot product with it, 4 × which is a whole number for each way. A tie (a direction
 * exactly between two ways) goes to the clockwise one, the same way round in every direction, so the way always lies in
 * (θ − 30°, θ + 30°]: at a hole, the runs in and out then differ by less than the turn + 60°, so at most 120° (transect.ts).
 * (hexRuns is reversible by its orientation swap, not by this.)
 */
function nearestWay(dX2: number, dY: number): number {
  const dots = [2 * dX2, dX2 + 3 * dY, -dX2 + 3 * dY, -2 * dX2, -dX2 - 3 * dY, dX2 - 3 * dY];
  const top = Math.max(...dots);
  // Of two tied ways (always neighbours), the clockwise one: the one whose anticlockwise neighbour also ties.
  for (let d = 0; d < 6; d++) if (dots[d] === top && dots[(d + 5) % 6] === top) return d;
  return dots.indexOf(top);
}

/**
 * One half of hexRuns: `steps` steps from cell (sx, sy) toward cell (tx, ty), written to `out` from pair index i0 on, by
 * `di` (+1 forward, −1 backward). Every step cuts the distance to the target by one (a geodesic). It starts along `way`
 * and keeps on while the next centre stays within the band of the straight line (`off` false), else takes the other way
 * that cuts the distance. With both outside, the one nearer the line: defensive, since at a band of 1 or more one of the
 * two always stays within it (measured at 3: no tile ever lies past the band, PR #129 review).
 */
function runHalf(
  out: Int32Array,
  i0: number,
  di: number,
  sx: number,
  sy: number,
  tx: number,
  ty: number,
  steps: number,
  way: number,
  off: (x: number, y: number) => number,
): void {
  let x = sx;
  let y = sy;
  out[2 * i0] = x;
  out[2 * i0 + 1] = y;
  for (let j = 1; j <= steps; j++) {
    const left = hexDistance(x, y, tx, ty) - 1;
    let pick = -1;
    let pickOff = Infinity;
    // The way we are going first, then the others in order: the first within the band wins; else the least outside.
    for (let k = 0; k < 6; k++) {
      const d = (way + k) % 6;
      const qx = nx(x, y, d);
      const qy = ny(y, d);
      if (hexDistance(qx, qy, tx, ty) !== left) continue;
      const o = off(qx, qy);
      if (o <= 0) {
        pick = d;
        break;
      }
      if (o < pickOff) {
        pick = d;
        pickOff = o;
      }
    }
    way = pick;
    x = nx(x, y, way);
    y = ny(y, way);
    out[2 * (i0 + di * j)] = x;
    out[2 * (i0 + di * j) + 1] = y;
  }
}

/**
 * The cells of a path of straight runs from cell (ax, ay) to cell (bx, by), both included, as flat x, y pairs: like
 * hexLine, `hexDistance + 1` cells, each a neighbour of the last (a shortest path), but stepping only along the two ways
 * either side of the straight line and turning only when the next centre would lie more than `band` (world units) off it,
 * so it goes in long runs with occasional turns instead of hexLine's zigzag. Both ends leave along the way nearest the
 * straight line (nearestWay; on a path of 3 steps or more: at 2 the middle cell can decide a tie): the path is built as
 * two halves, from each end to hexLine's middle cell, which lies on a shortest path. The band is tested in whole numbers, so a path is the same on every machine; the path from b to a is
 * the path from a to b reversed.
 */
export function hexRuns(ax: number, ay: number, bx: number, by: number, band: number): Int32Array {
  // One orientation computes, the other reverses it: the middle cell (and so the path) is the same both ways.
  if (by < ay || (by === ay && bx < ax)) {
    const fwd = hexRuns(bx, by, ax, ay, band);
    const out = new Int32Array(fwd.length);
    for (let i = 0; i < fwd.length; i += 2) {
      out[i] = fwd[fwd.length - 2 - i]!;
      out[i + 1] = fwd[fwd.length - 1 - i]!;
    }
    return out;
  }
  const n = hexDistance(ax, ay, bx, by);
  const out = new Int32Array(2 * (n + 1));
  const dX2 = x2(bx, by) - x2(ax, ay);
  const dY = by - ay;
  // A centre (x, y) is off by k·R/2 across the line, k = dX2·(y − ay) − dY·(x2 − x2a); more than `band` off when
  // 3k² > 4·band²·(dX2² + 3·dY²). `off` gives how far past the band, in those units (0 or less: within it).
  const limit = 4 * band * band * (dX2 * dX2 + 3 * dY * dY);
  const ax2 = x2(ax, ay);
  const off = (x: number, y: number): number => {
    const k = dX2 * (y - ay) - dY * (x2(x, y) - ax2);
    return 3 * k * k - limit;
  };
  const mid = hexLine(ax, ay, bx, by);
  const h = n >> 1;
  const mx = mid[2 * h]!;
  const my = mid[2 * h + 1]!;
  const way = nearestWay(dX2, dY);
  runHalf(out, 0, 1, ax, ay, mx, my, h, way, off);
  runHalf(out, n, -1, bx, by, mx, my, n - h, (way + 3) % 6, off);
  return out;
}

const discs = new Map<number, Int16Array[]>();

/**
 * Offsets (dx, dy pairs, flat) of every cell within `radius` steps of a cell, for an even row ([0]) and an odd
 * row ([1]); the centre first, then outward. Cached: windows round an ant (enemies, fights) use these.
 */
export function discOffsets(radius: number): Int16Array[] {
  const have = discs.get(radius);
  if (have) return have;
  const out = [0, 1].map((parity) => {
    const cells: [number, number, number][] = [];
    for (let dy = -radius; dy <= radius; dy++)
      for (let dx = -radius - 1; dx <= radius + 1; dx++) {
        const d = hexDistance(0, parity, dx, parity + dy);
        if (d <= radius) cells.push([d, dx, dy]);
      }
    cells.sort((a, b) => a[0] - b[0]);
    return Int16Array.from(cells.flatMap(([, dx, dy]) => [dx, dy]));
  });
  discs.set(radius, out);
  return out;
}

/** The six corners of the hexagon centred at (cx, cy), scaled by `s` (world → screen), as flat x, y pairs: pointy top. */
export function corners(cx: number, cy: number, s: number): number[] {
  const out: number[] = [];
  for (let k = 0; k < 6; k++) {
    const a = Math.PI / 6 + (k * Math.PI) / 3;
    out.push(cx + Math.cos(a) * SIDE * s, cy + Math.sin(a) * SIDE * s);
  }
  return out;
}

/** World extent of a map of `w` × `h` cells: the rows' half-cell shift, and the row spacing. */
export function extent(w: number, h: number): { w: number; h: number } {
  return { w: w + 0.5, h: h * R + (SIDE - R / 2) };
}
