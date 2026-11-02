import { test } from "node:test";
import assert from "node:assert/strict";
import { fixture, record, type Scenario } from "./goldens.ts";

// Golden masters (tests/goldens.ts), the fast pair: the side view as the page opens it, and a
// top-down war with fights and alarm painted. Re-record (only for an intended behaviour change,
// said in the PR): GOLDEN_WRITE=1 node --test web/src/colony/tests/golden.test.ts

const SCENARIOS: Scenario[] = [
  { name: "side view, seed 4", view: "side", seed: 4, ants: 300, seconds: 90, alarmAt: [30] },
  { name: "top-down war, seed 3", view: "top", seed: 3, ants: 150, seconds: 150, alarmAt: [20, 60, 61] },
];

const golden = fixture(new URL("./golden.json", import.meta.url), SCENARIOS);

for (const s of SCENARIOS)
  test(`golden: ${s.name} matches its recording, every ant bit for bit`, () => {
    const want = golden[s.name]!;
    const got = record(s);
    for (let k = 0; k < want.length; k++) assert.deepEqual(got[k], want[k], `${s.name}: first difference at t = ${want[k]!.t} s`);
  });
