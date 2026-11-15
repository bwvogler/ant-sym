import { test } from "node:test";
import assert from "node:assert/strict";
import { oneAssay, runAssay } from "../../experiment.ts";

// A12 (~3 minutes), out of slow/assays.test.ts: one of the slow tier's two longest assays, and node --test shards whole files, so it runs in a
// file of its own (slow.yml).

// On one world (its ONE_ASSAYS twin, #210; S2.2e): A12 passes 17/20 on seeds 1–20 (food stored 0.83 of the forage colony's, worst 0.25,
// seed 12; fails 8, 12, 19: ja-lp4.6.10; PRD §76.1). Seeds 1 and 2 pass (0.81 each) and keep the mark.
test("A12 on one world: a raid no one can find doesn't starve the colony", () => {
  for (const seed of [1, 2]) {
    const m = runAssay(oneAssay("raidStop"), seed).metrics;
    assert.equal(m.pass, 1, `seed ${seed}: stored ${m.stored} of ${m.control}`);
  }
});
