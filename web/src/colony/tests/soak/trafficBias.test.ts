import { test } from "node:test";
import assert from "node:assert/strict";
import { Game, gameRng } from "../../game.ts";
import { STRAINS } from "../../fungus.ts";
import { generateOneWorld } from "../../oneWorld.ts";

// The tips' traffic bias in a one-world game (docs/hyphal-traffic.md, PRD §88, ja-ogph.3): with it off no side choice reads the
// ants (and the golden masters, which play it off, hold that bit for bit); with it on the occupancy grids reach the tips'
// side choices, and some of them are decided by the ants.

const GARDEN = STRAINS.findIndex((s) => s.id === "garden");

function played(trafficBias: "off" | "count" | "levels") {
  const g = new Game(
    generateOneWorld(3, { plane: { size: { w: 160, h: 100 } } }),
    { autoFound: false, fungus: { hyphae: true, flow: true, trafficBias } },
    gameRng(3),
    [{ antCount: 120 }, { antCount: 120 }],
  );
  g.land(0, GARDEN, { evolve: true });
  while (g.time < 150) g.tick(1 / 30);
  return g.fungus.hyphaeOn(0)!;
}

test("with the bias on, the tips' side choices read the ants and some are decided by them; off, none do", () => {
  const off = played("off");
  assert.equal(off.sideChoices, 0, "off: no side choice has a traffic reading");
  const count = played("count");
  assert.ok(count.sideChoices > 0, `${count.sideChoices} side choices with both sides open and a reading: the grids reach the tips`);
  assert.ok(count.trafficLeans >= 1, `${count.trafficLeans} of them decided by the ants`);
  assert.ok(count.trafficLeans <= count.sideChoices);
});
