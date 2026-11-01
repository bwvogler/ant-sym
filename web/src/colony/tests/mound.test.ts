import { test } from "node:test";
import assert from "node:assert/strict";
import { SWELL } from "../colony.ts";
import { Game } from "../game.ts";
import { CELL, cellOf } from "../hex.ts";
import { generateSideWorld, groundTop, heapMound, isSky, mulberry32, OPEN, reachable, rockAt, SOIL } from "../world.ts";

// The mound above ground (MR 14): pellets brought out become loose soil heaped as a sandpile round the hole.

const SMALL = { size: { w: 256, h: 160 }, surface: 60, relief: 0, nestCount: 1 };

test("a sandpile round the hole: slopes of at most a row per column (≈41°), a funnel crater with the hole open, the walkway riding on top, food lifted", () => {
  const map = generateSideWorld(1, SMALL);
  cellOf(map.nest.entrance!.x, map.nest.entrance!.y);
  const ex = CELL[0] as number;
  const ey = CELL[1] as number;
  const top0 = Array.from({ length: map.size.w }, (_, x) => groundTop(map, x));
  // Food on the walkway three columns out: it ends up on top of the mound, not buried.
  const fy = groundTop(map, ex + 3) - 1;
  map.food.set(ex + 3, fy, 5);
  const rng = mulberry32(2);
  let placed = 0;
  for (let k = 0; k < 900; k++) if (heapMound(map, ex, rng() < 0.5 ? -1 : 1, Math.floor(rng() * 3))) placed++;
  assert.equal(placed, 900);
  let loose = 0;
  for (let y = 0; y < map.size.h; y++)
    for (let x = 0; x < map.size.w; x++)
      if (map.loose!.get(x, y)) {
        loose++;
        assert.equal(rockAt(map, x, y), SOIL, "loose soil is soil");
        assert.ok(!isSky(map, x, y), "and ground, not sky");
      }
  assert.equal(loose, 900);
  const hole = groundTop(map, ex);
  for (let x = ex - 60; x < ex + 60; x++) {
    const h = top0[x]! - groundTop(map, x); // how high the mound stands in column x
    assert.ok(h >= 0);
    if (x !== ex) assert.ok(hole - groundTop(map, x) <= Math.abs(x - ex) - 1 || h === 0, `column ${x}: inside the funnel's slope`);
    if (top0[x] === top0[x + 1] && x !== ex && x + 1 !== ex) assert.ok(Math.abs(groundTop(map, x) - groundTop(map, x + 1)) <= 1, `columns ${x}–${x + 1}: at most a row apart`);
    const y = groundTop(map, x) - 1;
    assert.equal(rockAt(map, x, y), OPEN, `column ${x}: a walkway cell on top`);
  }
  assert.equal(groundTop(map, ex), top0[ex], "the hole's column is never heaped");
  assert.equal(rockAt(map, ex, ey), OPEN, "the entrance stays open");
  assert.ok(Math.max(...Array.from({ length: 40 }, (_, k) => top0[ex - 20 + k]! - groundTop(map, ex - 20 + k))) > 10, "a mound you can see: over ten rows high");
  let food = 0;
  for (let y = 0; y < map.size.h; y++) for (let x = 0; x < map.size.w; x++) food += map.food.get(x, y) > 0 && isSky(map, x, y) && x === ex + 3 ? map.food.get(x, y) : 0;
  assert.equal(food, 5, "the food on the walkway was lifted on top, not buried");
});

test("in a game, every pellet brought out is on the mound (× SWELL), loose soil is never dug again, and the way in stays open", () => {
  const map = generateSideWorld(2, { size: { w: 320, h: 200 }, nestCount: 1 });
  const g = new Game(map, { antCount: 300 }, mulberry32(7));
  let seen = 0;
  for (let k = 0; k < 30 * 200; k++) {
    g.tick(1 / 30);
    if (k % 300 === 0) {
      let loose = 0;
      for (let y = 0; y < map.size.h; y++) for (let x = 0; x < map.size.w; x++) loose += map.loose!.get(x, y) && rockAt(map, x, y) === SOIL ? 1 : 0;
      assert.equal(loose, g.player.moundCells, "every heaped cell is still there: loose soil isn't dug");
      seen = loose;
    }
  }
  const c = g.player;
  assert.ok(c.soilOut > 50 && seen > 50, `${c.soilOut} pellets out, ${seen} cells heaped`);
  assert.equal(c.moundCells, Math.floor(c.soilOut * SWELL + 1e-9), "the mound holds every pellet, loosened by SWELL");
  let carried = 0;
  for (let i = 0; i < c.n; i++) carried += c.alive[i]! && c.pellet[i]! ? 1 : 0;
  assert.equal(c.soilDug, c.soilOut + c.soilFilled + carried + c.soilLost, "dug = mound + filled + carried + lost");
  const walk = reachable(map, c.nest.x, c.nest.y, "open");
  cellOf(c.nest.entrance!.x, c.nest.entrance!.y);
  assert.equal(walk[(CELL[1] as number) * map.size.w + (CELL[0] as number)], 1, "the chamber is still joined to the entrance");
});
