import assert from "node:assert/strict";
import { test } from "node:test";
import { CHUNK, CHUNK_BITS } from "../../chunks.ts";
import { generateEndlessPlane } from "../../endlessMap.ts";
import { EndlessPlane } from "../../endlessPlane.ts";
import { foodIn, rockAt } from "../../world.ts";

// EndlessMap.prefetch (PRD §66 E6.0.4, `ja-qpv.9.1`): a chunk made ahead of need is the chunk the first read would have made, and a read of one that
// was not prefetched (or whose entry was evicted) still makes it correctly, as a miss.

/** Prefetch chunk (cx, cy) to the end, as the game does a step a tick; the steps it took. */
function settle(map: { prefetch(cx: number, cy: number): boolean }, cx: number, cy: number): number {
  let n = 0;
  while (map.prefetch(cx, cy)) n++;
  return n;
}

const at = (cx: number, cy: number): [number, number] => [(cx << CHUNK_BITS) + 5, (cy << CHUNK_BITS) + 5];

test("a prefetched chunk costs the layers a copy, not a generation: no miss, and nothing else moves until it is read", () => {
  const map = generateEndlessPlane(2, { patchesPerChunk: 0, density: 0 });
  assert.ok(settle(map, 40, -40) >= 1);
  assert.equal(map.prefetch(40, -40), false, "already made");
  assert.deepEqual(map.gen, { misses: 0, prefetched: 1 });
  // prefetch touches no layer, no total and no ledger: the game cannot tell it happened
  assert.equal(map.rock.count + map.food.count, 0);
  assert.equal(map.ledger.chunks, 0);
  assert.equal(map.foodTotal, 0);
  const [x, y] = at(40, -40);
  const own = new EndlessPlane(2, { patchesPerChunk: 0, density: 0 }).chunk(40, -40);
  assert.equal(rockAt(map, x, y), own.rock[(5 << CHUNK_BITS) | 5]);
  assert.equal(foodIn(map, x, y), own.food[(5 << CHUNK_BITS) | 5]);
  assert.equal(map.gen.misses, 0, "both layers took the prefetched chunk");
  assert.equal(map.prefetch(40, -40), false, "a layer holds it");
  // an unprefetched chunk is a miss, made correctly
  const [x2, y2] = at(41, -40);
  rockAt(map, x2, y2);
  assert.equal(map.gen.misses, 1);
});

test("a chunk whose prefetch was evicted is made again on its read, equal, and counted a miss", () => {
  const opts = { patchesPerChunk: 0, density: 0 };
  const map = generateEndlessPlane(4, opts);
  const plane = new EndlessPlane(4, opts);
  for (let i = 0; i < 600; i++) settle(map, i, 700); // more than the map keeps waiting
  assert.equal(map.gen.prefetched, 600);
  const [x, y] = at(0, 700); // the oldest, evicted
  assert.equal(rockAt(map, x, y), plane.chunk(0, 700).rock[(5 << CHUNK_BITS) | 5]);
  assert.equal(map.gen.misses, 1);
  const [x2, y2] = at(599, 700); // the newest, kept
  assert.equal(rockAt(map, x2, y2), plane.chunk(599, 700).rock[(5 << CHUNK_BITS) | 5]);
  assert.equal(map.gen.misses, 1);
});

test("with food patches a chunk takes several steps, none of them the chunk's own read: the patches of its neighbours first", () => {
  const map = generateEndlessPlane(3);
  const steps = settle(map, 25, 25);
  assert.ok(steps >= 2 && steps <= 10, `${steps} steps`);
  assert.equal(map.gen.prefetched, 1);
  assert.equal(map.rock.count, 0);
});

test("food read after a prefetch counts once, as without it", () => {
  const a = generateEndlessPlane(2);
  const b = generateEndlessPlane(2);
  settle(a, 0, 0);
  settle(a, 1, 0);
  for (const m of [a, b]) for (let cx = 0; cx < 2; cx++) for (let ly = 0; ly < CHUNK; ly += 9) foodIn(m, (cx << CHUNK_BITS) + 3, ly);
  assert.equal(a.foodTotal, b.foodTotal);
  assert.equal(a.foodLeft, b.foodLeft);
  assert.equal(a.ledger.chunks, b.ledger.chunks);
  assert.ok(a.foodTotal > 0, "the start chunks have food");
});
