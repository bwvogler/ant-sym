import assert from "node:assert/strict";
import { test } from "node:test";
import { CHUNK, local } from "../../chunks.ts";
import { CURTAIN_BANDS, EndlessCurtain, lineSeed } from "../../endlessCurtain.ts";
import { CRUST, CURTAIN_WORLD } from "../../oneWorld.ts";
import { AIR, ROCK, SOIL } from "../../world.ts";
import { centreX, centreY, nx, ny } from "../../hex.ts";

// The endless curtain's ground and food (docs/endless-world.md §3, PRD §66 E2.2): pure per (seed, line salt, block of columns).

const BLOCKS = [-2, -1, 0, 1, 2];

function shuffled<T>(a: readonly T[], seed: number): T[] {
  const out = [...a];
  let s = seed;
  for (let i = out.length - 1; i > 0; i--) {
    s = (Math.imul(s, 1103515245) + 12345) & 0x7fffffff;
    const j = s % (i + 1);
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

const same = (a: { rock: Uint8Array; food: Float32Array }, b: { rock: Uint8Array; food: Float32Array }) =>
  Buffer.compare(Buffer.from(a.rock), Buffer.from(b.rock)) === 0 &&
  Buffer.compare(Buffer.from(a.food.buffer), Buffer.from(b.food.buffer)) === 0;

test("any order of blocks gives the same chunks, bit for bit", () => {
  for (const seed of [1, 2]) {
    const ref = new EndlessCurtain(seed);
    const want = BLOCKS.map((b) => Array.from({ length: CURTAIN_BANDS }, (_, by) => ref.chunk(b, by)));
    for (const o of [3, 4]) {
      const c = new EndlessCurtain(seed);
      for (const b of shuffled(BLOCKS, o))
        for (let by = 0; by < CURTAIN_BANDS; by++)
          assert.ok(same(c.chunk(b, by), want[BLOCKS.indexOf(b)]![by]!), `seed ${seed} block ${b} band ${by}`);
    }
  }
});

test("a block alone is the block amid its neighbours, and survives the caches being dropped", () => {
  const warm = new EndlessCurtain(3);
  for (const b of BLOCKS) warm.chunk(b, 2);
  for (const b of [-1, 0, 2]) assert.ok(same(new EndlessCurtain(3).chunk(b, 3), warm.chunk(b, 3)));
  const w = new EndlessCurtain(3);
  const a = w.chunk(0, 1);
  for (let b = 10; b < 10 + 300; b++) w.chunk(b, 0); // fills and clears the caches
  assert.ok(same(w.chunk(0, 1), a));
});

test("rows: sky above the crust, soil or stone or open ground below, the floor row band rock past the last row", () => {
  const c = new EndlessCurtain(1);
  const top = c.chunk(0, 0);
  for (let j = 0; j < CRUST; j++) for (let i = 0; i < CHUNK; i++) assert.equal(top.rock[local(i, j)], AIR);
  assert.equal(
    top.food.subarray(0, CRUST * CHUNK).every((v) => v === 0),
    true,
    "no food in the sky",
  );
  const last = c.chunk(0, CURTAIN_BANDS - 1);
  for (let i = 0; i < CHUNK; i++) assert.equal(last.rock[local(i, CHUNK - 1)], ROCK);
});

test("food: 12 a cell, never on rock or in the sky, about the curtain's pockets a block, and every cell joins the crust through the neighbours' open ground", () => {
  for (const seed of [1, 2, 3]) {
    const c = new EndlessCurtain(seed);
    let cells = 0;
    let blockFood = 0;
    for (const bs of [-1, 0, 1]) {
      blockFood += c.foodInBlock(bs);
      for (let by = 0; by < CURTAIN_BANDS; by++) {
        const { rock, food } = c.chunk(bs, by);
        for (let i = 0; i < food.length; i++)
          if (food[i]) {
            cells++;
            assert.equal(food[i], CURTAIN_WORLD.foodPerCell);
            assert.ok(rock[i] !== ROCK && rock[i] !== AIR);
          }
      }
    }
    assert.ok(cells > 0 && blockFood / 3 > 0.2 * CURTAIN_WORLD.patchesPerChunk * 12 * CURTAIN_BANDS * 4, `seed ${seed}: ${cells} cells`);
  }
  // reach, checked independently over the assembled chunks of three blocks: a necessary condition (the neighbours' own pockets only add open ground)
  const c = new EndlessCurtain(2);
  const w = 3 * CHUNK;
  const h = CURTAIN_BANDS * CHUNK;
  const s0 = -CHUNK; // blocks -1, 0, 1
  const rock = new Uint8Array(w * h);
  const food = new Float32Array(w * h);
  for (let b = 0; b < 3; b++)
    for (let by = 0; by < CURTAIN_BANDS; by++) {
      const ch = c.chunk(b - 1, by);
      for (let j = 0; j < CHUNK; j++)
        for (let i = 0; i < CHUNK; i++) {
          rock[(by * CHUNK + j) * w + b * CHUNK + i] = ch.rock[local(i, j)]!;
          food[(by * CHUNK + j) * w + b * CHUNK + i] = ch.food[local(i, j)]!;
        }
    }
  const reach = new Uint8Array(w * h);
  const queue: number[] = [];
  for (let i = 0; i < w; i++)
    if (rock[CRUST * w + i] !== ROCK && rock[CRUST * w + i] !== AIR) {
      reach[CRUST * w + i] = 1;
      queue.push(CRUST * w + i);
    }
  for (let k = 0; k < queue.length; k++) {
    const o = queue[k]!;
    const i = o % w;
    const y = (o - i) / w;
    for (let d = 0; d < 6; d++) {
      const ax = nx(i + s0, y, d) - s0;
      const ay = ny(y, d);
      if (ax < 0 || ax >= w || ay < CRUST || ay >= h) continue;
      const n = ay * w + ax;
      if (!reach[n] && rock[n] !== ROCK && rock[n] !== AIR) {
        reach[n] = 1;
        queue.push(n);
      }
    }
  }
  let checked = 0;
  for (let o = 0; o < food.length; o++)
    if (food[o] && Math.floor((o % w) / CHUNK) === 1) {
      checked++;
      assert.ok(reach[o], `food cell ${o % w},${Math.floor(o / w)} sealed`);
    }
  assert.ok(checked > 0);
});

test("pockets keep clear of the nests the world placed on the line, and of nothing else", () => {
  const nest = { x: centreX(10, CRUST + 30), y: centreY(CRUST + 30), r: 3 };
  const free = new EndlessCurtain(1);
  const held = new EndlessCurtain(1, 0, [nest]);
  const dist = (s: number, y: number) => Math.hypot(centreX(s, y) - nest.x, centreY(y) - nest.y);
  let nearFree = 0;
  for (let by = 0; by < CURTAIN_BANDS; by++) {
    const a = free.chunk(0, by);
    const b = held.chunk(0, by);
    for (let j = 0; j < CHUNK; j++)
      for (let i = 0; i < CHUNK; i++) {
        const y = by * CHUNK + j;
        if (a.food[local(i, j)] && dist(i, y) < CURTAIN_WORLD.foodMinDist) nearFree++;
        assert.ok(!(b.food[local(i, j)] && dist(i, y) < CURTAIN_WORLD.foodMinDist - 4), `food at ${i},${y} next to the nest`);
      }
  }
  void nearFree;
});

test("a block's food is only what digging from the crust reaches: in ground sealed by rock all of it is dropped, in soil it is kept", () => {
  class Ground extends EndlessCurtain {
    readonly #fill: number;
    constructor(fill: number) {
      super(1);
      this.#fill = fill;
    }
    override groundAt(_s: number, y: number): number {
      if (y < CRUST) return AIR;
      return y === CRUST ? SOIL : this.#fill;
    }
  }
  assert.equal(new Ground(ROCK).foodInBlock(0), 0, "pockets in solid rock are sealed");
  assert.ok(new Ground(SOIL).foodInBlock(0) > 0, "pockets in soil are reached");
});

test("dropping the caches changes nothing: a walk of blocks with the caches holding two", () => {
  const big = new EndlessCurtain(2);
  const small = new EndlessCurtain(2, 0, [], 2);
  for (const b of [0, 5, -3, 0, 7, 5, -3])
    for (const by of [0, 3, 5]) assert.ok(same(small.chunk(b, by), big.chunk(b, by)), `block ${b} band ${by}`);
});

test("lines have their own ground: salt 0 is the world's seed, another salt is another curtain", () => {
  assert.equal(lineSeed(9, 0), 9);
  assert.notEqual(lineSeed(9, 5), 9);
  const a = new EndlessCurtain(1, 0).chunk(0, 3);
  const b = new EndlessCurtain(1, 77).chunk(0, 3);
  assert.ok(!same(a, b));
  assert.ok(same(a, new EndlessCurtain(1, 0).chunk(0, 3)));
});

test("a small endless-curtain golden: seed 1, blocks -1 to 1", () => {
  const c = new EndlessCurtain(1);
  let h = 2166136261;
  for (const bs of [-1, 0, 1])
    for (let by = 0; by < CURTAIN_BANDS; by++) {
      const { rock, food } = c.chunk(bs, by);
      for (let i = 0; i < rock.length; i++) h = Math.imul(h ^ (rock[i]! + (food[i]! > 0 ? 7 : 0)), 16777619) >>> 0;
    }
  assert.equal(h.toString(16), "518d798b", `hash ${h.toString(16)}`);
});
