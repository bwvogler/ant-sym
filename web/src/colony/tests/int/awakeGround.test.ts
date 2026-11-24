import assert from "node:assert/strict";
import { test } from "node:test";
import { centreX, centreY } from "../../hex.ts";
import { Game } from "../../game.ts";
import { generateOneWorld } from "../../oneWorld.ts";
import { mulberry32 } from "../../world.ts";

// Ground that follows the awake (docs/endless-world.md §6, PRD §66 E4.4): food regrows only within W of an awake hole or the awake fungus.

const SEED = 3;
const W = 60;
const fresh = () => new Game(generateOneWorld(SEED), { regrow: 30, autoFound: false }, mulberry32(5), [{ antCount: 20 }, { antCount: 20 }]);
const run = (g: Game, seconds: number) => {
  for (let t = 0; t < seconds * 30; t++) g.tick(1 / 30);
};
const hole = (g: Game, k: number) => g.colonies[k]!.layers[0]!.nest;

interface Pile {
  x: number;
  y: number;
  v: number;
}
/** Every food cell the world began with, then eaten bare (the game noted them when it was made). */
function eat(g: Game): Pile[] {
  const piles: Pile[] = [];
  const { w, h } = g.map.size;
  for (let y = 0; y < h; y++)
    for (let x = g.map.x0; x < g.map.x0 + w; x++) {
      const v = g.map.food.get(x, y);
      if (v > 0) {
        piles.push({ x, y, v });
        g.map.food.set(x, y, 0);
      }
    }
  return piles;
}
const dist = (g: Game, k: number, p: Pile) => Math.hypot(hole(g, k).x - centreX(p.x, p.y), hole(g, k).y - centreY(p.y));
const regrown = (g: Game, ps: Pile[]) => ps.filter((p) => g.map.food.get(p.x, p.y) > 0).length;

test("with no awake rule, every eaten pile regrows, near an awake colony or far: the bounded game is as it was", () => {
  const g = fresh();
  const piles = eat(g);
  assert.ok(piles.length > 20);
  run(g, 240);
  assert.ok(regrown(g, piles) > piles.length * 0.9, `${regrown(g, piles)} of ${piles.length}`);
});

test("with the rule on, food regrows within W of an awake hole, and waits elsewhere; a sleeping colony's piles wait until it wakes", () => {
  const g = fresh();
  g.enableSleep({ distance: W, delay: 1e9 });
  const piles = eat(g);
  g.freeze(1);
  const nearAwake = piles.filter((p) => dist(g, 0, p) <= W);
  const nearSleeper = piles.filter((p) => dist(g, 1, p) <= W && dist(g, 0, p) > W);
  const far = piles.filter((p) => dist(g, 0, p) > W && dist(g, 1, p) > W);
  assert.ok(nearAwake.length >= 3 && nearSleeper.length >= 3 && far.length >= 3, `${nearAwake.length}/${nearSleeper.length}/${far.length}`);
  run(g, 240);
  assert.ok(regrown(g, nearAwake) > nearAwake.length * 0.8, "regrows by the awake colony");
  assert.equal(regrown(g, nearSleeper), 0, "waits by the sleeping one");
  assert.equal(regrown(g, far), 0, "waits far from everything awake");
  g.thaw(1);
  run(g, 240);
  assert.ok(regrown(g, nearSleeper) > nearSleeper.length * 0.8, "and goes on when it wakes");
});

test("the awake fungus's body keeps far ground regrowing, and only its body: a pile within W of spores regrows", () => {
  const g = fresh();
  g.enableSleep({ distance: W, delay: 1e9 });
  const piles = eat(g);
  g.freeze(0);
  g.freeze(1);
  const far = piles.filter((p) => dist(g, 0, p) > W + 20 && dist(g, 1, p) > W + 20);
  assert.ok(far.length >= 6);
  const target = far[0]!;
  g.fungus.paint(g.colonies, centreX(target.x, target.y), centreY(target.y), 2, 2, 0, 0, 0);
  const near = far.filter((p) => Math.hypot(centreX(p.x, p.y) - centreX(target.x, target.y), centreY(p.y) - centreY(target.y)) <= W - 3);
  const away = far.filter((p) => Math.hypot(centreX(p.x, p.y) - centreX(target.x, target.y), centreY(p.y) - centreY(target.y)) > W + 20);
  assert.ok(near.length >= 1 && away.length >= 1);
  run(g, 240);
  assert.ok(regrown(g, near) > 0, "a pile by the fungus regrows");
  assert.equal(regrown(g, away), 0, "one far from the fungus and every awake hole waits");
});

test("Fungus.bodyNear finds every point within the radius of the body and none beyond the radius plus a block (random bodies and points)", () => {
  const rng = mulberry32(77);
  for (const radius of [12, 30, 60, 140]) {
    const f = fresh().fungus;
    const body: { x: number; y: number }[] = [];
    for (let k = 0; k < 6; k++) {
      const x = 20 + rng() * 460;
      const y = 20 + rng() * 320;
      f.paint([], x, y, 2 + rng() * 6, 2, 0, 0, 0);
      body.push({ x, y });
    }
    const points = Array.from({ length: 400 }, () => ({ x: rng() * 512, y: rng() * 368 }));
    const near = f.bodyNear(0, points, radius);
    // every cell the fungus holds, in world units
    const cells: { x: number; y: number }[] = [];
    const sp = f.sporesOn(0)!.spores;
    for (let y = 0; y < 368; y++) for (let x = 0; x < 512; x++) if (sp.get(x, y) > 0) cells.push({ x: centreX(x, y), y: centreY(y) });
    assert.ok(cells.length > 50);
    points.forEach((p, i) => {
      const d = Math.min(...cells.map((c) => Math.hypot(c.x - p.x, c.y - p.y)));
      if (d <= radius) assert.ok(near[i], `radius ${radius}: a point ${d.toFixed(1)} from the body was missed`);
      if (d > radius + 8 * Math.SQRT2 + 1) assert.ok(!near[i], `radius ${radius}: a point ${d.toFixed(1)} from the body was found`);
    });
  }
});

test("with the rule on, a save and a load regrow as the saved game would (the rng and clock are saved, and the awake set follows the frozen set)", () => {
  const a = fresh();
  a.enableSleep({ distance: W, delay: 1e9 });
  eat(a);
  a.freeze(1);
  a.fungus.paint(a.colonies, 300, 250, 6, 2, 0, 0, 0);
  run(a, 60);
  const saved = JSON.parse(JSON.stringify(a.save())) as ReturnType<Game["save"]>;
  const b = fresh();
  b.load(saved);
  run(a, 60);
  run(b, 60);
  assert.equal(b.regrown, a.regrown);
  assert.ok(a.regrown > 0);
  const food = (g: Game) => {
    let sum = 0;
    for (let y = 0; y < g.map.size.h; y++)
      for (let x = g.map.x0; x < g.map.x0 + g.map.size.w; x++) sum += g.map.food.get(x, y) * (1 + ((x * 31 + y) % 7));
    return sum;
  };
  assert.equal(food(b), food(a));
});
