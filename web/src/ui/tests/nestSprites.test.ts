import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import layout from "../../assets/nest/manifest.json" with { type: "json" };
import { drawNestSprite, NestSprites } from "../nestSprites.ts";
import { terrainGrain } from "../mapTerrain.ts";
import { AIR, OPEN, SOIL } from "../../colony/index.ts";

test("nest atlases preserve world size across both LODs and every sprite is inside its transparent gutter", () => {
  const calls: number[][] = [];
  const ctx = { drawImage: (_image: unknown, ...args: number[]) => calls.push(args) } as unknown as CanvasRenderingContext2D;
  for (const lod of ["tiny", "walk"] as const) {
    const bytes = readFileSync(new URL(`../../assets/nest/nest-${lod}.png`, import.meta.url)),
      a = layout[lod];
    assert.equal(bytes.readUInt32BE(16), a.width);
    assert.equal(bytes.readUInt32BE(20), a.height);
    for (const kind of ["queen", "queen-dead", "corpse", "brood-0", "brood-1", "brood-2", "alate-body", "alate-wings"] as const) {
      drawNestSprite(ctx, {} as CanvasImageSource, lod, kind, 100, 100, 12);
      const c = calls.at(-1)!;
      assert.ok(c[0] >= 1 && c[0] + c[2] < a.width);
      assert.equal(c[6], 27);
      assert.equal(c[7], 27);
      assert.equal(c[4], 86.5);
      assert.equal(c[5], 86.5);
    }
  }
});

test("invalid nest atlases keep the legacy fallback available and disposal detaches callbacks", () => {
  const old = globalThis.Image,
    loaded: FakeImage[] = [];
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
    globalThis.Image = FakeImage as unknown as typeof Image;
    const sprites = new NestSprites();
    let redraws = 0;
    sprites.load(() => redraws++);
    loaded[0].onload?.();
    assert.equal(sprites.get("tiny"), null);
    Object.assign(loaded[1], { naturalWidth: layout.walk.width, naturalHeight: layout.walk.height });
    loaded[1].onload?.();
    assert.equal(sprites.get("walk"), loaded[1]);
    assert.equal(redraws, 2);
    sprites.dispose();
    assert.equal(sprites.get("walk"), null);
    assert.ok(loaded.every((im) => !im.onload && !im.onerror));
  } finally {
    globalThis.Image = old;
  }
});

test("terrain grain is stable across negative columns, avoids sky and fits inside the cell", () => {
  for (let x = -20; x <= 20; x++)
    for (let y = 0; y < 10; y++) {
      assert.equal(terrainGrain(x, y, AIR), null);
      for (const ground of [OPEN, SOIL, 1]) {
        const p = terrainGrain(x, y, ground);
        assert.deepEqual(p, terrainGrain(x, y, ground));
        if (p) assert.ok(Math.hypot(p[0], p[1]) + p[2] < 0.5);
      }
    }
});

test("colony tint touches queen and alate bodies only, leaving pale wings and brood unchanged", () => {
  const oldImage = globalThis.Image,
    oldDocument = globalThis.document;
  const loaded: FakeImage[] = [],
    reads: number[] = [];
  class FakeImage {
    naturalWidth = layout.walk.width;
    naturalHeight = layout.walk.height;
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
            drawImage: () => {},
            getImageData: (x: number) => {
              reads.push(x);
              return { data: new Uint8ClampedArray([50, 45, 35, 255]) };
            },
            putImageData: () => {},
          }),
        }),
      },
    });
    const sprites = new NestSprites();
    sprites.load(() => {});
    loaded[1].onload?.();
    const first = sprites.get("walk", [28, 27, 25]);
    assert.ok(first);
    assert.deepEqual(reads, [1, layout.names.indexOf("alate-body") * layout.walk.stride + 1]);
    assert.equal(sprites.get("walk", [28, 27, 25]), first);
    assert.equal(reads.length, 2);
    sprites.clearTints();
    assert.notEqual(sprites.get("walk", [28, 27, 25]), first);
    assert.equal(reads.length, 4);
    sprites.dispose();
  } finally {
    Object.assign(globalThis, { Image: oldImage, document: oldDocument });
  }
});
