import { test } from "node:test";
import assert from "node:assert/strict";
import { Game, gameRng, type ColonySpec } from "../../game.ts";
import { generateOneWorld } from "../../oneWorld.ts";
import { smallOne, ticks } from "../builders.ts";

// The game's start colonies as a list (docs/game-colonies.md, stage A): the pair's words and an explicit list build the same game.

const ANTS = 14;
const RIVAL = 9;
const fresh = (seed = 3) => smallOne(seed);

test("the pair's words and the list that names the same colonies build equal games, and play alike", () => {
  const pair = new Game(fresh(), { antCount: ANTS, rivalAnts: RIVAL, rival: true }, gameRng(3), {
    colony: { odour: 0.1 },
    rival: { odour: 0.9 },
  });
  const list = new Game(fresh(), { antCount: ANTS, rivalAnts: RIVAL, rival: true }, gameRng(3), [
    { antCount: ANTS, colony: { odour: 0.1 } },
    { antCount: RIVAL, nest: 1, colony: { odour: 0.9 } },
  ]);
  assert.deepEqual(list.save(), pair.save());
  ticks(pair, 300);
  ticks(list, 300);
  assert.deepEqual(list.save(), pair.save(), "300 ticks on");
});

test("the default is a pair, as it was; solo is a list of one", () => {
  const dflt = new Game(fresh(), { antCount: ANTS, rivalAnts: RIVAL }, gameRng(3));
  assert.equal(dflt.colonies.length, 2);
  assert.deepEqual(
    dflt.colonies.map((c) => [c.params.nest, c.params.odour, c.population]),
    [
      [0, 0, ANTS],
      [1, 1, RIVAL],
    ],
  );
  const solo = new Game(fresh(), { antCount: ANTS }, gameRng(3), [{ antCount: ANTS }]);
  assert.equal(solo.colonies.length, 1);
  assert.equal(solo.colonies[0]?.params.odour, 0, "one colony's odour is 0");
});

test("a rival on a one-nest world is silently not built; an explicit list longer than the nests throws", () => {
  const one = generateOneWorld(2, { plane: { size: { w: 160, h: 100 }, nestCount: 1 } });
  assert.equal(new Game(one, { antCount: ANTS, rival: true }, gameRng(2)).colonies.length, 1);
  const two: ColonySpec[] = [{ antCount: ANTS }, { antCount: RIVAL }];
  const again = generateOneWorld(2, { plane: { size: { w: 160, h: 100 }, nestCount: 1 } });
  assert.throws(() => new Game(again, { antCount: ANTS }, gameRng(2), two), /start nests/);
});

test("precedence: a spec's nest and odour, then its colony overrides; zero ants is buildable", () => {
  const g = new Game(fresh(), {}, gameRng(3), [
    { antCount: ANTS, odour: 0.25, colony: { odour: 0.4 } },
    { antCount: 0, odour: 0.5 },
  ]);
  assert.equal(g.colonies[0]?.params.odour, 0.4, "colony overrides the spec's odour");
  assert.equal(g.colonies[1]?.params.odour, 0.5);
  assert.equal(g.colonies[1]?.population, 0, "a colony of no ants is built");
});

test("the pair keeps its second colony's nest at 1 whatever Sides.rival says (the list has no such rule)", () => {
  const g = new Game(fresh(), { antCount: ANTS, rivalAnts: RIVAL }, gameRng(3), { rival: { nest: 0 } });
  assert.equal(g.colonies[1]?.params.nest, 1);
});
