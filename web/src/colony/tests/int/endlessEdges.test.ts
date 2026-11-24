import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { aphidOdour, updateAphidOdour, type AphidClump } from "../../aphids.ts";
import { CountGrid, around, occupancy } from "../../battle.ts";
import { CHUNK_BITS } from "../../chunks.ts";
import { generateEndlessPlane } from "../../endlessMap.ts";
import { FeltGrid } from "../../hunger.ts";
import { inReachShared, freshReach } from "../../grid.ts";
import { CELL, cellOf, centreX, centreY } from "../../hex.ts";
import { Pheromones } from "../../pheromone.ts";
import { plumeAt, plumeFrame, updatePlume } from "../../plume.ts";
import { PLANE } from "../../colony.ts";
import { clampRow, OPEN, rockAt, topRow } from "../../world.ts";
import { believePlane } from "../../homing.ts";
import { siteAim } from "../../plane.ts";
import { STRAINS } from "../../fungus.ts";
import { ticks, DT } from "../builders.ts";
import { farGame } from "../farWorld.ts";

// The places the colony assumed an edge, on an endless plane far from the origin in both axes (PRD §66 E6.0.2, `ja-qpv.8`): a colony at
// (40,000, -40,000), past the nominal bounded size in x and below row 0 in y, senses, homes, lays scent, fights and spreads the fungus.

const FAR_X = 40000;
const FAR_Y = -40000;
const HEX_Y = Math.round(FAR_Y / 0.8660254037844386);

const games: { dispose?: () => void }[] = [];
afterEach(() => {
  games.length = 0;
});

test("scent is laid, read and spread across chunk borders at negative rows and far columns, with no clamp to the box", () => {
  const map = generateEndlessPlane(5);
  const ph = new Pheromones(map);
  // a cell on a chunk border so the spread has to cross it
  const cx = ((FAR_X >> CHUNK_BITS) << CHUNK_BITS) + 63;
  const cy = (HEX_Y >> CHUNK_BITS) << CHUNK_BITS; // a chunk's first row: its north neighbour is the chunk row above, whose index is below 0
  // an open cell near that border
  let ox = cx;
  while (rockAt(map, ox, cy) !== OPEN) ox--;
  ph.depositCell("home", ox, cy, 1);
  assert.equal(ph.read("home", centreX(ox, cy), centreY(cy)), 1, "a read at row < 0 is the level laid, not the −1 of an edge");
  for (let k = 0; k < 40; k++) ph.step(0.2);
  let beyond = 0;
  ph.fields.home.forEach((fx, fy, a) => {
    if (fy === (cy >> CHUNK_BITS) - 1) beyond += a.reduce((s, v) => s + v, 0);
    void fx;
  });
  assert.ok(
    beyond > 0,
    "scent crossed the chunk border into the row of chunks above (a negative chunk row, which an edge at row 0 would refuse)",
  );
  assert.ok(ph.total("home") > 0);
});

test("a species' food plume far from the origin is a window round its hole and reads at negative rows", () => {
  const { game, plane } = farGame(3, FAR_X, FAR_Y, 4);
  const c = game.colonies[0]!;
  cellOf(plane.nests[0]!.x, plane.nests[0]!.y);
  const frame = plumeFrame(CELL[0]!, CELL[1]!);
  // make some of the window's food exist, then build
  const sx = CELL[0]! + 30;
  const sy = CELL[1]! + 2;
  plane.food.set(sx, sy, 3);
  plane.foodLeft += 3;
  const plume = updatePlume(c, plane, 12, 0, frame);
  assert.equal(plume.length, frame.w * frame.h);
  assert.equal(plumeAt(plume, plane, 12, sx, sy, frame), 1, "1 on the food, at a row below 0");
  assert.ok(
    plumeAt(plume, plane, 12, sx + 3, sy, frame) > 0 || plumeAt(plume, plane, 12, sx - 3, sy, frame) > 0,
    "falls off over open ground",
  );
  assert.equal(plumeAt(plume, plane, 12, sx + 2000, sy, frame), 0, "outside its window it reads nothing");
});

test("the aphids' odour on an endless plane covers the clumps' box and reads far from the origin", () => {
  const { game, plane } = farGame(3, FAR_X, FAR_Y, 4);
  cellOf(plane.nests[0]!.x, plane.nests[0]!.y);
  const x = CELL[0]! + 20;
  const y = CELL[1]!;
  // an open row of cells for the clump
  const cells: number[] = [];
  for (let k = 0; k < 4; k++) {
    plane.rock.set(x + k, y, OPEN);
    cells.push(x + k, y);
  }
  const clump: AphidClump = { layer: PLANE, cells, start: 12, eaten: 0, age: 0, owed: 0 };
  const o = aphidOdour();
  updateAphidOdour(o, [clump], PLANE, plane, 10);
  assert.ok(o.dist && o.frame, "built over a window");
  assert.equal(o.frame!.w * o.frame!.h, o.dist!.length);
  assert.equal(plumeAt(o.dist!, plane, 10, x, y, o.frame!), 1);
  assert.ok(plumeAt(o.dist!, plane, 10, x + 6, y, o.frame!) > 0 || plumeAt(o.dist!, plane, 10, x - 6, y, o.frame!) > 0);
  void game;
});

test("the reach search and the surface rows know no top on an endless plane", () => {
  const map = generateEndlessPlane(5);
  assert.equal(topRow(map), -Infinity);
  assert.equal(clampRow(map, -123456), -123456);
  const { plane } = farGame(3, FAR_X, FAR_Y, 4);
  cellOf(plane.nests[0]!.x, plane.nests[0]!.y);
  const [x, y] = [CELL[0]!, CELL[1]!];
  assert.ok(y < 0, "the nest is below row 0");
  // along a row of open cells below 0 the straight-line reach is true; dig a short corridor to be sure
  for (let k = 0; k < 5; k++) plane.rock.set(x + k, y, OPEN);
  freshReach();
  assert.ok(inReachShared(plane, centreX(x, y), centreY(y), centreX(x + 3, y), centreY(y)));
  // a bend: reached through the window search, whose rows are all negative
  plane.rock.set(x + 2, y + 1, OPEN);
  freshReach();
  assert.ok(inReachShared(plane, centreX(x, y), centreY(y), centreX(x + 2, y + 1), centreY(y + 1)));
});

test("occupancy, the neighbourhood sum and the felt grids keep ants at negative rows where they are", () => {
  const { game } = farGame(3, FAR_X, FAR_Y, 8);
  const grid = new CountGrid();
  const c = game.colonies[0]!;
  occupancy(c, grid, PLANE);
  let onPlane = 0;
  let found = 0;
  for (let i = 0; i < c.n; i++)
    if (c.alive[i] && c.layer[i] === PLANE) {
      onPlane++;
      c.antCell(i);
      found += around(grid, game.map, CELL[0]!, CELL[1]!, 0);
    }
  // run until some are on the plane
  for (let k = 0; k < 600 && onPlane === 0; k++) {
    game.tick(DT);
    onPlane = 0;
    for (let i = 0; i < c.n; i++) if (c.alive[i] && c.layer[i] === PLANE) onPlane++;
  }
  occupancy(c, grid, PLANE);
  found = 0;
  for (let i = 0; i < c.n; i++)
    if (c.alive[i] && c.layer[i] === PLANE) {
      c.antCell(i);
      assert.ok(CELL[1]! < 0, "the ant is at a negative row");
      found += around(grid, game.map, CELL[0]!, CELL[1]!, 0);
    }
  assert.ok(onPlane > 0 && found >= onPlane, `${found} counted for ${onPlane} ants on the plane`);
  const f = new FeltGrid();
  f.put(40000, -300, 0.5);
  assert.equal(f.get(40000, -300), 0.5);
  assert.equal(f.near(40000, -300), 0.5);
});

test("a home belief and a remembered food site are not held to a box far from the origin", () => {
  const { game, plane } = farGame(3, FAR_X, FAR_Y, 6);
  const c = game.colonies[0]!;
  ticks(game, 90);
  let i = 0;
  while (i < c.n && !(c.alive[i] && c.layer[i] === PLANE)) i++;
  for (let k = 0; k < 900 && i >= c.n; k++) {
    game.tick(DT);
    i = 0;
    while (i < c.n && !(c.alive[i] && c.layer[i] === PLANE)) i++;
  }
  assert.ok(i < c.n, "an ant came out on the plane");
  c.bind(PLANE);
  c.search[i] = 30;
  c.searchA[i] = 1;
  c.driftSurf[i] = 0.3;
  c.odoSurf[i] = 400;
  c.x[i] = plane.nests[0]!.x + 120;
  c.y[i] = plane.nests[0]!.y - 90;
  const b = believePlane(c, i, plane.nests[0]!);
  assert.ok(b.x > 30000 && b.y < -30000, `belief ${b.x}, ${b.y} stays out where the nest is (a box clamp would have pulled y to 0)`);
  c.foodX[i] = 25;
  c.foodY[i] = -20;
  const aim = siteAim(c, i);
  assert.ok(Number.isFinite(aim));
});

test("a game far from the origin plays: ants forage and bring food home, the fungus spreads, nothing throws or clamps to the box", () => {
  const { game, plane } = farGame(3, FAR_X, FAR_Y, 60);
  const strain = STRAINS.findIndex((s) => s.id === "garden");
  const at = game.land(0, strain, { evolve: true });
  assert.ok(at.x > 30000 && at.y < -30000, `landed at ${at.x}, ${at.y}`);
  for (let k = 0; k < 90 * 30; k++) game.tick(DT);
  const total = game.colonies.reduce((s, c) => s + c.stored, 0);
  assert.ok(total > 0, `${total} food stored: foragers found food and carried it home far from the origin`);
  assert.ok(plane.foodLeft < plane.foodTotal, "food was taken from the plane's chunks");
  assert.ok(game.fungus.sporeCells > 0, "the fungus has spores on the plane");
  // every plane ant is near its colony's nest (none was pulled to the bounded box's corner)
  for (const c of game.colonies)
    for (let i = 0; i < c.n; i++)
      if (c.alive[i] && c.layer[i] === PLANE) {
        assert.ok(Math.abs(c.x[i]! - 40000) < 3000 && Math.abs(c.y[i]! + 40000) < 3000, `ant at ${c.x[i]}, ${c.y[i]}`);
      }
});
