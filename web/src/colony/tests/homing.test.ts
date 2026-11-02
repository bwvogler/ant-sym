import { test } from "node:test";
import assert from "node:assert/strict";
import { Colony, HOLE_SIGHT } from "../colony.ts";
import { CELL, cellOf, centreX, centreY } from "../hex.ts";
import { generateSideWorld, generateWorld, isSky, mulberry32, OPEN, rockAt, type WorldMap } from "../world.ts";

// Nest slice 1 (docs/nest-and-home.md §3.1): in the side view an ant knows where home is only by its own drifting
// home vector, corrected by local cues (the hole in sight, a strong nest trail underground). Depth never drifts (gravity).

const SMALL = { size: { w: 256, h: 160 }, nestGap: 120, surface: 40, nestCount: 1 };

/** The walkway cell of column x: the open sky cell just above the ground. */
function walkway(map: WorldMap, x: number): number {
  for (let y = 0; y < map.size.h; y++) if (isSky(map, x, y) && rockAt(map, x, y) === OPEN) return y;
  return -1;
}

function onWalkway(c: Colony, x: number): void {
  const y = walkway(c.map, x);
  c.x[0] = centreX(x, y);
  c.y[0] = centreY(y);
}

test("the surface vector: its error grows with the way out, starts afresh coming up out of the hole, and is fixed on the way home", () => {
  const map = generateSideWorld(2, SMALL);
  cellOf(map.nest.entrance!.x, map.nest.entrance!.y);
  const ex = CELL[0] as number;
  const c = new Colony(map, { antCount: 1, maxAnts: 1, deposit: 0 }, mulberry32(5), () => "explore");
  // Out of the hole onto the ground (a newborn is underground): the surface vector starts at zero, with this trip's drift.
  onWalkway(c, ex + 3);
  c.heading[0] = 0;
  c.tick(1 / 30);
  assert.ok((c.odoSurf[0] as number) < 0.5, `fresh: ${c.odoSurf[0]}`);
  assert.notEqual(c.driftSurf[0], 0, "a drift drawn for the trip");
  for (let k = 0; k < 30 * 4; k++) c.tick(1 / 30);
  const out = c.odoSurf[0] as number;
  assert.ok(out > 10 && out <= c.params.speed * 4 + 1, `the way out counted: ${out.toFixed(1)}`);
  // Homing: the vector it walks home on is the one it brought out.
  c.mode[0] = 2;
  c.carrying[0] = 1;
  for (let k = 0; k < 30; k++) c.tick(1 / 30);
  assert.equal(c.odoSurf[0], out, "not counted on the way home");
});

test("a carrier whose vector is 12 cells off walks to where it believes the hole is, finds nothing, searches, and gets home", () => {
  const map = generateSideWorld(2, SMALL);
  cellOf(map.nest.entrance!.x, map.nest.entrance!.y);
  const ex = CELL[0] as number;
  const ent = map.nest.entrance!;
  const c = new Colony(map, { antCount: 1, maxAnts: 1, deposit: 0 }, mulberry32(3), () => "return");
  onWalkway(c, ex + 40);
  c.tick(1 / 30); // up on the ground: the surface vector starts
  c.driftSurf[0] = 0.2;
  c.odoSurf[0] = 60; // believes the hole 12 east of it (beyond HOLE_SIGHT)
  c.carrying[0] = 1;
  c.mode[0] = 2;
  let nearBelief = Infinity;
  let t = 0;
  for (; t < 30 * 60 && c.stored === 0; t++) {
    c.tick(1 / 30);
    if (c.search[0] === 0) nearBelief = Math.min(nearBelief, Math.abs((c.x[0] as number) - (ent.x + 12)));
  }
  assert.ok(12 > HOLE_SIGHT);
  assert.ok(nearBelief < 1.5, `it went where it believed the hole was (${nearBelief.toFixed(2)} off)`);
  assert.equal(c.stored, 1, `then searched and got home (${(t / 30).toFixed(0)} s)`);
});

test("road signs: underground, a strong nest trail fades the in-nest memory's error; elsewhere it stays", () => {
  const map = generateSideWorld(2, SMALL);
  const n = map.nest;
  const run = (scent: number) => {
    const c = new Colony(map, { antCount: 1, maxAnts: 1, deposit: 0 }, mulberry32(4), () => "return");
    // In the shaft, a little below the hole: underground, not in the chamber.
    const sx = n.entrance!.x;
    const sy = n.entrance!.y + 4;
    c.x[0] = sx;
    c.y[0] = sy;
    c.antCell(0);
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) c.ph.depositCell("home", (CELL[0] as number) + dx, (CELL[1] as number) + dy, scent);
    c.odoNest[0] = 100;
    c.mode[0] = 2;
    for (let k = 0; k < 30 * 2; k++) {
      c.x[0] = sx; // held in place: only the correction is measured
      c.y[0] = sy;
      c.tick(1 / 30);
    }
    return c.odoNest[0] as number;
  };
  assert.ok(run(5) < 50, `strong trail: ${run(5).toFixed(1)}`);
  assert.ok(run(0) > 99, `no trail: ${run(0).toFixed(1)}`);
});

test("top-down maps keep exact homing: no vector is kept", () => {
  const map = generateWorld(1);
  const c = new Colony(map, { antCount: 200 }, mulberry32(2));
  for (let k = 0; k < 30 * 20; k++) c.tick(1 / 30);
  for (let i = 0; i < c.n; i++) assert.equal(c.odoSurf[i]! + c.odoNest[i]!, 0);
});
