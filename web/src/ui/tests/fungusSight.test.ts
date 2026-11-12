import { test } from "node:test";
import assert from "node:assert/strict";
import { trailSight, TRAIL_FLOOR } from "../fungusSight.ts";

// What the field shows of the fungus (ja-vyu): trails by how far the fungus is into a colony.

test("a colony's trails show only once the fungus is in it, more strongly as more of it is", () => {
  assert.equal(trailSight(0, 200), 0);
  assert.equal(trailSight(3, 0), 0);
  assert.equal(trailSight(1, 1000), TRAIL_FLOOR + (1 - TRAIL_FLOOR) * 0.001);
  assert.ok(trailSight(20, 200) < trailSight(100, 200));
  assert.equal(trailSight(200, 200), 1);
});
