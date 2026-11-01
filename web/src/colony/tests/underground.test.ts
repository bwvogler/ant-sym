import { test } from "node:test";
import assert from "node:assert/strict";
import type { Colony } from "../colony.ts";
import { Game } from "../game.ts";
import { generateWorld, mulberry32 } from "../world.ts";

// The underground world end to end, in its own file: node --test's timeout covers a whole file, and the game file is near it.

test("underground: both colonies dig tunnels out of their chambers, soil goes on the mounds or back into unused space, food is reached, and food is never made or lost", () => {
  const map = generateWorld(3, { size: { w: 256, h: 192 }, nestGap: 100 });
  const g = new Game(map, { antCount: 300, rivalAnts: 300 }, mulberry32(21));
  for (let k = 0; k < 30 * 200; k++) g.tick(1 / 30);
  const [you, rival] = g.colonies as [Colony, Colony];
  for (const c of g.colonies) {
    assert.ok(c.soilDug > 150, `dug ${c.soilDug}`);
    let carried = 0;
    for (let i = 0; i < c.n; i++) carried += c.alive[i]! && c.pellet[i]! ? 1 : 0;
    assert.equal(c.soilOut + c.soilFilled + carried + c.soilLost, c.soilDug, "every pellet is on the mound, back underground, carried or lost");
    assert.ok(c.soilOut > 0 && c.soilFilled > 0, `${c.soilOut} on the mound, ${c.soilFilled} put back, of ${c.soilDug}`);
  }
  assert.equal(map.dug, you.soilDug + rival.soilDug, "the map counts every dug cell");
  assert.ok(you.stored + rival.stored > 0, "tunnels reached food");
  let carried = 0;
  for (const c of g.colonies) for (let i = 0; i < c.n; i++) carried += c.alive[i]! && c.carrying[i]! ? 1 : 0;
  assert.equal(Math.round(you.foodLeft + you.stored + rival.stored + carried), map.foodTotal, "food is conserved");
});
