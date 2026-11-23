import assert from "node:assert/strict";
import { test } from "node:test";
import { CELL, cellOf, centreX, centreY, type Colony, CURTAIN, generateOneWorld, PLANE, type WorldMap } from "../../colony/index.ts";
import type { Camera, Viewport } from "../camera.ts";
import { chamberUnder, linkTarget, PICK_PX, pickAnt } from "../field/hit.ts";
import { columnNear, planePoint, stripColumn, stripPoint } from "../link.ts";

// What is under a point of the canvas (ja-fnd.6.3.12): the ant to pick, the chamber to inspect, and where a click on the line or the strip asks the page to look.
// The camera is at (50, 40), 20 px to a world unit, in 800 x 600 device pixels: the canvas centre (400, 300) is the world point (50, 40).

const V: Viewport = { w: 800, h: 600, dpr: 1 };
const CAM: Camera = { x: 50, y: 40, zoom: 20 };
const at = (wx: number, wy: number): [number, number] => [400 + (wx - 50) * 20, 300 + (wy - 40) * 20];

type Ant = { x: number; y: number; layer?: number; alive?: number; gen?: number };
const colony = (ants: Ant[], nest = 0): Colony =>
  ({
    n: ants.length,
    x: ants.map((a) => a.x),
    y: ants.map((a) => a.y),
    layer: ants.map((a) => a.layer ?? PLANE),
    alive: ants.map((a) => a.alive ?? 1),
    gen: ants.map((a) => a.gen ?? 0),
    params: { nest },
  }) as unknown as Colony;

test("the reach of a pick is PICK_PX CSS pixels, wider by the device ratio, and it takes the nearest ant of any colony", () => {
  assert.equal(PICK_PX, 14);
  const reach = PICK_PX / CAM.zoom; // world units at one device pixel to a CSS pixel
  const a = colony([{ x: 50 + reach * 0.9, y: 40 }]);
  const b = colony([{ x: 50 + reach * 0.5, y: 40, gen: 3 }]);
  const [px, py] = at(50, 40);
  assert.deepEqual(pickAnt([a, b], CAM, V, 1, PLANE, px, py), { k: 1, i: 0, gen: 3 }, "the nearer, in the second colony");
  assert.deepEqual(pickAnt([a], CAM, V, 1, PLANE, px, py), { k: 0, i: 0, gen: 0 }, "inside the reach");
  const far = colony([{ x: 50 + reach * 1.1, y: 40 }]);
  assert.equal(pickAnt([far], CAM, V, 1, PLANE, px, py), null, "outside it");
  assert.deepEqual(
    pickAnt([far], CAM, V, 2, PLANE, px, py),
    { k: 0, i: 0, gen: 0 },
    "the same ant at a device ratio of 2: the reach is in device pixels",
  );
});

test("a pick skips the dead, the other layer's ants and the ones of an emptier slot, and picks the first of two at one distance", () => {
  const [px, py] = at(50, 40);
  const c = colony([
    { x: 50, y: 40, alive: 0 },
    { x: 50, y: 40, layer: CURTAIN },
    { x: 50.01, y: 40, gen: 7 },
    { x: 50.01, y: 40, gen: 8 },
  ]);
  assert.deepEqual(
    pickAnt([c], CAM, V, 1, PLANE, px, py),
    { k: 0, i: 2, gen: 7 },
    "the dead and the curtain's passed; the tie goes to the first",
  );
  assert.deepEqual(pickAnt([c], CAM, V, 1, CURTAIN, px, py), { k: 0, i: 1, gen: 0 }, "the other layer shows the other ant");
  assert.equal(pickAnt([colony([])], CAM, V, 1, PLANE, px, py), null);
});

test("distance counts both axes: an ant above the point is as far as one beside it, and loses to a nearer one", () => {
  const c = colony([
    { x: 50, y: 40.3, gen: 1 },
    { x: 50.1, y: 40, gen: 2 },
    { x: 50.3, y: 40, gen: 3 },
  ]);
  assert.deepEqual(pickAnt([c], CAM, V, 1, PLANE, ...at(50, 40)), { k: 0, i: 1, gen: 2 });
  assert.deepEqual(
    pickAnt(
      [
        colony([
          { x: 50, y: 40.3, gen: 1 },
          { x: 50.3, y: 40, gen: 3 },
        ]),
      ],
      CAM,
      V,
      1,
      PLANE,
      ...at(50, 40),
    ),
    { k: 0, i: 0, gen: 1 },
    "equal: the first",
  );
});

test("a pick measures from the point's world position, not the canvas centre", () => {
  const c = colony([{ x: 53, y: 41 }]);
  const [px, py] = at(53, 41);
  assert.deepEqual(pickAnt([c], CAM, V, 1, PLANE, px, py), { k: 0, i: 0, gen: 0 });
  assert.equal(pickAnt([c], CAM, V, 1, PLANE, ...at(50, 40)), null);
});

/** A map with one chamber in the cell under the world point (wx, wy), owned by nest `owner`. */
const mapWithChamber = (wx: number, wy: number, owner: number): WorldMap => {
  cellOf(wx, wy);
  const [cx, cy] = [CELL[0], CELL[1]];
  return { chambers: { at: (x: number, y: number) => (x === cx && y === cy ? 0 : -1), list: [{ colony: owner }] } } as unknown as WorldMap;
};

test("the chamber under a point is named by the colony whose nest owns it, not by the chamber's own number", () => {
  const map = mapWithChamber(52, 41, 5);
  const colonies = [colony([], 3), colony([], 5), colony([], 9)];
  assert.deepEqual(chamberUnder(map, colonies, CAM, V, ...at(52, 41)), { k: 1, id: 0 });
  assert.equal(chamberUnder(map, colonies, CAM, V, ...at(60, 41)), null, "no chamber there");
  assert.equal(chamberUnder(map, [colony([], 3)], CAM, V, ...at(52, 41)), null, "a chamber of a nest no colony here has");
  assert.equal(chamberUnder({} as WorldMap, colonies, CAM, V, ...at(52, 41)), null, "a map with no chambers (the plane)");
});

test("a click on the line above asks for the side view at its column; below, for the top view at P(s); far from both, for nothing", () => {
  const world = generateOneWorld(3);
  const h = world.line.holes[0]!;
  const wx = centreX(h.x, h.y);
  const wy = centreY(h.y);
  const cam: Camera = { x: wx, y: wy, zoom: 20 };
  const centre: [number, number] = [V.w / 2, V.h / 2];
  const s = columnNear(world.line, wx, wy);
  assert.notEqual(s, null, "the first hole is on the line");
  const strip = stripPoint(s!);
  assert.deepEqual(linkTarget(world, PLANE, cam, V, ...centre), { view: CURTAIN, x: strip.x, y: strip.y });
  // below: the strip at the same column asks for the top view at the line's point there
  const below: Camera = { x: strip.x, y: strip.y, zoom: 20 };
  const col = stripColumn(world.line, strip.x, strip.y);
  const q = col === null ? null : planePoint(world.line, col);
  assert.ok(q, "the strip's point is on the line");
  assert.deepEqual(linkTarget(world, CURTAIN, below, V, ...centre), { view: PLANE, x: q!.x, y: q!.y });
  // far from the line: nothing (a point well off the plane's holes, and above the strip)
  const away: Camera = { x: wx + 400, y: wy + 400, zoom: 20 };
  assert.equal(linkTarget(world, PLANE, away, V, ...centre), null);
  // the sky over the strip still asks (the same column), and a column past the line's ends asks for nothing
  const sky = linkTarget(world, CURTAIN, { x: strip.x, y: strip.y - 4000, zoom: 20 }, V, ...centre);
  assert.deepEqual(sky, { view: PLANE, x: q!.x, y: q!.y }, "the sky over the strip");
  assert.equal(linkTarget(world, CURTAIN, { x: strip.x + 100000, y: strip.y, zoom: 20 }, V, ...centre), null, "past the line's end");
});
