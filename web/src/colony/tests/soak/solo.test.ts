import { test } from "node:test";
import assert from "node:assert/strict";
import { Game } from "../../game.ts";
import { mulberry32 } from "../../world.ts";
import { smallOne } from "../builders.ts";

// A solo game, in its own file: node --test's timeout covers a whole file, and the game file is near it.

test("solo (no rival), the colony keeps foraging: nobody turned into a fighter", () => {
  // On a small one world (S2.3c): 300 ants stored 1,082 food in 200 s, and none ever fought.
  const g = new Game(smallOne(1), { antCount: 300, rival: false }, mulberry32(7919));
  for (let k = 0; k < 30 * 200; k++) g.tick(1 / 30);
  assert.deepEqual(g.player.stanceCounts(), { forage: g.player.population, defend: 0, raid: 0 }, "every ant forages");
  assert.equal(g.player.counts().fight, 0, "no fighters without an enemy");
});
