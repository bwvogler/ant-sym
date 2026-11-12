import { test } from "node:test";
import assert from "node:assert/strict";
import { Colony, inSight } from "../../colony.ts";
import { mulberry32, OPEN, SOIL, worldFromArrays, type WorldMap } from "../../world.ts";
import { at, hexMap, nestAt, put } from "../hexmaps.ts";

// ja-juiu: food is seen only through open ground. Seen through soil, a buried pocket turned explorers off their tunnels
// three cells short of it (they steered at the food, into the wall), and no tunnel ever reached one.

test("inSight: along open ground yes; through soil or rock no; the end cells don't count", () => {
  const map = hexMap([
    "sssssssss", //
    "s.......s",
    "s...s...s",
    "s...#...s",
    "sssssssss",
  ]);
  const look = (a: [number, number], b: [number, number]) => inSight(map, at(...a).x, at(...a).y, at(...b).x, at(...b).y);
  assert.equal(look([1, 1], [7, 1]), true, "along the open row");
  assert.equal(look([1, 2], [7, 2]), false, "through soil at (4, 2)");
  assert.equal(look([1, 3], [7, 3]), false, "through rock at (4, 3)");
  assert.equal(look([1, 1], [0, 1]), true, "into a solid end cell: the line crosses nothing between");
  assert.equal(look([3, 2], [4, 2]), true, "to a neighbour");
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
// don't dig. Measured: through the wall 0 of 12 seeds took any food in 60 s; in sight only, 5 of 12.
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
