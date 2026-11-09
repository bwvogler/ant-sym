// One world (docs/one-world.md §2, U2 `ja-lp4.2`), pure: the plane and the curtain, generated together, with no
// simulation yet. The plane is the surface, today's open map. The curtain is everything underground: one vertical
// sheet hanging under the line through the nests' holes (transect.ts), laid out as a side view so today's renderer,
// nest digger and chambers work on it unchanged:
//
//   rows 0 … CURTAIN_SKY − 1   sky (AIR): room for the mound's cut (one-world §4)
//   row  CURTAIN_SKY            the ground strip: a copy of the plane under the line, P(s) column by column. The
//                               surface belongs to the plane alone; this row is only how the side view shows it, and
//                               refreshStrip copies it again (nothing is simulated twice, one-world §2). The sky and
//                               the strip are the map's surfaceRows: digging below never re-derives them
//   row  CRUST                  the crust, the curtain's row 0: solid except at a hole, the only way between the layers
//   below it, CURTAIN_DEPTH rows of soil, stones and a few cavities, as the side view's ground.
//
// The curtain's storage column is s − line.sMin (colOf). Its terrain depends on s and the row, never on the storage
// column, so the ground under a column keeps its stones and cavities when the line grows (U4); growing at V₀ lowers
// sMin, and U4 shifts the storage to match.

import { ChunkLayer } from "./chunks.ts";
import { Chambers } from "./chambers.ts";
import { CELL, cellOf, centreX, centreY } from "./hex.ts";
import { cellAt, makeTransect, type Transect } from "./transect.ts";
import {
  AIR,
  buryPockets,
  foundNest,
  generateWorld,
  groundCell,
  hash4,
  keepReachableFood,
  mulberry32,
  OPEN,
  OPEN_WORLD,
  ROCK,
  rockAt,
  rockCut,
  SIDE_WORLD,
  soilCut,
  worldFromArrays,
  type Nest,
  type WorldMap,
  type WorldOptions,
} from "./world.ts";

/** Rows of sky above the curtain's ground strip: room for the mound's cut (one-world §4). */
export const CURTAIN_SKY = 40;
/** The ground strip: the plane under the line, as the side view shows it. */
export const STRIP = CURTAIN_SKY;
/** The curtain's row 0, its crust: solid except at a hole. */
export const CRUST = CURTAIN_SKY + 1;
/** Rows of ground below the crust: as deep as the side view's ground (its 368 rows less ~64 of sky). */
export const CURTAIN_DEPTH = 300;

/** The plane, the curtain under the line, and the line itself. */
export interface OneWorld {
  seed: number;
  /** the surface: a top-down map (today's open map) */
  plane: WorldMap;
  /** everything underground, under the line, laid out as a side view (see the layout above) */
  curtain: WorldMap;
  /** the holes in order and the plane cell over each curtain column */
  line: Transect;
}

/** The curtain's storage column for line column s. */
export function colOf(line: Transect, s: number): number {
  return s - line.sMin;
}

/** The line column s of the curtain's storage column `col`. */
export function sOf(line: Transect, col: number): number {
  return col + line.sMin;
}

/**
 * A one-world map from a seed: the plane is `generateWorld(seed, OPEN_WORLD)` (with `plane` overriding options, e.g. a
 * smaller size for tests); its nests' holes, in order, make the line (Ink at V₀, Amber at V₁); the curtain is dug under
 * it. One or two nests: the game starts with two, and more come by founding beyond an end (U4).
 */
export function generateOneWorld(seed: number, opts: { plane?: Partial<WorldOptions> } = {}): OneWorld {
  const plane = generateWorld(seed, { ...OPEN_WORLD, ...opts.plane });
  if (plane.nests.length > 2) throw new Error(`generateOneWorld: ${plane.nests.length} nests; the line starts with one or two, and grows by founding`);
  const holes = plane.nests.map((n) => {
    cellOf(n.x, n.y);
    return { x: CELL[0]!, y: CELL[1]! };
  });
  const line = makeTransect(holes);
  return { seed, plane, line, curtain: generateCurtain(seed, plane, line) };
}

/** The salt of the curtain's ground noise: the plane's rock uses `seed` itself. */
const groundSeed = (seed: number): number => hash4(seed, 80, 0, 0);

/**
 * The curtain under `line` (one-world §2): the side view's ground rules, laid along the line instead of along a straight
 * ground line, with each nest's shaft and royal chamber dug from its hole, buried food in pockets, and the plane under
 * the line copied into the ground strip.
 *
 * `colonies[k]` is the colony whose hole is the line's k-th (default: k). The curtain's nests are indexed by colony, as
 * every map's are (Colony's `nest` param), so a colony keeps its nest and royal chamber when the line grows at V₀ and
 * the holes renumber; `nest` is colony 0's, the player's.
 *
 * Food: `foodTotal` and `foodLeft` count the buried food any colony can reach, walking or digging from its nest. The
 * strip's food is the plane's, shown here; the plane counts it, and nothing should take it from the curtain (U3 routes
 * the surface to the plane).
 */
export function generateCurtain(seed: number, plane: WorldMap, line: Transect, colonies: readonly number[] = line.holes.map((_, k) => k)): WorldMap {
  if (colonies.length !== line.holes.length || [...colonies].sort((a, b) => a - b).some((c, i) => c !== i)) throw new Error(`generateCurtain: colonies ${colonies.join(", ")} must number the ${line.holes.length} holes 0…${line.holes.length - 1}`);
  const w = line.sMax - line.sMin + 1;
  const h = CRUST + CURTAIN_DEPTH;
  const size = { w, h };
  const cut = rockCut(SIDE_WORLD.rockiness);
  const scut = soilCut(SIDE_WORLD.soil);
  const gs = groundSeed(seed);
  const rock = new Uint8Array(w * h);
  // Above the strip, sky; the strip is written by refreshStrip, below.
  rock.fill(AIR, 0, STRIP * w);
  for (let y = CRUST; y < h; y++)
    for (let col = 0; col < w; col++)
      // The side view's ground, by the line's column s and the row (not the storage column), below the crust.
      rock[y * w + col] = groundCell(gs, y - CRUST, centreX(sOf(line, col), y), centreY(y), cut, scut);
  const curtain = worldFromArrays(size, [{ x: 0, y: 0, r: 3 }], { rock, seed });
  curtain.sky = new ChunkLayer((n) => new Uint8Array(n), 0);
  for (let y = 0; y < CRUST; y++) for (let col = 0; col < w; col++) curtain.sky.set(col, y, 1);
  curtain.surfaceRows = CRUST;
  curtain.loose = new ChunkLayer((n) => new Uint8Array(n), 0);
  curtain.moundCells = 0;
  curtain.chambers = new Chambers();
  // The strip before the nests: the nest digger finds the ground under the sky, and never re-derives the strip.
  refreshStrip(curtain, plane, line);

  // Each nest: a hole in the crust at its column, a slanted shaft and a royal chamber, dug as the side view digs them.
  // Each draws its shaft's slant from its own stream, keyed by its hole, so a nest is dug the same when the line grows.
  // Spacing is founding's: the game's two holes lie ~140 apart, but holes HOLE_GAP_2D (12) apart can get royal chambers
  // that merge, as in the side view today (ja-tjo, before U4 founds on the curtain).
  const nests: Nest[] = [];
  // Dug in colony order, so each royal chamber's id is the same whichever end the line grew at.
  for (let c = 0; c < colonies.length; c++) {
    const k = colonies.indexOf(c);
    const hole = line.holes[k]!;
    nests[c] = foundNest(curtain, colOf(line, line.sHole[k]!), c, mulberry32(hash4(seed, 81, hole.x, hole.y)));
  }
  curtain.nest = nests[0]!;
  curtain.nests = nests;
  const nearNest = (x: number, y: number, d: number) => nests.some((n) => Math.hypot(x - n.x, y - n.y) < d || Math.hypot(x - n.entrance!.x, y - n.entrance!.y) < d);

  // Food below ground: pockets in the soil, as the side view's, keyed by blocks of the line's columns (s). Whether a pocket
  // is placed depends only on its block, its depth and the nests near it, never on where the line ends, so a column keeps
  // its pockets when the line grows; a pocket past the line's end is cut off by the map's edge.
  for (let by = 0; by < Math.ceil(h / 64); by++)
    // Blocks just past either end too: a pocket centred there (radius up to 4) can reach into the line's columns.
    for (let bs = Math.floor((line.sMin - 5) / 64); bs <= Math.floor((line.sMax + 5) / 64); bs++) {
      const r = mulberry32(hash4(seed, 79, bs, by));
      const at = () => {
        const row = by * 64 + Math.floor(r() * 64);
        const s = bs * 64 + Math.floor(r() * 64);
        return row >= h - 3 || row < CRUST + 10 ? null : ([colOf(line, s), row] as const);
      };
      buryPockets(curtain, SIDE_WORLD, r, at, () => CRUST + 4, nearNest);
    }
  // Only food some colony can reach from its nest, walking or digging; the strip's food is the plane's, not counted here.
  keepReachableFood(curtain, nests, "diggable", CRUST);
  return curtain;
}

/**
 * Copy the plane under the line into the curtain's ground strip (row STRIP): each column s gets P(s)'s ground (open, or
 * rock for anything solid or off the plane) and its food. The strip is how the side view shows the surface; the plane
 * is the only place it is simulated. The strip and the sky above it are the curtain's surfaceRows, which digging below
 * never re-derives, so only the strip needs copying again when the plane changes.
 */
export function refreshStrip(curtain: WorldMap, plane: WorldMap, line: Transect): void {
  for (let s = line.sMin; s <= line.sMax; s++) {
    const col = colOf(line, s);
    cellAt(line, s);
    const px = CELL[0]!;
    const py = CELL[1]!;
    const t = rockAt(plane, px, py);
    curtain.rock.set(col, STRIP, t === OPEN ? OPEN : ROCK);
    curtain.food.set(col, STRIP, t === OPEN ? plane.food.get(px, py) : 0);
  }
}
