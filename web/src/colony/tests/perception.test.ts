import { test } from "node:test";
import assert from "node:assert/strict";
import { CountGrid, occupancy } from "../battle.ts";
import { Colony, localPolicy, type Policy, type Situation } from "../colony.ts";
import { packModeRequest, situationKey } from "../colonyBrain.ts";
import { Fungus, INTERVENTIONS, STRAINS, intervention } from "../fungus.ts";
import { Pheromones } from "../pheromone.ts";
import { mulberry32, worldFromArrays, type WorldMap } from "../world.ts";

/** Every host runs its strain's default intervention. */
const strainDefault = (sit: { strain: string }) => STRAINS.find((x) => x.id === sit.strain)!.expresses;

// The perception layer (ja-t4d.2): the fungus bends what a host senses, and
// the host's own policy decides from that bent state. The policy is never
// replaced, never told the ant is infected, and asked exactly the question a
// healthy ant would be asked in the world the host perceives.

/** A bare 40×12 field with the nest on the left; `food` cells as [x, y, amount]. */
function field(food: [number, number, number][] = []): WorldMap {
  const size = { w: 40, h: 12 };
  const f = new Float32Array(size.w * size.h);
  for (const [x, y, v] of food) f[y * size.w + x] = v;
  return worldFromArrays(size, [{ x: 4, y: 6.5, r: 2 }], { food: f });
}

/** A one-ant colony that records every situation its (local) policy is asked. */
function recorder(map: WorldMap, params = {}): { c: Colony; asked: Situation[] } {
  const asked: Situation[] = [];
  const policy: Policy = (s) => {
    asked.push(s);
    return localPolicy(s);
  };
  const c = new Colony(map, { antCount: 1, wander: 0, deposit: 0, ...params }, mulberry32(3), policy);
  return { c, asked };
}

/** Put ant 0 at (x, y) heading east, out from the nest for `since` seconds. */
function at(c: Colony, x: number, y: number, since = 1): void {
  c.x[0] = x;
  c.y[0] = y;
  c.heading[0] = 0;
  c.since[0] = since;
}

/** Fill a band of the channel along y = 6, x0..x1, at `level` (a steady trail the sensors all see). */
function band(ph: Pheromones, channel: "food" | "home" | "alarm", x0: number, x1: number, level: number): void {
  for (let x = x0; x <= x1; x++) for (let y = 4; y <= 8; y++) ph.fields[channel].set(x, y, level);
}

test("food gain 0: a follower on a strong trail no longer smells it, so its own rule sends it exploring", () => {
  const run = (gain: number) => {
    const { c, asked } = recorder(field());
    band(c.ph, "food", 10, 30, 3);
    at(c, 12, 6.5);
    c.mode[0] = 1; // follow
    c.gainFood[0] = gain;
    c.tick(1 / 30);
    return { s: asked[0], mode: c.mode[0] };
  };
  const healthy = run(1);
  assert.equal(healthy.s?.foodTrail, "strong");
  assert.equal(healthy.mode, 1, "keeps following");
  const blind = run(0);
  assert.equal(blind.s?.foodTrail, "none");
  assert.equal(blind.mode, 0, "its own policy: no trail, explore");
});

test("an infected host smells the rival's food trail as its own and climbs it to the rival's food", () => {
  // The rival's trail runs east along y = 6, then turns north to food at (24, 1); it rises toward the food.
  // (Two food cells: on hexes, odd row 1 sits half a cell right, and the trail's last steps can end on either.)
  const map = field([[24, 1, 5], [25, 1, 5]]);
  const path: [number, number][] = [];
  for (let x = 10; x <= 24; x++) path.push([x, 6]);
  for (let y = 5; y >= 2; y--) path.push([24, y]);
  const run = (smell: number) => {
    const rival = new Pheromones(map);
    path.forEach(([x, y], k) => {
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) rival.fields.food.set(x + dx, y + dy, 1 + k * 0.3);
    });
    const { c } = recorder(map);
    c.foreign = rival;
    c.foreignFood[0] = smell;
    at(c, 10.5, 6.5);
    // 5 s: the trail takes a host there in ~3 s. Much longer and a healthy ant, turned back by the map's
    // east edge, can wander onto the food by luck (it did at 7.5 s once the rng draws changed).
    for (let k = 0; k < 30 * 5 && !c.carrying[0]; k++) c.tick(1 / 30);
    return c.carrying[0] === 1;
  };
  assert.equal(run(0), false, "healthy: the rival's trail means nothing to it, and it walks on east");
  assert.equal(run(1), true, "infected with `share`: it follows the rival's trail round the corner to the food");
});

test("the host's own policy is asked the very question a healthy ant would be asked in the world it perceives", () => {
  // Healthy ant: a strong food trail, a faint home trail, no alarm.
  const a = recorder(field());
  band(a.c.ph, "food", 10, 30, 1.2);
  band(a.c.ph, "home", 10, 30, 0.2);
  at(a.c, 12, 6.5);
  a.c.tick(1 / 30);
  // Infected ant: a faint food trail it smells ×3, a strong home trail it smells ×0.1, alarm it smells ×0.
  const b = recorder(field());
  band(b.c.ph, "food", 10, 30, 0.4);
  band(b.c.ph, "home", 10, 30, 2);
  band(b.c.ph, "alarm", 10, 30, 5);
  at(b.c, 12, 6.5);
  b.c.gainFood[0] = 3;
  b.c.gainHome[0] = 0.1;
  b.c.gainAlarm[0] = 0;
  b.c.tick(1 / 30);

  const [sa] = a.asked;
  const [sb] = b.asked;
  assert.ok(sa && sb);
  assert.deepEqual(sb, sa, "same situation");
  assert.deepEqual(Object.keys(sb), Object.keys(sa), "same fields: nothing says the ant is infected");
  assert.equal(situationKey(sb), situationKey(sa), "same cache key");
  const doctrine = "Gather food.";
  assert.equal(JSON.stringify(packModeRequest([{ id: "s0", situation: sb }], doctrine)), JSON.stringify(packModeRequest([{ id: "s0", situation: sa }], doctrine)), "byte-identical Jev request");
  assert.equal(b.c.mode[0], a.c.mode[0], "and the same choice");
});

test("alarm gain 0: a host does not shy from alarm it cannot smell", () => {
  const turn = (gain: number) => {
    const { c } = recorder(field());
    // Alarm under the left and front sensors of an ant heading east along y = 6.5; the right is clear.
    // (Hex rows: the ant at y = 6.5 is in row 7; its left sensor reads row 5, x ≈ 13–14; its right reads row 9.)
    for (let x = 13; x <= 18; x++) for (let y = 3; y <= 7; y++) c.ph.fields.alarm.set(x, y, 8);
    at(c, 12, 6.5);
    c.gainAlarm[0] = gain;
    for (let k = 0; k < 10; k++) c.tick(1 / 30);
    return c.heading[0] as number;
  };
  assert.ok(turn(1) > 0.2, `healthy: turns away (right, +) from the alarm: ${turn(1).toFixed(3)}`);
  assert.ok(Math.abs(turn(0)) < 1e-6, `soothed: holds its course: ${turn(0)}`);
});

test("clock: a host feels its time out slowly, so it is not tired yet", () => {
  const tired = (clock: number) => {
    const { c, asked } = recorder(field());
    at(c, 20, 6.5, 1.5 * c.params.patience);
    c.clock[0] = clock;
    c.tick(1 / 30);
    return asked[0]?.tired;
  };
  assert.equal(tired(1), true);
  assert.equal(tired(2), false);
});

test("the fungus writes a host's perception from its intervention and load; a cleared host perceives as it is", () => {
  const map = field();
  const c = new Colony(map, { antCount: 2, maxAnts: 2 }, mulberry32(4));
  c.x[0] = c.x[1] = 20.5;
  c.y[0] = 6.5;
  c.y[1] = 9.5; // apart: no contact between them
  const bloom = STRAINS.findIndex((s) => s.id === "bloom");
  const lockpick = STRAINS.findIndex((s) => s.id === "lockpick");
  c.load[0] = 0.5;
  c.strain[0] = bloom;
  c.load[1] = 1;
  c.strain[1] = lockpick;
  const f = new Fungus(map, { grooming: 0 });
  f.hosts = 2;
  f.policy = strainDefault; // these tests are about levers, not the policy
  f.step([c], [occupancy(c, new CountGrid())], 1e-6);

  assert.equal(c.expr[0], intervention("share"), "Bloom's default: share");
  assert.ok(Math.abs((c.gainFood[0] as number) - 1.25) < 1e-3, `food ×1.25 at half load: ${c.gainFood[0]}`);
  assert.ok(Math.abs((c.foreignFood[0] as number) - 0.5) < 1e-3);
  assert.equal(c.gainAlarm[0], 1, "share leaves alarm alone");
  assert.equal(c.expr[1], intervention("soothe"), "Lockpick's default: soothe");
  assert.ok(Math.abs((c.gainAlarm[1] as number) - 0.25) < 1e-6, "alarm ×0.25 at full load");

  // A strain that clears at once: the host is clean after one step, and perceives as it is.
  const g = new Fungus(map, {}, STRAINS.map((s) => ({ ...s, decay: 1e9 })));
  g.hosts = 2;
  g.step([c], [occupancy(c, new CountGrid())], 0.1);
  for (const i of [0, 1]) {
    assert.equal(c.load[i], 0);
    assert.equal(c.expr[i], 0, "dormant");
    assert.deepEqual([c.gainFood[i], c.gainHome[i], c.gainAlarm[i], c.foreignFood[i], c.clock[i]], [1, 1, 1, 0, 1]);
  }
});

test("every intervention keeps its gains in a range a sensor can read: never past what seen food reads", () => {
  for (const v of INTERVENTIONS) {
    for (const g of [v.levers.food, v.levers.home, v.levers.alarm, v.levers.foreignFood]) assert.ok(g >= 0 && g <= 4, `${v.id}: ${g}`);
    assert.ok(v.levers.clock > 0, `${v.id}: a clock must run`);
  }
  assert.equal(INTERVENTIONS[0]?.id, "dormant");
  for (const s of STRAINS) assert.doesNotThrow(() => intervention(s.expresses), `${s.id} expresses a known intervention`);
});
