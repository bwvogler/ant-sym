import { test } from "node:test";
import assert from "node:assert/strict";
import { buildGame } from "../useColony.ts";

test("the page builds one world, whatever the settings (PRD §55)", () => {
  const g = buildGame({ seed: 3, antCount: 50, rival: true, generation: 0 });
  assert.ok(g.world, "a one-world game: the plane, the curtain and the line");
  assert.equal(g.map, g.world.plane, "its map is the plane");
});
