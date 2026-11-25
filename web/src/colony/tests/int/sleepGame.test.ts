import assert from "node:assert/strict";
import { test } from "node:test";
import { Game } from "../../game.ts";
import { STRAINS } from "../../fungus.ts";
import { cellKey } from "../../hex.ts";
import { generateOneWorld, mainGround, oneWorldOnLines } from "../../oneWorld.ts";
import { generateWorld, mulberry32 } from "../../world.ts";

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

const plane = (g: Game, k: number, x: number, y: number) => {
  const c = g.colonies[k]!;
  for (let i = 0; i < c.n; i++) if (c.alive[i]) c.putAnt(i, 0, x, y);
};

test("two colonies whose ants stand on the same ground are in contact, at any height of the map; far apart they are not", () => {
  for (const y of [30, 100, 200, 300]) {
    const g = fresh();
    plane(g, 0, 100, y);
    plane(g, 1, 100, y);
    g.tick(1 / 30);
    g.enableSleep(RULE);
    g.tick(1 / 30);
    assert.equal(g.sleepRule!.saveState().contacts.length, 1, `contact at y = ${y}`);
  }
  const g = fresh();
  plane(g, 0, 100, 300);
  plane(g, 1, 400, 60);
  g.tick(1 / 30);
  g.enableSleep(RULE);
  g.tick(1 / 30);
  assert.equal(g.sleepRule!.saveState().contacts.length, 0);
});

test("an awake host in a sleeping colony's nest ground wakes it; one merely within W outside it, or beyond W, does not; with no spores anywhere", () => {
  const trial = (dx: number) => {
    const g = fresh();
    g.freeze(1);
    g.enableSleep(RULE);
    g.tick(1 / 30);
    g.tick(1 / 30);
    assert.equal(g.isFrozen(1), true, "nothing near, and it stays asleep");
    const c = g.colonies[0]!;
    c.load[0] = 1;
    c.putAnt(0, 0, hole(g, 1).x + dx, hole(g, 1).y);
    run(g, 2);
    return g.isFrozen(1);
  };
  assert.equal(trial(5), false, "in the nest ground (16)");
  assert.equal(trial(25), true, "within W (30), outside the nest ground: a host passing wakes nothing (ja-u5s8)");
  assert.equal(trial(60), true, "beyond W");
});

test("the fungus's body within W wakes a sleeper, and an awake colony stays awake while a host is within W (the freeze side keeps hosts)", () => {
  // the body within W, no host: wakes
  const g = fresh();
  g.freeze(1);
  g.enableSleep(RULE);
  g.fungus.paint(g.colonies, hole(g, 1).x + 25, hole(g, 1).y, 3, 2, 0, 0, 0);
  run(g, 2);
  assert.equal(g.isFrozen(1), false, "the body is within W of the hole");
  // an awake colony with only a host within W (no body there) is not frozen after T
  const h = fresh();
  h.enableSleep(RULE);
  const c = h.colonies[0]!;
  c.load[0] = 1;
  const host = () => c.putAnt(0, 0, hole(h, 1).x + 25, hole(h, 1).y);
  for (let t = 0; t < 40 * 30; t++) {
    host();
    h.tick(1 / 30);
  }
  assert.equal(h.isFrozen(1), false, "a host within W of colony 1's hole keeps it awake past T (20 s)");
});

test("a colony the cap froze wakes when room comes back, if it still holds the fungus in its ants", () => {
  const g = fresh();
  g.enableSleep({ ...RULE, cap: 1 });
  for (const k of [0, 1]) {
    g.colonies[k]!.load[0] = 1;
    g.colonies[k]!.putAnt(0, 0, hole(g, k).x, hole(g, k).y);
  }
  run(g, 1);
  assert.deepEqual([g.isFrozen(0), g.isFrozen(1)], [true, false], "over the cap, colony 0 (ranked lowest) sleeps, holding its host");
  g.colonies[1]!.load[0] = 0; // colony 1 no longer carries it and freezes T later
  run(g, 15);
  assert.deepEqual([g.isFrozen(0), g.isFrozen(1)], [true, false], "no room yet");
  run(g, 10);
  assert.deepEqual([g.isFrozen(0), g.isFrozen(1)], [false, true], "colony 1 slept and the room went to colony 0");
});

const make = (n: number) =>
  new Game(
    generateOneWorld(SEED),
    { regrow: 0, autoFound: false, fungus: { hyphae: true } },
    mulberry32(5),
    Array(n).fill({ antCount: 20 }),
  );

test("a hypha alone is the fungus's body: bodyNear finds it within the radius and not beyond", () => {
  const g = make(2);
  g.land(
    0,
    STRAINS.findIndex((x) => x.id === "garden"),
    { evolve: true },
  );
  const near = hole(g, 1);
  const far = { x: near.x, y: near.y + 200 };
  const key = (p: { x: number; y: number }) => cellKey(Math.floor(p.x), Math.floor(p.y / 0.866));
  const h = g.fungus.hyphaeOn(0)!;
  h.parent.set(key(far), -1); // a hypha where no spore lies
  assert.deepEqual(g.fungus.bodyNear(0, [far, { x: far.x + 100, y: far.y }], 30), [true, false]);
  assert.equal(g.fungus.bodyOn(0), true);
});

test("a body on an awake curtain keeps its colony awake and counts as near; a sleeping curtain's body is not read", () => {
  const g = make(2);
  const n = g.colonies[0]!.nest;
  assert.equal(g.fungus.bodyOn(1), false);
  g.fungus.paint(g.colonies, n.x, n.y, 4, 2, 0, 0, 1);
  assert.equal(g.fungus.bodyOn(1), true);
  assert.deepEqual(g.fungus.bodyNear(1, [n], 30), [true]);
  g.freeze(0);
  g.freeze(1);
  assert.deepEqual(g.fungus.bodyNear(1, [n], 30), [false], "the curtain sleeps: its body wakes no one");
  const g2 = make(1);
  const n2 = g2.colonies[0]!.nest;
  g2.fungus.paint(g2.colonies, n2.x, n2.y, 4, 2, 0, 0, 1);
  g2.enableSleep(RULE);
  // the ants that pick the fungus up are put right each tick, so only the body in the curtain can keep it awake
  for (let i = 0; i < 40 * 30; i++) {
    g2.colonies[0]!.load.fill(0);
    g2.tick(1 / 30);
  }
  assert.equal(g2.isFrozen(0), false, "a body in its curtain: the colony stays awake");
});

test("the rule is asked once every `every` seconds, not every tick", () => {
  const g = fresh();
  g.enableSleep({ ...RULE, every: 2 });
  const rule = g.sleepRule!;
  const step = rule.step.bind(rule);
  let asked = 0;
  rule.step = (inp) => {
    asked++;
    return step(inp);
  };
  run(g, 10);
  assert.ok(asked >= 5 && asked <= 6, `asked ${asked} times in 10 s at every 2 s`);
});

test("a cap-frozen colony whose frozen curtain holds the fungus wakes when room comes back", () => {
  const g = new Game(
    oneWorldOnLines(SEED, generateWorld(SEED), [[0], [1]]),
    { regrow: 0, autoFound: false, fungus: { hyphae: true } },
    mulberry32(5),
    [
      { antCount: 20, line: 0 },
      { antCount: 20, line: 1 },
    ],
  );
  g.enableSleep({ ...RULE, cap: 1 });
  for (const c of g.colonies) g.fungus.paint(g.colonies, c.nest.x, c.nest.y, 4, 2, 0, 0, c.home);
  run(g, 1);
  assert.deepEqual([g.isFrozen(0), g.isFrozen(1)], [true, false], "over the cap, colony 0 sleeps with the fungus in its curtain");
  g.freeze(1); // the other goes to sleep too, so there is room
  run(g, 15);
  assert.equal(g.isFrozen(0), true, "its T has not passed");
  run(g, 10);
  assert.equal(g.isFrozen(0), false, "room, T passed, and it holds the fungus in its curtain");
});

test("contact reaches a few steps and no further: ants 3 steps apart meet, 10 steps apart do not", () => {
  for (const [dx, pairs] of [
    [3, 1],
    [10, 0],
  ] as const) {
    const g = fresh();
    plane(g, 0, 100, 200);
    plane(g, 1, 100 + dx, 200);
    g.tick(1 / 30);
    g.enableSleep(RULE);
    g.tick(1 / 30);
    assert.equal(g.sleepRule!.saveState().contacts.length, pairs, `${dx} steps apart`);
  }
});

// A colony that has died out (ja-ko75): `Colony.extinct`, and the rule counting it out of the cap and freezing it for good.

/** Kill everything of colony k: its queen, its ants, its brood and its alates (nothing is left to grow again). */
const extinguish = (g: Game, k: number) => {
  const c = g.colonies[k]!;
  c.alive.fill(0);
  if (c.queen) c.queen.alive = false;
  c.brood.items.length = 0;
  c.alates.length = 0;
};

test("Colony.extinct: no ant, no brood, no alate and no living queen; any one of them is enough to live", () => {
  const g = fresh();
  const c = g.colonies[1]!;
  assert.equal(c.extinct, false, "a fresh colony");
  extinguish(g, 1);
  assert.equal(c.extinct, true, "everything gone");
  c.queen!.alive = true;
  assert.equal(c.extinct, false, "a living queen keeps it alive though she has no ants yet");
  c.queen!.alive = false;
  c.alive[0] = 1;
  assert.equal(c.extinct, false, "one ant");
  c.alive[0] = 0;
  c.brood.add(c.layers[c.home]!.nest.x, c.layers[c.home]!.nest.y, 0);
  assert.equal(c.extinct, false, "one egg");
  c.brood.items.length = 0;
  c.alates.push({ x: 0, y: 0, t: 0, step: 1, load: 0, strain: 0, resist: 0, food: 1 });
  assert.equal(c.extinct, false, "one alate");
  // A colony with no queen at all (the bare field): extinct only once its larder is empty too, for the larder still becomes ants.
  c.alates.length = 0;
  c.queen = null;
  c.larder = 5;
  assert.equal(c.extinct, false, "a queen-less colony with food in its larder");
  c.larder = 0;
  assert.equal(c.extinct, true, "a queen-less colony with an empty larder");
});

test("a colony that has died out is frozen at once and frees its place under the cap; the living colony is not frozen for it", () => {
  // cap 1, the fungus at both holes: the rule ties on rank, so the control freezes the lower index, colony 0, by the cap
  const control = fresh();
  control.enableSleep({ ...RULE, cap: 1 });
  spore(control, 0);
  spore(control, 1);
  run(control, 5);
  assert.equal(control.isFrozen(0) && !control.isFrozen(1), true, "the control: the cap freezes colony 0 and keeps colony 1");
  const g = fresh();
  extinguish(g, 1);
  g.enableSleep({ ...RULE, cap: 1 });
  spore(g, 0);
  spore(g, 1);
  run(g, 5);
  assert.equal(g.isFrozen(1), true, "the extinct colony is frozen at once");
  assert.equal(g.isFrozen(0), false, "and colony 0 keeps the one place: the cap froze nothing living");
});

test("nothing wakes a frozen extinct colony: the fungus at its hole and a host in its nest ground leave it asleep", () => {
  const g = fresh();
  extinguish(g, 1);
  g.enableSleep(RULE);
  spore(g, 0);
  spore(g, 1);
  run(g, 5);
  assert.equal(g.isFrozen(1), true);
  spore(g, 1); // the fungus again at the dead colony's hole
  run(g, 30);
  assert.equal(g.isFrozen(1), true, "still frozen");
});
