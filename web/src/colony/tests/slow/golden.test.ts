import { test } from "node:test";
import assert from "node:assert/strict";
import { check, fixture, record, type Scenario } from "../goldens.ts";

// The long golden master (tests/goldens.ts): the full-size one world at 600 + 600 (S2.3a: until then a side-view war), long
// enough for fights, births from brood and the nest economy. Re-record (only for an intended behaviour
// change, said in the PR): GOLDEN_WRITE=1 node --test web/src/colony/tests/slow/golden.test.ts (it fails after writing; run again without it)

const SCENARIOS: Scenario[] = [{ name: "one world war, seed 6", full: true, seed: 6, ants: 600, seconds: 600 }];

const golden = fixture(new URL("./golden.json", import.meta.url), SCENARIOS);

for (const s of SCENARIOS)
  test(`golden: ${s.name} matches its recording, every ant bit for bit`, { timeout: 900_000 }, () => {
    check(s, golden[s.name], record(s), assert.deepEqual, assert.equal);
  });
