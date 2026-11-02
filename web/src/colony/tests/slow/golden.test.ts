import { test } from "node:test";
import assert from "node:assert/strict";
import { fixture, record, type Scenario } from "../goldens.ts";

// The long golden master (tests/goldens.ts): a side-view war at the page's defaults, long enough
// for fights, births from brood and the nest economy. Re-record (only for an intended behaviour
// change, said in the PR): GOLDEN_WRITE=1 node --test web/src/colony/tests/slow/golden.test.ts

const SCENARIOS: Scenario[] = [{ name: "side view war, seed 6", view: "side", seed: 6, ants: 600, seconds: 600 }];

const golden = fixture(new URL("./golden.json", import.meta.url), SCENARIOS);

for (const s of SCENARIOS)
  test(`golden: ${s.name} matches its recording, every ant bit for bit`, { timeout: 900_000 }, () => {
    const want = golden[s.name]!;
    const got = record(s);
    for (let k = 0; k < want.length; k++) assert.deepEqual(got[k], want[k], `${s.name}: first difference at t = ${want[k]!.t} s`);
  });
