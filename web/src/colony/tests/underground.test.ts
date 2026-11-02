import { test } from "node:test";
import assert from "node:assert/strict";
import type { Colony } from "../colony.ts";
import { Game } from "../game.ts";
import { generateWorld, mulberry32, OPEN, rockAt } from "../world.ts";
import { CELL, cellOf } from "../hex.ts";

// The underground world end to end, in its own file: node --test's timeout covers a whole file, and the game file is near it.

test("underground: both colonies dig tunnels out of their chambers, soil goes on the mounds or back into unused space, food is reached, and food is never made or lost", () => {
  const map = generateWorld(3, { size: { w: 256, h: 192 }, nestGap: 100 });
  const g = new Game(map, { antCount: 300, rivalAnts: 300 }, mulberry32(21));
  // No ant ever stands inside soil or rock: its stored (float32) position's cell is open, every tick. (Main's
  // square-grid test of a step rounding onto a soil cell's edge, review of #8, kept as an invariant on hexes.)
  let inSolid = 0;
  for (let k = 0; k < 30 * 200; k++) {
    g.tick(1 / 30);
    for (const c of g.colonies)
      for (let i = 0; i < c.n; i++) {
        if (!c.alive[i]) continue;
        cellOf(c.x[i] as number, c.y[i] as number);
        if (rockAt(map, CELL[0] as number, CELL[1] as number) !== OPEN) inSolid++;
      }
  }
  assert.equal(inSolid, 0, "ant-ticks inside a solid cell");
  const [you, rival] = g.colonies as [Colony, Colony];
  for (const c of g.colonies) {
    assert.ok(c.soilDug > 150, `dug ${c.soilDug}`);
    let carried = 0;
    for (let i = 0; i < c.n; i++) carried += c.alive[i]! && c.pellet[i]! ? 1 : 0;
    assert.equal(c.soilOut + c.soilFilled + carried + c.soilLost, c.soilDug, "every pellet is on the mound, back underground, carried or lost");
    // Most goes back underground (leaf-cutter backfill), but carriers still reach the mound: a floor, since conservation
    // alone counts pellets carried, and carriers that never got home would pass it (0.80–0.82 here, 2026-11-02).
    assert.ok(c.soilOut > 0.25 * c.soilDug && c.soilFilled > 0, `${c.soilOut} on the mound, ${c.soilFilled} put back, of ${c.soilDug}`);
  }
  assert.equal(map.dug, you.soilDug + rival.soilDug, "the map counts every dug cell");
  assert.ok(you.stored + rival.stored > 0, "tunnels reached food");
  let carried = 0;
  for (const c of g.colonies) for (let i = 0; i < c.n; i++) carried += c.alive[i]! && c.carrying[i]! ? 1 : 0;
  assert.equal(Math.round(you.foodLeft + you.stored + rival.stored + carried), map.foodTotal, "food is conserved");
});
