// One world (docs/one-world.md §2, U2 `ja-lp4.2`), pure: the plane and the curtain, generated together, with no
// simulation yet. The plane is the surface, today's open map. The curtain is everything underground: one vertical
// sheet hanging under the line through the nests' holes (transect.ts), laid out as a side view so today's renderer,
// nest digger and chambers work on it unchanged:
//
//   rows 0 … CURTAIN_SKY − 1   sky (AIR): room for the mound's cut (one-world §4)
//   row  CURTAIN_SKY            the ground strip: a copy of the plane under the line, P(s) column by column. The
//                               surface belongs to the plane alone; this row is only how the side view shows it, and
//                               refreshStrip copies it again (nothing is simulated twice, one-world §2)
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
  chamberAt,
  disc,
  foundNest,
  generateWorld,
  hash4,
  heightAt,
  mulberry32,
  OPEN,
  OPEN_WORLD,
  reachable,
  ROCK,
  rockAt,
  rockCut,
  setRock,
  SIDE_WORLD,
  SOIL,
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
 */
export function generateCurtain(seed: number, plane: WorldMap, line: Transect): WorldMap {
  const w = line.sMax - line.sMin + 1;
  const h = CRUST + CURTAIN_DEPTH;
  const size = { w, h };
  const cut = rockCut(SIDE_WORLD.rockiness);
  const scut = soilCut(SIDE_WORLD.soil);
  const gs = groundSeed(seed);
  const rock = new Uint8Array(w * h);
  for (let y = 0; y < h; y++)
    for (let col = 0; col < w; col++) {
      const i = y * w + col;
      if (y <= STRIP) {
        rock[i] = AIR; // the strip is written from the plane below, once the nests are dug
        continue;
      }
      // The side view's ground (generateSideWorld), by the line's column s and the row: stones from a few rows down,
      // more of them deeper; cavities only well below the crust.
      const depth = y - CRUST;
      const s = sOf(line, col);
      const wx = centreX(s, y);
      const wy = centreY(y);
      const stone = depth > 3 && heightAt(gs, wx, wy) + 0.06 * Math.min(1, depth / 200) > cut;
      rock[i] = stone ? ROCK : depth > 8 && chamberAt(gs, wx, wy) >= scut ? OPEN : SOIL;
    }
  const curtain = worldFromArrays(size, [{ x: 0, y: 0, r: 3 }], { rock, seed });
  curtain.sky = new ChunkLayer((n) => new Uint8Array(n), 0);
  for (let y = 0; y <= STRIP; y++) for (let col = 0; col < w; col++) curtain.sky.set(col, y, 1);
  curtain.loose = new ChunkLayer((n) => new Uint8Array(n), 0);
  curtain.moundCells = 0;
  curtain.chambers = new Chambers();
  refreshStrip(curtain, plane, line);

  // Each nest: a hole in the crust at its column, a slanted shaft and a royal chamber, dug as the side view digs them.
  // Each draws its shaft's slant from its own stream, keyed by its hole, so a nest is dug the same when the line grows.
  const nests: Nest[] = line.sHole.map((s, k) => foundNest(curtain, colOf(line, s), k, mulberry32(hash4(seed, 81, line.holes[k]!.x, line.holes[k]!.y))));
  curtain.nest = nests[0]!;
  curtain.nests = nests;
  const nearNest = (x: number, y: number, d: number) => nests.some((n) => Math.hypot(x - n.x, y - n.y) < d || Math.hypot(x - n.entrance!.x, y - n.entrance!.y) < d);

  // Food below ground: pockets in the soil, as the side view's, keyed by blocks of the line's columns (s) so they stay
  // put when the line grows.
  const o = SIDE_WORLD;
  for (let by = 0; by < Math.ceil(h / 64); by++)
    for (let bs = Math.floor(line.sMin / 64); bs <= Math.floor(line.sMax / 64); bs++) {
      const r = mulberry32(hash4(seed, 79, bs, by));
      const count = Math.floor(o.patchesPerChunk) + (r() < o.patchesPerChunk % 1 ? 1 : 0);
      for (let p = 0; p < count; p++) {
        for (let tries = 0; tries < 12; tries++) {
          const row = by * 64 + Math.floor(r() * 64);
          const s = bs * 64 + Math.floor(r() * 64);
          if (s < line.sMin || s > line.sMax || row >= h - 3 || row < CRUST + 10) continue;
          const col = colOf(line, s);
          const x = centreX(col, row);
          const y = centreY(row);
          const radius = 2 + r() * 2;
          if (nearNest(x, y, o.foodMinDist + radius + 1)) continue;
          disc(curtain, x, y, radius, (fx, fy) => {
            if (fy < CRUST + 4) return;
            setRock(curtain, fx, fy, OPEN);
            curtain.food.set(fx, fy, o.foodPerCell);
          });
          break;
        }
      }
    }
  // Only food the first colony can reach by walking or digging; the strip's food is the plane's, not counted here.
  const reach = reachable(curtain, curtain.nest.x, curtain.nest.y, "diggable");
  let total = 0;
  for (let y = CRUST; y < h; y++)
    for (let col = 0; col < w; col++) {
      const v = curtain.food.get(col, y);
      if (!v) continue;
      if (!reach[y * w + col]) curtain.food.set(col, y, 0);
      else total += v;
    }
  curtain.foodTotal = total;
  curtain.foodLeft = total;
  // Digging the holes re-derived the walkway round them: write the plane's strip and the sky above it again.
  refreshStrip(curtain, plane, line);
  return curtain;
}

/**
 * Copy the plane under the line into the curtain's ground strip (row STRIP): each column s gets P(s)'s ground (open, or
 * rock for anything solid or off the plane) and its food, and the rows above are sky again. The strip is how the side
 * view shows the surface; the plane is the only place it is simulated.
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
    curtain.sky!.set(col, STRIP, 1);
    for (let y = 0; y < STRIP; y++) {
      curtain.rock.set(col, y, AIR);
      curtain.sky!.set(col, y, 1);
    }
  }
}
