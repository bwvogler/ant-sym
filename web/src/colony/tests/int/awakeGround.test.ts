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
