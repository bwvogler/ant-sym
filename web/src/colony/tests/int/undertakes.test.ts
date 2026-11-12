import { test } from "node:test";
import assert from "node:assert/strict";
import { LIFESPAN, MIDDLE, YOUNG } from "../../colony.ts";
import { Game } from "../../game.ts";
import { GENERIC_ANT, type Species } from "../../species.ts";
import { generateSideWorld, mulberry32 } from "../../world.ts";
import { SMALL_SIDE } from "../builders.ts";

// A species whose colony does not remove its dead (docs/species.md step 4, ja-fnd.5.3.4): ColonyParams.undertakes, set through the species'
// params, is read where the tick calls #undertake. The generic ant's default is true, so its goldens do not move.

/** One side-view game of the species: twenty of the middle-aged underground ants killed, then 90 s of the colony's life. */
function buryFor(species: Species): { corpses: number; buried: number } {
  const g = new Game(generateSideWorld(2, SMALL_SIDE), { antCount: 200, rival: false, species }, mulberry32(4));
  const c = g.player;
  for (let i = 0; i < c.n; i++) c.age[i] = ((YOUNG + MIDDLE) / 2) * LIFESPAN;
  for (let k = 0; k < 30 * 30; k++) g.tick(1 / 30);
  let killed = 0;
  for (let i = 0; i < c.n && killed < 20; i++)
    if (c.alive[i] && !c.carrying[i] && !c.pellet[i] && c.y[i]! > g.map.nest!.entrance!.y + 3) {
      c.kill(i);
      killed++;
    }
  for (let k = 0; k < 30 * 90; k++) g.tick(1 / 30);
  return { corpses: c.corpses.length, buried: c.buried };
}

test("a species that does not undertake leaves its dead where they fell; the generic ant buries them", () => {
  const generic = buryFor(GENERIC_ANT);
  assert.ok(generic.buried >= 5, `the generic ant buried ${generic.buried}`);
  const none = buryFor({ ...GENERIC_ANT, id: "none", params: { undertakes: false } });
  assert.equal(none.buried, 0, "nothing carried to the midden");
  assert.ok(none.corpses >= 10, `${none.corpses} still lie where they fell (the unclaimed rot, slowly)`);
});
