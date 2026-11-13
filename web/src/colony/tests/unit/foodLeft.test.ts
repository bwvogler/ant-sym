import { test } from "node:test";
import assert from "node:assert/strict";
import { Game } from "../../game.ts";
import { mulberry32 } from "../../world.ts";
import { DT, smallOne } from "../builders.ts";

// Game.foodLeft (PRD §65): the map's food, every layer's, read from the game rather than through its first colony.

test("the game's food left is the map's, both layers of one world, as every colony counts it", () => {
  const g = new Game(smallOne(3), { antCount: 30, rivalAnts: 30 }, mulberry32(3));
  const both = () => g.world!.plane.foodLeft + g.world!.curtain.foodLeft;
  assert.equal(g.foodLeft, both());
  for (let k = 0; k < 300; k++) g.tick(DT);
  assert.equal(g.foodLeft, both(), "after some foraging");
  for (const c of g.colonies) assert.equal(g.foodLeft, c.foodLeft, "the same as each colony reads it");
  g.world!.curtain.foodLeft += 5;
  assert.equal(g.foodLeft, both(), "the curtain's buried food counts");
});
