import assert from "node:assert/strict";
import { test } from "node:test";
import { defendControl } from "../../experiment.ts";

for (const intent of [false, true]) {
  test(`A13 controls preserve combat settings and duration (intent=${intent})`, () => {
    const fight = Object.freeze({ rate: 0.75, alarm: 3, intent });
    const sealed = defendControl(7, true, 12, fight);
    const undefended = defendControl(7, false, 12, fight, { defendAt: Infinity });
    for (const spec of [sealed, undefended]) {
      assert.equal(spec.seed, 7);
      assert.equal(spec.seconds, 12);
      assert.deepEqual(spec.game?.fight, fight);
      assert.notEqual(spec.game?.fight, fight);
    }
    assert.equal(undefended.sides?.colony?.defendAt, Infinity);
    assert.notEqual(sealed.sides?.colony?.defendAt, Infinity);
    undefended.game!.fight!.rate = 9;
    assert.equal(sealed.game!.fight!.rate, 0.75);
    assert.equal(fight.rate, 0.75);
  });
}
