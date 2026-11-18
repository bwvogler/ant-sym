import { test } from "node:test";
import assert from "node:assert/strict";
import {
  WorkerGait,
  WorkerSprites,
  WORKER_ATLAS,
  WORKER_CYCLE_TRAVEL,
  workerDirection,
  workerLod,
  tintWorkerPixels,
  drawWorkerSprite,
} from "../workerSprites.ts";

const workers = () => ({
  n: 2,
  x: new Float32Array([10, 20]),
  y: new Float32Array([10, 20]),
  alive: new Uint8Array([1, 1]),
  gen: new Uint32Array([1, 1]),
  layer: new Uint8Array([0, 0]),
});

test("draw rectangles stay inside atlas padding and use backing-pixel world scale", () => {
  const calls: unknown[][] = [];
  const ctx = { drawImage: (...args: unknown[]) => calls.push(args) } as unknown as CanvasRenderingContext2D;
  const image = {} as CanvasImageSource;
  drawWorkerSprite(ctx, image, "walk", Math.PI / 2, 7, 100, 200, 28);
  assert.deepEqual(calls[0], [image, 133, 309, 42, 42, 79, 179, 42, 42]);
  drawWorkerSprite(ctx, image, "tiny", -Math.PI / 2, 7, 100, 200, 24);
  assert.deepEqual(calls[1], [image, 199, 1, 20, 20, 80, 180, 40, 40]);
});

test("worker LOD uses CSS size at DPR 1 and 2 without changing body scale", () => {
  assert.equal(workerLod(12, 1), "tiny");
  assert.equal(workerLod(24, 2), "tiny");
  assert.equal(workerLod(28, 2), "walk");
  assert.equal(workerLod(28, 1), "walk");
  assert.equal(WORKER_ATLAS.tiny.worldSize * 12, 20);
  assert.equal(WORKER_ATLAS.walk.worldSize * 28, 42);
  assert.equal(workerDirection(0), 0);
  assert.equal(workerDirection(Math.PI / 2), 3);
  assert.equal(workerDirection(-Math.PI / 2), 9);
  assert.equal(workerDirection(Math.PI * 2), 0);
});

test("walk phase follows distance, freezes at rest, and never mutates simulation arrays", () => {
  const col = workers(),
    gait = new WorkerGait();
  const original = structuredClone(col);
  gait.update(col);
  assert.deepEqual(col, original);
  col.x[0] += WORKER_CYCLE_TRAVEL * 0.3;
  gait.update(col);
  assert.equal(gait.pose(col, 0), 2);
  assert.equal(gait.pose(col, 1), 0);
  const moved = structuredClone(col);
  for (let n = 0; n < 20; n++) gait.update(col);
  assert.equal(gait.pose(col, 0), 2);
  assert.deepEqual(col, moved);
});

test("reborn slots, deaths, crossings and teleports reset gait; colonies have independent phases", () => {
  const col = workers(),
    other = workers(),
    gait = new WorkerGait();
  const move = () => {
    col.x[0] += WORKER_CYCLE_TRAVEL * 0.3;
    gait.update(col);
  };
  gait.update(col);
  move();
  assert.equal(gait.pose(col, 0), 2);
  gait.update(other);
  assert.equal(gait.pose(other, 0), 0);
  col.gen[0]++;
  gait.update(col);
  assert.equal(gait.pose(col, 0), 0);
  move();
  col.layer[0] = 1;
  gait.update(col);
  assert.equal(gait.pose(col, 0), 0);
  move();
  col.alive[0] = 0;
  gait.update(col);
  col.alive[0] = 1;
  gait.update(col);
  assert.equal(gait.pose(col, 0), 0);
  move();
  col.x[0] += 10;
  gait.update(col);
  assert.equal(gait.pose(col, 0), 0);
});

test("odour tint preserves alpha and shading, including a light dark-theme ant", () => {
  for (const colour of [
    [28, 27, 25],
    [240, 235, 220],
  ]) {
    const p = new Uint8ClampedArray([35, 31, 28, 255, 137, 107, 77, 127, 7, 8, 9, 0]);
    tintWorkerPixels(p, colour, [0, p.length / 4]);
    assert.equal(p[3], 255);
    assert.equal(p[7], 127);
    assert.ok(p[4] > p[0]);
    assert.deepEqual([...p.slice(8)], [7, 8, 9, 0]);
    if (colour[0] > 200) assert.ok(p[0] > 140);
  }
});

test("atlases fail safely, reject wrong dimensions, cache tints, clear on theme change and dispose loaders", () => {
  const savedImage = globalThis.Image,
    savedDocument = globalThis.document;
  const loaded: FakeImage[] = [];
  let paints = 0,
    redraws = 0;
  class FakeImage {
    naturalWidth = 0;
    naturalHeight = 0;
    src = "";
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    constructor() {
      loaded.push(this);
    }
  }
  try {
    Object.assign(globalThis, {
      Image: FakeImage,
      document: {
        createElement: () => ({
          width: 0,
          height: 0,
          getContext: () => ({
            drawImage: () => {
              paints++;
            },
            getImageData: () => ({ data: new Uint8ClampedArray([35, 31, 28, 255]) }),
            putImageData: () => {},
          }),
        }),
      },
    });
    const sprites = new WorkerSprites();
    sprites.load(() => {
      redraws++;
    });
    assert.equal(sprites.get("tiny", [28, 27, 25]), null);
    assert.equal(sprites.ready("tiny"), false);
    loaded[0].onerror?.();
    assert.equal(redraws, 1);
    loaded[0].onload?.();
    assert.equal(sprites.get("tiny", [28, 27, 25]), null);
    Object.assign(loaded[1], { naturalWidth: 528, naturalHeight: 352 });
    loaded[1].onload?.();
    assert.equal(sprites.ready("walk"), true);
    const first = sprites.get("walk", [28, 27, 25]);
    assert.ok(first);
    assert.equal(sprites.get("walk", [28, 27, 25]), first);
    assert.equal(paints, 1);
    assert.notEqual(sprites.get("walk", [240, 235, 220]), first);
    assert.equal(paints, 2);
    sprites.clearTints();
    assert.notEqual(sprites.get("walk", [28, 27, 25]), first);
    assert.equal(paints, 3);
    sprites.dispose();
    assert.equal(sprites.ready("walk"), false);
    assert.equal(sprites.get("walk", [28, 27, 25]), null);
    assert.ok(loaded.every((i) => i.onload === null && i.onerror === null));
  } finally {
    Object.assign(globalThis, { Image: savedImage, document: savedDocument });
  }
});
