import { test } from "node:test";
import assert from "node:assert/strict";
import {
  AWAKE_ANT_BUDGET,
  awakeCapFor,
  centreX,
  centreY,
  DEFAULT_SLEEP,
  FLIGHT_2D,
  FLIGHT_ENDLESS,
  isEndless,
} from "../../colony/index.ts";
import { sensedFor } from "../fog/sources.ts";
import { buildGame, DEFAULT_COLONY_CONTROLS, freshGame, GAME_STRAIN, landingOf } from "../useColony.ts";
import { DEFAULT_WORLD, worldFromUrl, worldOf } from "../worldKind.ts";
import type { GameSettings } from "../saves.ts";

// The switch (PRD §66 E6, `ja-qpv.5.1`, owner 2026-11-25): the page plays the endless world by default, and `?world=bounded` keeps the bounded game.

test("the page's default world is the endless plane, and `?world=bounded` is the bounded game", () => {
  assert.equal(DEFAULT_WORLD, "endless");
  assert.equal(worldFromUrl(""), "endless", "by default");
  assert.equal(worldFromUrl("?seed=3"), "endless", "other parameters change nothing");
  assert.equal(worldFromUrl("?fog=0"), "endless");
  assert.equal(worldFromUrl("?world=bounded"), "bounded");
  assert.equal(worldFromUrl("?fog=0&world=bounded"), "bounded");
  assert.equal(worldFromUrl("?world=endless"), "endless");
  assert.equal(worldFromUrl("?world=nope"), "endless", "a word it does not know is the default");
  // The controls the page starts from carry it (a node test has no location: the default).
  assert.equal(DEFAULT_COLONY_CONTROLS.world, "endless");
  assert.equal(freshGame({ ...DEFAULT_COLONY_CONTROLS, world: "bounded" }).world, "bounded", "a new game stays in its world");
});

test("a save from before the switch carries no world and is bounded", () => {
  const old: GameSettings = { species: "generic", seed: 3, antCount: 20, rival: true, generation: 0 };
  assert.equal(worldOf(old), "bounded");
  assert.equal(worldOf({ ...old, world: "endless" }), "endless");
  assert.equal(worldOf({ ...old, world: "bounded" }), "bounded");
});

const settings = (world: GameSettings["world"], antCount = 20): GameSettings => ({
  species: "generic",
  seed: 3,
  antCount,
  rival: true,
  generation: 0,
  ...(world ? { world } : {}),
});

test("buildGame makes the endless game with the awake rule on, new lines and the sites feed; and the bounded game as it always was", () => {
  const e = buildGame(settings("endless"));
  assert.ok(isEndless(e.map), "its plane has no edge");
  assert.equal(e.newLines, true, "a founding far from every line starts one");
  assert.ok(e.sleepRule, "the awake rule is on");
  assert.equal(e.sleepRule?.params.distance, 280, "W 280");
  assert.equal(e.sleepRule?.params.delay, 90, "T 90 s");
  assert.equal(e.sleepRule?.params.nestGround, 16, "nest ground 16");
  assert.ok(e.sites.length > 0, "the wild sites near the start are listed");
  assert.equal(e.colonyLimit, Infinity, "woken and founded colonies skip the limit of 6");
  for (const bounded of [settings("bounded"), settings(undefined)]) {
    const b = buildGame(bounded);
    assert.ok(!isEndless(b.map), "bounded");
    assert.equal(b.sleepRule, null, "no awake rule");
    assert.equal(b.newLines, false);
    assert.equal(b.sites.length, 0);
    assert.equal(b.colonyLimit, 6);
  }
});

test("the awake cap follows the colony's size: an awake-ant budget of 5,000, between 2 and 6", () => {
  assert.equal(AWAKE_ANT_BUDGET, 5000);
  const table: [number, number][] = [
    [1, 6],
    [50, 6],
    [400, 6],
    [600, 6], // the page's default: floor(8.3) = 8, held to 6
    [833, 6],
    [834, 5], // floor(5000 / 834) = 5
    [1000, 5],
    [1200, 4],
    [1250, 4],
    [1251, 3],
    [1666, 3],
    [1667, 2],
    [2500, 2],
    [5000, 2],
    [100000, 2],
  ];
  for (const [ants, cap] of table) assert.equal(awakeCapFor(ants), cap, `${ants} ants a colony`);
  assert.equal(awakeCapFor(400), DEFAULT_SLEEP.cap, "the largest cap is the rule's own");
  assert.equal(awakeCapFor(0), 6, "no ants is not a division by zero");
});

test("the game the page builds takes the cap its colony size gives", () => {
  assert.equal(buildGame(settings("endless", 1200)).sleepRule?.params.cap, 4);
  assert.equal(buildGame(settings("endless", 400)).sleepRule?.params.cap, 6);
  assert.equal(buildGame(settings("endless", 3000)).sleepRule?.params.cap, 2);
});

test("a queen flies 280 cells on the endless plane and 140 on a bounded one", () => {
  assert.equal(FLIGHT_ENDLESS, 280);
  assert.equal(FLIGHT_2D, 140);
  const e = buildGame(settings("endless"));
  const b = buildGame(settings("bounded"));
  assert.equal(e.flightLength, 280);
  assert.equal(b.flightLength, 140);
  const hole = (g: typeof e, k: number) => g.colonies[k]!.holeCells[g.colonies[k]!.params.nest]!;
  for (const [g, want] of [
    [e, 280],
    [b, 140],
  ] as const) {
    for (let k = 0; k < 2; k++) {
      const at = g.landing(k)!;
      const h = hole(g, k);
      const d = Math.hypot(at.x - centreX(h.px, h.py), at.y - centreY(h.py));
      assert.ok(Math.abs(d - want) < 1e-6, `landing ${d} from the hole, expected ${want}`);
    }
  }
});

test("the page's startup reads make no chunk: the fog's sight and the landing leave an endless game's ground as a game never looked at has it", () => {
  const counts = (g: ReturnType<typeof buildGame>) => {
    const p = g.world.plane as unknown as { rock: { count: number }; food: { count: number }; gen: { misses: number; prefetched: number } };
    return [p.rock.count, p.food.count, p.gen.misses, p.gen.prefetched];
  };
  const quiet = buildGame(settings("endless", 30));
  const read = buildGame(settings("endless", 30));
  assert.deepEqual(counts(read), counts(quiet), "built alike");
  assert.ok(counts(read)[0]! < 40, "a start's few chunks, not a plane");
  // What the page does once it has a game: the fog's source, a stamp at once, the landing (useColony's effect) and a stamp per step.
  const sensed = sensedFor(read, true);
  sensed.stampGame(read);
  for (const g of [read, quiet]) g.land(landingOf(g), GAME_STRAIN, { evolve: true });
  assert.deepEqual(counts(read), counts(quiet), "the landing and the first stamp");
  for (let k = 0; k < 30; k++) {
    read.tick(1 / 30);
    quiet.tick(1 / 30);
    sensed.stampGame(read);
  }
  assert.deepEqual(counts(read), counts(quiet), "and 30 steps, each stamped");
});
