import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { APHID, aphidCount } from "../../colony/index.ts";
import {
  ResourceSprites,
  RESOURCE_ATLAS,
  FOOD_SPOTS,
  APHID_SPOTS,
  foodKind,
  foodDensity,
  aphidDensity,
  drawResourceSprite,
} from "../resourceSprites.ts";

test("food quality uses the same class boundaries; sugar and honeydew share the sweet class", () => {
  assert.equal(foodKind(0.5), "crumb");
  assert.equal(foodKind(0.99), "plain");
  assert.equal(foodKind(1.01), "plain");
  assert.equal(foodKind(1.5), "sweet");
});

test("food abundance changes mark count and fade, without asserting units or cell capacity", () => {
  assert.deepEqual(foodDensity(0), { marks: 0, alpha: 0 });
  assert.equal(foodDensity(-1).marks, 0);
  assert.equal(foodDensity(Number.NaN).marks, 0);
  assert.equal(foodDensity(Number.MIN_VALUE).marks, 1);
  assert.ok(foodDensity(0.25).alpha < 1);
  assert.deepEqual(
    [1, 2, 4, 8, 16, 10000].map((n) => foodDensity(n).marks),
    [1, 2, 3, 4, 5, 5],
  );
  assert.equal(FOOD_SPOTS.length, 5);
});

test("aphid marks retain aggregate density and crash fade, not an individual insect count", () => {
  const clump = { layer: 0, cells: [10, 10, 11, 10], start: APHID.perCell * 2, eaten: 0, age: 0, owed: 0 };
  assert.equal(aphidDensity(aphidCount(clump), 2).marks, 2);
  clump.age = APHID.peakAt;
  assert.equal(aphidCount(clump), 18);
  assert.equal(aphidDensity(aphidCount(clump), 2).marks, 4);
  clump.age = APHID.endAt;
  assert.deepEqual(aphidDensity(aphidCount(clump), 2), { marks: 0, alpha: 0 });
  assert.ok(aphidDensity(0.5, 2).alpha < 1);
  assert.deepEqual(aphidDensity(10, 0), { marks: 0, alpha: 0 });
  assert.equal(APHID_SPOTS.length, 4);
});

test("food and aphids use one fixed world frame at both resolutions and every orientation stays in bounds", () => {
  const calls: unknown[][] = [];
  const ctx = { drawImage: (...a: unknown[]) => calls.push(a) } as unknown as CanvasRenderingContext2D;
  const image = {} as CanvasImageSource;
  drawResourceSprite(ctx, image, "tiny", "sweet", 0, 100, 200, 24);
  assert.deepEqual(calls.pop(), [image, 9, 1, 6, 6, 94, 194, 12, 12]);
  drawResourceSprite(ctx, image, "walk", "aphid", -1, 100, 200, 28);
  assert.deepEqual(calls.pop(), [image, 97, 1, 14, 14, 93, 193, 14, 14]);
  for (const [lod, name] of [
    ["tiny", "resource-tiny"],
    ["walk", "resource-near"],
  ] as const) {
    const data = readFileSync(new URL(`../../assets/resources/${name}.png`, import.meta.url));
    assert.equal(data.readUInt32BE(16), RESOURCE_ATLAS[lod].width);
    assert.equal(data.readUInt32BE(20), RESOURCE_ATLAS[lod].height);
  }
});

test("resource loading keeps fallback available on errors or wrong dimensions and detaches on disposal", () => {
  const previous = globalThis.Image,
    loaded: FakeImage[] = [];
  let redraws = 0;
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
    Object.assign(globalThis, { Image: FakeImage });
    const sprites = new ResourceSprites();
    sprites.load(() => {
      redraws++;
    });
    assert.equal(sprites.get("tiny"), null);
    loaded[0].onerror?.();
    assert.equal(redraws, 1);
    loaded[0].onload?.();
    assert.equal(sprites.get("tiny"), null);
    Object.assign(loaded[1], { naturalWidth: 112, naturalHeight: 16 });
    loaded[1].onload?.();
    assert.equal(sprites.get("walk"), loaded[1]);
    sprites.dispose();
    assert.equal(sprites.get("walk"), null);
    assert.ok(loaded.every((i) => i.onload === null && i.onerror === null));
  } finally {
    Object.assign(globalThis, { Image: previous });
  }
});
