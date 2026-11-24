import assert from "node:assert/strict";
import { test } from "node:test";
import { Game } from "../../game.ts";
import { generateOneWorld, mainGround } from "../../oneWorld.ts";
import { mulberry32 } from "../../world.ts";

// The awake rule in a game (docs/endless-world.md §6, PRD §66 E4.2): who the fungus is near, freeze and thaw applied, the rule saved.

const SEED = 3;
const fresh = () => new Game(generateOneWorld(SEED), { regrow: 0, autoFound: false }, mulberry32(5), [{ antCount: 20 }, { antCount: 20 }]);
const run = (g: Game, seconds: number) => {
  for (let t = 0; t < seconds * 30; t++) g.tick(1 / 30);
};
const hole = (g: Game, k: number) => g.colonies[k]!.layers[0]!.nest;
const spore = (g: Game, k: number) => g.fungus.paint(g.colonies, hole(g, k).x, hole(g, k).y, 4, 2, 0, 0, 0);
/** a tight W and a short T, so the tests are short */
const RULE = { distance: 30, delay: 20, cap: 6 };

test("a game with no awake rule never freezes anything: the rule is opt-in", () => {
  const g = fresh();
  run(g, 60);
  assert.equal(g.isFrozen(0) || g.isFrozen(1), false);
  assert.equal(g.sleepRule, null);
  assert.equal("sleep" in g.save().private, false);
});

test("with the rule on and no fungus near, both colonies sleep after T and not before", () => {
  const g = fresh();
  g.enableSleep(RULE);
  run(g, 19);
  assert.equal(g.isFrozen(0) || g.isFrozen(1), false, "awake inside T");
  run(g, 3);
  assert.equal(g.isFrozen(0) && g.isFrozen(1), true);
});

test("the fungus at one colony keeps it awake while the other sleeps; a landing at the sleeper wakes it, and only it", () => {
  const g = fresh();
  g.enableSleep(RULE);
  spore(g, 0);
  run(g, 40);
  assert.equal(g.isFrozen(0), false, "the fungus is at colony 0");
  assert.equal(g.isFrozen(1), true, "none at colony 1");
  spore(g, 1);
  run(g, 3);
  assert.equal(g.isFrozen(1), false, "it woke when the fungus came within W");
});

test("a colony founded mid-game is in the rule: awake, and asleep T later with no fungus", () => {
  const g = fresh();
  g.enableSleep({ ...RULE, delay: 40 });
  run(g, 5);
  let s = g.settleAt({ x: hole(g, 0).x + 60, y: hole(g, 0).y }, mainGround(g.world));
  for (let d = 80; !s.ok && d < 400; d += 20) s = g.settleAt({ x: hole(g, 0).x + d, y: hole(g, 0).y + d / 2 }, mainGround(g.world));
  assert.ok(s.ok, "a founding spot");
  const k = g.addColony({
    x: hole(g, 0).x + 60,
    y: hole(g, 0).y,
    antCount: 10,
    odour: 0.5,
    spot: { cell: s.cell, end: s.end, line: s.line },
  });
  assert.equal(g.sleepRule!.saveState().lastNear.length, 3);
  run(g, 30);
  assert.equal(g.isFrozen(k), false, "awake inside its T, counted from its founding");
  run(g, 20);
  assert.equal(g.isFrozen(k), true);
});

test("the rule is saved with the game, only when there is one, and a load decides as the saved game would have", () => {
  const a = fresh();
  a.enableSleep(RULE);
  spore(a, 0);
  run(a, 25);
  const saved = JSON.parse(JSON.stringify(a.save())) as ReturnType<Game["save"]>;
  assert.ok(saved.private.sleep);
  const b = fresh();
  b.load(saved);
  assert.deepEqual(b.sleepRule!.saveState(), a.sleepRule!.saveState());
  assert.equal(b.isFrozen(0), a.isFrozen(0));
  assert.equal(b.isFrozen(1), a.isFrozen(1));
  run(a, 30);
  run(b, 30);
  assert.deepEqual(b.sleepRule!.saveState(), a.sleepRule!.saveState());
  assert.equal(b.isFrozen(1), true);
});
