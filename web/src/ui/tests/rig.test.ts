import assert from "node:assert/strict";
import { test } from "node:test";
import { CURTAIN, PLANE, worldExtent, type WorldMap } from "../../colony/index.ts";
import { clamp, fit, fitZoom, fromMinimap, minimapRect, zoomBy, type Viewport } from "../camera.ts";
import { CameraRig, extentOf, LINK_ZOOM, NEST_ZOOM, type RigHost } from "../field/rig.ts";

// The field's cameras (ja-fnd.6.3.11): one per view, and what moves them. The expectations are computed from `ui/camera.ts`'s maths and
// `worldExtent`, never from the rig.

const map = (x0: number, w: number, h: number) => ({ x0, size: { w, h } }) as unknown as WorldMap;
const PLANE_MAP = map(0, 120, 90);
const CURTAIN_MAP = map(-30, 160, 70);

function setup(o: { view?: number; size?: { w: number; h: number }; dpr?: number; following?: boolean } = {}) {
  const st = { view: o.view ?? PLANE, size: o.size ?? { w: 800, h: 600 }, dpr: o.dpr ?? 1, following: o.following ?? false, unfollowed: 0 };
  const host: RigHost = {
    view: () => st.view,
    map: (v) => (v === PLANE ? PLANE_MAP : CURTAIN_MAP),
    size: () => st.size,
    dpr: () => st.dpr,
    following: () => st.following,
    unfollow: () => {
      st.following = false;
      st.unfollowed++;
    },
  };
  return { rig: new CameraRig(host), st };
}

const vp = (st: { size: { w: number; h: number }; dpr: number }): Viewport => ({ ...st.size, dpr: st.dpr });
const ext = (m: WorldMap) => ({ x0: m.x0, ...worldExtent(m) });

test("extentOf is the map's extent from its first column", () => {
  assert.deepEqual(extentOf(CURTAIN_MAP), { x0: -30, ...worldExtent(CURTAIN_MAP) });
  assert.deepEqual(extentOf(PLANE_MAP), { x0: 0, ...worldExtent(PLANE_MAP) });
});

test("a view's camera is made when first asked for, one a view, and a new game clears them", () => {
  const { rig, st } = setup();
  assert.equal(rig.cams.size, 0);
  const a = rig.of(PLANE);
  assert.deepEqual(a, { cam: null, fitted: true, zoomedIn: false, aim: null });
  assert.equal(rig.of(PLANE), a);
  assert.equal(rig.vc(), a, "the shown view's");
  st.view = CURTAIN;
  assert.notEqual(rig.vc(), a, "the other view has its own");
  assert.equal(rig.cams.size, 2);
  rig.clear();
  assert.equal(rig.cams.size, 0);
  assert.notEqual(rig.of(PLANE), a, "a new game starts afresh");
});

test("the extent and the viewport are read from the page each time: the shown map, the canvas's size, the device ratio", () => {
  const { rig, st } = setup({ size: { w: 1, h: 1 }, dpr: 2 });
  assert.deepEqual(rig.extent(), ext(PLANE_MAP));
  assert.deepEqual(rig.viewport(), { w: 1, h: 1, dpr: 2 });
  st.view = CURTAIN;
  st.size = { w: 640, h: 480 };
  st.dpr = 1;
  assert.deepEqual(rig.extent(), ext(CURTAIN_MAP));
  assert.deepEqual(rig.viewport(), { w: 640, h: 480, dpr: 1 });
});

test("camera: the whole map the first time, and what was stored is kept within the map", () => {
  const { rig, st } = setup();
  const e = ext(PLANE_MAP);
  assert.deepEqual(rig.camera(), clamp(fit(e, vp(st)), e, vp(st)));
  assert.deepEqual(rig.vc().cam, rig.camera(), "stored");
  // far out of the map and past the zoom limit: clamped back in
  rig.vc().cam = { x: -500, y: 9000, zoom: 1e6 };
  assert.deepEqual(rig.camera(), clamp({ x: -500, y: 9000, zoom: 1e6 }, e, vp(st)));
  // the other view's camera is its own, over its own map
  st.view = CURTAIN;
  assert.deepEqual(rig.camera(), fit(ext(CURTAIN_MAP), vp(st)));
});

test("set: clamped, the aim dropped, and noted whether the view shows the whole map or is zoomed in (a twentieth over the fit)", () => {
  const { rig, st } = setup();
  const e = ext(PLANE_MAP);
  const fz = fitZoom(e, vp(st));
  rig.vc().aim = { x: 1, y: 2 };
  rig.set({ x: 60, y: 45, zoom: fz });
  assert.equal(rig.vc().aim, null);
  assert.deepEqual([rig.vc().fitted, rig.vc().zoomedIn], [true, false], "the whole map");
  rig.set({ x: 60, y: 45, zoom: fz * 1.05 });
  assert.deepEqual([rig.vc().fitted, rig.vc().zoomedIn], [false, false], "exactly a twentieth over is not yet zoomed in");
  rig.set({ x: 60, y: 45, zoom: fz * 1.0501 });
  assert.equal(rig.vc().zoomedIn, true);
  rig.set({ x: -1000, y: 1000, zoom: fz * 3 });
  assert.deepEqual(rig.vc().cam, clamp({ x: -1000, y: 1000, zoom: fz * 3 }, e, vp(st)), "clamped");
  rig.set({ x: 60, y: 45, zoom: fz * 1.0001 });
  assert.equal(rig.vc().fitted, true, "exactly a ten-thousandth over: still fitted");
  rig.set({ x: 60, y: 45, zoom: fz * 1.00005 });
  assert.equal(rig.vc().fitted, true, "within a ten-thousandth of the fit is still fitted");
  rig.set({ x: 60, y: 45, zoom: fz * 1.0002 });
  assert.equal(rig.vc().fitted, false);
});

test("zoomAround: the wheel's zoom in its own box, about the pointer, ending an aim", () => {
  const { rig, st } = setup();
  const e = ext(PLANE_MAP);
  const box: Viewport = { w: 400, h: 300, dpr: 2 };
  rig.vc().aim = { x: 1, y: 2 };
  rig.zoomAround(box, 100, 80, 1.5);
  const first = zoomBy(fit(e, box), e, box, 100, 80, 1.5);
  assert.deepEqual(rig.vc().cam, first, "the first time from the whole map in that box");
  assert.equal(rig.vc().aim, null);
  assert.equal(rig.vc().zoomedIn, first.zoom > fitZoom(e, box) * 1.05);
  assert.equal(rig.vc().fitted, first.zoom <= fitZoom(e, box) * 1.0001);
  rig.zoomAround(box, 200, 150, 1.5);
  assert.deepEqual(rig.vc().cam, zoomBy(first, e, box, 200, 150, 1.5), "then from the stored camera");
  rig.zoomAround(box, 200, 150, 1e-6);
  assert.deepEqual([rig.vc().fitted, rig.vc().zoomedIn], [true, false], "all the way out: fitted");
  assert.equal(st.unfollowed, 0, "the wheel does not touch a follow");
});

test("camera leaves the flags and the aim alone", () => {
  const { rig } = setup();
  rig.vc().aim = { x: 1, y: 2 };
  rig.camera();
  assert.deepEqual([rig.vc().fitted, rig.vc().zoomedIn, rig.vc().aim], [true, false, { x: 1, y: 2 }]);
});

test("the minimap takes a point by zoomedIn, not fitted: not in the band between the fit and a twentieth over it, nor after a centreOn at the fit", () => {
  const { rig, st } = setup();
  const e = ext(PLANE_MAP);
  const r = minimapRect(e, vp(st), st.dpr);
  const fz = fitZoom(e, vp(st));
  rig.set({ x: 60, y: 45, zoom: fz * 1.02 });
  assert.deepEqual([rig.vc().fitted, rig.vc().zoomedIn], [false, false]);
  assert.equal(rig.inMini(r.x + 1, r.y + 1), false, "past the fit's tolerance but not yet zoomed in");
  rig.set({ x: 60, y: 45, zoom: fz * 1.06 });
  assert.equal(rig.inMini(r.x + 1, r.y + 1), true);
  rig.centreOn(PLANE, 60, 45);
  rig.vc().zoomedIn = false;
  assert.equal(rig.inMini(r.x + 1, r.y + 1), false, "the flag decides, whatever the zoom");
});

test("zoomAround: exactly a twentieth over the fit is not yet zoomed in, exactly a ten-thousandth over is still fitted", () => {
  const box: Viewport = { w: 400, h: 300, dpr: 2 };
  const fz = fitZoom(ext(PLANE_MAP), box);
  const a = setup().rig;
  a.zoomAround(box, 100, 80, 1.05);
  assert.equal(a.vc().cam!.zoom, fz * 1.05);
  assert.deepEqual([a.vc().fitted, a.vc().zoomedIn], [false, false]);
  const b = setup().rig;
  b.zoomAround(box, 100, 80, 1.0001);
  assert.equal(b.vc().cam!.zoom, fz * 1.0001);
  assert.deepEqual([b.vc().fitted, b.vc().zoomedIn], [true, false]);
});

test("centreOn: the view asked for opens there, at the shown view's zoom, and the aim is kept for the frame to clamp round", () => {
  const { rig, st } = setup();
  const e = ext(PLANE_MAP);
  rig.set({ x: 60, y: 45, zoom: fitZoom(e, vp(st)) * 4 });
  const zoom = rig.vc().cam!.zoom;
  rig.centreOn(CURTAIN, -10, 5);
  const c = rig.cams.get(CURTAIN)!;
  assert.deepEqual(c.cam, { x: -10, y: 5, zoom }, "not clamped, at the shown view's zoom");
  assert.deepEqual(c.aim, { x: -10, y: 5 });
  assert.equal(c.fitted, false);
  assert.equal(c.zoomedIn, zoom > fitZoom(ext(CURTAIN_MAP), vp(st)) * 1.05, "judged against that view's map");
});

test("centreOn judges zoomed in against the map of the view it opens, a twentieth over that map's fit", () => {
  const a = setup();
  const fzP = fitZoom(ext(PLANE_MAP), vp(a.st));
  a.rig.set({ x: 60, y: 45, zoom: fzP * 1.05 });
  a.rig.centreOn(PLANE, 60, 45);
  assert.equal(a.rig.vc().cam!.zoom, fzP * 1.05);
  assert.equal(a.rig.vc().zoomedIn, false, "exactly a twentieth over is not yet zoomed in");
  // curtain shown, close to its fit; the plane it opens has a larger fit, so the same zoom is not zoomed in there
  const b = setup({ view: CURTAIN });
  b.rig.set({ x: 0, y: 0, zoom: 5.5 });
  assert.equal(b.rig.vc().zoomedIn, true, "zoomed in on the curtain");
  b.rig.centreOn(PLANE, 60, 45);
  assert.equal(b.rig.cams.get(PLANE)!.cam!.zoom, 5.5);
  assert.equal(b.rig.cams.get(PLANE)!.zoomedIn, false, "not on the plane");
});

test("centreOn: close, span, and nothing shown yet", () => {
  const { rig, st } = setup({ dpr: 2 });
  const fz = fitZoom(ext(CURTAIN_MAP), vp(st));
  // nothing shown yet: the shown view's zoom is the whole map's; close lifts it to LINK_ZOOM device-ratio cells
  rig.centreOn(CURTAIN, 0, 0);
  assert.equal(rig.cams.get(CURTAIN)!.cam!.zoom, fitZoom(ext(CURTAIN_MAP), vp(st)));
  assert.deepEqual(
    [rig.cams.get(CURTAIN)!.fitted, rig.cams.get(CURTAIN)!.zoomedIn],
    [false, false],
    "asked to centre: never fitted, even at the fit",
  );
  rig.centreOn(CURTAIN, 1, 2, { close: true });
  assert.equal(rig.cams.get(CURTAIN)!.cam!.zoom, Math.max(fz, LINK_ZOOM * 2));
  assert.equal(LINK_ZOOM, 8);
  // already closer than that: kept
  rig.set({ x: 60, y: 45, zoom: 50 });
  rig.centreOn(CURTAIN, 1, 2, { close: true });
  assert.equal(rig.cams.get(CURTAIN)!.cam!.zoom, 50);
  // span: that many world units across the shorter side, and the aim remembers it
  rig.centreOn(CURTAIN, 3, 4, { span: 40 });
  const c = rig.cams.get(CURTAIN)!;
  assert.equal(c.cam!.zoom, Math.min(800, 600) / 40);
  assert.deepEqual(c.aim, { x: 3, y: 4, span: 40 });
  rig.centreOn(CURTAIN, 3, 4, { span: 40, close: true });
  assert.equal(rig.cams.get(CURTAIN)!.cam!.zoom, 600 / 40, "span wins over close");
});

test("centreOn: looking elsewhere in the shown view ends a follow; another view, or keepFollow, does not", () => {
  const a = setup({ following: true });
  a.rig.centreOn(PLANE, 5, 5);
  assert.equal(a.st.unfollowed, 1, "the shown view");
  const b = setup({ following: true });
  b.rig.centreOn(CURTAIN, 5, 5);
  assert.equal(b.st.unfollowed, 0, "a follow carried to the other view goes on");
  const c = setup({ following: true });
  c.rig.centreOn(PLANE, 5, 5, { keepFollow: true });
  assert.equal(c.st.unfollowed, 0, "the page carrying the followed ant itself");
  const d = setup({ following: false });
  d.rig.centreOn(PLANE, 5, 5);
  assert.equal(d.st.unfollowed, 0, "nothing followed: nothing to end");
});

test("showAll ends a follow always and fits the shown view; goTo centres between the entrance and the nest at least NEST_ZOOM close", () => {
  const { rig, st } = setup({ following: true, dpr: 2 });
  rig.set({ x: 10, y: 10, zoom: 40 });
  rig.showAll();
  assert.equal(st.unfollowed, 1);
  assert.deepEqual(rig.vc().cam, clamp(fit(ext(PLANE_MAP), vp(st)), ext(PLANE_MAP), vp(st)));
  assert.equal(rig.vc().fitted, true);
  // showAll with nothing followed still ends it (a no-op the page ignores)
  st.following = false;
  rig.showAll();
  assert.equal(st.unfollowed, 2);
  rig.goTo({ x: 40, y: 30, entrance: { x: 50, y: 10 } });
  assert.equal(st.unfollowed, 3);
  const z = Math.max(fitZoom(ext(PLANE_MAP), vp(st)), NEST_ZOOM * 2);
  assert.deepEqual(rig.vc().cam, clamp({ x: 45, y: 20, zoom: z }, ext(PLANE_MAP), vp(st)));
  assert.equal(NEST_ZOOM, 8);
  // no entrance: the nest itself; already closer than that: kept
  rig.set({ x: 60, y: 45, zoom: 60 });
  rig.goTo({ x: 70, y: 40, entrance: null });
  assert.deepEqual(rig.vc().cam, clamp({ x: 70, y: 40, zoom: 60 }, ext(PLANE_MAP), vp(st)));
  rig.goTo({ x: 71, y: 41 });
  assert.equal(rig.vc().cam!.x, 71);
});

for (const dpr of [1, 2])
  test(`the minimap takes a point only while the view is zoomed in, edges included; a jump looks there at the same zoom and ends a follow (device ratio ${dpr})`, () => {
    const { rig, st } = setup({ following: true, dpr });
    const e = ext(PLANE_MAP);
    const r = minimapRect(e, vp(st), st.dpr);
    assert.equal(rig.inMini(r.x + 1, r.y + 1), false, "the whole map: no minimap");
    rig.set({ x: 60, y: 45, zoom: fitZoom(e, vp(st)) * 3 });
    assert.equal(rig.inMini(r.x + 1, r.y + 1), true);
    for (const [x, y, inside] of [
      [r.x, r.y, true],
      [r.x + r.w, r.y + r.h, true],
      [r.x - 0.01, r.y + 1, false],
      [r.x + 1, r.y - 0.01, false],
      [r.x + r.w + 0.01, r.y + 1, false],
      [r.x + 1, r.y + r.h + 0.01, false],
    ] as const)
      assert.equal(rig.inMini(x, y), inside, `${x},${y}`);
    const zoom = rig.vc().cam!.zoom;
    rig.jumpMini(r.x + r.w / 4, r.y + r.h / 4);
    const [wx, wy] = fromMinimap(e, vp(st), st.dpr, r.x + r.w / 4, r.y + r.h / 4);
    assert.deepEqual(rig.vc().cam, clamp({ x: wx, y: wy, zoom }, e, vp(st)));
    assert.equal(st.unfollowed, 1, "a follow ends");
    rig.jumpMini(r.x + r.w / 2, r.y + r.h / 2);
    assert.equal(st.unfollowed, 1, "nothing followed now: nothing to end");
  });
