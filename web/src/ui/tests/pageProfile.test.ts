import assert from "node:assert/strict";
import { test } from "node:test";
import { activeEngineProfile, EngineProfile, profileSteering, withEngineProfile } from "../../colony/index.ts";
import { PageProfile } from "../pageProfile.ts";

const scene = { seed: 7, view: "below", requestedSpeed: 4, startingAntsPerColony: 600, clock: "independent" };

test("the game capture separates tick, subscribers, map draw, and frame gaps", () => {
  const profile = new PageProfile();
  profile.start(scene, 500);
  profile.tick(1 / 30, 9, 2);
  profile.draw(3);
  profile.frame(510, 520);
  profile.tick(1 / 30, 11, 4);
  profile.draw(5);
  profile.frame(10_498, 10_499);
  assert.equal(profile.getSnapshot().running, true);
  profile.frame(10_510, 10_520);
  const { report, running } = profile.getSnapshot();
  assert.equal(running, false);
  assert.equal(report?.wallSeconds, 10.02);
  assert.equal(report?.pace, 2 / 30 / 10.02);
  assert.deepEqual(report?.tick, { count: 2, meanMs: 10, p95Ms: 11 });
  assert.deepEqual(report?.afterTick, { count: 2, meanMs: 3, p95Ms: 4 });
  assert.deepEqual(report?.mapDraw, { count: 2, meanMs: 4, p95Ms: 5 });
  assert.deepEqual(report?.frameGap, { count: 2, meanMs: 5000, p95Ms: 9988 });
});

test("a canceled capture leaves no measurements in the next run", () => {
  const profile = new PageProfile();
  profile.start(scene, 0);
  profile.tick(1 / 30, 9, 5);
  profile.cancel();
  assert.deepEqual(profile.getSnapshot(), { running: false, report: null });
  profile.start(scene, 500);
  profile.frame(10_500, 10_500);
  assert.equal(profile.getSnapshot().report?.tick, null);
});

test("engine stages reconcile to tick time and policy samples remain nested", () => {
  const profile = new PageProfile();
  profile.start(scene, 0);
  withEngineProfile(profile.engine, () => {
    assert.equal(activeEngineProfile, profile.engine);
    assert.equal(profile.engine.sampleAnt(0), false);
    assert.equal(profile.engine.sampleAnt(1), true);
    profile.engine.antStage("sense", 0.125);
    profile.engine.antStage("decide", 0.125);
    profile.engine.antStage("steer", 0.0625);
    profile.engine.policy(0.03125);
    profile.engine.ants(5);
    profile.engine.colony(2);
    profile.engine.pheromones(1);
    profile.engine.occupancy(0.5);
    profile.engine.fungus(0.5);
  });
  assert.equal(activeEngineProfile, null);
  assert.equal(profile.engine.sampledAnt, false);
  profile.engine.endTick(10);
  profile.tick(1 / 30, 10, 0);
  profile.frame(10_000, 10_000);
  const engine = profile.getSnapshot().report?.engine;
  assert.equal(engine?.ticks, 1);
  assert.deepEqual(engine?.meanMsPerTick, { ants: 5, colonyMaintenance: 2, pheromones: 1, occupancyAndCombat: 0.5, fungus: 0.5, other: 1 });
  assert.equal(engine?.sampledAnts, 1);
  assert.equal(engine?.sampledPolicyLookups, 1);
  assert.equal(engine?.estimatedAntStageMsPerTick.stanceAndDecisions, 2);
  assert.equal(engine?.estimatedAntStageMsPerTick.policyLookupWithinStages, 0.5);
});

test("steering helper timings are exclusive inside homing and sum to the steering estimate", () => {
  let now = 0;
  const profile = new EngineProfile(() => now);
  const probe = profileSteering("terrainChecks", () => {
    now += 2;
    return true;
  });
  withEngineProfile(profile, () => {
    assert.equal(profile.sampleAnt(1), true);
    const start = profile.steeringClock();
    now += 3;
    assert.equal(probe(), true);
    now += 1;
    profile.steeringSpan("homing", start);
    const trailStart = profile.steeringClock();
    now += 1.5;
    profile.trailParts(0.25, 1, 0.25);
    profile.steeringSpan("trailResponseAndDeposit", trailStart);
    profile.antStage("steer", 8);
    profile.ants(8);
  });
  profile.endTick(8);
  const report = profile.report();
  assert.deepEqual(report.estimatedSteeringMsPerTick, {
    tunnelNavigation: 0,
    homing: 4,
    scentProbes: 0,
    terrainChecks: 2,
    trailResponseAndDeposit: 1.5,
    other: 0.5,
  });
  assert.deepEqual(report.estimatedTrailMsPerTick, { prepareInputs: 0.25, chooseTrail: 1, rateAndWrite: 0.25 });
  assert.equal(report.estimatedAntStageMsPerTick.steering, 8);
  assert.equal(probe(), true);
  assert.deepEqual(profile.report(), report, "helpers do not record after the capture");
});
