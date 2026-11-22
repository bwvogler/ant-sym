import { test } from "node:test";
import assert from "node:assert/strict";
import { PLANE } from "../../colony.ts";
import { Game } from "../../game.ts";
import { mulberry32, type WorldMap } from "../../world.ts";
import { smallOne } from "../builders.ts";

// Food regrows (ja-lo8.5, PRD §50.5): the ground's piles grow back toward their first size; off by default. On one world's
// plane, where the foragers find it (S2.3c: until then the side view's ground).

const plane = (g: Game): WorldMap => g.layers[PLANE]!;

/** Every food cell on the plane eaten bare, and what was there. */
function strip(g: Game): number {
  const m = plane(g);
  const { w, h } = m.size;
  let taken = 0;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const v = m.food.get(x, y);
      if (v > 0) {
        m.food.set(x, y, 0);
        m.foodLeft -= v;
        taken += v;
      }
    }
  return taken;
}

const surface = (g: Game) => {
  const m = plane(g);
  let s = 0;
  for (let y = 0; y < m.size.h; y++) for (let x = 0; x < m.size.w; x++) s += m.food.get(x, y);
  return s;
};

test("off by default: eaten ground stays bare", () => {
  const g = new Game(smallOne(2), {}, mulberry32(1), [{ antCount: 1 }]);
  assert.ok(strip(g) > 0, "the map has ground food");
  for (let k = 0; k < 30 * 60; k++) g.tick(1 / 30);
  assert.equal(surface(g), 0);
  assert.equal(g.regrown, 0);
});

test("on: bare piles grow back at their deficit over the regrowth time, a unit at a time, and the books balance", () => {
  const g = new Game(smallOne(2), { regrow: 600 }, mulberry32(1), [{ antCount: 1 }]);
  const total0 = plane(g).foodTotal;
  const taken = strip(g);
  const left0 = plane(g).foodLeft;
  for (let k = 0; k < 30 * 120; k++) g.tick(1 / 30);
  const back = surface(g);
  // Expected after 120 s at 600 s: 1 − e^(−0.2) ≈ 18 % of what was taken (the one ant may have eaten a little).
  assert.ok(back > 0.1 * taken && back < 0.3 * taken, `${back} of ${taken} back`);
  assert.ok(Number.isInteger(back), "whole units");
  assert.equal(g.regrown, plane(g).foodTotal - total0, "the total grows by what grew back");
  const took = left0 + g.regrown - plane(g).foodLeft;
  assert.ok(took >= 0 && took < 40, `food left is what was left plus what grew, less what the one ant took (${took})`);
});
