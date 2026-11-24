import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { saveEndless } from "../../endlessMap.ts";
import { generateEndlessWorld, type EndlessWorld } from "../../endlessWorld.ts";
import { Game, gameRng, GAME_REGROW, type GameSave } from "../../game.ts";
import { STRAINS } from "../../fungus.ts";
import { generateOneWorld } from "../../oneWorld.ts";
import { setRock, ROCK, OPEN, rockAt } from "../../world.ts";
import { DT, smallOne } from "../builders.ts";

// Saves of an endless game (PRD §66 E6.0.3): the seed, the foundings (the woken sites among them), each colony's state and the changed chunks as deltas;
// a load into a game built afresh plays on bit for bit as the saved one.

const SEED = 3;
const make = () => {
  const g = new Game(generateEndlessWorld(SEED), { regrow: GAME_REGROW, autoFound: false }, gameRng(SEED), [
    { antCount: 40 },
    { antCount: 40 },
  ]);
  g.enableSleep();
  return g;
};
const hash = (v: unknown) => createHash("sha1").update(JSON.stringify(v)).digest("hex");
const colonies = (g: Game) => hash(g.colonies.map((c) => c.saveState()));
const chunks = (g: Game) => hash(saveEndless((g.world as EndlessWorld).plane));
const run = (g: Game, s: number) => {
  for (let k = 0; k < Math.round(s / DT); k++) g.tick(DT);
};

test("a mid-game save of an endless game, with a woken site and a changed rock chunk, loads into a fresh game that then plays identically", () => {
  const a = make();
  a.land(
    0,
    STRAINS.findIndex((s) => s.id === "garden"),
    { evolve: true },
  );
  run(a, 30);
  const s = a.sites.find((o) => o.rx !== undefined)!;
  a.paintSpores(s.x - 100, s.y, 6, 5, 0, 1);
  run(a, 50);
  assert.ok(
    a.founded.some((f) => f.wild),
    "a wild site woke",
  );
  // a changed rock chunk, far from the rest: a wall where the plane has none (the delta is the cell that differs from what the plane generates)
  const plane = (a.world as EndlessWorld).plane;
  let wx = 52000;
  while (rockAt(plane, wx, -52000) !== OPEN) wx++;
  setRock(plane, wx, -52000, ROCK);
  const save = JSON.parse(JSON.stringify(a.save())) as GameSave;
  const m = save.map as { endless?: boolean; rock: { $chunks: unknown[] }; food: { $chunks: unknown[] }; size?: unknown };
  assert.equal(m.endless, true);
  assert.equal(m.size, undefined, "no plane size is saved");
  assert.equal(m.rock.$chunks.length, 1, "the rock delta is the one chunk that was changed, not the chunks generated");
  assert.ok(
    m.food.$chunks.length > 0 && m.food.$chunks.length < plane.food.count,
    "the food delta is the chunks food was taken from, not every chunk",
  );

  const b = make();
  b.load(save);
  assert.equal(b.colonies.length, a.colonies.length);
  assert.equal(colonies(a), colonies(b), "every colony as saved");
  assert.equal(chunks(a), chunks(b), "the changed chunks as saved");
  assert.equal(rockAt((b.world as EndlessWorld).plane, wx, -52000), ROCK, "the changed rock is back");
  run(a, 30);
  run(b, 30);
  assert.equal(colonies(a), colonies(b), "30 s on, every colony is as the unbroken game's");
  assert.equal(chunks(a), chunks(b), "and so are the changed chunks");
  assert.equal(a.sites.length, b.sites.length);
});

test("a load refuses a save of the other kind of plane, and a bounded save of another size, as before", () => {
  const endless = make();
  const saved = JSON.parse(JSON.stringify(endless.save())) as GameSave;
  const bounded = new Game(smallOne(7), {}, gameRng(7), [{ antCount: 10 }, { antCount: 10 }]);
  assert.throws(() => bounded.load(saved), /endless plane/);
  assert.throws(() => endless.load(JSON.parse(JSON.stringify(bounded.save())) as GameSave), /bounded plane/);
  const other = new Game(generateOneWorld(7, { plane: { size: { w: 200, h: 100 } } }), {}, gameRng(7), [
    { antCount: 10 },
    { antCount: 10 },
  ]);
  assert.throws(() => bounded.load(JSON.parse(JSON.stringify(other.save())) as GameSave), /another world/);
  // an endless save of another seed is refused too
  const elsewhere = new Game(generateEndlessWorld(SEED + 1), {}, gameRng(SEED + 1), [{ antCount: 10 }, { antCount: 10 }]);
  assert.throws(() => elsewhere.load(saved), /another world/);
});
