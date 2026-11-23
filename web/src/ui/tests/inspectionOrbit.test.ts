import assert from "node:assert/strict";
import { test } from "node:test";
import { CURTAIN, PLANE } from "../../colony/index.ts";
import {
  BELOW_WALK_PLANE,
  inspectionCameraPose,
  inspectionFrustumHalf,
  mapCameraOrbit,
  mapOrbit,
  mapTiltTarget,
  orbitCamera,
  tiltFromDrag,
} from "../inspectionOrbit.ts";

// The close map's tilt (#287, ja-fnd.6.7): which way a drag tilts it, which sign each layer's camera takes, and where the scene's camera stands and how
// wide it sees. The scene (InspectionScene.draw) and the field (ColonyField.tiltMap and the frame's orbit) call these same functions.

const near = (a: number, b: number, what: string) => assert.ok(Math.abs(a - b) < 1e-12, `${what}: ${a} against ${b}`);

test("tiltFromDrag: dragging up tilts the map (a negative stored tilt, 0.01 rad a pixel), dragging down flattens it and never passes the flat map", () => {
  near(tiltFromDrag(mapOrbit(), -50), -0.5, "50 px up from flat");
  near(tiltFromDrag({ yaw: 0, tilt: -0.3 }, -20), -0.5, "20 px up from 0.3 down: on from where it was");
  near(tiltFromDrag({ yaw: 0, tilt: -0.5 }, 20), -0.3, "20 px down: back toward flat");
  assert.equal(tiltFromDrag({ yaw: 0, tilt: -0.5 }, 50), 0, "exactly back to flat");
  assert.equal(tiltFromDrag({ yaw: 0, tilt: -0.5 }, 5000), 0, "dragging far down stops at flat");
  assert.equal(tiltFromDrag(mapOrbit(), 5000), 0, "and from flat, down tilts nothing (never positive)");
  assert.ok(Object.is(tiltFromDrag(mapOrbit(), 1), 0), "and the flat map it stops at is +0, not -0");
  near(tiltFromDrag(mapOrbit(), -5000), -1.15, "far up stops at the orbit's limit");
  near(tiltFromDrag({ yaw: 0, tilt: -1.1 }, -20), -1.15, "and from near it");
});

test("mapCameraOrbit: Above (the plane) takes the stored tilt negated, Below (the curtain) as stored; yaw is kept and the input is not changed", () => {
  const stored = { yaw: 0.4, tilt: -0.7 };
  assert.deepEqual(mapCameraOrbit(PLANE, stored), { yaw: 0.4, tilt: 0.7 }, "Above: positive");
  assert.deepEqual(mapCameraOrbit(CURTAIN, stored), { yaw: 0.4, tilt: -0.7 }, "Below: as stored");
  assert.deepEqual(stored, { yaw: 0.4, tilt: -0.7 }, "not mutated");
  assert.ok(mapCameraOrbit(PLANE, { yaw: 0, tilt: -1.15 }).tilt > 0);
  assert.ok(mapCameraOrbit(CURTAIN, { yaw: 0, tilt: -1.15 }).tilt < 0);
  // every orbit a drag can store gives Above a camera tilt that is never negative
  for (const dy of [-5000, -300, -1, 0, 1, 300, 5000])
    assert.ok(mapCameraOrbit(PLANE, { yaw: 0, tilt: tiltFromDrag(mapOrbit(), dy) }).tilt >= 0, `drag ${dy}`);
});

test("inspectionCameraPose: the target is the ground point under the map's centre (or the patch's own), the camera is the orbit's offset from it", () => {
  const orbit = { yaw: 0.3, tilt: 0.65 };
  for (const mode of ["surface", "below"] as const) {
    const off = orbitCamera(mode, orbit);
    const patch = inspectionCameraPose(mode, orbit);
    assert.deepEqual(patch.target, mode === "surface" ? [0, 0, 0.15] : [0, 0.6, 0], `${mode}: the patch's own centre`);
    assert.deepEqual(
      patch.position,
      patch.target.map((t, i) => t + off.position[i]!),
      `${mode}: offset from it`,
    );
    assert.deepEqual(patch.up, off.up);
    const live = inspectionCameraPose(mode, orbit, { x: 0.22, y: -0.31 });
    assert.deepEqual(live.target, mapTiltTarget(mode, 0.22, -0.31), `${mode}: a live viewport pivots about the ground under its centre`);
    assert.deepEqual(
      live.position,
      live.target.map((t, i) => t + off.position[i]!),
    );
    assert.deepEqual(live.up, off.up);
    assert.deepEqual(inspectionCameraPose(mode, orbit, null), patch, "no viewport (null): the patch's");
  }
  assert.deepEqual(mapTiltTarget("surface", 1, 2), [1, -2, 0]);
  assert.deepEqual(mapTiltTarget("below", 1, 2), [1, BELOW_WALK_PLANE, -2]);
});

test("inspectionFrustumHalf: a live viewport sees its raster in world units; the patch fits its frame in a 4.3 by 3.584 box", () => {
  assert.deepEqual(
    inspectionFrustumHalf({ width: 480, height: 300, pixelsPerWorld: 60 }, 7),
    { halfWidth: 4, halfHeight: 2.5 },
    "the frame does not matter to a viewport",
  );
  assert.deepEqual(
    inspectionFrustumHalf({ width: 960, height: 600, pixelsPerWorld: 120 }, 1),
    { halfWidth: 4, halfHeight: 2.5 },
    "the same world at twice the raster",
  );
  assert.deepEqual(inspectionFrustumHalf(null, 1), { halfWidth: 2.15, halfHeight: 1.792 });
  assert.deepEqual(inspectionFrustumHalf(undefined, 2), { halfWidth: 4.3, halfHeight: 3.584 });
});
