import { test } from "node:test";
import assert from "node:assert/strict";
import { CURTAIN, LIFESPAN } from "../../colony.ts";
import { centreX, centreY } from "../../hex.ts";
import { deplete, nurseZoneProbe, onPlane, oneAssay, runAssay, runGame, withOverrides } from "../../experiment.ts";
import { Game, gameRng } from "../../game.ts";
import { localResponses } from "../../responses.ts";
import { generateOneWorld } from "../../oneWorld.ts";
import { arena, oneColony, smallOne } from "../builders.ts";

// The behaviour assays (experiment.ts), the gate: the ones today's ants pass, short, two seeds each.
// The ones they don't pass yet are `todo` in tests/slow/assays.test.ts, with the behaviour MR meant to
// make them pass (docs/PRD.md §42). Full sweeps: npm run exp.
// A3 (assaysDeplete.test.ts) and A4 (assaysAlarm.test.ts) on one world have a file each: this one took 54 to 116 s on CI of a 120 s limit.

test("runGame: the same seed gives the same numbers", () => {
  const a = runAssay(oneAssay("deplete"), 3, {}, 90).metrics;
  const b = runAssay(oneAssay("deplete"), 3, {}, 90).metrics;
  assert.deepEqual(a, b);
});

test("runGame: a game is one world, so a spec on a bare arena is refused (onPlane or oneArena make one)", () => {
  assert.throws(() => runGame({ seed: 1, seconds: 1, map: arena(), game: { antCount: 5, rival: false } }), /one world/);
  runGame(onPlane({ seed: 1, seconds: 1, map: arena(), game: { antCount: 5, rival: false } }));
});

test("runGame builds the game the page builds (one world, gameRng): same numbers after 10 s", () => {
  // runGame's default map is still the side view's until Game is one world only (S2.3d); one world is named here.
  const { game } = runGame({ seed: 4, map: (seed) => generateOneWorld(seed), seconds: 10, game: { antCount: 150, rivalAnts: 150 } });
  const page = new Game(generateOneWorld(4), { antCount: 150, rivalAnts: 150 }, gameRng(4));
  for (let k = 0; k < 300; k++) page.tick(1 / 30);
  assert.equal(page.player.stored, game.player.stored);
  assert.equal(page.rival?.stored, game.rival?.stored);
  assert.equal(page.player.decisions, game.player.decisions);
});

test("overrides: channel params merge per field and reach the pheromone fields", () => {
  const spec = withOverrides(deplete.spec(1), { colony: { deposit: 9, channels: { food: { evaporation: 0.5 } } } });
  assert.equal(spec.sides?.colony?.deposit, 9);
  const { c } = oneColony(10, { ...spec.sides?.colony });
  assert.equal(c.ph.params.food.evaporation, 0.5);
  assert.equal(c.ph.params.food.diffusion, 0.3);
  assert.equal(c.ph.params.alarm.evaporation, 0.25);
});

test("overrides: a fight override keeps the other fight params; rival params reach the second colony", () => {
  const spec = withOverrides(deplete.spec(1), { game: { fight: { rate: 3 } }, rival: { deposit: 7 } });
  assert.equal(spec.game?.fight?.rate, 3);
  assert.equal(spec.game?.fight?.alarm, 8);
  const g = new Game(smallOne(1), { antCount: 10, rivalAnts: 10 }, gameRng(1), spec.sides);
  assert.equal(g.rival?.params.deposit, 7);
  assert.equal(g.player.params.deposit, 4);
});

test("overrides: responses replace the assay's own hook by hook", () => {
  const base = { ...deplete.spec(1), sides: { responses: { ...localResponses, trailRate: () => 3 } } };
  const spec = withOverrides(base, { responses: { get: () => false } });
  const t = {
    mode: "explore",
    carrying: "none",
    porter: false,
    digging: false,
    place: "out",
    offered: "none",
    enemy: false,
    stance: "forage",
    quality: "fair",
    alarm: "none",
    odds: "none",
    returns: "none",
    raid: "strong",
    crowd: "few",
  } as const;
  assert.equal(spec.sides?.responses?.get(t), false);
  assert.equal(spec.sides?.responses?.trailRate(t), 3, "the assay's own trailRate stays");
  assert.equal(spec.sides?.responses?.carry(t), "take");
});

test("nurseZoneProbe: a young ant on the brood and a middle-aged one five cells off give a margin of 5 (ja-k4k.15.1; review of #192, N7)", () => {
  const g = new Game(smallOne(2), { antCount: 2, rival: false }, gameRng(1));
  const c = g.player;
  const royal = g.world!.curtain.chambers!.list.find((k) => k.colony === 0 && k.role === "royal")!;
  const y = royal.floorRow - 2;
  const x = royal.x0 + 1;
  c.brood.items.length = 0;
  c.brood.add(x, y, royal.id);
  // A held item is in a nurse's jaws: not where the brood lies, so the probe leaves it out.
  c.brood.add(x + 5, y, royal.id).held = 0;
  for (let i = 0; i < c.n; i++) c.alive[i] = i < 2 ? 1 : 0;
  c.age[0] = 0.02 * LIFESPAN;
  c.age[1] = 0.22 * LIFESPAN;
  c.under[0] = c.under[1] = 1;
  c.putAnt(0, CURTAIN, centreX(x, y), centreY(y));
  c.putAnt(1, CURTAIN, centreX(x + 5, y), centreY(y));
  assert.deepEqual([c.band(0), c.band(1)], [0, 1], "a young and a middle-aged ant (the test's own check)");
  const probe = nurseZoneProbe();
  g.time = 120;
  probe.tick(g, 0);
  const m = probe.summary(g);
  assert.equal(m.youngToBrood, 0);
  assert.equal(m.middleToBrood, 5);
  assert.equal(m.margin, 5);
});

test("heldProbe: a carrier that won't put its food down at home counts as carrying, though the nest resets its clock", () => {
  const run = (drop: () => boolean) =>
    runGame({
      seed: 1,
      map: smallOne,
      seconds: 200,
      game: { antCount: 60, rivalAnts: 0 },
      sides: { responses: { ...localResponses, drop } },
    }).result.metrics;
  const keeps = run(() => false);
  assert.ok(keeps["you.maxCarrying"] > 0, `maxCarrying ${keeps["you.maxCarrying"]}`);
  const local = run(() => true);
  assert.equal(local["you.maxCarrying"], 0);
});
