import { test } from "node:test";
import assert from "node:assert/strict";
import { Chambers } from "../../chambers.ts";
import { BACKFILL, builtFloor, Colony, CURTAIN, FLOOR_PER_ANT, LIFESPAN, MIDDLE, refilled, ROOMY_DIG, YOUNG } from "../../colony.ts";
import { nx, ny } from "../../hex.ts";
import { digCell, fillCell, mulberry32, OPEN, rockAt, SOIL } from "../../world.ts";
import { smallOne } from "../builders.ts";

// Nest slice 2 (docs/nest-and-home.md §3.2): the nest under the plane is chambers the ants dig, regulated by floor per worker. The map is
// the curtain of seed 2's small one world, whose columns run from x0 (negative) to x0 + w.

test("chambers: the founding chamber is the colony's royal one with a floor; a floor cell dug out from under stops being floor; a filled cell leaves", () => {
  const map = smallOne(2).curtain;
  const ch = map.chambers!;
  const c0 = ch.list[0]!;
  assert.equal(c0.colony, 0);
  assert.equal(c0.role, "royal");
  assert.ok(c0.cells > 40 && c0.floor > 0, `${c0.cells} cells, ${c0.floor} floor`);
  assert.ok(c0.y0 < c0.y1 && c0.y1 === c0.floorRow, `rows ${c0.y0}–${c0.y1}, floor row ${c0.floorRow}`);
  assert.equal(ch.floorOf[0], c0.floor);
  // A floor cell: dig the soil under it (south-west), and it is floor no more.
  let fx = NaN; // the curtain's columns run negative: NaN is "none yet"
  let fy = NaN;
  for (let y = 0; y < map.size.h && Number.isNaN(fx); y++)
    for (let x = map.x0; x < map.x0 + map.size.w; x++)
      if (
        ch.at(x, y) === 0 &&
        rockAt(map, x, y) === OPEN &&
        rockAt(map, x - (1 - (y & 1)), y + 1) === SOIL &&
        rockAt(map, x + (y & 1), y + 1) === SOIL
      ) {
        fx = x;
        fy = y;
        break;
      }
  assert.ok(!Number.isNaN(fx), "found a floor cell");
  const before = c0.floor;
  // Ground under one side is still ground to stand on; dug out under both, it is floor no more.
  assert.ok(digCell(map, fx - (1 - (fy & 1)), fy + 1));
  assert.equal(c0.floor, before, "one side dug: still floor");
  assert.ok(digCell(map, fx + (fy & 1), fy + 1));
  assert.ok(c0.floor < before, "both dug: not floor (nor, maybe, a neighbour that stood on the same cell)");
  // Filled back, the chamber cell leaves the chamber (backfill never does this; the bookkeeping must still hold).
  const cells = c0.cells;
  assert.ok(fillCell(map, fx, fy));
  assert.equal(ch.at(fx, fy), -1);
  assert.equal(c0.cells, cells - 1);
  assert.equal(new Chambers().at(0, 0), -1);
  // A chamber's span shrinks when an end cell leaves it (review of slice 2: x0 and x1 never shrank).
  const row = c0.floorRow + 6;
  const side = map.chambers!.add(0, row, "store");
  for (let x = 20; x <= 24; x++) {
    digCell(map, x, row);
    map.chambers!.claim(side.id, x, row, (a, b) => rockAt(map, a, b) === OPEN);
  }
  assert.deepEqual([side.x0, side.x1], [20, 24]);
  fillCell(map, 24, row);
  fillCell(map, 20, row);
  assert.deepEqual([side.x0, side.x1, side.cells], [21, 23, 3]);
});

test("soil put back under a chamber cell stays put for good; put back elsewhere, only for BACKFILL.hold (floor fills were dug out again at 2–7× the rate of others)", () => {
  const map = smallOne(2).curtain;
  const ch = map.chambers!;
  const c0 = ch.list[0]!;
  // A cell under the founding chamber's floor, dug out (a tunnel down) and filled back at 10 s.
  let fx = NaN;
  for (let x = c0.x0; x <= c0.x1 && Number.isNaN(fx); x++)
    if (ch.at(x, c0.floorRow) === 0 && rockAt(map, nx(x, c0.floorRow, 1), ny(c0.floorRow, 1)) === SOIL) fx = nx(x, c0.floorRow, 1);
  const fy = c0.floorRow + 1;
  assert.ok(!Number.isNaN(fx), "a cell under the floor");
  const floor = c0.floor;
  assert.ok(digCell(map, fx, fy, 5));
  assert.ok(fillCell(map, fx, fy, 10));
  assert.equal(c0.floor, floor, "the floor is back");
  // A soil cell well away from any chamber, dug and filled back at the same time.
  let ox = -1;
  const oy = 120;
  for (let x = 4; x < 60 && ox < 0; x++) if (rockAt(map, x, oy) === SOIL) ox = x;
  assert.ok(ox >= 0 && Math.abs(ox - c0.x0) > 10, "a soil cell away from the nest");
  digCell(map, ox, oy, 5);
  assert.ok(fillCell(map, ox, oy, 10));
  const later = 10 + 10_000;
  assert.ok(builtFloor(map, fx, fy) && refilled(map, fx, fy, later, BACKFILL.hold), "floor put back is never dug");
  assert.ok(!builtFloor(map, ox, oy) && !refilled(map, ox, oy, later, BACKFILL.hold), "elsewhere the hold runs out");
  assert.ok(refilled(map, ox, oy, 11, BACKFILL.hold), "…but holds for a while");
  digCell(map, fx, fy, later); // a test (or a cave-in) digs it anyway: no longer put back
  assert.ok(!builtFloor(map, fx, fy));
});

test("a roomy nest digs less (ja-wii): the same few ants dig less when their chambers have floor enough", () => {
  // In the side view (eight games) a roomy nest dug 0.15-0.4 of a nest with no chambers. On one world most of the 30 ants are up on the
  // plane, and seeds 6-13 summed give 142 vs 215 (0.66); with the damping off (ROOMY_DIG = 1) the roomy nest digs 396 (1.84), so the
  // line is "less than with no chambers at all". Seeds 6-9 alone: 66 vs 104 (S2.3c).
  const dug = (chambers: boolean) => {
    let s = 0;
    for (const seed of [6, 7, 8, 9]) {
      const w = smallOne(2);
      if (!chambers) w.curtain.chambers = undefined; // no chambers: never roomy (as before slice 2)
      const c = new Colony(w.curtain, { antCount: 30, maxAnts: 30 }, mulberry32(seed), undefined, {
        plane: w.plane,
        line: w.line,
      });
      c.bind(CURTAIN);
      // All middle-aged (diggers, slice 6): this is about how much a nest digs, not who digs.
      for (let i = 0; i < c.n; i++) ((c.age[i] = ((YOUNG + MIDDLE) / 2) * LIFESPAN), (c.lifespan[i] = Infinity));
      for (let k = 0; k < 30 * 120; k++) c.tick(1 / 30);
      s += c.soilDug;
    }
    return s;
  };
  const roomy = dug(true);
  const before = dug(false);
  assert.ok(30 * FLOOR_PER_ANT < 6, "30 ants want less floor than the founding chamber has: roomy");
  assert.ok(roomy < before, `roomy ${roomy} vs ${before}`);
  // …but at about ROOMY_DIG, not its square (an aimed face was gated twice: review of slice 2).
  assert.ok(roomy > before * ROOMY_DIG, `roomy ${roomy} vs ${before}: damped too hard`);
});
