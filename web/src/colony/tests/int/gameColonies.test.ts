import { test } from "node:test";
import assert from "node:assert/strict";
import { Game, gameRng, type ColonySpec } from "../../game.ts";
import { generateOneWorld } from "../../oneWorld.ts";
import { MODE_CRITERIA } from "../../colonyBrain.ts";
import { centreX, centreY } from "../../hex.ts";
import { defineSchema, legendOf } from "../../schema.ts";
import { GENERIC_ANT, type Species } from "../../species.ts";
import { MODES, type LaneWords, type Mode, type SpeciesSituation } from "../../vocab.ts";
import { smallOne, ticks } from "../builders.ts";

// The game's start colonies as a list (docs/game-colonies.md, stage A): the pair's words and an explicit list build the same game.

const ANTS = 14;
const RIVAL = 9;
const fresh = (seed = 3) => smallOne(seed);
/** Mode words over the one field `mode`: every other generic field is left out, so the species needs a local rule of its own. */
const ONLY_MODE = defineSchema<SpeciesSituation>([{ name: "mode", values: MODES }]);
const NO_FIELDS: LaneWords<Mode> = {
  legend: legendOf(ONLY_MODE, { intro: "Each key in `ants` is one worker. ", fields: [["mode", "mode is what it is doing. "]] }),
  criteria: MODE_CRITERIA,
  version: 1,
  schema: ONLY_MODE,
};

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

test("an empty list is refused", () => {
  assert.throws(() => new Game(fresh(), {}, gameRng(3), []), /at least one colony/);
});

test("each colony's situation check runs, whichever way the list is named (a species whose words drop fields needs a rule of its own)", () => {
  const bare: Species = { ...GENERIC_ANT, id: "bare", lanes: { mode: { ...NO_FIELDS } }, policy: undefined };
  assert.throws(() => new Game(fresh(), { species: bare, antCount: ANTS }, gameRng(3)), /local rule of its own/, "the pair");
  assert.throws(
    () => new Game(fresh(), { species: bare }, gameRng(3), [{ antCount: ANTS }, { antCount: RIVAL }]),
    /local rule of its own/,
    "the list",
  );
});

test("a founder's cap follows colony 0's start count in the list, not params.antCount", () => {
  const g = new Game(fresh(), {}, gameRng(3), [{ antCount: 20 }]);
  const v = g.world!.line.holes[0]!;
  const k = g.addColony({ x: centreX(v.x, v.y) - 20, y: centreY(v.y), antCount: 5, odour: 0 });
  assert.equal(g.colonies[k]?.params.maxAnts, Math.round(1.5 * 20));
});
