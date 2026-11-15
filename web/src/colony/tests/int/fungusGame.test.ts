import { test } from "node:test";
import assert from "node:assert/strict";
import { CURTAIN } from "../../colony.ts";
import { STRAINS } from "../../fungus.ts";
import { Game } from "../../game.ts";
import { mulberry32 } from "../../world.ts";
import { smallOne } from "../builders.ts";

// The fungus in whole games on a small one world (split from fungus.test.ts, S2.3c, to keep each under the int tier's 12 s).

const LOCKPICK = STRAINS.findIndex((s) => s.id === "lockpick");
const BLOOM = STRAINS.findIndex((s) => s.id === "bloom");

test("a game with no spores runs as before: the fungus stays idle and draws no random numbers", () => {
  const ticks = (paint: boolean): number[] => {
    const g = new Game(smallOne(4), { antCount: 100, rivalAnts: 100 }, mulberry32(77));
    if (paint) g.paintSpores(-50, -50, 2, 3, 0.3, BLOOM); // off the map: paints nothing, infects nobody
    for (let k = 0; k < 30 * 20; k++) g.tick(1 / 30);
    return [g.player.stored, g.rival!.stored, g.player.losses, g.rival!.losses, g.player.x[0]];
  };
  const quiet = ticks(false);
  assert.deepEqual(ticks(true), quiet);
});

test("in a real game, the dial shows: Lockpick holds its load unseen, Bloom is groomed down and leaves the colony resistant", () => {
  const after = (strain: number) => {
    const g = new Game(smallOne(1), { antCount: 200, rivalAnts: 200 }, mulberry32(5));
    const nest = g.player.nest;
    g.paintSpores(nest.x, nest.y, nest.r + 2, 3, 0.3, strain, CURTAIN); // round the royal chamber
    assert.ok(g.fungus.census(g.player).infected > 0);
    for (let k = 0; k < 30 * 45; k++) g.tick(1 / 30);
    const c = g.fungus.census(g.player);
    assert.equal(c.living, g.player.population);
    return c;
  };
  const lock = after(LOCKPICK);
  const bloom = after(BLOOM);
  assert.ok(lock.meanLoad > bloom.meanLoad + 0.2, `load: Lockpick ${lock.meanLoad.toFixed(2)} vs Bloom ${bloom.meanLoad.toFixed(2)}`);
  assert.ok(
    bloom.meanResist > lock.meanResist * 2,
    `resistance: Bloom ${bloom.meanResist.toFixed(3)} vs Lockpick ${lock.meanResist.toFixed(3)}`,
  );
});
