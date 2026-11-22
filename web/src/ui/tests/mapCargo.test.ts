import { test } from "node:test";
import assert from "node:assert/strict";
import { PLANE, CURTAIN } from "../../colony/index.ts";
import { buildGame } from "../useColony.ts";
import { carriedBroodOn } from "../mapCargo.ts";

test("held brood follows living carriers across layers at its actual stage, without floor or stale-cargo copies", () => {
  const g = buildGame({ species: "generic", seed: 3, antCount: 50, rival: false, generation: 0 }),
    c = g.colonies[0];
  c.brood.items.length = 0;
  c.alive.fill(0);
  c.carrying.fill(0);
  c.pellet.fill(0);
  c.broodHeld.fill(0);
  for (let i = 0; i < 4; i++) {
    const b = c.brood.add(50, 50, -1);
    b.held = i;
    b.stage = i === 0 ? 2 : 1;
    c.broodHeld[i] = 1;
    c.alive[i] = 1;
    c.layer[i] = CURTAIN;
  }
  c.brood.add(50, 50, -1); // A loose item does not attach itself to an ant.
  c.layer[1] = PLANE;
  c.alive[2] = 0;
  c.carrying[3] = 1; // A stale held index must not replace the actual food cargo.
  const before = structuredClone({ items: c.brood.items, x: c.x, y: c.y, alive: c.alive, layer: c.layer });
  assert.deepEqual(carriedBroodOn(c, CURTAIN), [{ i: 0, stage: 2 }]);
  assert.deepEqual(carriedBroodOn(c, PLANE), [{ i: 1, stage: 1 }]);
  assert.deepEqual(carriedBroodOn(c, -1), [
    { i: 0, stage: 2 },
    { i: 1, stage: 1 },
  ]);
  assert.deepEqual({ items: c.brood.items, x: c.x, y: c.y, alive: c.alive, layer: c.layer }, before);
  c.layer[0] = PLANE;
  assert.deepEqual(carriedBroodOn(c, CURTAIN), []);
  assert.deepEqual(carriedBroodOn(c, PLANE), [
    { i: 0, stage: 2 },
    { i: 1, stage: 1 },
  ]);
});
