import { test } from "node:test";
import assert from "node:assert/strict";
import { CURTAIN, PLANE } from "../../colony.ts";
import { STRAINS } from "../../fungus.ts";
import { Game, gameRng, type GameSave } from "../../game.ts";
import { HYPHA_MASS, keyCell } from "../../hyphae.ts";
import { generateOneWorld } from "../../oneWorld.ts";
import { OPEN, rockAt } from "../../world.ts";

// The mycelium as hyphae in a one-world game (docs/hyphal-growth.md, ja-2bw.2): rooted by the hole on the plane (the
// topsoil) and on the shaft's walls in the curtain, it grows on both maps from the mass the body has grown, puts its
// spores out only on open cells, and saves and loads as it was.

const GARDEN = STRAINS.findIndex((s) => s.id === "garden");

/** Seed 7's small plane (160 × 100), hyphae on, the fungus landed by colony 0's hole and evolving. */
function game(hyphae: boolean): Game {
  const g = new Game(
    generateOneWorld(7, { plane: { size: { w: 160, h: 100 } } }),
    { antCount: 40, rivalAnts: 40, autoFound: false, fungus: { hyphae } },
    gameRng(7),
  );
  g.land(0, GARDEN, { evolve: true });
  return g;
}

const runFor = (g: Game, seconds: number) => {
  const end = g.time + seconds;
  while (g.time < end) g.tick(1 / 30);
};

test("hyphae root on the plane and on the shaft's walls, and grow on both from the mycelium's mass", () => {
  const g = game(true);
  const plane0 = g.fungus.hyphaeOn(PLANE)!.length;
  const curtain0 = g.fungus.hyphaeOn(CURTAIN)?.length ?? 0;
  assert.ok(plane0 > 0, "no hyphae on the plane");
  assert.ok(curtain0 > 0, "no hyphae on the shaft's walls");
  runFor(g, 90);
  const plane = g.fungus.hyphaeOn(PLANE)!;
  const curtain = g.fungus.hyphaeOn(CURTAIN)!;
  assert.ok(plane.length > plane0, `the plane's hyphae did not grow (${plane.length})`);
  assert.ok(curtain.length > curtain0, `the curtain's hyphae did not grow (${curtain.length})`);
  // H4 in the game: the hyphae embody no more than the mycelium's mass.
  assert.ok((plane.length + curtain.length) * HYPHA_MASS <= g.fungus.evolution!.mass + HYPHA_MASS);
});

test("with hyphae, spores go out only on open cells, never into soil, rock or sky", () => {
  const g = game(true);
  runFor(g, 60);
  for (const l of [PLANE, CURTAIN]) {
    const map = l === PLANE ? g.world!.plane : g.world!.curtain;
    const { spores } = g.fungus.sporesOn(l)!;
    const h = g.fungus.hyphaeOn(l)!;
    for (const k of h.parent.keys()) {
      const [x, y] = keyCell(k);
      for (const [dx, dy] of [
        [0, 0],
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const)
        if (spores.get(x + dx, y + dy) > 0)
          assert.equal(rockAt(map, x + dx, y + dy), OPEN, `spores in a solid cell at ${x + dx},${y + dy} (layer ${l})`);
    }
  }
});

test("a game with hyphae saves and loads as it was", () => {
  const g = game(true);
  runFor(g, 30);
  const saved = JSON.parse(JSON.stringify(g.save())) as GameSave;
  const back = game(true);
  back.load(JSON.parse(JSON.stringify(saved)) as GameSave);
  assert.deepEqual(JSON.parse(JSON.stringify(back.save())), saved);
  assert.deepEqual(back.fungus.hyphaeOn(CURTAIN)!.save(), g.fungus.hyphaeOn(CURTAIN)!.save());
});

test("with hyphae off, the fungus grows none", () => {
  const g = game(false);
  runFor(g, 10);
  assert.equal(g.fungus.hyphaeOn(PLANE), null);
  assert.equal(g.fungus.hyphaeOn(CURTAIN), null);
});
