import { test } from "node:test";
import assert from "node:assert/strict";
import { raidStop, runAssay } from "../../experiment.ts";

// A12 (~3 minutes), out of slow/assays.test.ts: one of the slow tier's two longest assays, and node --test shards whole files, so it runs in a
// file of its own (slow.yml).

// Behaviour MR 5.2 (PRD §49.3): A12 passes 20/20 (food stored 1.00 of the forage colony's, worst 0.99); the first version, with raiders
// waiting for a trail, stored 10 of 7,400.
test("A12 a raid no one can find doesn't starve the colony", () => {
  for (const seed of [1, 2]) {
    const m = runAssay(raidStop, seed).metrics;
    assert.equal(m.pass, 1, `seed ${seed}: stored ${m.stored} of ${m.control}`);
  }
});
