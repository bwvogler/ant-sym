import { test } from "node:test";
import assert from "node:assert/strict";
import { buildGame } from "../useColony.ts";
import { SensedMap } from "../fungusSight.ts";
import { inspectViewport } from "../inspectionPatch.ts";
import { buildPatchTerrain } from "../drawInspectionPatch.ts";
import { voxelFrustum } from "../voxelViewport.ts";
import { PLANE, CURTAIN, STRIP, centreX, centreY, cellKey } from "../../colony/index.ts";
import { InspectionSoftware } from "../inspectionSoftware.ts";
import * as T from "three";
import { mapTiltTarget, orbitCamera } from "../inspectionOrbit.ts";
import { inspectionColour } from "../InspectionScene.ts";
import { css, HOME_RGB, ROLE_RGB } from "../palette.ts";

test("voxel overlays retain the map palette's space-separated RGB colours", () => {
  for (const rgb of [HOME_RGB, ...Object.values(ROLE_RGB)])
    assert.deepEqual(inspectionColour(css(rgb)), new T.Color(`rgb(${rgb.join(",")})`).toArray());
  assert.deepEqual(inspectionColour("#68AF9A"), new T.Color("#68AF9A").toArray());
});

test("voxel viewport preserves world scale and aspect across raster sizes and zoom", () => {
  for (const [width, height, pixelsPerWorld] of [
    [480, 300, 60],
    [960, 600, 120],
    [300, 480, 60],
  ]) {
    const view = voxelFrustum({ width, height, pixelsPerWorld, x: 0.12, y: -0.3 });
    assert.equal((view.right - view.left) / (view.top - view.bottom), width / height);
    assert.equal(width / (view.right - view.left), pixelsPerWorld);
    assert.equal(height / (view.top - view.bottom), pixelsPerWorld);
    assert.equal(view.x, 0.12);
    assert.equal(view.y, -0.3);
  }
  const invalid = { width: 480, height: 300, pixelsPerWorld: 60, x: 0, y: 0 };
  for (const [key, value] of [
    ["width", 0],
    ["height", Infinity],
    ["pixelsPerWorld", -1],
    ["x", NaN],
  ] as const)
    assert.throws(() => voxelFrustum({ ...invalid, [key]: value }));
});

test("tilting keeps the center ground line fixed in either map projection", () => {
  const x = 0.22;
  const y = -0.31;
  for (const mode of ["surface", "below"] as const) {
    const ground = new T.Vector3(x, mode === "surface" ? -y : 1.08, mode === "surface" ? 0 : -y);
    const target = new T.Vector3(...mapTiltTarget(mode, x, y));
    const camera = new T.OrthographicCamera(-3, 3, 2, -2, 0.05, 50);
    for (const tilt of [0, -0.3, -0.65, -1.15]) {
      const orbit = orbitCamera(mode, { yaw: 0, tilt });
      camera.position.copy(target).add(new T.Vector3(...orbit.position));
      camera.up.set(...orbit.up);
      camera.lookAt(target);
      camera.updateMatrixWorld();
      for (const dx of [-1, 0, 1]) {
        const point = ground
          .clone()
          .add(new T.Vector3(dx, 0, 0))
          .project(camera);
        assert.ok(Math.abs(point.y) < 1e-9, `${mode}, tilt ${tilt}: the axis stays on the center row`);
        assert.ok(Math.abs(point.x - dx / 3) < 1e-9, `${mode}, tilt ${tilt}: the axis stays fixed horizontally`);
      }
    }
  }
});

test("live viewport includes the visible region once and preserves crossing ants through camera recentering", () => {
  const g = buildGame({ species: "generic", seed: 3, antCount: 50, rival: false, generation: 0 }),
    c = g.colonies[0],
    sensed = new SensedMap(),
    read = (x: number) => inspectViewport(g, sensed, PLANE, x, centreY(50), 6, 4, { food: false, home: false });
  c.alive.fill(0);
  for (let i = 0; i < 32; i++) {
    c.alive[i] = 1;
    c.layer[i] = PLANE;
    c.x[i] = centreX(50, 50) + ((i % 8) - 3.5) * 0.5;
    c.y[i] = centreY(50) + (Math.floor(i / 8) - 1.5) * 0.5;
  }
  const beforeX = [...c.x],
    beforeY = [...c.y],
    a = read(centreX(50, 50) + 0.49),
    b = read(centreX(50, 50) + 0.51),
    positions = (p: typeof a) =>
      p.cells
        .flatMap(({ state: s, x, y }) =>
          s.ants.map((ant) => [ant.i, centreX(...p.selected.cell) + x + ant.x, centreY(p.selected.cell[1]) + y + ant.y]),
        )
        .sort((a, b) => a[0] - b[0]);
  assert.ok(a.cells.length > 7);
  assert.notDeepEqual(a.selected.cell, b.selected.cell);
  assert.equal(new Set(a.cells.map((c) => cellKey(...c.state.cell))).size, a.cells.length);
  assert.equal(positions(a).length, 32, "all actual workers remain present without a per-cell cap");
  assert.deepEqual(positions(a), positions(b));
  assert.deepEqual([...c.x], beforeX);
  assert.deepEqual([...c.y], beforeY);
  const negative = inspectViewport(g, sensed, CURTAIN, -2, centreY(STRIP + 4), 6, 4, { food: false, home: false });
  assert.ok(negative.cells.some((c) => c.state.cell[0] < 0 && c.valid));
  const edge = inspectViewport(g, sensed, PLANE, 0.1, 0.1, 6, 4, { food: false, home: false });
  assert.ok(edge.cells.filter((c) => c.valid).every((c) => c.state.cell[0] >= 0 && c.state.cell[1] >= 0));
  assert.throws(() => inspectViewport(g, sensed, PLANE, 0, 0, Infinity, 4, { food: false, home: false }));
});

test("viewport terrain extends past seven cells and retains world-space voxel grain across a centre change", () => {
  const g = buildGame({ species: "generic", seed: 3, antCount: 50, rival: false, generation: 0 }),
    sensed = new SensedMap(),
    read = (x: number) => inspectViewport(g, sensed, PLANE, x, centreY(50), 4, 2, { food: false, home: false }),
    a = read(centreX(50, 50) + 0.49),
    b = read(centreX(50, 50) + 0.51);
  for (const p of [a, b]) for (const c of p.cells) c.state.place.ground = "open";
  const tops = (p: typeof a) =>
    buildPatchTerrain(p, true)
      .filter((f) => f.normal[2] === 1)
      .map((f) => ({
        x: +(f.points[0][0] + centreX(...p.selected.cell)).toFixed(5),
        y: +(f.points[0][1] - centreY(p.selected.cell[1])).toFixed(5),
        grain: f.grain,
      }))
      .filter((f) => f.x > 49.5 && f.x < 51.5 && f.y > -44 && f.y < -43)
      .sort((a, b) => a.x - b.x || a.y - b.y);
  const actual = tops(a);
  assert.ok(actual.length > 0);
  assert.deepEqual(actual, tops(b));
  assert.ok(
    buildPatchTerrain(a).some((f) => f.points.some((p) => Math.abs(p[0]) > 1.8)),
    "terrain does not stop at the inspection crop",
  );
});

test("software viewport resizing resets depth and idle caches without stretching the previous frame", () => {
  let image: ImageData | null = null,
    writes = 0;
  const canvas = {
    width: 32,
    height: 32,
    getContext: () => ({
      createImageData: (width: number, height: number) => ({ width, height, data: new Uint8ClampedArray(width * height * 4) }),
      putImageData: (im: ImageData) => {
        image = im;
        writes++;
      },
    }),
  } as unknown as HTMLCanvasElement;
  const renderer = new InspectionSoftware(canvas),
    scene = new T.Scene(),
    camera = new T.OrthographicCamera(-1, 1, 1, -1, 0.1, 20);
  camera.position.set(0, 0, 8);
  camera.lookAt(0, 0, 0);
  renderer.render(scene, camera);
  renderer.render(scene, camera);
  assert.equal(writes, 1);
  renderer.setSize(64, 40);
  renderer.render(scene, camera);
  assert.equal(canvas.width, 64);
  assert.equal(canvas.height, 40);
  assert.equal(image!.width, 64);
  assert.equal(image!.height, 40);
  assert.equal(image!.data.length, 64 * 40 * 4);
  assert.equal(writes, 2);
  renderer.setSize(64, 40);
  renderer.render(scene, camera);
  assert.equal(writes, 2);
  renderer.dispose();
});
