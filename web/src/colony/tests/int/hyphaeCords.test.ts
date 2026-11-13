import { test } from "node:test";
import assert from "node:assert/strict";
import { CURTAIN, PLANE } from "../../colony.ts";
import { STRAINS } from "../../fungus.ts";
import { Game, gameRng, type GameSave } from "../../game.ts";
import { HYPHA_MASS, keyCell as hyphaCell } from "../../hyphae.ts";
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

test("at a web the game fades dead ends but keeps a corpse's cell; cords survive a save (review of #119, S1, N3)", () => {
  const g = game();
  const e = g.fungus.evolution!;
  e.growth = 1e7;
  g.fungus.upgrade("mycelium");
  g.fungus.upgrade("mycelium");
  runFor(g, 150);
  const h = g.fungus.hyphaeOn(PLANE)!;
  assert.ok(h.cords.size > 0, "no cords to save");
  // A hypha chain of three cells: cut its far end, so the middle is a dead end that fades; a corpse lies on the first.
  // The middle cell has no other branch, so once the far end is cut it is a dead end; the corpse lies one cell further in.
  const children = new Map<number, number>();
  for (const p of h.parent.values()) children.set(p, (children.get(p) ?? 0) + 1);
  const chain: number[] = [];
  for (const [k, p] of h.parent) {
    if (p === -1 || h.cords.has(k) || children.get(p) !== 1) continue;
    const pp = h.parent.get(p);
    // The corpse's cell, too, has no other branch and is no root: so it becomes a dead end itself, and only the corpse keeps it.
    if (pp === undefined || pp === -1 || children.get(pp) !== 1 || h.parent.get(pp) === -1 || h.cords.has(pp)) continue;
    chain.push(pp, p, k);
    break;
  }
  assert.equal(chain.length, 3, "no chain to cut");
  const [x0, y0] = hyphaCell(chain[0]!);
  g.fungus.colonise(PLANE, x0, y0);
  h.cut(chain[2]!);
  const faded = h.fadedCells;
  runFor(g, 10);
  assert.ok(h.fadedCells > faded, "nothing faded at a web");
  assert.ok(h.has(x0, y0), "the corpse's cell faded");
  // Save and load: the hyphae come back with their cords and counts.
  const saved = JSON.parse(JSON.stringify(g.save())) as GameSave;
  const back = game();
  back.load(JSON.parse(JSON.stringify(saved)) as GameSave);
  assert.deepEqual(back.fungus.hyphaeOn(PLANE)!.save(), h.save());
  assert.ok(back.fungus.hyphaeOn(PLANE)!.cords.size > 0);
});
