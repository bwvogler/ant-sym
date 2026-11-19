import { test } from "node:test";
import assert from "node:assert/strict";
import { MapChunkPaintCache } from "../mapChunkPaintCache.ts";
import { MapVoxelPass, mapVoxelAlpha, type MapVoxelScene } from "../mapVoxel.ts";
import { buildGame } from "../useColony.ts";
import { SensedMap } from "../fungusSight.ts";
import { PLANE, CURTAIN, STRIP, centreX, centreY } from "../../colony/index.ts";
import { clamp, zoomBy, MAX_ZOOM, toWorld } from "../camera.ts";

test("distant tile cache notices direct array writes, missing fields, time/settings tags and resets", () => {
  const cache = new MapChunkPaintCache(),
    tile = {},
    rock = new Uint8Array(4096),
    food = new Float32Array(4096);
  assert.equal(cache.needsPaint(tile, "theme1/food1", [rock, food, undefined]), true);
  for (let i = 0; i < 20; i++) assert.equal(cache.needsPaint(tile, "theme1/food1", [rock, food, undefined]), false);
  rock[4095] = 2;
  assert.equal(cache.needsPaint(tile, "theme1/food1", [rock, food, undefined]), true);
  food[0] = 0.1;
  assert.equal(cache.needsPaint(tile, "theme1/food1", [rock, food, undefined]), true);
  assert.equal(cache.needsPaint(tile, "theme1/food1", [rock, food, undefined]), false);
  assert.equal(cache.needsPaint(tile, "theme1/food1", [rock, food, new Uint8Array(4)]), true);
  assert.equal(cache.needsPaint(tile, "theme1/food1", [rock, food, undefined]), true);
  assert.equal(cache.needsPaint(tile, "theme1/food0", [rock, food, undefined]), true);
  assert.equal(cache.needsPaint(tile, "theme1/food0", [rock, food, undefined]), false);
  cache.clear();
  assert.equal(cache.needsPaint(tile, "theme1/food0", [rock, food, undefined]), true);
  const odd = new Uint8Array(new ArrayBuffer(7), 1, 5);
  assert.equal(cache.needsPaint(tile, "odd", [odd]), true);
  assert.equal(cache.needsPaint(tile, "odd", [odd]), false);
  odd[4] = 1;
  assert.equal(cache.needsPaint(tile, "odd", [odd]), true);
});

test("zoom reaches the same inspection-scale CSS size at DPR 1 and 2 and keeps the pointer anchored", () => {
  const world = { w: 512, h: 320 };
  for (const dpr of [1, 2]) {
    const view = { w: 1000 * dpr, h: 600 * dpr, dpr },
      camera = { x: 200, y: 100, zoom: 60 * dpr },
      point = toWorld(camera, view, 600 * dpr, 200 * dpr),
      next = zoomBy(camera, world, view, 600 * dpr, 200 * dpr, 1.25);
    assert.deepEqual(toWorld(next, view, 600 * dpr, 200 * dpr), point);
    assert.equal(clamp({ ...camera, zoom: 9999 }, world, view).zoom / dpr, MAX_ZOOM);
  }
  assert.equal(mapVoxelAlpha(48), 0);
  assert.equal(mapVoxelAlpha(60), 0.5);
  assert.equal(mapVoxelAlpha(72), 1);
  assert.equal(mapVoxelAlpha(120, false), 0);
  assert.equal(mapVoxelAlpha(132, false), 0.5);
  assert.equal(mapVoxelAlpha(144, false), 1);
});

const game = buildGame({ species: "generic", seed: 3, antCount: 50, rival: false, generation: 0 }),
  sensed = new SensedMap(),
  camera = { x: centreX(50, 50), y: centreY(50), zoom: 60 },
  view = { w: 400, h: 240 },
  palette = { ink: "#202020", warn: "#aa7711" };
function harness(accelerated = true) {
  let creates = 0,
    canvases = 0,
    ready = 0,
    disposed = 0,
    images = 0;
  const calls: { patch: Parameters<MapVoxelScene["draw"]>[0]; options: Parameters<MapVoxelScene["draw"]>[1] }[] = [],
    sizes: Parameters<MapVoxelScene["setViewport"]>[0][] = [],
    scene: MapVoxelScene = {
      accelerated,
      setViewport: (v) => sizes.push(v),
      setPalette: () => {},
      draw: (patch, options) => calls.push({ patch, options }),
      dispose: () => {
        disposed++;
      },
    },
    ctx = {
      save: () => {},
      restore: () => {},
      drawImage: () => {
        images++;
      },
    } as unknown as CanvasRenderingContext2D,
    pass = new MapVoxelPass(
      () => {
        ready++;
      },
      async () => {
        creates++;
        return scene;
      },
      () => {
        canvases++;
        return { width: 0, height: 0 } as HTMLCanvasElement;
      },
    ),
    draw = (zoom = 60, layer = PLANE, y = camera.y, allow = true) =>
      pass.draw(ctx, game, sensed, layer, { ...camera, zoom, y }, view, 1, { food: false, home: false }, [], palette, allow);
  return { pass, draw, calls, sizes, scene, stats: () => ({ creates, canvases, ready, disposed, images }) };
}
const loaded = () => new Promise<void>((resolve) => setImmediate(resolve));

test("distant map never loads or draws the voxel renderer; close blending uses the live camera without a second cell highlight", async () => {
  const h = harness();
  for (let i = 0; i < 20; i++) assert.deepEqual(h.draw(12), { alpha: 0, renderer: "sprites" });
  assert.equal(h.stats().creates, 0);
  assert.equal(h.stats().canvases, 0);
  assert.equal(h.draw().renderer, "loading");
  await loaded();
  assert.equal(h.stats().ready, 1);
  assert.deepEqual(h.draw(), { alpha: 0.5, renderer: "voxel-webgl" });
  assert.deepEqual(h.sizes[0], { width: 200, height: 120, pixelsPerWorld: 30, x: 0, y: 0 });
  assert.equal(h.calls[0].options.selection, false);
  assert.equal(h.calls[0].options.chambers, true);
  assert.equal(h.calls[0].patch.selected.cell[0], 50);
  assert.ok(h.calls[0].patch.cells.length > 7);
  assert.equal(h.draw(12).alpha, 0);
  assert.equal(h.calls.length, 1, "zooming away stops all voxel sampling/rendering");
  assert.equal(h.draw(72).alpha, 1);
  assert.equal(h.stats().creates, 1);
  h.pass.dispose();
  assert.equal(h.stats().disposed, 1);
});

test("software blending stays at close zoom and projected strip or smell vision retain the 2D map", async () => {
  const h = harness(false);
  h.draw(60);
  await loaded();
  assert.equal(h.draw(60).alpha, 0);
  assert.equal(h.calls.length, 0);
  assert.equal(h.draw(132).alpha, 0.5);
  assert.equal(h.draw(144).alpha, 1);
  assert.equal(h.draw(180, CURTAIN, centreY(STRIP)).alpha, 0);
  assert.equal(h.draw(180, PLANE, camera.y, false).alpha, 0);
  h.pass.dispose();
});

test("failed rendering restores sprites and disposing a pending load releases its eventual scene", async () => {
  const h = harness();
  h.draw();
  await loaded();
  h.scene.draw = () => {
    throw Error("context lost");
  };
  assert.equal(h.draw(72).alpha, 0);
  assert.equal(h.stats().disposed, 1);
  assert.equal(h.draw(72).renderer, "sprites");
  assert.equal(h.stats().creates, 1);
  const pending = harness();
  pending.draw();
  pending.pass.dispose();
  await loaded();
  assert.equal(pending.stats().disposed, 1);
  assert.equal(pending.stats().ready, 0);
  assert.equal(pending.draw(72).alpha, 0);
});
