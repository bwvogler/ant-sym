import assert from "node:assert/strict";
import { test } from "node:test";
import { STRAINS } from "../../fungus.ts";
import { CELL, cellOf } from "../../hex.ts";
import { Game } from "../../game.ts";
import { generateOneWorld, oneWorldOnLines } from "../../oneWorld.ts";
import { generateWorld, mulberry32 } from "../../world.ts";

// Freezing a colony (docs/endless-world.md §6, PRD §66 E4.1): its ants, scent and curtain stop; nobody meets it; the fungus leaves its curtain alone.

const SEED = 3;
const run = (g: Game, seconds: number) => {
  for (let t = 0; t < seconds * 30; t++) g.tick(1 / 30);
};
const state = (g: Game, k: number) => JSON.stringify(g.colonies[k]!.saveState());
const one = () => new Game(generateOneWorld(SEED), { regrow: 0, autoFound: false }, mulberry32(5), [{ antCount: 40 }]);
const two = () =>
  new Game(
    oneWorldOnLines(SEED, generateWorld(SEED), [[0], [1]]),
    { regrow: 0, autoFound: false, fungus: { hyphae: true } },
    mulberry32(5),
    [
      { antCount: 40, line: 0 },
      { antCount: 40, line: 1 },
    ],
  );

test("freeze then thaw is invisible: the colony stands bit for bit while asleep, then goes on as one that never slept", () => {
  const control = one();
  const slept = one();
  run(control, 20);
  run(slept, 20);
  const at = state(slept, 0);
  slept.freeze(0);
  assert.equal(slept.isFrozen(0), true);
  run(slept, 30);
  assert.equal(state(slept, 0), at, "asleep, nothing of it moved");
  slept.thaw(0);
  assert.equal(slept.isFrozen(0), false);
  run(control, 20);
  run(slept, 20);
  assert.equal(state(slept, 0), state(control, 0), "and after waking it is where a colony that never slept is");
});

test("a sleeping colony is not met and does not fight: its ants stand where they were, its losses do not change, the other goes on", () => {
  const g = new Game(generateOneWorld(SEED), { regrow: 0, autoFound: false }, mulberry32(5), [{ antCount: 60 }, { antCount: 60 }]);
  run(g, 10);
  const asleep = state(g, 1);
  const awakeBefore = state(g, 0);
  g.freeze(1);
  run(g, 60);
  assert.equal(state(g, 1), asleep, "the sleeping colony did not change");
  assert.notEqual(state(g, 0), awakeBefore, "the other colony went on");
});

test("the fungus leaves a curtain alone while every colony on it sleeps: its spores do not fade, and the plane is never left alone", () => {
  const garden = STRAINS.findIndex((x) => x.id === "garden");
  /** the spores within a few cells of colony k's nest on its own curtain */
  const spores = (g: Game, k: number) => {
    const nest = g.colonies[k]!.layers[g.colonies[k]!.home]!.nest;
    const on = g.fungus.sporesOn(g.colonies[k]!.home)!.spores;
    cellOf(nest.x, nest.y);
    const [cx, cy] = [CELL[0]!, CELL[1]!];
    let sum = 0;
    for (let dy = -6; dy <= 6; dy++) for (let dx = -6; dx <= 6; dx++) sum += on.get(cx + dx, cy + dy);
    return sum;
  };
  const setup = () => {
    const g = two();
    const nest = g.colonies[1]!.layers[2]!.nest;
    g.land(1, garden, { evolve: true });
    g.paintSpores(nest.x, nest.y, 4, 5, 0, garden, 2);
    return g;
  };
  const awake = setup();
  const start = spores(awake, 1);
  assert.ok(start > 0, "spores were laid on the second curtain");
  run(awake, 60);
  assert.ok(spores(awake, 1) < start, "awake, the spores on the curtain fade");

  const g = setup();
  assert.equal(g.fungus.frozenLayers.size, 0, "nothing is frozen yet");
  g.freeze(1);
  assert.deepEqual([...g.fungus.frozenLayers], [2], "the second curtain is, the plane is not");
  run(g, 60);
  assert.equal(spores(g, 1), start, "asleep, the spores on its curtain stand as they were");
  g.freeze(0);
  assert.deepEqual([...g.fungus.frozenLayers].sort(), [1, 2], "both curtains with both colonies asleep; never the plane");
  g.thaw(1);
  g.thaw(0);
  assert.equal(g.fungus.frozenLayers.size, 0);
  run(g, 60);
  assert.ok(spores(g, 1) < start, "awake again, they fade");
});

test("a curtain shared by two colonies is frozen only when both sleep", () => {
  const g = new Game(generateOneWorld(SEED), { regrow: 0, autoFound: false }, mulberry32(5), [{ antCount: 20 }, { antCount: 20 }]);
  g.freeze(0);
  assert.equal(g.fungus.frozenLayers.size, 0, "colony 1 is awake on the same curtain");
  g.freeze(1);
  assert.deepEqual([...g.fungus.frozenLayers], [1]);
  g.thaw(1);
  assert.equal(g.fungus.frozenLayers.size, 0);
});

test("which colonies sleep is saved, only when one does: a game that freezes nothing saves as it always has", () => {
  const g = new Game(generateOneWorld(SEED), { regrow: 0, autoFound: false }, mulberry32(5), [{ antCount: 20 }, { antCount: 20 }]);
  assert.equal("frozen" in g.save().private, false);
  g.freeze(1);
  const saved = JSON.parse(JSON.stringify(g.save())) as ReturnType<Game["save"]>;
  assert.deepEqual(saved.private.frozen, [1]);
  const fresh = new Game(generateOneWorld(SEED), { regrow: 0, autoFound: false }, mulberry32(5), [{ antCount: 20 }, { antCount: 20 }]);
  fresh.load(saved);
  assert.equal(fresh.isFrozen(1), true);
  assert.equal(fresh.isFrozen(0), false);
});

test("freezing a colony that is not there is an error", () => {
  assert.throws(() => one().freeze(3), /no colony 3/);
});
