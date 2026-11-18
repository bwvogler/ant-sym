import { test } from "node:test";
import assert from "node:assert/strict";
import { DepartureProbe, DEPARTURE_GEOMETRIES, runDepartureBaseline } from "../../experiment.ts";

test("fixed footprint measures exit and reentry, and censors observation end", () => {
  const p = new DepartureProbe();
  p.sample(true, 0, 0);
  p.sample(true, 1, 0);
  p.sample(false, 2, 0);
  p.sample(true, 0, 0);
  p.finish();
  assert.deepEqual(p.episodes, [
    { ticks: 2, path: 2, radius: 2, end: "exit" },
    { ticks: 1, path: 0, radius: 0, end: "boundary" },
  ]);
});
test("death is not departure and does not count a replacement's displacement", () => {
  const p = new DepartureProbe();
  p.sample(true, 0, 0);
  p.sample(false, 99, 99, false);
  assert.deepEqual(p.episodes, [{ ticks: 1, path: 0, radius: 0, end: "death" }]);
});
test("departure observer leaves simulation and random stream unchanged in every geometry", () => {
  for (const geometry of DEPARTURE_GEOMETRIES) {
    const observed = runDepartureBaseline(1, geometry, 2);
    const control = runDepartureBaseline(1, geometry, 2, false);
    assert.deepEqual(observed.state, control.state, geometry);
    assert.equal(observed.nextDraw, control.nextDraw, geometry);
    assert.equal(observed.offers, control.offers, geometry);
    assert.equal(observed.foodUnchanged, true, geometry);
    assert.equal(observed.rockSamples, 0, geometry);
    if (geometry === "blocked") assert.equal(observed.exits, 0);
  }
});
