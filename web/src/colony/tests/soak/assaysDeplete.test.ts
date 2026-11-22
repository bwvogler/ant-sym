import { test } from "node:test";
import assert from "node:assert/strict";
import { oneAssay, runAssay } from "../../experiment.ts";

// A3 on one world (its ONE_ASSAYS twin, S2.2e; PRD §76.1: 20/20), out of soak/assays.test.ts: that file took 54 to 116 s on CI
// against the soak tier's 120 s file limit (a timeout on 2026-11-19), and A3 and A4 (four games) were 57 of its 75 s. node --test shards whole
// files, so one file each lets the shards run them side by side (ja-w4hi).

for (const seed of [1, 2]) {
  test(`A3 depletion passes on one world (seed ${seed}): traffic leaves an emptied patch within 60 s`, () => {
    const m = runAssay(oneAssay("deplete"), seed).metrics;
    assert.equal(m.pass, 1, `clearAfter ${m.clearAfter}`);
  });
}
