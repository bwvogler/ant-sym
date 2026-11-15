import { test } from "node:test";
import assert from "node:assert/strict";
import { APHID, aphidCells, aphidCount, aphidLife, stepAphids, type AphidClump } from "../../aphids.ts";
import { Builder } from "../../builder.ts";
import { Game } from "../../game.ts";
import { centreX, centreY } from "../../hex.ts";
import { PLANE } from "../../vocab.ts";
import { mulberry32, OPEN, rockAt, type WorldMap } from "../../world.ts";
import { smallOne } from "../builders.ts";

// The builder's aphid clump (docs/aphids.md "The mechanic", PRD §78, ja-nzkg.2): the aphids' body. Honeydew made on its cells
// at a rate by its aphids, up to a cap; a life that grows, then crashes; put down, grown by a drag, undone, saved.

const game = () => new Game(smallOne(7), { antCount: 20, rivalAnts: 20, regrow: 0 }, mulberry32(3));
const pt = (x: number, y: number) => ({ x: centreX(x, y), y: centreY(y) });

/** An open cell on the plane well away from the holes, with open cells round it. */
function openSpot(g: Game): { x: number; y: number } {
  const map = g.layers[PLANE] as WorldMap;
  const holes = g.colonies.map((c) => c.holeCells[c.params.nest]!);
  for (let y = 10; y < map.size.h - 10; y++)
    for (let x = 10; x < map.size.w - 10; x++) {
      let ok = map.food.get(x, y) === 0 && holes.every((h) => Math.hypot(h.px - x, h.py - y) > 12);
      for (let dy = -3; dy <= 3 && ok; dy++) for (let dx = -3; dx <= 3 && ok; dx++) ok = rockAt(map, x + dx, y + dy) === OPEN;
      if (ok) return pt(x, y);
    }
  throw new Error("no open spot");
}

test("the life curve: 1 when put down, APHID.peak at peakAt, 0 from endAt", () => {
  assert.equal(aphidLife(0), 1);
  assert.ok(Math.abs(aphidLife(APHID.peakAt) - APHID.peak) < 1e-9);
  assert.ok(aphidLife(APHID.peakAt / 2) > 1 && aphidLife(APHID.peakAt / 2) < APHID.peak);
  assert.ok(aphidLife((APHID.peakAt + APHID.endAt) / 2) < APHID.peak);
  assert.equal(aphidLife(APHID.endAt), 0);
  assert.equal(aphidLife(APHID.endAt + 10), 0);
});

test("a clump makes honeydew at its aphids' rate, on its emptiest cell, never past the cap", () => {
  const g = game();
  const map = g.layers[PLANE] as WorldMap;
  const o = openSpot(g);
  const b = new Builder(g);
  assert.ok(b.apply({ tool: "aphids", layer: PLANE, points: [o] }) > 0);
  const c = g.aphids[0]!;
  const cells = c.cells.length / 2;
  assert.equal(c.start, cells * APHID.perCell);
  const before = map.foodTotal;
  const w = { aphids: g.aphids, layers: g.layers };
  // One second: start × honey units owed; whole units laid.
  stepAphids(w, 1);
  const made = map.foodTotal - before;
  assert.equal(made, Math.floor(c.start * aphidLife(1) * APHID.honey + 1e-9));
  // Long enough that every cell would overflow: each holds no more than the cap.
  for (let k = 0; k < 200; k++) stepAphids(w, 0.5);
  for (let k = 0; k < c.cells.length; k += 2) assert.ok(map.food.get(c.cells[k]!, c.cells[k + 1]!) <= APHID.cellCap);
  assert.ok(map.food.get(c.cells[0]!, c.cells[1]!) > 0);
});

test("a clump's aphids grow, crash and go; its honeydew stays", () => {
  const g = game();
  const o = openSpot(g);
  new Builder(g).apply({ tool: "aphids", layer: PLANE, points: [o] });
  const c = g.aphids[0]!;
  const w = { aphids: g.aphids, layers: g.layers };
  let peak = 0;
  for (let t = 0; t < APHID.endAt + 5; t += 1) {
    stepAphids(w, 1);
    if (w.aphids.length) peak = Math.max(peak, aphidCount(w.aphids[0]!));
  }
  assert.ok(peak > c.start * 2, `peak ${peak}`);
  assert.equal(w.aphids.length, 0, "gone once its aphids are");
  assert.ok((g.layers[PLANE] as WorldMap).food.get(c.cells[0]!, c.cells[1]!) > 0, "its honeydew lies on");
});

test("a drag grows one clump; undo takes the drag's cells, then the clump", () => {
  const g = game();
  const o = openSpot(g);
  const b = new Builder(g);
  b.begin();
  assert.ok(b.apply({ tool: "aphids", layer: PLANE, points: [o] }, true) > 0);
  const first = g.aphids[0]!.cells.length;
  assert.ok(b.apply({ tool: "aphids", layer: PLANE, points: [{ x: o.x + 2.5, y: o.y }] }, true) > 0);
  assert.equal(g.aphids.length, 1, "one clump");
  assert.ok(g.aphids[0]!.cells.length > first, "grown");
  assert.equal(g.aphids[0]!.start, (g.aphids[0]!.cells.length / 2) * APHID.perCell);
  assert.ok(b.undo());
  assert.equal(g.aphids.length, 0, "one undo takes the whole drag");
});

test("aphids go only on open ground", () => {
  const g = game();
  const map = g.layers[PLANE] as WorldMap;
  let rock: { x: number; y: number } | null = null;
  for (let y = 5; y < map.size.h - 5 && !rock; y++)
    for (let x = 5; x < map.size.w - 5 && !rock; x++) {
      let all = true;
      for (let dy = -2; dy <= 2 && all; dy++) for (let dx = -2; dx <= 2 && all; dx++) all = rockAt(map, x + dx, y + dy) !== OPEN;
      if (all) rock = pt(x, y);
    }
  assert.ok(rock, "a patch of rock");
  assert.equal(new Builder(g).apply({ tool: "aphids", layer: PLANE, points: [rock!] }), 0);
  assert.equal(g.aphids.length, 0);
});

test("aphidCells: the living clumps' cells on a layer", () => {
  const clump: AphidClump = { layer: PLANE, cells: [3, 4, 5, 6], start: 6, eaten: 0, age: 0, owed: 0 };
  const s = aphidCells([clump], PLANE);
  assert.ok(s.has((4 + 0x8000) * 0x10000 + (3 + 0x8000)));
  assert.equal(s.size, 2);
  assert.equal(aphidCells([clump], PLANE + 1).size, 0);
  assert.equal(aphidCells([{ ...clump, eaten: 6 }], PLANE).size, 0, "a clump with no aphids left has none");
});

test("a game's clumps save and load; a game with none saves as before", () => {
  const g = game();
  assert.ok(!("aphids" in g.save()), "no aphids, no field");
  new Builder(g).apply({ tool: "aphids", layer: PLANE, points: [openSpot(g)] });
  for (let k = 0; k < 30 * 20; k++) g.tick(1 / 30);
  const saved = JSON.parse(JSON.stringify(g.save()));
  const h = game();
  h.load(saved);
  assert.deepEqual(h.aphids, g.aphids);
  for (let k = 0; k < 30 * 5; k++) {
    g.tick(1 / 30);
    h.tick(1 / 30);
  }
  assert.deepEqual(h.aphids, g.aphids, "and step alike after");
});

test("the aphid odour: built from the living clumps, gone with them; an ant within range smells it and turns toward it", () => {
  const g = game();
  const c = g.colonies[0]!;
  const o = openSpot(g);
  g.tick(1 / 30);
  assert.equal(g.aphidOdour.dist, null, "no clump, no odour");
  new Builder(g).apply({ tool: "aphids", layer: PLANE, points: [o] });
  g.tick(1 / 30);
  assert.ok(g.aphidOdour.dist, "built");
  assert.equal(c.aphidOdour, g.aphidOdour, "the colonies share it");
  // An ant 4 units east of the clump's centre, heading north: the strongest smell is west, so it turns toward the clump.
  const i = [...Array(c.n).keys()].find((j) => c.alive[j])!;
  c.bind(PLANE);
  c.x[i] = o.x + 4;
  c.y[i] = o.y;
  const north = -Math.PI / 2;
  assert.ok(c.smellsAphids(i, north, Math.PI / 4, 1), "smelt within range");
  assert.ok(c.plumeTurn < 0, `turned toward the clump (west of north): ${c.plumeTurn}`);
  // Out of its range it smells nothing.
  c.x[i] = o.x + c.params.aphidPlume + 6;
  assert.ok(!c.smellsAphids(i, north, Math.PI / 4, 1));
  // A species deaf to it (aphidPlume 0, the desert ant's) smells nothing even beside the clump.
  c.x[i] = o.x + 2;
  const keep = c.params.aphidPlume;
  c.params.aphidPlume = 0;
  assert.ok(!c.smellsAphids(i, north, Math.PI / 4, 1));
  c.params.aphidPlume = keep;
  c.bind(c.home);
  // Undone, the clump's odour goes at the next tick.
  g.aphids.length = 0;
  g.tick(1 / 30);
  assert.equal(g.aphidOdour.dist, null);
});
