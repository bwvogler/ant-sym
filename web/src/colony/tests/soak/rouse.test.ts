import { test } from "node:test";
import assert from "node:assert/strict";
import { Colony } from "../../colony.ts";
import { DESERT_ANT } from "../../desertAnt.ts";
import { DEFAULT_MENU, Fungus, STRAINS } from "../../fungus.ts";
import { Game, gameRng } from "../../game.ts";
import { encodeLevels, inertLevers } from "../../levers.ts";
import { generateOneWorld } from "../../oneWorld.ts";
import type { Species } from "../../species.ts";
import { generateSideWorld, mulberry32 } from "../../world.ts";

// ja-rf5.18 (docs/rouse.md, PRD §60.8; design): the fungus's rouse lever. An infected host coming down its shaft counts as a share of a finder to
// the nestmates waiting at the top (their pace, invite.ts). Inert on a species whose finders don't invite; off the default menu.

const GARDEN = STRAINS.findIndex((s) => s.id === "garden");

test("rouse: none, some, strong set the host's share of a finder; off the default menu; inert where finders don't invite", () => {
  const map = generateSideWorld(1);
  const c = new Colony(map, { antCount: 1, maxAnts: 1, nest: 0 }, mulberry32(1));
  c.strain[0] = GARDEN;
  const f = new Fungus(map);
  f.configure({ hide: false, cull: false }, [...DEFAULT_MENU, "rouse"]);
  for (const [level, share] of [
    [0, 0],
    [1, 0.5],
    [2, 1],
  ] as const) {
    f.expressLevels(c, 0, { rouse: level }, 1);
    assert.equal(c.rouse[0], share, `level ${level}`);
  }
  assert.ok(!DEFAULT_MENU.includes("rouse"), "the player puts it on the menu");
  assert.ok(inertLevers(null).includes("rouse") && !inertLevers(null, true).includes("rouse"));
});

/** A one-world game of `species` with the fungus landed in the player's colony, its hosts pulling rouse at `level`; passes the waiting ants met. */
function passes(species: Species, level: number, seconds = 240): number {
  const g = new Game(generateOneWorld(1), { antCount: 60, rival: false, species }, gameRng(1));
  g.fungus.configure({ hide: false, cull: false }, [...DEFAULT_MENU, "rouse"]);
  g.land(0, GARDEN);
  g.fungus.bindPolicy("fungus", (s) => encodeLevels({ rouse: s.task === "queen" ? 0 : level }, g.fungus.asked));
  let met = 0;
  for (let k = 0; k < seconds * 30; k++) {
    g.tick(1 / 30);
    met += g.player.holeSeen;
  }
  return met;
}

test("a roused desert host coming down its shaft counts as a finder to the ants waiting at the top: more passes than with rouse none", () => {
  const off = passes(DESERT_ANT, 0);
  const on = passes(DESERT_ANT, 2);
  assert.ok(on > off, `passes the waiting ants met over four minutes: ${on.toFixed(1)} roused, ${off.toFixed(1)} not`);
});

test("on the generic ant (no invitation) rouse does nothing", () => {
  const generic = { ...DESERT_ANT, id: "generic-like", params: { ...DESERT_ANT.params, invitePace: 0 } } as Species;
  assert.equal(passes(generic, 2), passes(generic, 0));
});
