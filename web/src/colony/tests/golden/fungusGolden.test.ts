import { test } from "node:test";
import assert from "node:assert/strict";
import { check, fixture, record, type Scenario } from "../goldens.ts";

// The landed-fungus golden master (ja-1ldx): one world at full size, seed 5, 600 + 600 ants, the garden strain landed at colony
// 0's hole and evolving with hyphae on, Stalks and Knots given at landing at their second level (so a stalk grows and knots form within the
// 40 s, which level 1 doesn't reach) and the rest bought in progression.mjs's order, on the
// fungus's local rule. Every 10 s it hashes what oneWorldGolden does and the fungus's whole state (spores on both layers, hosts,
// evolution, hyphae, corpses). oneWorldGolden runs no fungus and the other goldens are one-map games, so this is the one that
// fails when a plane rule or a fungus default changes what the fungus does (FungusParams.sun at 1 instead of its default 2 changes it).
// Its own fixture. Re-record (only for an intended change to the game or the fungus, said in the PR):
// GOLDEN_WRITE=1 node --test web/src/colony/tests/golden/fungusGolden.test.ts (it fails after writing; run again without it)

const SCENARIOS: Scenario[] = [
  {
    name: "one world, fungus landed, seed 5",
    view: "one",
    seed: 5,
    ants: 600,
    seconds: 40,
    landed: { strain: "garden", grant: ["stalks", "stalks", "knots", "knots"] },
  },
];

const golden = fixture(new URL("./fungusGolden.json", import.meta.url), SCENARIOS);

for (const s of SCENARIOS)
  test(`golden: ${s.name} matches its recording, the fungus bit for bit`, () => {
    check(s, golden[s.name], record(s), assert.deepEqual, assert.equal);
  });
