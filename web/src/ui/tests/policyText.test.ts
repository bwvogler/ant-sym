import { test } from "node:test";
import assert from "node:assert/strict";
import { GENERIC_ANT, decodeSituation, FUNGAL_SCHEMA, localPolicy, modeSchema, SITUATIONS } from "../../colony/index.ts";
import { byRows, FUNGAL_SENSES, LOCAL_MODE_RULES, localModeOtherwise, MODE_SENSES } from "../policyText.ts";

// The Policy tab's words for the local rules must say what the code does.

test("the mode rule in words gives localPolicy's answer in every situation", () => {
  for (let c = 0; c < SITUATIONS; c++) {
    const s = decodeSituation(c);
    assert.equal(byRows(LOCAL_MODE_RULES, localModeOtherwise, s), localPolicy(s), JSON.stringify(s));
  }
});

// The senses rows say what each field of a lane's situation is: a field with no row, or a row for a field that is gone, is drift.

test("the mode lane's senses rows name each field of its schema, with its values", () => {
  const fields = modeSchema(GENERIC_ANT.lanes.mode).fields;
  assert.deepEqual(
    Object.keys(MODE_SENSES),
    fields.map((f) => String(f.name)),
  );
  // A boolean is said "true · false", the schema lists false first: compare as sets.
  for (const f of fields)
    assert.deepEqual(MODE_SENSES[String(f.name)]![0].split(" · ").sort(), f.values.map(String).sort(), String(f.name));
});

test("the fungus's senses rows name each field of its schema, in its order, with its values", () => {
  assert.deepEqual(
    FUNGAL_SENSES.map((r) => r[0]),
    FUNGAL_SCHEMA.fields.map((f) => String(f.name)),
  );
  // groomed is boolean: the drawer says "true · false", the schema lists false first.
  for (const [i, f] of FUNGAL_SCHEMA.fields.entries()) {
    const said = FUNGAL_SENSES[i]![1].split(" · ").sort();
    assert.deepEqual(said, f.values.map(String).sort(), String(f.name));
  }
});
