import { test } from "node:test";
import assert from "node:assert/strict";
import { raidFind, runAssay } from "../../experiment.ts";

// A11 (~6 minutes for its 10 seeds), out of slow/assays.test.ts: one of the slow tier's two longest assays, and node --test shards whole files, so it runs in a
// file of its own (slow.yml).

// Behaviour MR 5.2 (PRD §49) with ja-sf1 (§49.7): raids by trail, raiders leaving the trail to search on as scouts. A11's trail gain is
// 2.04 median (1.32–4.40), 16/20 seeds at its mark of 1.5 (seeds 21–40: 1.84, 13/20); none is stuck.
test("A11 raiders find the rival: none stuck, and the raid trail gains 1.5× on most seeds", () => {
  let passed = 0;
  for (let seed = 1; seed <= 10; seed++) {
    const m = runAssay(raidFind, seed).metrics;
    assert.ok((m.stuck as number) <= 0.1, `seed ${seed}: stuck ${m.stuck}`);
    passed += m.pass as number;
  }
  assert.ok(passed >= 6, `${passed}/10 at the mark`);
});
