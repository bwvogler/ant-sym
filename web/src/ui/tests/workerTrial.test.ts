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
  const initial = structuredClone(snapshots.frame(source, true));
  receiveMapFrame(mirror, initial);
  assert.equal(mirror.time, 1);
  assert.equal(mirrorAnt.x, initialX, "the renderer keeps its original array");
  assert.equal(mirrorAnt.x[0], 10);
  assert.equal(rendererChunks.get(50000, 0), 6);

  const unchanged = snapshots.frame(source, true);
  assert.deepEqual(unchanged.ground?.changes, []);
  chunks.drop(50000 >> 6, 0);
  const changed = structuredClone(snapshots.frame(source, true));
  receiveMapFrame(mirror, changed);
  assert.equal(rendererChunks.get(50000, 0), 0);
});

test("playable map actions spend mutations and send a renderable world after a queen settles", async () => {
  const { openMapTrial } = await import("../../experiments/mapTrialRuntime.ts");
  const { MapTrialSnapshots, receiveMapFrame } = await import("../../experiments/mapTrialState.ts");
  const { trialSettings } = await import("../../experiments/workerTrial.ts");
  const { buildGame } = await import("../useColony.ts");
  const runtime = await openMapTrial(
    17,
    100,
    (live, progress, rebuilt) => {
      if (!rebuilt) return;
      const mirror = buildGame(trialSettings(17, 100));
      mirror.load(structuredClone(live.save()));
      receiveMapFrame(mirror, structuredClone(new MapTrialSnapshots().frame(live, true)));
      assert.equal(mirror.colonies.length, 3);
      assert.equal(mirror.colonies[2]!.queen?.x, live.colonies[2]!.queen?.x);
      assert.equal(progress?.flights, 0);
    },
    (message) => assert.fail(message),
  );
  try {
    const { game, command } = runtime;
    const evolution = game.fungus.evolution!;
    const initial = evolution.level("infectivity");
    evolution.replicate(1e6);
    command({ type: "evolve", id: "infectivity" });
    assert.equal(evolution.level("infectivity"), initial + 1);
    const { x, y } = game.colonies[0]!.nest;
    game.flights.push({ mother: 0, x, y, load: 0, strain: 0, at: game.time, food: 2 });
    command({ type: "found" });
    assert.equal(game.colonies.length, 3);
  } finally {
    runtime.dispose();
  }
});
