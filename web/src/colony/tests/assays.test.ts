import { test } from "node:test";
import assert from "node:assert/strict";
import { Colony } from "../colony.ts";
import { alarm, bridge, deplete, regulate, runAssay, runGame, twin, withOverrides } from "../experiment.ts";
import { Game, gameRng } from "../game.ts";
import { generateWorld } from "../world.ts";

// The behaviour assays, short: the ones today's ants pass are a regression
// gate; the ones they don't yet are `todo` (they run, their pass mark is the
// phase's goal, docs/PRD.md §14). Full sweeps: scripts/experiment.mjs.

test("runGame: the same seed gives the same numbers", () => {
  const a = runAssay(deplete, 3, {}, 90).metrics;
  const b = runAssay(deplete, 3, {}, 90).metrics;
  assert.deepEqual(a, b);
});

test("runGame seeds the game like the page (gameRng): same food home after 20 s", () => {
  const { game } = runGame({ seed: 4, seconds: 20, game: { antCount: 200, rivalAnts: 200 } });
  const page = new Game(generateWorld(4), { antCount: 200, rivalAnts: 200 }, gameRng(4));
  for (let k = 0; k < 600; k++) page.tick(1 / 30);
  assert.equal(page.player.stored, game.player.stored);
  assert.equal(page.rival?.stored, game.rival?.stored);
});

test("overrides: channel params merge per field and reach the pheromone fields", () => {
  const spec = withOverrides(deplete.spec(1), { colony: { deposit: 9, channels: { food: { evaporation: 0.5 } } } });
  assert.equal(spec.sides?.colony?.deposit, 9);
  const c = new Colony(generateWorld(1), { antCount: 10, ...spec.sides?.colony });
  assert.equal(c.ph.params.food.evaporation, 0.5);
  assert.equal(c.ph.params.food.diffusion, 0.3);
  assert.equal(c.ph.params.alarm.evaporation, 0.25);
});

test("overrides: a fight override keeps the other fight params", () => {
  const spec = withOverrides(deplete.spec(1), { game: { fight: { rate: 3 } } });
  assert.equal(spec.game?.fight?.rate, 3);
  assert.equal(spec.game?.fight?.alarm, 8);
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

test("A1 double bridge: ≥ 80 % on the short branch", { todo: "Phase 3: trail marking as a response" }, () => {
  const m = runAssay(bridge, 1).metrics;
  assert.ok(Number.isFinite(m.shortShare));
  assert.equal(m.pass, 1, `shortShare ${m.shortShare}`);
});

test("A2a two equal sources: the colony concentrates on one", { todo: "Phase 3: trail marking as a response" }, () => {
  const m = runAssay(twin, 1).metrics;
  assert.ok(Number.isFinite(m.majorityShare));
  assert.equal(m.pass, 1, `majorityShare ${m.majorityShare}`);
});

test("A5 regulation: foragers stay home without food", { todo: "Phase 5: forager activation from returns" }, () => {
  const m = runAssay(regulate, 1).metrics;
  assert.ok(Number.isFinite(m.outsideBefore));
  assert.equal(m.pass, 1, `outside before ${m.outsideBefore}, after ${m.outsideAfter}`);
});
