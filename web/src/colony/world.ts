import { CHUNK, CHUNK_BITS, ChunkLayer, local } from "./chunks.ts";

// The colonies' world, pure: a procedural map from a seed, kept in 64×64
// chunks (chunks.ts). Rock comes from three octaves of hashed value noise:
// every cell's height is a pure function of (seed, x, y), so any chunk can be
// generated on its own, in any order, with the same result. That is what lets
// the map grow later without regenerating what exists. Rock is a fixed
// height threshold, calibrated once so about `rockiness` of the ground is
// rock. On top: the player's nest on open ground joined to most of the map,
// rival nests a walk away, and food patches placed chunk by chunk only where
// an ant can walk to them. Positions are in cell units, (0,0) top-left, like
// the picture sim. The map is finite for now: `size` from (0,0).
//
// Underground (the default): most ground is diggable soil, with small open
// chambers and some undiggable rock. Each cell of the `rock` layer is OPEN,
// ROCK or SOIL; both solids block ants and scent, and ants dig soil open
// (colony.ts). `OPEN_WORLD` is the old surface map: no soil, more rock.

export interface WorldSize {
  w: number;
  h: number;
}

export interface Nest {
  x: number;
  y: number;
  r: number;
}

/** What a cell of the terrain (`WorldMap.rock`) holds. */
export const OPEN = 0;
export const ROCK = 1;
export const SOIL = 2;
export type Terrain = typeof OPEN | typeof ROCK | typeof SOIL;

export interface WorldMap {
  size: WorldSize;
  seed: number;
  /** the terrain, per cell: OPEN, ROCK (never dug) or SOIL (ants dig it open); solids block ants and scent; ungenerated ground reads as rock */
  rock: ChunkLayer<Uint8Array>;
  /** food units left per cell; change it through takeFood / dropFood so foodLeft stays true */
  food: ChunkLayer<Float32Array>;
  /** the player's nest (nests[0]) */
  nest: Nest;
  /** every nest: the player's first, then the rivals', reachable from each other */
  nests: Nest[];
  /** food units placed at generation */
  foodTotal: number;
  /** food units on the map now */
  foodLeft: number;
  /** soil cells dug open since generation */
  dug: number;
}

export interface WorldOptions {
  size: WorldSize;
  /** share of the ground that is rock, roughly (a fixed height threshold, so it varies a little by seed) */
  rockiness: number;
  /** food patches per 64×64 chunk, on average */
  patchesPerChunk: number;
  /** food units in each cell of a patch */
  foodPerCell: number;
  /** nests on the map: the player's and the rivals' */
  nestCount: number;
  /** cells between neighbouring nests that the placement aims for */
  nestGap: number;
  /** no food patch closer than this to a nest, in cells */
  foodMinDist: number;
  /** share of the ground that isn't rock that is diggable soil (0 = the open surface map) */
  soil: number;
}

/** Underground: ~12 % rock, ~70 % soil, small open chambers (~18 %); ants dig. Food lies in more, nearer pockets than on the surface, since every way to it is dug. */
export const DEFAULT_WORLD: WorldOptions = { size: { w: 512, h: 320 }, rockiness: 0.12, patchesPerChunk: 2.5, foodPerCell: 12, nestCount: 2, nestGap: 140, foodMinDist: 16, soil: 0.8 };

/** The open surface map (before digging): ~22 % rock, no soil. */
export const OPEN_WORLD: Partial<WorldOptions> = { rockiness: 0.22, soil: 0, patchesPerChunk: 1.5, foodMinDist: 24 };

/** Small, fast, seedable: the same seed is the same sequence on every machine. */
export function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function mix(h: number): number {
  h ^= h >>> 16;
  h = Math.imul(h, 0x7feb352d);
  h ^= h >>> 15;
  h = Math.imul(h, 0x846ca68b);
  h ^= h >>> 16;
  return h >>> 0;
}

/** A well-mixed 32-bit hash of four integers: position-pure randomness. */
export function hash4(a: number, b: number, c: number, d: number): number {
  let h = mix((a | 0) ^ 0x9e3779b9);
  h = mix(h ^ (b | 0));
  h = mix(h + Math.imul(c | 0, 0x85ebca6b));
  return mix(h ^ Math.imul(d | 0, 0xc2b2ae35));
}

/** The same, in 0..1. */
export function hash01(a: number, b: number, c: number, d: number): number {
  return hash4(a, b, c, d) / 4294967296;
}

const smooth = (t: number) => t * t * (3 - 2 * t);

/** Value noise in 0..1 at cell (x, y): hashed values on a lattice `cell` cells apart, smoothstep-interpolated. `salt` picks an independent lattice. */
export function noiseAt(seed: number, salt: number, x: number, y: number, cell: number): number {
  const gx = x / cell;
  const gy = y / cell;
  const x0 = Math.floor(gx);
  const y0 = Math.floor(gy);
  const tx = smooth(gx - x0);
  const ty = smooth(gy - y0);
  const a = hash01(seed, salt, x0, y0);
  const b = hash01(seed, salt, x0 + 1, y0);
  const c = hash01(seed, salt, x0, y0 + 1);
  const d = hash01(seed, salt, x0 + 1, y0 + 1);
  return (a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty;
}

/** Ground height at cell (x, y): blobs of rock (18 cells), rough edges (6), and broad rocky or open regions (80). */
export function heightAt(seed: number, x: number, y: number): number {
  return 0.5 * noiseAt(seed, 1, x, y, 18) + 0.25 * noiseAt(seed, 2, x, y, 6) + 0.25 * noiseAt(seed, 3, x, y, 80);
}

const cuts = new Map<number, number>();

/** The height above which ground is rock, so that about `rockiness` of all ground is: sampled once from a fixed spread of seeds and places. */
export function rockCut(rockiness: number): number {
  const have = cuts.get(rockiness);
  if (have !== undefined) return have;
  const sample: number[] = [];
  for (let s = 1; s <= 12; s++) for (let y = 0; y < 96; y++) for (let x = 0; x < 96; x++) sample.push(heightAt(s * 7919, x * 5 + s * 1013, y * 5 - s * 577));
  sample.sort((a, b) => a - b);
  const cut = sample[Math.floor((1 - rockiness) * (sample.length - 1))] as number;
  cuts.set(rockiness, cut);
  return cut;
}

/** How open ground is at cell (x, y) underground: low values are soil, high values open chambers (~10-cell blobs with rough edges). */
export function chamberAt(seed: number, x: number, y: number): number {
  return 0.65 * noiseAt(seed, 4, x, y, 10) + 0.35 * noiseAt(seed, 5, x, y, 4);
}

const soilCuts = new Map<number, number>();

/** The chamber value below which ground is soil, so that about `soil` of it is: sampled once, like rockCut. */
export function soilCut(soil: number): number {
  const have = soilCuts.get(soil);
  if (have !== undefined) return have;
  const sample: number[] = [];
  for (let s = 1; s <= 12; s++) for (let y = 0; y < 96; y++) for (let x = 0; x < 96; x++) sample.push(chamberAt(s * 7919, x * 5 + s * 1013, y * 5 - s * 577));
  sample.sort((a, b) => a - b);
  const cut = soil <= 0 ? -Infinity : (sample[Math.min(sample.length - 1, Math.floor(soil * (sample.length - 1)))] as number);
  soilCuts.set(soil, cut);
  return cut;
}

/** Chunk (cx, cy)'s terrain, from the seed alone: ROCK above the height cut, else SOIL below the chamber cut, else OPEN. */
export function chunkRock(seed: number, cx: number, cy: number, cut: number, soil = -Infinity): Uint8Array {
  const rock = new Uint8Array(CHUNK * CHUNK);
  const x0 = cx << CHUNK_BITS;
  const y0 = cy << CHUNK_BITS;
  for (let ly = 0; ly < CHUNK; ly++)
    for (let lx = 0; lx < CHUNK; lx++) {
      const x = x0 + lx;
      const y = y0 + ly;
      rock[local(lx, ly)] = heightAt(seed, x, y) > cut ? ROCK : soil > -Infinity && chamberAt(seed, x, y) < soil ? SOIL : OPEN;
    }
  return rock;
}

export function inBounds(map: WorldMap, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < map.size.w && y < map.size.h;
}

/** The terrain at integer cell (x, y): OPEN, ROCK or SOIL; off the map is rock. Non-zero = solid. */
export function rockAt(map: WorldMap, x: number, y: number): number {
  return x < 0 || y < 0 || x >= map.size.w || y >= map.size.h ? ROCK : map.rock.get(x, y);
}

/** Solid (rock, soil or off the map), at a position in cells. */
export function blocked(map: WorldMap, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= map.size.w || y >= map.size.h) return true;
  return map.rock.get(Math.floor(x), Math.floor(y)) !== OPEN;
}

/** Diggable soil at a position in cells. */
export function soilAt(map: WorldMap, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= map.size.w || y >= map.size.h) return false;
  return map.rock.get(Math.floor(x), Math.floor(y)) === SOIL;
}

/** Dig the soil cell under (x, y) open; false if it isn't soil. */
export function dig(map: WorldMap, x: number, y: number): boolean {
  if (!soilAt(map, x, y)) return false;
  map.rock.set(Math.floor(x), Math.floor(y), OPEN);
  map.dug++;
  return true;
}

/** Food units in the cell under (x, y). */
export function foodAt(map: WorldMap, x: number, y: number): number {
  return map.food.get(Math.floor(x), Math.floor(y));
}

/** Take one unit of food from the cell under (x, y), if there is any. */
export function takeFood(map: WorldMap, x: number, y: number): boolean {
  const cx = Math.floor(x);
  const cy = Math.floor(y);
  const v = map.food.get(cx, cy);
  if (v <= 0) return false;
  const left = Math.max(0, v - 1);
  map.food.set(cx, cy, left);
  map.foodLeft -= v - left;
  return true;
}

/** Put `amount` food on the cell under (x, y). */
export function dropFood(map: WorldMap, x: number, y: number, amount: number): void {
  const cx = Math.floor(x);
  const cy = Math.floor(y);
  if (!inBounds(map, cx, cy)) return;
  map.food.set(cx, cy, map.food.get(cx, cy) + amount);
  map.foodLeft += amount;
}

/** Set rock at integer cell (x, y). */
export function setRock(map: WorldMap, x: number, y: number, v: Terrain): void {
  if (inBounds(map, x, y)) map.rock.set(x, y, v);
}

/** Empty layers for a finite map: every chunk it touches allocated, cells past its edge rock. */
function blankLayers(size: WorldSize): { rock: ChunkLayer<Uint8Array>; food: ChunkLayer<Float32Array> } {
  const rock = new ChunkLayer((n) => new Uint8Array(n), 1);
  const food = new ChunkLayer((n) => new Float32Array(n), 0);
  for (let cy = 0; cy < Math.ceil(size.h / CHUNK); cy++)
    for (let cx = 0; cx < Math.ceil(size.w / CHUNK); cx++) {
      const r = rock.ensure(cx, cy);
      for (let ly = 0; ly < CHUNK; ly++) for (let lx = 0; lx < CHUNK; lx++) r[local(lx, ly)] = (cx << CHUNK_BITS) + lx < size.w && (cy << CHUNK_BITS) + ly < size.h ? 0 : 1;
      food.ensure(cx, cy);
    }
  return { rock, food };
}

/** A map from flat row-major arrays (tests, small hand-made fields): rock and food default to none. */
export function worldFromArrays(size: WorldSize, nests: Nest[], opts: { rock?: ArrayLike<number>; food?: ArrayLike<number>; seed?: number } = {}): WorldMap {
  const { rock, food } = blankLayers(size);
  let total = 0;
  for (let y = 0; y < size.h; y++)
    for (let x = 0; x < size.w; x++) {
      const i = y * size.w + x;
      const t = opts.rock?.[i];
      if (t) rock.set(x, y, t); // 1 = rock, 2 = soil
      const f = opts.food?.[i] ?? 0;
      if (f) {
        food.set(x, y, f);
        total += f;
      }
    }
  return { size, seed: opts.seed ?? 0, rock, food, nest: nests[0]!, nests, foodTotal: total, foodLeft: total, dug: 0 };
}

/** A layer as a flat row-major array over the map (tests, the reachability oracle). */
export function flat<A extends Uint8Array | Float32Array>(map: WorldMap, layer: ChunkLayer<A>, make: (n: number) => A): A {
  const { w, h } = map.size;
  const out = make(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) out[y * w + x] = layer.get(x, y);
  return out;
}

const STEPS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

/** How a search may pass: "open" ground only (walking), or "diggable" (open or soil: anywhere but rock). */
export type Through = "open" | "diggable";

function passable(map: WorldMap, x: number, y: number, through: Through): boolean {
  const t = rockAt(map, x, y);
  return through === "open" ? t === OPEN : t !== ROCK;
}

/** Cells reachable from (x, y), 4-connected (walking through open ground, or digging through soil too), as a flat array over the map: the whole-map oracle. */
export function reachable(map: WorldMap, x: number, y: number, through: Through = "open"): Uint8Array {
  const { w, h } = map.size;
  const seen = new Uint8Array(w * h);
  const sx = Math.floor(x);
  const sy = Math.floor(y);
  if (!passable(map, sx, sy, through)) return seen;
  const queue = new Int32Array(w * h);
  let head = 0;
  let tail = 0;
  queue[tail++] = sy * w + sx;
  seen[sy * w + sx] = 1;
  while (head < tail) {
    const c = queue[head++] as number;
    const cx = c % w;
    const cy = (c - cx) / w;
    for (const [dx, dy] of STEPS) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const n = ny * w + nx;
      if (seen[n] || !passable(map, nx, ny, through)) continue;
      seen[n] = 1;
      queue[tail++] = n;
    }
  }
  return seen;
}

/**
 * Whether an ant at (x, y) can walk at least `radius` cells away: a bounded search that never looks
 * at the whole map, so it works on a map of any size. A spot that escapes is on the main ground,
 * not in a pocket sealed by rock.
 */
export function escapes(map: WorldMap, x: number, y: number, radius: number, through: Through = "open"): boolean {
  const sx = Math.floor(x);
  const sy = Math.floor(y);
  if (!passable(map, sx, sy, through)) return false;
  const side = 2 * radius + 1;
  const seen = new Uint8Array(side * side);
  const queue = new Int32Array(side * side);
  let head = 0;
  let tail = 0;
  const at = (dx: number, dy: number) => (dy + radius) * side + (dx + radius);
  queue[tail++] = at(0, 0);
  seen[at(0, 0)] = 1;
  while (head < tail) {
    const c = queue[head++] as number;
    const dx = (c % side) - radius;
    const dy = Math.floor(c / side) - radius;
    for (const [ox, oy] of STEPS) {
      const nx = dx + ox;
      const ny = dy + oy;
      if (Math.max(Math.abs(nx), Math.abs(ny)) >= radius) {
        if (passable(map, sx + nx, sy + ny, through)) return true;
        continue;
      }
      const n = at(nx, ny);
      if (seen[n] || !passable(map, sx + nx, sy + ny, through)) continue;
      seen[n] = 1;
      queue[tail++] = n;
    }
  }
  return false;
}

/** Visit every cell within `r` of (cx, cy) on the map. */
function disc(map: WorldMap, cx: number, cy: number, r: number, fn: (x: number, y: number) => void): void {
  for (let y = Math.max(0, Math.floor(cy - r)); y <= Math.min(map.size.h - 1, Math.ceil(cy + r)); y++)
    for (let x = Math.max(0, Math.floor(cx - r)); x <= Math.min(map.size.w - 1, Math.ceil(cx + r)); x++) if (Math.hypot(x + 0.5 - cx, y + 0.5 - cy) <= r) fn(x, y);
}

export function generateWorld(seed: number, opts: Partial<WorldOptions> = {}): WorldMap {
  const o = { ...DEFAULT_WORLD, ...opts };
  const { size } = o;
  const rng = mulberry32(seed);
  const { rock, food } = blankLayers(size);
  const cut = rockCut(o.rockiness);
  const scut = soilCut(o.soil);
  const map: WorldMap = { size, seed, rock, food, nest: { x: size.w / 2, y: size.h / 2, r: 3 }, nests: [], foodTotal: 0, foodLeft: 0, dug: 0 };
  // Placement plans through diggable ground (anywhere but rock): underground, the ants dig the rest.
  const dg: Through = "diggable";
  rock.forEach((cx, cy, r) => {
    const gen = chunkRock(seed, cx, cy, cut, scut);
    for (let i = 0; i < r.length; i++) if (!r[i]) r[i] = gen[i] as number; // cells past the map's edge stay rock
  });
  let open = 0;
  for (let y = 0; y < size.h; y++) for (let x = 0; x < size.w; x++) open += rockAt(map, x, y) === ROCK ? 0 : 1;

  // The player's nest somewhere in the middle half, on open ground joined to most of the map
  // (a spot inside a rock blob, cleared, would be a sealed pocket).
  const escape = Math.min(48, Math.floor(Math.min(size.w, size.h) / 3));
  let nest = map.nest;
  let best = -1;
  for (let tries = 0; tries < 40; tries++) {
    const x = size.w * (0.3 + 0.4 * rng());
    const y = size.h * (0.3 + 0.4 * rng());
    if (rockAt(map, Math.floor(x), Math.floor(y)) === ROCK || !escapes(map, x, y, escape, dg)) continue;
    let count = 0;
    for (const v of reachable(map, x, y, dg)) count += v;
    if (count > best) {
      best = count;
      nest = { x, y, r: 3 };
    }
    if (count > open * 0.6) break;
  }
  const clear = (n: Nest) => disc(map, n.x, n.y, n.r + 4, (x, y) => setRock(map, x, y, 0));
  clear(nest);
  const nests = [nest];

  // Rival nests: of a few hundred spots the player's ants can walk to, the one nearest `nestGap`
  // from its closest nest, and never nearer than 70 % of it (the farthest spot on a small map).
  let reach = reachable(map, nest.x, nest.y, dg);
  for (let k = 1; k < o.nestCount; k++) {
    let pick: Nest | null = null;
    let score = Infinity;
    let far: Nest | null = null;
    let farD = -1;
    for (let tries = 0; tries < 400; tries++) {
      const x = Math.min(size.w - 1, 6 + rng() * Math.max(0, size.w - 12));
      const y = Math.min(size.h - 1, 6 + rng() * Math.max(0, size.h - 12));
      if (!reach[Math.floor(y) * size.w + Math.floor(x)]) continue;
      const d = Math.min(...nests.map((n) => Math.hypot(x - n.x, y - n.y)));
      if (d > farD) {
        farD = d;
        far = { x, y, r: 3 };
      }
      if (d < 0.7 * o.nestGap) continue;
      const s = Math.abs(d - o.nestGap);
      if (s < score) {
        score = s;
        pick = { x, y, r: 3 };
      }
    }
    const n = pick ?? far ?? { x: size.w - nest.x, y: size.h - nest.y, r: 3 };
    clear(n);
    nests.push(n);
  }
  map.nest = nest;
  map.nests = nests;

  // Food patches, chunk by chunk (each chunk's patches come from its own seed): far enough from
  // every nest to need a trail, only where an ant can walk.
  reach = reachable(map, nest.x, nest.y, dg);
  const cw = Math.ceil(size.w / CHUNK);
  const ch = Math.ceil(size.h / CHUNK);
  for (let cy = 0; cy < ch; cy++)
    for (let cx = 0; cx < cw; cx++) {
      const r = mulberry32(hash4(seed, 77, cx, cy));
      const count = Math.floor(o.patchesPerChunk) + (r() < o.patchesPerChunk % 1 ? 1 : 0);
      for (let p = 0; p < count; p++) {
        for (let tries = 0; tries < 12; tries++) {
          const x = (cx << CHUNK_BITS) + r() * CHUNK;
          const y = (cy << CHUNK_BITS) + r() * CHUNK;
          const radius = 2 + r() * 2;
          if (!inBounds(map, Math.floor(x), Math.floor(y)) || !reach[Math.floor(y) * size.w + Math.floor(x)]) continue;
          if (nests.some((n) => Math.hypot(x - n.x, y - n.y) - radius - 1 < o.foodMinDist)) continue; // every cell of the patch, not just its centre
          disc(map, x, y, radius, (fx, fy) => {
            setRock(map, fx, fy, 0);
            food.set(fx, fy, o.foodPerCell);
          });
          break;
        }
      }
    }
  // Clearing ground under a patch can open new ground but never closes any; food stays reachable (by digging, underground).
  reach = reachable(map, nest.x, nest.y, dg);
  let total = 0;
  for (let y = 0; y < size.h; y++)
    for (let x = 0; x < size.w; x++) {
      const v = food.get(x, y);
      if (!v) continue;
      if (!reach[y * size.w + x]) food.set(x, y, 0);
      else total += v;
    }
  map.foodTotal = total;
  map.foodLeft = total;
  return map;
}
