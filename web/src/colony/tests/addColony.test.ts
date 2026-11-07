import { test } from "node:test";
import assert from "node:assert/strict";
import { Game, HOLE_GAP, type GameSave } from "../game.ts";
import { CELL, cellOf } from "../hex.ts";
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

// Seed 13 is one where digging the founded nest again on load (from the restored game's random stream) slanted its
// shaft elsewhere: the nest came back at x 411 instead of 417 (PR #42 review, B1). A save founds from the nest as dug.
for (const seed of [11, 13])
  test(`a save holds the colonies founded mid-game, and restores bit-exact (seed ${seed})`, () => {
    const make = () => new Game(generateSideWorld(2), { antCount: 120, rivalAnts: 120 }, mulberry32(seed));
    const whole = make();
    run(whole, 10);
    whole.addColony({ ...spot(whole), antCount: 30, odour: 0 });
    run(whole, 20);
    const saved = JSON.parse(JSON.stringify(whole.save())) as GameSave;
    run(whole, 15);
    const again = make();
    again.load(saved);
    assert.equal(again.colonies.length, 3);
    assert.deepEqual(again.colonies[2]!.nest, whole.colonies[2]!.nest, "the founded nest where it was dug");
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

test("with the rival off, a founded colony takes the nest it dug, not the world's unused second nest", () => {
  const g = new Game(generateSideWorld(1), { antCount: 120, rival: false }, mulberry32(11));
  run(g, 5);
  const hole = g.colonies[0]!.nest.entrance!;
  const at = { x: 303.5, y: hole.y };
  const k = g.addColony({ ...at, antCount: 30, odour: 0 });
  assert.equal(k, 1);
  const c = g.colonies[1]!;
  assert.equal(c.params.nest, g.map.nests.length - 1, "its own nest's index");
  assert.notEqual(c.nest, g.map.nests[1], "not the world's second nest");
  assert.ok(Math.abs(c.nest.entrance!.x - at.x) < 2, "the hole just dug");
  assert.ok(c.queen && Math.abs(c.queen.x - at.x) < 40, "its queen under its own hole");
  const royals = g.map.chambers!.list.filter((r) => r.role === "royal" && r.colony === c.params.nest);
  assert.equal(royals.length, 1, "one royal chamber of its own");
  run(g, 20);
  assert.ok(c.population > 0);
});

test("founding twice at one spot digs a second hole along the ground, and every colony keeps every hole open", () => {
  const g = new Game(generateSideWorld(2), { antCount: 120, rivalAnts: 120 }, mulberry32(11));
  run(g, 5);
  const at = spot(g);
  g.addColony({ ...at, antCount: 30, odour: 0 });
  g.addColony({ ...at, antCount: 30, odour: 0 });
  const col = (k: number) => {
    const e = g.colonies[k]!.nest.entrance!;
    cellOf(e.x, e.y);
    return CELL[0] as number;
  };
  const cols = [0, 1, 2, 3].map(col);
  for (let a = 0; a < 4; a++) for (let b = a + 1; b < 4; b++) assert.ok(Math.abs(cols[a]! - cols[b]!) >= HOLE_GAP, `holes ${a} and ${b} apart (PR #42 review, S2)`);
  // The world's colonies learn the founded holes, so their mounds keep those funnels open too (S3).
  for (const c of g.colonies) assert.deepEqual([...(c.saveState().private as { holes: number[] }).holes].sort((x, y) => x - y), [...cols].sort((x, y) => x - y));
});

test("a founded colony that falls does not end the game; the world's own colonies still do", () => {
  const g = new Game(generateSideWorld(2), { antCount: 120, rivalAnts: 120 }, mulberry32(11));
  run(g, 2);
  g.addColony({ ...spot(g), antCount: 30, odour: 0 });
  const c = g.colonies[2]!;
  for (let i = 0; i < c.n; i++) c.alive[i] = 0;
  if (c.queen) c.queen.alive = false;
  assert.ok(Game.beaten(c), "the founded colony is beaten");
  assert.equal(g.fallen(), -1);
  assert.notEqual(g.outcome(), "fallen");
});
