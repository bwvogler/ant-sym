import { test } from "node:test";
import assert from "node:assert/strict";
import { decode, localPolicy, localStance, SITUATIONS, STANCES, type StanceSituation } from "../../colony/colony.ts";
import { byRows, LOCAL_MODE_RULES, LOCAL_STANCE_OTHERWISE, LOCAL_STANCE_RULES, localModeOtherwise } from "../policyText.ts";

// The Policy tab's words for the local rules must say what the code does.

test("the mode rule in words gives localPolicy's answer in every situation", () => {
  for (let c = 0; c < SITUATIONS; c++) {
    const s = decode(c);
    assert.equal(byRows(LOCAL_MODE_RULES, localModeOtherwise, s), localPolicy(s), JSON.stringify(s));
  }
});

test("the stance rule in words gives localStance's answer for every view", () => {
  const views: StanceSituation[] = [];
  for (const stance of STANCES)
    for (const ants of ["few", "some", "many"] as const)
      for (const losses of ["none", "some", "heavy"] as const)
        for (const enemyNearNest of [false, true])
          for (const foodLeft of ["plenty", "some", "scarce"] as const) for (const larder of ["low", "full"] as const) views.push({ stance, ants, losses, enemyNearNest, foodLeft, larder });
  for (const v of views) assert.equal(byRows(LOCAL_STANCE_RULES, () => LOCAL_STANCE_OTHERWISE, v), localStance(v), JSON.stringify(v));
});
