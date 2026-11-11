import { test } from "node:test";
import assert from "node:assert/strict";
import { AUTOSAVE, describe, memorySaves, newestReadable, readable, record } from "../saves.ts";
import { Game, generateWorld, mulberry32, OPEN_WORLD, generateOneWorld } from "../../colony/index.ts";

/** A small one-world game: the page plays one world only (PRD §55), so only its saves are offered. */
const small = (seed: number) => new Game(generateOneWorld(seed, { plane: { size: { w: 120, h: 80 } } }), { antCount: 30, rivalAnts: 30 }, mulberry32(seed));

test("save records: a slot each, newest first, the game's own save inside, and a line to show for each", async () => {
  const store = memorySaves();
  const g = small(4);
  for (let k = 0; k < 90; k++) g.tick(1 / 30);
  const settings = { seed: 4, antCount: 30, rival: true, generation: 0 };
  const player = { aim: { id: "unite", text: "One colony." }, doctrines: [{ id: "forage", text: "Gather." }], menu: ["food"], hide: false, cull: false };
  await store.put({ ...record(AUTOSAVE, settings, player, g.save(), "2. a first host"), savedAt: 1000 });
  await store.put({ ...record(1, settings, player, g.save(), "3. spread"), savedAt: 2000 });
  await store.put({ ...record(AUTOSAVE, settings, player, g.save(), "3. spread"), savedAt: 3000 });
  const list = await store.list();
  assert.deepEqual(list.map((r) => r.slot), [AUTOSAVE, 1], "one per slot, newest first");
  assert.equal(list[0]!.chapter, "3. spread", "the autosave was replaced");
  assert.ok(Math.abs(list[0]!.simTime - 3) < 1e-6, "sim seconds in");
  assert.match(describe(list[0]!, 3000 + 3 * 3600_000), /^Autosave · world 4 · 0 min in · 3 h ago$/);
  const back = small(4);
  back.load((await store.get(1))!.game);
  assert.equal(back.time, g.time);
  await store.remove(1);
  assert.equal(await store.get(1), null);
});

test("a save from another version is listed but never offered or loaded: Continue skips it (PR #42 review, B3)", () => {
  const g = small(4);
  const settings = { seed: 4, antCount: 30, rival: true, generation: 0 };
  const player = { aim: { id: "unite", text: "One colony." }, doctrines: [], menu: [], hide: false, cull: false };
  const ok = { ...record(1, settings, player, g.save(), "1. land"), savedAt: 1000 };
  const old = { ...record(AUTOSAVE, settings, player, { ...g.save(), version: 0 }, "3. spread"), savedAt: 2000 };
  assert.equal(readable(ok), true);
  assert.equal(readable(old), false);
  assert.equal(newestReadable([old, ok]), ok, "Continue offers the newest this version can read");
  assert.equal(newestReadable([old]), null);
  assert.throws(() => g.load(old.game), /version/, "and Game.load refuses it rather than misreading it");
});

test("a save from a single map (the side view or the open surface) is listed but never offered: the page plays one world (PRD §55)", () => {
  const g = new Game(generateWorld(4, { ...OPEN_WORLD, size: { w: 120, h: 80 } }), { antCount: 30, rivalAnts: 30 }, mulberry32(4));
  const settings = { seed: 4, antCount: 30, rival: true, generation: 0 };
  const player = { aim: { id: "unite", text: "One colony." }, doctrines: [], menu: [], hide: false, cull: false };
  const flat = { ...record(AUTOSAVE, settings, player, g.save(), "1. land"), savedAt: 2000 };
  const one = { ...record(1, settings, player, small(4).save(), "1. land"), savedAt: 1000 };
  assert.equal(readable(flat), false);
  assert.equal(newestReadable([flat, one]), one, "Continue skips it for the newest one-world save");
});
