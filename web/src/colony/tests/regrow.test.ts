import { test } from "node:test";
import assert from "node:assert/strict";
import { Game } from "../game.ts";
import { generateSideWorld, isSky, mulberry32 } from "../world.ts";

// Food regrows (ja-lo8.5, PRD §49.5): the ground's piles grow back toward their first size; off by default.

const SMALL = { size: { w: 256, h: 160 }, nestGap: 120, surface: 40, nestCount: 1 };

/** Every surface food cell eaten bare, and what was there. */
function strip(g: Game): number {
  const { w, h } = g.map.size;
  let taken = 0;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const v = g.map.food.get(x, y);
      if (v > 0 && isSky(g.map, x, y)) {
        g.map.food.set(x, y, 0);
        g.map.foodLeft -= v;
        taken += v;
      }
    }
  return taken;
}

const surface = (g: Game) => {
  let s = 0;
  for (let y = 0; y < g.map.size.h; y++) for (let x = 0; x < g.map.size.w; x++) if (isSky(g.map, x, y)) s += g.map.food.get(x, y);
  return s;
};

test("off by default: eaten ground stays bare", () => {
  const g = new Game(generateSideWorld(2, SMALL), { antCount: 1, rival: false }, mulberry32(1));
  assert.ok(strip(g) > 0, "the map has ground food");
  for (let k = 0; k < 30 * 60; k++) g.tick(1 / 30);
  assert.equal(surface(g), 0);
  assert.equal(g.regrown, 0);
});

test("on: bare piles grow back at their deficit over the regrowth time, a unit at a time, and the books balance", () => {
  const g = new Game(generateSideWorld(2, SMALL), { antCount: 1, rival: false, regrow: 600 }, mulberry32(1));
  const total0 = g.map.foodTotal;
  const taken = strip(g);
  const left0 = g.map.foodLeft;
  for (let k = 0; k < 30 * 120; k++) g.tick(1 / 30);
  const back = surface(g);
  // Expected after 120 s at 600 s: 1 − e^(−0.2) ≈ 18 % of what was taken (the one ant may have eaten a little).
  assert.ok(back > 0.1 * taken && back < 0.3 * taken, `${back} of ${taken} back`);
  assert.ok(Number.isInteger(back), "whole units");
  assert.equal(g.regrown, g.map.foodTotal - total0, "the total grows by what grew back");
  const took = left0 + g.regrown - g.map.foodLeft;
  assert.ok(took >= 0 && took < 40, `food left is what was left plus what grew, less what the one ant took (${took})`);
});
