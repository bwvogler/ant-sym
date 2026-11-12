import { test } from "node:test";
import assert from "node:assert/strict";
import { GENERIC_ANT } from "../../colony/index.ts";
import { buildGame } from "../useColony.ts";

test("the page builds one world, whatever the settings (PRD §55)", () => {
  const g = buildGame({ species: "generic", seed: 3, antCount: 50, rival: true, generation: 0 });
  assert.ok(g.world, "a one-world game: the plane, the curtain and the line");
  assert.equal(g.map, g.world.plane, "its map is the plane");
});

test("the page builds the game with the species its settings name, and refuses one it does not know", () => {
  const settings = { seed: 3, antCount: 20, rival: true, generation: 0 };
  assert.equal(buildGame({ ...settings, species: "generic" }).params.species, GENERIC_ANT);
  assert.throws(() => buildGame({ ...settings, species: "nope" }), /no "nope"/);
});
