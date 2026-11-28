import { test } from "node:test";
import { snapshotAttackCue } from "../../attackCue.ts";
import { CELL } from "../../hex.ts";
import assert from "node:assert/strict";
import { CountGrid, occupancy, resolveFights } from "../../battle.ts";
import { Game, gameRng } from "../../game.ts";
import { run, smallOne } from "../builders.ts";
import { Colony } from "../../colony.ts";
import { combatObservers } from "../../combatObservation.ts";
import { Recognition } from "../../recognition.ts";
import { enemyHeading } from "../../sense.ts";
import { mulberry32, ROCK, setRock } from "../../world.ts";
import { hexMap, put } from "../hexmaps.ts";

function pair(rows = [".....", ".....", "....."]) {
  const map = hexMap(rows);
  const cs = [0, 1].map((nest) => new Colony(map, { antCount: 1, maxAnts: 1, odour: nest }, mulberry32(nest + 1)));
  for (const c of cs) {
    put(c, 0, 2, 1);
    c.attackLayer[0] = c.layer[0];
  }
  return cs;
}
function fight(cs: Colony[], recognized = true, attackReach: 0 | 1 = 1, attackDistance?: number) {
  const rec = new Recognition();
  rec.build(cs);
  return resolveFights(
    cs,
    cs.map((c) => occupancy(c, new CountGrid())),
    1,
    () => 0,
    { rate: 1, alarm: 1, intent: true, attackReach, attackDistance },
    recognized ? rec : null,
  );
}

test("attack pressure is confined to reachable cells and clears between resolutions", () => {
  const cs = pair();
  put(cs[1], 0, 4, 1);
  assert.deepEqual(fight(cs), [0, 0]);
  put(cs[1], 0, 3, 1);
  cs[0].attackLayer[0] = cs[1].attackLayer[0] = -1;
  assert.deepEqual(fight(cs), [0, 0]);
  cs[0].attackLayer[0] = cs[0].layer[0];
  assert.deepEqual(fight(cs), [0, 1]);
});

test("a zero-ring attack requires both ants to occupy the same cell", () => {
  const cs = pair();
  cs[1].attackLayer[0] = -1;
  put(cs[1], 0, 3, 1);
  assert.deepEqual(fight(cs, false, 0), [0, 0]);
  put(cs[1], 0, 2, 1);
  assert.deepEqual(fight(cs, false, 0), [0, 1]);
});

test("distance reach crosses cell boundaries and excludes distant ants in the same cell", () => {
  const cs = pair();
  cs[1].attackLayer[0] = -1;
  cs[0].x[0] -= 0.4;
  cs[1].x[0] += 0.4;
  assert.deepEqual(fight(cs, false, 1, 0.65), [0, 0]);

  put(cs[0], 0, 2, 1);
  put(cs[1], 0, 3, 1);
  cs[0].x[0] += 0.4;
  cs[1].x[0] -= 0.4;
  assert.deepEqual(fight(cs, false, 1, 0.65), [0, 1]);
});

test("movement can bring a hostile ant into perception before damage resolves", () => {
  const [defender, raider] = pair([".......", ".......", "......."]);
  const colonies = [defender, raider];
  const recognition = new Recognition();
  defender.attackLayer[0] = -1;
  put(raider, 0, 6, 1);
  defender.wire(0, { enemies: recognition });
  recognition.build(colonies);
  assert.equal(enemyHeading(defender, 0), null);

  put(raider, 0, 3, 1);
  recognition.build(colonies);
  assert.notEqual(enemyHeading(defender, 0), null);
  assert.deepEqual(
    resolveFights(
      colonies,
      colonies.map((colony) => occupancy(colony, new CountGrid())),
      1,
      () => 0,
      { rate: 1, alarm: 1, intent: true },
      recognition,
    ),
    [1, 0],
  );
});

test("neither soil nor rock can host an attack or receive one", () => {
  for (const tile of ["s", "#"]) {
    const cs = pair([".....", `...${tile}.`, "....."]);
    put(cs[1], 0, 3, 1);
    assert.deepEqual(fight(cs), [0, 0]);
  }
});

test("an attack chosen on a different layer cannot leak through a crossing", () => {
  const cs = pair();
  for (const c of cs) c.attackLayer[0] = 1 - c.layer[0];
  assert.deepEqual(fight(cs), [0, 0]);
});

test("colony recognition fallback still requires directional attack intent", () => {
  const cs = pair();
  cs[1].attackLayer[0] = -1;
  assert.deepEqual(fight(cs, false), [0, 1]);
});

test("combat observation reports incoming pressure and casualties on the receiving side", () => {
  const cs = pair();
  cs[1].attackLayer[0] = -1;
  const exposures: number[][] = [];
  cs.forEach((colony, side) => {
    combatObservers.set(colony, {
      contact() {},
      exposure(pressure, allies, killed, ant) {
        exposures.push([side, ant, pressure, allies, Number(killed)]);
      },
    });
  });
  assert.deepEqual(fight(cs, false), [0, 1]);
  assert.deepEqual(exposures, [[1, 0, 1, 1, 1]]);
});

test("a single ant with narrow tolerance cannot attack itself", () => {
  const cs = pair().slice(0, 1);
  cs[0].tolerance[0] = 0;
  assert.deepEqual(fight(cs), [0]);
});

test("saved attack intent survives replay; older saves default to no attack", () => {
  const cs = pair();
  cs[1].attackLayer[0] = -1;
  const saved = cs.map((c) => JSON.parse(JSON.stringify(c.saveState())));
  const restored = pair();
  restored.forEach((c, k) => c.loadState(saved[k]));
  assert.deepEqual(fight(cs), fight(restored));
  delete saved[0].fields.attackLayer;
  const old = pair()[0];
  old.attackLayer[0] = -1;
  old.loadState(saved[0]);
  assert.equal(old.attackLayer[0], -1);
});

test("a recycled ant slot cannot inherit an attack", () => {
  const c = pair()[0];
  c.kill(0);
  assert.equal(c.spawn(), true);
  assert.equal(c.attackLayer[0], -1);
});

test("directed combat games resume deterministically from JSON saves", () => {
  const make = () =>
    new Game(smallOne(7), { fight: { rate: 1.5, alarm: 8, intent: true, counterattack: true } }, gameRng(7), [
      { antCount: 20 },
      { antCount: 20 },
    ]);
  const g = make();
  run(g, 2);
  const copy = make();
  copy.load(JSON.parse(JSON.stringify(g.save())));
  run(g, 2);
  run(copy, 2);
  assert.deepEqual(JSON.parse(JSON.stringify(copy.save())), JSON.parse(JSON.stringify(g.save())));
});

test("ants at matching coordinates on different layers cannot attack each other", () => {
  const g = new Game(smallOne(7), {}, gameRng(7), [{ antCount: 1 }, { antCount: 1 }]);
  g.colonies.forEach((c, k) => {
    c.layer[0] = k;
    c.attackLayer[0] = k;
    put(c, 0, 20, 20);
  });
  const rec = new Recognition({ odourAxes: g.recognition.params.odourAxes });
  rec.build(g.colonies, 0);
  const grids = g.colonies.map((c) => occupancy(c, new CountGrid(), 0));
  assert.deepEqual(
    resolveFights(g.colonies, grids, 1, () => 0, { rate: 1, alarm: 1, intent: true }, rec, 0),
    [0, 0],
  );
});

test("attack cues use the previous tick and exclude blocked or friendly attacks", () => {
  const [worker, stranger] = pair();
  worker.attackLayer[0] = -1;
  const cue = snapshotAttackCue([worker, stranger]);
  stranger.attackLayer[0] = -1;
  CELL[0] = 0;
  CELL[1] = 0;
  assert.equal(cue(worker, 0), true);
  assert.deepEqual([...CELL], [0, 0]);
  assert.equal(snapshotAttackCue([worker, stranger])(worker, 0), false);

  worker.tolerance[0] = 2;
  assert.equal(cue(worker, 0), false);
  worker.tolerance[0] = 0;
  worker.layer[0] = 1;
  assert.equal(cue(worker, 0), false);
  worker.layer[0] = 0;
  setRock(worker.map, 2, 1, ROCK);
  assert.equal(cue(worker, 0), false);
});
