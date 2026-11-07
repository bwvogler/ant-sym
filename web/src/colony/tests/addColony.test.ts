import { test } from "node:test";
import assert from "node:assert/strict";
import { Game, type GameSave } from "../game.ts";
import { generateSideWorld, mulberry32 } from "../world.ts";

// Several colonies at runtime (ja-lo8.8): a colony founded mid-game digs its own nest, has its own queen, takes part
// in the game like the world's own colonies, and survives a save.

const DT = 1 / 30;
const run = (g: Game, s: number) => {
  for (let k = 0; k < Math.round(s / DT); k++) g.tick(DT);
};
/** Where to found: the ground line over this column, a quarter of the way between the two holes. */
function spot(g: Game) {
  const a = g.colonies[0]!.nest.entrance!;
  const b = g.colonies[1]!.nest.entrance!;
  return { x: a.x + 0.25 * (b.x - a.x), y: a.y };
}

test("a colony founded mid-game has its own hole, chamber and queen, and lives", () => {
  const g = new Game(generateSideWorld(2), { antCount: 120, rivalAnts: 120 }, mulberry32(11));
  run(g, 10);
  const at = spot(g);
  const k = g.addColony({ ...at, antCount: 30, odour: g.colonies[0]!.nestOdour });
  assert.equal(k, 2);
  const c = g.colonies[2]!;
  assert.ok(c.nest.entrance, "a hole of its own");
  assert.ok(Math.abs(c.nest.entrance.x - at.x) < 2, "where it was founded");
  assert.ok(c.queen?.alive, "and a queen in its founding chamber");
  assert.ok(g.map.chambers!.list.some((r) => r.colony === 2 && r.role === "royal"));
  assert.equal(c.population, 30);
  run(g, 60);
  assert.ok(c.population > 0, "it lives");
  assert.ok(c.decisions > 0, "its ants choose");
  assert.ok(g.colonies[0]!.others.length === 2, "the other colonies know its nest");
  // A daughter at her mother's odour is kin: the mother does not raid her; the stranger colony may.
  const kin = g.colonies[0]!.raidMarks;
  assert.notEqual(kin, c.ph, "kin are not raided");
});

test("a save holds the colonies founded mid-game, and restores bit-exact", () => {
  const make = () => new Game(generateSideWorld(2), { antCount: 120, rivalAnts: 120 }, mulberry32(11));
  const whole = make();
  run(whole, 10);
  whole.addColony({ ...spot(whole), antCount: 30, odour: 0 });
  run(whole, 20);
  const saved = JSON.parse(JSON.stringify(whole.save())) as GameSave;
  run(whole, 15);
  const again = make();
  again.load(saved);
  assert.equal(again.colonies.length, 3);
  const resaved = JSON.parse(JSON.stringify(again.save())) as GameSave;
  for (const key of Object.keys(saved) as (keyof GameSave)[]) assert.deepEqual(resaved[key], saved[key], `save field ${key}`);
  run(again, 15);
  for (let k = 0; k < 3; k++) {
    const a = whole.colonies[k]!;
    const b = again.colonies[k]!;
    assert.deepEqual([b.population, b.births, b.stored], [a.population, a.births, a.stored], `colony ${k}`);
    assert.deepEqual(Array.from(b.x), Array.from(a.x), `colony ${k}: every ant where it was`);
  }
});
