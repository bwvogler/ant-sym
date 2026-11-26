import assert from "node:assert/strict";
import { test } from "node:test";
import { TrialClock } from "../../experiments/workerTrial.ts";

test("the trial clock schedules four times real time in whole 30 Hz steps", () => {
  const clock = new TrialClock();
  let ticks = 0;
  clock.reset(0);
  for (let now = 5; now <= 1000; now += 5)
    clock.pump(
      now,
      () => ticks++,
      () => now,
    );
  // Floating point can leave the step exactly at the boundary for the next pump.
  assert.ok(ticks === 119 || ticks === 120, `received ${ticks} fixed steps`);
});

test("an overloaded clock yields after a slow tick and clears debt when paused", () => {
  const clock = new TrialClock();
  let ticks = 0;
  clock.reset(0);
  const remaining = clock.pump(
    1000,
    () => ticks++,
    () => 1015,
  );
  assert.equal(ticks, 1);
  assert.equal(remaining, 0, "the worker has more work ready");
  clock.reset(3000);
  clock.pump(
    3000,
    () => ticks++,
    () => 3000,
  );
  assert.equal(ticks, 1, "paused wall time does not become simulation debt");
});
