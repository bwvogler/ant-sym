import { test } from "node:test";
import assert from "node:assert/strict";
import { CURTAIN, LIFESPAN, PLANE, type HoleCell } from "../../colony.ts";
import { Game, gameRng } from "../../game.ts";
import { generateOneWorld } from "../../oneWorld.ts";
import { MODES } from "../../vocab.ts";
import { DT, planeHole } from "../builders.ts";

// A carrier whose vector is far off still gets home (review of #20: the search once kept within 80 cells of the believed hole,
// and a carrier 86 cells off and more never found it). On one world's full-size plane (S2.3c): seed 7's player's hole has open
// ground for 12 px south-west and south-south-west. A belief past the plane's edge is int/oneWorldHoming's.

const RETURN = MODES.indexOf("return");

/** Seconds (up to `limit`) a lone carrier 12 px from its hole along (dx, dy) takes to get down it, believing the hole `err` px farther on. */
function carrierHome(dx: number, dy: number, err: number, limit: number): number {
  const g = new Game(generateOneWorld(7), { antCount: 10, rivalAnts: 10, regrow: 0 }, gameRng(7));
  for (const c of g.colonies) for (let i = 0; i < c.n; i++) if (c.alive[i]) c.age[i] = 0.05 * LIFESPAN; // the rest stay in
  const c = g.player;
  const H = planeHole(c.holeCells[c.params.nest] as HoleCell);
  c.age[0] = 0.5 * LIFESPAN;
  c.putAnt(0, PLANE, H.x + 12 * dx, H.y + 12 * dy);
  c.carrying[0] = 1;
  c.mode[0] = RETURN;
  c.odoSurf[0] = 100;
  c.driftSurf[0] = (err * dx) / 100;
  c.driftSurfY[0] = (err * dy) / 100;
  for (let k = 0; k < Math.round(limit / DT); k++) {
    g.tick(DT);
    if (c.layer[0] === CURTAIN) return (k + 1) * DT;
  }
  return NaN;
}

test("a carrier whose vector is far off still gets home: 90 and 150 px off, two ways (review of #20)", () => {
  // Measured (S2.3c): 204, 355, 207 and 461 s; along 7·π/8, 90 off took 1,263 s.
  for (const a of [5, 6]) {
    // a·π/8 from east, clockwise on the screen (y down): south-south-west and south-west
    const [dx, dy] = [Math.cos((a * Math.PI) / 8), Math.sin((a * Math.PI) / 8)];
    for (const err of [90, 150]) {
      const t = carrierHome(dx, dy, err, 600);
      assert.ok(t > 0, `along ${a}·π/8, ${err} px off: home within 600 s`);
    }
  }
});
