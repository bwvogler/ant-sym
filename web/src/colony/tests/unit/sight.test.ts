import { test } from "node:test";
import assert from "node:assert/strict";
import { Colony, inReach } from "../../colony.ts";
import { mulberry32, OPEN, SOIL, worldFromArrays, type WorldMap } from "../../world.ts";
import { at, hexMap, nestAt, put } from "../hexmaps.ts";

// ja-juiu: food is sensed only through open ground. Sensed through soil, a buried pocket turned explorers off their tunnels
// three cells short of it (they steered at the food, into the wall), and no tunnel ever reached one.

test("inReach: through open ground within its steps, round a bend too; never into a sealed pocket", () => {
  const map = hexMap([
    "sssssssssss", //
    "s.........s",
    "sssssssss.s",
    "s.s.......s",
    "sssssssssss",
  ]);
  const reach = (a: [number, number], b: [number, number], steps?: number) =>
    inReach(map, at(...a).x, at(...a).y, at(...b).x, at(...b).y, steps);
  assert.equal(reach([1, 1], [4, 1]), true, "along the open row");
  assert.equal(reach([3, 3], [1, 3]), false, "(1, 3) is sealed off by the soil at (2, 3), two cells away");
  assert.equal(reach([7, 1], [8, 3]), true, "round the bend at (9, 2): three steps");
  assert.equal(reach([7, 1], [8, 3], 2), false, "the same bend with two steps");
  assert.equal(reach([1, 1], [7, 1]), false, "six steps: past its reach");
  assert.equal(reach([4, 1], [4, 1]), true, "its own cell");
});

test("inReach: SENSE_STEPS is 5, round a hairpin; rock seals a pocket as soil does", () => {
  const hairpin = hexMap(["ssssssss", "s......s", "ssssss.s", "s......s", "ssssssss"]);
  const reach = (map: WorldMap, a: [number, number], b: [number, number]) => inReach(map, at(...a).x, at(...a).y, at(...b).x, at(...b).y);
  assert.equal(reach(hairpin, [4, 1], [3, 3]), true, "five steps round the hairpin at (6, 2), two cells apart");
  assert.equal(reach(hairpin, [3, 1], [3, 3]), false, "six steps round it");
  const rock = hexMap(["#####", "#.#.#", "#####"]);
  assert.equal(reach(rock, [1, 1], [3, 1]), false, "(3, 1) is sealed off by the rock at (2, 1)");
});

const W = 26;
const H = 12;

/** A tunnel along row 7 from a chamber (x 2–4) to a dead end at x 15, and a food pocket buried up and ahead of its end. */
function buried(): WorldMap {
  const rock = new Uint8Array(W * H).fill(SOIL);
  const food = new Float32Array(W * H);
  for (let x = 2; x <= 15; x++) rock[7 * W + x] = OPEN;
  for (let y = 6; y <= 8; y++) for (let x = 2; x <= 4; x++) rock[y * W + x] = OPEN;
  for (const [x, y] of [
    [17, 4],
    [18, 4],
    [17, 5],
    [18, 5],
  ]) {
    rock[y * W + x] = OPEN;
    food[y * W + x] = 5;
  }
  return worldFromArrays({ w: W, h: H }, [nestAt(3, 7, 1.5)], { rock, food });
}

// On the local rule, food seen through the wall read as a strong food trail: the explorer turned follower, and followers
// don't dig. Measured: through the wall 0 of 12 seeds took any food in 60 s; through open ground only (inReach), 5 of 12.
test("an explorer at a tunnel's end near buried food digs on and reaches it on some seeds (ja-juiu)", () => {
  let reached = 0;
  const seeds = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  for (const seed of seeds) {
    const map = buried();
    const c = new Colony(map, { antCount: 1, maxAnts: 1, deposit: 0 }, mulberry32(seed));
    put(c, 0, 13, 7);
    c.heading[0] = 0;
    for (let t = 0; t < 30 * 60 && map.foodLeft === map.foodTotal; t++) c.tick(1 / 30);
    if (map.foodLeft < map.foodTotal) reached++;
  }
  assert.ok(reached >= 2, `took food from the pocket on ${reached} of ${seeds.length} seeds`);
});
