import { test } from "node:test";
import assert from "node:assert/strict";
import { blocked, generateWorld, mulberry32, reachable, valueNoise } from "../world.ts";
import { MAX_LEVEL, Pheromones } from "../pheromone.ts";

test("generateWorld: the same seed is the same world; another seed is another", () => {
  const a = generateWorld(7);
  const b = generateWorld(7);
  assert.deepEqual(a.rock, b.rock);
  assert.deepEqual(a.food, b.food);
  assert.deepEqual(a.nest, b.nest);
  assert.notDeepEqual(generateWorld(8).rock, a.rock);
});

test("generateWorld: every seed has a clear nest on ground joined to the map, and food it can reach", () => {
  for (let seed = 1; seed <= 25; seed++) {
    const m = generateWorld(seed);
    const { w, h } = m.size;
    assert.ok(!blocked(m, m.nest.x, m.nest.y), `seed ${seed}: nest on rock`);
    assert.ok(m.foodTotal > 0, `seed ${seed}: no food`);
    const reach = reachable(m.size, m.rock, m.nest.x, m.nest.y);
    let open = 0;
    let joined = 0;
    for (let i = 0; i < w * h; i++) {
      if (m.food[i]! > 0) assert.equal(reach[i], 1, `seed ${seed}: food in cell ${i} cannot be reached`);
      if (!m.rock[i]) open++;
      joined += reach[i]!;
    }
    assert.ok(joined > open * 0.5, `seed ${seed}: the nest reaches only ${joined} of ${open} open cells`);
    const rockShare = 1 - open / (w * h);
    assert.ok(rockShare > 0.1 && rockShare < 0.3, `seed ${seed}: rock share ${rockShare.toFixed(2)}`);
  }
});

test("valueNoise stays in 0..1 and is smooth: neighbours differ little", () => {
  const n = valueNoise({ w: 40, h: 30 }, 8, mulberry32(1));
  let maxStep = 0;
  for (let y = 0; y < 30; y++)
    for (let x = 0; x < 40; x++) {
      const v = n[y * 40 + x]!;
      assert.ok(v >= 0 && v <= 1);
      if (x > 0) maxStep = Math.max(maxStep, Math.abs(v - n[y * 40 + x - 1]!));
    }
  assert.ok(maxStep < 0.25, `step ${maxStep}`);
});

test("blocked: rock and the edge of the map", () => {
  const m = generateWorld(3);
  assert.ok(blocked(m, -0.1, 5));
  assert.ok(blocked(m, 5, m.size.h));
  const k = m.rock.indexOf(1);
  assert.ok(blocked(m, (k % m.size.w) + 0.5, Math.floor(k / m.size.w) + 0.5));
});

test("Pheromones: deposit and read, capped; evaporation takes its share; nothing spreads into rock", () => {
  const size = { w: 5, h: 5 };
  const rock = new Uint8Array(25);
  rock[2 * 5 + 3] = 1; // east of the centre
  const ph = new Pheromones(size, { food: { evaporation: 0.5, diffusion: 0 }, home: { evaporation: 0, diffusion: 1 }, alarm: { evaporation: 0, diffusion: 0 } });
  ph.deposit("food", 2.5, 2.5, 10);
  assert.equal(ph.read("food", 2.2, 2.9), 10);
  assert.equal(ph.read("food", -1, 0), -1, "off the map reads as worse than bare ground");
  ph.deposit("food", 0.5, 0.5, 1000);
  assert.equal(ph.read("food", 0.5, 0.5), MAX_LEVEL);
  ph.step(0.1, rock);
  assert.ok(Math.abs(ph.read("food", 2.5, 2.5) - 10 * 0.95) < 1e-5, "5 % of it evaporated in 0.1 s at 50 %/s");

  ph.deposit("home", 2.5, 2.5, 8);
  for (let k = 0; k < 20; k++) ph.step(0.1, rock);
  assert.equal(ph.read("home", 3.5, 2.5), 0, "the rock cell holds nothing");
  assert.ok(ph.read("home", 1.5, 2.5) > 0, "it spread to open neighbours");
  assert.ok(Math.abs(ph.total("home") - 8) < 1e-3, "spreading without evaporation keeps the total");
});
