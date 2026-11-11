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
// Measured (U6a, `npm run exp -- --one game1 --seeds 1-10`): one world fails it on every seed. The most per colony, by
// seed (you / rival): 1: 12 / 15, 2: 10 / 16, 3: 11 / 32, 4: 18 / 4, 5: 13 / 6, 6: 11 / 20, 7: 12 / 22, 8: 16 / 10,
// 9: 13 / 7, 10: 44 / 10. Every one of them is on the plane (maxHeldPlane equals maxHeld): carriers lost on the surface on
// their way home, not stuck in the tunnels; porters hold theirs over 120 s on 2 of 20 colonies (at most 4). The bound is
// not loosened without the owner: this is skipped (a todo would still run its body, 6–10 minutes that can't fail) unless G1=1, on the two seeds whose worst colony held fewest (5 and 9, 13 each),
// until homing on the plane brings them under it (ja-lp4.6.3). Each seed runs about 3–5 minutes. With the mound's
// smell (ja-lp4.11, PRD §56) it still fails: 1: 10 / 13, 2: 19 / 8, 3: 12 / 24, 4: 35 / 7, 5: 6 / 10, 6: 10 / 18, 7: 6 / 11,
// 8: 11 / 10, 9: 7 / 2, 10: 18 / 8; seeds 5 and 9 at 10 and 7. The bound stays (owner, 2026-11-11).
// Forager trips (ja-lp4.15, PRD §57) are built and off by default, so this still fails. Run with `--set colony.planePatience=0.5
// --set rival.planePatience=0.5 --set colony.siteFidelity=1 --set rival.siteFidelity=1` (npm run exp -- --one game1) the guard's seeds
// 5 and 9 hold 2 / 1 and 0 / 0 at worst and 4 seeds in 10 meet the bound (worst seed 13), at -13.7 % food carried down and
// -12.8 % births against the default: not shipped without the owner. This test plays the defaults, so it stays skipped.
test("G1, one world: hardly a forager holds its food over 120 s (seeds 5 and 9, 600 + 600 ants, 600 s; measured 10 and 7 at worst, bound 2)", { timeout: 1_800_000, skip: process.env.G1 ? false : "fails the bound on every seed (ja-lp4.6.3); G1=1 npm run test:slow runs it" }, () => {
  const held: string[] = [];
  let worst = 0;
  for (const seed of [5, 9]) {
    const m = runAssay(game1, seed).metrics;
    held.push(`seed ${seed}: ${m["you.maxHeld"]} / ${m["rival.maxHeld"]} (on the plane ${m["you.maxHeldPlane"]} / ${m["rival.maxHeldPlane"]})`);
    worst = Math.max(worst, m.maxHeld as number);
  }
  assert.ok(worst <= 2, `foragers holding food over 120 s, most at any 10-s sample per colony: ${held.join("; ")}`);
});

// Unity reachable on one world (PRD §53, ja-i0f; docs/one-world.md U6a): Garden painted in both colonies at the start, in
// the curtain by each royal chamber, and the game as the page plays it (gameRng, regrowth on, autoFound off). The side view never got
// there: its colonies barely touch (≤ 0.34 % met in 10 min, PRD §53). Measured with scripts/unity.mjs --one: in 600 s no
// seed of 1–3 clears MET at 300 + 300 or 600 + 600 (peak met 0.11–0.43 %; the nests' odours within 0.02 of each other by
// then, so it is meeting that is short, all of it on the plane; ja-lp4.6.6); seed 3 at 600 + 600 clears it and unifies at 732 s.
// Since ja-web (the gate at the top of the shaft, PRD §48.6) fewer ants are out to meet: seed 3 peaks at 0.44 % at 768 s and
// doesn't unify in 1,800 s. The owner (2026-11-10, PR #68) skipped it until MET or its window is changed so a one-world game
// can unify (ja-lp4.6.6); UNITY=1 npm run test:slow runs it. About 3 minutes when it passes, 15 when it fails.
test("unity, one world: Garden in both colonies clears MET and unifies (seed 3, 600 + 600 ants, within 900 s)", { timeout: 1_800_000, skip: process.env.UNITY ? false : "doesn't unify since ja-web's gate (ja-lp4.6.6); UNITY=1 npm run test:slow runs it" }, () => {
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
  assert.equal(g.outcome(), "unified", `unified by ${g.time.toFixed(0)} s: gap ${u.gap.toFixed(3)}, quiet ${u.quiet.toFixed(0)} s, met ${(100 * u.met).toFixed(2)} %`);
});
