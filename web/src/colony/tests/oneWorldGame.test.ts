import { test } from "node:test";
import assert from "node:assert/strict";
import { CURTAIN, LIFESPAN, MIDDLE, MODES, PLANE, type Colony, type HoleCell, type Layer } from "../colony.ts";
import { decodeFungal } from "../fungalPolicy.ts";
import { NEST_ONLY, STRAINS } from "../fungus.ts";
import { Game, gameRng, isOneWorld } from "../game.ts";
import { CELL, cellOf, centreX, centreY, hexDistance } from "../hex.ts";
import { generateOneWorld, type OneWorld } from "../oneWorld.ts";
import { decode, encode } from "../save.ts";
import { AIR, generateSideWorld, rockAt, OPEN } from "../world.ts";

// One world's game (ja-lp4.3, U3a; docs/one-world.md §2, §4): colonies on the plane and the curtain, crossing at their
// holes. A small plane (160 × 100) keeps it quick; seed 7's has two nests well inside it.

const DT = 1 / 30;
const SEED = 7;
const EXPLORE = MODES.indexOf("explore");
const RETURN = MODES.indexOf("return");
const FIGHT = MODES.indexOf("fight");
const GARDEN = STRAINS.findIndex((s) => s.id === "garden");
const BLOOM = STRAINS.findIndex((s) => s.id === "bloom");

const small = (seed = SEED): OneWorld => generateOneWorld(seed, { plane: { size: { w: 160, h: 100 } } });
const game = (ants = 10, seed = SEED, regrow = 0): Game => new Game(small(seed), { antCount: ants, rivalAnts: ants, regrow }, gameRng(seed));
const run = (g: Game, seconds: number, each?: () => void): void => {
  for (let k = 0; k < Math.round(seconds / DT); k++) {
    g.tick(DT);
    each?.();
  }
};
const own = (c: Colony): HoleCell => c.holeCells[c.params.nest] as HoleCell;
const curtainHole = (h: HoleCell) => ({ x: centreX(h.col, h.row), y: centreY(h.row) });
const planeHole = (h: HoleCell) => ({ x: centreX(h.px, h.py), y: centreY(h.py) });
/** An age in band b (0 young, 1 middle-aged, 2 old) that every founder's lifespan outlasts. */
const ageOf = (b: 0 | 1 | 2) => [0.05, (0.15 + MIDDLE) / 2, 0.5][b]! * LIFESPAN;
const ages = (c: Colony, b: 0 | 1 | 2) => {
  for (let i = 0; i < c.n; i++) if (c.alive[i]) c.age[i] = ageOf(b);
};
/** Every curtain ant below the surface rows (the sky and ground strip are the plane's). */
const underground = (g: Game): boolean => {
  const top = g.world!.curtain.surfaceRows!;
  return g.colonies.every((c) => {
    for (let i = 0; i < c.n; i++) {
      if (!c.alive[i] || c.layer[i] !== CURTAIN) continue;
      cellOf(c.x[i]!, c.y[i]!);
      if ((CELL[1] as number) < top) return false;
    }
    return true;
  });
};

test("one world: two layers, home the curtain, a queen, every ant underground, holes on both layers by colony", () => {
  const w = small();
  assert.ok(isOneWorld(w));
  assert.equal(w.plane.nests.length, 2, "two nests on the small plane");
  const g = new Game(w, { antCount: 150, rivalAnts: 150 }, gameRng(SEED));
  assert.equal(g.map, w.plane);
  assert.deepEqual(g.layers, [w.plane, w.curtain]);
  assert.equal(g.colonies.length, 2);
  g.colonies.forEach((c, k) => {
    assert.equal(c.layers.length, 2);
    assert.equal(c.home, CURTAIN);
    assert.deepEqual(c.layers.map((L) => L.map), g.layers, "a colony's layers are the game's, in order");
    assert.equal(c.map, w.curtain, "between ticks the home layer is bound");
    assert.equal((c.layers[PLANE] as Layer).nest, w.plane.nests[k]);
    assert.equal((c.layers[CURTAIN] as Layer).nest, w.curtain.nests[k]);
    assert.equal((c.layers[PLANE] as Layer).entrance, null, "no hole into the plane");
    assert.ok((c.layers[CURTAIN] as Layer).entrance);
    assert.ok(c.queen?.alive, "a queen in the royal chamber");
    assert.equal(c.population, 150);
    for (let i = 0; i < c.n; i++) if (c.alive[i]) assert.equal(c.layer[i], CURTAIN, `ant ${i} starts underground`);
    // The hole table, by colony: the curtain's entrance and the plane cell over its column, which is the plane nest's.
    assert.equal(c.holeCells.length, 2);
    c.holeCells.forEach((h, j) => {
      const e = w.curtain.nests[j]!.entrance!;
      cellOf(e.x, e.y);
      assert.deepEqual([h.col, h.row], [CELL[0], CELL[1]], `hole ${j}: the curtain's entrance`);
      cellOf(w.plane.nests[j]!.x, w.plane.nests[j]!.y);
      assert.deepEqual([h.px, h.py], [CELL[0], CELL[1]], `hole ${j}: over it, the plane nest's cell`);
      assert.equal(rockAt(w.plane, h.px, h.py), OPEN);
    });
  });
  assert.ok(underground(g));
});

test("one world: an old explorer at the top of the shaft climbs out onto its hole on the plane", () => {
  const g = game();
  const c = g.player;
  ages(c, 0); // the rest stay in
  const h = own(c);
  const at = curtainHole(h);
  const i = 0;
  c.age[i] = ageOf(2);
  c.putAnt(i, CURTAIN, at.x, at.y);
  c.mode[i] = EXPLORE;
  c.heading[i] = -Math.PI / 2;
  let out = -1;
  for (let k = 0; k < Math.round(20 / DT) && out < 0; k++) {
    g.tick(DT);
    if (c.layer[i] === PLANE) out = k;
  }
  assert.ok(out >= 0, "it went out within 20 s");
  const p = planeHole(h);
  assert.deepEqual([c.x[i], c.y[i]], [Math.fround(p.x), Math.fround(p.y)], "onto its hole's cell");
  assert.equal(c.crossedUp, 1, "nobody else went up");
});

test("one world: the strip over a hole is sky, and a walker stepping up into it from the hole crosses onto the plane (U5.1: the strip drawn, not stored)", () => {
  const g = game();
  const c = g.player;
  ages(c, 0);
  const h = own(c);
  const curtain = g.world!.curtain;
  // Both cells over the hole (its NW and NE neighbours, row CRUST − 1) are sky: nothing of the plane is stored there.
  for (const dx of [-1, 0, 1]) {
    cellOf(centreX(h.col, h.row) + dx * 0.5, centreY(h.row) - 1);
    if ((CELL[1] as number) < h.row) assert.equal(rockAt(curtain, CELL[0] as number, CELL[1] as number), AIR);
  }
  const at = curtainHole(h);
  const i = 0;
  c.age[i] = ageOf(2);
  c.putAnt(i, CURTAIN, at.x, at.y);
  c.mode[i] = EXPLORE;
  c.heading[i] = -Math.PI / 2;
  // Its first steps up from the hole's centre land in the sky over it: a crossing, though the cell is not open ground.
  let out = -1;
  for (let k = 0; k < Math.round(2 / DT) && out < 0; k++) {
    g.tick(DT);
    if (c.layer[i] === PLANE) out = k;
  }
  assert.ok(out >= 0, "it crossed within 2 s, walking straight up");
  const p = planeHole(h);
  assert.deepEqual([c.x[i], c.y[i]], [Math.fround(p.x), Math.fround(p.y)], "onto its hole's cell");
});

test("one world: the young never go out, pushed back down the shaft", () => {
  const g = game();
  for (const c of g.colonies) {
    ages(c, 0);
    // Half of them at the top of their shaft, facing up.
    const at = curtainHole(own(c));
    for (let i = 0; i < 5; i++) {
      c.putAnt(i, CURTAIN, at.x, at.y);
      c.heading[i] = -Math.PI / 2;
    }
  }
  run(g, 20, () => assert.ok(underground(g), "no curtain ant on the surface rows"));
  for (const c of g.colonies) {
    assert.equal(c.crossedUp, 0);
    for (let i = 0; i < c.n; i++) if (c.alive[i]) assert.equal(c.layer[i], CURTAIN);
  }
});

test("one world: spoil carried up the shaft goes out onto the plane with its carrier, and is heaped there, not at the hole (U3c)", () => {
  const g = game();
  const c = g.player;
  ages(c, 0);
  const i = 0;
  c.age[i] = ageOf(1);
  const h = own(c);
  const at = curtainHole(h);
  c.putAnt(i, CURTAIN, at.x, at.y);
  c.pellet[i] = 1;
  c.mode[i] = RETURN;
  const out = c.soilOut;
  for (let k = 0; k < 30 && c.layer[i] !== PLANE; k++) g.tick(DT);
  assert.equal(c.layer[i], PLANE, "it went up");
  assert.equal(c.pellet[i], 1, "still carrying it");
  assert.equal(c.soilOut, out, "nothing put down at the hole");
  assert.equal(c.crossedUp, 1);
  for (let k = 0; k < Math.round(20 / DT) && c.pellet[i]; k++) g.tick(DT);
  assert.equal(c.pellet[i], 0, "put down out on the plane");
  assert.equal(c.soilOut, out + 1);
  const plane = g.world!.plane;
  assert.equal(plane.moundCells, 1, "one pellet × SWELL heaped");
  assert.equal(plane.spoil!.get(h.px, h.py), 0, "none on the hole");
});

test("one world: a corpse carried up goes to the plane's midden, not the hole, and a sporulating host's spores lie there (U3c)", () => {
  const g = game();
  const c = g.player;
  ages(c, 0);
  const h = own(c);
  const at = curtainHole(h);
  // A Bloom host dies at the top of the shaft; a middle-aged undertaker beside it takes it out.
  const dead = 1;
  c.putAnt(dead, CURTAIN, at.x, at.y);
  c.load[dead] = 1;
  c.strain[dead] = BLOOM;
  c.kill(dead, false);
  assert.equal(c.corpses.length, 1, "it lies where it fell, underground");
  const i = 0;
  c.age[i] = ageOf(1);
  for (let k = 0; k < Math.round(60 / DT) && c.buried === 0; k++) {
    if (!c.carriesCorpse(i) && c.layer[i] === CURTAIN) {
      c.putAnt(i, CURTAIN, at.x, at.y + 1);
      c.mode[i] = EXPLORE;
    }
    g.tick(DT);
  }
  assert.equal(c.buried, 1, "on the midden within 60 s");
  assert.equal(c.corpses.length, 0);
  assert.equal(c.layer[i], PLANE);
  const key = [...c.midden.keys()][0]!;
  const mx = key % 65536;
  const my = Math.floor(key / 65536);
  assert.ok(hexDistance(mx, my, h.px, h.py) >= 6, `the midden is out from the hole (${hexDistance(mx, my, h.px, h.py)} cells)`);
  assert.ok(g.fungus.spores.get(mx, my) > 0, "spores on the plane at the midden");
  assert.equal(g.fungus.spores.get(h.px, h.py), 0, "none at the hole");
});

test("one world: a carrier on the plane goes down its hole, and its food is stored", () => {
  const g = game();
  const c = g.player;
  ages(c, 0); // no other foragers
  const i = 0;
  c.age[i] = ageOf(2);
  const p = planeHole(own(c));
  c.putAnt(i, PLANE, p.x + 1.5, p.y);
  c.carrying[i] = 1;
  c.mode[i] = RETURN;
  for (let k = 0; k < 30 && c.layer[i] === PLANE; k++) g.tick(DT);
  assert.equal(c.layer[i], CURTAIN, "in within a second");
  assert.equal(c.carriedDown, 1);
  assert.equal(c.crossedDown, 1);
  assert.equal(c.carrying[i], 1, "still carrying, on its way to the chambers");
  for (let k = 0; k < Math.round(60 / DT) && c.stored === 0; k++) g.tick(DT);
  assert.equal(c.stored, 1, "stored within a minute");
  assert.ok(underground(g));
});

test("one world: a returner with empty jaws goes down its hole too", () => {
  const g = game();
  const c = g.player;
  ages(c, 0);
  const i = 0;
  c.age[i] = ageOf(2);
  c.fatigue[i] = 2 * c.params.patience; // tired: its policy keeps it homing
  const p = planeHole(own(c));
  c.putAnt(i, PLANE, p.x - 1.5, p.y);
  c.mode[i] = RETURN;
  for (let k = 0; k < 60 && c.layer[i] === PLANE; k++) g.tick(DT);
  assert.equal(c.layer[i], CURTAIN);
  assert.equal(c.crossedDown, 1);
  assert.equal(c.carriedDown, 0);
});

test("one world: a raider on the rival's hole goes down the rival's shaft", () => {
  const g = game();
  const c = g.player;
  ages(c, 0);
  const rival = c.holeCells[1] as HoleCell;
  const i = 0;
  c.age[i] = ageOf(2);
  const p = planeHole(rival);
  c.putAnt(i, PLANE, p.x, p.y);
  c.mode[i] = FIGHT;
  c.recruited[i] = 1;
  g.tick(DT);
  assert.equal(c.layer[i], CURTAIN, "down the shaft");
  const at = curtainHole(rival);
  assert.deepEqual([c.x[i], c.y[i]], [Math.fround(at.x), Math.fround(at.y)], "at the rival's hole, underground");
  assert.equal(c.recruited[i], 1, "still a raider");
  run(g, 2);
  assert.equal(c.recruited[i], 1, "a raider keeps its stance underground");
  assert.equal(c.layer[i], CURTAIN, "and raids on down there, not back up the shaft");
});

test("one world: rivals on different layers at the same spot never fight; on the same layer they do", () => {
  const fight = (sameLayer: boolean): number => {
    const g = game(20);
    const spot = g.world!.curtain.nests[0]!; // the player's chamber, open in the curtain
    for (let k = 0; k < 30; k++) {
      g.colonies.forEach((c, n) => {
        for (let i = 0; i < c.n; i++) if (c.alive[i]) c.putAnt(i, n === 0 || sameLayer ? CURTAIN : PLANE, spot.x, spot.y);
      });
      g.tick(DT);
    }
    return g.colonies.reduce((s, c) => s + c.losses, 0);
  };
  assert.equal(fight(false), 0, "a layer apart: no fight");
  assert.ok(fight(true) > 0, "the control: same layer, they fight");
});

test("one world: scent laid on one layer is not on the other", () => {
  const g = game();
  const c = g.player;
  const p = planeHole(own(c));
  const plane = (c.layers[PLANE] as Layer).ph;
  const curtain = (c.layers[CURTAIN] as Layer).ph;
  c.paint("alarm", p.x + 6, p.y, 2, 5, PLANE);
  assert.ok(plane.read("alarm", p.x + 6, p.y) > 0);
  assert.equal(curtain.read("alarm", p.x + 6, p.y), 0);
  const chamber = g.world!.curtain.nests[0]!;
  c.paint("home", chamber.x, chamber.y, 2, 5); // home: the curtain
  assert.ok(curtain.read("home", chamber.x, chamber.y) > 0);
  assert.equal(plane.read("home", chamber.x, chamber.y), 0);
  // And ants lay on the layer they are on: after a minute's foraging the plane holds food and home trail.
  run(g, 60);
  assert.ok(plane.live("home"), "home trail on the plane");
});

test("one world: allied contact is counted per layer", () => {
  const met = (sameLayer: boolean): number => {
    const g = game(20);
    const [a, b] = g.colonies as [Colony, Colony];
    // Kin: one odour, so they meet as allies (and don't fight).
    b.nestOdour = a.nestOdour;
    b.odour.fill(a.nestOdour);
    const spot = g.world!.curtain.nests[0]!;
    for (let k = 0; k < 60; k++) {
      g.colonies.forEach((c, n) => {
        for (let i = 0; i < c.n; i++) if (c.alive[i]) c.putAnt(i, n === 0 || sameLayer ? CURTAIN : PLANE, spot.x, spot.y);
      });
      g.tick(DT);
    }
    return g.unity().met;
  };
  assert.equal(met(false), 0, "a layer apart, nobody meets");
  assert.ok(met(true) > 0, "together, they do");
});

test("one world: the landing is on the plane by the hole, its spores dose only the ants on the plane, and the fungus reads each layer's ground", () => {
  const g = game();
  const c = g.player;
  ages(c, 0);
  const nest = (c.layers[PLANE] as Layer).nest;
  const landed = g.land(0, GARDEN);
  assert.ok(Math.abs(landed.x - (nest.x + nest.r + 3)) < 1e-9 && landed.y === nest.y, "by the rim of the disc round the hole");
  cellOf(landed.x, landed.y);
  assert.ok(g.fungus.spores.get(CELL[0] as number, CELL[1] as number) > 0, "spores on the plane");
  // A brush on the plane at a spot where one ant stands on the plane, another under it in the curtain.
  const p = planeHole(own(c));
  const spot = { x: p.x + 10, y: p.y };
  c.putAnt(0, PLANE, spot.x, spot.y);
  c.putAnt(1, CURTAIN, spot.x, spot.y);
  g.paintSpores(spot.x, spot.y, 2, 3, 0.5, GARDEN);
  assert.ok((c.load[0] as number) > 0, "the plane ant is dosed");
  assert.equal(c.load[1], 0, "the curtain ant is not");
  // The fungus in a host reads the ground of the layer it is on: the plane's open ground, the curtain's chamber.
  const chamber = g.world!.curtain.nests[0]!;
  c.putAnt(1, CURTAIN, chamber.x, chamber.y);
  c.load[1] = 0.5;
  c.strain[1] = GARDEN;
  for (let k = 0; k < 30; k++) {
    c.putAnt(0, PLANE, spot.x, spot.y);
    c.putAnt(1, CURTAIN, chamber.x, chamber.y);
    g.tick(DT);
  }
  assert.ok((c.fungal[0] as number) >= 0 && (c.fungal[1] as number) >= 0, "both chose");
  assert.equal(decodeFungal(c.fungal[0] as number).place, "outside");
  assert.notEqual(decodeFungal(c.fungal[1] as number).place, "outside");
  // The nest's levers are offered: one world always has a nest.
  assert.ok(g.fungus.hasNest);
  g.fungus.menu = NEST_ONLY;
  assert.deepEqual([...g.fungus.menu].sort(), [...NEST_ONLY].sort());
});

test("one world: food and ants are conserved over 90 s, and no ant underground is ever on the surface rows", () => {
  const g = game(150);
  const plane = g.world!.plane;
  const start = g.colonies.map((c) => c.population);
  run(g, 90, () => assert.ok(underground(g)));
  let carried = 0;
  let down = 0;
  let up = 0;
  g.colonies.forEach((c, k) => {
    let onPlane = 0;
    let inCurtain = 0;
    for (let i = 0; i < c.n; i++) {
      if (!c.alive[i]) continue;
      if (c.layer[i] === PLANE) {
        onPlane++;
        carried += c.carrying[i] as number;
      } else inCurtain++;
    }
    assert.equal(c.population, start[k]! + c.births - c.losses - c.diedOld - c.diedHungry, `colony ${k}: born less dead`);
    assert.equal(onPlane + inCurtain, c.population);
    assert.ok(c.crossedUp > 0 && c.carriedDown > 0, `colony ${k} forages on the plane`);
    down += c.carriedDown;
    up += c.carriedUp;
  });
  assert.equal(plane.foodTotal - plane.foodLeft, carried + down - up, "the plane's food taken is in jaws on it or went down a hole");
});

// The fungus step and the nest odour, per layer (review of #59, S1). Ants are put back in place each tick, as above.

/** Clean ants 1–5 of the player's on the plane at (x, y), every tick for 3 s while `each` sets up the source; their summed load. */
const planeLoad = (g: Game, x: number, y: number, each: () => void): number => {
  const c = g.player;
  run(g, 3, () => {
    each();
    g.fungus.hosts = 1; // a load set by hand leaves the fungus idle: the step runs only with a host
    for (let i = 1; i < 6; i++) c.putAnt(i, PLANE, x, y);
  });
  let s = 0;
  for (let i = 1; i < 6; i++) s += c.load[i] as number;
  return s;
};

test("one world: a host in the curtain passes nothing to the ants on the plane over it; on the plane it does", () => {
  const load = (hostLayer: number): number => {
    const g = game();
    const c = g.player;
    ages(c, 0);
    const spot = g.world!.curtain.nests[0]!; // the player's chamber
    return planeLoad(g, spot.x, spot.y, () => {
      c.putAnt(0, hostLayer, spot.x, spot.y);
      c.load[0] = 0.8;
      c.strain[0] = GARDEN;
    });
  };
  assert.equal(load(CURTAIN), 0, "a layer apart: the load grid and each ant's step are the layer's");
  assert.ok(load(PLANE) > 0.1, "the control: on the plane beside them, they pick it up");
});

test("one world: a loaded queen passes nothing to the ants on the plane over her", () => {
  const g = game();
  const c = g.player;
  ages(c, 0);
  const q = c.queen!;
  const loaded = planeLoad(g, q.x, q.y, () => {
    q.load = 0.8;
    q.strain = GARDEN;
  });
  assert.equal(loaded, 0, "she is in the load grid of her home layer only");
});

test("one world: spores on the plane over the queen don't reach her", () => {
  const g = game();
  const q = g.player.queen!;
  run(g, 3, () => g.paintSpores(q.x, q.y, 2, 3, 0, GARDEN));
  cellOf(q.x, q.y);
  assert.ok(g.fungus.spores.get(CELL[0] as number, CELL[1] as number) > 0, "spores on the plane at her x, y");
  assert.equal(q.load, 0, "she is stepped on her home layer only");
});

test("one world: the nest odour drifts toward the ants in the royal chamber, not those on the plane over it", () => {
  const moved = (layer: number): number => {
    const g = game();
    const c = g.player;
    const q = c.queen!;
    const before = c.nestOdour;
    run(g, 10, () => {
      for (let i = 0; i < 10; i++) {
        c.putAnt(i, layer, q.x, q.y);
        c.odour[i] = before < 0.5 ? before + 0.4 : before - 0.4; // strangers' odour
      }
    });
    return Math.abs(c.nestOdour - before);
  };
  assert.equal(moved(PLANE), 0, "a layer apart: the nest's odour stays");
  assert.ok(moved(CURTAIN) > 0.01, "the control: in the royal chamber, it drifts toward them");
});

// The crossing guards play reaches (review of #59, S2). Private state an ant can't be given by the public API is set
// through the colony's own save and restore (saveState / loadState): no test hook.

/** The colony's private fields `keys`, decoded; `edit` changes them, and they are put back. */
const editPrivate = (c: Colony, keys: readonly string[], edit: (r: Record<string, unknown>) => void): void => {
  const saved = c.saveState().private as Record<string, unknown>;
  const r: Record<string, unknown> = {};
  for (const k of keys) r[k] = decode(saved[k]);
  edit(r);
  c.loadState({ fields: {}, private: Object.fromEntries(keys.map((k) => [k, encode(r[k])])) });
};
/**
 * Ants `ants` of colony c at the top of a shaft (curtain point `at`) facing up, put there again every half second they are still in the
 * curtain (it takes them a few ticks to step up: put back every tick, nobody would reach the surface), for 3 s; `set`
 * runs before each tick.
 */
const atTop = (g: Game, c: Colony, at: { x: number; y: number }, ants: readonly number[], set: () => void): void => {
  for (let k = 0; k < Math.round(3 / DT); k++) {
    if (k % 15 === 0)
      for (const i of ants)
        if (c.layer[i] === CURTAIN) {
          c.putAnt(i, CURTAIN, at.x, at.y);
          c.heading[i] = -Math.PI / 2;
        }
    set();
    g.tick(DT);
  }
};
/** The player's royal chamber in the curtain. */
const royalOf = (g: Game, c: Colony): number => g.world!.curtain.chambers!.list.find((r) => r.role === "royal" && r.colony === c.params.nest)!.id;

test("one world: an old ant holding brood, and an old porter, at the top of a shaft are turned back down it", () => {
  // At the top of the rival's shaft: lost in another nest's tunnels, a homing ant heads for the hole and climbs out (#goal),
  // so only this guard keeps brood and moved food in. (At its own, it homes to its chamber and is turned back for that.)
  const g = game();
  const c = g.player;
  ages(c, 0);
  const rival = c.holeCells[1] as HoleCell;
  const at = curtainHole(rival);
  const royal = royalOf(g, c);
  // Ant 0 holds an egg on its way to the royal chamber, as a nurse picks one up (#nurse).
  cellOf(at.x, at.y);
  const egg = c.brood.add(CELL[0] as number, CELL[1] as number, -1);
  egg.held = 0;
  // Ant 1 is a porter, taking food between chambers (#becomePorter): its food is already the colony's.
  c.carrying[1] = 1;
  c.mode[1] = RETURN;
  editPrivate(c, ["holdsBrood", "broodTo", "porter", "portTo", "inJaws"], (r) => {
    (r.holdsBrood as Uint8Array)[0] = 1;
    (r.broodTo as Int16Array)[0] = royal;
    (r.porter as Uint8Array)[1] = 1;
    (r.portTo as Int16Array)[1] = royal;
    r.inJaws = (r.inJaws as number) + 1;
  });
  // An old explorer with them as the control: it goes out.
  const free = 2;
  for (const i of [0, 1, free]) c.age[i] = ageOf(2);
  atTop(g, c, at, [0, 1, free], () => {
    c.mode[free] = EXPLORE;
  });
  assert.equal(c.layer[free], PLANE, "the control: an old explorer in their place climbs out");
  assert.ok(c.holdsBrood(0), "still holding the egg");
  assert.equal(c.layer[0], CURTAIN, "brood stays in");
  assert.equal(c.item(1), "food", "still porting");
  assert.equal(c.layer[1], CURTAIN, "food moved between chambers stays in");
  assert.equal(c.crossedUp, 1, "nobody else went up");
});

test("one world: a carrier homing to its chamber at the top of the shaft is turned back, not let out", () => {
  const g = game();
  const c = g.player;
  ages(c, 0);
  const i = 0;
  c.age[i] = ageOf(2);
  c.fatigue[i] = 2 * c.params.patience; // tired: its policy keeps it homing
  atTop(g, c, curtainHole(own(c)), [i], () => {
    c.carrying[i] = 1;
    c.mode[i] = RETURN;
  });
  assert.equal(c.layer[i], CURTAIN);
  assert.equal(c.crossedUp, 0, "a homing ant never climbs out of its own nest");
});

test("one world: a defender that goes down its hole no longer defends below", () => {
  const g = game();
  const c = g.player;
  ages(c, 0);
  const i = 0;
  c.age[i] = ageOf(2);
  const p = planeHole(own(c));
  c.putAnt(i, PLANE, p.x + 1.5, p.y);
  c.carrying[i] = 1; // going in (#wantsIn)
  c.mode[i] = RETURN;
  let defended = false;
  for (let k = 0; k < 30 && c.layer[i] === PLANE; k++) {
    c.threat[i] = 5 * c.params.defendAt; // it has felt a threat on home ground
    g.tick(DT);
    if (c.layer[i] === PLANE && c.stanceCounts().defend === 1) defended = true;
  }
  assert.ok(defended, "it defended on the plane");
  assert.equal(c.layer[i], CURTAIN, "and went in");
  run(g, 2);
  assert.equal(c.stanceCounts().defend, 0, "below, where nothing sets it, its defence is cleared");
});

test("one world: an ant that dies on the plane leaves no corpse underground; one that dies underground does", () => {
  const g = game();
  const c = g.player;
  ages(c, 0);
  const p = planeHole(own(c));
  c.putAnt(0, PLANE, p.x + 6, p.y);
  c.kill(0, false);
  assert.equal(c.corpses.length, 0, "the dead on the plane leave no corpse");
  const at = curtainHole(own(c));
  c.putAnt(1, CURTAIN, at.x, at.y + 4);
  c.kill(1, false);
  assert.equal(c.corpses.length, 1, "the control: underground, the dead lie where they fall");
});

test("a game on one map: each colony has one layer and every ant is on it", () => {
  const g = new Game(generateSideWorld(1), { antCount: 30, rivalAnts: 30 }, gameRng(1));
  assert.equal(g.world, null);
  assert.equal(g.layers.length, 1);
  run(g, 2);
  for (const c of g.colonies) {
    assert.equal(c.layers.length, 1);
    assert.equal(c.line, null);
    assert.deepEqual(c.holeCells, []);
    assert.ok(c.layer.every((l) => l === 0));
  }
});
