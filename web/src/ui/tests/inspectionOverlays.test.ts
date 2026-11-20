import { test } from "node:test";
import assert from "node:assert/strict";
import { centreX, centreY, PLANE } from "../../colony/index.ts";
import { buildGame } from "../useColony.ts";
import { SensedMap } from "../fungusSight.ts";
import { inspectPatch } from "../inspectionPatch.ts";
import { inspectionMarkers, inspectionScents } from "../inspectionOverlays.ts";
import { InspectionPatchRenderer } from "../drawInspectionPatch.ts";

const game = () => buildGame({ species: "generic", seed: 3, antCount: 50, rival: false, generation: 0 });

test("inspection scents respect actual host visibility and the map's food/home switches", () => {
  const g = game(),
    s = new SensedMap(),
    c = g.colonies[0];
  const x = centreX(50, 50),
    y = centreY(50);
  c.layers[PLANE].ph.fields.food.set(50, 50, 4);
  c.layers[PLANE].ph.fields.home.set(50, 50, 12);
  c.layers[PLANE].ph.fields.alarm.set(50, 50, 6);
  const read = (food = true, home = true) => inspectPatch(g, s, PLANE, x, y, { food, home }).selected.place;
  assert.deepEqual(inspectionScents(read()), [], "unsensed fields never leak through an inspection overlay");
  s.mark(PLANE, x, y, 1);
  assert.deepEqual(
    inspectionScents(read()).map((v) => v.kind),
    ["home", "food", "alarm"],
  );
  assert.deepEqual(
    inspectionScents(read(false, false)).map((v) => v.kind),
    ["alarm"],
  );
  s.now = 21;
  assert.deepEqual(inspectionScents(read()), [], "expired scent disappears without altering pheromones");
  assert.equal(c.layers[PLANE].ph.fields.food.get(50, 50), 4);
});

test("location markers describe recorded entrances and chambers without making up a location", () => {
  const g = game(),
    c = g.colonies[0],
    h = c.holeCells[0];
  const p = inspectPatch(g, new SensedMap(), PLANE, centreX(h.px, h.py), centreY(h.py), { food: true, home: true }).selected.place;
  assert.ok(inspectionMarkers(p).some((v) => v.kind === "entrance"));
  assert.deepEqual(inspectionMarkers({ ...p, hole: -1, chamber: null }), []);
  assert.deepEqual(
    inspectionMarkers({ ...p, hole: -1, chamber: { k: 0, role: "brood", brood: 2, food: 0 } }).map((v) => v.label),
    ["brood chamber"],
  );
});

test("hiding overlays preserves workers and the cached terrain, while removing overlay drawing", () => {
  const g = game(),
    c = g.colonies[0];
  const p = inspectPatch(g, new SensedMap(), c.home, c.x[0], c.y[0], { food: true, home: true });
  for (const cell of p.cells) {
    cell.state.place.ground = "open";
    cell.state.place.foodTrail = 1;
    cell.state.place.homeTrail = 0.8;
    cell.state.place.alarm = 0.5;
    cell.state.place.hole = 0;
  }
  let strokes = 0;
  const ctx = new Proxy(
    { stroke: () => strokes++, drawImage: () => {} },
    { get: (o, k) => Reflect.get(o, k) ?? (() => {}) },
  ) as unknown as CanvasRenderingContext2D;
  const makeCanvas = () => ({ width: 0, height: 0, getContext: () => ctx }) as unknown as HTMLCanvasElement;
  const renderer = new InspectionPatchRenderer(makeCanvas);
  const on = renderer.draw(ctx, p, {}, 384, 320);
  const withOverlay = strokes;
  strokes = 0;
  const off = renderer.draw(ctx, p, {}, 384, 320, { scents: false, markers: false });
  assert.equal(off.terrainCacheHit, true);
  assert.equal(off.drawnWorkers, on.drawnWorkers);
  assert.equal(off.selectedWorkers, on.selectedWorkers);
  assert.ok(withOverlay > strokes);
});
