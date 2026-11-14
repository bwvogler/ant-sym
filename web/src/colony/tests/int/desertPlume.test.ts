import { test } from "node:test";
import assert from "node:assert/strict";
import { PLANE } from "../../colony.ts";
import { EXPLORE } from "../../vocab.ts";
import { DESERT_ANT } from "../../desertAnt.ts";
import { Game, gameRng, type GameSave } from "../../game.ts";
import { CELL, cellOf, centreX, centreY, hexDistance } from "../../hex.ts";
import { generateOneWorld } from "../../oneWorld.ts";
import { PLUME_EVERY, plumeAt, updatePlume, type PlumeState } from "../../plume.ts";
import { OPEN, ROCK, generateWorld, setRock } from "../../world.ts";
import { hashGame } from "../saveHash.ts";
import { run } from "../builders.ts";

// ja-rf5.4: food odour in the air (docs/desert-ant.md §3, plume.ts). A gradient from every food cell through open ground out to the
// species' range, rebuilt only at multiples of PLUME_EVERY in game time; the desert ant climbs it with empty jaws.

/** A bare 40 × 30 map: open everywhere, no food. */
function bare() {
  const map = generateWorld(1, { size: { w: 40, h: 30 } });
  for (let y = 0; y < 30; y++)
    for (let x = 0; x < 40; x++) {
      setRock(map, x, y, OPEN);
      map.food.set(x, y, 0);
    }
  map.foodLeft = 0;
  return map;
}

/** The desert ant's plume range (cells). */
const PLUME = DESERT_ANT.params.foodPlume ?? 0;

const fresh = (): PlumeState => ({ plume: null, plumeEpoch: -1, plumeFood: -1 });

test("the plume: 1 on food, falling with steps through open ground, none past the range or behind rock", () => {
  const map = bare();
  map.food.set(20, 15, 5);
  map.foodLeft = 5;
  // A wall of rock across column 25, all the way down: the odour can't get round it.
  for (let y = 0; y < 30; y++) setRock(map, 25, y, ROCK);
  const range = 6;
  const dist = updatePlume(fresh(), map, range, 0);
  assert.equal(plumeAt(dist, map, range, 20, 15), 1);
  for (const [x, y] of [
    [22, 15],
    [17, 13],
    [20, 9],
  ] as const) {
    const d = hexDistance(20, 15, x, y);
    assert.ok(d <= range);
    assert.equal(plumeAt(dist, map, range, x, y), 1 - d / (range + 1), `(${x}, ${y}), ${d} steps`);
  }
  assert.equal(plumeAt(dist, map, range, 20, 15 + range + 1), 0, "past the range");
  assert.equal(plumeAt(dist, map, range, 25, 15), 0, "the rock");
  assert.equal(plumeAt(dist, map, range, 26, 15), 0, "behind the rock, though within the range as the crow flies");
  assert.equal(plumeAt(dist, map, range, -3, 15), 0, "off the map");
});

test("the plume is rebuilt only in a new period of PLUME_EVERY, and only if the food changed", () => {
  const map = bare();
  map.food.set(10, 10, 1);
  map.foodLeft = 1;
  const s = fresh();
  updatePlume(s, map, 6, 0.5);
  assert.equal(s.plumeEpoch, 0);
  // The food moves within the period: the odour lags it.
  map.food.set(10, 10, 0);
  map.food.set(30, 20, 1);
  map.foodLeft = 1.5; // any change of the total marks it
  let dist = updatePlume(s, map, 6, PLUME_EVERY - 0.1);
  assert.equal(plumeAt(dist, map, 6, 10, 10), 1, "the old food still smells, until the period ends");
  dist = updatePlume(s, map, 6, PLUME_EVERY);
  assert.equal(s.plumeEpoch, 1);
  assert.equal(plumeAt(dist, map, 6, 10, 10), 0, "rebuilt: the old food is gone");
  assert.equal(plumeAt(dist, map, 6, 30, 20), 1);
  // Nothing changes: a new period keeps the plume as it is.
  updatePlume(s, map, 6, 3 * PLUME_EVERY);
  assert.equal(s.plumeEpoch, 1);
});

const desert = (plume = PLUME): Game =>
  new Game(
    generateOneWorld(7, { plane: { size: { w: 160, h: 100 } } }),
    { antCount: 60, rival: false, species: { ...DESERT_ANT, params: { ...DESERT_ANT.params, foodPlume: plume } } },
    gameRng(7),
  );

test("a desert game's plume is saved: a save made between rebuilds runs on exactly as the unbroken game", () => {
  const copy = (s: GameSave): GameSave => JSON.parse(JSON.stringify(s)) as GameSave;
  const whole = desert();
  run(whole, 2 * PLUME_EVERY + 1.5); // a plume built, and the food taken since (the next build differs)
  const c = whole.player;
  assert.ok(c.plume !== null && c.plumeEpoch === 2, `built in the period now (${c.plumeEpoch})`);
  assert.notEqual(c.plumeFood, whole.map.foodLeft, "food taken since it was built (the test's own check)");
  const saved = copy(whole.save());
  const kept = Int16Array.from(c.plume);
  const keptEpoch = c.plumeEpoch;
  const keptFood = c.plumeFood;
  run(whole, 10);
  const unbroken = hashGame(whole);
  const again = desert();
  again.load(copy(saved));
  assert.deepEqual(again.player.plume, kept, "the plume as built, not rebuilt from the food at the save");
  assert.equal(again.player.plumeEpoch, keptEpoch, "and the period it was built in");
  assert.equal(again.player.plumeFood, keptFood);
  run(again, 10);
  assert.equal(hashGame(again), unbroken, "run on: as if never saved");
});

test("the plume is the plane's: an ant in the nest (the curtain) never smells it, and it is only ever built over the plane (review of #143, S2)", () => {
  const g = desert();
  const c = g.player;
  const plane = c.layers[PLANE]!.map;
  const at: number[] = [];
  const smells = c.smellsFood.bind(c);
  c.smellsFood = (i, h, a, max) => (at.push(c.cur), smells(i, h, a, max));
  run(g, 30);
  assert.ok(at.length > 0, "it smelt for food (the test's own check)");
  assert.ok(
    c.layer.some((l, i) => c.alive[i] === 1 && l !== PLANE),
    "ants in the nest too (the test's own check)",
  );
  assert.ok(
    at.every((l) => l === PLANE),
    "read only on the plane",
  );
  assert.equal(c.plume!.length, plane.size.w * plane.size.h, "built over the plane");
});

test("the generic ant has no plume: none is built", () => {
  assert.ok(PLUME > 0, "the desert ant has one (the test's own check)");
  const g = new Game(generateOneWorld(7, { plane: { size: { w: 160, h: 100 } } }), { antCount: 60, rival: false }, gameRng(7));
  run(g, 10);
  assert.equal(g.player.plume, null);
  assert.equal(g.player.params.foodPlume, 0);
});

/**
 * Ant `i` of a desert game put `d` cells from food cell (fx, fy) in direction θ, heading across the way to it (food on its left), on open
 * ground with no food within sight; run 1 s; how much nearer the food it ends (cells). null: no such place there.
 */
function approach(plume: number, fx: number, fy: number, theta: number, d = 8): number | null {
  const g = desert(plume);
  run(g, 15);
  const c = g.player;
  const map = c.layers[PLANE]!.map;
  const px = centreX(fx, fy) + d * Math.cos(theta);
  const py = centreY(fy) + d * Math.sin(theta);
  cellOf(px, py);
  const [ax, ay] = [CELL[0], CELL[1]];
  for (let y = ay - 6; y <= ay + 6; y++)
    for (let x = ax - 6; x <= ax + 6; x++) {
      if (hexDistance(ax, ay, x, y) > 2 && map.rock.get(x, y) !== OPEN) continue;
      if (hexDistance(ax, ay, x, y) <= 2 && map.rock.get(x, y) !== OPEN) return null; // room to turn
      if (hexDistance(ax, ay, x, y) <= 5 && map.food.get(x, y) > 0) return null; // out of sight of food
    }
  const i = c.alive.findIndex((a, k) => a === 1 && c.layer[k] === PLANE && c.carrying[k] === 0 && c.mode[k] === EXPLORE);
  if (i < 0) return null;
  c.x[i] = px;
  c.y[i] = py;
  c.heading[i] = theta + Math.PI + Math.PI / 2; // across the way to the food, which lies on its left
  const fxy = [centreX(fx, fy), centreY(fy)] as const;
  const before = Math.hypot(px - fxy[0], py - fxy[1]);
  run(g, 1);
  return before - Math.hypot(c.x[i] - fxy[0], c.y[i] - fxy[1]);
}

test("with empty jaws, out of sight of food, a desert ant turns up the plume toward it (and without one does not)", () => {
  const g = desert();
  const map = g.player.layers[PLANE]!.map;
  const food: [number, number][] = [];
  for (let y = 0; y < map.size.h; y++) for (let x = 0; x < map.size.w; x++) if (map.food.get(x, y) > 0) food.push([x, y]);
  const withPlume: number[] = [];
  const without: number[] = [];
  for (const [fx, fy] of food.filter((_, k) => k % 7 === 0)) {
    for (let k = 0; k < 6 && withPlume.length < 8; k++) {
      const a = approach(PLUME, fx, fy, (k * Math.PI) / 3);
      if (a === null) continue;
      withPlume.push(a);
      without.push(approach(0, fx, fy, (k * Math.PI) / 3)!);
    }
    if (withPlume.length >= 8) break;
  }
  assert.equal(withPlume.length, 8, "eight places to try (the test's own check)");
  const nearer = withPlume.filter((a) => a > 1).length;
  assert.ok(
    without.every((a) => a < 1),
    `without a plume it does not close on the food (${without.map((a) => a.toFixed(1))})`,
  );
  assert.ok(nearer >= 7, `more than a cell nearer the food with the plume in ${nearer} of 8 (${withPlume.map((a) => a.toFixed(1))})`);
});

test("over a minute, the plume brings more food home than none", () => {
  const stored = (plume: number) => {
    const g = desert(plume);
    run(g, 60);
    assert.ok(g.player.layers[PLANE] !== undefined);
    return g.player.stored;
  };
  const without = stored(0);
  const withPlume = stored(PLUME);
  assert.ok(withPlume > without, `stored ${withPlume} with the plume, ${without} without`);
});
