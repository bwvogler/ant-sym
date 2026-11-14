import { test } from "node:test";
import assert from "node:assert/strict";
import { CURTAIN, type Layer } from "../../colony.ts";
import { game1, runAssay } from "../../experiment.ts";
import { STRAINS } from "../../fungus.ts";
import { GAME_REGROW, Game, gameRng, MET } from "../../game.ts";
import { generateOneWorld } from "../../oneWorld.ts";

// Whole-game guards of one world (docs/one-world.md U6a), beside slow/side.test.ts: `npm run test:slow`.

// G1 (experiment.ts game1): generateOneWorld(seed), 600 + 600 ants, 600 s, gameRng, the side view's held-food bound (A7):
// no colony with more than 2 foragers holding food over 120 s at any 10-s sample, counted on both layers.
// Route memory (ja-lp4.16, PRD §59) turned on at its shipped defaults (routeMemory 1, routeStep 4, routeSee 3) brings the guard's seeds under the bound:
// the most per colony (you / rival) on seed 4: 2 / 1, 5: 2 / 1, 9: 2 / 1 (seeds 1-10, the worst seed 5, sum 27; without it, on main: 33 / 6, 7 / 3,
// 11 / 3, worst 33, sum 193; PRD §59 has the table). Before it, one world failed the bound on every seed (U6a's measure: 12-44 at worst; the mound's smell,
// ja-lp4.11, PRD §56: seeds 5 and 9 at 10 and 7). The bound is not loosened (owner, 2026-11-11). Each seed runs about 3-5 minutes.
test(
  "G1, one world: hardly a forager holds its food over 120 s (seeds 4, 5 and 9, 600 + 600 ants, 600 s; bound 2)",
  { timeout: 1_800_000 },
  () => {
    const held: string[] = [];
    let worst = 0;
    for (const seed of [4, 5, 9]) {
      const m = runAssay(game1, seed).metrics;
      held.push(
        `seed ${seed}: ${m["you.maxHeld"]} / ${m["rival.maxHeld"]} (on the plane ${m["you.maxHeldPlane"]} / ${m["rival.maxHeldPlane"]})`,
      );
      worst = Math.max(worst, m.maxHeld as number);
    }
    assert.ok(worst <= 2, `foragers holding food over 120 s, most at any 10-s sample per colony: ${held.join("; ")}`);
  },
);

// Unity reachable on one world (PRD §53, ja-i0f; docs/one-world.md U6a): Garden painted in both colonies at the start, in
// the curtain by each royal chamber, and the game as the page plays it (gameRng, regrowth on, autoFound off). The side view never got
// there: its colonies barely touch (≤ 0.34 % met in 10 min, PRD §53). Measured with scripts/unity.mjs --one: in 600 s no
// seed of 1–3 clears MET at 300 + 300 or 600 + 600 (peak met 0.11–0.43 %; the nests' odours within 0.02 of each other by
// then, so it is meeting that is short, all of it on the plane; ja-lp4.6.6); seed 3 at 600 + 600 clears it and unifies at 732 s.
// Since ja-web (the gate at the top of the shaft, PRD §48.6) fewer ants are out to meet: seed 3 peaks at 0.44 % at 768 s and
// doesn't unify in 1,800 s. The owner (2026-11-10, PR #68) skipped it until MET or its window is changed so a one-world game
// can unify (ja-lp4.6.6); UNITY=1 npm run test:slow runs it. About 3 minutes when it passes, 15 when it fails.
test(
  "unity, one world: Garden in both colonies clears MET and unifies (seed 3, 600 + 600 ants, within 900 s)",
  {
    timeout: 1_800_000,
    skip: process.env.UNITY ? false : "doesn't unify since ja-web's gate (ja-lp4.6.6); UNITY=1 npm run test:slow runs it",
  },
  () => {
    const g = new Game(generateOneWorld(3), { antCount: 600, rivalAnts: 600, regrow: GAME_REGROW, autoFound: false }, gameRng(3));
    const garden = STRAINS.findIndex((s) => s.id === "garden");
    for (const c of g.colonies) {
      const nest = (c.layers[CURTAIN] as Layer).nest;
      g.paintSpores(nest.x, nest.y, nest.r + 2, 3, 0.3, garden, CURTAIN);
    }
    let peak = 0;
    for (let k = 1; k <= 30 * 900 && g.outcome() !== "unified"; k++) {
      g.tick(1 / 30);
      if (k % 30 === 0) peak = Math.max(peak, g.unity().met);
    }
    const u = g.unity();
    assert.ok(Math.max(peak, u.met) >= MET, `the colonies met as allies: peak met ${(100 * peak).toFixed(2)} %`);
    assert.equal(
      g.outcome(),
      "unified",
      `unified by ${g.time.toFixed(0)} s: gap ${u.gap.toFixed(3)}, quiet ${u.quiet.toFixed(0)} s, met ${(100 * u.met).toFixed(2)} %`,
    );
  },
);
