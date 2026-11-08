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
import { readFileSync } from "node:fs";
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
  assert.deepEqual(hold({ crown: 1 }, { food: 0 }), { crown: 1 }, "a lever the reach leaves out keeps its range");
});

test("reach acts where levels take effect: Jev's question and cache key do not change, the host's gains do", () => {
  const map = arena();
  const c = placed(map, [[10, 6]]);
  c.strain[0] = GARDEN; // a host of the strain that evolves
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
  assert.deepEqual(f.held({ food: 4, odour: 2 }, GARDEN), { food: 3, odour: 0 }, "and Recognition starts at none");
  const LOCKPICK = STRAINS.findIndex((x) => x.id === "lockpick");
  assert.deepEqual(f.held({ food: 4 }, LOCKPICK), { food: 4 }, "another strain's host (a lab brush) is not held (PR #43 review, N2)");
  const e = f.evolution!;
  e.replicate(upgrade("senses").costs[0]! / MUTATION);
  assert.ok(f.upgrade("senses"), "the mutations for the Senses' full range");
  f.expressLevels(c, 0, { food: 4 }, 1);
  assert.ok(Math.abs((c.gainFood[0] as number) - 2.5) < 1e-9, `the full range: ${c.gainFood[0]}`);
  // A lab helper runs a preset whatever the menu and the reach say.
  f.express(c, 0, 2, 1); // share: food 3
  assert.ok(Math.abs((c.gainFood[0] as number) - 1.5) < 1e-9);
});

test("every lever has a reach, the lethal ones included: crown and odour weapon are held off until their upgrade (ja-lo8.16)", () => {
  const reach = new Evolution(GARDEN).reach();
  for (const v of LEVERS) assert.ok(reach[v.id] !== undefined, `${v.id}: some upgrade names it`);
  assert.equal(reach.weapon, 0, "the odour weapon starts held off");
  assert.equal(reach.crown, 0, "and so does crown");
  const map = generateSideWorld(1); // crown acts only where there is a nest: the top-down menu drops it
  const c = new Colony(map, { antCount: 1, maxAnts: 1, nest: 0 }, mulberry32(1));
  c.strain[0] = GARDEN;
  const f = new Fungus(map);
  f.configure({ hide: false, cull: false }, ["weapon", "crown"]); // the player has put both on the menu
  f.evolve(GARDEN);
  assert.deepEqual(f.held({ weapon: 1, crown: 1 }, GARDEN), { weapon: 0, crown: 0 }, "on the menu, but not yet free");
  f.expressLevels(c, 0, { weapon: 1, crown: 1 }, 1);
  assert.equal(c.estrange[0], 0, "so the host smells like itself");
  assert.equal(c.regicide[0], 0, "and spares the queen");
  const e = f.evolution!;
  e.replicate((upgrade("weapon").costs[0]! + upgrade("crown").costs[0]!) / MUTATION);
  assert.ok(f.upgrade("weapon"), "the mutations for the odour weapon");
  f.expressLevels(c, 0, { weapon: 1, crown: 1 }, 1);
  assert.ok((c.estrange[0] as number) > 0, "freed: the host smells like nobody's");
  assert.equal(c.regicide[0], 0, "crown still held");
  assert.ok(f.upgrade("crown"), "the mutations for crown");
  f.expressLevels(c, 0, { weapon: 1, crown: 1 }, 1);
  assert.ok((c.regicide[0] as number) > 0, "freed: the host kills the queen it tends");
  // A game that doesn't evolve (the lab, the assays) has no reach: the lethal levers run as the menu says.
  const lab = new Fungus(map);
  lab.configure({ hide: false, cull: false }, ["crown"]);
  assert.deepEqual(lab.held({ crown: 1 }, GARDEN), { crown: 1 });
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

test("the queen's levels are held too: Stealth decides how far she can hide (PR #43 review, T1)", () => {
  const g = new Game(generateSideWorld(1), { antCount: 100, rivalAnts: 100 }, mulberry32(7919));
  g.land(0, GARDEN, { evolve: true });
  const f = g.fungus;
  const q = g.colonies[0]!.queen!;
  f.policy = () => "dormant"; // hide: showing at its lowest level
  const settle = () => {
    q.load = 0.5;
    q.strain = GARDEN;
    f.hosts = Math.max(1, f.hosts);
    for (let k = 0; k < 4; k++) g.tick(1 / 30);
  };
  settle();
  assert.equal(q.show, 1, "Stealth at none: she shows as she is");
  f.evolution!.replicate(1e6);
  assert.ok(f.upgrade("stealth") && f.upgrade("stealth"));
  settle();
  assert.equal(q.show, 0.25, "Stealth at its most: hidden");
});

test("mutations from hosts: load passed on by contact counts, spores picked up from the ground do not (PR #43 review, S2, T2)", () => {
  const map = arena();
  // Contact: a full host beside a clean ant, no ground spores, no mycelium.
  const f = new Fungus(map, { grooming: 0, priming: 0 });
  f.evolve(GARDEN);
  f.strains[GARDEN]!.decay = 0; // so the load it ends with is all it took on
  const c = placed(map, [
    [10, 6],
    [11, 6],
  ]);
  c.load[0] = 1;
  c.strain[0] = GARDEN;
  f.hosts = 1;
  run(f, [c], 3);
  assert.ok((c.load[1] as number) > 0.05);
  assert.ok(Math.abs(f.evolution!.growth - (c.load[1] as number)) < 1e-6, `what contact passed on: ${f.evolution!.growth} vs ${c.load[1]}`);
  // Ground: a lone ant on spores takes load, and nothing new is made.
  const g = new Fungus(map, { grooming: 0, priming: 0 });
  g.evolve(GARDEN);
  const d = placed(map, [[20, 6]]);
  g.paint([d], d.x[0] as number, d.y[0] as number, 1, 3, 0, GARDEN); // spores under it, no dose
  run(g, [d], 3);
  assert.ok((d.load[0] as number) > 0.05, `it took load off the ground: ${d.load[0]}`);
  assert.equal(g.evolution!.growth, 0, "moved, not made");
});

test("the queen's larger grooming cap is the evolving game's: a lab or test game's queen is groomed as before (PR #43 review, S1)", () => {
  const queenAt = (queenGroomers: number, evolve: boolean) => {
    const g = new Game(generateSideWorld(1), { antCount: 300, rivalAnts: 300, fungus: { queenGroomers } }, mulberry32(7919));
    g.land(0, GARDEN, { evolve });
    if (evolve) {
      // Garden as listed, so the fungus reaches her in a short run.
      g.fungus.strains[GARDEN]!.transmission = 0.3;
      g.fungus.strains[GARDEN]!.decay = 0;
    }
    for (let k = 0; k < 30 * 45; k++) g.tick(1 / 30);
    return g.colonies[0]!.queen!.load;
  };
  assert.equal(queenAt(8, false), queenAt(4, false), "not evolving: the cap is not read");
  const four = queenAt(4, true);
  const eight = queenAt(8, true);
  assert.ok(four > 0 && eight !== four, `evolving: the cap is read (${four.toFixed(3)} vs ${eight.toFixed(3)})`);
});

test("spores a full patch can't hold stay mycelium (PR #43 review, N3)", () => {
  // A ground that holds no spores at all: every spore the mycelium puts out is one it can't lay.
  const g = new Game(generateSideWorld(1), { antCount: 50, rivalAnts: 50, fungus: { maxSpores: 0 } }, mulberry32(7919));
  g.land(0, GARDEN, { evolve: true });
  const e = g.fungus.evolution!;
  e.mass = 50; // above what one patch holds: it does not grow, so its mass moves only by spores
  for (let k = 0; k < 90; k++) g.tick(1 / 30);
  assert.ok(Math.abs(e.mass - 50) < 1e-9, `nothing paid for spores that could not be laid: ${e.mass}`);
});

test("a load with no evolution puts every strain back as listed (PR #43 review, N4)", () => {
  const map = arena();
  const f = new Fungus(map);
  f.evolve(GARDEN);
  assert.notEqual(f.strains[GARDEN]!.transmission, STRAINS[GARDEN]!.transmission);
  f.loadState(new Fungus(map).saveState());
  assert.equal(f.evolution, null);
  assert.equal(f.strains[GARDEN]!.transmission, STRAINS[GARDEN]!.transmission);
  assert.equal(f.strains[GARDEN]!.decay, STRAINS[GARDEN]!.decay);
});

test("the fungus's save holds every private field it declares, or the field is derived or scratch (PR #43 review, N1)", () => {
  // As save.test.ts does for Colony: a new #field must be saved, or named here as derived on load or per-step scratch.
  const src = readFileSync(new URL("../fungus.ts", import.meta.url), "utf8");
  const body = src.slice(src.indexOf("export class Fungus "));
  const declared = new Set<string>();
  for (const m of body.matchAll(/^ {2}(?:readonly )?#(\w+)(?!\w|\()/gm)) declared.add(m[1]!);
  const saved = { evolution: "evolution", base: "base", sporeCells: "sporeCells", menu: "menu", clock: "clock" } as Record<string, string>;
  const derived = ["reach", "evade", "listed"];
  const scratch = ["made", "all", "visible", "taken", "nb"];
  assert.deepEqual([...declared].sort(), [...Object.keys(saved), ...derived, ...scratch].sort(), "every declared #field is accounted for");
  const keys = Object.keys(new Fungus(arena()).saveState());
  for (const [field, key] of Object.entries(saved)) assert.ok(keys.includes(key), `#${field} is saved as ${key}`);
});
