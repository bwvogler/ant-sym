import { test } from "node:test";
import assert from "node:assert/strict";
import { DESERT_ANT, GENERIC_ANT } from "../../colony/index.ts";
import { buildGame } from "../useColony.ts";

test("the page builds one world, whatever the settings (PRD §55)", () => {
  const g = buildGame({ species: "generic", seed: 3, antCount: 50, rival: true, generation: 0 });
  assert.ok(g.world, "a one-world game: the plane, the curtain and the line");
  assert.equal(g.map, g.world.plane, "its map is the plane");
  assert.equal(g.params.fight.intent, true);
  assert.equal(g.params.fight.attackDistance, 0.65);
  assert.equal(g.params.fight.counterattack, true);
});

test("the page builds the game with the species its settings name, and refuses one it does not know", () => {
  const settings = { seed: 3, antCount: 20, rival: true, generation: 0 };
  assert.equal(buildGame({ ...settings, species: "generic" }).params.species, GENERIC_ANT);
  assert.throws(() => buildGame({ ...settings, species: "nope" }), /no "nope"/);
  const desert = buildGame({ ...settings, species: "desert" });
  assert.equal(desert.params.species, DESERT_ANT);
  assert.equal(desert.params.fight.intent, true);
  assert.equal(desert.params.fight.counterattack, true);
  assert.equal(desert.player.responses.contact, DESERT_ANT.responses.contact);
});
