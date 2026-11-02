import { test } from "node:test";
import assert from "node:assert/strict";
import { Chambers } from "../chambers.ts";
import { Colony, FLOOR_PER_ANT, ROOMY_DIG } from "../colony.ts";
import { Game } from "../game.ts";
import { nx, ny } from "../hex.ts";
import { digCell, fillCell, generateSideWorld, groundTop, mulberry32, OPEN, rockAt, SOIL } from "../world.ts";

// Nest slice 2 (docs/nest-and-home.md §3.2): the side view's nest is chambers the ants dig, regulated by floor per worker.

const SMALL = { size: { w: 256, h: 160 }, nestGap: 120, surface: 40, nestCount: 1 };

test("chambers: the founding chamber is the colony's royal one with a floor; a floor cell dug out from under stops being floor; a filled cell leaves", () => {
  const map = generateSideWorld(2, SMALL);
  const ch = map.chambers!;
  const c0 = ch.list[0]!;
  assert.equal(c0.colony, 0);
  assert.equal(c0.role, "royal");
  assert.ok(c0.cells > 40 && c0.floor > 0, `${c0.cells} cells, ${c0.floor} floor`);
  assert.equal(ch.floorOf[0], c0.floor);
  // A floor cell: dig the soil under it (south-west), and it is floor no more.
  let fx = -1;
  let fy = -1;
  for (let y = 0; y < map.size.h && fx < 0; y++)
    for (let x = 0; x < map.size.w; x++)
      if (ch.at(x, y) === 0 && rockAt(map, x, y) === OPEN && rockAt(map, x - (1 - (y & 1)), y + 1) === SOIL && rockAt(map, x + (y & 1), y + 1) === SOIL) {
        fx = x;
        fy = y;
        break;
      }
  assert.ok(fx >= 0, "found a floor cell");
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
});

test("a crowded nest digs chambers: the founding one widens, new ones start off the tunnels, and floor grows", () => {
  const map = generateSideWorld(2, SMALL);
  const g = new Game(map, { antCount: 400, rival: false }, mulberry32(4));
  const ch = map.chambers!;
  const floor0 = ch.floorOf[0]!;
  for (let k = 0; k < 30 * 240; k++) g.tick(1 / 30);
  const mine = ch.list.filter((c) => c.colony === 0 && c.cells > 0);
  assert.ok(mine.length >= 3, `${mine.length} chambers`);
  assert.ok(ch.floorOf[0]! > floor0 * 3, `floor ${floor0} → ${ch.floorOf[0]}`);
  // No chamber was dug into another: widening and new chambers don't break into other passages (review of slice 2).
  for (let y = 0; y < map.size.h; y++)
    for (let x = 0; x < map.size.w; x++) {
      const a = ch.at(x, y);
      if (a < 0) continue;
      for (let d = 0; d < 6; d++) {
        const b = ch.at(nx(x, y, d), ny(y, d));
        assert.ok(b < 0 || b === a, `chambers ${a} and ${b} touch at (${x}, ${y})`);
      }
    }
  // Every chamber cell is open: backfill never fills one.
  for (let y = 0; y < map.size.h; y++) for (let x = 0; x < map.size.w; x++) if (ch.at(x, y) >= 0) assert.equal(rockAt(map, x, y), OPEN, `chamber cell (${x}, ${y}) filled`);
  // Tschinkel: the gap from a chamber to the one above it (in the same stack: overlapping columns) grows with depth.
  const gaps = mine
    .map((b) => {
      let gap = Infinity;
      for (const a of mine) if (a.floorRow < b.floorRow && a.x1 >= b.x0 && a.x0 <= b.x1) gap = Math.min(gap, b.floorRow - a.floorRow);
      return { depth: b.floorRow - groundTop(map, Math.round((b.x0 + b.x1) / 2)), gap };
    })
    .filter((x) => x.gap < Infinity)
    .sort((p, q) => p.depth - q.depth);
  const half = Math.floor(gaps.length / 2);
  const mean = (xs: { gap: number }[]) => xs.reduce((s, x) => s + x.gap, 0) / xs.length;
  assert.ok(gaps.length >= 4, `${gaps.length} stacked chambers`);
  assert.ok(mean(gaps.slice(half)) > mean(gaps.slice(0, half)), `gap above, shallower half ${mean(gaps.slice(0, half)).toFixed(1)} vs deeper half ${mean(gaps.slice(half)).toFixed(1)}`);
});

test("a roomy nest barely digs (ja-wii): the same few ants dig far less when their chambers have floor enough", () => {
  const dug = (chambers: boolean) => {
    const map = generateSideWorld(2, SMALL);
    if (!chambers) map.chambers = undefined; // no chambers: never roomy (as before slice 2)
    const c = new Colony(map, { antCount: 30, maxAnts: 30 }, mulberry32(6));
    for (let k = 0; k < 30 * 120; k++) c.tick(1 / 30);
    return c.soilDug;
  };
  const roomy = dug(true);
  const before = dug(false);
  assert.ok(30 * FLOOR_PER_ANT < 6, "30 ants want less floor than the founding chamber has: roomy");
  assert.ok(roomy < before * 0.5, `roomy ${roomy} vs ${before}`);
  // …but at about ROOMY_DIG, not its square (an aimed face was gated twice: review of slice 2).
  assert.ok(roomy > before * ROOMY_DIG, `roomy ${roomy} vs ${before}: damped too hard`);
});
