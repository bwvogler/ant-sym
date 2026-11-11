import { test } from "node:test";
import assert from "node:assert/strict";
import { decodeSituation, localPolicy, SITUATIONS } from "../../colony/index.ts";
import { byRows, LOCAL_MODE_RULES, localModeOtherwise } from "../policyText.ts";

// The Policy tab's words for the local rules must say what the code does.

test("the mode rule in words gives localPolicy's answer in every situation", () => {
  for (let c = 0; c < SITUATIONS; c++) {
    const s = decodeSituation(c);
    assert.equal(byRows(LOCAL_MODE_RULES, localModeOtherwise, s), localPolicy(s), JSON.stringify(s));
  }
});
