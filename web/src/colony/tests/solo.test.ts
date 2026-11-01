import { test } from "node:test";
import assert from "node:assert/strict";
import { Game } from "../game.ts";
import { generateWorld, mulberry32, OPEN_WORLD } from "../world.ts";

// A solo game, in its own file: node --test's timeout covers a whole file, and the game file is near it.

test("solo (no rival), the colony keeps foraging: no stance to choose, nobody turned into a fighter", () => {
  const map = generateWorld(1, OPEN_WORLD);
  const g = new Game(map, { antCount: 600, rival: false }, mulberry32(7919));
  for (let k = 0; k < 30 * 200; k++) g.tick(1 / 30);
  assert.equal(g.player.stance, "forage");
  assert.equal(g.player.counts().fight, 0, "no fighters without an enemy");
  assert.equal(g.strategyChoices, 0, "the strategist was never asked");
});
