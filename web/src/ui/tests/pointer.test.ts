import assert from "node:assert/strict";
import { test } from "node:test";
import { pan, toWorld, zoomBy, type Camera, type Viewport } from "../camera.ts";
import type { Followed } from "../follow.ts";
import { NO_GESTURE, PointerController, type PointerHost, type PointerInput } from "../field/pointer.ts";

// The field's pointer gestures (ja-fnd.6.3.11 part 2): a fake host records what the controller asks of the page, and the camera
// expectations are computed from `ui/camera.ts`'s maths, never from the controller.

const VIEW: Viewport = { w: 800, h: 600, dpr: 1 };
const EXTENT = { x0: 0, w: 400, h: 300 };
const SLOP = 8;
const ANT: Followed = { k: 0, i: 3, gen: 1 };

function setup(
  o: { angled?: boolean; tilt?: number; tool?: string | null; onTweeze?: boolean; ant?: Followed | null; plane?: boolean } = {},
) {
  const st = {
    cam: { x: 200, y: 150, zoom: 2 } as Camera,
    angled: o.angled ?? false,
    tilt: o.tilt ?? 0,
    tool: o.tool ?? null,
    ant: o.ant === undefined ? null : o.ant,
    plane: o.plane ?? true,
    following: false,
    lens: false,
    pen: false,
    labels: false,
    chamber: null as { k: number; id: number } | null,
    mini: (x: number, _y: number) => x > 700,
    log: [] as string[],
    sets: [] as Camera[],
    strokes: [] as { pts: [number, number][]; first: boolean }[],
    tweezes: [] as { k: number; i: number; x: number; y: number; first: boolean }[],
    picks: [] as { x: number; y: number }[],
    penPicks: [] as { x: number; y: number }[],
    probes: [] as { x: number; y: number; pinned: boolean }[],
    hover: null as [number, number] | null,
    follows: [] as (Followed | null)[],
    chambers: [] as [number, number][],
    links: [] as [number, number][],
    jumps: [] as [number, number][],
  };
  const host: PointerHost = {
    rig: {
      camera: () => st.cam,
      set: (c) => {
        st.cam = c;
        st.sets.push(c);
      },
      viewport: () => VIEW,
      extent: () => EXTENT,
      inMini: st.mini,
      jumpMini: (x, y) => st.jumps.push([x, y]),
    },
    slop: () => SLOP,
    angled: () => st.angled,
    tilt: () => st.tilt,
    build: () =>
      st.tool
        ? {
            tool: st.tool,
            onTweeze: o.onTweeze === false ? undefined : (k, i, x, y, first) => st.tweezes.push({ k, i, x, y, first }),
          }
        : null,
    pick: (x, y) => {
      st.picks.push({ x, y });
      return st.ant;
    },
    paint: (pts, first) => st.strokes.push({ pts, first }),
    onPlane: () => st.plane,
    following: () => st.following,
    follow: (f) => {
      st.follows.push(f);
      st.following = !!f;
    },
    setHover: (x, y) => {
      st.hover = [x, y];
    },
    lensOn: () => st.lens,
    probe: (x, y, pinned) => st.probes.push({ x, y, pinned }),
    pen: () => (st.pen ? { onPick: (p) => st.penPicks.push(p) } : null),
    labelsOn: () => st.labels,
    chamberAt: () => st.chamber,
    onChamber: (k, id) => st.chambers.push([k, id]),
    link: (x, y) => st.links.push([x, y]),
  };
  return { st, host, ptr: new PointerController() };
}

const ev = (id: number, x: number, y: number, o: Partial<PointerInput> = {}): PointerInput => ({
  id,
  pointerType: "mouse",
  button: 0,
  buttons: 1,
  x,
  y,
  ...o,
});
const touch = (id: number, x: number, y: number, o: Partial<PointerInput> = {}) => ev(id, x, y, { pointerType: "touch", ...o });

test("a tap picks the ant under it and follows it; on nothing, a chamber's label opens it, else the click links to the other view", () => {
  const { st, host, ptr } = setup({ ant: ANT });
  assert.equal(ptr.down(host, ev(1, 300, 200)), true);
  ptr.up(host, ev(1, 300, 200));
  assert.deepEqual(st.picks, [{ x: 300, y: 200 }]);
  assert.deepEqual(st.follows, [ANT]);
  assert.deepEqual(st.links, [], "an ant was picked");
  assert.equal(ptr.gesture, NO_GESTURE, "the gesture ends with the last pointer");
  assert.equal(ptr.pointers.size, 0);

  const bare = setup({ ant: null });
  bare.ptr.down(bare.host, ev(1, 10, 20));
  bare.ptr.up(bare.host, ev(1, 10, 20));
  assert.deepEqual(bare.st.follows, [null], "a tap on nothing drops the follow");
  assert.deepEqual(bare.st.links, [[10, 20]]);

  const lab = setup({ ant: null });
  lab.st.labels = true;
  lab.st.chamber = { k: 1, id: 7 };
  lab.ptr.down(lab.host, ev(1, 10, 20));
  lab.ptr.up(lab.host, ev(1, 10, 20));
  assert.deepEqual(lab.st.chambers, [[1, 7]]);
  assert.deepEqual(lab.st.links, [], "the chamber took the click");
  lab.st.labels = false;
  lab.ptr.down(lab.host, ev(1, 10, 20));
  lab.ptr.up(lab.host, ev(1, 10, 20));
  assert.deepEqual(lab.st.links, [[10, 20]], "no labels, no chamber");
});

test("a pointer that moved more than the slop is a drag, not a click; one within it is a click", () => {
  const near = setup({ ant: ANT });
  near.ptr.down(near.host, ev(1, 100, 100));
  near.ptr.move(near.host, ev(1, 104, 104));
  near.ptr.up(near.host, ev(1, 104, 104));
  assert.equal(near.st.follows.length, 1, "8 px of travel is within the slop: the click lands");
  assert.deepEqual(near.st.sets, [], "and nothing panned");

  const far = setup({ ant: ANT });
  far.ptr.down(far.host, ev(1, 100, 100));
  far.ptr.move(far.host, ev(1, 105, 105));
  far.ptr.up(far.host, ev(1, 105, 105));
  assert.equal(far.st.follows.length, 0, "10 px is past it: a drag never clicks");
  assert.equal(far.st.sets.length, 1);
});

test("a drag pans the ground with the pointer: the move that crosses the slop catches up from where the drag began, then it follows the pointer", () => {
  const { st, host, ptr } = setup();
  const start = st.cam;
  ptr.down(host, ev(1, 100, 100));
  ptr.move(host, ev(1, 103, 100));
  assert.deepEqual(st.sets, [], "inside the slop nothing moves");
  ptr.move(host, ev(1, 120, 110));
  assert.deepEqual(st.sets[0], pan(start, 20, 10), "crossing the slop: from the start (100, 100) to (120, 110)");
  ptr.move(host, ev(1, 130, 110));
  assert.deepEqual(st.sets[1], pan(st.sets[0]!, 10, 0), "then by each move");
  assert.equal(st.hover?.join(), "130,110", "the hover follows every move");
});

test("a drag that rests exactly at the slop and then crosses it still catches up from where it began", () => {
  const { st, host, ptr } = setup();
  const start = st.cam;
  ptr.down(host, ev(1, 100, 100));
  ptr.move(host, ev(1, 108, 100));
  assert.deepEqual(st.sets, [], "exactly the slop is not yet a drag");
  ptr.move(host, ev(1, 110, 100));
  assert.deepEqual(st.sets[0], pan(start, 10, 0), "from the start, not by the last step alone");
});

test("a drag past the slop stops a follow; a drag within it does not", () => {
  const { st, host, ptr } = setup();
  st.following = true;
  ptr.down(host, ev(1, 100, 100));
  ptr.move(host, ev(1, 102, 100));
  assert.deepEqual(st.follows, []);
  ptr.move(host, ev(1, 150, 100));
  assert.deepEqual(st.follows, [null]);
});

test("on a tilted map a drag pans along the ground (a vertical drag is divided by the cosine of the tilt), takes no click, and starts no tool", () => {
  const { st, host, ptr } = setup({ angled: true, tilt: Math.PI / 3, tool: "dirt", ant: ANT });
  const start = st.cam;
  ptr.down(host, ev(1, 100, 100));
  assert.equal(ptr.gesture.kind, "pan", "a tool in hand is not used on a tilted map");
  assert.deepEqual(st.strokes, []);
  ptr.move(host, ev(1, 100, 150));
  assert.deepEqual(st.sets[0], pan(start, 0, 50 / Math.cos(Math.PI / 3)));
  ptr.up(host, ev(1, 100, 150));
  assert.deepEqual(st.follows, []);

  const tap = setup({ angled: true, ant: ANT });
  tap.ptr.down(tap.host, ev(1, 100, 100));
  tap.ptr.up(tap.host, ev(1, 100, 100));
  assert.deepEqual(tap.st.follows, [], "a tap on a tilted map picks nothing");
});

test("two fingers pinch: the distance ratio zooms about their midpoint, and their drift pans (about the centre when tilted)", () => {
  const { st, host, ptr } = setup();
  const start = st.cam;
  ptr.down(host, touch(1, 300, 300));
  ptr.down(host, touch(2, 400, 300));
  assert.equal(ptr.gesture.kind, "pinch");
  ptr.move(host, touch(2, 500, 300));
  const zoomed = zoomBy(start, EXTENT, VIEW, (500 + 300) / 2, 300, 200 / 100);
  assert.deepEqual(st.sets[0], pan(zoomed, (500 - 400) / 2, 0));
  assert.ok(st.sets[0]!.zoom > start.zoom, "spreading zooms in");

  const tilted = setup({ angled: true });
  const s0 = tilted.st.cam;
  tilted.ptr.down(tilted.host, touch(1, 100, 100));
  tilted.ptr.down(tilted.host, touch(2, 200, 100));
  tilted.ptr.move(tilted.host, touch(2, 300, 100));
  assert.deepEqual(tilted.st.sets[0], pan(zoomBy(s0, EXTENT, VIEW, VIEW.w / 2, VIEW.h / 2, 2), 50, 0), "about the centre of the view");
});

test("a third finger is ignored; lifting one of three keeps the pinch; the last finger left pans and never clicks", () => {
  const { st, host, ptr } = setup({ ant: ANT });
  ptr.down(host, touch(1, 300, 300));
  ptr.down(host, touch(2, 400, 300));
  ptr.down(host, touch(3, 500, 300));
  assert.equal(ptr.pointers.size, 3);
  assert.equal(ptr.gesture.kind, "pinch");
  ptr.up(host, touch(3, 500, 300));
  assert.equal(ptr.gesture.kind, "pinch", "two are still down");
  ptr.up(host, touch(2, 400, 300));
  assert.equal(ptr.gesture.kind, "pan", "the last finger pans");
  assert.equal(ptr.gesture.moved, Infinity);
  ptr.up(host, touch(1, 300, 300));
  assert.deepEqual(st.follows, [], "and never clicks");
  assert.equal(ptr.gesture, NO_GESTURE);
});

test("the minimap: a main-button press in it jumps there, and a drag with the button down goes on jumping; another button or a bare move does not", () => {
  const { st, host, ptr } = setup();
  ptr.down(host, ev(1, 750, 50));
  assert.deepEqual(st.jumps, [[750, 50]]);
  ptr.move(host, ev(1, 760, 60, { buttons: 1 }));
  assert.deepEqual(st.jumps.at(-1), [760, 60]);
  ptr.move(host, ev(1, 770, 70, { buttons: 0 }));
  assert.equal(st.jumps.length, 2, "no button, no jump");
  ptr.move(host, ev(1, 775, 75, { buttons: 2 }));
  assert.equal(st.jumps.length, 2, "another button held is no drag of the main one");
  ptr.up(host, ev(1, 770, 70));
  assert.deepEqual(st.sets, [], "the minimap moves the cameras through jumpMini, not set");

  const mid = setup();
  mid.ptr.down(mid.host, ev(1, 750, 50, { button: 1 }));
  assert.deepEqual(mid.st.jumps, [], "the middle button pans there as anywhere");
  assert.equal(mid.ptr.gesture.kind, "pan");
});

test("a tool in hand: a mouse paints at once and then by segments; a finger waits, places on a tap, or paints from where it landed once past the slop", () => {
  const mouse = setup({ tool: "dirt" });
  mouse.ptr.down(mouse.host, ev(1, 100, 100));
  assert.deepEqual(mouse.st.strokes, [{ pts: [[100, 100]], first: true }]);
  mouse.ptr.move(mouse.host, ev(1, 105, 100));
  assert.deepEqual(mouse.st.strokes[1], {
    pts: [
      [100, 100],
      [105, 100],
    ],
    first: false,
  });
  mouse.ptr.up(mouse.host, ev(1, 105, 100));
  assert.equal(mouse.st.strokes.length, 2, "lifting a mouse adds nothing");

  const tap = setup({ tool: "dirt" });
  tap.ptr.down(tap.host, touch(1, 100, 100));
  assert.deepEqual(tap.st.strokes, [], "a finger builds nothing yet: a second may join");
  tap.ptr.up(tap.host, touch(1, 100, 100));
  assert.deepEqual(tap.st.strokes, [{ pts: [[100, 100]], first: true }], "a tap places where it landed");

  const drag = setup({ tool: "dirt" });
  drag.ptr.down(drag.host, touch(1, 100, 100));
  drag.ptr.move(drag.host, touch(1, 104, 100));
  assert.deepEqual(drag.st.strokes, [], "inside the slop");
  drag.ptr.move(drag.host, touch(1, 108, 100));
  assert.equal(drag.st.strokes.length, 0, "exactly the slop is still a tap");
  drag.ptr.move(drag.host, touch(1, 120, 100));
  assert.deepEqual(
    drag.st.strokes,
    [
      {
        pts: [
          [100, 100],
          [120, 100],
        ],
        first: true,
      },
    ],
    "past it: from where it landed",
  );
  drag.ptr.move(drag.host, touch(1, 130, 100));
  assert.deepEqual(drag.st.strokes[1], {
    pts: [
      [120, 100],
      [130, 100],
    ],
    first: false,
  });
  drag.ptr.up(drag.host, touch(1, 130, 100));
  assert.equal(drag.st.strokes.length, 2, "a finished stroke is not placed again");

  const pinch = setup({ tool: "dirt" });
  pinch.ptr.down(pinch.host, touch(1, 100, 100));
  pinch.ptr.down(pinch.host, touch(2, 200, 100));
  pinch.ptr.up(pinch.host, touch(2, 200, 100));
  pinch.ptr.up(pinch.host, touch(1, 100, 100));
  assert.deepEqual(pinch.st.strokes, [], "a second finger made it a pinch: nothing was built");
});

test("the tweezers lift the ant under the pointer on the top view: a mouse at once, a finger past the slop; with none, or below, the pointer pans", () => {
  const mouse = setup({ tool: "tweezers", ant: ANT });
  const [wx, wy] = toWorld(mouse.st.cam, VIEW, 300, 200);
  mouse.ptr.down(mouse.host, ev(1, 300, 200));
  assert.deepEqual(mouse.st.tweezes, [{ k: 0, i: 3, x: wx, y: wy, first: true }]);
  const [mx, my] = toWorld(mouse.st.cam, VIEW, 320, 210);
  mouse.ptr.move(mouse.host, ev(1, 320, 210));
  assert.deepEqual(mouse.st.tweezes[1], { k: 0, i: 3, x: mx, y: my, first: false });

  const finger = setup({ tool: "tweezers", ant: ANT });
  finger.ptr.down(finger.host, touch(1, 300, 200));
  assert.equal(finger.st.tweezes.length, 0, "a finger waits to see whether a second joins");
  finger.ptr.move(finger.host, touch(1, 303, 200));
  assert.equal(finger.st.tweezes.length, 0, "inside the slop");
  finger.ptr.move(finger.host, touch(1, 320, 200));
  assert.equal(finger.st.tweezes[0]!.first, true, "past it: lifted, from where it landed");
  assert.deepEqual([finger.st.tweezes[0]!.x, finger.st.tweezes[0]!.y], toWorld(finger.st.cam, VIEW, 300, 200));
  assert.equal(finger.st.tweezes.at(-1)!.first, false, "and carried to where it is");

  const none = setup({ tool: "tweezers", ant: null });
  none.ptr.down(none.host, ev(1, 300, 200));
  assert.equal(none.ptr.gesture.kind, "pan");
  const below = setup({ tool: "tweezers", ant: ANT, plane: false });
  below.ptr.down(below.host, ev(1, 300, 200));
  assert.equal(below.ptr.gesture.kind, "pan");
  assert.deepEqual(below.st.picks, [], "the curtain is not searched");
  const side = setup({ tool: "tweezers", ant: ANT });
  side.ptr.down(side.host, ev(1, 300, 200, { button: 2, buttons: 2 }));
  assert.equal(side.ptr.gesture.kind, "pan", "only the main button lifts");
});

test("the builder sets a palm aside: not tracked, not counted toward a pinch, and its lifting is ignored; without the builder a wide touch is a finger", () => {
  const { st, host, ptr } = setup({ tool: "dirt" });
  assert.equal(ptr.down(host, touch(9, 50, 50, { palm: true })), false);
  assert.equal(ptr.pointers.size, 0);
  ptr.down(host, touch(1, 100, 100));
  ptr.down(host, touch(2, 150, 100));
  assert.equal(ptr.gesture.kind, "pinch", "the palm was not a third finger, and these two pinch");
  ptr.up(host, touch(9, 50, 50, { palm: true }));
  assert.equal(ptr.pointers.size, 2, "its lifting changed nothing");
  assert.deepEqual(st.strokes, []);

  const free = setup();
  assert.equal(free.ptr.down(free.host, touch(9, 50, 50, { palm: true })), true);
  assert.equal(free.ptr.pointers.size, 1, "no builder: a finger");
});

test("a palm that lands and lifts while a finger's stroke is pending changes nothing: the finger still places once, on its own lifting", () => {
  const { st, host, ptr } = setup({ tool: "dirt" });
  ptr.down(host, touch(1, 100, 100));
  ptr.down(host, touch(9, 50, 50, { palm: true }));
  ptr.up(host, touch(9, 50, 50, { palm: true }));
  assert.deepEqual(st.strokes, [], "the palm's lifting places nothing");
  ptr.up(host, touch(1, 100, 100));
  assert.equal(st.strokes.length, 1);
});

test("a cancelled gesture places nothing and clicks nothing", () => {
  const paint = setup({ tool: "dirt" });
  paint.ptr.down(paint.host, touch(1, 100, 100));
  paint.ptr.up(paint.host, touch(1, 100, 100), true);
  assert.deepEqual(paint.st.strokes, []);
  const click = setup({ ant: ANT });
  click.ptr.down(click.host, ev(1, 100, 100));
  click.ptr.up(click.host, ev(1, 100, 100), true);
  assert.deepEqual(click.st.follows, []);
  assert.equal(click.ptr.gesture, NO_GESTURE);
});

test("the lens: a mouse over the map with no button down probes it; a tap probes and pins it, and follows nothing", () => {
  const { st, host, ptr } = setup({ ant: ANT });
  st.lens = true;
  ptr.move(host, ev(1, 300, 200, { buttons: 0 }));
  assert.deepEqual(st.probes, [{ x: 300, y: 200, pinned: false }]);
  ptr.move(host, touch(1, 310, 200, { buttons: 0 }));
  assert.equal(st.probes.length, 1, "a finger taps instead");
  ptr.down(host, ev(2, 300, 200));
  ptr.move(host, ev(2, 301, 200));
  assert.equal(st.probes.length, 1, "no probing mid-gesture");
  ptr.up(host, ev(2, 301, 200));
  assert.deepEqual(st.probes.at(-1), { x: 301, y: 200, pinned: true }, "the tap, where the pointer was when it lifted");
  assert.deepEqual(st.follows, []);
  assert.deepEqual(st.picks, [], "it picked nothing");

  const tilted = setup();
  tilted.st.lens = true;
  tilted.st.angled = true;
  tilted.ptr.move(tilted.host, ev(1, 300, 200, { buttons: 0 }));
  assert.deepEqual(tilted.st.probes, [], "no lens on a tilted map");
});

test("the queen's pen: a tap on the top view is where she flies, in world units; the lens gives way to it; below, a tap picks as usual", () => {
  const { st, host, ptr } = setup({ ant: ANT });
  st.pen = true;
  ptr.down(host, ev(1, 300, 200));
  ptr.up(host, ev(1, 300, 200));
  const [wx, wy] = toWorld(st.cam, VIEW, 300, 200);
  assert.deepEqual(st.penPicks, [{ x: wx, y: wy }]);
  assert.deepEqual(st.follows, []);

  st.lens = true;
  ptr.down(host, ev(1, 300, 200));
  ptr.up(host, ev(1, 300, 200));
  assert.equal(st.penPicks.length, 2, "the pen keeps its click with the lens on");
  assert.deepEqual(st.probes, []);

  st.plane = false;
  ptr.down(host, ev(1, 300, 200));
  ptr.up(host, ev(1, 300, 200));
  assert.equal(st.penPicks.length, 2, "below, the pen is not used");
  assert.deepEqual(st.probes.at(-1), { x: 300, y: 200, pinned: true }, "the lens takes the click there");
});

test("the pen is used on the top view only, even with the lens off: below, a tap picks as usual", () => {
  const { st, host, ptr } = setup({ ant: ANT, plane: false });
  st.pen = true;
  ptr.down(host, ev(1, 300, 200));
  ptr.up(host, ev(1, 300, 200));
  assert.deepEqual(st.penPicks, []);
  assert.deepEqual(st.follows, [ANT]);
});

test("an ant under the tap is followed and the chamber label under it is not opened", () => {
  const { st, host, ptr } = setup({ ant: ANT });
  st.labels = true;
  st.chamber = { k: 0, id: 1 };
  ptr.down(host, ev(1, 300, 200));
  ptr.up(host, ev(1, 300, 200));
  assert.deepEqual(st.follows, [ANT]);
  assert.deepEqual(st.chambers, []);
  assert.deepEqual(st.links, []);
});

test("only the main button clicks: a middle or right press that does not move picks nothing", () => {
  const { st, host, ptr } = setup({ ant: ANT });
  ptr.down(host, ev(1, 300, 200, { button: 1, buttons: 4 }));
  ptr.up(host, ev(1, 300, 200, { button: 1, buttons: 0 }));
  assert.deepEqual(st.follows, []);
  assert.deepEqual(st.picks, []);
});
