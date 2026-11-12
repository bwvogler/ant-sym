import { test } from "node:test";
import assert from "node:assert/strict";
import { DOCTRINES, MODE_WORDS, policyContext } from "../../colonyBrain.ts";
import { Game } from "../../game.ts";
import { LANES, laneOfContext } from "../../lanes.ts";
import { localResponses } from "../../responses.ts";
import { GENERIC_ANT, type Species } from "../../species.ts";
import { generateWorld, mulberry32 } from "../../world.ts";
import type { LaneWords, Mode } from "../../vocab.ts";

// The descriptor's acceptance (docs/species.md step 6, ja-fnd.5.3.5): a species made only of the pieces S4.3 built, in a test file, with nothing in the
// colony edited: a lone forager that lays no trail, has a short life that ends on the plane, buries no dead, goes out without waiting for company, has
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
    stanceGate: 0,
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

/**
 * `feed`: food reaching the larder each tick. On this 120x80 world no ant, the generic ant's or the lone forager's, reaches food in 150 s (the nearest is
 * 19-29 cells from the nest), so without it the colony of a 90 s life falls at about 117 s whatever the species; the feed is the only food in the game.
 * Whether the desert ant needs a food sense of its own is for ja-rf5.3 to measure.
 */
const play = (species: Species, seconds: number, feed = 0) => {
  const g = new Game(generateWorld(1, { size: { w: 120, h: 80 } }), { antCount: 30, rival: false, species }, mulberry32(3));
  for (let k = 0; k < 30 * seconds; k++) {
    g.tick(1 / 30);
    if (feed) g.player.feed(feed);
  }
  return g;
};

test("a species of the descriptor's pieces alone plays a game: no trails laid, a short life that ends, its own Jev words", () => {
  const g = play(LONE, 150, 0.05);
  const c = g.player;
  assert.equal(g.params.species, LONE);
  // The Game hands each parameter down (the ones this plane game does not exercise by behaviour: undertakes, the bands and the raid gates are pinned in undertakes.test.ts, ageStructure.test.ts and a side-view game).
  for (const [k, v] of Object.entries(LONE.params))
    assert.equal((g.player.params as unknown as Record<string, unknown>)[k], v, `${k} reaches the colony`);
  assert.equal(g.player.responses, LONE.responses);
  assert.equal(g.outcome(), "playing");
  // The responses lay nothing and the colony follows no home trail: no pheromone of its own on the ground.
  assert.equal(c.ph.total("food"), 0, "no food trail");
  assert.equal(c.ph.total("home"), 0, "no home trail");
  // A short life that ends on the plane, replaced from the larder as food comes in.
  assert.ok(c.diedOld > 0, `${c.diedOld} died of age`);
  assert.ok(
    c.alive.some((a) => a),
    "and the colony lives on",
  );
  for (let i = 0; i < c.n; i++)
    if (c.alive[i]) assert.ok(Number.isFinite(c.lifespan[i]!) && c.lifespan[i]! <= 117, `lifespan ${c.lifespan[i]}`);
  assert.ok(c.n <= 40, "its own size");
});

test("the generic ant on the same world lays trails and does not age out: the species is what differs", () => {
  const g = play(GENERIC_ANT, 150);
  const c = g.player;
  assert.ok(c.ph.total("home") > 0, "the generic ant lays a home trail");
  assert.equal(c.diedOld, 0, "and does not age out on the plane");
});

test("its Jev words: its own context under the same lane prefix, one mode fewer, no stance lane", () => {
  const words = LONE.lanes.mode!;
  const own = LANES.mode.contextOf(DOCTRINES[0]!.text, undefined, words);
  assert.notEqual(own, policyContext(DOCTRINES[0]!.text, MODE_WORDS), "not the generic ant's cache");
  assert.equal(laneOfContext(own), "mode");
  assert.equal(LANES.mode.valid("k", "follow", words), false, "it has no follow");
  assert.equal(LANES.mode.valid("k", "explore", words), true);
  assert.equal(LONE.lanes.stance, undefined, "no raids, no stance lane");
});
