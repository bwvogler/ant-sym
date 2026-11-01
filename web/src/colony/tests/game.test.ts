import { test } from "node:test";
import assert from "node:assert/strict";
import { occupancy, resolveFights } from "../battle.ts";
import { Colony, localPolicy, localStance, type Situation, type StanceSituation } from "../colony.ts";
import { Game } from "../game.ts";
import { generateWorld, mulberry32, reachable, type WorldMap } from "../world.ts";

/** A bare 40×12 field with two nests, no food. */
function arena(): WorldMap {
  const size = { w: 40, h: 12 };
  const nests = [{ x: 4, y: 6, r: 2 }, { x: 36, y: 6, r: 2 }];
  return { size, seed: 0, rock: new Uint8Array(size.w * size.h), food: new Float32Array(size.w * size.h), nest: nests[0]!, nests, foodTotal: 0 };
}

/** Put `count` living ants of colony c in cell (x, y), and kill the rest. */
function crowd(c: Colony, x: number, y: number, count: number): void {
  for (let i = 0; i < c.n; i++) {
    c.alive[i] = i < count ? 1 : 0;
    c.x[i] = x + 0.5;
    c.y[i] = y + 0.5;
  }
}

const sit = (s: Partial<Situation>): Situation => ({ mode: "explore", tired: false, foodTrail: "none", homeTrail: "none", alarm: "none", enemy: "none", stance: "forage", ...s });
const view = (s: Partial<StanceSituation>): StanceSituation => ({ stance: "forage", ants: "some", losses: "none", enemyNearNest: false, foodLeft: "plenty", larder: "low", ...s });

test("generateWorld: two nests, far apart, joined on foot, with food away from both", () => {
  for (let seed = 1; seed <= 15; seed++) {
    const m = generateWorld(seed);
    assert.equal(m.nests.length, 2);
    assert.equal(m.nest, m.nests[0]);
    const [a, b] = m.nests as [WorldMap["nest"], WorldMap["nest"]];
    assert.ok(Math.hypot(a.x - b.x, a.y - b.y) > Math.min(m.size.w, m.size.h) * 0.6, `seed ${seed}: nests too close`);
    const reach = reachable(m.size, m.rock, a.x, a.y);
    assert.equal(reach[Math.floor(b.y) * m.size.w + Math.floor(b.x)], 1, `seed ${seed}: the rival nest cannot be walked to`);
  }
});

test("localPolicy: enemies are fought; raids take explorers, not followers; defence answers alarm; a fight over sends the ant home", () => {
  assert.equal(localPolicy(sit({ enemy: "near", tired: true })), "fight");
  assert.equal(localPolicy(sit({ stance: "raid", mode: "explore" })), "fight");
  assert.equal(localPolicy(sit({ stance: "raid", mode: "follow", foodTrail: "strong" })), "follow");
  assert.equal(localPolicy(sit({ stance: "defend", alarm: "faint" })), "fight");
  assert.equal(localPolicy(sit({ stance: "forage", alarm: "strong", mode: "explore" })), "explore", "foragers leave alarm to steering");
  assert.equal(localPolicy(sit({ mode: "fight" })), "return");
});

test("localStance: defend a nest under attack, raid when food is scarce or the colony is full and fed, else forage", () => {
  assert.equal(localStance(view({ enemyNearNest: true, losses: "some" })), "defend");
  assert.equal(localStance(view({ enemyNearNest: true })), "forage", "an enemy passing by is not an attack");
  assert.equal(localStance(view({ foodLeft: "scarce" })), "raid");
  assert.equal(localStance(view({ foodLeft: "scarce", ants: "few" })), "forage", "too few to raid");
  assert.equal(localStance(view({ larder: "full", ants: "many" })), "raid");
  assert.equal(localStance(view({})), "forage");
});

test("fights: equal numbers trade; the bigger crowd loses fewer; fighters lay alarm in their own field", () => {
  let evenA = 0;
  let evenB = 0;
  let smallLost = 0;
  let bigLost = 0;
  for (let round = 0; round < 40; round++) {
    const m = arena();
    const a = new Colony(m, { antCount: 20, maxAnts: 20, nest: 0 }, mulberry32(round));
    const b = new Colony(m, { antCount: 20, maxAnts: 20, nest: 1 }, mulberry32(round + 1000));
    crowd(a, 20, 6, 10);
    crowd(b, 20, 6, 10);
    const grids = [occupancy(a, new Uint16Array(480)), occupancy(b, new Uint16Array(480))];
    const [da, db] = resolveFights([a, b], grids, 0.2, mulberry32(round + 7));
    evenA += da!;
    evenB += db!;
    if (round === 0) assert.ok(a.ph.read("alarm", 20.5, 6.5) > 0 && b.ph.read("alarm", 20.5, 6.5) > 0, "both laid alarm");

    const small = new Colony(m, { antCount: 20, maxAnts: 20, nest: 0 }, mulberry32(round + 2));
    const big = new Colony(m, { antCount: 20, maxAnts: 20, nest: 1 }, mulberry32(round + 3));
    crowd(small, 20, 6, 4);
    crowd(big, 20, 6, 16);
    const g2 = [occupancy(small, new Uint16Array(480)), occupancy(big, new Uint16Array(480))];
    const [ds, dbig] = resolveFights([small, big], g2, 0.2, mulberry32(round + 9));
    smallLost += ds! / 4;
    bigLost += dbig! / 16;
  }
  assert.ok(evenA > 0 && evenB > 0);
  assert.ok(Math.abs(evenA - evenB) < 0.5 * Math.max(evenA, evenB), `even fight: ${evenA} vs ${evenB}`);
  assert.ok(smallLost > 3 * bigLost, `outnumbered lose a bigger share: ${smallLost.toFixed(2)} vs ${bigLost.toFixed(2)}`);
});

test("no enemy within a cell: no fight", () => {
  const m = arena();
  const a = new Colony(m, { antCount: 5, maxAnts: 5, nest: 0 }, mulberry32(1));
  const b = new Colony(m, { antCount: 5, maxAnts: 5, nest: 1 }, mulberry32(2));
  crowd(a, 5, 6, 5);
  crowd(b, 30, 6, 5);
  const deaths = resolveFights([a, b], [occupancy(a, new Uint16Array(480)), occupancy(b, new Uint16Array(480))], 1, () => 0);
  assert.deepEqual(deaths, [0, 0]);
});

test("kill drops carried food where the ant falls; the larder becomes ants in free slots, up to the cap", () => {
  const m = arena();
  const c = new Colony(m, { antCount: 3, maxAnts: 4, nest: 0, foodPerAnt: 4 }, mulberry32(3), () => "explore");
  c.carrying[0] = 1;
  c.x[0] = 10.5;
  c.y[0] = 3.5;
  c.kill(0);
  assert.equal(m.food[3 * 40 + 10], 1);
  assert.equal(c.population, 2);
  assert.equal(c.losses, 1);
  c.larder = 13;
  c.tick(1 / 30);
  assert.equal(c.population, 4, "two new ants (8 food), the cap");
  assert.equal(c.larder, 5, "the rest waits");
  assert.equal(c.births, 2);
  assert.equal(c.alive[0], 1, "a dead slot was reused");
});

test("a fighting ant goes for the enemy it can see", () => {
  const m = arena();
  const c = new Colony(m, { antCount: 1, maxAnts: 1, wander: 0, deposit: 0 }, mulberry32(4), () => "fight");
  const enemies = new Uint16Array(480);
  enemies[8 * 40 + 20] = 3; // two cells south of the ant
  c.enemies = enemies;
  c.x[0] = 20.5;
  c.y[0] = 6.5;
  c.heading[0] = 0; // east
  for (let k = 0; k < 15; k++) c.tick(1 / 30);
  assert.ok((c.y[0] as number) > 6.8, `it turned south toward the enemy: y ${c.y[0]}`);
});

test("the game: both colonies forage and grow, they meet and fight, stances are chosen, and food is never made or lost", () => {
  const map = generateWorld(1);
  const g = new Game(map, { antCount: 300, rivalAnts: 300 }, mulberry32(11));
  for (let k = 0; k < 30 * 150; k++) g.tick(1 / 30);
  const [you, rival] = g.colonies as [Colony, Colony];
  assert.ok(you.stored > 100 && rival.stored > 50, `stored ${you.stored} / ${rival.stored}`);
  assert.ok(you.births > 0 && rival.births > 0, "both grew");
  assert.ok(you.losses + rival.losses > 0, "they fought");
  assert.ok(g.strategyChoices >= 2 * 29, "a stance every 5 s for each colony");
  let carried = 0;
  for (const c of g.colonies) for (let i = 0; i < c.n; i++) carried += c.alive[i]! && c.carrying[i]! ? 1 : 0;
  assert.equal(Math.round(you.foodLeft + you.stored + rival.stored + carried), map.foodTotal, "food is conserved");
  assert.ok(["playing", "won", "lost"].includes(g.outcome()));
});

test("the outcome: a colony with no ants and too little food for one more is beaten", () => {
  const g = new Game(generateWorld(2), { antCount: 10, rivalAnts: 10 }, mulberry32(5));
  for (let i = 0; i < g.rival!.n; i++) g.rival!.kill(i);
  assert.equal(g.outcome(), "won");
  g.rival!.larder = 4;
  assert.equal(g.outcome(), "playing", "it can still raise an ant");
  for (let i = 0; i < g.player.n; i++) g.player.kill(i);
  assert.equal(g.outcome(), "lost");
});

test("solo (no rival), the colony keeps foraging: no stance to choose, nobody turned into a fighter", () => {
  const map = generateWorld(1);
  const g = new Game(map, { antCount: 600, rival: false }, mulberry32(7919));
  for (let k = 0; k < 30 * 200; k++) g.tick(1 / 30);
  assert.equal(g.player.stance, "forage");
  assert.equal(g.player.counts().fight, 0, "no fighters without an enemy");
  assert.equal(g.strategyChoices, 0, "the strategist was never asked");
});
