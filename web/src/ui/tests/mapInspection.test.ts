import { test } from "node:test";
import assert from "node:assert/strict";
import { centreX, centreY } from "../../colony/index.ts";
import { inspectionMarker, mapInspectionNow, setMapInspection } from "../mapInspection.ts";

test("the loupe stays over the exact hex through camera movement and DPR changes", () => {
  const at = { lv: 0, x: centreX(10, 11) + 0.1, y: centreY(11) - 0.1 };
  for (const dpr of [1, 2]) {
    const camera = { x: centreX(10, 11), y: centreY(11), zoom: 12 * dpr };
    const view = { w: 800 * dpr, h: 600 * dpr };
    const first = inspectionMarker(at, 0, camera, view, dpr, 0)!;
    assert.equal(first.x, view.w / 2);
    assert.equal(first.y, view.h / 2);
    const moved = inspectionMarker(at, 0, { ...camera, x: camera.x + 2 }, view, dpr, 0)!;
    assert.equal(moved.x, first.x - 2 * camera.zoom);
    const animated = inspectionMarker(at, 0, camera, view, dpr, 1)!;
    assert.equal(animated.x, first.x);
    assert.equal(animated.y, first.y);
    assert.notEqual(animated.bob, first.bob);
  }
});

test("the inspection marker disappears on another layer and when inspection closes", () => {
  const at = { lv: 0, x: 2, y: 3 };
  setMapInspection(at);
  assert.deepEqual(mapInspectionNow(), at);
  assert.equal(inspectionMarker(at, 1, { x: 0, y: 0, zoom: 12 }, { w: 800, h: 600 }, 1, 0), null);
  setMapInspection(null);
  assert.equal(mapInspectionNow(), null);
  assert.equal(inspectionMarker(null, 0, { x: 0, y: 0, zoom: 12 }, { w: 800, h: 600 }, 1, 0), null);
});

test("the rotating loupe has real voxel thickness and different visible geometry as it turns", async () => {
  const { buildVoxelLoupe, drawVoxelLoupe } = await import("../voxelLoupe.ts");
  const mesh = buildVoxelLoupe();
  const depths = mesh.flatMap((face) => face.points.map((p) => p[1]));
  assert.ok(Math.max(...depths) - Math.min(...depths) >= 3);
  const frames: number[][] = [];
  for (const seconds of [0, 2]) {
    const coords: number[] = [];
    const ctx = {
      beginPath() {},
      closePath() {},
      fill() {},
      moveTo(x: number, y: number) {
        coords.push(x, y);
      },
      lineTo(x: number, y: number) {
        coords.push(x, y);
      },
    } as unknown as CanvasRenderingContext2D;
    drawVoxelLoupe(ctx, 0, 0, 2, seconds);
    frames.push(coords);
  }
  assert.notDeepEqual(frames[0], frames[1]);
});
