import { test } from "node:test";
import assert from "node:assert/strict";
import { Game } from "../../game.ts";
import { localPolicy } from "../../colony.ts";
import { localResponses } from "../../responses.ts";
import { GENERIC_ANT, speciesFollows, type Species } from "../../species.ts";
import type { LaneWords, Mode, Policy } from "../../vocab.ts";
import { smallOne } from "../builders.ts";
import { generateSideWorld, mulberry32 } from "../../world.ts";

// ja-fnd.5.9: a species' mode set and local rule are its own. Words that drop `follow` mean its ants never enter FOLLOW (ColonyParams.follows,
// derived by the Game), and the Game hands its colonies the species' local rule. Before this, a no-follow species spent thousands of ant-ticks
// in FOLLOW on one world (measured 2026-11-13: 5,885 in 120 s on smallOne(7), seed 1), from a load put down and from the generic local rule.

const NO_FOLLOW: LaneWords<Mode> = { legend: "lone foragers", criteria: { explore: "e", return: "r", fight: "f" }, version: 1 };
/** The generic rule without follow: what a no-follow species stands in with. */
const lonePolicy: Policy = (s) => {
  const m = localPolicy(s);
  return m === "follow" ? "explore" : m;
};
const LONE: Species = { id: "lone", name: "Lone", params: {}, responses: localResponses, lanes: { mode: NO_FOLLOW }, policy: lonePolicy };

/** Ant-ticks spent in FOLLOW over `seconds` of a one-world game. */
function followTicks(species: Species, seconds: number): number {
  const g = new Game(smallOne(7), { antCount: 60, rival: false, species }, mulberry32(1));
  let f = 0;
  for (let k = 0; k < 30 * seconds; k++) {
    g.tick(1 / 30);
    for (const c of g.colonies) for (let i = 0; i < c.n; i++) if (c.alive[i] && c.mode[i] === 1) f++;
  }
  return f;
}

test("whether a species follows comes from its mode words", () => {
  assert.equal(speciesFollows(GENERIC_ANT), true);
  assert.equal(speciesFollows(LONE), false);
  assert.equal(speciesFollows({ ...LONE, lanes: {} }), true, "no words of its own: the generic ant's modes");
});

test("the Game hands its colonies the species' local rule and its mode set; an explicit param still wins", () => {
  const g = new Game(smallOne(7), { antCount: 10, species: LONE }, () => 0.5);
  for (const c of g.colonies) {
    assert.equal(c.policy, lonePolicy);
    assert.equal(c.params.follows, false);
  }
  const generic = new Game(smallOne(7), { antCount: 10 }, () => 0.5);
  assert.equal(generic.player.policy, localPolicy);
  assert.equal(generic.player.params.follows, true);
  const forced = new Game(smallOne(7), { antCount: 10, species: { ...LONE, params: { follows: true } } }, () => 0.5);
  assert.equal(forced.player.params.follows, true, "the species' own params can set it");
});

test("a species whose words drop follow never enters FOLLOW, where the generic ant does on the same world", () => {
  assert.ok(followTicks(GENERIC_ANT, 40) > 0, "the world makes followers of the generic ant");
  assert.equal(followTicks(LONE, 40), 0);
  // the guard alone, under the generic local rule: a no-follow species is held to its modes whatever its policy offers
  assert.equal(followTicks({ ...LONE, policy: undefined }, 40), 0);
});

test("a no-follow species is never asked about a situation in which it is following", () => {
  // An ant that puts its load down heads out exploring, not following: the situation its policy (and Jev) is then asked has no mode its words lack.
  const asked = new Set<string>();
  const spy: Policy = (s) => (asked.add(s.mode), lonePolicy(s));
  followTicks({ ...LONE, policy: spy }, 40);
  assert.ok(asked.has("explore"), `it was asked (${[...asked]})`);
  assert.ok(!asked.has("follow"), "never in mode follow");
});

test("a colony founded mid-game takes the species' rule and mode set too (review of #121, S1)", () => {
  const g = new Game(generateSideWorld(2), { antCount: 60, rivalAnts: 60, species: LONE }, mulberry32(11));
  const a = g.colonies[0]!.nest.entrance!;
  const b = g.colonies[1]!.nest.entrance!;
  const k = g.addColony({ x: a.x + 0.25 * (b.x - a.x), y: a.y, antCount: 20, odour: 0 });
  const c = g.colonies[k]!;
  assert.equal(c.policy, lonePolicy);
  assert.equal(c.params.follows, false);
});

test("a returner leaves as an explorer, not a follower, even where the species' arrive asks for followers (review of #121, N1)", () => {
  // arrive: "follow" makes the generic ant's returners leave as followers; a no-follow species' leave as explorers (the guards at both leaving points).
  assert.ok(followTicks({ ...GENERIC_ANT, params: { arrive: "follow" } }, 40) > 0, "the generic ant follows under arrive: follow");
  assert.equal(followTicks({ ...LONE, policy: undefined, params: { arrive: "follow" } }, 40), 0);
  const asked = new Set<string>();
  const spy: Policy = (s) => (asked.add(s.mode), lonePolicy(s));
  followTicks({ ...LONE, policy: spy, params: { arrive: "follow" } }, 40);
  assert.ok(asked.size > 0 && !asked.has("follow"), `never asked in mode follow (${[...asked]})`);
});
