import { test } from "node:test";
import assert from "node:assert/strict";
import { ANT_FIELDS, makeAntArrays, NO_KEY } from "../../ants.ts";

// The table that allocates the per-ant arrays (ants.ts): the fills are what a fresh ant starts with, and nothing else pins them.

const P = { odour: 2, tolerance: 3, routeStep: 4, routeMax: 5 };

test("the table has 127 per-ant arrays, each n long (routePlaces n × 2 × routeMax steps)", () => {
  const a = makeAntArrays(3, P);
  assert.equal(Object.keys(ANT_FIELDS).length, 127);
  for (const [k, v] of Object.entries(a)) {
    if (k !== "routePlaces") assert.equal((v as ArrayLike<number>).length, 3, k);
  }
  assert.equal(a.routePlaces.length, 3 * 5 * 2);
  // routeMax is clamped to 2..255 steps
  assert.equal(makeAntArrays(1, { ...P, routeMax: 1 }).routePlaces.length, 4);
  assert.equal(makeAntArrays(1, { ...P, routeMax: 999 }).routePlaces.length, 510);
});

test("a fresh ant starts with the fill its array declares: constants, NaN and Infinity, a cell key, or a colony parameter", () => {
  const a = makeAntArrays(2, P);
  assert.equal(a.lifespan[1], Infinity);
  assert.equal(a.routeGoal[1], -1);
  assert.ok(Number.isNaN(a.digAim[1] as number), "digAim");
  assert.ok(Number.isNaN(a.cellAtX[0] as number), "cellAtX");
  assert.equal(a.noTunnel[0], NO_KEY);
  assert.equal(a.loopX[0], NO_KEY);
  assert.equal(a.quality[1], 1);
  assert.equal(a.gainFood[0], 1);
  assert.equal(a.routeGap[1], P.routeStep, "routeGap starts at the colony's routeStep");
  // the arrays that start as a parameter, and the zero-filled ones
  for (const [k, f] of Object.entries(ANT_FIELDS)) {
    const v = (a as unknown as Record<string, ArrayLike<number>>)[k]!;
    if ("fillParam" in f) assert.equal(v[0], P[f.fillParam as keyof typeof P], `${k} starts as ${f.fillParam}`);
    else if (!("fill" in f) && k !== "routePlaces") assert.equal(v[0], 0, `${k} starts at 0`);
  }
});
