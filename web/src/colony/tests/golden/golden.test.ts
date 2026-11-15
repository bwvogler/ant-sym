import { test } from "node:test";
import assert from "node:assert/strict";
import { check, fixture, record, type Scenario } from "../goldens.ts";

// Golden masters (tests/goldens.ts), the fast pair, on one world's small plane (S2.3a: until then a side-view game and a
// top-down war): seed 4, 300 + 300 with alarm at nest 0's hole, and seed 3, 150 + 150, a longer game with alarm painted three times. Re-record (only for an intended behaviour change,
// said in the PR): GOLDEN_WRITE=1 node --test web/src/colony/tests/golden/golden.test.ts (it fails after writing; run again without it)

const SCENARIOS: Scenario[] = [
  { name: "one world, seed 4", seed: 4, ants: 300, seconds: 90, alarmAt: [30] },
  { name: "one world war, seed 3", seed: 3, ants: 150, seconds: 150, alarmAt: [20, 60, 61] },
];

const golden = fixture(new URL("./golden.json", import.meta.url), SCENARIOS);

for (const s of SCENARIOS)
  test(`golden: ${s.name} matches its recording, every ant bit for bit`, () => {
    check(s, golden[s.name], record(s), assert.deepEqual, assert.equal);
  });
