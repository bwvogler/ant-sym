import assert from "node:assert/strict";
import { test } from "node:test";
import { Game, generateOneWorld, mulberry32, TOLERANCE } from "../../colony/index.ts";
import { antOdour, colonyOdours, distanceText, isStranger } from "../odourLens.ts";
import { axesOf, gapTitle, odourSpan } from "../odourScale.ts";

// The odour lens (ja-zg1u.8) and the odour space's size as the page prints it, read off a small real game (K = 4 by default, K = 1 asked for).

const small = (axes?: number) =>
  new Game(
    generateOneWorld(4, { plane: { size: { w: 120, h: 80 } } }),
    axes === undefined ? {} : { recognition: { odourAxes: axes } },
    mulberry32(4),
    [{ antCount: 20 }, { antCount: 20 }],
  );

test("an ant's odour readout: its four numbers beside its nest's, its distance, its tolerance; an ant of the nest is within it", () => {
  const g = small();
  const col = g.colonies[1]!;
  const i = col.alive.findIndex((a) => a === 1);
  const r = antOdour(col, i);
  assert.equal(r.axes.length, 4);
  assert.deepEqual(
    r.axes.map((a) => a.nest),
    [1, 1, 1, 1],
    "the second start colony sits at 1 on every axis",
  );
  assert.equal(r.distance, 0);
  assert.ok(Math.abs(r.tolerance - TOLERANCE) < 1e-6, "its own tolerance (a float32)");
  assert.equal(r.stranger, false);
  assert.match(distanceText(r, "its nest"), /^0\.00 from its nest, within the tolerance 0\.35: a nestmate$/);
});

test("an ant 0.3 from its nest on one axis is within the tolerance, 0.4 is past it: the distance is the one the fights read, over all four axes", () => {
  const g = small();
  const col = g.colonies[0]!;
  const i = col.alive.findIndex((a) => a === 1);
  col.odour[i * 4] = 0.3;
  assert.equal(antOdour(col, i).stranger, false);
  col.odour[i * 4] = 0.4;
  const far = antOdour(col, i);
  assert.equal(far.stranger, true);
  assert.ok(Math.abs(far.distance! - 0.4) < 1e-6);
  // spread over four axes the same distance: 0.2 on each is sqrt(4 x 0.04) = 0.4
  for (let k = 0; k < 4; k++) col.odour[i * 4 + k] = 0.2;
  assert.ok(Math.abs(antOdour(col, i).distance! - 0.4) < 1e-6);
  assert.equal(antOdour(col, i).stranger, true);
  assert.match(distanceText(antOdour(col, i), "its nest"), /past the tolerance 0\.35: a stranger$/);
});

test("the tolerance printed is the ant's own (a widened one is read), and a one-axis game reads one row", () => {
  const g = small(1);
  const col = g.colonies[0]!;
  const i = col.alive.findIndex((a) => a === 1);
  col.tolerance[i] = 0.9;
  col.odour[i] = 0.6;
  const r = antOdour(col, i);
  assert.equal(r.axes.length, 1);
  assert.ok(Math.abs(r.tolerance - 0.9) < 1e-6);
  assert.equal(r.stranger, false, "0.6 from its nest, at a tolerance of 0.9");
});

test("a stranger is further than the tolerance plus a hair: the boundary is a nestmate", () => {
  assert.equal(isStranger(0.35, 0.35), false);
  assert.equal(isStranger(0.35 + 1e-3, 0.35), true);
});

test("colonies' nest odours: each colony's numbers and its distance to every other of the list, strangers or alike", () => {
  const g = small();
  const rows = colonyOdours(g.colonies, [0, 1], TOLERANCE);
  assert.equal(rows.length, 2);
  assert.deepEqual(
    rows[0]!.axes.map((a) => a.value),
    [0, 0, 0, 0],
  );
  assert.equal(rows[0]!.gaps.length, 1);
  assert.ok(Math.abs(rows[0]!.gaps[0]!.distance - 2) < 1e-9, "the start colonies are sqrt(4) = 2 apart");
  assert.equal(rows[0]!.gaps[0]!.stranger, true);
  // Brought within the tolerance (the fungus's work), they are alike.
  for (let k = 0; k < 4; k++) g.colonies[1]!.nestVec[k] = 0.1;
  const alike = colonyOdours(g.colonies, [0, 1], TOLERANCE)[0]!.gaps[0]!;
  assert.ok(Math.abs(alike.distance - 0.2) < 1e-9);
  assert.equal(alike.stranger, false);
  assert.deepEqual(colonyOdours(g.colonies, [1], TOLERANCE)[0]!.gaps, [], "a list of one has no other");
  assert.deepEqual(colonyOdours(g.colonies, [7], TOLERANCE), [], "an index with no colony is skipped");
});

test("the odour's span is sqrt of its axes: 1 at one axis, 2 at the game's four, and the history chart says where the gap starts", () => {
  assert.equal(odourSpan(1), 1);
  assert.equal(odourSpan(4), 2);
  assert.equal(axesOf(small()), 4);
  assert.equal(axesOf(small(1)), 1);
  assert.equal(gapTitle(1), "The odours apart: 1 at the start, 0 when they smell alike", "the one-axis game's title, as it was");
  assert.equal(gapTitle(4), "The odours apart: 2 at the start, 0 when they smell alike");
  assert.match(gapTitle(3), /1\.73 at the start/);
  // The gap the game itself starts at is the span.
  assert.ok(Math.abs(small().unity().gap - odourSpan(4)) < 1e-9);
  assert.ok(Math.abs(small(1).unity().gap - odourSpan(1)) < 1e-9);
});
