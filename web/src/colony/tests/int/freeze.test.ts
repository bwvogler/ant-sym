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

test("a sleeping colony is not fought, even where its ants stand among another colony's: the same game loses ants awake and none asleep", () => {
  const make = () => {
    const g = new Game(generateOneWorld(SEED), { regrow: 0, autoFound: false }, mulberry32(5), [{ antCount: 60 }, { antCount: 60 }]);
    const a = g.colonies[0]!;
    const b = g.colonies[1]!;
    // colony 1's ants stand on colony 0's, on the same layers
    for (let i = 0; i < b.n; i++) {
      b.x[i] = a.x[i]!;
      b.y[i] = a.y[i]!;
      b.layer[i] = a.layer[i]!;
    }
    return g;
  };
  const awake = make();
  run(awake, 15);
  const lostAwake = 60 - awake.colonies[1]!.population;
  assert.ok(lostAwake > 0, `awake, strangers on the same cells fight (${lostAwake} lost)`);
  const slept = make();
  slept.freeze(1);
  run(slept, 15);
  assert.equal(slept.colonies[1]!.population, 60, "asleep, colony 1 loses none");
  assert.equal(slept.colonies[0]!.population, 60, "and kills none of its own side either");
});

test("two colonies asleep together then awake together are bit for bit a pair that never slept", () => {
  const make = () => new Game(generateOneWorld(SEED), { regrow: 0, autoFound: false }, mulberry32(5), [{ antCount: 40 }, { antCount: 40 }]);
  const control = make();
  const slept = make();
  run(control, 20);
  run(slept, 20);
  slept.freeze(0);
  slept.freeze(1);
  run(slept, 30);
  slept.thaw(0);
  slept.thaw(1);
  run(control, 20);
  run(slept, 20);
  assert.equal(state(slept, 0), state(control, 0), "colony 0");
  assert.equal(state(slept, 1), state(control, 1), "colony 1: its first tick read grids that counted it");
});

test("the fungus's hosts stay counted while their colony sleeps: it stays active, and the thawed ants are stepped again", () => {
  const garden = STRAINS.findIndex((x) => x.id === "garden");
  const make = () => {
    const g = new Game(generateOneWorld(SEED), { regrow: 0, autoFound: false }, mulberry32(5), [{ antCount: 40 }]);
    g.paintSpores(g.colonies[0]!.x[0]!, g.colonies[0]!.y[0]!, 400, 0, 0.5, garden, 1); // load into the colony's ants, no spores on the ground
    return g;
  };
  const load = (g: Game) => {
    let sum = 0;
    for (let i = 0; i < g.colonies[0]!.n; i++) if (g.colonies[0]!.alive[i]) sum += g.colonies[0]!.load[i]!;
    return sum;
  };
  const control = make();
  const slept = make();
  assert.ok(control.fungus.hosts > 0, "the ants were dosed");
  run(control, 3);
  run(slept, 3);
  slept.freeze(0);
  assert.ok(slept.fungus.hostsAsleep > 0, "the sleeper's hosts are counted");
  run(slept, 20);
  assert.ok(slept.fungus.hosts > 0 && slept.fungus.active, "the fungus stays active while its only hosts sleep");
  slept.thaw(0);
  assert.equal(slept.fungus.hostsAsleep, 0);
  run(slept, 20);
  run(control, 20);
  assert.equal(load(slept), load(control), "and the thawed ants' load goes on exactly as a colony that never slept's");
});

test("in hyphae mode a frozen curtain takes no spores either: the spore-spots, corpses and knots stand still too", () => {
  const garden = STRAINS.findIndex((x) => x.id === "garden");
  const g = two();
  g.land(0, garden, { evolve: true });
  for (let t = 0; t < 30; t++) g.tick(1 / 30);
  const nest = g.colonies[1]!.layers[0]!.nest;
  g.fungus.root(nest.x + nest.r + 1, nest.y, 3, 0, { x: nest.x, y: nest.y }); // hyphae down the second line's hole too
  run(g, 120);
  const sum = () => {
    const on = g.fungus.sporesOn(2)!.spores;
    const t = g.world.lines[1]!.line;
    let n = 0;
    for (let s = t.sMin; s <= t.sMax; s++) for (let y = 40; y < 140; y++) n += on.get(s, y);
    return n;
  };
  assert.ok(g.fungus.hyphaeOn(2), "hyphae reached the second curtain");
  g.freeze(1);
  const before = sum();
  const mat = g.fungus.hyphaeOn(2)!.length;
  run(g, 60);
  assert.equal(sum(), before, "no spores were set down on the frozen curtain");
  assert.equal(g.fungus.hyphaeOn(2)!.length, mat, "and no hypha grew");
});

test("a save of a sleeper loads asleep: the frozen layers and the sleepers' hosts are set again after the load", () => {
  const garden = STRAINS.findIndex((x) => x.id === "garden");
  const make = () => two();
  const g = make();
  g.paintSpores(g.colonies[1]!.x[0]!, g.colonies[1]!.y[0]!, 400, 0, 0.5, garden, 2);
  g.freeze(1);
  const saved = JSON.parse(JSON.stringify(g.save())) as ReturnType<Game["save"]>;
  const fresh = make();
  fresh.load(saved);
  assert.deepEqual([...fresh.fungus.frozenLayers], [2], "the curtain is frozen again");
  assert.ok(fresh.fungus.hostsAsleep > 0, "and its hosts are counted");
});

test("without hyphae a frozen curtain's patch takes no spores either: the same patch grows awake and stands still asleep", () => {
  const garden = STRAINS.findIndex((x) => x.id === "garden");
  const make = () => {
    const g = new Game(oneWorldOnLines(SEED, generateWorld(SEED), [[0], [1]]), { regrow: 0, autoFound: false }, mulberry32(5), [
      { antCount: 40, line: 0 },
      { antCount: 40, line: 1 },
    ]);
    g.land(0, garden, { evolve: true });
    const nest = g.colonies[1]!.layers[2]!.nest;
    g.fungus.root(nest.x, nest.y, 2, 2); // a patch of the same fungus on the second curtain
    return g;
  };
  const total = (g: Game) => {
    const on = g.fungus.sporesOn(2)!.spores;
    const t = g.world.lines[1]!.line;
    let n = 0;
    for (let s = t.sMin; s <= t.sMax; s++) for (let y = 40; y < 140; y++) n += on.get(s, y);
    return n;
  };
  const awake = make();
  run(awake, 20);
  const grown = total(awake);
  const slept = make();
  run(slept, 20);
  const same = total(slept);
  slept.freeze(1);
  run(slept, 60);
  assert.equal(total(slept), same, "asleep, the patch put no spores down");
  run(awake, 60);
  assert.notEqual(total(awake), grown, "awake, it goes on");
});
