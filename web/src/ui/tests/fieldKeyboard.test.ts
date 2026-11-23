import assert from "node:assert/strict";
import { test } from "node:test";
import { pan, zoomBy, type Camera, type Viewport } from "../camera.ts";
import { handleKey, handleWheel, WHEEL_RATE, type KeyHost, type KeyInput } from "../field/keyboard.ts";
import { panGround } from "../field/rig.ts";

// The field's keys and wheel (ja-fnd.6.3.11 part 3): a fake host records what they ask of the page, and the camera expectations are
// computed from `ui/camera.ts`'s maths, never from the handlers.

const VIEW: Viewport = { w: 800, h: 600, dpr: 1 };
const EXTENT = { x0: 0, w: 400, h: 300 };
const STEP = 0.15 * 600; // the smaller side of the view

function setup(o: { angled?: boolean; tilt?: number; following?: boolean } = {}) {
  const st = {
    cam: { x: 200, y: 150, zoom: 2 } as Camera,
    angled: o.angled ?? false,
    tilt: o.tilt ?? 0,
    following: o.following ?? false,
    sets: [] as Camera[],
    unfollows: 0,
    showAlls: 0,
    nests: 0,
  };
  const host: KeyHost = {
    rig: {
      camera: () => st.cam,
      set: (c) => {
        st.cam = c;
        st.sets.push(c);
      },
      viewport: () => VIEW,
      extent: () => EXTENT,
      showAll: () => st.showAlls++,
    },
    angled: () => st.angled,
    tilt: () => st.tilt,
    following: () => st.following,
    unfollow: () => {
      st.following = false;
      st.unfollows++;
    },
    nextNest: () => st.nests++,
  };
  return { st, host };
}

const key = (k: string, o: Partial<KeyInput> = {}): KeyInput => ({
  key: k,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  defaultPrevented: false,
  ...o,
});

test("the arrows and WASD pan by a seventh of the smaller side the other way, and the key is the field's", () => {
  const moves: [string, number, number][] = [
    ["ArrowLeft", STEP, 0],
    ["a", STEP, 0],
    ["ArrowRight", -STEP, 0],
    ["d", -STEP, 0],
    ["ArrowUp", 0, STEP],
    ["w", 0, STEP],
    ["ArrowDown", 0, -STEP],
    ["s", 0, -STEP],
  ];
  for (const [k, dx, dy] of moves) {
    const { st, host } = setup();
    const start = st.cam;
    assert.equal(handleKey(host, key(k)), true, k);
    assert.deepEqual(st.sets, [pan(start, dx, dy)], k);
  }
});

test("Shift or Caps Lock still moves: an upper-case letter is the same key", () => {
  const { st, host } = setup();
  const start = st.cam;
  assert.equal(handleKey(host, key("A")), true);
  assert.deepEqual(st.sets, [pan(start, STEP, 0)]);
});

test("on a tilted map a vertical move is along the ground (divided by the cosine of the tilt), a horizontal one is not", () => {
  const { st, host } = setup({ angled: true, tilt: Math.PI / 3 });
  const start = st.cam;
  handleKey(host, key("ArrowUp"));
  assert.deepEqual(st.sets[0], pan(start, 0, STEP / Math.cos(Math.PI / 3)));
  handleKey(host, key("ArrowLeft"));
  assert.deepEqual(st.sets[1], pan(st.sets[0]!, STEP, 0));
});

test("a move drops a follow; a zoom does not", () => {
  const moved = setup({ following: true });
  handleKey(moved.host, key("ArrowLeft"));
  assert.equal(moved.st.unfollows, 1);
  const free = setup();
  handleKey(free.host, key("ArrowLeft"));
  assert.equal(free.st.unfollows, 0, "nothing to drop");
  const zoomed = setup({ following: true });
  handleKey(zoomed.host, key("+"));
  assert.equal(zoomed.st.unfollows, 0);
});

test("plus and minus zoom about the centre of the view, by a quarter in and a fifth out", () => {
  for (const [k, f] of [
    ["+", 1.25],
    ["=", 1.25],
    ["-", 0.8],
    ["_", 0.8],
  ] as const) {
    const { st, host } = setup();
    st.cam = { x: 200, y: 150, zoom: 6 }; // well above the fit (2), so a zoom out is not held at it
    const start = st.cam;
    assert.equal(handleKey(host, key(k)), true, k);
    assert.deepEqual(st.sets, [zoomBy(start, EXTENT, VIEW, VIEW.w / 2, VIEW.h / 2, f)], k);
    assert.notEqual(st.sets[0]!.zoom, start.zoom, "the zoom moved");
  }
});

test("0 and Home show the whole map; n goes to the next nest", () => {
  const { st, host } = setup();
  assert.equal(handleKey(host, key("0")), true);
  assert.equal(handleKey(host, key("Home")), true);
  assert.equal(st.showAlls, 2);
  assert.equal(handleKey(host, key("n")), true);
  assert.equal(handleKey(host, key("N")), true, "Shift or Caps Lock");
  assert.equal(st.nests, 2);
  assert.deepEqual(st.sets, [], "none of these set a camera: the page does");
});

test("Escape drops a follow; with nothing followed, or the key already claimed, it passes", () => {
  const { st, host } = setup({ following: true });
  assert.equal(handleKey(host, key("Escape")), true);
  assert.equal(st.unfollows, 1);
  assert.equal(handleKey(host, key("Escape")), false, "nothing followed: left for the drawer");
  st.following = true;
  assert.equal(handleKey(host, key("Escape", { defaultPrevented: true })), false, "already claimed");
  assert.equal(st.unfollows, 1);
});

test("a space is the field's (the page does not scroll) and does nothing else", () => {
  const { st, host } = setup();
  assert.equal(handleKey(host, key(" ")), true);
  assert.deepEqual(st.sets, []);
});

test("browser and system shortcuts pass through, whatever the key; so does a key the field has no use for", () => {
  for (const mod of ["ctrlKey", "metaKey", "altKey"] as const)
    for (const k of ["0", "a", "+", "n", "ArrowUp", " "]) {
      const { st, host } = setup();
      assert.equal(handleKey(host, key(k, { [mod]: true })), false, `${mod} ${k}`);
      assert.deepEqual(st.sets, []);
      assert.equal(st.showAlls + st.nests, 0);
    }
  const { host } = setup();
  assert.equal(handleKey(host, key("x")), false);
  assert.equal(handleKey(host, key("Tab")), false);
});

test("the wheel zooms about the pointer by e^(−deltaY × the rate), and about the centre of the view when tilted", () => {
  const calls: { v: Viewport; sx: number; sy: number; f: number }[] = [];
  const rig = { zoomAround: (v: Viewport, sx: number, sy: number, f: number) => calls.push({ v, sx, sy, f }) };
  handleWheel(rig, VIEW, { x: 123, y: 456, deltaY: -100 }, false);
  assert.deepEqual(calls[0], { v: VIEW, sx: 123, sy: 456, f: Math.exp(100 * 0.0015) });
  assert.equal(WHEEL_RATE, 0.0015);
  assert.ok(calls[0]!.f > 1, "rolling up zooms in");
  handleWheel(rig, VIEW, { x: 123, y: 456, deltaY: 100 }, false);
  assert.ok(calls[1]!.f < 1, "rolling down zooms out");
  handleWheel(rig, VIEW, { x: 123, y: 456, deltaY: 40 }, true);
  assert.deepEqual(calls[2], { v: VIEW, sx: 400, sy: 300, f: Math.exp(-40 * 0.0015) });
});

test("panGround pans by the move, and a tilted map divides the vertical part by the cosine of the tilt", () => {
  const c: Camera = { x: 10, y: 20, zoom: 4 };
  assert.deepEqual(panGround(c, 8, 12, null), pan(c, 8, 12));
  assert.deepEqual(panGround(c, 8, 12, 0), pan(c, 8, 12), "a zero tilt is the same as flat");
  assert.deepEqual(panGround(c, 8, 12, Math.PI / 3), pan(c, 8, 24));
});
