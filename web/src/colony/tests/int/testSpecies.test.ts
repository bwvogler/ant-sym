import { test } from "node:test";
import assert from "node:assert/strict";
import { DOCTRINES, MODE_WORDS, policyContext } from "../../colonyBrain.ts";
import { Game } from "../../game.ts";
import { LANES, laneOfContext } from "../../lanes.ts";
import { localResponses } from "../../responses.ts";
import { GENERIC_ANT, type Species } from "../../species.ts";
import { mulberry32 } from "../../world.ts";
import { smallOne } from "../builders.ts";
import type { LaneWords, Mode } from "../../vocab.ts";

// The descriptor's acceptance (docs/species.md step 6, ja-fnd.5.3.5): a species made only of the pieces S4.3 built, in a test file, with nothing in the
// colony edited: a lone forager that lays no trail, has a short life, buries no dead, goes out without waiting for company, has
// no stance lane, and asks Jev in its own words with one mode fewer. It is what the desert ant (ja-rf5) is made of, minus its senses.

const LONE_MODE: LaneWords<Mode> = {
  legend: "Each key in `ants` is the situation of one lone forager. It leaves no trail and follows none. ",
  criteria: { explore: "explore: search alone for food", return: "return: walk home", fight: "fight: attack a stranger" },
  version: 1,
};

const LONE: Species = {
  id: "lone",
  name: "Lone forager",
  params: {
    maxAnts: 40,
    speed: 9,
    homeTrail: 0,
    raidGate: 0,
    undertakes: false,
    lifespan: 90,
    youngShare: 0,
    middleShare: 0,
    mortalWithoutQueen: true,
  },
  responses: {
    ...localResponses,
    trail: () => "none",
    trailRate: () => 0,
    alarmGain: () => 0,
    raiseAlarm: () => 0,
    noEntry: () => 0,
    leave: () => "now",
  },
  lanes: { mode: LONE_MODE },
};

/** A game of the species on a small one world: its colony alone, with its queen. */
const play = (species: Species, seconds: number) => {
  const g = new Game(smallOne(3), { species }, mulberry32(3), [{ antCount: 30 }]);
  for (let k = 0; k < 30 * seconds; k++) g.tick(1 / 30);
  return g;
};

/** What the colony laid of a channel, on both its layers. */
const laid = (g: Game, channel: "home" | "food") => g.colonies[0]!.layers.reduce((sum, l) => sum + l.ph.total(channel), 0);

test("a species of the descriptor's pieces alone plays a game: no trails laid, a short life that ends, its own Jev words", () => {
  const born = new Game(smallOne(3), { species: LONE }, mulberry32(3), [{ antCount: 30 }]).colonies[0]!;
  for (let i = 0; i < born.n; i++)
    if (born.alive[i]) assert.ok(Number.isFinite(born.lifespan[i]!) && born.lifespan[i]! <= 117, `lifespan ${born.lifespan[i]}`);
  // 90 s: with youngShare 0 nothing nurses, so none is born, and the colony falls at about 120 s (S2.3c).
  const g = play(LONE, 90);
  assert.equal(g.outcome(), "playing", "still playing at 90 s");
  const c = g.colonies[0]!;
  assert.equal(g.params.species, LONE);
  // The Game hands each parameter down (the ones this game does not exercise by behaviour: undertakes, the bands and the raid gates are pinned in undertakes.test.ts and ageStructure.test.ts).
  for (const [k, v] of Object.entries(LONE.params))
    assert.equal((g.colonies[0]!.params as unknown as Record<string, unknown>)[k], v, `${k} reaches the colony`);
  assert.equal(g.colonies[0]!.responses, LONE.responses);
  // The responses lay nothing and the colony follows no home trail: no pheromone of its own on either layer.
  assert.equal(laid(g, "food"), 0, "no food trail");
  assert.equal(laid(g, "home"), 0, "no home trail");
  // A short life that ends.
  assert.ok(c.diedOld > 0, `${c.diedOld} died of age`);
  assert.ok(c.n <= 40, "its own size");
});

test("the generic ant on the same world lays trails: the species is what differs", () => {
  const g = play(GENERIC_ANT, 150);
  assert.ok(laid(g, "home") > 0, "the generic ant lays a home trail");
  assert.ok(laid(g, "food") > 0, "and a food trail");
});

test("its Jev words: its own context under the same lane prefix, one mode fewer", () => {
  const words = LONE.lanes.mode!;
  const own = LANES.mode.contextOf(DOCTRINES[0]!.text, undefined, words);
  assert.notEqual(own, policyContext(DOCTRINES[0]!.text, MODE_WORDS), "not the generic ant's cache");
  assert.equal(laneOfContext(own), "mode");
  assert.equal(LANES.mode.valid("k", "follow", words), false, "it has no follow");
  assert.equal(LANES.mode.valid("k", "explore", words), true);
});
