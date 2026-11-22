import assert from "node:assert/strict";
import { test } from "node:test";
import { PLANE, CURTAIN, type Colony } from "../../colony/index.ts";
import { clamp, fit, fitZoom, type Extent, type Viewport } from "../camera.ts";
import { prepareFrame, type PreludeRefs, type ViewCam } from "../field/prelude.ts";
import type { Followed } from "../follow.ts";

// The follow, the crossing through a hole and the camera's ease, run before every frame (ja-fnd.6.3.13). Nothing tested them before the
// frame was split out of ColonyField; the e2e flake ja-18u was blamed on the crossing's judgement (carryTo).

const EXT: Extent = { w: 100, h: 60 };
const V: Viewport = { w: 800, h: 600, dpr: 1 };

/** One colony of one ant: the arrays the prelude reads (alive, gen, layer, x, y). */
function colony(at: { layer: number; x: number; y: number; alive?: boolean; gen?: number }): Colony {
  return { alive: [at.alive ?? true], gen: [at.gen ?? 0], layer: [at.layer], x: [at.x], y: [at.y] } as unknown as Colony;
}

const NEW = (): ViewCam => ({ cam: null, fitted: true, zoomedIn: false, aim: null });

function refs(followed: Followed | null) {
  const told: (Followed | null)[] = [];
  const crossed: [number, number, number][] = [];
  const r: PreludeRefs = {
    follow: { current: followed },
    followCb: { current: (f) => void told.push(f) },
    antLayer: { current: null },
    carryTo: { current: null },
    crossCb: { current: (layer, x, y) => void crossed.push([layer, x, y]) },
  };
  return { r, told, crossed };
}

const ANT: Followed = { k: 0, i: 0, gen: 0 };

test("with no follow, a fitted view draws the whole map and is not zoomed in", () => {
  const { r, told, crossed } = refs(null);
  const s = NEW();
  const c = prepareFrame([colony({ layer: PLANE, x: 10, y: 10 })], PLANE, EXT, V, s, r);
  assert.deepEqual(c, clamp(fit(EXT, V), EXT, V));
  assert.equal(s.cam, c);
  assert.equal(s.zoomedIn, false);
  assert.equal(r.antLayer.current, null);
  assert.deepEqual([told, crossed], [[], []]);
});

test("a followed ant on the view's layer takes the camera and the aim, keeping the zoom", () => {
  const { r } = refs(ANT);
  const zoom = fitZoom(EXT, V) * 3;
  const s: ViewCam = { cam: { x: 50, y: 30, zoom }, fitted: false, zoomedIn: false, aim: { x: 5, y: 5 } };
  const c = prepareFrame([colony({ layer: PLANE, x: 60, y: 35 })], PLANE, EXT, V, s, r);
  assert.equal(c.x, 60);
  assert.equal(c.y, 35);
  assert.equal(c.zoom, zoom);
  assert.equal(s.aim, null, "the follow ends an aim");
  assert.equal(s.zoomedIn, true);
});

test("an ant that is gone (dead, or its slot reborn) ends the follow and tells the page once", () => {
  for (const gone of [{ alive: false }, { gen: 1 }]) {
    const { r, told } = refs(ANT);
    prepareFrame([colony({ layer: PLANE, x: 1, y: 1, ...gone })], PLANE, EXT, V, NEW(), r);
    assert.equal(r.follow.current, null);
    assert.deepEqual(told, [null]);
    prepareFrame([colony({ layer: PLANE, x: 1, y: 1, ...gone })], PLANE, EXT, V, NEW(), r);
    assert.deepEqual(told, [null], "told once, not every frame");
  }
});

test("an ant on the other layer than the view's holds the camera where it was", () => {
  const { r } = refs(ANT);
  const cam = { x: 20, y: 20, zoom: fitZoom(EXT, V) * 3 };
  const s: ViewCam = { cam, fitted: false, zoomedIn: true, aim: null };
  const c = prepareFrame([colony({ layer: CURTAIN, x: 90, y: 50 })], PLANE, EXT, V, s, r);
  assert.deepEqual(c, clamp(cam, EXT, V));
});

test("a followed ant going through a hole is reported once, with where it came out, and the page's carry is remembered", () => {
  const { r, crossed } = refs(ANT);
  const s = NEW();
  prepareFrame([colony({ layer: PLANE, x: 10, y: 10 })], PLANE, EXT, V, s, r);
  assert.deepEqual(crossed, [], "the first frame of a follow only records its layer");
  assert.deepEqual(r.antLayer.current, { f: ANT, layer: PLANE });
  const below = [colony({ layer: CURTAIN, x: 12, y: 40 })];
  prepareFrame(below, PLANE, EXT, V, s, r);
  assert.deepEqual(crossed, [[CURTAIN, 12, 40]]);
  assert.equal(r.carryTo.current, CURTAIN);
  prepareFrame(below, PLANE, EXT, V, s, r);
  assert.deepEqual(crossed.length, 1, "the same crossing is not reported again while the page switches the view");
  // the view arrives where the ant is: the carry is done
  prepareFrame(below, CURTAIN, EXT, V, s, r);
  assert.equal(r.carryTo.current, null);
  assert.equal(crossed.length, 1);
});

test("an ant that pops up and drops back before the view has switched is reported both ways (the e2e guard's one in twenty)", () => {
  const { r, crossed } = refs(ANT);
  const s = NEW();
  prepareFrame([colony({ layer: PLANE, x: 10, y: 10 })], PLANE, EXT, V, s, r);
  prepareFrame([colony({ layer: CURTAIN, x: 11, y: 30 })], PLANE, EXT, V, s, r); // down: the page is asked for the curtain
  assert.equal(r.carryTo.current, CURTAIN);
  // the view is still the plane when the ant is back on it: judged against the view on its way (the curtain), it is a crossing back
  prepareFrame([colony({ layer: PLANE, x: 10, y: 11 })], PLANE, EXT, V, s, r);
  assert.deepEqual(
    crossed.map((c) => c[0]),
    [CURTAIN, PLANE],
  );
  assert.equal(r.carryTo.current, PLANE);
});

test("a new follow starts afresh: no crossing for its first frame, whatever layer it is on", () => {
  const { r, crossed } = refs(ANT);
  const s = NEW();
  r.antLayer.current = { f: { k: 0, i: 0, gen: 0 }, layer: PLANE }; // the previous follow's record (another object)
  r.carryTo.current = CURTAIN;
  prepareFrame([colony({ layer: CURTAIN, x: 12, y: 40 })], PLANE, EXT, V, s, r);
  assert.deepEqual(crossed, []);
  assert.equal(r.carryTo.current, null);
  assert.equal(r.antLayer.current?.layer, CURTAIN);
});

test("without a follow the crossing records are cleared", () => {
  const { r } = refs(null);
  r.antLayer.current = { f: ANT, layer: PLANE };
  r.carryTo.current = CURTAIN;
  prepareFrame([colony({ layer: PLANE, x: 1, y: 1 })], PLANE, EXT, V, NEW(), r);
  assert.equal(r.antLayer.current, null);
  assert.equal(r.carryTo.current, null);
});

test("an unfitted view eases toward its aim, clamped to the map, and says whether it is zoomed in past the whole map", () => {
  const { r } = refs(null);
  const fz = fitZoom(EXT, V);
  const s: ViewCam = { cam: { x: 50, y: 30, zoom: fz * 4 }, fitted: false, zoomedIn: false, aim: { x: 2, y: 2 } };
  const c = prepareFrame([colony({ layer: PLANE, x: 1, y: 1 })], PLANE, EXT, V, s, r);
  assert.equal(c.zoom, fz * 4);
  assert.deepEqual(c, clamp({ x: 2, y: 2, zoom: fz * 4 }, EXT, V), "centred on the aim, clamped to the map");
  assert.ok(c.x > 2 && c.y > 2, "clamped so the view stays on the map, not centred on the corner");
  assert.equal(s.cam, c);
  assert.equal(s.zoomedIn, true);
  assert.equal(s.aim !== null, true, "the aim is kept, and clamped afresh each frame");
  // the whole map fitted: not zoomed in
  const whole: ViewCam = { cam: { x: 50, y: 30, zoom: fz }, fitted: false, zoomedIn: true, aim: null };
  prepareFrame([colony({ layer: PLANE, x: 1, y: 1 })], PLANE, EXT, V, whole, r);
  assert.equal(whole.zoomedIn, false);
  // a hair past the whole map (under 5 %) is still the whole map: the minimap does not show
  const hair: ViewCam = { cam: { x: 50, y: 30, zoom: fz * 1.02 }, fitted: false, zoomedIn: true, aim: null };
  prepareFrame([colony({ layer: PLANE, x: 1, y: 1 })], PLANE, EXT, V, hair, r);
  assert.equal(hair.zoomedIn, false);
});
