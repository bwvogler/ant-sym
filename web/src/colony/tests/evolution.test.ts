import { test } from "node:test";
import assert from "node:assert/strict";
import { CountGrid, occupancy } from "../battle.ts";
import { Colony } from "../colony.ts";
import { BODY, Evolution, MUTATION, UPGRADES, upgrade } from "../evolution.ts";
import { Fungus, INFECTED, STRAINS, type Strain } from "../fungus.ts";
import { fungalKey } from "../fungusBrain.ts";
import { Game } from "../game.ts";
import { hold, LEVERS } from "../levers.ts";
import { generateSideWorld, mulberry32, worldFromArrays, type WorldMap } from "../world.ts";
import { put } from "./hexmaps.ts";
import type { FungalSituation } from "../fungalPolicy.ts";

// The fungus's body and evolution (ja-lo8.12): reach holds levels where they take effect and nowhere else, mutations
// come with growth, the mycelium pays for its spores, a founded colony can get what the first colony got, and the
// minimum dose is a rate.

const GARDEN = STRAINS.findIndex((s) => s.id === "garden");

function arena(): WorldMap {
  return worldFromArrays({ w: 40, h: 12 }, [{ x: 4, y: 6, r: 2 }, { x: 36, y: 6, r: 2 }]);
}

function placed(map: WorldMap, cells: [number, number][]): Colony {
  const c = new Colony(map, { antCount: cells.length, maxAnts: cells.length, nest: 0 }, mulberry32(1));
  cells.forEach((cell, i) => put(c, i, cell[0], cell[1]));
  return c;
}

function run(f: Fungus, colonies: Colony[], seconds: number, dt = 1 / 30): void {
  const grids = colonies.map(() => new CountGrid());
  for (let k = 0; k < Math.round(seconds / dt); k++) {
    colonies.forEach((c, j) => occupancy(c, grids[j] as CountGrid));
    f.step(colonies, grids, dt);
  }
}

const lever = (id: string) => LEVERS.find((v) => v.id === id)!;

test("hold: a level is pulled back toward as is until it is within reach; levers without a reach keep their range", () => {
  const food = lever("food"); // five levels, as is at 2
  const rival = lever("rival"); // three levels, as is at 0
  assert.deepEqual(hold({ food: 4, rival: 2 }, { food: 1, rival: 1 }), { food: 3, rival: 1 });
  assert.deepEqual(hold({ food: 0 }, { food: 1 }), { food: 1 }, "down as well as up");
  assert.deepEqual(hold({ food: 4, rival: 2 }, { food: 0, rival: 0 }), { food: food.asIs, rival: rival.asIs }, "reach 0: as is");
  const within = { food: 3, crown: 1 };
  assert.equal(hold(within, { food: 1 }), within, "nothing held back: the same object");
  assert.equal(hold(within, null), within);
  assert.deepEqual(hold({ crown: 1 }, { food: 0 }), { crown: 1 }, "a lever with no reach (lethal) keeps its range");
});

test("reach acts where levels take effect: Jev's question and cache key do not change, the host's gains do", () => {
  const map = arena();
  const c = placed(map, [[10, 6]]);
  const f = new Fungus(map);
  const before = f.asked;
  const sit: FungalSituation = { arousal: "calm", touch: "none", place: "outside", task: "forager", carrying: "nothing", groomed: false };
  const key = fungalKey(sit, f.askedFor(sit));
  f.evolve(GARDEN);
  assert.deepEqual(f.asked, before, "every lever is still asked, on its full scale");
  assert.equal(fungalKey(sit, f.askedFor(sit)), key, "so the cache key is the same, and an upgrade re-asks nothing");
  // Jev wants food scent strongly boosted (×2.5); the fungus starts with Senses at one step (×1.5).
  f.expressLevels(c, 0, { food: 4 }, 1);
  assert.ok(Math.abs((c.gainFood[0] as number) - 1.5) < 1e-9, `held to one step: ${c.gainFood[0]}`);
  assert.deepEqual(f.held({ food: 4, odour: 2 }), { food: 3, odour: 0 }, "and Recognition starts at none");
  const e = f.evolution!;
  e.replicate(upgrade("senses").costs[0]! / MUTATION);
  assert.ok(f.upgrade("senses"), "the mutations for the Senses' full range");
  f.expressLevels(c, 0, { food: 4 }, 1);
  assert.ok(Math.abs((c.gainFood[0] as number) - 2.5) < 1e-9, `the full range: ${c.gainFood[0]}`);
  // A lab helper runs a preset whatever the menu and the reach say.
  f.express(c, 0, 2, 1); // share: food 3
  assert.ok(Math.abs((c.gainFood[0] as number) - 1.5) < 1e-9);
});

test("mutations: a fixed share of growth, kept level by level, each level of an upgrade asking more than the last", () => {
  for (const u of UPGRADES) for (let k = 1; k < u.costs.length; k++) assert.ok(u.costs[k]! > u.costs[k - 1]!, `${u.id}: level ${k + 1} asks more`);
  const e = new Evolution(GARDEN);
  assert.equal(e.mutations, 0);
  const [a, b, c] = upgrade("infectivity").costs as number[];
  e.replicate((a! + b!) / MUTATION);
  assert.ok(Math.abs(e.mutations - (a! + b!)) < 1e-9, "growth × MUTATION");
  assert.ok(e.buy("infectivity") && e.buy("infectivity"), "levels 1 and 2");
  assert.equal(e.cost("infectivity"), c);
  assert.equal(e.buy("infectivity"), false, "level 3: not enough");
  assert.ok(Math.abs(e.mutations) < 1e-9);
  assert.equal(e.traits().transmission, upgrade("infectivity").values![2]);
  e.replicate(1e7);
  for (const u of UPGRADES) while (e.buy(u.id));
  for (const u of UPGRADES) assert.equal(e.cost(u.id), null, `${u.id} at its last level`);
  assert.equal(e.buy("infectivity"), false);
  const back = Evolution.load(JSON.parse(JSON.stringify(e.save())));
  assert.deepEqual(back.save(), e.save(), "a save round-trips");
});

test("mutations come as fast as the fungus grows: the panel's rate settles at MUTATION × growth a second", () => {
  const e = new Evolution(GARDEN);
  for (let k = 0; k < 2000; k++) {
    e.replicate(0.4 * 0.1);
    e.pace(0.4 * 0.1, 0.1);
  }
  assert.ok(Math.abs(e.rate - MUTATION * 0.4) < 1e-3, `rate ${e.rate}`);
  for (let k = 0; k < 2000; k++) e.pace(4 * 0.1, 0.1);
  assert.ok(Math.abs(e.rate - MUTATION * 4) < 1e-2, "ten times the growth, ten times the mutations");
});

test("the mycelium grows on its patches and pays for its spores out of its mass; it settles below what they hold", () => {
  const e = new Evolution(GARDEN);
  assert.equal(e.grow(1), 0, "no patch, no mycelium");
  e.root();
  assert.equal(e.mass, BODY.start);
  let spores = 0;
  let mass = e.mass;
  for (let k = 0; k < 6000; k++) {
    const before = e.mass;
    const s = e.grow(0.1);
    spores += s;
    assert.ok(s >= 0 && e.mass > 0);
    mass = e.mass;
    if (k > 5900) assert.ok(Math.abs(e.mass - before) < 1e-3, "settled");
  }
  const t = e.traits();
  assert.ok(Math.abs(mass - t.capacity * (1 - t.spores / BODY.growth)) < 0.05, `where growth meets sporulation: ${mass.toFixed(2)}`);
  assert.ok(spores > 0);
  assert.ok(e.mutations > 0, "its growth on the ground mutates too");
  e.root();
  for (let k = 0; k < 6000; k++) e.grow(0.1);
  assert.ok(Math.abs(e.mass - 2 * t.capacity * (1 - t.spores / BODY.growth)) < 0.1, `two patches hold twice as much: ${e.mass.toFixed(2)}`);
});

test("the minimum dose is a rate: a clean ant exposed above it is infected at any step, below it at none", () => {
  const map = arena();
  for (const [transmission, infected] of [
    [0.06, true],
    [0.01, false],
  ] as const)
    for (const dt of [0.1, 0.02]) {
      const strain: Strain = { ...(STRAINS[GARDEN] as Strain), transmission, decay: 0 };
      const f = new Fungus(map, { grooming: 0, priming: 0 }, [strain]);
      const c = placed(map, [
        [10, 6],
        [11, 6],
      ]);
      c.load[0] = 1;
      f.hosts = 1;
      run(f, [c], 3, dt);
      assert.equal((c.load[1] as number) > 0, infected, `transmission ${transmission} at a ${dt} s step: ${c.load[1]}`);
    }
});

test("the game's landing: an evolving fungus roots by the hole, keeps sporulating there, and mutates as it grows", () => {
  const g = new Game(generateSideWorld(1), { antCount: 200, rivalAnts: 200 }, mulberry32(7919));
  g.land(0, GARDEN, { evolve: true });
  const f = g.fungus;
  assert.ok(f.evolution && f.base.length > 0);
  assert.equal(f.strains[GARDEN]!.transmission, upgrade("infectivity").values![0], "Garden starts weak");
  assert.equal(STRAINS[GARDEN]!.transmission, 0.3, "the listed strain is untouched");
  const { w } = g.map.size;
  const onBase = () => f.base.reduce((n, key) => n + f.spores.get(key % w, Math.floor(key / w)), 0);
  for (let k = 0; k < 30 * 120; k++) g.tick(1 / 30);
  assert.ok(onBase() > 0, "two minutes on, its patch still holds spores (the landing's alone fade at 3 % a second)");
  assert.ok(f.evolution.mutations >= 1, `mutations from its growth: ${f.evolution.mutations}`);
  // A lab or test landing keeps the strain as listed, with no body.
  const lab = new Game(generateSideWorld(1), { antCount: 50, rivalAnts: 50 }, mulberry32(1));
  lab.land(0, GARDEN);
  assert.equal(lab.fungus.evolution, null);
  assert.equal(lab.fungus.base.length, 0);
});

test("a colony the world starts with has nothing a founded one can't get", () => {
  const g = new Game(generateSideWorld(1), { antCount: 200, rivalAnts: 200 }, mulberry32(7919));
  g.land(0, GARDEN, { evolve: true });
  for (let k = 0; k < 30 * 5; k++) g.tick(1 / 30);
  const e = g.colonies[1]!.nest.entrance!;
  const clean = g.colonies[g.addColony({ x: e.x + 40, y: e.y, antCount: 200, odour: 0.5 })]!;
  const first = g.colonies[0]!;
  // The same colony: params but identity, a queen, chambers, policies, responses and the game's wiring.
  const own = (c: typeof first) => Object.fromEntries(Object.entries(c.params).filter(([k]) => !["nest", "odour", "antCount", "maxAnts"].includes(k)));
  assert.deepEqual(own(clean), own(first));
  assert.equal(clean.params.maxAnts, first.params.maxAnts);
  assert.ok(clean.queen?.alive && first.queen?.alive);
  assert.equal(clean.policy, first.policy);
  assert.equal(clean.stancePolicy, first.stancePolicy);
  assert.equal(clean.responses, first.responses);
  for (const wire of ["friends", "enemies", "nestmates", "onBury", "raidMarks"] as const) assert.equal(Boolean(clean[wire]), Boolean(first[wire]), wire);
  assert.equal(clean.others.length, first.others.length);
  // The fungus: a clean founding gets no patch; one whose queen carries the evolving fungus gets what the landing gave.
  const patches = g.fungus.base.length;
  assert.equal(g.fungus.evolution!.patches, 1);
  const carried = g.colonies[g.addColony({ x: e.x + 80, y: e.y, antCount: 200, odour: 0.5, fungus: { load: 0.4, strain: GARDEN } })]!;
  assert.equal(carried.queen!.load, 0.4);
  assert.equal(g.fungus.evolution!.patches, 2, "it roots by her hole");
  assert.ok(g.fungus.base.length > patches);
  const { w } = g.map.size;
  const hole = carried.nest.entrance!;
  assert.ok(g.fungus.base.slice(patches).every((key) => Math.abs((key % w) + 0.5 - hole.x) < 8), "by her hole, as the landing is by the first colony's");
});

test("a weak start loses in the nest: Garden as listed takes a quarter of the colony in seconds, the evolving one does not", () => {
  const share = (evolve: boolean) => {
    const g = new Game(generateSideWorld(1), { antCount: 300, rivalAnts: 300 }, mulberry32(7919));
    g.land(0, GARDEN, { evolve });
    let most = 0;
    for (let k = 0; k < 30 * 60; k++) {
      g.tick(1 / 30);
      if (k % 30) continue;
      const f = g.fungus.census(g.colonies[0]!);
      most = Math.max(most, f.infected / f.living);
    }
    return most;
  };
  const listed = share(false);
  const weak = share(true);
  assert.ok(listed > 0.9, `listed Garden: ${listed.toFixed(2)}`);
  assert.ok(weak < 0.5, `evolving, choosing nothing: ${weak.toFixed(2)}`);
  void INFECTED;
});
