import { test } from "node:test";
import assert from "node:assert/strict";
import { CURTAIN } from "../../colony.ts";
import { Game } from "../../game.ts";
import { CELL } from "../../hex.ts";
import { CRUST } from "../../oneWorld.ts";
import { isSky, mulberry32, OPEN, reachable, rockAt, SOIL } from "../../world.ts";
import { own, smallOne } from "../builders.ts";

// The curtain in play (S2.3c, from the side view's soak/side.test.ts "the ground line's crust stays…" and mound.soak.test.ts's
// last checks): after two minutes of digging, nobody stood buried, each nest still reaches its hole, the crust is open only at
// the holes and nothing was filled into the strip's sky. int/oneWorld's "the crust is solid except at the holes" checks a
// fresh curtain; soak/oneWorldMound the mound's books on the plane. An outcome guard: in this game no digger meets a face
// under the crust and nobody needs unburying (review of #247, N2), so it holds what the world ends as, not the mechanisms.

test("one world, the curtain over 120 s: nobody is buried, the way in stays open, the crust holds, the sky stays empty", () => {
  const g = new Game(smallOne(2), { antCount: 200, rivalAnts: 200 }, mulberry32(7));
  const curtain = g.world!.curtain;
  const solidT = g.colonies.map((c) => new Float32Array(c.n));
  let maxSolid = 0;
  for (let k = 0; k < 30 * 120; k++) {
    g.tick(1 / 30);
    // Nobody is buried: an ant in a cell spoil was put back into climbs out at once.
    g.colonies.forEach((c, n) => {
      for (let i = 0; i < c.n; i++) {
        if (!c.alive[i] || c.layer[i] !== CURTAIN) {
          solidT[n]![i] = 0;
          continue;
        }
        c.antCell(i);
        solidT[n]![i] = rockAt(curtain, CELL[0], CELL[1]) === OPEN ? 0 : solidT[n]![i]! + 1 / 30;
        maxSolid = Math.max(maxSolid, solidT[n]![i]!);
      }
    });
  }
  const { w } = curtain.size;
  const x0 = curtain.x0;
  for (const c of g.colonies) {
    assert.ok(c.soilDug > 20, `colony ${c.params.nest} dug (${c.soilDug})`);
    // The way in: its royal chamber reaches its hole.
    const h = own(c);
    const queen = c.queen!;
    const walk = reachable(curtain, queen.x, queen.y, "open");
    assert.equal(walk[h.row * w + h.col - x0], 1, `colony ${c.params.nest}: the chamber reaches the hole`);
  }
  assert.ok(maxSolid < 0.2, `longest any ant stood in solid ground: ${maxSolid.toFixed(2)} s`);
  // The crust holds: open only at the holes.
  const holes = new Set(g.world!.line.sHole);
  for (let col = x0; col < x0 + w; col++)
    if (!holes.has(col)) assert.notEqual(rockAt(curtain, col, CRUST), OPEN, `crust open at column ${col}`);
  // Nothing filled into the strip's sky.
  let filledSky = 0;
  for (let y = 0; y < CRUST; y++) for (let x = x0; x < x0 + w; x++) if (isSky(curtain, x, y) && rockAt(curtain, x, y) === SOIL) filledSky++;
  assert.equal(filledSky, 0, "nothing filled above the crust");
});
