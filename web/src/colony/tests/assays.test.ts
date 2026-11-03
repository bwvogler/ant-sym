import { test } from "node:test";
import assert from "node:assert/strict";
import { Colony } from "../colony.ts";
import { alarm, deplete, runAssay, runGame, withOverrides } from "../experiment.ts";
import { Game, gameRng } from "../game.ts";
import { localResponses } from "../responses.ts";
import { generateSideWorld, generateWorld, OPEN_WORLD } from "../world.ts";

// The behaviour assays (experiment.ts), the gate: the ones today's ants pass, short, two seeds each.
// The ones they don't pass yet are `todo` in tests/slow/assays.test.ts, with the behaviour MR meant to
// make them pass (docs/PRD.md §42). Full sweeps: npm run exp.

test("runGame: the same seed gives the same numbers", () => {
  const a = runAssay(deplete, 3, {}, 90).metrics;
  const b = runAssay(deplete, 3, {}, 90).metrics;
  assert.deepEqual(a, b);
});

test("runGame builds the game the page builds (side view, gameRng): same numbers after 10 s", () => {
  const { game } = runGame({ seed: 4, seconds: 10, game: { antCount: 150, rivalAnts: 150 } });
  const page = new Game(generateSideWorld(4), { antCount: 150, rivalAnts: 150 }, gameRng(4));
  for (let k = 0; k < 300; k++) page.tick(1 / 30);
  assert.equal(page.player.stored, game.player.stored);
  assert.equal(page.rival?.stored, game.rival?.stored);
  assert.equal(page.player.decisions, game.player.decisions);
});

test("overrides: channel params merge per field and reach the pheromone fields", () => {
  const spec = withOverrides(deplete.spec(1), { colony: { deposit: 9, channels: { food: { evaporation: 0.5 } } } });
  assert.equal(spec.sides?.colony?.deposit, 9);
  const c = new Colony(generateWorld(1, OPEN_WORLD), { antCount: 10, ...spec.sides?.colony });
  assert.equal(c.ph.params.food.evaporation, 0.5);
  assert.equal(c.ph.params.food.diffusion, 0.3);
  assert.equal(c.ph.params.alarm.evaporation, 0.25);
});

test("overrides: a fight override keeps the other fight params; rival params reach the second colony", () => {
  const spec = withOverrides(deplete.spec(1), { game: { fight: { rate: 3 } }, rival: { deposit: 7 } });
  assert.equal(spec.game?.fight?.rate, 3);
  assert.equal(spec.game?.fight?.alarm, 8);
  const g = new Game(generateWorld(1, OPEN_WORLD), { antCount: 10, rivalAnts: 10 }, gameRng(1), spec.sides);
  assert.equal(g.rival?.params.deposit, 7);
  assert.equal(g.player.params.deposit, 4);
});

test("overrides: responses replace the assay's own hook by hook", () => {
  const base = { ...deplete.spec(1), sides: { responses: { ...localResponses, trailRate: () => 3 } } };
  const spec = withOverrides(base, { responses: { get: () => false } });
  const t = { mode: "explore", carrying: "none", porter: false, digging: false, place: "out", offered: "none", enemy: false, stance: "forage" } as const;
  assert.equal(spec.sides?.responses?.get(t), false);
  assert.equal(spec.sides?.responses?.trailRate(t), 3, "the assay's own trailRate stays");
  assert.equal(spec.sides?.responses?.carry(t), "return");
});

for (const seed of [1, 2]) {
  test(`A3 depletion passes (seed ${seed}): traffic leaves an emptied patch within 60 s`, () => {
    const m = runAssay(deplete, seed).metrics;
    assert.equal(m.pass, 1, `clearAfter ${m.clearAfter}`);
  });

  test(`A4 alarm passes (seed ${seed}): foragers scatter, then the trail recovers`, () => {
    const m = runAssay(alarm, seed).metrics;
    assert.equal(m.pass, 1, `scatter ${m.scatter}, recoverAfter ${m.recoverAfter}`);
  });
}

test("heldProbe: a carrier that won't put its food down at home counts as carrying, though the nest resets its clock", () => {
  const top = (seed: number) => generateWorld(seed, { ...OPEN_WORLD, size: { w: 80, h: 50 } });
  const run = (drop: () => boolean) => runGame({ seed: 1, map: top, seconds: 200, game: { antCount: 60, rivalAnts: 0 }, sides: { responses: { ...localResponses, drop } } }).result.metrics;
  const keeps = run(() => false);
  assert.ok((keeps["you.maxCarrying"] as number) > 0, `maxCarrying ${keeps["you.maxCarrying"]}`);
  const local = run(() => true);
  assert.equal(local["you.maxCarrying"], 0);
});
