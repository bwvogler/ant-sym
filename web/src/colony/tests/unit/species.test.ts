import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_COLONY } from "../../colony.ts";
import { DEFAULT_GAME, Game } from "../../game.ts";
import { generateWorld, mulberry32 } from "../../world.ts";
import { localResponses } from "../../responses.ts";
import { GENERIC_ANT, type Species } from "../../species.ts";

// The generic ant is a species that changes nothing (docs/species.md step 1): a game that names no species plays today's ant.

test("the generic ant overrides no parameter and reuses the local responses themselves", () => {
  assert.deepEqual(GENERIC_ANT.params, {});
  assert.equal(GENERIC_ANT.responses, localResponses, "Colony compares its response functions by identity");
  assert.equal(DEFAULT_GAME.species, GENERIC_ANT, "a game plays the generic ant unless it names another");
  assert.ok(Object.keys(DEFAULT_COLONY).length > 0);
});

test("a species' parameters and responses reach every colony of the game, and a game's own settings still win", () => {
  const mine = { ...localResponses, trailRate: () => 0 };
  const quick: Species = { id: "quick", name: "Quick", params: { speed: 9.5, patience: 77 }, responses: mine };
  const world = generateWorld(1, { size: { w: 120, h: 80 } });
  const g = new Game(world, { antCount: 10, rivalAnts: 10, species: quick }, mulberry32(3));
  for (const c of g.colonies) {
    assert.equal(c.params.speed, 9.5);
    assert.equal(c.params.patience, 77);
    assert.equal(c.responses, mine);
  }
  // An explicit setting (an experiment's override) beats the species'.
  const h = new Game(world, { antCount: 10, rivalAnts: 10, species: quick }, mulberry32(3), { colony: { speed: 4 } });
  assert.equal(h.player.params.speed, 4);
  assert.equal(h.player.params.patience, 77);
  assert.equal(h.rival!.params.speed, 9.5, "the rival's own overrides are its own");
  // The generic game is untouched.
  const d = new Game(world, { antCount: 10, rivalAnts: 10 }, mulberry32(3));
  assert.equal(d.player.params.speed, DEFAULT_COLONY.speed);
  assert.equal(d.player.responses, localResponses);
  assert.equal(d.rival!.responses, localResponses);
});
