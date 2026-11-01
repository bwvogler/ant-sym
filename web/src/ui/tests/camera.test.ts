import { test } from "node:test";
import assert from "node:assert/strict";
import { clamp, fit, fitZoom, MAX_ZOOM, minimapRect, pan, toScreen, toWorld, visible, zoomAt } from "../camera.ts";

const world = { w: 512, h: 320 };
const view = { w: 1000, h: 500 };
const near = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) < eps;

test("fit shows the whole map, centred", () => {
  const c = fit(world, view);
  assert.equal(c.zoom, Math.min(1000 / 512, 500 / 320));
  const v = visible(c, view);
  assert.ok(v.x0 <= 0 && v.x1 >= 512 && v.y0 <= 0 && v.y1 >= 320);
});

test("toWorld and toScreen are inverses", () => {
  const c = { x: 100, y: 60, zoom: 7 };
  for (const [sx, sy] of [[0, 0], [123.5, 400], [999, 1]] as const) {
    const [wx, wy] = toWorld(c, view, sx, sy);
    const [bx, by] = toScreen(c, view, wx, wy);
    assert.ok(near(bx, sx) && near(by, sy));
  }
  assert.deepEqual(toScreen(c, view, 100, 60), [500, 250], "the centre is the middle of the view");
});

test("zoomAt keeps the point under the cursor fixed", () => {
  const c = { x: 200, y: 100, zoom: 3 };
  const [wx, wy] = toWorld(c, view, 820, 90);
  const z = zoomAt(c, view, 820, 90, 2.5);
  assert.ok(near(z.zoom, 7.5));
  const [ax, ay] = toWorld(z, view, 820, 90);
  assert.ok(near(ax, wx) && near(ay, wy));
});

test("pan drags the ground with the pointer", () => {
  const c = { x: 200, y: 100, zoom: 4 };
  const [wx, wy] = toWorld(c, view, 300, 300);
  const p = pan(c, 40, -20);
  const [ax, ay] = toWorld(p, view, 340, 280);
  assert.ok(near(ax, wx) && near(ay, wy), "the same ground is now under the moved pointer");
});

test("clamp: no zooming out past the whole map or in past MAX_ZOOM; the view stays over the map", () => {
  assert.equal(clamp({ x: 0, y: 0, zoom: 0.01 }, world, view).zoom, fitZoom(world, view));
  assert.equal(clamp({ x: 0, y: 0, zoom: 999 }, world, view).zoom, MAX_ZOOM);
  const c = clamp({ x: -50, y: 9999, zoom: 10 }, world, view);
  const v = visible(c, view);
  assert.ok(near(v.x0, 0) && near(v.y1, 320), `the view is pushed back onto the map: ${JSON.stringify(v)}`);
  const wide = clamp({ x: 10, y: 10, zoom: fitZoom(world, view) }, world, view);
  assert.equal(wide.x, 256, "an axis the map doesn't fill stays centred");
});

test("the minimap sits in the bottom-right corner with the map's shape", () => {
  const r = minimapRect(world, view, 1);
  assert.ok(near(r.w / r.h, 512 / 320));
  assert.ok(r.x + r.w < view.w && r.y + r.h < view.h);
  assert.ok(r.x > view.w / 2 && r.y > view.h / 2);
});
