import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { isEndless } from "../../colony/index.ts";
import { AUTOSAVE, memorySaves, newestReadable, readable, record, type GameSettings, type PlayerState } from "../saves.ts";
import { buildGame, GAME_STRAIN, landingOf } from "../useColony.ts";
import { worldOf } from "../worldKind.ts";

// A save carries which world it is (PRD §66 E6, `ja-qpv.5.1`): an endless game saves as deltas and loads as itself; a bounded save, with or without the
// `world` word (every save from before the switch has none), loads as bounded; no migration.

const player: PlayerState = { aim: { id: "unite", text: "One colony." }, doctrines: [], menu: [], hide: false, cull: false };
const settings = (world: GameSettings["world"]): GameSettings => ({
  species: "generic",
  seed: 4,
  antCount: 25,
  rival: true,
  generation: 0,
  ...(world ? { world } : {}),
});
const sha = (x: unknown) => createHash("sha1").update(JSON.stringify(x)).digest("hex");

/** A game as the page plays it for 4 sim seconds from Start. */
function played(s: GameSettings) {
  const g = buildGame(s);
  g.land(landingOf(g), GAME_STRAIN, { evolve: true });
  for (let k = 0; k < 120; k++) g.tick(1 / 30);
  return g;
}

for (const world of ["endless", "bounded", undefined] as const) {
  test(`a ${world ?? "no-world (old)"} save goes through the store and loads as itself`, async () => {
    const s = settings(world);
    const g = played(s);
    const store = memorySaves();
    await store.put(record(AUTOSAVE, s, player, g.save(), "1. land"));
    const r = (await store.get(AUTOSAVE))!;
    assert.equal(readable(r), true);
    assert.equal(newestReadable([r]), r);
    assert.equal(worldOf(r.settings), world ?? "bounded");
    // What the page does: build the game its settings say, pour the save in.
    const back = buildGame(r.settings);
    back.load(r.game);
    assert.equal(isEndless(back.map), world === "endless");
    assert.equal(back.time, g.time);
    assert.equal(sha(back.save()), sha(g.save()), "the same game, state for state");
    // and goes on the same
    for (let k = 0; k < 30; k++) {
      g.tick(1 / 30);
      back.tick(1 / 30);
    }
    assert.equal(sha(back.save()), sha(g.save()), "30 steps on");
    if (world === "endless") {
      assert.equal(back.sleepRule?.params.cap, g.sleepRule?.params.cap, "the awake rule came back with the save");
      assert.equal((r.game.map as { endless?: boolean }).endless, true, "the save says its plane is endless");
    } else assert.equal((r.game.map as { endless?: boolean }).endless, undefined, "a bounded save has no new key");
  });
}

test("a save of one world is refused by a game of the other, and says so", () => {
  const e = played(settings("endless")).save();
  const b = played(settings("bounded")).save();
  assert.throws(() => buildGame(settings("bounded")).load(e), /save of an endless plane/);
  assert.throws(() => buildGame(settings("endless")).load(b), /save of a bounded plane/);
});
