import assert from "node:assert/strict";
import { test } from "node:test";
import { CHUNK, CURTAIN, generateEndlessPlane, INFECTED, PLANE, R, worldExtent, type Colony, type WorldMap } from "../../colony/index.ts";
import { Knowledge } from "../fog/knowledge.ts";
import { SensedMap } from "../fungusSight.ts";
import { clamp, fit, fitZoom, fromMinimap, miniFrame, minimapRect, MINI_CHUNKS_W, zoomBy, type Viewport } from "../camera.ts";
import { CameraRig, extentOf, FOG_MARGIN, LINK_ZOOM, NEST_ZOOM, type RigHost } from "../field/rig.ts";
import { readFileSync } from "node:fs";

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

test("an endless plane's extent carries its flag and a home on the start nests; the rig starts there and pans far (ja-qpv.4.2)", () => {
  const plane = generateEndlessPlane(1);
  const e = extentOf(plane);
  assert.equal(e.endless, true);
  const [a, b] = plane.plane.startNests();
  const home = e.home!;
  for (const n of [a, b])
    assert.ok(n.x > home.x0 && n.x < home.x0 + home.w && n.y > home.y0 && n.y < home.y0 + home.h, "both start nests are inside it");
  const v = { w: 800, h: 600, dpr: 1 };
  const host: RigHost = { view: () => PLANE, map: () => plane, size: () => v, dpr: () => 1, following: () => false, unfollow: () => {} };
  const r = new CameraRig(host);
  const c = r.camera();
  assert.deepEqual(c, fit(e, v));
  r.set({ x: c.x + 50000, y: c.y - 40000, zoom: c.zoom });
  assert.equal(r.camera().x, c.x + 50000, "no clamp to a map");
  assert.equal(r.vc().fitted, false);
  assert.equal(r.vc().zoomedIn, true, "zoomed in is a level: the start view is past it");
  r.zoomAround(v, 400, 300, 1e6);
  assert.equal(r.vc().zoomedIn, true);
  // E5.2 pinned "no minimap on an endless plane" here (inMini false at a corner point); E5.3 replaces that on purpose: the minimap is the window, tested below.
  assert.equal(r.inMini(790, 590), true, "the window's corner rectangle takes a point (E5.3)");
  r.zoomAround(v, 400, 300, 1e-6);
  assert.equal(r.camera().zoom, 0.5, "the least zoom is fixed");
  r.showAll();
  assert.deepEqual(r.camera(), c, "key 0 returns to the start nests");
  assert.equal(r.vc().fitted, true);
});

test("on an endless plane the minimap is the window round the camera: inMini takes the window's rectangle, jumpMini reads window coordinates and recentres the window on the click (E5.3, ja-qpv.4.3)", () => {
  const plane = generateEndlessPlane(1);
  const v = { w: 800, h: 600, dpr: 1 };
  const st = { following: true, unfollowed: 0 };
  const host: RigHost = {
    view: () => PLANE,
    map: () => plane,
    size: () => v,
    dpr: () => 1,
    following: () => st.following,
    unfollow: () => {
      st.following = false;
      st.unfollowed++;
    },
  };
  const rig = new CameraRig(host);
  const e = extentOf(plane);
  const at = { x: 40000, y: -30000, zoom: 8 };
  rig.set(at);
  const win = miniFrame(e, at);
  assert.equal(win.w, MINI_CHUNKS_W * CHUNK, "the window is a fixed number of chunks, not the nominal box");
  assert.ok(at.x >= win.x0 && at.x < win.x0 + win.w && at.y >= win.y0 && at.y < win.y0 + win.h, "and holds the camera");
  const r = minimapRect(win, v, 1);
  assert.equal(r.w, 180);
  for (const [x, y, inside] of [
    [r.x, r.y, true],
    [r.x + r.w, r.y + r.h, true],
    [r.x - 0.01, r.y + 1, false],
    [r.x + 1, r.y - 0.01, false],
    [r.x + r.w + 0.01, r.y + 1, false],
    [r.x + 1, r.y + r.h + 0.01, false],
  ] as const)
    assert.equal(rig.inMini(x, y), inside, `${x},${y}`);
  // the nominal box's rectangle (the shape the bounded minimap would take) is not what takes a point: the window's is a different shape
  const nominal = minimapRect(e, v, 1);
  assert.notEqual(nominal.h, r.h);
  assert.equal(rig.inMini(r.x + 1, r.y + r.h + 1), false, "below the window's rectangle (the nominal box's is taller)");
  // a click a quarter of the way in looks at the window's point there, at the same zoom, and ends the follow
  rig.jumpMini(r.x + r.w / 4, r.y + r.h / 4);
  const want = { x: win.x0 + win.w / 4, y: win.y0 + win.h / 4 };
  assert.ok(Math.abs(rig.camera().x - want.x) < 1e-6 && Math.abs(rig.camera().y - want.y) < 1e-6, "window coordinates");
  assert.equal(rig.camera().zoom, 8);
  assert.equal(st.unfollowed, 1);
  // and the window now follows the camera: the clicked place is within a chunk of its middle
  const next = miniFrame(e, rig.camera());
  assert.ok(
    Math.abs(next.x0 + next.w / 2 - want.x) <= CHUNK && Math.abs(next.y0 + next.h / 2 - want.y) <= CHUNK * 0.87 + CHUNK / 2,
    "recentred on the jump",
  );
  // the minimap's middle is now (within a chunk) the clicked place: a second click in the middle moves the camera less than a chunk
  const before = rig.camera();
  const r2 = minimapRect(next, v, 1);
  rig.jumpMini(r2.x + r2.w / 2, r2.y + r2.h / 2);
  assert.ok(Math.hypot(rig.camera().x - before.x, rig.camera().y - before.y) <= 1.5 * CHUNK);
  // zoomed out below the level: no minimap
  rig.set({ x: at.x, y: at.y, zoom: 0.5 });
  assert.equal(rig.inMini(r.x + 1, r.y + 1), false);
});

// The camera under the fog (F7b, ja-1ypq.10): on an endless plane the view may go only where the fungus has explored plus FOG_MARGIN.

/** A host at world point (x, y) on the plane. */
const hostAtWorld = (x: number, y: number): Colony =>
  ({
    n: 1,
    params: { sensorDistance: 3 },
    alates: [],
    alive: Uint8Array.of(1),
    load: Float32Array.of(INFECTED),
    layer: Uint8Array.of(PLANE),
    x: Float32Array.of(x),
    y: Float32Array.of(y),
    holeCells: [],
  }) as unknown as Colony;

/** An endless plane with a fog that has explored the start nests and a place `chunks` chunks east of them. */
function fogged(chunks: number) {
  const plane = generateEndlessPlane(1);
  const sensed = new SensedMap();
  sensed.endless = true; // an endless plane has rows above 0 (stampGame sets it from the game; there is no game here)
  const k = new Knowledge(sensed, []);
  const [a] = plane.plane.startNests();
  sensed.stamp([hostAtWorld(a.x, a.y)], 10);
  if (chunks > 0) sensed.stamp([hostAtWorld(a.x + chunks * CHUNK, a.y)], 11);
  return { plane, k, a };
}

test("under the fog the extent has no reach until something is explored, and no fog or a bounded map gives the extent it always did", () => {
  const plane = generateEndlessPlane(1);
  const bare = extentOf(plane);
  assert.equal("reach" in bare, false);
  assert.deepEqual(extentOf(plane, null), bare, "no fog");
  const sensed = new SensedMap();
  assert.deepEqual(extentOf(plane, new Knowledge(sensed, [])), bare, "a fog that has explored nothing");
  const { k } = fogged(0);
  assert.deepEqual(extentOf(PLANE_MAP, k), extentOf(PLANE_MAP), "a bounded map ignores the fog");
  assert.deepEqual(extentOf(CURTAIN_MAP, k), extentOf(CURTAIN_MAP));
});

test("the reach is the explored chunks plus the margin, joined with the start view, so the start view is unchanged", () => {
  const { plane, k } = fogged(0);
  const box = k.bounds(PLANE)!;
  const e = extentOf(plane, k);
  const home = e.home!;
  const r = e.reach!;
  assert.ok(r.x0 <= home.x0 && r.y0 <= home.y0 && r.x0 + r.w >= home.x0 + home.w && r.y0 + r.h >= home.y0 + home.h, "holds the start view");
  assert.ok(
    r.x0 <= box.cx0 * CHUNK - FOG_MARGIN && r.x0 + r.w >= (box.cx1 + 1) * CHUNK + FOG_MARGIN,
    "holds the explored chunks and the margin",
  );
  const v = { w: 800, h: 600, dpr: 1 };
  const host: RigHost = {
    view: () => PLANE,
    map: () => plane,
    size: () => v,
    dpr: () => 1,
    following: () => false,
    unfollow: () => {},
    fog: () => k,
  };
  assert.deepEqual(new CameraRig(host).camera(), fit(extentOf(plane), v), "the camera starts where it did without the fog");
});

test("the camera cannot pan past the explored ground and the margin, and goes on as far as that", () => {
  const { plane, k } = fogged(10);
  const box = k.bounds(PLANE)!;
  const home = extentOf(plane).home!; // the reach always holds the start view too
  const v = { w: 800, h: 600, dpr: 1 };
  const host: RigHost = {
    view: () => PLANE,
    map: () => plane,
    size: () => v,
    dpr: () => 1,
    following: () => false,
    unfollow: () => {},
    fog: () => k,
  };
  const rig = new CameraRig(host);
  const zoom = 8; // half the view is 50 cells wide and 37.5 tall
  rig.set({ x: 1e9, y: 0, zoom });
  assert.equal(
    rig.camera().x,
    Math.max((box.cx1 + 1) * CHUNK + FOG_MARGIN, home.x0 + home.w) - 50,
    "the view's right edge stops at the explored ground plus the margin",
  );
  rig.set({ x: -1e9, y: 0, zoom });
  assert.equal(rig.camera().x, Math.min(box.cx0 * CHUNK - FOG_MARGIN, home.x0) + 50, "and its left edge");
  rig.set({ x: 0, y: 1e9, zoom });
  const near = (a: number, b: number, why: string) => assert.ok(Math.abs(a - b) < 1e-9, `${why}: ${a} against ${b}`);
  near(
    rig.camera().y,
    Math.max((box.cy1 + 1) * CHUNK * R + FOG_MARGIN * R, home.y0 + home.h) - 37.5,
    "and its bottom edge (y in rows of R)",
  );
  rig.set({ x: 0, y: -1e9, zoom });
  near(rig.camera().y, Math.min(box.cy0 * CHUNK * R - FOG_MARGIN * R, home.y0) + 37.5, "and its top edge");
  // the ground explored far to the east is reachable, and so is the margin past it
  rig.set({ x: (box.cx1 + 1) * CHUNK + 20, y: 0, zoom });
  assert.equal(rig.camera().x, (box.cx1 + 1) * CHUNK + 20, "the margin past the edge can be looked at");
  // with the fog gone (suspended for the builder) the plane is as free as before
  const free = new CameraRig({ ...host, fog: () => null });
  free.set({ x: 1e6, y: 0, zoom });
  assert.equal(free.camera().x, 1e6);
});

test("the margin is two chunks, 128 cells", () => {
  assert.equal(FOG_MARGIN, 128);
});

test("explored far west, east, north or south, the far edge of the reach is the explored chunks plus the margin and the near edge is the start view", () => {
  const near = (a: number, b: number, why: string) => assert.ok(Math.abs(a - b) < 1e-9, `${why}: ${a} against ${b}`);
  const plane = generateEndlessPlane(1);
  const home = extentOf(plane).home!;
  const [a] = plane.plane.startNests();
  const explore = (dx: number, dy: number) => {
    const sensed = new SensedMap();
    sensed.endless = true;
    const k = new Knowledge(sensed, []);
    sensed.stamp([hostAtWorld(a.x + dx * 30 * CHUNK, a.y + dy * 30 * CHUNK * R)], 10);
    return { box: k.bounds(PLANE)!, reach: extentOf(plane, k).reach! };
  };
  const east = explore(1, 0);
  near(
    east.reach.x0 + east.reach.w,
    (east.box.cx1 + 1) * CHUNK + FOG_MARGIN,
    "east: the right edge is the explored chunks plus the margin",
  );
  near(east.reach.x0, home.x0, "east: the left edge is the start view");
  const west = explore(-1, 0);
  near(west.reach.x0, west.box.cx0 * CHUNK - FOG_MARGIN, "west: the left edge is the explored chunks less the margin");
  near(west.reach.x0 + west.reach.w, home.x0 + home.w, "west: the right edge is the start view");
  const south = explore(0, 1);
  near(
    south.reach.y0 + south.reach.h,
    (south.box.cy1 + 1) * CHUNK * R + FOG_MARGIN * R,
    "south: the bottom edge is the explored rows plus the margin",
  );
  near(south.reach.y0, home.y0, "south: the top edge is the start view");
  const north = explore(0, -1);
  near(north.reach.y0, north.box.cy0 * CHUNK * R - FOG_MARGIN * R, "north: the top edge is the explored rows less the margin");
  near(north.reach.y0 + north.reach.h, home.y0 + home.h, "north: the bottom edge is the start view");
});

test("the page hands the fog to the camera rig and to the frame's extent (the lines the pure tests cannot reach)", () => {
  const read = (f: string) => readFileSync(new URL(f, import.meta.url), "utf8");
  assert.match(read("../useCameraRig.ts"), /fog: \(\) => r\.sensed\.current\.knowledge/);
  const binding = read("../field/binding.ts");
  assert.equal(
    (binding.match(/extentOf\([^)]*this\.#sensed\.knowledge\)/g) ?? []).length,
    3,
    "the constructor, #rebuild and each frame's bind",
  );
});

// ---- ja-qpv.4.7: the endless minimap's window is frozen from the press to its release ----

function endlessRig(o: { following?: boolean } = {}) {
  const plane = generateEndlessPlane(1);
  const v = { w: 800, h: 600, dpr: 1 };
  const st = { view: PLANE, following: o.following ?? false, unfollowed: 0 };
  const rig = new CameraRig({
    view: () => st.view,
    map: () => plane,
    size: () => v,
    dpr: () => 1,
    following: () => st.following,
    unfollow: () => {
      st.following = false;
      st.unfollowed++;
    },
  });
  rig.set({ x: 40000, y: -30000, zoom: 8 });
  return { rig, st, v, e: extentOf(plane) };
}

test("holdMini keeps the window taken at the press: inMini, jumpMini and frozenMini read it though the camera moves (a followed ant), until releaseMini", () => {
  const { rig, st, v, e } = endlessRig({ following: true });
  const win = miniFrame(e, rig.camera());
  assert.equal(rig.frozenMini(), null, "following until pressed");
  rig.holdMini();
  assert.deepEqual(rig.frozenMini(), win);
  // the camera is carried five chunks east (what a follow does): the live window would move, the frozen one does not
  rig.set({ ...rig.camera(), x: rig.camera().x + 5 * CHUNK });
  assert.notDeepEqual(miniFrame(e, rig.camera()), win);
  assert.deepEqual(rig.miniWindow(), win);
  assert.deepEqual(rig.frozenMini(), win);
  const r = minimapRect(win, v, 1);
  assert.equal(rig.inMini(r.x + 1, r.y + 1), true);
  rig.jumpMini(r.x + r.w / 4, r.y + r.h / 4);
  const want = { x: win.x0 + win.w / 4, y: win.y0 + win.h / 4 };
  assert.ok(Math.abs(rig.camera().x - want.x) < 1e-6 && Math.abs(rig.camera().y - want.y) < 1e-6, "in the frozen window's coordinates");
  assert.equal(st.unfollowed, 1);
  // the same pointer place again: the same camera (no joystick)
  const first = rig.camera();
  rig.jumpMini(r.x + r.w / 4, r.y + r.h / 4);
  rig.jumpMini(r.x + r.w / 4, r.y + r.h / 4);
  assert.deepEqual(rig.camera(), first);
  rig.releaseMini();
  assert.equal(rig.frozenMini(), null);
  assert.deepEqual(rig.miniWindow(), miniFrame(e, rig.camera()), "the window follows the camera again");
});

test("a held drag that leaves the minimap's rectangle is held to it: the camera stops at the frozen window's edge, whatever the distance (owner, ja-4omg)", () => {
  const { rig, v, e } = endlessRig();
  const win = miniFrame(e, rig.camera());
  rig.holdMini();
  const r = minimapRect(win, v, 1);
  const at = (px: number, py: number) => {
    rig.jumpMini(px, py);
    return { x: rig.camera().x, y: rig.camera().y };
  };
  // the corners and edges of the rectangle, taken from inside it
  const corner = at(r.x + r.w, r.y + r.h);
  // far outside to the south east, and just outside: the same corner, not an extrapolation
  assert.deepEqual(at(r.x + r.w + 5000, r.y + r.h + 3000), corner, "far past the corner: the corner");
  assert.deepEqual(at(r.x + r.w + 1, r.y + r.h + 1), corner, "just past it: the corner");
  // past one edge only: the pointer's other coordinate still counts
  const top = at(r.x + r.w / 2, r.y);
  const topFar = at(r.x + r.w / 2, r.y - 4000);
  assert.deepEqual(topFar, top, "above the rectangle: the top edge at the same x");
  const west = at(r.x, r.y + r.h / 2);
  assert.deepEqual(at(r.x - 9000, r.y + r.h / 2), west, "left of the rectangle: the west edge at the same y");
  // the corner is the window's own corner, in world units (the edge of what the picture shows)
  assert.ok(
    Math.abs(corner.x - (win.x0 + win.w)) < 1e-6 && Math.abs(corner.y - (win.y0 + win.h)) < 1e-6,
    "the window's corner in world units",
  );
  rig.releaseMini();
});

test("a jump on a bounded map is never held to a window: the bounded map's own clamp to the map stands", () => {
  const { rig, st } = setup();
  const e = extentOf(PLANE_MAP);
  rig.set({ x: 60, y: 45, zoom: fitZoom(e, vp(st)) * 3 });
  rig.holdMini(); // a no-op on a bounded map
  assert.equal(rig.frozenMini(), null);
  rig.jumpMini(5000, 5000); // far outside: clamped to the map as ever
  const c = rig.camera();
  assert.ok(c.x <= 120 + 1e-6 && c.y <= 90 + 1e-6 && c.x >= 0 && c.y >= 0, `on the map (${c.x}, ${c.y})`);
});

test("a freeze ends of itself: zoomed out (no minimap), another view, a new game; a bounded map never takes one", () => {
  const out = endlessRig();
  out.rig.holdMini();
  assert.notEqual(out.rig.frozenMini(), null);
  out.rig.set({ ...out.rig.camera(), zoom: 0.5 });
  assert.equal(out.rig.frozenMini(), null, "zoomed out while down");
  out.rig.set({ ...out.rig.camera(), zoom: 8 });
  assert.equal(out.rig.frozenMini(), null, "and it does not come back when zoomed in again");

  const sw = endlessRig();
  sw.rig.holdMini();
  sw.st.view = CURTAIN;
  sw.rig.set({ x: 40000, y: -30000, zoom: 8 }); // zoomed in there too: only the view tells it from the one the press was in
  assert.equal(sw.rig.frozenMini(), null, "switching view");
  sw.st.view = PLANE;
  assert.equal(sw.rig.frozenMini(), null);

  const clr = endlessRig();
  clr.rig.holdMini();
  clr.rig.clear();
  clr.rig.set({ x: 40000, y: -30000, zoom: 8 });
  assert.equal(clr.rig.frozenMini(), null, "a new game");

  const { rig } = setup();
  const view = { w: 800, h: 600, dpr: 1 };
  rig.set(fit(ext(PLANE_MAP), view));
  rig.set({ ...rig.camera(), zoom: 20 });
  rig.holdMini();
  assert.equal(rig.frozenMini(), null, "bounded: nothing to freeze");
  const e = ext(PLANE_MAP);
  assert.deepEqual(rig.miniWindow(), miniFrame(e));
  const r = minimapRect(e, view, 1);
  assert.equal(rig.inMini(r.x + 1, r.y + 1), true);
});
