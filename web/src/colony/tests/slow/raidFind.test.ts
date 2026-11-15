import { test } from "node:test";
import assert from "node:assert/strict";
import { oneAssay, runAssay } from "../../experiment.ts";

// A11 (~6 minutes for its 10 seeds), out of slow/assays.test.ts: one of the slow tier's two longest assays, and node --test shards whole files, so it runs in a
// file of its own (slow.yml).

// On one world (its ONE_ASSAYS twin, #210; S2.2e): raids by trail, raiders leaving the trail to search on as scouts. A11 passes
// 20/20 on seeds 1–20 (trail gain median 3.38, worst 2.33; stuck at most 0.03; PRD §76.1).
test("A11 on one world: raiders find the rival, none stuck, and the raid trail gains 1.5× on most seeds", () => {
  let passed = 0;
  for (let seed = 1; seed <= 10; seed++) {
    const m = runAssay(oneAssay("raidFind"), seed).metrics;
    assert.ok((m.stuck as number) <= 0.1, `seed ${seed}: stuck ${m.stuck}`);
    passed += m.pass as number;
  }
  assert.ok(passed >= 6, `${passed}/10 at the mark`);
});
