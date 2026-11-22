import { test } from "node:test";
import assert from "node:assert/strict";
import { centreX, centreY, DESERT_ANT, GENERIC_ANT, NEGLECTUS_ANT, OPEN, PLANE, rockAt } from "../../colony/index.ts";
import { combatObservers } from "../../colony/index.ts";
import { readFileSync } from "node:fs";
import { PAGE_ASKS_RESPONSE_LANES } from "../colonyJev.ts";
import { buildGame } from "../useColony.ts";

test("the page builds one world, whatever the settings (PRD §55)", () => {
  const g = buildGame({ species: "generic", seed: 3, antCount: 50, rival: true, generation: 0 });
  assert.ok(g.world, "a one-world game: the plane, the curtain and the line");
  assert.equal(g.map, g.world.plane, "its map is the plane");
  assert.equal(g.params.fight.intent, true);
  assert.equal(g.params.fight.attackDistance, 0.65);
  assert.equal(g.params.fight.counterattack, true);
});

test("the page's ant count and rival box name the colonies: a pair of the same size, or one", () => {
  const settings = { species: "generic", seed: 3, antCount: 50, generation: 0 };
  const pair = buildGame({ ...settings, rival: true });
  assert.deepEqual(
    pair.colonies.map((c) => c.params.antCount),
    [50, 50],
  );
  assert.deepEqual(
    buildGame({ ...settings, rival: false }).colonies.map((c) => c.params.antCount),
    [50],
  );
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
  const garden = buildGame({ ...settings, species: "neglectus" });
  assert.equal(garden.params.species, NEGLECTUS_ANT);
  assert.equal(garden.params.fight.intent, true);
  assert.equal(garden.params.fight.counterattack, true);
  assert.equal(garden.player.responses.contact, GENERIC_ANT.responses.contact);
});

test("directed combat follows species recognition and contact decisions when workers meet", () => {
  for (const species of ["desert", "neglectus"]) {
    const game = buildGame({ species, seed: 71, antCount: 1, rival: true, generation: 0 });
    const y = Math.floor(game.map.size.h / 2);
    let x = Math.floor(game.map.size.w / 2);
    while (x < game.map.size.w && rockAt(game.map, x, y) !== OPEN) x++;
    assert.ok(x < game.map.size.w, "the encounter needs open ground");
    let attacks = 0;
    let exposures = 0;
    for (const colony of game.colonies) {
      colony.params.speed = 0;
      colony.putAnt(0, PLANE, centreX(x, y), centreY(y));
      combatObservers.set(colony, {
        contact(action) {
          if (action.movement === "attack") attacks++;
        },
        exposure() {
          exposures++;
        },
      });
    }
    for (let tick = 0; tick < 12; tick++) game.tick(1 / 30);
    if (species === "desert") {
      assert.ok(attacks > 0);
      assert.ok(exposures > 0);
    } else {
      assert.equal(attacks, 0);
      assert.equal(exposures, 0);
    }
  }
});

// The page binds the ant's six response lanes through one flag (review of #281, S1/S3/D1): pinned here with the hook that passes it,
// so a change of either is a decision, not a drift.
test("the page asks the response lanes, and the hook that attaches the colonies passes the flag", () => {
  assert.equal(PAGE_ASKS_RESPONSE_LANES, true);
  const hook = readFileSync(new URL("../useColonyJev.ts", import.meta.url), "utf8");
  assert.match(hook, /attachColonies\(colonies, species, PAGE_ASKS_RESPONSE_LANES\)/);
});
