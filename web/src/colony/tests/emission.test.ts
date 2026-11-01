import { test } from "node:test";
import assert from "node:assert/strict";
import { CountGrid, occupancy, resolveFights } from "../battle.ts";
import { Colony, localPolicy } from "../colony.ts";
import { Fungus, INTERVENTIONS, STRAINS, intervention } from "../fungus.ts";
import { Pheromones } from "../pheromone.ts";
import { Recognition } from "../recognition.ts";
import { mulberry32, worldFromArrays, type WorldMap } from "../world.ts";

// Emission (ja-t4d.4): the fungus changes what a host gives off. Louder or
// quieter trail (C1), a carrier leaking its food trail into the other
// colony's field (C2), and a fight that does not raise the alarm (C3).

function arena(): WorldMap {
  return worldFromArrays({ w: 40, h: 12 }, [{ x: 4, y: 6.5, r: 2 }, { x: 36, y: 6.5, r: 2 }]);
}

/** One ant walking east along y = 6.5 from x = 10 for a second, nothing to steer it. */
function walker(map: WorldMap, carrying: boolean) {
  const c = new Colony(map, { antCount: 1, maxAnts: 1, wander: 0 }, mulberry32(5), () => "explore");
  c.x[0] = 10;
  c.y[0] = 6.5;
  c.heading[0] = 0;
  c.carrying[0] = carrying ? 1 : 0;
  return c;
}

test("deposit gain: a host lays its trail louder or quieter, and a gain of 1 lays exactly what it did", () => {
  const laid = (gain: number) => {
    const c = walker(arena(), false);
    c.layGain[0] = gain;
    // Carrying nothing and out from the nest: it walks home along its home vector, laying home trail.
    for (let k = 0; k < 30; k++) c.tick(1 / 30);
    return c.ph.total("home");
  };
  const asIs = laid(1);
  assert.ok(asIs > 0);
  assert.equal(laid(0), 0, "silent");
  assert.ok(Math.abs(laid(2) - 2 * asIs) < 1e-4 * asIs, `twice as loud: ${laid(2)} vs ${2 * asIs}`);
});

test("cross-laying: a carrier leaks its food trail into the other colony's field along its path; as-is it leaks nothing", () => {
  const run = (leak: number) => {
    const map = arena();
    const c = walker(map, true);
    const rival = new Pheromones(map);
    c.foreign = rival;
    c.crossLay[0] = leak;
    for (let k = 0; k < 30; k++) c.tick(1 / 30);
    return { own: c.ph.total("food"), theirs: rival.total("food"), at: rival.read("food", 10.5, 6.5) };
  };
  const none = run(0);
  assert.ok(none.own > 0);
  assert.equal(none.theirs, 0);
  const full = run(1);
  assert.ok(Math.abs(full.own - none.own) < 1e-9, "its own trail is unchanged");
  assert.ok(full.theirs > 0.9 * full.own, `the rival gets as much: ${full.theirs} vs ${full.own}`);
  assert.ok(full.at > 0, "along the path it walked: where it started");
});

test("silent fights: a quiet host lays no alarm, so a skirmish recruits fewer defenders", () => {
  const map = arena();
  // A skirmish at (20, 6); idle nestmates around it, defending: the local rule sends an ant that smells alarm to fight.
  const skirmish = (quiet: number) => {
    const cells: [number, number][] = [[20, 6], [20, 6], [20, 6]];
    for (let x = 14; x <= 26; x += 2) cells.push([x, 3], [x, 9]);
    const mine = new Colony(map, { antCount: cells.length, maxAnts: cells.length, nest: 0, odour: 0, wander: 0 }, mulberry32(8), localPolicy);
    cells.forEach(([x, y], i) => {
      mine.x[i] = x + 0.5;
      mine.y[i] = y + 0.5;
      mine.heading[i] = Math.PI / 2;
    });
    for (let i = 0; i < 3; i++) mine.quiet[i] = quiet;
    mine.stance = "defend";
    const them = new Colony(map, { antCount: 3, maxAnts: 3, nest: 1, odour: 1 }, mulberry32(9));
    for (let i = 0; i < 3; i++) {
      them.x[i] = 20.5;
      them.y[i] = 6.5;
    }
    const rec = new Recognition();
    rec.build([mine, them]);
    // Half a second of fighting (nobody dies: the dice always say no), then the field spreads.
    for (let k = 0; k < 15; k++) {
      resolveFights([mine, them], [occupancy(mine, new CountGrid()), occupancy(them, new CountGrid())], 1 / 30, () => 0.999, undefined, rec);
      mine.ph.step(1 / 30);
    }
    const alarm = mine.ph.total("alarm");
    // Freeze the fighters' part: count the idle nestmates that now choose to fight.
    mine.enemies = null;
    mine.tick(1 / 30);
    let recruited = 0;
    for (let i = 3; i < mine.n; i++) if (mine.mode[i] === 3) recruited++;
    return { alarm, recruited };
  };
  const loud = skirmish(0);
  const silent = skirmish(1);
  assert.ok(loud.alarm > 0 && loud.recruited > 0, `a loud skirmish raises alarm and recruits: ${JSON.stringify(loud)}`);
  assert.equal(silent.alarm, 0);
  assert.equal(silent.recruited, 0, "nobody smelled it");
});

test("the fungus writes what a host gives off: share is loud and leaks, soothe fights quietly; a cleared host is as it was", () => {
  const map = arena();
  const c = new Colony(map, { antCount: 2, maxAnts: 2 }, mulberry32(4));
  c.x[0] = c.x[1] = 20.5;
  c.y[0] = 3.5;
  c.y[1] = 9.5;
  const bloom = STRAINS.findIndex((s) => s.id === "bloom");
  const lockpick = STRAINS.findIndex((s) => s.id === "lockpick");
  c.load[0] = 1;
  c.strain[0] = bloom;
  c.load[1] = 0.5;
  c.strain[1] = lockpick;
  const f = new Fungus(map, { grooming: 0 });
  f.hosts = 2;
  f.step([c], [occupancy(c, new CountGrid())], 1e-6);
  assert.equal(c.expr[0], intervention("share"));
  assert.ok(Math.abs((c.layGain[0] as number) - 1.5) < 1e-5);
  assert.ok(Math.abs((c.crossLay[0] as number) - 1) < 1e-5);
  assert.equal(c.quiet[0], 0);
  assert.equal(c.expr[1], intervention("soothe"));
  assert.ok(Math.abs((c.quiet[1] as number) - 0.45) < 1e-5, "half load, half the quiet");
  assert.equal(c.layGain[1], 1);
  // Cleared: as it was.
  const g = new Fungus(map, {}, STRAINS.map((s) => ({ ...s, decay: 1e9 })));
  g.hosts = 2;
  g.step([c], [occupancy(c, new CountGrid())], 0.1);
  for (const i of [0, 1]) assert.deepEqual([c.layGain[i], c.crossLay[i], c.quiet[i]], [1, 0, 0]);
});

test("every intervention keeps what a host gives off in range", () => {
  for (const v of INTERVENTIONS) {
    assert.ok(v.levers.lay >= 0 && v.levers.lay <= 3, v.id);
    assert.ok(v.levers.crossLay >= 0 && v.levers.crossLay <= 1, v.id);
    assert.ok(v.levers.quiet >= 0 && v.levers.quiet <= 1, v.id);
  }
});
