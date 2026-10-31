import { test } from "node:test";
import assert from "node:assert/strict";
import { CHUNK, ChunkLayer, chunkKey, chunkOf } from "../chunks.ts";
import { blocked, chunkRock, dropFood, escapes, flat, foodAt, generateWorld, heightAt, noiseAt, reachable, rockAt, rockCut, takeFood, worldFromArrays, type WorldMap } from "../world.ts";
import { MAX_LEVEL, Pheromones, SLEEP, type ChannelParams, type Channel } from "../pheromone.ts";

const SMALL = { w: 160, h: 100 };

test("ChunkLayer: unwritten cells read as empty; writes land in their chunk; negative coordinates work; the table grows", () => {
  const l = new ChunkLayer((n) => new Float32Array(n), 0);
  assert.equal(l.get(5, 5), 0);
  assert.equal(l.count, 0);
  l.set(5, 5, 2);
  l.set(-1, -70, 3);
  l.set(200, 130, 4);
  assert.equal(l.get(5, 5), 2);
  assert.equal(l.get(-1, -70), 3);
  assert.equal(l.get(200, 130), 4);
  assert.equal(l.get(6, 5), 0);
  assert.equal(l.count, 3, "one chunk per write, in three different chunks");
  assert.equal(l.chunk(-1, -2)?.[58 * CHUNK + 63], 3, "(-1, -70) is local cell (63, 58) of chunk (-1, -2)");
  const rock = new ChunkLayer((n) => new Uint8Array(n), 1);
  assert.equal(rock.get(-9, 9), 1, "a layer can read as something other than zero where nothing was generated");
  for (const [cx, cy] of [[0, 0], [-3, 7], [1200, -900]] as const) assert.deepEqual(chunkOf(chunkKey(cx, cy)), [cx, cy]);
});

test("generateWorld: the same seed is the same world; another seed is another", () => {
  const a = generateWorld(7, { size: SMALL });
  const b = generateWorld(7, { size: SMALL });
  assert.deepEqual(flat(a, a.rock, (n) => new Uint8Array(n)), flat(b, b.rock, (n) => new Uint8Array(n)));
  assert.deepEqual(flat(a, a.food, (n) => new Float32Array(n)), flat(b, b.food, (n) => new Float32Array(n)));
  assert.deepEqual(a.nests, b.nests);
  const c = generateWorld(8, { size: SMALL });
  assert.notDeepEqual(flat(c, c.rock, (n) => new Uint8Array(n)), flat(a, a.rock, (n) => new Uint8Array(n)));
});

test("terrain is position-pure: a chunk is the same whatever else was generated, and a bigger map contains the smaller one", () => {
  const cut = rockCut(0.22);
  assert.deepEqual(chunkRock(5, 3, -2, cut), chunkRock(5, 3, -2, cut));
  const small = generateWorld(5, { size: SMALL });
  const big = generateWorld(5, { size: { w: 512, h: 320 } });
  // Away from nests and food (which clear rock), the bigger map's ground is the smaller map's ground.
  let same = 0;
  let total = 0;
  for (let y = 0; y < SMALL.h; y++)
    for (let x = 0; x < SMALL.w; x++) {
      const raw = heightAt(5, x, y) > cut ? 1 : 0;
      if (rockAt(small, x, y) === raw && rockAt(big, x, y) === raw) same++;
      total++;
    }
  assert.ok(same / total > 0.9, `${((100 * same) / total).toFixed(1)} % of cells are raw terrain in both`);
});

test("generateWorld at the default size: a nest on main ground, food it can walk to, rock about 22 %", () => {
  const shares: number[] = [];
  for (let seed = 1; seed <= 20; seed++) {
    const m = generateWorld(seed);
    const { w, h } = m.size;
    assert.equal(w, 512);
    assert.ok(!blocked(m, m.nest.x, m.nest.y), `seed ${seed}: nest on rock`);
    assert.ok(escapes(m, m.nest.x, m.nest.y, 48), `seed ${seed}: nest in a pocket`);
    assert.ok(m.foodTotal > 5000, `seed ${seed}: food ${m.foodTotal}`);
    assert.equal(m.foodLeft, m.foodTotal);
    const reach = reachable(m, m.nest.x, m.nest.y);
    let open = 0;
    let joined = 0;
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (foodAt(m, x, y) > 0) assert.equal(reach[i], 1, `seed ${seed}: food at (${x}, ${y}) cannot be reached`);
        if (!rockAt(m, x, y)) open++;
        joined += reach[i]!;
      }
    for (const n of m.nests) assert.equal(reach[Math.floor(n.y) * w + Math.floor(n.x)], 1, `seed ${seed}: a nest cannot be walked to`);
    assert.ok(joined > open * 0.6, `seed ${seed}: the nest reaches only ${joined} of ${open} open cells`);
    shares.push(1 - open / (w * h));
  }
  const mean = shares.reduce((a, b) => a + b, 0) / shares.length;
  assert.ok(Math.abs(mean - 0.22) < 0.03, `mean rock share ${mean.toFixed(3)}`);
  for (const s of shares) assert.ok(s > 0.1 && s < 0.36, `a seed's rock share ${s.toFixed(3)}`);
});

test("noiseAt stays in 0..1 and is smooth: neighbours differ little", () => {
  let maxStep = 0;
  for (let y = -15; y < 15; y++)
    for (let x = -20; x < 20; x++) {
      const v = noiseAt(1, 1, x, y, 8);
      assert.ok(v >= 0 && v <= 1);
      maxStep = Math.max(maxStep, Math.abs(v - noiseAt(1, 1, x - 1, y, 8)));
    }
  assert.ok(maxStep < 0.25, `step ${maxStep}`);
});

test("blocked: rock and the edge of the map", () => {
  const m = generateWorld(3, { size: SMALL });
  assert.ok(blocked(m, -0.1, 5));
  assert.ok(blocked(m, 5, m.size.h));
  assert.ok(blocked(m, m.size.w + 3, 5), "cells past the edge, inside the last chunk, are rock too");
  let found = false;
  for (let y = 0; y < m.size.h && !found; y++)
    for (let x = 0; x < m.size.w && !found; x++)
      if (rockAt(m, x, y)) {
        assert.ok(blocked(m, x + 0.5, y + 0.5));
        found = true;
      }
  assert.ok(found);
});

test("escapes: open ground escapes, a walled pocket does not", () => {
  const size = { w: 60, h: 60 };
  const rock = new Uint8Array(60 * 60);
  for (let k = 20; k <= 30; k++) for (const [x, y] of [[k, 20], [k, 30], [20, k], [30, k]] as const) rock[y * 60 + x] = 1;
  const m = worldFromArrays(size, [{ x: 5, y: 5, r: 2 }], { rock });
  assert.ok(escapes(m, 5, 5, 20));
  assert.ok(!escapes(m, 25, 25, 20), "inside the walled square");
});

test("takeFood and dropFood keep the map's running count", () => {
  const m = worldFromArrays({ w: 10, h: 10 }, [{ x: 1, y: 1, r: 1 }], { food: Object.assign(new Array(100).fill(0), { 55: 2 }) });
  assert.equal(m.foodLeft, 2);
  assert.ok(takeFood(m, 5.5, 5.5));
  assert.ok(takeFood(m, 5.5, 5.5));
  assert.ok(!takeFood(m, 5.5, 5.5), "nothing left");
  assert.equal(m.foodLeft, 0);
  dropFood(m, 2.5, 2.5, 1);
  assert.equal(foodAt(m, 2, 2), 1);
  assert.equal(m.foodLeft, 1);
});

function bare(size: { w: number; h: number }, rock?: Uint8Array): WorldMap {
  return worldFromArrays(size, [{ x: 1, y: 1, r: 1 }], rock ? { rock } : {});
}

test("Pheromones: deposit and read, capped; evaporation takes its share; nothing spreads into rock", () => {
  const size = { w: 5, h: 5 };
  const rock = new Uint8Array(25);
  rock[2 * 5 + 3] = 1; // east of the centre
  const ph = new Pheromones(bare(size, rock), { food: { evaporation: 0.5, diffusion: 0 }, home: { evaporation: 0, diffusion: 1 }, alarm: { evaporation: 0, diffusion: 0 } });
  ph.deposit("food", 2.5, 2.5, 10);
  assert.equal(ph.read("food", 2.2, 2.9), 10);
  assert.equal(ph.read("food", -1, 0), -1, "off the map reads as worse than bare ground");
  ph.deposit("food", 0.5, 0.5, 1000);
  assert.equal(ph.read("food", 0.5, 0.5), MAX_LEVEL);
  ph.step(0.1);
  assert.ok(Math.abs(ph.read("food", 2.5, 2.5) - 10 * 0.95) < 1e-5, "5 % of it evaporated in 0.1 s at 50 %/s");

  ph.deposit("home", 2.5, 2.5, 8);
  for (let k = 0; k < 20; k++) ph.step(0.1);
  assert.equal(ph.read("home", 3.5, 2.5), 0, "the rock cell holds nothing");
  assert.ok(ph.read("home", 1.5, 2.5) > 0, "it spread to open neighbours");
  assert.ok(Math.abs(ph.total("home") - 8) < 1e-3, "spreading without evaporation keeps the total");
});

/** The old dense step, kept as the reference the sparse one must match. */
function denseStep(f: Float32Array, rock: Uint8Array, w: number, h: number, p: ChannelParams, dt: number): Float32Array {
  const keep = Math.max(0, 1 - p.evaporation * dt);
  const k = Math.min(0.25, p.diffusion * dt);
  const out = new Float32Array(f.length);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (rock[i]) continue;
      const v = f[i]!;
      const l = x > 0 && !rock[i - 1] ? f[i - 1]! : v;
      const r = x < w - 1 && !rock[i + 1] ? f[i + 1]! : v;
      const u = y > 0 && !rock[i - w] ? f[i - w]! : v;
      const d = y < h - 1 && !rock[i + w] ? f[i + w]! : v;
      out[i] = (v + k * ((l + r + u + d) / 4 - v)) * keep;
    }
  return out;
}

test("the sparse step matches the dense one, across chunk borders and a ragged map edge", () => {
  const m = generateWorld(4, { size: { w: 150, h: 90 } });
  const { w, h } = m.size;
  const rock = flat(m, m.rock, (n) => new Uint8Array(n));
  const params = { evaporation: 0.05, diffusion: 0.8 };
  const ph = new Pheromones(m, { food: params, home: params, alarm: params });
  let dense = new Float32Array(w * h);
  const lay = (x: number, y: number, v: number) => {
    if (rock[y * w + x]) return;
    ph.deposit("food", x + 0.5, y + 0.5, v);
    dense[y * w + x] = Math.min(MAX_LEVEL, dense[y * w + x]! + v);
  };
  // Trails straddling the chunk borders at x = 64, 128 and y = 64, and the ragged edges at x = 149, y = 89.
  for (let t = 0; t < 140; t++) lay(5 + t, 63, 3);
  for (let t = 0; t < 80; t++) lay(64, 5 + t, 3);
  lay(149, 89, 10);
  lay(127, 64, 10);
  for (let s = 0; s < 300; s++) {
    ph.step(1 / 30);
    dense = denseStep(dense, rock, w, h, params, 1 / 30);
  }
  let worst = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) worst = Math.max(worst, Math.abs(ph.read("food", x + 0.5, y + 0.5) - dense[y * w + x]!));
  assert.ok(worst < 1e-4, `largest difference ${worst}`);
});

test("faint scent crosses chunk borders as the dense step says (a steady source 8 cells from a border)", () => {
  const size = { w: 192, h: 64 };
  const m = worldFromArrays(size, [{ x: 1, y: 1, r: 1 }]);
  const rock = new Uint8Array(size.w * size.h);
  const params = { evaporation: 0.06, diffusion: 0.3 };
  const ph = new Pheromones(m, { food: params, home: params, alarm: params });
  let dense = new Float32Array(size.w * size.h);
  for (let s = 0; s < 600; s++) {
    ph.deposit("food", 56.5, 32.5, 1);
    dense[32 * size.w + 56] = Math.min(MAX_LEVEL, dense[32 * size.w + 56]! + 1);
    ph.step(0.1);
    dense = denseStep(dense, rock, size.w, size.h, params, 0.1);
  }
  let worst = 0;
  for (let x = 56; x < 80; x++) worst = Math.max(worst, Math.abs(ph.read("food", x + 0.5, 32.5) - dense[32 * size.w + x]!));
  assert.ok(dense[32 * size.w + 64]! > 1e-3, "the dense step carries scent across the border, to x = 64");
  assert.ok(worst < 1e-4, `largest difference across the border ${worst}`);
});

test("asleep costs nothing: untouched chunks never wake, and faded ones go back to sleep", () => {
  const m = generateWorld(2);
  const zero = { evaporation: 0, diffusion: 0 };
  const fast = { evaporation: 3, diffusion: 0.3 };
  const ph = new Pheromones(m, { food: fast, home: zero, alarm: zero } as Record<Channel, ChannelParams>);
  assert.equal(ph.awakeChunks(), 0);
  ph.step(1 / 30);
  assert.equal(ph.fields.food.count, 0, "stepping an empty map allocates nothing");
  ph.deposit("food", m.nest.x, m.nest.y, 5);
  assert.equal(ph.awakeChunks(), 1);
  for (let s = 0; s < 30 * 10; s++) ph.step(1 / 30);
  assert.equal(ph.awakeChunks(), 0, "faded below SLEEP: asleep again");
  assert.ok(ph.read("food", m.nest.x, m.nest.y) < SLEEP);
  assert.ok(ph.fields.food.count <= 9, `only the chunk and its neighbours were ever touched (${ph.fields.food.count})`);
});
