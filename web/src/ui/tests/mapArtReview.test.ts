import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CADAVER_ATLAS, CadaverSprites, drawCadaverSprite } from "../cadaverSprites.ts";
import { fungalPrimitives, fungalMapPrimitives, FUNGAL } from "../fungalStructures.ts";
import { workerLod, neutralSpriteRim, tintWorkerPixels } from "../workerSprites.ts";

test("two aerial fungal layers retain the complete geometry, with the fertile stalk above the cadaver", () => {
  const state = { colonised: true, sporulating: true, stalkLevel: 2 };
  const ground = fungalMapPrimitives(state, 3, "ground"),
    raised = fungalMapPrimitives(state, 3, "raised");
  assert.deepEqual([...ground, ...raised], fungalPrimitives(state, 3), "splitting draw order must not add or omit geometry");
  assert.ok(ground.some((p) => p.colour === FUNGAL.spores));
  assert.ok(!raised.some((p) => p.colour === FUNGAL.spores));
  assert.ok(
    raised.some((p) => p.kind === "box" && p.colour === FUNGAL.rind),
    "the brown fertile cushion stays in the raised layer",
  );
  assert.deepEqual(fungalMapPrimitives({ colonised: true }, 3, "raised"), [], "spent sites never acquire a stalk during rendering");
});

test("cadaver atlases and draws retain the worker's world length across map LODs and pixel densities", () => {
  const models = JSON.parse(readFileSync(new URL("../../assets/inspection-3d/models.json", import.meta.url), "utf8"));
  const xs = (points: number[]) => points.filter((_, i) => i % 3 === 0);
  const live = xs([...models.worker.body.positions, ...models.worker.band.positions]),
    dead = xs(models["corpse-0"].body.positions);
  assert.equal(Math.min(...live), Math.min(...dead));
  assert.equal(Math.max(...live), Math.max(...dead));
  const image = {} as CanvasImageSource,
    calls: unknown[][] = [];
  const ctx = { drawImage: (...args: unknown[]) => calls.push(args) } as unknown as CanvasRenderingContext2D;
  for (const cssZoom of [12, 20, 28])
    for (const dpr of [1, 2]) {
      const zoom = cssZoom * dpr,
        lod = workerLod(zoom, dpr),
        atlas = CADAVER_ATLAS[lod];
      const png = readFileSync(new URL(`../../assets/inspection-3d/cadavers-${lod}.png`, import.meta.url));
      assert.equal(png.readUInt32BE(16), atlas.width);
      assert.equal(png.readUInt32BE(20), atlas.height);
      drawCadaverSprite(ctx, image, lod, 3, 100, 100, zoom);
      const call = calls.at(-1)!;
      assert.equal(call[1], 3 * atlas.stride + 1);
      assert.equal(call[3], atlas.frame);
      assert.equal((call[7] as number) / dpr, cssZoom * 2.25, "DPR changes raster density, never apparent size");
    }
});

test("cadaver sprite loading rejects incomplete atlases and releases callbacks when the field closes", () => {
  const prior = Object.getOwnPropertyDescriptor(globalThis, "Image"),
    images: Record<string, unknown>[] = [];
  class ImageStub {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    naturalWidth = 0;
    naturalHeight = 0;
    src = "";
    constructor() {
      images.push(this as unknown as Record<string, unknown>);
    }
  }
  Object.defineProperty(globalThis, "Image", { configurable: true, value: ImageStub });
  try {
    let redraws = 0;
    const sprites = new CadaverSprites();
    sprites.load(() => redraws++);
    assert.equal(sprites.get("tiny"), null);
    Object.assign(images[0], { naturalWidth: 115, naturalHeight: 29 });
    (images[0].onload as () => void)();
    assert.equal(sprites.get("tiny"), null);
    Object.assign(images[0], { naturalWidth: 116, naturalHeight: 29 });
    (images[0].onload as () => void)();
    assert.ok(sprites.get("tiny"));
    assert.equal(redraws, 2);
    sprites.dispose();
    assert.equal(sprites.get("tiny"), null);
    assert.ok(images.every((im) => im.onload === null && im.onerror === null));
  } finally {
    if (prior) Object.defineProperty(globalThis, "Image", prior);
    else Reflect.deleteProperty(globalThis, "Image");
  }
});

test("dark-ground highlights preserve footprint, alpha and neutral interior, with colony hue confined to the band", () => {
  const pixels = new Uint8ClampedArray(5 * 5 * 4);
  for (let y = 1; y <= 3; y++) for (let x = 1; x <= 3; x++) pixels.set([20, 22, 24, 255], (y * 5 + x) * 4);
  const original = pixels.slice();
  neutralSpriteRim(pixels, 5, 5);
  for (let i = 0; i < pixels.length; i += 4) {
    assert.equal(pixels[i + 3], original[i + 3], "no outer halo or footprint change");
    if (!pixels[i + 3]) assert.deepEqual(pixels.slice(i, i + 4), original.slice(i, i + 4));
  }
  assert.deepEqual([...pixels.slice(12 * 4, 13 * 4)], [20, 22, 24, 255], "interior chitin stays dark");
  assert.ok(pixels[11 * 4] > 110, "silhouette pixels gain contrast against dark ground");
  const rimmed = pixels.slice();
  tintWorkerPixels(pixels, [200, 80, 20], [7, 1]);
  for (let pixel = 0; pixel < 25; pixel++)
    if (pixel !== 7) assert.deepEqual(pixels.slice(pixel * 4, pixel * 4 + 4), rimmed.slice(pixel * 4, pixel * 4 + 4));
  assert.ok(pixels[7 * 4] > pixels[7 * 4 + 1], "the band remains the colony-coloured element");
});
