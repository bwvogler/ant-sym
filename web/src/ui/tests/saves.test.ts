import { test } from "node:test";
import assert from "node:assert/strict";
import { AUTOSAVE, describe, loadFailure, memorySaves, newestReadable, readable, record } from "../saves.ts";
import { Game, mulberry32, generateOneWorld } from "../../colony/index.ts";

/** A small one-world game: the page plays one world only (PRD §55), so only its saves are offered. */
const small = (seed: number) =>
  new Game(generateOneWorld(seed, { plane: { size: { w: 120, h: 80 } } }), {}, mulberry32(seed), [{ antCount: 30 }, { antCount: 30 }]);

test("save records: a slot each, newest first, the game's own save inside, and a line to show for each", async () => {
  const store = memorySaves();
  const g = small(4);
  for (let k = 0; k < 90; k++) g.tick(1 / 30);
  const settings = { species: "generic", seed: 4, antCount: 30, rival: true, generation: 0 };
  const player = {
    aim: { id: "unite", text: "One colony." },
    doctrines: [{ id: "forage", text: "Gather." }],
    menu: ["food"],
    hide: false,
    cull: false,
  };
  await store.put({ ...record(AUTOSAVE, settings, player, g.save(), "2. a first host"), savedAt: 1000 });
  await store.put({ ...record(1, settings, player, g.save(), "3. spread"), savedAt: 2000 });
  await store.put({ ...record(AUTOSAVE, settings, player, g.save(), "3. spread"), savedAt: 3000 });
  const list = await store.list();
  assert.deepEqual(
    list.map((r) => r.slot),
    [AUTOSAVE, 1],
    "one per slot, newest first",
  );
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
  const settings = { species: "generic", seed: 4, antCount: 30, rival: true, generation: 0 };
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
  // No Game can make one now: a single map's save is a one-world save without its `world` (what a record from before S2 holds).
  const { world: _world, ...single } = small(4).save();
  const settings = { species: "generic", seed: 4, antCount: 30, rival: true, generation: 0 };
  const player = { aim: { id: "unite", text: "One colony." }, doctrines: [], menu: [], hide: false, cull: false };
  const flat = { ...record(AUTOSAVE, settings, player, single as unknown as ReturnType<Game["save"]>, "1. land"), savedAt: 2000 };
  const one = { ...record(1, settings, player, small(4).save(), "1. land"), savedAt: 1000 };
  assert.equal(readable(flat), false);
  assert.throws(
    () => small(4).load(single as unknown as ReturnType<Game["save"]>),
    /one map/,
    "and Game.load refuses it rather than misreading it",
  );
  assert.equal(newestReadable([flat, one]), one, "Continue skips it for the newest one-world save");
});

test("a record of another species than the page plays is listed, not loaded", () => {
  const g = small(4);
  const settings = { species: "other", seed: 4, antCount: 30, rival: true, generation: 0 };
  const player = {
    aim: { id: "unite", text: "One colony." },
    doctrines: [{ id: "forage", text: "Gather." }],
    menu: ["food"],
    hide: false,
    cull: false,
  };
  assert.equal(readable(record(AUTOSAVE, settings, player, g.save(), "x")), false);
  assert.equal(readable(record(AUTOSAVE, { ...settings, species: "generic" }, player, g.save(), "x")), true);
  assert.equal(
    readable(record(AUTOSAVE, { ...settings, species: "desert" }, player, g.save(), "x")),
    true,
    "the desert ant is playable now",
  );
});

test("a one-axis game's save loaded into a four-axis game is refused with a message about the odour space, not the error's own words (review of #445, N3)", () => {
  const settings = { species: "generic", seed: 4, antCount: 30, rival: true, generation: 0 };
  const player = { aim: { id: "unite", text: "One colony." }, doctrines: [], menu: [], hide: false, cull: false };
  const one = new Game(generateOneWorld(4, { plane: { size: { w: 120, h: 80 } } }), { recognition: { odourAxes: 1 } }, mulberry32(4), [
    { antCount: 30 },
    { antCount: 30 },
  ]);
  const r = { ...record(1, settings, player, one.save(), "1. land"), savedAt: 1000 };
  assert.equal(readable(r), true, "the version is the same, so the save is listed and Continue offers it");
  let thrown: unknown;
  try {
    small(4).load(r.game);
  } catch (e) {
    thrown = e;
  }
  assert.ok(thrown instanceof Error, "and the load refuses it");
  const said = loadFailure(thrown);
  assert.match(said, /different odour space/);
  assert.match(said, /1 odour axis; this game's colonies smell in 4/);
  assert.doesNotMatch(said, /recognition of|Error|save:/, "none of the code's own words");
});

test("what the page says of a refused load: odour space, version, or the error's words for anything else", () => {
  assert.match(
    loadFailure(new Error("save: recognition of 4 odour axes, this game has 1")),
    /4 odour axes; this game's colonies smell in 1/,
  );
  assert.match(loadFailure(new Error("recognition: a colony with 2 odour axes in a game of 4")), /different odour space \(2 odour axes/);
  assert.match(loadFailure(new Error("save: version 12, this game reads 16")), /another version of the game/);
  assert.equal(
    loadFailure(new Error("save: something new")),
    "That save couldn't be loaded (save: something new); this is a fresh game of its world.",
  );
  assert.match(loadFailure("a string"), /\(a string\)/);
});
