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

test("map snapshots update stable renderer objects and remove dropped chunks", async () => {
  const { MapTrialSnapshots, receiveMapFrame } = await import("../../experiments/mapTrialState.ts");
  const { buildGame } = await import("../useColony.ts");
  const { trialSettings } = await import("../../experiments/workerTrial.ts");
  const source = buildGame(trialSettings(1));
  const mirror = buildGame(trialSettings(1));
  const sourceAnt = source.colonies[0]!;
  const mirrorAnt = mirror.colonies[0]!;
  const initialX = mirrorAnt.x;
  const chunks = source.map.spoil!;
  const rendererChunks = mirror.map.spoil!;
  const snapshots = new MapTrialSnapshots();

  chunks.set(50000, 0, 6);
  sourceAnt.x[0] = 10;
  source.time = 1;
  const initial = structuredClone(snapshots.frame(source, true, true));
  receiveMapFrame(mirror, initial);
  assert.equal(mirror.time, 1);
  assert.equal(mirrorAnt.x, initialX, "the renderer keeps its original array");
  assert.equal(mirrorAnt.x[0], 10);
  assert.equal(rendererChunks.get(50000, 0), 6);

  const unchanged = snapshots.frame(source, true, true);
  assert.deepEqual(unchanged.ground?.changes, []);
  chunks.drop(50000 >> 6, 0);
  const changed = structuredClone(snapshots.frame(source, false, true));
  receiveMapFrame(mirror, changed);
  assert.equal(rendererChunks.get(50000, 0), 0);
});
