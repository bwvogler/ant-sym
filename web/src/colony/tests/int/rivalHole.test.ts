import { test } from "node:test";
import assert from "node:assert/strict";
import { CURTAIN, LIFESPAN, PLANE, type Colony, type HoleCell } from "../../colony.ts";
import { Game, gameRng } from "../../game.ts";
import { RETURN } from "../../vocab.ts";
import { DT, curtainHole, planeHole, smallOne } from "../builders.ts";

// A carrier homing across the plane passes the rival's hole without going down it, and one put down the rival's shaft climbs
// straight back out (review of #15: in the side view the step into the rival's hole was nearer its own, and on seed 8 a carrier
// stayed in that shaft for 300 s). On one world (S2.3c), from the side view's soak/side.test.ts.

/** A game of few ants, every founder young (they stay in) but the carrier. */
function game(seed: number): Game {
  const g = new Game(smallOne(seed), { antCount: 10, rivalAnts: 10, regrow: 0 }, gameRng(seed));
  for (const c of g.colonies) for (let i = 0; i < c.n; i++) if (c.alive[i]) c.age[i] = 0.05 * LIFESPAN;
  return g;
}

/** Ant 0 of the player, a carrier with an exact vector, put at (x, y) on `layer`. */
function carrier(g: Game, layer: number, x: number, y: number): Colony {
  const c = g.player;
  c.age[0] = 0.5 * LIFESPAN;
  c.putAnt(0, layer, x, y);
  c.carrying[0] = 1;
  c.mode[0] = RETURN;
  c.odoSurf[0] = 0;
  c.driftSurf[0] = 0;
  c.driftSurfY[0] = 0;
  return c;
}

/** Tick up to 120 s until the carrier takes its food down its own hole; whether it did, and its seconds under the rival's hole. */
function homeBy(g: Game, c: Colony): { home: boolean; under: number } {
  const r = g.colonies[1]!;
  const R = curtainHole(r.holeCells[r.params.nest] as HoleCell);
  let under = 0;
  for (let k = 0; k < Math.round(120 / DT) && c.carriedDown === 0; k++) {
    g.tick(DT);
    if (c.layer[0] === CURTAIN && Math.abs(c.x[0]! - R.x) < 30) under++;
  }
  return { home: c.carriedDown === 1, under: under * DT };
}

test("a carrier homing across the plane passes the rival's hole without going down it", () => {
  // Measured (S2.3c): home in 13.6-27.1 s, never under the rival's hole. 15 px out starts on rock on these seeds.
  for (const seed of [7, 1, 8])
    for (const off of [5, -5]) {
      const g = game(seed);
      const c = g.player;
      const r = g.colonies[1]!;
      const H = planeHole(c.holeCells[c.params.nest] as HoleCell);
      const R = planeHole(r.holeCells[r.params.nest] as HoleCell);
      // On the line from its hole through the rival's, `off` px past the rival's (5: beyond it, so home lies across the hole).
      const d = Math.hypot(R.x - H.x, R.y - H.y);
      carrier(g, PLANE, R.x + ((R.x - H.x) / d) * off, R.y + ((R.y - H.y) / d) * off);
      const a = homeBy(g, c);
      assert.ok(
        a.home && a.under === 0,
        `seed ${seed}, ${off} px past the rival's hole: home (${a.home}), ${a.under.toFixed(1)} s under it`,
      );
    }
});

test("a carrier put down the rival's shaft climbs straight back out and gets home", () => {
  // Measured (S2.3c): up on the plane in 0.6 s, home in 15-28 s.
  for (const seed of [7, 1, 8]) {
    const g = game(seed);
    const r = g.colonies[1]!;
    const R = curtainHole(r.holeCells[r.params.nest] as HoleCell);
    const c = carrier(g, CURTAIN, R.x, R.y + 4.5); // three rows down the rival's shaft
    const b = homeBy(g, c);
    assert.ok(b.home && b.under < 2, `seed ${seed}: home (${b.home}), out in ${b.under.toFixed(1)} s`);
  }
});
