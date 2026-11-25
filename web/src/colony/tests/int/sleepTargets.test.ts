import assert from "node:assert/strict";
import { test } from "node:test";
import { Builder, linePheromones, RAIN_CHANNELS, guarded } from "../../builder.ts";
import { Game } from "../../game.ts";
import { centreX, centreY } from "../../hex.ts";
import { PLANE } from "../../vocab.ts";
import { mainGround } from "../../oneWorld.ts";
import { mulberry32, OPEN, rockAt, type WorldMap } from "../../world.ts";
import { smallOne } from "../builders.ts";

// A colony asleep is not a target and is not touched (docs/endless-world.md §6, PRD §66 E4.2; ja-qpv.3.6-.8): raids, contact memory, rain, crayons, paint.

const game = (specs: { antCount: number; odour?: number }[] = [{ antCount: 20 }, { antCount: 20 }]) =>
  new Game(smallOne(7), { regrow: 0 }, mulberry32(3), specs);
const run = (g: Game, seconds: number) => {
  for (let t = 0; t < seconds * 30; t++) g.tick(1 / 30);
};
const pt = (x: number, y: number) => ({ x: centreX(x, y), y: centreY(y) });
const key = (x: number, y: number) => (y + 0x8000) * 0x10000 + (x + 0x8000);

/** An open plane cell away from every guarded cell. */
function openCell(g: Game): [number, number] {
  const map = g.layers[PLANE] as WorldMap;
  const guard = guarded(g, PLANE);
  for (let y = 12; y < map.size.h - 12; y++)
    for (let x = map.x0 + 12; x < map.x0 + map.size.w - 12; x++) {
      if (rockAt(map, x, y) !== OPEN || map.food.get(x, y) > 0) continue;
      let near = false;
      for (let dy = -8; dy <= 8 && !near; dy++) for (let dx = -8; dx <= 8 && !near; dx++) near = guard.has(key(x + dx, y + dy));
      if (!near) return [x, y];
    }
  throw new Error("no open cell");
}

test("raids go to no sleeper: a colony whose only rival sleeps has none to raid, and has one again when it wakes", () => {
  const g = game();
  run(g, 1);
  g.tick(1 / 30);
  g.freeze(1);
  assert.equal(g.colonies[0]!.raidable, false, "the only rival sleeps");
  run(g, 5);
  assert.equal(g.colonies[0]!.raidable, false);
  g.thaw(1);
  assert.equal(g.colonies[0]!.raidable, true, "awake again, a rival again");
  assert.equal(g.colonies[0]!.layers[PLANE]!.raidTarget, g.colonies[1]!.layers[PLANE]!.nest);
});

test("with every rival asleep a colony's raid pointers are cleared on every layer, and a thaw points them at the waker again (ja-xfny)", () => {
  const g = game();
  run(g, 1);
  const pointers = (k: number) => g.colonies[k]!.layers.map((l) => l && [l.raidTarget, l.raidNest, l.raidMarks, l.foreign]);
  const at = (k: number, target: number) =>
    g.colonies[k]!.layers.every(
      (l, i) => !l || (l.raidMarks === g.colonies[target]!.layers[i]!.ph && l.foreign === l.raidMarks && l.raidTarget !== null),
    );
  assert.ok(at(0, 1), "pointing at colony 1 while it is awake");
  g.freeze(1);
  assert.equal(g.colonies[0]!.raidable, false);
  for (const l of pointers(0)) if (l) assert.deepEqual(l, [null, null, null, null], "all four cleared on this layer");
  run(g, 5);
  for (const l of pointers(0)) if (l) assert.deepEqual(l, [null, null, null, null], "and they stay cleared through the rival checks");
  g.thaw(1);
  assert.ok(at(0, 1), "the thaw wires them at the waker again");
});

test("a sleeper among three is not pointed at, but the awake rival still is", () => {
  const g = game();
  g.tick(1 / 30);
  const at0 = g.colonies[0]!.layers[PLANE]!.nest;
  let s = g.settleAt({ x: at0.x + 60, y: at0.y }, mainGround(g.world));
  for (let d = 80; !s.ok && d < 400; d += 20) s = g.settleAt({ x: at0.x + d, y: at0.y + d / 2 }, mainGround(g.world));
  assert.ok(s.ok, "a founding spot");
  const k = g.addColony({ x: at0.x + 60, y: at0.y, antCount: 10, odour: 0.9, spot: { cell: s.cell, end: s.end, line: s.line } });
  g.freeze(1);
  run(g, 2);
  const marks = (a: number) => g.colonies[a]!.layers[PLANE]!.raidMarks;
  assert.notEqual(marks(0), null);
  assert.notEqual(marks(0), g.colonies[1]!.layers[PLANE]!.ph, "not the sleeper");
  assert.equal(marks(0), g.colonies[k]!.layers[PLANE]!.ph, "the awake rival");
});

test("a sleeper's contact memory is held, not decayed: met still reads what it was when the colony wakes", () => {
  const g = game([
    { antCount: 20, odour: 0.5 },
    { antCount: 20, odour: 0.5 },
  ]);
  const [x, y] = openCell(g);
  for (const c of g.colonies) for (let i = 0; i < c.n; i++) if (c.alive[i]) c.putAnt(i, PLANE, centreX(x, y), centreY(y));
  run(g, 20);
  const held = g.save().private.metBy![1]!;
  const before0 = g.save().private.metBy![0]!;
  assert.ok(held > 0.01, `the two met (${held})`);
  g.freeze(1);
  run(g, 60);
  assert.equal(g.save().private.metBy![1], held, "held while it slept, not decayed toward 0");
  assert.equal(g.save().private.metBy![0], before0, "and the awake colony's, with nobody awake left to meet");
  assert.equal(g.unity().met, Math.min(held, before0), "so unity().met stands too");
  g.thaw(1);
  assert.equal(g.unity().met, Math.min(held, before0), "and is what it was the moment the colony wakes");
});

test("rain and crayon lines leave a sleeper's scent as it was", () => {
  const g = game();
  const b = new Builder(g);
  const [x, y] = openCell(g);
  for (const c of g.colonies) for (const ch of RAIN_CHANNELS) c.layers[PLANE]!.ph.depositCell(ch, x, y, 2);
  g.freeze(1);
  b.apply({ tool: "rain", layer: PLANE, points: [pt(x, y)] });
  for (const ch of RAIN_CHANNELS) {
    assert.equal(g.colonies[0]!.layers[PLANE]!.ph.fields[ch]!.get(x, y), 0, `${ch} washed from the awake colony`);
    assert.ok(g.colonies[1]!.layers[PLANE]!.ph.fields[ch]!.get(x, y) >= 2 - 1e-6, `${ch} kept on the sleeper`);
  }
  const line = { colony: -1, layer: PLANE, channel: "noEntry" as const, cells: [], age: 0 };
  assert.equal(linePheromones(g, line).length, 1, "the no-entry paint is laid for the awake colony only");
  g.thaw(1);
  assert.equal(linePheromones(g, line).length, 2);
});

test("paint doses no sleeper's ants: the fungus is put down where it lands, on the awake colony's", () => {
  const g = game();
  const [x, y] = openCell(g);
  for (const c of g.colonies) for (let i = 0; i < c.n; i++) if (c.alive[i]) c.putAnt(i, PLANE, centreX(x, y), centreY(y));
  g.freeze(1);
  g.paintSpores(centreX(x, y), centreY(y), 4, 2, 0.5, 0, PLANE);
  const hosts = (k: number) => g.colonies[k]!.load.reduce((n, l, i) => n + (g.colonies[k]!.alive[i] && l > 0 ? 1 : 0), 0);
  assert.ok(hosts(0) > 0, "the awake colony's ants under the brush are dosed");
  assert.equal(hosts(1), 0, "the sleeper's are not");
});

test("with three colonies, a colony raids the nearest rival that is awake, not the nearest of all", () => {
  const g = game();
  g.tick(1 / 30);
  const at0 = g.colonies[0]!.layers[PLANE]!.nest;
  let s = g.settleAt({ x: at0.x + 60, y: at0.y }, mainGround(g.world));
  for (let d = 80; !s.ok && d < 400; d += 20) s = g.settleAt({ x: at0.x + d, y: at0.y + d / 2 }, mainGround(g.world));
  assert.ok(s.ok, "a founding spot");
  g.addColony({ x: at0.x + 60, y: at0.y, antCount: 10, odour: 0.5, spot: { cell: s.cell, end: s.end, line: s.line } });
  const c = g.colonies[0]!;
  const at = (k: number) => g.colonies[k]!.layers[PLANE]!.nest;
  const dist = (k: number) => Math.hypot(at(k).x - at(0).x, at(k).y - at(0).y);
  const [near, far] = dist(1) < dist(2) ? [1, 2] : [2, 1];
  g.tick(1 / 30);
  g.freeze(near);
  assert.equal(c.layers[PLANE]!.raidTarget, at(far), "the farther rival, since the nearer sleeps");
  g.thaw(near);
  assert.equal(c.layers[PLANE]!.raidTarget, at(near), "the nearer again once it wakes");
});

test("undo of a rain stroke does not write into a colony that sleeps now", () => {
  const g = game();
  const b = new Builder(g);
  const [x, y] = openCell(g);
  for (const c of g.colonies) for (const ch of RAIN_CHANNELS) c.layers[PLANE]!.ph.depositCell(ch, x, y, 2);
  b.apply({ tool: "rain", layer: PLANE, points: [pt(x, y)] });
  g.freeze(1);
  assert.ok(b.undo());
  for (const ch of RAIN_CHANNELS) {
    assert.ok(g.colonies[0]!.layers[PLANE]!.ph.fields[ch]!.get(x, y) >= 2 - 1e-6, `${ch} back on the awake colony`);
    assert.equal(g.colonies[1]!.layers[PLANE]!.ph.fields[ch]!.get(x, y), 0, `${ch} not written into the sleeper`);
  }
});

test("a bounded game keeps its raid pointers at a beaten rival: they are cleared only while a colony sleeps (review of #427, S1)", () => {
  const g = game();
  run(g, 5);
  const c0 = g.colonies[0]!;
  const c1 = g.colonies[1]!;
  assert.equal(c0.raidable, true, "a rival to raid");
  assert.ok(c0.layers[PLANE]!.raidTarget, "pointing at it");
  // the rival is beaten (no ants, no young), nobody sleeps: the awake rule is off, as in every bounded game
  for (let i = 0; i < c1.n; i++) c1.alive[i] = 0;
  c1.brood.items.length = 0;
  assert.ok(Game.beaten(c1), "beaten");
  run(g, 2);
  assert.equal(c0.raidable, false, "no rival left");
  assert.ok(
    c0.layers[PLANE]!.raidTarget,
    "the pointer stays at the beaten rival: nothing sleeps, so nothing is cleared (bounded games stay bit-exact)",
  );
});
