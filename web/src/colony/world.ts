// The colonies' world, pure: a procedural map from a seed. Rock from two
// octaves of value noise, the player's nest with the rock cleared around it,
// a rival nest as far away as the ground allows, and food patches placed
// only where an ant can walk to them from the nests. Positions
// are in cell units, (0,0) top-left, like the picture sim.

export interface WorldSize {
  w: number;
  h: number;
}

export interface Nest {
  x: number;
  y: number;
  r: number;
}

export interface WorldMap {
  size: WorldSize;
  seed: number;
  /** 1 = rock: ants cannot enter it and pheromone does not spread into it */
  rock: Uint8Array;
  /** food units left per cell */
  food: Float32Array;
  /** the player's nest (nests[0]) */
  nest: Nest;
  /** every nest: the player's first, then the rival's, reachable from each other */
  nests: Nest[];
  /** food units placed at generation */
  foodTotal: number;
}

export interface WorldOptions {
  size: WorldSize;
  /** share of the map that is rock, roughly */
  rockiness: number;
  patches: number;
  /** food units in each cell of a patch */
  foodPerCell: number;
}

export const DEFAULT_WORLD: WorldOptions = { size: { w: 160, h: 100 }, rockiness: 0.22, patches: 6, foodPerCell: 12 };

/** Small, fast, seedable: the same seed is the same world on every machine. */
export function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Value noise in 0..1: random values on a lattice `cell` cells apart, smoothstep-interpolated. */
export function valueNoise(size: WorldSize, cell: number, rng: () => number): Float32Array {
  const gw = Math.ceil(size.w / cell) + 2;
  const gh = Math.ceil(size.h / cell) + 2;
  const lattice = Float32Array.from({ length: gw * gh }, () => rng());
  const out = new Float32Array(size.w * size.h);
  const smooth = (t: number) => t * t * (3 - 2 * t);
  for (let y = 0; y < size.h; y++) {
    const gy = y / cell;
    const y0 = Math.floor(gy);
    const ty = smooth(gy - y0);
    for (let x = 0; x < size.w; x++) {
      const gx = x / cell;
      const x0 = Math.floor(gx);
      const tx = smooth(gx - x0);
      const a = lattice[y0 * gw + x0] as number;
      const b = lattice[y0 * gw + x0 + 1] as number;
      const c = lattice[(y0 + 1) * gw + x0] as number;
      const d = lattice[(y0 + 1) * gw + x0 + 1] as number;
      out[y * size.w + x] = (a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty;
    }
  }
  return out;
}

/** Cells reachable on foot from (x, y), 4-connected through open ground. */
export function reachable(size: WorldSize, rock: Uint8Array, x: number, y: number): Uint8Array {
  const seen = new Uint8Array(size.w * size.h);
  const start = Math.floor(y) * size.w + Math.floor(x);
  if (rock[start]) return seen;
  const queue = new Int32Array(size.w * size.h);
  let head = 0;
  let tail = 0;
  queue[tail++] = start;
  seen[start] = 1;
  while (head < tail) {
    const c = queue[head++] as number;
    const cx = c % size.w;
    const cy = (c - cx) / size.w;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= size.w || ny >= size.h) continue;
      const n = ny * size.w + nx;
      if (seen[n] || rock[n]) continue;
      seen[n] = 1;
      queue[tail++] = n;
    }
  }
  return seen;
}

function disc(size: WorldSize, cx: number, cy: number, r: number, fn: (i: number) => void): void {
  for (let y = Math.max(0, Math.floor(cy - r)); y <= Math.min(size.h - 1, Math.ceil(cy + r)); y++)
    for (let x = Math.max(0, Math.floor(cx - r)); x <= Math.min(size.w - 1, Math.ceil(cx + r)); x++) if (Math.hypot(x + 0.5 - cx, y + 0.5 - cy) <= r) fn(y * size.w + x);
}

export function generateWorld(seed: number, opts: Partial<WorldOptions> = {}): WorldMap {
  const o = { ...DEFAULT_WORLD, ...opts };
  const { size } = o;
  const rng = mulberry32(seed);
  const coarse = valueNoise(size, 18, rng);
  const fine = valueNoise(size, 6, rng);
  const height = coarse.map((v, i) => 0.7 * v + 0.3 * (fine[i] as number));
  // The threshold that makes `rockiness` of the map rock.
  const sorted = Float32Array.from(height).sort();
  const cut = sorted[Math.floor((1 - o.rockiness) * (sorted.length - 1))] as number;
  const rock = Uint8Array.from(height, (v) => (v > cut ? 1 : 0));

  // Nest somewhere in the middle half, on open ground joined to most of the map
  // (a spot inside a rock blob, cleared, would be a sealed pocket).
  let open = 0;
  for (const r of rock) open += r ? 0 : 1;
  let nest = { x: size.w / 2, y: size.h / 2, r: 3 };
  let best = -1;
  for (let tries = 0; tries < 60; tries++) {
    const x = size.w * (0.3 + 0.4 * rng());
    const y = size.h * (0.3 + 0.4 * rng());
    if (rock[Math.floor(y) * size.w + Math.floor(x)]) continue;
    let count = 0;
    for (const v of reachable(size, rock, x, y)) count += v;
    if (count > best) {
      best = count;
      nest = { x, y, r: 3 };
    }
    if (count > open * 0.6) break;
  }
  disc(size, nest.x, nest.y, nest.r + 4, (i) => (rock[i] = 0));

  // The rival's nest: of a few hundred spots the player's ants can walk to, the farthest from home.
  let reach = reachable(size, rock, nest.x, nest.y);
  let rival = { x: size.w - nest.x, y: size.h - nest.y, r: 3 };
  let far = -1;
  for (let tries = 0; tries < 400; tries++) {
    const x = 6 + rng() * (size.w - 12);
    const y = 6 + rng() * (size.h - 12);
    const d = Math.hypot(x - nest.x, y - nest.y);
    if (!reach[Math.floor(y) * size.w + Math.floor(x)] || d <= far) continue;
    far = d;
    rival = { x, y, r: 3 };
  }
  disc(size, rival.x, rival.y, rival.r + 4, (i) => (rock[i] = 0));
  const nests = [nest, rival];

  // Food patches: far enough from every nest to need a trail, only where an ant can walk.
  const food = new Float32Array(size.w * size.h);
  reach = reachable(size, rock, nest.x, nest.y);
  const minDist = Math.min(size.w, size.h) * 0.25;
  let placed = 0;
  for (let tries = 0; placed < o.patches && tries < 2000; tries++) {
    const x = rng() * size.w;
    const y = rng() * size.h;
    const c = Math.floor(y) * size.w + Math.floor(x);
    if (!reach[c] || nests.some((n) => Math.hypot(x - n.x, y - n.y) < minDist)) continue;
    const r = 2 + rng() * 2;
    disc(size, x, y, r, (i) => {
      rock[i] = 0;
      food[i] = o.foodPerCell;
    });
    placed++;
  }
  // Clearing rock under a patch can open new ground but never closes any; food stays reachable.
  reach = reachable(size, rock, nest.x, nest.y);
  let foodTotal = 0;
  for (let i = 0; i < food.length; i++) {
    if (!reach[i]) food[i] = 0;
    foodTotal += food[i] as number;
  }
  return { size, seed, rock, food, nest, nests, foodTotal };
}

/** Rock or off the map. */
export function blocked(map: WorldMap, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= map.size.w || y >= map.size.h) return true;
  return map.rock[Math.floor(y) * map.size.w + Math.floor(x)] === 1;
}
