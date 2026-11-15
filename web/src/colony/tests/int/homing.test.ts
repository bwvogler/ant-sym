import { test } from "node:test";
import assert from "node:assert/strict";
import { CURTAIN, PLANE } from "../../colony.ts";
import { Game } from "../../game.ts";
import { CELL } from "../../hex.ts";
import { mulberry32 } from "../../world.ts";
import { curtainHole, oneColony, own, smallOne } from "../builders.ts";

// Nest slice 1 (docs/nest-and-home.md §3.1): an ant knows where home is only by its own drifting home vector, corrected by
// local cues (the hole in sight, a strong nest trail underground). On one world (S2.3c); the plane's vector, its search and
// its edge are int/oneWorldHoming's, and a carrier far off is int/homingFar's.

test("road signs: underground, a strong nest trail underfoot fades the in-nest memory's error; with none it stays", () => {
  const run = (scent: number) => {
    const { c } = oneColony(1, { deposit: 0 }, () => "return", 4);
    // In the shaft, a little below the hole: underground, not in the chamber.
    const hole = curtainHole(own(c));
    const sx = hole.x;
    const sy = hole.y + 4;
    c.putAnt(0, CURTAIN, sx, sy);
    c.antCell(0);
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) c.ph.depositCell("home", CELL[0] + dx, CELL[1] + dy, scent);
    c.odoNest[0] = 100;
    c.mode[0] = 2;
    for (let k = 0; k < 30 * 2; k++) {
      c.putAnt(0, CURTAIN, sx, sy); // held in place: only the correction is measured
      c.tick(1 / 30);
    }
    return c.odoNest[0];
  };
  assert.ok(run(5) < 50, `strong trail: ${run(5).toFixed(1)}`);
  assert.ok(run(0) > 99, `no trail: ${run(0).toFixed(1)}`);
});

test("a homing ant whose vector is nearly right never searches: blocked anywhere but at its believed hole, it goes round (review of slice 1)", () => {
  // The first cut searched at any dead end on the ground: the offset grew a step per decision (3, −4.8, 7.7, … 50) and
  // sent ants 50–80 cells off. An ant whose vector is within 3 cells reaches its believed hole in sight of the real one.
  const g = new Game(smallOne(5), { antCount: 100 }, mulberry32(5));
  const c = g.player;
  let samples = 0;
  let searching = 0;
  for (let t = 0; t < 30 * 45; t++) {
    g.tick(1 / 30);
    if (t % 30 === 0)
      for (let i = 0; i < c.n; i++) {
        if (!c.alive[i] || c.mode[i] !== 2 || c.layer[i] !== PLANE) continue;
        // On the plane only, where its surface vector is what it homes by: underground it homes by its nest vector,
        // and a search there round a wrongly believed chamber is that vector's (a young porter, ja-xu6.1's runs).
        if (Math.hypot(c.driftSurf[i]! * c.odoSurf[i]!, c.driftSurfY[i]! * c.odoSurf[i]!) >= 3) continue;
        samples++;
        if (c.search[i] !== 0) searching++;
      }
  }
  assert.ok(samples > 50, `${samples} samples`);
  assert.equal(searching, 0, `${searching} of ${samples} were searching`);
});
