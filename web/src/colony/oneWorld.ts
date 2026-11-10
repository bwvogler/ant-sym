// One world (docs/one-world.md §2, U2 `ja-lp4.2`), pure: the plane and the curtain, generated together, with no
// simulation yet. The plane is the surface, today's open map. The curtain is everything underground: one vertical
// sheet hanging under the line through the nests' holes (transect.ts), laid out as a side view so today's renderer,
// nest digger and chambers work on it unchanged:
//
//   rows 0 … CURTAIN_SKY − 1   sky (AIR): room for the mound's cut (one-world §4; the mound itself is the plane's `spoil`)
//   row  CURTAIN_SKY            the ground strip, sky (AIR) too: the side view draws the plane under the line here, P(s)
//                               column by column, as it renders (one-world §8 item 6). The surface belongs to the plane
//                               alone and is stored nowhere else, so nothing is simulated twice (one-world §2). The sky
//                               and the strip are the map's surfaceRows: digging below never re-derives them, and an
//                               ant stepping up into them from a hole crosses onto the plane (colony.ts)
//   row  CRUST                  the crust, the curtain's row 0: solid except at a hole, the only way between the layers
//   below it, CURTAIN_DEPTH rows of soil, stones and a few cavities, as the side view's ground.
//
// The curtain's column is the line's s itself: its map starts at x0 = line.sMin (world.ts WorldMap.x0), which is
// negative once the line has a margin before V₀. Its terrain depends on s and the row, so the ground under a column
// keeps its stones and cavities when the line grows (U4), and growing at V₀ only lowers x0: nothing is renumbered.

import { ChunkLayer } from "./chunks.ts";
import { Chambers } from "./chambers.ts";
import { CELL, cellOf, centreX, centreY } from "./hex.ts";
import { type Cell, type End, grow, makeTransect, type Transect } from "./transect.ts";
import {
  AIR,
  buryPockets,
  foundNest,
  generateWorld,
  groundCell,
  hash4,
  keepReachableFood,
  mulberry32,
  nearNests,
  OPEN_WORLD,
  reachableFrom,
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
/** The ground strip's row: sky in the curtain, where the side view draws the plane under the line (P(s)). */
export const STRIP = CURTAIN_SKY;
/** The curtain's row 0, its crust: solid except at a hole. */
export const CRUST = CURTAIN_SKY + 1;
/** Rows of ground below the crust: about as deep as the side view's ground (its 368 rows under a ground line at row 64 ± 5: 299–309). */
export const CURTAIN_DEPTH = 300;

/** The plane, the curtain under the line, and the line itself. */
export interface OneWorld {
  seed: number;
  /** the surface: a top-down map (today's open map) */
  plane: WorldMap;
  /** everything underground, under the line, laid out as a side view (see the layout above) */
  curtain: WorldMap;
  /** the holes in order and the plane cell over each curtain column; a new line when the world grows (growWorld) */
  line: Transect;
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
  // The mound is the plane's (U3c): a height field of spoil, empty at the start.
  plane.spoil = new ChunkLayer((n) => new Uint16Array(n), 0);
  plane.moundCells = 0;
  return { seed, plane, line, curtain: generateCurtain(seed, line) };
}

/** The salt of the curtain's ground noise: the plane's rock uses `seed` itself. */
const groundSeed = (seed: number): number => hash4(seed, 80, 0, 0);

/**
 * The curtain under `line` (one-world §2): the side view's ground rules, laid along the line instead of along a straight
 * ground line, with each nest's shaft and royal chamber dug from its hole, and buried food in pockets. The ground strip
 * is sky, as the rows above it: the plane under the line is drawn there, not stored (one-world §8 item 6).
 *
 * `colonies[k]` is the colony whose hole is the line's k-th (default: k). The curtain's nests are indexed by colony, as
 * every map's are (Colony's `nest` param), so a colony keeps its nest and royal chamber when the line grows at V₀ and
 * the holes renumber; `nest` is colony 0's, the player's.
 *
 * Food: `foodTotal` and `foodLeft` count the buried food any colony can reach, walking or digging from its nest. The
 * surface's food is the plane's alone.
 */
export function generateCurtain(seed: number, line: Transect, colonies: readonly number[] = line.holes.map((_, k) => k)): WorldMap {
  if (colonies.length !== line.holes.length || [...colonies].sort((a, b) => a - b).some((c, i) => c !== i)) throw new Error(`generateCurtain: colonies ${colonies.join(", ")} must number the ${line.holes.length} holes 0…${line.holes.length - 1}`);
  const w = line.sMax - line.sMin + 1;
  const x0 = line.sMin;
  const h = CRUST + CURTAIN_DEPTH;
  const size = { w, h };
  const cut = rockCut(SIDE_WORLD.rockiness);
  const scut = soilCut(SIDE_WORLD.soil);
  const gs = groundSeed(seed);
  const rock = new Uint8Array(w * h);
  // The sky and the strip: AIR (the strip is drawn from the plane, not stored).
  rock.fill(AIR, 0, CRUST * w);
  for (let y = CRUST; y < h; y++)
    for (let s = x0; s < x0 + w; s++)
      // The side view's ground, by the line's column s and the row, below the crust.
      rock[y * w + s - x0] = groundCell(gs, y - CRUST, centreX(s, y), centreY(y), cut, scut);
  const curtain = worldFromArrays(size, [{ x: 0, y: 0, r: 3 }], { rock, seed, x0 });
  curtain.sky = new ChunkLayer((n) => new Uint8Array(n), 0);
  for (let y = 0; y < CRUST; y++) for (let s = x0; s < x0 + w; s++) curtain.sky.set(s, y, 1);
  curtain.surfaceRows = CRUST;
  curtain.loose = new ChunkLayer((n) => new Uint8Array(n), 0);
  curtain.moundCells = 0;
  curtain.chambers = new Chambers();

  // Each nest: a hole in the crust at its column, a slanted shaft and a royal chamber, dug as the side view digs them.
  // Each draws its shaft's slant from its own stream, keyed by its hole, so a nest is dug the same when the line grows.
  // Spacing is founding's: the game's two holes lie ~140 apart, and founding keeps HOLE_GAP_2D (16) between holes, at
  // which two founded royal chambers never share a cell (ja-tjo; at 12, 15 of 80 pairs on these curtains did).
  const nests: Nest[] = [];
  // Dug in colony order, so each royal chamber's id is the same whichever end the line grew at.
  for (let c = 0; c < colonies.length; c++) {
    const k = colonies.indexOf(c);
    const hole = line.holes[k]!;
    nests[c] = foundNest(curtain, line.sHole[k]!, c, mulberry32(hash4(seed, 81, hole.x, hole.y)));
  }
  curtain.nest = nests[0]!;
  curtain.nests = nests;
  const nearNest = nearNests(nests);

  // Food below ground: pockets in the soil, as the side view's, keyed by blocks of the line's columns (s). Whether a pocket
  // is placed depends only on its block, its depth and the nests near it, never on where the line ends, so a column keeps
  // its pockets when the line grows; a pocket past the line's end is cut off by the map's edge.
  buryAlong(curtain, seed, line.sMin, line.sMax, nearNest, () => CRUST + 4);
  // Only food some colony can reach from its nest, walking or digging, below the crust.
  keepReachableFood(curtain, nests, "diggable", CRUST);
  return curtain;
}

/**
 * The curtain's buried food for columns lo … hi: every 64-column block of s that a pocket placed in it could reach (a
 * pocket's radius is up to 4), each from its own stream, as the side view's ground places them. `floor(s)`: no cell of a
 * pocket opens above that row of column s (Infinity: not at all, a column that keeps what it has).
 */
function buryAlong(curtain: WorldMap, seed: number, lo: number, hi: number, nearNest: (x: number, y: number, d: number) => boolean, floor: (s: number) => number): void {
  const h = curtain.size.h;
  for (let by = 0; by < Math.ceil(h / 64); by++)
    // Blocks just past either end too: a pocket centred there (radius up to 4) can reach into the line's columns.
    for (let bs = Math.floor((lo - 5) / 64); bs <= Math.floor((hi + 5) / 64); bs++) {
      const r = mulberry32(hash4(seed, 79, bs, by));
      const at = () => {
        const row = by * 64 + Math.floor(r() * 64);
        const s = bs * 64 + Math.floor(r() * 64);
        return row >= h - 3 || row < CRUST + 10 ? null : ([s, row] as const);
      };
      buryPockets(curtain, SIDE_WORLD, r, at, floor, nearNest);
    }
}

/** The curtain's ground at column s, every row: sky (rows 0 … CRUST − 1, the strip included), then the side view's ground. */
function curtainColumn(curtain: WorldMap, seed: number, s: number): void {
  const cut = rockCut(SIDE_WORLD.rockiness);
  const scut = soilCut(SIDE_WORLD.soil);
  const gs = groundSeed(seed);
  const sky = curtain.sky!;
  for (let y = 0; y < CRUST; y++) {
    curtain.rock.set(s, y, AIR);
    sky.set(s, y, 1);
  }
  for (let y = CRUST; y < curtain.size.h; y++) curtain.rock.set(s, y, groundCell(gs, y - CRUST, centreX(s, y), centreY(y), cut, scut));
}

/**
 * Grow one world by a new hole at plane cell `cell` beyond `end` (U4a, docs/one-world.md §3; Game.addColony), whose
 * founding canFound has allowed. The line grows (transect.ts grow): every existing s keeps its place, and the curtain
 * widens to the new line's columns (its x0 falls when it grows at V₀; nothing is renumbered). Its new columns get the
 * curtain's ground by (seed, s, row), sky, and the buried food of their 64-column blocks; the old columns keep their dug
 * state, rock and food (the strip is drawn from the line as it now runs: the old end's margin lies under the new
 * segment). The new nest goes on both layers: on the plane a nest of radius 3 round the hole, where nothing is dug (the
 * plane has no soil, and the founding rule put the hole on open ground joined to the main open ground: mainGround); in
 * the curtain a shaft and royal chamber dug from its hole, from the stream keyed by the hole, before the new columns' food, which keeps its distance from every nest. Only food a colony can reach in the new columns is kept and
 * counted (foodTotal and foodLeft grow by it). Returns the new nest's index in both maps' nests.
 */
export function growWorld(world: OneWorld, end: End, cell: Cell): number {
  const { seed, plane, curtain } = world;
  const old = world.line;
  const line = grow(old, end, cell);
  const fresh = (s: number) => s < old.sMin || s > old.sMax;
  curtain.x0 = line.sMin;
  curtain.size = { w: line.sMax - line.sMin + 1, h: curtain.size.h };
  for (let s = line.sMin; s <= line.sMax; s++) if (fresh(s)) curtainColumn(curtain, seed, s);
  world.line = line;
  // The nest, on both layers: its index is the colony's that will live there (the maps' nests are indexed by colony).
  const k = curtain.nests.length;
  const sHole = line.sHole[end === "start" ? 0 : line.sHole.length - 1]!;
  plane.nests.push({ x: centreX(cell.x, cell.y), y: centreY(cell.y), r: 3 });
  curtain.nests.push(foundNest(curtain, sHole, k, mulberry32(hash4(seed, 81, cell.x, cell.y))));
  // The new columns' food: their blocks' pockets, cut off at the old columns.
  const nearNest = nearNests(curtain.nests);
  const floor = (s: number) => (fresh(s) ? CRUST + 4 : Infinity);
  if (line.sMin < old.sMin) buryAlong(curtain, seed, line.sMin, old.sMin - 1, nearNest, floor);
  if (line.sMax > old.sMax) buryAlong(curtain, seed, old.sMax + 1, line.sMax, nearNest, floor);
  // Only what some colony can reach, walking or digging, in the new columns.
  const reach = reachableFrom(curtain, curtain.nests, "diggable");
  const w = curtain.size.w;
  let added = 0;
  for (let s = line.sMin; s <= line.sMax; s++) {
    if (!fresh(s)) continue;
    for (let y = CRUST; y < curtain.size.h; y++) {
      const v = curtain.food.get(s, y);
      if (!v) continue;
      if (!reach[y * w + s - line.sMin]) curtain.food.set(s, y, 0);
      else added += v;
    }
  }
  curtain.foodTotal += added;
  curtain.foodLeft += added;
  return k;
}

/**
 * Where a founding's hole may go on the plane (one-world §3 rule 4, owner 2026-11-10, PR #62 review D1): open ground
 * joined to the plane's main open ground, the region the world's holes share, so a founded colony can walk the surface
 * to the rest of the world. A queen who lands in a pocket closed in by rock walks on, within FOUND_RADIUS, to ground
 * that joins it (Game.addColony's nearestValid), as a real queen walks after landing to find a site. One reachability
 * pass over the plane from every hole on the line, per founding (~14 ms on the default plane; founding is rare). Every hole
 * is in that region (the generated nests share one, the largest, on seeds 1–300; a founding joins it), so any hole would
 * do as the start; starting from all of them keeps it so if that ever failed. Plane rock never changes (OPEN_WORLD has
 * no soil to dig), so the region could be cached per world; it isn't, since a pass per founding costs nothing that matters.
 */
export function mainGround(world: OneWorld): (x: number, y: number) => boolean {
  const { plane, line } = world;
  const reach = reachableFrom(
    plane,
    line.holes.map((v) => ({ x: centreX(v.x, v.y), y: centreY(v.y) })),
    "open",
  );
  const { x0 } = plane;
  const { w, h } = plane.size;
  return (x, y) => x >= x0 && y >= 0 && x < x0 + w && y < h && reach[y * w + x - x0] === 1;
}
