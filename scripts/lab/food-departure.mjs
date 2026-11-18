// D1 baseline: node scripts/lab/food-departure.mjs [seeds=1-20] [seconds=30]
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  DEPARTURE_GEOMETRIES,
  runDepartureBaseline,
} from "../../web/src/colony/experiment.ts";
const [range = "1-20", duration = "30"] = process.argv.slice(2);
const [first, last = first] = range.split("-").map(Number);
assert.ok(
  Number.isInteger(first) &&
    Number.isInteger(last) &&
    first > 0 &&
    last >= first,
);
for (let seed = first; seed <= last; seed++)
  for (const geometry of DEPARTURE_GEOMETRIES) {
    const observed = runDepartureBaseline(seed, geometry, Number(duration));
    const control = runDepartureBaseline(
      seed,
      geometry,
      Number(duration),
      false,
    );
    assert.deepEqual(observed.state, control.state);
    assert.equal(observed.nextDraw, control.nextDraw);
    assert.equal(observed.offers, control.offers);
    assert.equal(observed.foodUnchanged, true);
    assert.equal(observed.rockSamples, 0);
    if (geometry === "blocked") assert.equal(observed.exits, 0);
    const { state, ...metrics } = observed;
    console.log(
      JSON.stringify({
        ...metrics,
        stateHash: createHash("sha256")
          .update(JSON.stringify(state))
          .digest("hex"),
        observationParity: true,
        actualRequests: 0,
      }),
    );
  }
