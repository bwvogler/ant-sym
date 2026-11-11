import { test } from "node:test";
import assert from "node:assert/strict";
import {
  aimed,
  clamp,
  fit,
  fitZoom,
  fromMinimap,
  MAX_ZOOM,
  minimapRect,
  pan,
  toScreen,
  toWorld,
  visible,
  zoomAt,
  zoomBy,
} from "../camera.ts";

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
  for (const [sx, sy] of [
    [0, 0],
    [123.5, 400],
    [999, 1],
  ] as const) {
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

test("zoomBy stops at the limits instead of panning (zooming in at MAX_ZOOM near an edge leaves the view put)", () => {
  const atMax = clamp({ x: 256, y: 160, zoom: MAX_ZOOM }, world, view);
  let c = atMax;
  for (let k = 0; k < 10; k++) c = zoomBy(c, world, view, 990, 250, 1.2);
  assert.deepEqual(c, atMax);
  const whole = fit(world, view);
  assert.deepEqual(zoomBy(whole, world, view, 10, 10, 0.5), clamp(whole, world, view), "zooming out of the whole map does nothing");
  const mid = { x: 200, y: 100, zoom: 4 };
  const [wx, wy] = toWorld(mid, view, 700, 200);
  const z = zoomBy(mid, world, view, 700, 200, 1.5);
  const [ax, ay] = toWorld(z, view, 700, 200);
  assert.ok(near(ax, wx) && near(ay, wy), "inside the range it still keeps the point under the pointer");
});

test("a map whose columns start below 0 (one world's curtain, x0 < 0): fit, clamp and the minimap keep to it, not to 0…w", () => {
  const curtain = { x0: -64, w: 300, h: 320 };
  const c = fit(curtain, view);
  assert.equal(c.x, -64 + 150, "centred on the map, not on w / 2");
  const v = visible(c, view);
  assert.ok(v.x0 <= -64 && v.x1 >= 236, "the whole map in view");
  // Zoomed in at the far west, the view stops at the map's first column, not at 0.
  const z = clamp({ x: -500, y: 160, zoom: 10 }, curtain, view);
  assert.ok(near(visible(z, view).x0, -64), `the view's west edge is the map's (${visible(z, view).x0})`);
  const e = clamp({ x: 500, y: 160, zoom: 10 }, curtain, view);
  assert.ok(near(visible(e, view).x1, 236), "and its east edge");
  // A click on the minimap's west edge jumps to the map's first column.
  const r = minimapRect(curtain, view, 1);
  assert.ok(near(fromMinimap(curtain, view, 1, r.x, r.y)[0], -64));
  assert.ok(near(fromMinimap(curtain, view, 1, r.x + r.w, r.y + r.h)[0], 236));
  const rw = minimapRect(world, view, 1);
  assert.deepEqual(fromMinimap(world, view, 1, rw.x, rw.y), [0, 0], "a map from 0 is unchanged");
});

test("an aim is clamped afresh in each view it is drawn in, not from the last clamp", () => {
  const map = { w: 512, h: 320 };
  const aim = { x: 250, y: 100 };
  const c = { x: 0, y: 0, zoom: 2 };
  // Drawn first in a tall box (the whole height fits: centred on it), then in the box the view settles in.
  const tall = aimed(c, aim, map, { w: 900, h: 700 });
  assert.equal(tall.y, 160);
  const settled = aimed(tall, aim, map, { w: 900, h: 560 });
  assert.deepEqual(settled, clamp({ x: 250, y: 100, zoom: 2 }, map, { w: 900, h: 560 }));
  assert.equal(settled.y, 140, "as near the aim as the box allows");
  // Without an aim the camera is only clamped; with a span, zoomed to fit it across the shorter side.
  assert.deepEqual(aimed(tall, null, map, { w: 900, h: 560 }), clamp(tall, map, { w: 900, h: 560 }));
  assert.equal(aimed({ ...c, zoom: 3 }, { x: 250, y: 160, span: 280 }, map, { w: 900, h: 560 }).zoom, 2);
});
