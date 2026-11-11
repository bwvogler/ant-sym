import { test } from "node:test";
import assert from "node:assert/strict";
import { check, fixture, record, type Scenario } from "../goldens.ts";

// The one-world golden master (tests/goldens.ts, docs/one-world.md §6 U3): seed 7's small plane (160 × 100, two nests) with
// the curtain under its line, 150 + 150 ants, alarm on the plane at nest 0's hole. Every 10 s it hashes both layers' food and
// each colony's fields on both, every ant (its layer too) and the crossings. Its own fixture, so recording it can't touch
// golden.json. Re-record (only for an intended behaviour change, said in the PR):
// GOLDEN_WRITE=1 node --test web/src/colony/tests/golden/oneWorldGolden.test.ts (it fails after writing; run again without it)

const SCENARIOS: Scenario[] = [{ name: "one world, seed 7", view: "one", seed: 7, ants: 150, seconds: 90, alarmAt: [30] }];

const golden = fixture(new URL("./oneWorldGolden.json", import.meta.url), SCENARIOS);

for (const s of SCENARIOS)
  test(`golden: ${s.name} matches its recording, every ant bit for bit, on both layers`, () => {
    check(s, golden[s.name], record(s), assert.deepEqual, assert.equal);
  });
