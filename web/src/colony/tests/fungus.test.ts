import { test } from "node:test";
import assert from "node:assert/strict";
import { CountGrid, occupancy } from "../battle.ts";
import { Colony } from "../colony.ts";
import { Fungus, INFECTED, STRAINS, type Strain } from "../fungus.ts";
import { Game } from "../game.ts";
import { generateWorld, mulberry32, OPEN_WORLD, worldFromArrays, type WorldMap } from "../world.ts";

// The fungus's first slice (ja-t4d.1): load, contact spread across colonies,
// grooming and priming, and the spore brush. Ants stand still here (the
// colonies are not ticked), so each test isolates the fungus's own step.

const LOCKPICK = STRAINS.findIndex((s) => s.id === "lockpick");
const BLOOM = STRAINS.findIndex((s) => s.id === "bloom");

/** A bare 40×12 field with two nests, no food. */
function arena(): WorldMap {
  return worldFromArrays({ w: 40, h: 12 }, [{ x: 4, y: 6, r: 2 }, { x: 36, y: 6, r: 2 }]);
}

/** A colony whose first `cells.length` ants stand at those cells (centre of each), the rest dead. */
function placed(map: WorldMap, nest: number, cells: [number, number][]): Colony {
  const c = new Colony(map, { antCount: Math.max(1, cells.length), maxAnts: Math.max(1, cells.length), nest }, mulberry32(1 + nest));
  for (let i = 0; i < c.n; i++) {
    const cell = cells[i];
    c.alive[i] = cell ? 1 : 0;
    if (cell) {
      c.x[i] = cell[0] + 0.5;
      c.y[i] = cell[1] + 0.5;
    }
  }
  return c;
}

/** Step the fungus for `seconds` at 30 Hz with the colonies standing still. */
function run(f: Fungus, colonies: Colony[], seconds: number): void {
  const grids = colonies.map(() => new CountGrid());
  for (let k = 0; k < Math.round(seconds * 30); k++) {
    colonies.forEach((c, j) => occupancy(c, grids[j] as CountGrid));
    f.step(colonies, grids, 1 / 30);
  }
}

function infect(c: Colony, i: number, load: number, strain: number): void {
  c.load[i] = load;
  c.strain[i] = strain;
}

test("strains: Lockpick hides and holds, Bloom spreads fast and shows", () => {
  const lock = STRAINS[LOCKPICK] as Strain;
  const bloom = STRAINS[BLOOM] as Strain;
  assert.ok(bloom.transmission > lock.transmission);
  assert.ok(bloom.visibility > lock.visibility);
  assert.equal(lock.decay, 0);
});

test("contact: a loaded ant raises the load of the clean ants around it, and passes on its strain", () => {
  const map = arena();
  const c = placed(map, 0, [[10, 6], [10, 6], [11, 6], [10, 7], [9, 5]]);
  infect(c, 0, 1, BLOOM);
  const f = new Fungus(map, { grooming: 0, priming: 0 });
  f.hosts = 1;
  run(f, [c], 2);
  for (let i = 1; i < 5; i++) {
    assert.ok((c.load[i] as number) > INFECTED, `ant ${i}: load ${c.load[i]}`);
    assert.equal(c.strain[i], BLOOM);
  }
});

test("an isolated ant: a clean one far away stays clean, and a Lockpick host alone keeps its load", () => {
  const map = arena();
  const c = placed(map, 0, [[10, 6], [25, 6]]);
  infect(c, 0, 0.8, LOCKPICK);
  const f = new Fungus(map);
  f.hosts = 1;
  run(f, [c], 10);
  assert.equal(c.load[1], 0, "three cells is out of reach; fifteen certainly is");
  assert.ok(Math.abs((c.load[0] as number) - 0.8) < 1e-6, `Lockpick never clears on its own and nobody grooms it: ${c.load[0]}`);
});

test("grooming: nestmates clear a visible host, and a hidden strain is groomed far less", () => {
  const map = arena();
  const crowd: [number, number][] = [[10, 6], [10, 6], [10, 6], [10, 6], [10, 6]];
  const groomed = (strain: number, mates: boolean): number => {
    const c = placed(map, 0, mates ? crowd : [[10, 6]]);
    infect(c, 0, 0.6, strain);
    // Nestmates fully resistant: they groom but never catch it, so the host's load is grooming alone.
    for (let i = 1; i < c.n; i++) c.resist[i] = 1;
    const f = new Fungus(map);
    f.hosts = 1;
    run(f, [c], 5);
    return c.load[0] as number;
  };
  const bloomAlone = groomed(BLOOM, false);
  const bloomGroomed = groomed(BLOOM, true);
  const lockGroomed = groomed(LOCKPICK, true);
  assert.ok(bloomGroomed < bloomAlone - 0.3, `Bloom with groomers ${bloomGroomed.toFixed(3)} vs alone ${bloomAlone.toFixed(3)}`);
  assert.ok(lockGroomed > bloomGroomed + 0.3, `Lockpick hides from grooming: ${lockGroomed.toFixed(3)} vs Bloom ${bloomGroomed.toFixed(3)}`);
});

test("priming: grooming a visible nestmate leaves an ant resistant, and a resistant ant takes less load", () => {
  const map = arena();
  const c = placed(map, 0, [[10, 6], [10, 6]]);
  infect(c, 0, 1, BLOOM);
  // A strain that cannot spread: the groomer's resistance comes from grooming alone, not from catching it.
  const f = new Fungus(map, {}, STRAINS.map((s) => ({ ...s, transmission: 0 })));
  f.hosts = 1;
  run(f, [c], 3);
  assert.equal(c.load[1], 0);
  assert.ok((c.resist[1] as number) > 0.01, `the groomer is primed: ${c.resist[1]}`);
  assert.equal(c.resist[0], 0, "a host's own load does not prime it");

  const pair = (resist: number): number => {
    const d = placed(map, 0, [[10, 6], [10, 6]]);
    infect(d, 0, 1, LOCKPICK); // barely visible: priming stays small, so resistance is what was set
    d.resist[1] = resist;
    const g = new Fungus(map, { grooming: 0, priming: 0 });
    g.hosts = 1;
    run(g, [d], 2);
    return d.load[1] as number;
  };
  assert.ok(pair(0.8) < pair(0) * 0.3, `resistant ${pair(0.8).toFixed(4)} vs naive ${pair(0).toFixed(4)}`);
});

test("across colonies: load passes both ways, at the same rate as within a colony", () => {
  const map = arena();
  // One host and two clean ants on one cell: a nestmate of the host and an ant of the other colony.
  const mine = placed(map, 0, [[20, 6], [20, 6]]);
  const theirs = placed(map, 1, [[20, 6]]);
  infect(mine, 0, 1, BLOOM);
  const f = new Fungus(map, { grooming: 0, priming: 0 });
  f.hosts = 1;
  run(f, [mine, theirs], 1 / 30);
  assert.ok((theirs.load[0] as number) > 0, "the rival caught it");
  assert.ok(Math.abs((theirs.load[0] as number) - (mine.load[1] as number)) < 1e-7, `one step from clean: ${theirs.load[0]} vs ${mine.load[1]}`);

  // And back: a rival host infects the player's ant.
  const a = placed(map, 0, [[20, 6]]);
  const b = placed(map, 1, [[20, 6]]);
  infect(b, 0, 1, LOCKPICK);
  const g = new Fungus(map, { grooming: 0, priming: 0 });
  g.hosts = 1;
  run(g, [a, b], 2);
  assert.ok((a.load[0] as number) > INFECTED, `the player's ant caught it from the rival: ${a.load[0]}`);
  assert.equal(a.strain[0], LOCKPICK);
});

test("the order colonies are listed in is no edge", () => {
  const map = arena();
  const setup = (): [Colony, Colony] => {
    const a = placed(map, 0, [[20, 6], [21, 6]]);
    const b = placed(map, 1, [[20, 6], [21, 7]]);
    infect(a, 0, 1, BLOOM);
    infect(b, 0, 0.5, LOCKPICK);
    return [a, b];
  };
  const [a1, b1] = setup();
  const f1 = new Fungus(map);
  f1.paint([], 21, 6.5, 1, 3, 0, BLOOM);
  f1.hosts = 2;
  run(f1, [a1, b1], 2);
  const [a2, b2] = setup();
  const f2 = new Fungus(map);
  f2.paint([], 21, 6.5, 1, 3, 0, BLOOM);
  f2.hosts = 2;
  // Same colonies, listed the other way round (the grids follow the list).
  run(f2, [b2, a2], 2);
  for (let i = 0; i < 2; i++) {
    assert.ok(Math.abs((a1.load[i] as number) - (a2.load[i] as number)) < 1e-6, `a${i}: ${a1.load[i]} vs ${a2.load[i]}`);
    assert.ok(Math.abs((b1.load[i] as number) - (b2.load[i] as number)) < 1e-6, `b${i}: ${b1.load[i]} vs ${b2.load[i]}`);
  }
  assert.ok(Math.abs(f1.spores.get(21, 6) - f2.spores.get(21, 6)) < 1e-6, "spores taken the same either way");
});

test("spore brush: spores on open ground in the stroke, a dose into every ant there of either colony, and nobody outside it", () => {
  const map = worldFromArrays({ w: 40, h: 12 }, [{ x: 4, y: 6, r: 2 }, { x: 36, y: 6, r: 2 }], { rock: Array.from({ length: 40 * 12 }, (_, i) => (i === 6 * 40 + 22 ? 1 : 0)) });
  const mine = placed(map, 0, [[20, 6], [30, 6]]);
  const theirs = placed(map, 1, [[21, 6]]);
  const f = new Fungus(map);
  f.paint([mine, theirs], 20.5, 6.5, 2, 2, 0.3, LOCKPICK);
  assert.equal(f.spores.get(20, 6), 2);
  assert.equal(f.spores.get(22, 6), 0, "rock takes no spores");
  assert.equal(f.spores.get(25, 6), 0, "outside the stroke");
  assert.equal(f.sporeStrain.get(20, 6), LOCKPICK);
  assert.ok(Math.abs((mine.load[0] as number) - 0.3) < 1e-6);
  assert.ok(Math.abs((theirs.load[0] as number) - 0.3) < 1e-6, "the brush does not care whose ant it is");
  assert.equal(mine.load[1], 0);
  assert.equal(f.hosts, 2);
  assert.ok(f.active);

  // A host keeps its first strain; another strain's dose still adds load.
  f.paint([mine, theirs], 20.5, 6.5, 0.5, 0, 0.2, BLOOM);
  assert.equal(mine.strain[0], LOCKPICK);
  assert.ok(Math.abs((mine.load[0] as number) - 0.5) < 1e-6);
});

test("spores on the ground: an ant walking onto them picks up load and takes some away; untouched spores fade", () => {
  const map = arena();
  const f = new Fungus(map);
  f.paint([], 15.5, 6.5, 0.5, 4, 0, BLOOM);
  f.paint([], 30.5, 6.5, 0.5, 4, 0, BLOOM);
  const c = placed(map, 0, [[15, 6]]);
  run(f, [c], 1);
  assert.ok((c.load[0] as number) > INFECTED, `picked up: ${c.load[0]}`);
  assert.equal(c.strain[0], BLOOM, "the ground's strain");
  assert.ok(f.spores.get(15, 6) < f.spores.get(30, 6), "the trodden cell lost more than the fade");
  const left = f.spores.get(30, 6);
  assert.ok(left < 4 && left > 3.5, `a second of sun: ${left}`);
  const fresh = new Fungus(map, { sporeDecay: 1 });
  fresh.paint([], 30.5, 6.5, 0.5, 4, 0, BLOOM);
  run(fresh, [], 10);
  assert.equal(fresh.sporeCells, 0, "faded away and forgotten");
  assert.equal(fresh.active, false);
});

test("a newborn in a dead host's slot is clean and unprimed", () => {
  const map = arena();
  const c = new Colony(map, { antCount: 2, maxAnts: 2 }, mulberry32(9));
  infect(c, 0, 0.9, BLOOM);
  c.resist[0] = 0.5;
  c.expr[0] = 3;
  c.kill(0);
  assert.ok(c.spawn());
  assert.equal(c.alive[0], 1);
  assert.equal(c.load[0], 0);
  assert.equal(c.resist[0], 0);
  assert.equal(c.expr[0], 0);
});

test("a game with no spores runs as before: the fungus stays idle and draws no random numbers", () => {
  const ticks = (paint: boolean): number[] => {
    const g = new Game(generateWorld(4, OPEN_WORLD), { antCount: 200, rivalAnts: 200 }, mulberry32(77));
    if (paint) g.paintSpores(-50, -50, 2, 3, 0.3, BLOOM); // off the map: paints nothing, infects nobody
    for (let k = 0; k < 30 * 20; k++) g.tick(1 / 30);
    return [g.player.stored, g.rival!.stored, g.player.losses, g.rival!.losses, g.player.x[0] as number];
  };
  const quiet = ticks(false);
  assert.deepEqual(ticks(true), quiet);
});

test("in a real game, the dial shows: Lockpick holds its load unseen, Bloom is groomed down and leaves the colony resistant", () => {
  const after = (strain: number) => {
    const g = new Game(generateWorld(1, { ...OPEN_WORLD, size: { w: 160, h: 100 } }), { antCount: 300, rivalAnts: 300 }, mulberry32(5));
    const nest = g.player.nest;
    g.paintSpores(nest.x, nest.y, nest.r + 2, 3, 0.3, strain);
    assert.ok(g.fungus.census(g.player).infected > 0);
    for (let k = 0; k < 30 * 45; k++) g.tick(1 / 30);
    const c = g.fungus.census(g.player);
    assert.equal(c.living, g.player.population);
    return c;
  };
  const lock = after(LOCKPICK);
  const bloom = after(BLOOM);
  assert.ok(lock.meanLoad > bloom.meanLoad + 0.2, `load: Lockpick ${lock.meanLoad.toFixed(2)} vs Bloom ${bloom.meanLoad.toFixed(2)}`);
  assert.ok(bloom.meanResist > lock.meanResist * 2, `resistance: Bloom ${bloom.meanResist.toFixed(3)} vs Lockpick ${lock.meanResist.toFixed(3)}`);
});

test("the one-chunk fast path reads the same as the clipped slow path across a chunk border", () => {
  const map = worldFromArrays({ w: 160, h: 20 }, [{ x: 4, y: 10, r: 2 }, { x: 150, y: 10, r: 2 }]);
  // The same little crowd twice: inside a chunk (x 30–32) and straddling the border at x 63|64.
  const crowdAt = (x0: number): [number, number][] => [[x0, 10], [x0 + 1, 10], [x0 + 2, 10], [x0 + 1, 11], [x0 + 1, 9], [x0 + 1, 10]];
  const runAt = (x0: number) => {
    const a = placed(map, 0, crowdAt(x0));
    const b = placed(map, 1, [[x0 + 1, 10], [x0 + 2, 11]]);
    infect(a, 0, 1, BLOOM);
    infect(b, 1, 0.5, LOCKPICK);
    const f = new Fungus(map);
    f.hosts = 2;
    run(f, [a, b], 3);
    return [...a.load, ...a.resist, ...b.load, ...b.resist, ...a.strain, ...b.strain];
  };
  const inside = runAt(30);
  for (const x0 of [62, 63]) {
    const border = runAt(x0);
    inside.forEach((v, i) => assert.ok(Math.abs(v - (border[i] as number)) < 1e-6, `x0 ${x0}, value ${i}: ${v} vs ${border[i]}`));
  }
});

test("advance: steps only once its interval has built up, and covers the time owed", () => {
  const map = arena();
  const setup = () => {
    const c = placed(map, 0, [[10, 6], [10, 6], [11, 6]]);
    infect(c, 0, 1, BLOOM);
    const f = new Fungus(map, { interval: 0.1 });
    f.hosts = 1;
    return { c, f, grids: [occupancy(c, new CountGrid())] };
  };
  const a = setup();
  assert.equal(a.f.advance([a.c], a.grids, 1 / 30), false);
  assert.equal(a.c.load[1], 0, "nothing yet");
  assert.equal(a.f.due(1 / 30), false);
  assert.equal(a.f.advance([a.c], a.grids, 1 / 30), false);
  assert.equal(a.f.due(1 / 30), true, "three ticks of 1/30 s make an interval, float sum and all");
  assert.equal(a.f.advance([a.c], a.grids, 1 / 30), true);
  for (let k = 0; k < 87; k++) a.f.advance([a.c], a.grids, 1 / 30); // 3 s in all

  const b = setup();
  for (let k = 0; k < 30; k++) b.f.step([b.c], b.grids, 0.1);
  for (let i = 0; i < 3; i++) assert.ok(Math.abs((a.c.load[i] as number) - (b.c.load[i] as number)) < 1e-5, `ant ${i}: ${a.c.load[i]} vs ${b.c.load[i]}`);
});
