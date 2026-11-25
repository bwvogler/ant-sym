import { test } from "node:test";
import assert from "node:assert/strict";
import {
  centreX,
  centreY,
  curtainLayerOf,
  curtainOfLayer,
  generateWorld,
  Game,
  makeTransect,
  mulberry32,
  oneWorldOnLines,
  PLANE,
  type OneWorld,
  type Transect,
} from "../../colony/index.ts";
import type { Camera, Viewport } from "../camera.ts";
import { linkTarget } from "../field/hit.ts";
import { LINK_REACH, LINK_REACH_MAX, lineNear, pickReach, planePoint } from "../link.ts";
import { clampLine, DEFAULT_COLONY_CONTROLS, viewShowing } from "../useColony.ts";

// Line picking (E5.6, ja-qpv.4.6, PRD §66): a click on the plane picks the line whose cell is nearest within the pick radius, in WORLD coordinates through
// the camera (so any zoom, and far from the origin on an endless plane); the page then shows that line's curtain. Unit tests of the rule on bare lines
// (`lineNear` reads only `world.lines[i].line`), then the page's side on the two-line game.

const V: Viewport = { w: 400, h: 300, dpr: 1 };

/** A world that is only its lines: the pick reads nothing else, and a plane that is touched throws (a click must not generate chunks). */
function linesOnly(...lines: Transect[]): OneWorld {
  const guard = new Proxy({}, { get: () => assert.fail("the pick read the plane") });
  return { seed: 0, plane: guard, lines: lines.map((line) => ({ line, curtain: guard })) } as unknown as OneWorld;
}

/** The squared distance from (wx, wy) to the nearest cell centre of `line`, by brute force. */
function nearestD2(line: Transect, wx: number, wy: number): number {
  let best = Infinity;
  for (let s = line.sMin; s <= line.sMax; s++) {
    const p = planePoint(line, s)!;
    best = Math.min(best, (p.x - wx) ** 2 + (p.y - wy) ** 2);
  }
  return best;
}

const at = (line: Transect, s: number) => planePoint(line, s)!;

test("the nearest line wins: a click between two lines goes to the closer", () => {
  const a = makeTransect([
    { x: 100, y: 100 },
    { x: 130, y: 100 },
  ]);
  const b = makeTransect([
    { x: 100, y: 108 },
    { x: 130, y: 108 },
  ]);
  const w = linesOnly(a, b);
  const pa = at(a, 5);
  const pb = at(b, 5);
  const m = { x: pa.x + 0.7 * (pb.x - pa.x), y: pa.y + 0.7 * (pb.y - pa.y) };
  const d = (l: Transect) => Math.sqrt(nearestD2(l, m.x, m.y));
  assert.ok(d(b) < d(a) && d(a) <= LINK_REACH + 4, "setup: line b is nearer");
  const hit = lineNear(w, m.x, m.y, 8);
  assert.equal(hit?.line, 1);
  assert.equal(lineNear(w, pa.x, pa.y)?.line, 0, "on a's own cell");
});

test("a tie goes to the earlier line, whichever order the lines are listed in", () => {
  const a = makeTransect([
    { x: 100, y: 100 },
    { x: 130, y: 100 },
  ]);
  const same = makeTransect([
    { x: 100, y: 100 },
    { x: 130, y: 100 },
  ]);
  const p = at(a, 4);
  assert.equal(lineNear(linesOnly(a, same), p.x, p.y)?.line, 0);
  assert.equal(lineNear(linesOnly(same, a), p.x, p.y)?.line, 0, "the earlier index, not a particular line");
  assert.equal(lineNear(linesOnly(a, same, a), p.x, p.y)?.line, 0);
});

test("the radius edge: a cell exactly the reach away is hit, one a hair past it is not", () => {
  const l = makeTransect([
    { x: 100, y: 100 },
    { x: 130, y: 100 },
  ]);
  const w = linesOnly(l);
  const p = at(l, 6);
  for (const [dx, dy] of [
    [0, 5],
    [1.5, 5],
    [-3, 4],
    [0, -5.5],
  ] as const) {
    const x = p.x + dx;
    const y = p.y + dy;
    const dmin = Math.sqrt(nearestD2(l, x, y));
    assert.ok(dmin > 0.5, "setup");
    assert.notEqual(lineNear(w, x, y, dmin + 1e-9), null, `${dx},${dy}: within`);
    assert.equal(lineNear(w, x, y, dmin - 1e-6), null, `${dx},${dy}: past`);
  }
  assert.equal(lineNear(w, p.x, p.y, 0)?.line, 0, "a click dead on a cell centre, reach 0");
});

test("far from the origin, at negative and at huge coordinates, the pick is the same", () => {
  const spots = [
    { x: -120000, y: -90000 },
    { x: 150000, y: -2000 },
    { x: -3000, y: 250000 },
  ];
  const lines = spots.map((h) => makeTransect([h, { x: h.x + 25, y: h.y + 3 }]));
  const w = linesOnly(...lines);
  lines.forEach((l, li) => {
    for (const s of [l.sMin, 0, l.sMax]) {
      const p = at(l, s);
      assert.equal(lineNear(w, p.x, p.y)?.line, li, `line ${li} column ${s}`);
      assert.equal(lineNear(w, p.x + 1.2, p.y - 1.1)?.line, li, "a little off");
      assert.equal(lineNear(w, p.x + 60, p.y + 60), null, "well off");
    }
  });
  assert.equal(lineNear(w, 0, 0), null, "the origin is on no line");
  // through the camera: the click's world point is the camera's plus the screen offset over the zoom, at 100k+ out
  const p = at(lines[0]!, 0);
  for (const zoom of [0.5, 4, 40]) {
    const cam: Camera = { x: p.x + 30 / zoom, y: p.y - 20 / zoom, zoom };
    const t = linkTarget(w, PLANE, cam, V, V.w / 2 - 30, V.h / 2 + 20);
    assert.equal(t?.view, curtainLayerOf(0), `zoom ${zoom}: a click on the hole`);
  }
});

test("no lines, no pick; a world with no lines gives no link", () => {
  const w = linesOnly();
  assert.equal(lineNear(w, 0, 0), null);
  assert.equal(lineNear(w, -50000, 80000, 1e6), null);
  assert.equal(linkTarget(w, PLANE, { x: 0, y: 0, zoom: 4 }, V, 200, 150), null);
});

test("pickReach: about 14 px of screen, held between the old three units and a cap", () => {
  assert.equal(pickReach(40), LINK_REACH, "zoomed in, today's reach");
  assert.equal(pickReach(14 / LINK_REACH), LINK_REACH, "the crossover");
  assert.equal(pickReach(14 / 8), 8, "between: 14 px of world");
  assert.equal(pickReach(0.5), LINK_REACH_MAX, "zoomed out, capped");
  assert.equal(pickReach(0), LINK_REACH_MAX, "no zoom reads as the cap, not infinity or NaN");
  assert.equal(pickReach(4, 2), 7, "two device px a CSS px: 28 device px over a zoom of 4");
  assert.equal(pickReach(2, 2), LINK_REACH_MAX, "28 / 2 = 14, capped");
});

test("the same click picks at a low zoom and misses at a high one: the radius follows the screen, not the world", () => {
  const l = makeTransect([
    { x: 100, y: 100 },
    { x: 160, y: 100 },
  ]);
  const w = linesOnly(l);
  const p = at(l, 10);
  const off = 8; // world units off the line: past the close reach (3), within the cap (12)
  const dmin = Math.sqrt(nearestD2(l, p.x, p.y + off));
  assert.ok(dmin > LINK_REACH && dmin < LINK_REACH_MAX, `setup: ${dmin}`);
  const click = (zoom: number) => linkTarget(w, PLANE, { x: p.x, y: p.y + off, zoom }, V, V.w / 2, V.h / 2);
  assert.equal(click(40), null, "zoomed in: eight units is a long way on the screen");
  assert.equal(click(1.5)?.view, curtainLayerOf(0), "zoomed out: eight units is a few pixels");
  assert.equal(linkTarget(w, PLANE, { x: p.x, y: p.y + 30, zoom: 0.5 }, V, V.w / 2, V.h / 2), null, "the cap holds when far out");
  // a device-pixel ratio of 2 doubles the device pixels a CSS px covers: the same world reach at twice the zoom
  assert.equal(linkTarget(w, PLANE, { x: p.x, y: p.y + off, zoom: 3 }, { ...V, dpr: 2 }, V.w / 2, V.h / 2, 2)?.view, curtainLayerOf(0));
});

// ——— the page's side, on a game of two lines ———

const SEED = 3;
function two(): Game {
  return new Game(oneWorldOnLines(SEED, generateWorld(SEED), [[0], [1]]), {}, mulberry32(5), [
    { antCount: 20, line: 0 },
    { antCount: 20, line: 1 },
  ]);
}

/** What the page does with a click: the link asks for a view, `viewShowing` turns it into controls, the below view reads `clampLine` of them. */
function click(world: OneWorld, controls: typeof DEFAULT_COLONY_CONTROLS, cam: Camera, sx: number, sy: number) {
  const t = linkTarget(world, PLANE, cam, V, sx, sy);
  if (!t) return { controls, layer: null as number | null };
  const next = { ...controls, ...viewShowing(world, t.view) };
  return { controls: next, layer: curtainLayerOf(clampLine(next.line, world.lines.length)), target: t };
}

test("a click on line 2's hole sets the side view to line 2 and the strip reads curtain 2; line 1's goes back", () => {
  const w = two().world;
  const holeOf = (li: number) => {
    const h = w.lines[li]!.line.holes[0]!;
    return { x: centreX(h.x, h.y), y: centreY(h.y) };
  };
  const p2 = holeOf(1);
  const r = click(w, DEFAULT_COLONY_CONTROLS, { x: p2.x, y: p2.y, zoom: 4 }, V.w / 2, V.h / 2);
  assert.equal(r.controls.view, "below");
  assert.equal(r.controls.line, 1);
  assert.equal(r.layer, curtainLayerOf(1));
  assert.equal(curtainOfLayer(w, r.layer!), w.lines[1]!.curtain, "the strip's data is curtain 2");
  assert.notEqual(curtainOfLayer(w, r.layer!), w.lines[0]!.curtain);
  assert.ok(r.target!.x >= w.lines[1]!.curtain.x0, "and the camera is asked to the curtain's own columns");
  const p1 = holeOf(0);
  const back = click(w, r.controls, { x: p1.x, y: p1.y, zoom: 4 }, V.w / 2, V.h / 2);
  assert.equal(back.controls.line, 0);
  assert.equal(back.layer, curtainLayerOf(0));
});

test("a click that is not near a line changes nothing: the view and the line stay", () => {
  const w = two().world;
  const was = { ...DEFAULT_COLONY_CONTROLS, view: "above" as const, line: 1 };
  const r = click(w, was, { x: 0, y: 0, zoom: 4 }, V.w / 2, V.h / 2);
  assert.equal(r.layer, null);
  assert.equal(r.controls, was, "the same controls object: the page's `if (t)` never calls update");
});

test("viewShowing: the plane is above and leaves the line alone; a curtain is below with its line; a stale layer reads line 0", () => {
  const w = two().world;
  assert.deepEqual(viewShowing(w, PLANE), { view: "above" });
  assert.deepEqual(viewShowing(w, curtainLayerOf(1)), { view: "below", line: 1 });
  assert.deepEqual(viewShowing(w, curtainLayerOf(7)), { view: "below", line: 0 }, "a layer the world lacks");
  assert.deepEqual(viewShowing(null, curtainLayerOf(1)), { view: "below" }, "no one world: no line to pick");
});

test("a picked line that is gone (a smaller world, a new game) is clamped when read, and freshGame-style resets to line 0", () => {
  const w = two().world;
  const picked = click(
    w,
    DEFAULT_COLONY_CONTROLS,
    { x: centreX(w.lines[1]!.line.holes[0]!.x, w.lines[1]!.line.holes[0]!.y), y: centreY(w.lines[1]!.line.holes[0]!.y), zoom: 4 },
    V.w / 2,
    V.h / 2,
  );
  assert.equal(picked.controls.line, 1);
  const one = oneWorldOnLines(SEED, generateWorld(SEED), [[0]]);
  const layer = curtainLayerOf(clampLine(picked.controls.line, one.lines.length));
  assert.equal(layer, curtainLayerOf(0));
  assert.ok(curtainOfLayer(one, layer), "the stale line reads a curtain that exists");
});
