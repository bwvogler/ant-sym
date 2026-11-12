import { test } from "node:test";
import assert from "node:assert/strict";
import { CURTAIN, PLANE } from "../../colony.ts";
import { STRAINS } from "../../fungus.ts";
import { Game, gameRng } from "../../game.ts";
import { HYPHA_MASS } from "../../hyphae.ts";
import { generateOneWorld } from "../../oneWorld.ts";

// Cords in a one-world game (ja-2bw.8, docs/hyphal-growth.md §7): at a web the hyphae feeding many tips thicken. Its own
// file: the games run 150 s, which would push hyphaeGame.test.ts past the int tier's budget.

const GARDEN = STRAINS.findIndex((s) => s.id === "garden");

function game(): Game {
  const g = new Game(
    generateOneWorld(7, { plane: { size: { w: 160, h: 100 } } }),
    { antCount: 40, rivalAnts: 40, autoFound: false, fungus: { hyphae: true } },
    gameRng(7),
  );
  g.land(0, GARDEN, { evolve: true });
  return g;
}

const runFor = (g: Game, seconds: number) => {
  const end = g.time + seconds;
  while (g.time < end) g.tick(1 / 30);
};

test("at a web (the Mycelium upgrade's third level) the hyphae feeding many tips thicken into cords; below it none do", () => {
  const cordsAfter = (levels: number): number => {
    const g = game();
    const e = g.fungus.evolution!;
    e.growth = 1e7; // mutations enough to buy the levels at once
    for (let k = 0; k < levels; k++) assert.ok(g.fungus.upgrade("mycelium"), `level ${k + 1} not bought`);
    runFor(g, 150); // cords come once a lineage feeds CORD_FLOW tips: about 120 s in

    let cords = 0;
    let length = 0;
    for (const l of [PLANE, CURTAIN]) {
      const h = g.fungus.hyphaeOn(l)!;
      cords += h.cords.size;
      length += h.length;
    }
    assert.ok(length * HYPHA_MASS <= e.mass + HYPHA_MASS, "the hyphae hold more than the mycelium's mass");
    return cords;
  };
  assert.equal(cordsAfter(1), 0, "a borer grew cords");
  assert.ok(cordsAfter(2) > 0, "a web grew no cords");
});
