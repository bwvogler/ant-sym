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

// The senses rows say what each field of a lane's situation is: a field with no row, a row for a field that is gone, or a changed value list
// (its order too) is drift. A boolean is the one exception: the drawer says "true · false", the schema lists false first.

/** Whether the words' value list matches the schema's: in order, but a boolean field in either order. */
function sameValues(said: string, values: readonly unknown[]): boolean {
  const want = values.map(String);
  const got = said.split(" · ");
  const bool = want.length === 2 && want.every((v) => v === "true" || v === "false");
  return JSON.stringify(bool ? got.slice().sort() : got) === JSON.stringify(bool ? want.slice().sort() : want);
}

test("the mode lane's senses rows name each field of its schema, with its values in order", () => {
  const fields = modeSchema(GENERIC_ANT.lanes.mode).fields;
  assert.deepEqual(
    Object.keys(MODE_SENSES),
    fields.map((f) => String(f.name)),
  );
  for (const f of fields)
    assert.ok(sameValues(MODE_SENSES[String(f.name)]![0], f.values), `${String(f.name)}: ${MODE_SENSES[String(f.name)]![0]}`);
});

test("the fungus's senses rows name each field of its schema, in its order, with its values in order", () => {
  assert.deepEqual(
    FUNGAL_SENSES.map((r) => r[0]),
    FUNGAL_SCHEMA.fields.map((f) => String(f.name)),
  );
  for (const [i, f] of FUNGAL_SCHEMA.fields.entries())
    assert.ok(sameValues(FUNGAL_SENSES[i]![1], f.values), `${String(f.name)}: ${FUNGAL_SENSES[i]![1]}`);
});

test("the values check fails a reversed list but not a boolean's other order", () => {
  assert.equal(sameValues("a · b · c", ["a", "b", "c"]), true);
  assert.equal(sameValues("c · b · a", ["a", "b", "c"]), false);
  assert.equal(sameValues("true · false", [false, true]), true);
});
