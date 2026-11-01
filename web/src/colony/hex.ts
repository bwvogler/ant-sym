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
  return x + (NX[((y & 1) * 6) + d] as number);
}

/** The y of cell (x, y)'s neighbour the way `d` (0–5). */
export function ny(y: number, d: number): number {
  return y + (NY[d] as number);
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
  const fq = px - 0.5 - fr / 2;
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
  const aq = ax - ((ay - (ay & 1)) >> 1);
  const bq = bx - ((by - (by & 1)) >> 1);
  const dq = aq - bq;
  const dr = ay - by;
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
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
