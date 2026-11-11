import { test } from "node:test";
import assert from "node:assert/strict";
import { R1_SECONDS, route1, runAssay } from "../../experiment.ts";

// R1 (experiment.ts route1, ja-lp4.16.2, PRD §59): carriers that pick up from a pile in a pocket of rock on one world's
// default plane get home. Target (design: no paper measures a pocket detour): at least 95 % of the pocket pickups home
// within 300 s, and a median of walked over the way round of at most 4. Measured at the baseline (before routeMemory),
// seeds 1-10 (`npm run exp -- --one r1`): seeds 1, 2, 6 and 9 have no pocket; of the other six 4 pass (5, 7, 8, 10) and 2 fail
// (home within 300 s / median ratio: seed 3 22.5 % / 11.2, seed 4 45 % / 13.2).
test("R1, one world: carriers from a pocket's pile get home (seeds 1-10; 95 % within 300 s, walked at most 4 times the way round)", { timeout: 1_200_000, todo: "fails on seeds 3 and 4 until route memory (ja-lp4.16.3, ja-lp4.16.4)" }, () => {
  const failed: string[] = [];
  for (let seed = 1; seed <= 10; seed++) {
    const r = runAssay(route1, seed, {});
    if (r.metrics.pass === 0) failed.push(`seed ${seed}: home300 ${(r.metrics.home300 as number).toFixed(2)}, ratio ${(r.metrics.ratio as number).toFixed(1)} (${R1_SECONDS} s)`);
  }
  assert.deepEqual(failed, [], failed.join("; "));
});
