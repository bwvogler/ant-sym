import assert from "node:assert/strict";
import { test } from "node:test";
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
  assert.equal(report?.pace, (2 / 30) / 10.02);
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
