import { Chambers } from "./chambers.ts";
import { CHUNK, CHUNK_BITS, ChunkLayer, local } from "./chunks.ts";
import { CELL, cellKey, cellOf, centreX, centreY, discOffsets, E, extent, hexDistance, NE, NW, nx, ny, R, W } from "./hex.ts";

// The colonies' world, pure: a procedural map from a seed, kept in 64×64
// chunks (chunks.ts). Rock comes from three octaves of hashed value noise:
// every cell's height is a pure function of (seed, x, y), so any chunk can be
// generated on its own, in any order, with the same result. That is what lets
// the map grow later without regenerating what exists. Rock is a fixed
// height threshold, calibrated once so about `rockiness` of the ground is
// rock. On top: the player's nest on open ground joined to most of the map,
// rival nests a walk away, and food patches placed chunk by chunk only where
// an ant can walk to them. The grid is hexagons in offset rows (hex.ts): a
// cell is (column, row) in the chunks; positions (ants, nests) are in world
// units, neighbouring centres 1 apart. The map is finite for now: `size`
// columns × rows from (x0, 0); `worldExtent` is its size in world units. Every
// map's columns start at 0 but one world's curtain, whose column is the line's
// s itself, so it starts at the line's first column (often negative).
//
// Each cell of the `rock` layer is OPEN, ROCK or SOIL; both solids block ants and scent, and ants dig soil open (colony.ts). The plane
// (`PLANE_WORLD`) has no soil and more rock; the curtain's ground is oneWorld.ts's.

/** A map's size: columns (w) × rows (h) of hexagons. Its size in world units is `worldExtent`. */
export interface WorldSize {
  w: number;
  h: number;
}

/** A nest: its centre and radius, in world units. In the side view, its chamber; `entrance` is the hole in the ground above it. */
export interface Nest {
  x: number;
  y: number;
  r: number;
  /** the side view: the hole where the nest's shaft comes up through the ground line (world units) */
  entrance?: { x: number; y: number };
}

/** What a cell of the terrain (`WorldMap.rock`) holds. */
export const OPEN = 0;
export const ROCK = 1;
export const SOIL = 2;
/** The side view's sky: solid to ants and scent like rock, never dug (see WorldMap.sky) */
export const AIR = 3;
export type Terrain = typeof OPEN | typeof ROCK | typeof SOIL | typeof AIR;

export interface WorldMap {
  /**
   * The endless plane (endlessMap.ts): true on a map with no edge, whose rock, food and quality are generated chunk by chunk on a miss.
   * `size` and `x0` are then only a nominal box (the chunk key's range), never a bound: inBounds, clampCol, rockAt and disc ask this flag
   * outside the box and rows above it, so the plane runs every way. Absent (never false) on every bounded map.
   */
  endless?: true;
  size: WorldSize;
  /**
   * The map's first column: its columns run x0 … x0 + size.w − 1. 0 on every map but one world's curtain, whose column
   * is the line's s itself (docs/one-world.md §3), so growing the line at V₀ renumbers nothing: it lowers x0.
   */
  x0: number;
  seed: number;
  /** the terrain, per cell: OPEN, ROCK (never dug) or SOIL (ants dig it open); solids block ants and scent; ungenerated ground reads as rock */
  rock: ChunkLayer<Uint8Array>;
  /** food units left per cell; change it through takeFood / dropFood so foodLeft stays true */
  food: ChunkLayer<Float32Array>;
  /**
   * how good each cell's food is (1 = the game's ordinary food; Beckers et al. 1993's 1 M sugar against 0.1 M is about
   * 1.5 against 0.5 here; docs/trails.md); absent when every cell's is 1. Read it through qualityAt.
   */
  quality?: ChunkLayer<Float32Array>;
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
  /** open cells filled back with soil since generation (backfilled dead ends) */
  filled: number;
  /** whether the map has any soil (underground): without it there are no tunnels to walk or dig, and ants skip looking for them */
  hasSoil: boolean;
  /** the heading each dug cell was dug at (1–252 round the circle; 0 = not dug): the run of a tunnel, which the next digger carries on */
  digHeading: ChunkLayer<Uint8Array>;
  /** when each cell was last filled back with soil (simulated seconds; −Infinity = never): fresh pellets smell, and draw more (see pelletScent) */
  filledAt: ChunkLayer<Float32Array>;
  /**
   * The side view (a cross-section): 1 for cells above the ground, 0 below; absent for the top-down maps. A
   * cell above ground touching solid ground is the walkway (OPEN: ants walk the ground line, its overhangs,
   * later the mound); the rest is AIR (solid, never dug, drawn as sky). updateSurface keeps it so as ground changes.
   */
  sky?: ChunkLayer<Uint8Array>;
  /**
   * The one-world curtain (oneWorld.ts): its rows 0 … surfaceRows − 1, the sky and the ground strip under it, are all
   * sky (AIR), the plane's: the side view draws the plane under the line on the strip, which stores nothing (one-world
   * §8 item 6). updateSurface leaves them be, nothing fills them, no spoil is heaped there (the mound is the plane's,
   * one-world §4), and no search passes through them; a step up into them from a hole is a crossing onto the plane
   * (colony.ts walkable). No cell in them is soil, so none is dug. The crust under them is soil touching their sky, which ants leave (dig.ts crust) as
   * they leave today's ground line. Absent elsewhere.
   */
  surfaceRows?: number;
  /**
   * Cells of spoil on the map: on one world's plane heapPlane adds one and takePlane takes one. The curtain's stays 0: S2.3f deleted
   * the side view's heapMound and takeLoose, and S2.3h the `loose` layer they set.
   */
  moundCells?: number;
  /**
   * One world's plane (U3c, docs/one-world.md §4): the mound as a height field, pellets of spoil heaped per cell
   * (heapPlane adds one, takePlane takes one). Spoil doesn't change walking: it is a height to draw and to pick from, and
   * food on a heaped cell stays on top. Allocated by generateOneWorld; absent on every other map.
   */
  spoil?: ChunkLayer<Uint16Array>;
  /** the side view: the nests' chambers (nest slice 2): which cells are chambers, and each chamber's floor */
  chambers?: Chambers;
  /** when each cell was last dug open by an ant (simulated seconds; −Infinity = never): fresh digging is the live frontier, not filled back (BACKFILL.young) */
  dugAt: ChunkLayer<Float32Array>;
  /** forks begun but not finished: a tunnel's end cell → its second arm (the way to dig, and the heading the arm carries on), which the next digger to pass digs */
  forks?: Map<number, Fork>;
}

/** Whether integer cell (x, y) is open ground (for Chambers' floor counts), one function per map (made once, not per dig). */
const openCells = new WeakMap<WorldMap, (x: number, y: number) => boolean>();
export function openCell(map: WorldMap): (x: number, y: number) => boolean {
  let f = openCells.get(map);
  if (!f) {
    f = (x, y) => inBounds(map, x, y) && rockAt(map, x, y) === OPEN;
    openCells.set(map, f);
  }
  return f;
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

/** The plane (one world's open ground, before any digging): ~22 % rock, no soil. The curtain's ground is oneWorld.ts `CURTAIN_WORLD`. */
export const PLANE_WORLD: WorldOptions = {
  size: { w: 512, h: 368 },
  rockiness: 0.22,
  patchesPerChunk: 1.5,
  foodPerCell: 12,
  nestCount: 2,
  nestGap: 140,
  foodMinDist: 24,
  soil: 0,
};

/** How far below the ground line a founded nest's chamber is dug, in rows (foundNest's default). */
export const FOUND_DEPTH = 14;

/** A random stream whose position can be read and set (a save keeps it: save.ts). */
export interface Rng {
  (): number;
  /** where the stream is: setting it back replays the same numbers */
  state: number;
}

/** Small, fast, seedable: the same seed is the same sequence on every machine. Its `state` can be saved and set. */
export function mulberry32(seed: number): Rng {
  let s = seed | 0;
  const next = (() => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }) as Rng;
  Object.defineProperty(next, "state", {
    get: () => s,
    set: (v: number) => {
      s = v | 0;
    },
  });
  return next;
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

/** Ground height at world (x, y): blobs of rock (18 cells), rough edges (6), and broad rocky or open regions (80). */
export function heightAt(seed: number, x: number, y: number): number {
  return 0.5 * noiseAt(seed, 1, x, y, 18) + 0.25 * noiseAt(seed, 2, x, y, 6) + 0.25 * noiseAt(seed, 3, x, y, 80);
}

const cuts = new Map<number, number>();

/** The height above which ground is rock, so that about `rockiness` of all ground is: sampled once from a fixed spread of seeds and places. */
export function rockCut(rockiness: number): number {
  const have = cuts.get(rockiness);
  if (have !== undefined) return have;
  const sample: number[] = [];
  for (let s = 1; s <= 12; s++)
    for (let y = 0; y < 96; y++) for (let x = 0; x < 96; x++) sample.push(heightAt(s * 7919, x * 5 + s * 1013, y * 5 - s * 577));
  sample.sort((a, b) => a - b);
  const cut = sample[Math.floor((1 - rockiness) * (sample.length - 1))];
  cuts.set(rockiness, cut);
  return cut;
}

/** How open ground is at world (x, y) underground: low values are soil, high values open chambers (~10-cell blobs with rough edges). */
export function chamberAt(seed: number, x: number, y: number): number {
  return 0.65 * noiseAt(seed, 4, x, y, 10) + 0.35 * noiseAt(seed, 5, x, y, 4);
}

const soilCuts = new Map<number, number>();

/** The chamber value below which ground is soil, so that about `soil` of it is: sampled once, like rockCut. */
export function soilCut(soil: number): number {
  const have = soilCuts.get(soil);
  if (have !== undefined) return have;
  const sample: number[] = [];
  for (let s = 1; s <= 12; s++)
    for (let y = 0; y < 96; y++) for (let x = 0; x < 96; x++) sample.push(chamberAt(s * 7919, x * 5 + s * 1013, y * 5 - s * 577));
  sample.sort((a, b) => a - b);
  const cut = soil <= 0 ? -Infinity : sample[Math.min(sample.length - 1, Math.floor(soil * (sample.length - 1)))];
  soilCuts.set(soil, cut);
  return cut;
}

/** Chunk (cx, cy)'s terrain, from the seed alone: ROCK above the height cut, else SOIL below the chamber cut, else OPEN; sampled at each hexagon's centre. */
export function chunkRock(seed: number, cx: number, cy: number, cut: number, soil = -Infinity): Uint8Array {
  const rock = new Uint8Array(CHUNK * CHUNK);
  const x0 = cx << CHUNK_BITS;
  const y0 = cy << CHUNK_BITS;
  for (let ly = 0; ly < CHUNK; ly++)
    for (let lx = 0; lx < CHUNK; lx++) {
      const y = y0 + ly;
      const x = centreX(x0 + lx, y);
      const wy = centreY(y);
      rock[local(lx, ly)] = heightAt(seed, x, wy) > cut ? ROCK : soil > -Infinity && chamberAt(seed, x, wy) < soil ? SOIL : OPEN;
    }
  return rock;
}

/** The map's size in world units. */
export function worldExtent(map: { size: WorldSize }): { w: number; h: number } {
  return extent(map.size.w, map.size.h);
}

/** A map's columns and rows: what a bounds check needs (a WorldMap is one). Columns run x0 … x0 + size.w − 1. */
export interface Bounds {
  x0: number;
  size: WorldSize;
  /** an endless plane has no edge (see WorldMap.endless) */
  endless?: true;
}

/** Whether integer cell (x, y) is on the map. */
export function inBounds(map: Bounds, x: number, y: number): boolean {
  return (x >= map.x0 && y >= 0 && x < map.x0 + map.size.w && y < map.size.h) || map.endless === true;
}

/** Column x held to the map's columns (x0 … x0 + w − 1). */
export function clampCol(map: Bounds, x: number): number {
  if (map.endless) return x;
  return Math.min(map.x0 + map.size.w - 1, Math.max(map.x0, x));
}

/** The first row ants may use: the curtain's `surfaceRows`, else 0; an endless plane has rows above 0 too (PRD §66 E6.0.2), so none is too high. */
export function topRow(map: Bounds & { surfaceRows?: number }): number {
  return map.surfaceRows ?? (map.endless ? -Infinity : 0);
}

/** Row y held to the map's rows (0 … h − 1); an endless plane has no edge, so any row. */
export function clampRow(map: Bounds, y: number): number {
  if (map.endless) return y;
  return Math.min(map.size.h - 1, Math.max(0, y));
}

/** The terrain at integer cell (x, y): OPEN, ROCK or SOIL; off the map is rock. Non-zero = solid. */
export function rockAt(map: WorldMap, x: number, y: number): number {
  return x < map.x0 || y < 0 || x >= map.x0 + map.size.w || y >= map.size.h
    ? map.endless
      ? map.rock.get(x, y)
      : ROCK
    : map.rock.get(x, y);
}

/** The terrain of the cell under world position (x, y) (off the map is rock). */
export function terrainAt(map: WorldMap, x: number, y: number): number {
  cellOf(x, y);
  return rockAt(map, CELL[0], CELL[1]);
}

/** Solid (rock, soil or off the map), at a world position. */
export function blocked(map: WorldMap, x: number, y: number): boolean {
  return terrainAt(map, x, y) !== OPEN;
}

/** Diggable soil at a world position. */
export function soilAt(map: WorldMap, x: number, y: number): boolean {
  return terrainAt(map, x, y) === SOIL;
}

/** Dig the soil cell under world (x, y) open; false if it isn't soil. */
export function dig(map: WorldMap, x: number, y: number): boolean {
  cellOf(x, y);
  return digCell(map, CELL[0], CELL[1]);
}

/** Fill open integer cell (x, y) back with soil (a pellet dropped into a dead end) at time t; false if it isn't open ground on the map. */
export function fillCell(map: WorldMap, x: number, y: number, t = 0): boolean {
  if (!inBounds(map, x, y) || y < topRow(map) || rockAt(map, x, y) !== OPEN) return false;
  map.rock.set(x, y, SOIL);
  map.digHeading.set(x, y, 0);
  map.filledAt.set(x, y, t);
  map.filled++;
  if (map.sky) {
    map.sky.set(x, y, 0); // ground now (a pellet on the mound, in the side view)
    updateSurface(map, x, y);
  }
  if (map.chambers) {
    map.chambers.release(x, y);
    map.chambers.changed(x, y, openCell(map));
  }
  return true;
}

/** Dig integer cell (x, y) open at time t (−Infinity: not by an ant, so not a fresh dig); false if it isn't soil. */
export function digCell(map: WorldMap, x: number, y: number, t = -Infinity): boolean {
  if (rockAt(map, x, y) !== SOIL) return false;
  map.rock.set(x, y, OPEN);
  map.filledAt.set(x, y, -Infinity); // a pellet dug out again no longer smells of building
  map.dugAt.set(x, y, t);
  map.dug++;
  if (map.sky) updateSurface(map, x, y);
  map.chambers?.changed(x, y, openCell(map));
  return true;
}

/** Whether integer cell (x, y) is above the ground in the side view (the walkway or sky). */
export function isSky(map: WorldMap, x: number, y: number): boolean {
  return map.sky !== undefined && inBounds(map, x, y) && map.sky.get(x, y) === 1;
}

/** Whether cell (x, y) has solid ground (soil or rock, on the map) beside it: what keeps a walkway cell walkable. */
function grounded(map: WorldMap, x: number, y: number): boolean {
  for (let d = 0; d < 6; d++) {
    const ax = nx(x, y, d);
    const ay = ny(y, d);
    if (!inBounds(map, ax, ay)) continue;
    const t = map.rock.get(ax, ay);
    if (t === SOIL || t === ROCK) return true;
  }
  return false;
}

/**
 * The side view: after cell (x, y) changed (dug, filled, a pellet put on the mound), re-derive the cells
 * above ground round it: those touching solid ground are the walkway (OPEN), the rest AIR. A walkway cell
 * whose ground is dug away from under it becomes sky (an ant there walks out: see the own-cell step in colony.ts).
 */
export function updateSurface(map: WorldMap, x: number, y: number): void {
  const sky = map.sky;
  if (!sky) return;
  const top = topRow(map);
  for (let d = -1; d < 6; d++) {
    const ax = d < 0 ? x : nx(x, y, d);
    const ay = d < 0 ? y : ny(y, d);
    if (ay < top || !inBounds(map, ax, ay) || sky.get(ax, ay) !== 1) continue;
    const t = map.rock.get(ax, ay);
    if (t !== OPEN && t !== AIR) continue;
    map.rock.set(ax, ay, grounded(map, ax, ay) ? OPEN : AIR);
  }
}

function headingLayer(): ChunkLayer<Uint8Array> {
  return new ChunkLayer((n) => new Uint8Array(n), 0);
}

/** A layer of times (simulated seconds), −Infinity = never. */
function timeLayer(): ChunkLayer<Float32Array> {
  return new ChunkLayer((n) => new Float32Array(n).fill(-Infinity), -Infinity);
}

/** The per-cell dig bookkeeping layers a map starts with (digHeading, filledAt, dugAt), for a map made outside this file (endlessMap.ts). */
export function editLayers(): Pick<WorldMap, "digHeading" | "filledAt" | "dugAt"> {
  return { digHeading: headingLayer(), filledAt: timeLayer(), dugAt: timeLayer() };
}

/** The heading integer cell (x, y) was dug at, in radians; NaN if it wasn't dug (a chamber, or never soil). */
/** Steps a dug cell's heading is kept in: a multiple of 6, so the six ways and a fork's ±60° and 120° are exact (255 put each fork half a step off, always the same way, and it added up). */
const HEADING_STEPS = 252;

export function tunnelHeading(map: WorldMap, x: number, y: number): number {
  const v = map.digHeading.get(x, y);
  return v === 0 ? NaN : ((v - 1) / HEADING_STEPS) * 2 * Math.PI;
}

/** A fork's undug arm: the way from the fork's cell to dig (0–5), and the heading the new tunnel carries on. */
export interface Fork {
  dir: number;
  aim: number;
}

/**
 * A fork begun at cell (x, y): one arm dug, the other (way `dir`, carrying heading `aim`) left for the next digger to pass.
 * On hexes a fork has to be a Y: both arms 60° off the tunnel's run, never one straight on, because the
 * cell straight on touches a 60° arm and so is no longer a tunnel's end (it would never be dug).
 */
export function markFork(map: WorldMap, x: number, y: number, dir: number, aim: number): void {
  (map.forks ??= new Map()).set(cellKey(x, y), { dir, aim });
}

/** A fork's undug arm at cell (x, y), taken (forgotten) as it is read; null if none. */
export function takeFork(map: WorldMap, x: number, y: number): Fork | null {
  const k = cellKey(x, y);
  const f = map.forks?.get(k);
  if (f === undefined) return null;
  map.forks!.delete(k);
  return f;
}

/** Remember the heading integer cell (x, y) was dug at. */
export function setTunnelHeading(map: WorldMap, x: number, y: number, h: number): void {
  const t = (((h / (2 * Math.PI)) % 1) + 1) % 1;
  map.digHeading.set(x, y, 1 + (Math.round(t * HEADING_STEPS) % HEADING_STEPS));
}

/** Food units in the cell under world (x, y). */
export function foodAt(map: WorldMap, x: number, y: number): number {
  cellOf(x, y);
  return map.food.get(CELL[0], CELL[1]);
}

/** Food units in integer cell (x, y). */
export function foodIn(map: WorldMap, x: number, y: number): number {
  return map.food.get(x, y);
}

/** The quality of the food in integer cell (x, y): 1 unless the map says otherwise. */
export function qualityAt(map: WorldMap, x: number, y: number): number {
  return map.quality ? map.quality.get(x, y) : 1;
}

function qualityLayer(): ChunkLayer<Float32Array> {
  return new ChunkLayer((n) => new Float32Array(n), 1);
}

/**
 * Before a load: give `map` a quality layer if the saved map had one. Food of a quality other than 1 (the builder's
 * sugar, crumbs, honeydew) adds the layer to a map that began without it; filled into a map without it, the save's
 * layer stayed a plain object, and the first taste after the load threw (ja-nzkg.2's save test found it).
 */
export function qualityLike(map: WorldMap, saved: unknown): void {
  if (!map.quality && saved !== null && typeof saved === "object" && (saved as { quality?: unknown }).quality != null)
    map.quality = qualityLayer();
}

/** Take one unit of food from the cell under world (x, y), if there is any. */
export function takeFood(map: WorldMap, x: number, y: number): boolean {
  cellOf(x, y);
  return takeFoodCell(map, CELL[0], CELL[1]);
}

/** Take one unit of food from integer cell (cx, cy), if there is any. */
export function takeFoodCell(map: WorldMap, cx: number, cy: number): boolean {
  const v = map.food.get(cx, cy);
  if (v <= 0) return false;
  const left = Math.max(0, v - 1);
  map.food.set(cx, cy, left);
  map.foodLeft -= v - left;
  return true;
}

/** Put `amount` food of `quality` on the cell under world (x, y): the cell's quality becomes the mean, by amount. */
export function dropFood(map: WorldMap, x: number, y: number, amount: number, quality = 1): void {
  cellOf(x, y);
  const cx = CELL[0];
  const cy = CELL[1];
  if (!inBounds(map, cx, cy)) return;
  const had = map.food.get(cx, cy);
  if (quality !== 1 || map.quality) {
    const q = (map.quality ??= qualityLayer());
    q.set(cx, cy, had > 0 ? (had * q.get(cx, cy) + amount * quality) / (had + amount) : quality);
  }
  map.food.set(cx, cy, had + amount);
  map.foodLeft += amount;
}

/** Move all the food in cell (fx, fy) onto cell (tx, ty), its quality blended in by amount (foodLeft unchanged). */
export function moveFoodCell(map: WorldMap, fx: number, fy: number, tx: number, ty: number): void {
  const f = map.food.get(fx, fy);
  if (f <= 0) return;
  const had = map.food.get(tx, ty);
  if (map.quality) {
    const q = map.quality;
    q.set(tx, ty, had > 0 ? (had * q.get(tx, ty) + f * q.get(fx, fy)) / (had + f) : q.get(fx, fy));
  }
  map.food.set(fx, fy, 0);
  map.food.set(tx, ty, had + f);
}

/** Set rock at integer cell (x, y). */
export function setRock(map: WorldMap, x: number, y: number, v: Terrain): void {
  if (inBounds(map, x, y)) map.rock.set(x, y, v);
}

/** Empty layers for a finite map whose columns start at x0: every chunk it touches allocated, cells past its edge rock. */
function blankLayers(size: WorldSize, x0 = 0): { rock: ChunkLayer<Uint8Array>; food: ChunkLayer<Float32Array> } {
  const rock = new ChunkLayer((n) => new Uint8Array(n), 1);
  const food = new ChunkLayer((n) => new Float32Array(n), 0);
  for (let cy = 0; cy < Math.ceil(size.h / CHUNK); cy++)
    for (let cx = x0 >> CHUNK_BITS; cx <= (x0 + size.w - 1) >> CHUNK_BITS; cx++) {
      const r = rock.ensure(cx, cy);
      for (let ly = 0; ly < CHUNK; ly++)
        for (let lx = 0; lx < CHUNK; lx++) {
          const x = (cx << CHUNK_BITS) + lx;
          r[local(lx, ly)] = x >= x0 && x < x0 + size.w && (cy << CHUNK_BITS) + ly < size.h ? 0 : 1;
        }
      food.ensure(cx, cy);
    }
  return { rock, food };
}

/** A map from flat row-major arrays (tests, small hand-made fields): rock and food default to none. With `x0`, its columns start there (index y·w + x − x0). */
export function worldFromArrays(
  size: WorldSize,
  nests: Nest[],
  opts: { rock?: ArrayLike<number>; food?: ArrayLike<number>; quality?: ArrayLike<number>; seed?: number; x0?: number } = {},
): WorldMap {
  const x0 = opts.x0 ?? 0;
  const { rock, food } = blankLayers(size, x0);
  const quality = opts.quality ? qualityLayer() : undefined;
  let total = 0;
  for (let y = 0; y < size.h; y++)
    for (let x = x0; x < x0 + size.w; x++) {
      const i = y * size.w + x - x0;
      const t = opts.rock?.[i];
      if (t) rock.set(x, y, t); // 1 = rock, 2 = soil
      const f = opts.food?.[i] ?? 0;
      if (f) {
        food.set(x, y, f);
        total += f;
      }
      if (quality) quality.set(x, y, opts.quality?.[i] ?? 1);
    }
  let hasSoil = false;
  if (opts.rock) for (let i = 0; i < opts.rock.length && !hasSoil; i++) hasSoil = opts.rock[i] === SOIL;
  return {
    size,
    x0,
    seed: opts.seed ?? 0,
    rock,
    food,
    ...(quality ? { quality } : {}),
    nest: nests[0]!,
    nests,
    foodTotal: total,
    foodLeft: total,
    dug: 0,
    filled: 0,
    hasSoil,
    digHeading: headingLayer(),
    filledAt: timeLayer(),
    dugAt: timeLayer(),
  };
}

/** A layer as a flat row-major array over the map (tests, the reachability oracle): cell (x, y) at y·w + x − x0. */
export function flat<A extends Uint8Array | Float32Array>(map: WorldMap, layer: ChunkLayer<A>, make: (n: number) => A): A {
  const { w, h } = map.size;
  const { x0 } = map;
  const out = make(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) out[y * w + x] = layer.get(x + x0, y);
  return out;
}

/** How a search may pass: "open" ground only (walking), or "diggable" (open or soil: anywhere but rock). */
export type Through = "open" | "diggable";

function passable(map: WorldMap, x: number, y: number, through: Through): boolean {
  if (y < topRow(map)) return false; // the curtain's surface is the plane's: no way round underground through it
  const t = rockAt(map, x, y);
  return through === "open" ? t === OPEN : t === OPEN || t === SOIL;
}

/** Cells reachable from world (x, y) through the six neighbours (walking through open ground, or digging through soil too), as a flat array over the map (cell (x, y) at y·w + x − x0): the whole-map oracle. */
export function reachable(map: WorldMap, x: number, y: number, through: Through = "open"): Uint8Array {
  return reachableFrom(map, [{ x, y }], through);
}

/** Cells reachable from any of world points `from`, as `reachable`: one search, every point a start. */
export function reachableFrom(map: WorldMap, from: readonly { x: number; y: number }[], through: Through = "open"): Uint8Array {
  const { w, h } = map.size;
  const { x0 } = map;
  const seen = new Uint8Array(w * h);
  const queue = new Int32Array(w * h);
  let head = 0;
  let tail = 0;
  for (const p of from) {
    cellOf(p.x, p.y);
    const sx = CELL[0];
    const sy = CELL[1];
    if (!inBounds(map, sx, sy) || seen[sy * w + sx - x0] || !passable(map, sx, sy, through)) continue;
    queue[tail++] = sy * w + sx - x0;
    seen[sy * w + sx - x0] = 1;
  }
  while (head < tail) {
    const c = queue[head++];
    const col = c % w;
    const cy = (c - col) / w;
    const cx = col + x0;
    for (let d = 0; d < 6; d++) {
      const ax = nx(cx, cy, d);
      const ay = ny(cy, d);
      if (ax < x0 || ay < 0 || ax >= x0 + w || ay >= h) continue;
      const n = ay * w + ax - x0;
      if (seen[n] || !passable(map, ax, ay, through)) continue;
      seen[n] = 1;
      queue[tail++] = n;
    }
  }
  return seen;
}

/**
 * Whether an ant at world (x, y) can walk at least `radius` steps away: a bounded search that never
 * looks at the whole map, so it works on a map of any size. A spot that escapes is on the main
 * ground, not in a pocket sealed by rock.
 */
export function escapes(map: WorldMap, x: number, y: number, radius: number, through: Through = "open"): boolean {
  cellOf(x, y);
  const sx = CELL[0];
  const sy = CELL[1];
  if (!passable(map, sx, sy, through)) return false;
  // A box of cells round the start, wide enough for every cell within `radius` steps.
  const side = 2 * radius + 3;
  const seen = new Uint8Array(side * side);
  const queue = new Int32Array(side * side);
  let head = 0;
  let tail = 0;
  const half = radius + 1;
  const at = (cx: number, cy: number) => (cy - sy + half) * side + (cx - sx + half);
  queue[tail++] = at(sx, sy);
  seen[at(sx, sy)] = 1;
  while (head < tail) {
    const c = queue[head++];
    const cx = (c % side) - half + sx;
    const cy = Math.floor(c / side) - half + sy;
    for (let d = 0; d < 6; d++) {
      const ax = nx(cx, cy, d);
      const ay = ny(cy, d);
      if (hexDistance(sx, sy, ax, ay) >= radius) {
        if (passable(map, ax, ay, through)) return true;
        continue;
      }
      const n = at(ax, ay);
      if (seen[n] || !passable(map, ax, ay, through)) continue;
      seen[n] = 1;
      queue[tail++] = n;
    }
  }
  return false;
}

/** Visit every cell whose centre is within `r` of world (cx, cy), on the map. */
export function disc(map: WorldMap, cx: number, cy: number, r: number, fn: (x: number, y: number) => void): void {
  const open = map.endless === true; // no edge: the whole disc
  const y0 = Math.floor(cy / R - r / R - 1);
  const y1 = Math.ceil(cy / R + r / R);
  const x0 = Math.floor(cx - r - 1);
  const x1 = Math.ceil(cx + r);
  for (let y = open ? y0 : Math.max(0, y0); y <= (open ? y1 : Math.min(map.size.h - 1, y1)); y++)
    for (let x = open ? x0 : Math.max(map.x0, x0); x <= (open ? x1 : Math.min(map.x0 + map.size.w - 1, x1)); x++)
      if (Math.hypot(centreX(x, y) - cx, centreY(y) - cy) <= r) fn(x, y);
}

/** Index into a flat map array of the cell under world (x, y), or −1 off the map. */
function flatIndex(map: WorldMap, x: number, y: number): number {
  cellOf(x, y);
  const cx = CELL[0];
  const cy = CELL[1];
  return inBounds(map, cx, cy) ? cy * map.size.w + cx - map.x0 : -1;
}

export function generateWorld(seed: number, opts: Partial<WorldOptions> = {}): WorldMap {
  const o = { ...PLANE_WORLD, ...opts };
  const { size } = o;
  const rng = mulberry32(seed);
  const { rock, food } = blankLayers(size);
  const cut = rockCut(o.rockiness);
  const scut = soilCut(o.soil);
  const ext = extent(size.w, size.h);
  const map: WorldMap = {
    size,
    x0: 0,
    seed,
    rock,
    food,
    nest: { x: ext.w / 2, y: ext.h / 2, r: 3 },
    nests: [],
    foodTotal: 0,
    foodLeft: 0,
    dug: 0,
    filled: 0,
    hasSoil: o.soil > 0,
    digHeading: headingLayer(),
    filledAt: timeLayer(),
    dugAt: timeLayer(),
  };
  // Placement plans through diggable ground (anywhere but rock): underground, the ants dig the rest.
  const dg: Through = "diggable";
  rock.forEach((cx, cy, r) => {
    const gen = chunkRock(seed, cx, cy, cut, scut);
    for (let i = 0; i < r.length; i++) if (!r[i]) r[i] = gen[i]; // cells past the map's edge stay rock
  });
  let open = 0;
  for (let y = 0; y < size.h; y++) for (let x = 0; x < size.w; x++) open += rockAt(map, x, y) === ROCK ? 0 : 1;

  // The player's nest somewhere in the middle half, on open ground joined to most of the map
  // (a spot inside a rock blob, cleared, would be a sealed pocket).
  const escape = Math.min(48, Math.floor(Math.min(ext.w, ext.h) / 3));
  let nest = map.nest;
  let best = -1;
  for (let tries = 0; tries < 40; tries++) {
    const x = ext.w * (0.3 + 0.4 * rng());
    const y = ext.h * (0.3 + 0.4 * rng());
    if (terrainAt(map, x, y) === ROCK || !escapes(map, x, y, escape, dg)) continue;
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
      const x = Math.min(ext.w - 1, 6 + rng() * Math.max(0, ext.w - 12));
      const y = Math.min(ext.h - 1, 6 + rng() * Math.max(0, ext.h - 12));
      const at = flatIndex(map, x, y);
      if (at < 0 || !reach[at]) continue;
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
    const n = pick ?? far ?? { x: ext.w - nest.x, y: ext.h - nest.y, r: 3 };
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
          // A point in this chunk's cells, in world units.
          const y = ((cy << CHUNK_BITS) + r() * CHUNK) * R;
          const x = (cx << CHUNK_BITS) + r() * CHUNK;
          const radius = 2 + r() * 2;
          const at = flatIndex(map, x, y);
          if (at < 0 || !reach[at]) continue;
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
  keepReachableFood(map, [nest], dg);
  return map;
}

/**
 * Keep only the food an ant from one of `from` (world points: the nests) can reach, walking or, with "diggable", digging;
 * the rest is taken off the map. Food above row `fromRow` is neither checked nor counted. Sets foodTotal and foodLeft.
 */
export function keepReachableFood(map: WorldMap, from: readonly { x: number; y: number }[], through: Through, fromRow = 0): void {
  const { w, h } = map.size;
  const { x0 } = map;
  const reach = reachableFrom(map, from, through);
  let total = 0;
  for (let y = fromRow; y < h; y++)
    for (let x = x0; x < x0 + w; x++) {
      const v = map.food.get(x, y);
      if (!v) continue;
      if (!reach[y * w + x - x0]) map.food.set(x, y, 0);
      else total += v;
    }
  map.foodTotal = total;
  map.foodLeft = total;
}

/** Whether world (x, y) lies within `d` of a nest or its entrance (side view): how far food keeps from nests. */
export function nearNests(nests: readonly Nest[]): (x: number, y: number, d: number) => boolean {
  return (x, y, d) =>
    nests.some((n) => Math.hypot(x - n.x, y - n.y) < d || (n.entrance !== undefined && Math.hypot(x - n.entrance.x, y - n.entrance.y) < d));
}

/**
 * Food below ground (the side view's, the curtain's): one block's pockets, `patchesPerChunk` on average, from the block's
 * own stream `r`. Each pocket gets 12 tries; `at()` draws a try's centre cell, or null when it lies where no pocket goes
 * (too shallow, off the map). A pocket is 2–4 cells round, keeps `foodMinDist` from the nests (`nearNest`), and opens no
 * cell above row `floor(x)` of its column.
 */
export function buryPockets(
  map: WorldMap,
  o: Pick<WorldOptions, "patchesPerChunk" | "foodPerCell" | "foodMinDist">,
  r: () => number,
  at: () => readonly [number, number] | null,
  floor: (x: number) => number,
  nearNest: (x: number, y: number, d: number) => boolean,
): void {
  const count = Math.floor(o.patchesPerChunk) + (r() < o.patchesPerChunk % 1 ? 1 : 0);
  for (let p = 0; p < count; p++) {
    for (let tries = 0; tries < 12; tries++) {
      const cell = at();
      if (!cell) continue;
      const x = centreX(cell[0], cell[1]);
      const y = centreY(cell[1]);
      const radius = 2 + r() * 2;
      if (nearNest(x, y, o.foodMinDist + radius + 1)) continue;
      disc(map, x, y, radius, (fx, fy) => {
        if (fy < floor(fx)) return;
        setRock(map, fx, fy, OPEN);
        map.food.set(fx, fy, o.foodPerCell);
      });
      break;
    }
  }
}

/**
 * Dig a nest into the side view at column ex, whose ground line is row g: a shaft from the ground line slanting down
 * (alternating south-east and south-west steps, mostly one way: about 60° below level) to a round chamber `depth` rows down.
 */
function digNest(map: WorldMap, g: number, ex: number, depth: number, rng: () => number, colony: number): Nest {
  const way = rng() < 0.5 ? 1 : 2; // SE or SW, the shaft's slant
  let x = ex;
  let y = g;
  const open = (cx: number, cy: number) => {
    if (!inBounds(map, cx, cy)) return;
    map.rock.set(cx, cy, OPEN);
    map.sky?.set(cx, cy, 0);
  };
  open(x, y);
  for (let k = 0; k < depth; k++) {
    const d = k % 3 === 2 ? 3 - way : way; // two steps the shaft's way, one back: steep, not straight down a column
    x = nx(x, y, d);
    y = ny(y, d);
    open(x, y);
  }
  const cxw = centreX(x, y);
  const cyw = centreY(y);
  // The entrance is the hole itself, the shaft's top cell: always open (the cell above it can lose its footing and be sky).
  const nest: Nest = { x: cxw, y: cyw, r: 3, entrance: { x: centreX(ex, g), y: centreY(g) } };
  disc(map, cxw, cyw, nest.r + 1.5, (fx, fy) => open(fx, fy));
  // The founding chamber: the colony's first, where the queen will be (slice 4 makes it the royal chamber).
  if (map.chambers) {
    let bottom = 0;
    disc(map, cxw, cyw, nest.r + 1.5, (_fx, fy) => (bottom = Math.max(bottom, fy)));
    const c = map.chambers.add(colony, bottom, "royal");
    disc(map, cxw, cyw, nest.r + 1.5, (fx, fy) => map.chambers!.claim(c.id, fx, fy, openCell(map)));
  }
  // The ground round the hole changed: re-derive the walkway there.
  for (let yy = g - 2; yy <= g + 1; yy++) for (let xx = ex - 2; xx <= ex + 2; xx++) if (inBounds(map, xx, yy)) updateSurface(map, xx, yy);
  // Re-ground the hole's rim. The walkway crosses over the hole by its two upper neighbours (NW and NE, which touch each
  // other); each stands on the hole and on the hole's west (east) neighbour. Where the ground steps down a row beside the
  // hole, that neighbour is sky, and with the hole dug out the upper cell lost its footing and fell to AIR: the walkway
  // ran on only through the hole cell, which explorers never step onto (30 of 100 seeds; review of #15). A cell of soil
  // there (crust: never dug) keeps the rim.
  for (const [up, side] of [
    [NW, W],
    [NE, E],
  ] as const) {
    const sx = nx(ex, g, side);
    if (!map.sky || !inBounds(map, sx, g) || map.rock.get(nx(ex, g, up), ny(g, up)) !== AIR || map.sky.get(sx, g) !== 1) continue;
    map.rock.set(sx, g, SOIL);
    map.sky.set(sx, g, 0);
    for (let d = -1; d < 6; d++) updateSurface(map, d < 0 ? sx : nx(sx, g, d), d < 0 ? g : ny(g, d));
  }
  return nest;
}

/**
 * A new colony's nest dug mid-game (Game.addColony, ja-lo8.8): a hole in column `ex` (side view), a slanted shaft
 * `depth` rows down, and a founding chamber for colony `colony`, as the world's own nests are dug.
 */
export function foundNest(map: WorldMap, ex: number, colony: number, rng: () => number, depth = FOUND_DEPTH): Nest {
  if (!inBounds(map, ex, 0)) throw new Error(`foundNest: column ${ex} is off the map (${map.x0}…${map.x0 + map.size.w - 1})`);
  return digNest(map, groundTop(map, ex), ex, depth, rng, colony);
}

/** The top of the ground in column x (side view): the first row from the top that isn't sky, or the map's height. */
export function groundTop(map: WorldMap, x: number): number {
  const sky = map.sky;
  if (!sky) return 0;
  for (let y = 0; y < map.size.h; y++) if (sky.get(x, y) !== 1) return y;
  return map.size.h;
}

/** One world's plane: how far (cells) heapPlane looks round where a pellet is dropped for a cell with room, when that one has none. */
export const SPOIL_SEARCH = 16;

/**
 * One world's plane (U3c, docs/one-world.md §4): heap a pellet of spoil dropped at cell (x, y), as a 2D sandpile.
 * It slides to its lowest neighbour (outward from the nearest hole on a tie, then the first
 * way round) while that one is a level or more lower: at most a level a cell, ≈41°, the angle of repose of damp soil. Round
 * every hole in `holes` (plane cells, every nest's), a cell holds at most (hex distance to the hole − 1) levels: a ring whose
 * inner side slopes down into the hole at that same angle, a crater with the hole open at its bottom, so no mound ever
 * buries a way in, a rival's included. It is the sandpile's physics, not an ant's choice.
 * Only open ground takes spoil, and food on a heaped cell stays on top. Where (x, y) has no room (rock, the crater, off
 * the plane) it lands on the nearest cell that has, within SPOIL_SEARCH. Returns the cell heaped, or null if none had room.
 */
export function heapPlane(map: WorldMap, x: number, y: number, holes: readonly { x: number; y: number }[]): [number, number] | null {
  const spoil = map.spoil;
  if (!spoil) return null;
  // The most a cell may hold: none on rock or off the plane; within a hole's ring, a level less than its distance from it.
  const cap = (cx: number, cy: number): number => {
    if (!inBounds(map, cx, cy) || rockAt(map, cx, cy) !== OPEN) return 0;
    let c = 0xffff;
    for (const h of holes) c = Math.min(c, hexDistance(cx, cy, h.x, h.y) - 1);
    return c;
  };
  const room = (cx: number, cy: number): boolean => spoil.get(cx, cy) < cap(cx, cy);
  // From the hole nearest (cx, cy): the tie-break outward.
  const fromHole = (cx: number, cy: number): number => {
    let d = Infinity;
    for (const h of holes) d = Math.min(d, hexDistance(cx, cy, h.x, h.y));
    return d;
  };
  let cx = x;
  let cy = y;
  if (!room(cx, cy)) {
    const offs = discOffsets(SPOIL_SEARCH)[cy & 1] as Int16Array;
    let found = false;
    for (let k = 2; k < offs.length; k += 2) {
      const tx = cx + offs[k];
      const ty = cy + offs[k + 1];
      if (room(tx, ty)) {
        cx = tx;
        cy = ty;
        found = true;
        break;
      }
    }
    if (!found) return null;
  }
  for (let guard = 0; guard < 0xffff; guard++) {
    const here = spoil.get(cx, cy);
    let bx = -1;
    let by = -1;
    let bh = here; // a neighbour must be a level lower or more: below here − 1 + 1
    let bd = -1;
    for (let d = 0; d < 6; d++) {
      const tx = nx(cx, cy, d);
      const ty = ny(cy, d);
      if (!room(tx, ty)) continue;
      const th = spoil.get(tx, ty);
      if (th > here - 1) continue;
      const td = fromHole(tx, ty);
      if (th < bh || (th === bh && td > bd)) {
        bx = tx;
        by = ty;
        bh = th;
        bd = td;
      }
    }
    if (bx < 0) break;
    cx = bx;
    cy = by;
  }
  spoil.set(cx, cy, spoil.get(cx, cy) + 1);
  map.moundCells = (map.moundCells ?? 0) + 1;
  return [cx, cy];
}

/** One world's plane: take a pellet of spoil off cell (x, y) (an ant picks one up). False if it holds none. */
export function takePlane(map: WorldMap, x: number, y: number): boolean {
  const spoil = map.spoil;
  if (!spoil) return false;
  const h = spoil.get(x, y);
  if (h <= 0) return false;
  spoil.set(x, y, h - 1);
  map.moundCells = (map.moundCells ?? 0) - 1;
  return true;
}
