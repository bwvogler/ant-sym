import assert from "node:assert/strict";
import { test } from "node:test";
import { publishDrawMs, publishFrame, type FrameResult, type FrameSinks } from "../field/result.ts";
import { mapOrbit } from "../inspectionOrbit.ts";

// What a frame reports to the shell (ja-fnd.6.3.13): the refs the pointer code reads and the data attributes the Playwright guards read.

const RESULT: FrameResult = {
  hexCssPx: "14.00",
  workerStyle: "voxel",
  nestStyle: "symbols",
  renderer: "voxel-webgl",
  voxelAlpha: 0.5,
  angled: true,
  canRotate: true,
  chunkPaints: 3,
  chunkCacheHits: 7,
};

function sinks(dev: boolean) {
  const writes: string[] = [];
  const store: Record<string, string | undefined> = {};
  const dataset = new Proxy(store, {
    set(t, k, v) {
      writes.push(String(k));
      t[k as string] = v as string;
      return true;
    },
  });
  const axes = { hidden: true };
  const k: FrameSinks = {
    dataset,
    orbit: { current: { yaw: 0.4, tilt: -0.7 } },
    orbitAxes: { current: axes },
    angled: { current: false },
    flatOrbit: mapOrbit,
    dev,
  };
  return { k, store, writes, axes };
}

test("a frame's result reaches the data attributes the guards read and the refs the pointer code reads", () => {
  const { k, store, axes } = sinks(true);
  publishFrame(RESULT, k);
  assert.deepEqual(store, {
    hexCssPx: "14.00",
    workerStyle: "voxel",
    nestStyle: "symbols",
    mapRenderer: "voxel-webgl",
    voxelAlpha: "0.500",
    chunkPaints: "3",
    chunkCacheHits: "7",
  });
  assert.equal(k.angled.current, true);
  assert.equal(axes.hidden, false, "the tilt control shows where the map can tilt");
  assert.deepEqual(k.orbit.current, { yaw: 0.4, tilt: -0.7 }, "the tilt stays where the player put it");
});

test("where the map cannot tilt, the control hides and the tilt resets", () => {
  const { k, axes } = sinks(true);
  publishFrame({ ...RESULT, canRotate: false, angled: false }, k);
  assert.equal(axes.hidden, true);
  assert.deepEqual(k.orbit.current, mapOrbit());
  assert.equal(k.angled.current, false);
});

test("the diagnostics that rarely change are written only when they change", () => {
  const { k, writes } = sinks(true);
  publishFrame(RESULT, k);
  writes.length = 0;
  publishFrame(RESULT, k);
  assert.deepEqual(
    writes.sort(),
    ["chunkCacheHits", "chunkPaints", "mapRenderer", "voxelAlpha"],
    "the three diagnostics were not written again",
  );
  writes.length = 0;
  publishFrame({ ...RESULT, hexCssPx: "15.00", workerStyle: "ink", nestStyle: "voxel" }, k);
  assert.ok(["hexCssPx", "workerStyle", "nestStyle"].every((n) => writes.includes(n)));
});

test("a build that is not dev writes no chunk counters and no draw time", () => {
  const { k, store } = sinks(false);
  publishFrame(RESULT, k);
  publishDrawMs(12.345, k);
  assert.equal(store.chunkPaints, undefined);
  assert.equal(store.chunkCacheHits, undefined);
  assert.equal(store.fieldDrawMs, undefined);
  assert.equal(store.mapRenderer, "voxel-webgl", "the renderer's name is always written: the e2e reads it in a production build too");
  const dev = sinks(true);
  publishDrawMs(12.345, dev.k);
  assert.equal(dev.store.fieldDrawMs, "12.35");
});
