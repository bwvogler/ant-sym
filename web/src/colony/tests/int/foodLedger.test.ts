import assert from "node:assert/strict";
import { test } from "node:test";
import { CHUNK, CHUNK_BITS, chunkKey, local } from "../../chunks.ts";
import { CRUST } from "../../oneWorld.ts";
import { CURTAIN_BANDS, EndlessCurtain } from "../../endlessCurtain.ts";
import { EndlessPlane } from "../../endlessPlane.ts";
import { FoodLedger } from "../../foodLedger.ts";
import { centreX, centreY, R } from "../../hex.ts";

// The endless world's food totals (docs/endless-world.md §3, PRD §66 E2.3): the ledger counts generated food once per chunk, and foodHome's
// denominator is a fixed disc, the same in any order of generation.

test("the ledger counts a chunk once, however often it is generated", () => {
  const l = new FoodLedger();
  assert.equal(l.generated("plane", chunkKey(0, 0), 120), true);
  assert.equal(l.generated("plane", chunkKey(0, 0), 120), false, "a dropped chunk generated again adds nothing");
  assert.equal(l.generated("plane", chunkKey(1, 0), 60), true);
  assert.equal(l.generated("curtain", chunkKey(0, 0), 36), true, "the same key on another layer is another chunk");
  assert.equal(l.generatedTotal, 216);
  assert.equal(l.chunks, 3);
});

test("a chunk that generates differently the second time is an error, not a silent first count", () => {
  const l = new FoodLedger();
  l.generated("plane", 7, 100);
  assert.throws(() => l.generated("plane", 7, 101), /counted as 100/);
  assert.equal(l.generatedTotal, 100);
});

test("total is generated plus added, left is total less taken, and neither moves the generated count", () => {
  const l = new FoodLedger();
  l.generated("plane", 1, 100);
  l.add(30);
  l.take(45);
  assert.equal(l.generatedTotal, 100);
  assert.equal(l.total, 130);
  assert.equal(l.left, 85);
  l.take(85);
  assert.equal(l.left, 0);
});

test("the ledger over a walk of chunks does not depend on the order: any order, a regenerated chunk too", () => {
  const w = new EndlessPlane(3);
  const cells: [number, number][] = [];
  for (let cy = -2; cy <= 2; cy++) for (let cx = -2; cx <= 2; cx++) cells.push([cx, cy]);
  const sum = (order: [number, number][]) => {
    const l = new FoodLedger();
    for (const [cx, cy] of order) {
      let f = 0;
      for (const v of w.chunk(cx, cy).food) f += v;
      l.generated("plane", chunkKey(cx, cy), f);
    }
    return l.generatedTotal;
  };
  const forward = sum(cells);
  assert.ok(forward > 0);
  assert.equal(sum([...cells].reverse()), forward);
  assert.equal(sum([...cells, ...cells.slice(0, 7)]), forward, "visiting seven chunks twice");
});

test("foodWithin: the plane's fixed disc equals a brute-force sum of the generated cells, grows with the radius, and is the same in any order", () => {
  const w = new EndlessPlane(2);
  const [a] = w.startNests();
  const d = 100;
  // brute force over a square of chunks, one cell at a time
  let want = 0;
  for (let cy = -4; cy <= 4; cy++)
    for (let cx = -4; cx <= 4; cx++) {
      const { food } = w.chunk(cx, cy);
      for (let j = 0; j < CHUNK; j++)
        for (let i = 0; i < CHUNK; i++)
          if (
            food[local(i, j)] &&
            Math.hypot(centreX((cx << CHUNK_BITS) + i, (cy << CHUNK_BITS) + j) - a.x, centreY((cy << CHUNK_BITS) + j) - a.y) <= d
          )
            want += food[local(i, j)]!;
    }
  assert.ok(want > 0, "food within a hundred cells of the first start nest");
  assert.equal(w.foodWithin(a.x, a.y, d), want);
  assert.equal(new EndlessPlane(2).foodWithin(a.x, a.y, d), want, "a fresh plane, cold");
  const small = w.foodWithin(a.x, a.y, 50);
  assert.ok(small <= want && w.foodWithin(a.x, a.y, 140) >= want, "monotone in the radius");
  // the production radius (2 U), at points across negative and positive coordinates: the chunk rows a disc covers are 1/R wider than the disc
  const brute = (px: number, py: number, r: number) => {
    let sum = 0;
    for (let cy = Math.floor((py - r) / R / CHUNK) - 2; cy <= Math.ceil((py + r) / R / CHUNK) + 2; cy++)
      for (let cx = Math.floor((px - r) / CHUNK) - 2; cx <= Math.ceil((px + r) / CHUNK) + 2; cx++) {
        const { food } = w.chunk(cx, cy);
        for (let j = 0; j < CHUNK; j++)
          for (let i = 0; i < CHUNK; i++)
            if (
              food[local(i, j)] &&
              Math.hypot(centreX((cx << CHUNK_BITS) + i, (cy << CHUNK_BITS) + j) - px, centreY((cy << CHUNK_BITS) + j) - py) <= r
            )
              sum += food[local(i, j)]!;
      }
    return sum;
  };
  for (const [px, py] of [
    [a.x, a.y],
    [-310, 240],
    [150, -420],
    [-200, -90],
  ] as const)
    assert.equal(w.foodWithin(px, py, 280), brute(px, py, 280), `2 U round ${px},${py}`);
  assert.equal(
    w.foodWithin(a.x, a.y, 0.4),
    0,
    "a disc under one cell holds no whole cell's centre but the one it is on, and a nest clears its ground",
  );
});

test("foodWithin: the curtain's fixed disc equals a brute-force sum of the generated cells, grows with the radius, is the same cold", () => {
  const c = new EndlessCurtain(1);
  const d = 90;
  const hx = centreX(10, CRUST);
  const hy = centreY(CRUST);
  let want = 0;
  for (let bs = -3; bs <= 3; bs++)
    for (let by = 0; by < CURTAIN_BANDS; by++) {
      const { food } = c.chunk(bs, by);
      for (let j = 0; j < CHUNK; j++)
        for (let i = 0; i < CHUNK; i++) {
          const y = by * CHUNK + j;
          if (food[local(i, j)] && Math.hypot(centreX(bs * CHUNK + i, y) - hx, centreY(y) - hy) <= d) want += food[local(i, j)]!;
        }
    }
  assert.ok(want > 0);
  assert.equal(c.foodWithin(10, d), want);
  assert.equal(new EndlessCurtain(1).foodWithin(10, d), want);
  assert.ok(c.foodWithin(10, 40) <= want && c.foodWithin(10, 200) >= want);
});
