import { test } from "node:test";
import assert from "node:assert/strict";
import { game1, runAssay } from "../../experiment.ts";

// G1 (experiment.ts game1): generateOneWorld(seed), 600 + 600 ants, 600 s, gameRng, the side view's held-food bound (A7):
// no colony with more than 2 foragers holding food over 120 s at any 10-s sample, counted on both layers.
// Route memory (ja-lp4.16, PRD §59) turned on at its shipped defaults (routeMemory 1, routeStep 4, routeSee 3) brings the guard's seeds under the bound:
// the most per colony (you / rival) on seed 4: 2 / 1, 5: 2 / 1, 9: 2 / 1 (seeds 1-10, the worst seed 5, sum 27; without it, on main: 33 / 6, 7 / 3,
// 11 / 3, worst 33, sum 193; PRD §59 has the table). Before it, one world failed the bound on every seed (U6a's measure: 12-44 at worst; the mound's smell,
// ja-lp4.11, PRD §56: seeds 5 and 9 at 10 and 7). The bound is not loosened (owner, 2026-11-11). Each seed runs about
// 3-5 minutes, so each has a file of its own (oneWorldG1Seed<n>.test.ts): node --test shards whole files, and the three
// seeds in one file held a slow.yml shard for 12 minutes.
/** G1 on one seed: the most foragers holding food over 120 s, per colony at any 10-s sample, at most 2. */
export function g1(seed: number): void {
  test(
    `G1, one world: hardly a forager holds its food over 120 s (seed ${seed}, 600 + 600 ants, 600 s; bound 2)`,
    { timeout: 1_800_000 },
    () => {
      const m = runAssay(game1, seed).metrics;
      const held = `${m["you.maxHeld"]} / ${m["rival.maxHeld"]} (on the plane ${m["you.maxHeldPlane"]} / ${m["rival.maxHeldPlane"]})`;
      assert.ok((m.maxHeld as number) <= 2, `foragers holding food over 120 s, most at any 10-s sample per colony: seed ${seed}: ${held}`);
    },
  );
}
