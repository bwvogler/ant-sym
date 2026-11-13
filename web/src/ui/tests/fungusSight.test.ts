import { test } from "node:test";
import assert from "node:assert/strict";
import { CELL, cellOf, centreX, centreY, CHUNK, CURTAIN, INFECTED, PLANE, R, type Colony } from "../../colony/index.ts";
import { REACH_MARGIN, SENSED_FADE, SensedMap, sightOf } from "../fungusSight.ts";

// What the field shows of the colonies' scent (PRD §65): only what the fungus's hosts sensed, fading.

/** A colony as SensedMap reads it: positions, layers, loads, and its sensors' reach. */
function colony(ants: { x: number; y: number; load: number; layer?: number; alive?: number }[], sensorDistance = 3): Colony {
  return {
    n: ants.length,
    params: { sensorDistance },
    alive: Uint8Array.from(ants.map((a) => a.alive ?? 1)),
    load: Float32Array.from(ants.map((a) => a.load)),
    layer: Uint8Array.from(ants.map((a) => a.layer ?? PLANE)),
    x: Float32Array.from(ants.map((a) => a.x)),
    y: Float32Array.from(ants.map((a) => a.y)),
  } as unknown as Colony;
}
const at = (s: SensedMap, l: number, x: number, y: number) => {
  cellOf(x, y);
  return s.sight(l, CELL[0], CELL[1]);
};

test("a host lights the cells within its antennae's reach, and nothing beyond", () => {
  const s = new SensedMap();
  s.stamp([colony([{ x: 50.5, y: 40, load: INFECTED }])], 10);
  const r = 3 + REACH_MARGIN;
  assert.equal(at(s, PLANE, 50.5, 40), 1, "its own cell");
  assert.equal(at(s, PLANE, 50.5 + r - 0.6, 40), 1, "a cell just inside the reach");
  assert.equal(at(s, PLANE, 50.5 + r + 1.2, 40), 0, "a cell past it");
  // Every lit cell's centre is within the reach.
  for (let gy = 25; gy < 55; gy++)
    for (let gx = 40; gx < 62; gx++)
      if (s.sight(PLANE, gx, gy) > 0) assert.ok(Math.hypot(centreX(gx, gy) - 50.5, centreY(gy) - 40) <= r + 1e-9, `(${gx}, ${gy})`);
});

test("a clean ant and a dead host sense nothing for the fungus", () => {
  const s = new SensedMap();
  s.stamp(
    [
      colony([
        { x: 30, y: 30, load: INFECTED * 0.9 },
        { x: 70, y: 30, load: 0.5, alive: 0 },
      ]),
    ],
    5,
  );
  assert.equal(at(s, PLANE, 30, 30), 0);
  assert.equal(at(s, PLANE, 70, 30), 0);
  assert.equal(s.layer(PLANE), null, "no grid at all until a host senses");
});

test("what was sensed fades out over SENSED_FADE, and a fresh pass lights it again", () => {
  const s = new SensedMap();
  const host = colony([{ x: 20, y: 20, load: 0.3 }]);
  s.stamp([host], 100);
  const gone = colony([{ x: 90, y: 60, load: 0.3 }]); // the host walked away
  s.stamp([gone], 100 + SENSED_FADE / 2);
  assert.ok(Math.abs(at(s, PLANE, 20, 20) - 0.5) < 1e-6, "half faded");
  s.stamp([gone], 100 + SENSED_FADE);
  assert.equal(at(s, PLANE, 20, 20), 0, "gone at SENSED_FADE");
  s.stamp([host], 100 + SENSED_FADE + 1);
  assert.equal(at(s, PLANE, 20, 20), 1, "sensed again");
  assert.equal(sightOf(-Infinity, 5), 0, "never sensed");
});

test("the plane and the curtain are separate: a host below lights only the curtain", () => {
  const s = new SensedMap();
  s.stamp([colony([{ x: 40, y: 10, load: 0.2, layer: CURTAIN }])], 3);
  assert.equal(at(s, CURTAIN, 40, 10), 1);
  assert.equal(at(s, PLANE, 40, 10), 0);
});

test("every colony's hosts count, not one colony's", () => {
  const s = new SensedMap();
  s.stamp([colony([{ x: 10, y: 10, load: 0 }]), colony([{ x: 80, y: 50, load: 0.2 }])], 1);
  assert.equal(at(s, PLANE, 80, 50), 1, "the second colony's host");
  assert.equal(at(s, PLANE, 10, 10), 0);
});

test("time going back (a restart, a load) forgets what was sensed", () => {
  const s = new SensedMap();
  s.stamp([colony([{ x: 20, y: 20, load: 0.3 }])], 50);
  s.stamp([colony([])], 2);
  assert.equal(at(s, PLANE, 20, 20), 0);
});

test("the disc is exact both ways, at negative columns (the curtain) and across chunk edges: every cell within reach, none beyond", () => {
  const r = 3 + REACH_MARGIN;
  // A point well inside, one at negative x (the curtain runs from the line's s, below 0), and two on chunk edges.
  for (const [l, x, y] of [
    [PLANE, 50.5, 40],
    [CURTAIN, -70.3, 12.2],
    [PLANE, CHUNK - 0.2, CHUNK * R + 0.1],
    [CURTAIN, -CHUNK + 0.4, 2 * CHUNK * R - 0.3],
  ] as const) {
    const s = new SensedMap();
    s.stamp([colony([{ x, y, load: 0.2, layer: l }])], 1);
    let lit = 0;
    for (let gy = Math.max(0, Math.floor((y - r) / R) - 2); gy <= Math.ceil((y + r) / R) + 2; gy++)
      for (let gx = Math.floor(x - r) - 2; gx <= Math.ceil(x + r) + 2; gx++) {
        const inside = Math.hypot(centreX(gx, gy) - x, centreY(gy) - y) <= r;
        assert.equal(s.sight(l, gx, gy), inside ? 1 : 0, `(${gx}, ${gy}) of the host at (${x}, ${y})`);
        if (inside) lit++;
      }
    assert.ok(lit > 40, `a disc, not a dot (${lit} cells)`);
  }
});
