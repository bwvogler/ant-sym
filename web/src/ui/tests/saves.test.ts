import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { test } from "node:test";
import assert from "node:assert/strict";
import { AUTOSAVE, describe, memorySaves, newestReadable, readable, record } from "../saves.ts";
import { Game, SAVE_VERSION, type GameSave } from "../../colony/game.ts";
import { generateWorld, mulberry32, OPEN_WORLD } from "../../colony/world.ts";

test("save records: a slot each, newest first, the game's own save inside, and a line to show for each", async () => {
  const store = memorySaves();
  const g = new Game(generateWorld(4, { ...OPEN_WORLD, size: { w: 120, h: 80 } }), { antCount: 30, rivalAnts: 30 }, mulberry32(4));
  for (let k = 0; k < 90; k++) g.tick(1 / 30);
  const settings = { seed: 4, ground: "open" as const, antCount: 30, rival: true, generation: 0 };
  const player = { aim: { id: "unite", text: "One colony." }, doctrines: [{ id: "forage", text: "Gather." }], menu: ["food"], hide: false, cull: false };
  await store.put({ ...record(AUTOSAVE, settings, player, g.save(), "2. a first host"), savedAt: 1000 });
  await store.put({ ...record(1, settings, player, g.save(), "3. spread"), savedAt: 2000 });
  await store.put({ ...record(AUTOSAVE, settings, player, g.save(), "3. spread"), savedAt: 3000 });
  const list = await store.list();
  assert.deepEqual(list.map((r) => r.slot), [AUTOSAVE, 1], "one per slot, newest first");
  assert.equal(list[0]!.chapter, "3. spread", "the autosave was replaced");
  assert.ok(Math.abs(list[0]!.simTime - 3) < 1e-6, "sim seconds in");
  assert.match(describe(list[0]!, 3000 + 3 * 3600_000), /^Autosave · world 4 · 0 min in · 3 h ago$/);
  const back = new Game(generateWorld(4, { ...OPEN_WORLD, size: { w: 120, h: 80 } }), { antCount: 30, rivalAnts: 30 }, mulberry32(4));
  back.load((await store.get(1))!.game);
  assert.equal(back.time, g.time);
  await store.remove(1);
  assert.equal(await store.get(1), null);
});

test("a save from another version is listed but never offered or loaded: Continue skips it (PR #42 review, B3)", () => {
  const g = new Game(generateWorld(4, { ...OPEN_WORLD, size: { w: 120, h: 80 } }), { antCount: 30, rivalAnts: 30 }, mulberry32(4));
  const settings = { seed: 4, ground: "open" as const, antCount: 30, rival: true, generation: 0 };
  const player = { aim: { id: "unite", text: "One colony." }, doctrines: [], menu: [], hide: false, cull: false };
  const ok = { ...record(1, settings, player, g.save(), "1. land"), savedAt: 1000 };
  const old = { ...record(AUTOSAVE, settings, player, { ...g.save(), version: 0 }, "3. spread"), savedAt: 2000 };
  assert.equal(readable(ok), true);
  assert.equal(readable(old), false);
  assert.equal(newestReadable([old, ok]), ok, "Continue offers the newest this version can read");
  assert.equal(newestReadable([old]), null);
  assert.throws(() => g.load(old.game), /version/, "and Game.load refuses it rather than misreading it");
});

test("a version-4 save (an autosave from before one-world saves) is still offered and loads (U4b: version 5 migrates it)", () => {
  // The colony tests' fixture, recorded on main at version 4 (colony/tests/saveFixtures.test.ts): its game is seed 5's 160 × 100 open map, 20 + 20 ants.
  const v4 = JSON.parse(gunzipSync(readFileSync(new URL("../../colony/tests/fixtures/save-v4-top.json.gz", import.meta.url))).toString("utf8")) as GameSave;
  assert.equal(v4.version, 4);
  assert.notEqual(v4.version, SAVE_VERSION);
  const settings = { seed: 5, ground: "open" as const, antCount: 20, rival: true, generation: 0 };
  const player = { aim: { id: "unite", text: "One colony." }, doctrines: [], menu: [], hide: false, cull: false };
  const auto = { ...record(AUTOSAVE, settings, player, v4, "1. land"), savedAt: 1000 };
  const newer = { ...record(1, settings, player, { ...v4, version: SAVE_VERSION + 1 }, "1. land"), savedAt: 2000 };
  assert.equal(readable(auto), true, "listed as loadable");
  assert.equal(readable(newer), false, "a newer version is not");
  assert.equal(newestReadable([newer, auto]), auto, "Continue offers it");
  const g = new Game(generateWorld(5, { ...OPEN_WORLD, size: { w: 160, h: 100 } }), { antCount: 20, rivalAnts: 20, regrow: 600 }, mulberry32(5 * 7919));
  g.load(auto.game);
  assert.equal(g.time, v4.time);
  for (let k = 0; k < 30; k++) g.tick(1 / 30);
  assert.equal(g.save().version, SAVE_VERSION, "and saves again as this version");
});
