import { test } from "node:test";
import assert from "node:assert/strict";
import {
  aimed,
  clamp,
  ENDLESS_MIN_ZOOM,
  ENDLESS_ZOOMED_IN,
  fit,
  fitZoom,
  fromMinimap,
  isFitted,
  isZoomedIn,
  MAX_ZOOM,
  miniFrame,
  minimapRect,
  minZoom,
  pan,
  reachOf,
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

// The endless plane (docs/endless-world.md §8, ja-qpv.4.2): no whole map, a fixed least zoom, a view that may go anywhere inside `reachOf`.
const H = 32768 * 64; // the nominal box's half side (any big number: the box is the limit of correctness, not an edge)
const endless = { endless: true as const, x0: -H, w: 2 * H, h: 1.7 * H, home: { x0: 20, y0: -30, w: 300, h: 160 } };

test("endless: the view pans far and is not pulled back to a map", () => {
  const far = clamp({ x: 123456, y: -98765, zoom: 4 }, endless, view);
  assert.deepEqual(far, { x: 123456, y: -98765, zoom: 4 });
  const p = pan(far, -500, 300);
  assert.deepEqual(clamp(p, endless, view), p, "a drag far from the start is kept");
  const west = clamp({ x: -1e9, y: 0, zoom: 4 }, endless, view);
  assert.ok(near(visible(west, view).x0, -H), "only the nominal box stops it");
});

test("endless: the least zoom is fixed, whatever the size of the plane, and scales with dpr", () => {
  assert.equal(minZoom(endless, view), ENDLESS_MIN_ZOOM);
  assert.equal(minZoom({ ...endless, w: 5, h: 5 }, view), ENDLESS_MIN_ZOOM, "not the map's size");
  assert.equal(minZoom(endless, { ...view, dpr: 2 }), 2 * ENDLESS_MIN_ZOOM);
  assert.equal(clamp({ x: 0, y: 0, zoom: 1e-9 }, endless, view).zoom, ENDLESS_MIN_ZOOM);
  assert.equal(clamp({ x: 0, y: 0, zoom: 1e9 }, endless, view).zoom, MAX_ZOOM);
  let c = { x: 5000, y: 5000, zoom: 3 };
  for (let k = 0; k < 60; k++) c = zoomBy(c, endless, view, 100, 100, 0.7);
  assert.equal(c.zoom, ENDLESS_MIN_ZOOM, "zooming out stops at the least zoom");
  const at = zoomBy(c, endless, view, 10, 400, 0.5);
  assert.deepEqual(at, c, "and at the least zoom it leaves the view where it is");
});

test("endless: zooming about a point keeps that ground under the pointer, far from the origin", () => {
  const c = { x: 70000, y: -40000, zoom: 3 };
  const [wx, wy] = toWorld(c, view, 820, 90);
  for (const f of [0.4, 1.7]) {
    const z = zoomBy(c, endless, view, 820, 90, f);
    const [ax, ay] = toWorld(z, view, 820, 90);
    assert.ok(near(ax, wx, 1e-6) && near(ay, wy, 1e-6), `factor ${f}`);
  }
});

test("endless: aimed() keeps its aim, at the camera's zoom or the aim's span", () => {
  const c = { x: 0, y: 0, zoom: 6 };
  assert.deepEqual(aimed(c, { x: -88000, y: 61000 }, endless, view), { x: -88000, y: 61000, zoom: 6 });
  const spanned = aimed(c, { x: 123, y: -456, span: 250 }, endless, view);
  assert.deepEqual(spanned, { x: 123, y: -456, zoom: 500 / 250 });
  assert.deepEqual(aimed(c, null, endless, view), clamp(c, endless, view), "no aim: only clamped");
});

test("endless: fit starts on the home rectangle (the start nests), and showing it counts as fitted", () => {
  const c = fit(endless, view);
  assert.ok(near(c.x, 170) && near(c.y, 50), "centred on the home rectangle");
  const v = visible(c, view);
  assert.ok(v.x0 <= 20 && v.x1 >= 320 && v.y0 <= -30 && v.y1 >= 130, "all of it in view");
  assert.equal(c.zoom, fitZoom(endless, view));
  assert.ok(c.zoom > ENDLESS_MIN_ZOOM && c.zoom < MAX_ZOOM);
  assert.ok(isFitted(endless, view, c));
  assert.ok(!isFitted(endless, view, pan(c, 30, 0)), "panned away it is not");
  assert.ok(!isFitted(endless, view, { ...c, zoom: c.zoom / 2 }), "nor zoomed out: the page must not refit it");
  const noHome = fit({ ...endless, home: undefined }, view);
  assert.equal(noHome.zoom, ENDLESS_MIN_ZOOM, "with no home it shows as much as the least zoom does");
});

test("endless: zoomed in is a zoom level, not 'more than the whole map'", () => {
  assert.ok(!isZoomedIn(endless, view, ENDLESS_ZOOMED_IN));
  assert.ok(isZoomedIn(endless, view, ENDLESS_ZOOMED_IN * 1.01));
  assert.ok(!isZoomedIn(endless, { ...view, dpr: 2 }, 3) && isZoomedIn(endless, { ...view, dpr: 2 }, 4.1), "the level is in CSS pixels");
  // A bounded map keeps its rule: past the whole map by a twentieth.
  assert.ok(!isZoomedIn(world, view, fitZoom(world, view) * 1.05) && isZoomedIn(world, view, fitZoom(world, view) * 1.06));
  assert.ok(isFitted(world, view, fit(world, view)) && !isFitted(world, view, { x: 0, y: 0, zoom: fitZoom(world, view) * 1.01 }));
});

test("endless: the bound is reachOf, one seam: a smaller reach (the fog's explored ground and margin) holds the view", () => {
  assert.deepEqual(reachOf(endless), { x0: -H, y0: -0.85 * H, w: 2 * H, h: 1.7 * H });
  const explored = { x0: -100, y0: -50, w: 600, h: 400 };
  const fogged = { ...endless, reach: explored };
  assert.deepEqual(reachOf(fogged), explored);
  const east = clamp({ x: 99999, y: 100, zoom: 4 }, fogged, view);
  assert.ok(near(visible(east, view).x1, 500), "the east edge stops at the reach");
  const wide = clamp({ x: 99999, y: 100, zoom: ENDLESS_MIN_ZOOM }, fogged, view);
  assert.equal(wide.x, 200, "a reach narrower than the view is centred on that axis, as a small map is");
  assert.equal(wide.zoom, ENDLESS_MIN_ZOOM, "and the least zoom does not follow it");
  // the start view is the home view held to the reach: this is the fog's path (a small explored patch holds the start view and key 0)
  const unbounded = { ...endless, reach: undefined };
  assert.deepEqual(fit(fogged, view), clamp(fit(unbounded, view), fogged, view), "fit holds the start view to the reach");
  const patch = { ...endless, reach: { x0: 0, y0: 0, w: 150, h: 100 } };
  assert.deepEqual(fit(patch, view), clamp(fit(unbounded, view), patch, view), "a small explored patch too");
  assert.notDeepEqual(fit(patch, view), fit(unbounded, view), "and it moves the start view off the home centre");
  assert.deepEqual(reachOf(world), { x0: 0, y0: 0, w: 512, h: 320 }, "a bounded map's reach is the map");
  assert.deepEqual(reachOf({ x0: -64, w: 300, h: 320 }), { x0: -64, y0: 0, w: 300, h: 320 });
});

test("miniFrame: a bounded map's is the whole map; an endless plane's is a fixed 16 x 12 chunks, chunk-aligned, following the camera a chunk at a time (E5.3)", () => {
  assert.deepEqual(miniFrame(world), { x0: 0, y0: 0, w: 512, h: 320 });
  assert.deepEqual(
    miniFrame({ x0: -30, w: 200, h: 120 }, { x: 5, y: 5 }),
    { x0: -30, y0: 0, w: 200, h: 120 },
    "the camera is not asked on a bounded map",
  );
  assert.throws(() => miniFrame(endless), /follows the camera/);
  const R = Math.sqrt(3) / 2;
  const f = miniFrame(endless, { x: 5000, y: 3000 });
  assert.equal(f.w, 16 * 64);
  assert.ok(near(f.h, 12 * 64 * R));
  assert.equal(f.x0 % 64, 0, "its corner is a chunk's");
  assert.ok(near(f.y0 / (64 * R), Math.round(f.y0 / (64 * R))));
  assert.ok(5000 >= f.x0 && 5000 < f.x0 + f.w && 3000 >= f.y0 && 3000 < f.y0 + f.h, "it holds the camera");
  assert.deepEqual(miniFrame(endless, { x: 5003, y: 3001 }), f, "the same window while the camera stays in its chunk");
  assert.equal(miniFrame(endless, { x: 5000 + 64, y: 3000 }).x0, f.x0 + 64, "a chunk east: the window moves a chunk");
  assert.ok(miniFrame(endless, { x: -H + 10, y: 0 }).x0 % 64 === 0, "far negative too");
  assert.ok(miniFrame(endless, { x: 9e5, y: -7e5 }).w === f.w, "the same size wherever it is");
});

test("fromMinimap on an endless plane reads window coordinates round the camera; a bounded map's is as before (E5.3)", () => {
  const c = { x: 5000, y: 3000 };
  const f = miniFrame(endless, c);
  const r = minimapRect(f, view, 1);
  assert.equal(r.w, 180);
  assert.ok(near(r.h, (180 * f.h) / f.w), "sized to the window's shape, not the nominal box's");
  const [x0, y0] = fromMinimap(endless, view, 1, r.x, r.y, c);
  assert.ok(near(x0, f.x0) && near(y0, f.y0), "the corner of the minimap is the window's corner");
  const [x1, y1] = fromMinimap(endless, view, 1, r.x + r.w, r.y + r.h, c);
  assert.ok(near(x1, f.x0 + f.w) && near(y1, f.y0 + f.h));
  const [xm, ym] = fromMinimap(endless, view, 1, r.x + r.w / 2, r.y + r.h / 2, c);
  assert.ok(near(xm, f.x0 + f.w / 2) && near(ym, f.y0 + f.h / 2));
  assert.throws(() => fromMinimap(endless, view, 1, r.x, r.y), /follows the camera/);
  const b = minimapRect(world, view, 1);
  assert.deepEqual(fromMinimap(world, view, 1, b.x + b.w / 2, b.y + b.h / 2), [256, 160]);
});
