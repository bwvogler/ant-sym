// Development sweep: node scripts/lab/food-pass-by.mjs 1-10 0.5,1,2
// Fixed held-out candidate: node scripts/lab/food-pass-by.mjs 11-20 1
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  DEPARTURE_GEOMETRIES,
  runDepartureBaseline,
} from "../../web/src/colony/experiment.ts";
const [range = "1-10", candidates = "0.5,1,2"] = process.argv.slice(2);
const [first, last = first] = range.split("-").map(Number);
const durations = candidates.split(",").map(Number);
assert.ok(
  Number.isInteger(first) &&
    Number.isInteger(last) &&
    first > 0 &&
    last >= first,
);
assert.ok(
  durations.length &&
    durations.every((d) => Number.isFinite(d) && d > 0 && d <= 2),
);
for (const duration of durations)
  for (const geometry of DEPARTURE_GEOMETRIES)
    for (let seed = first; seed <= last; seed++) {
      const baseline = runDepartureBaseline(seed, geometry);
      const continued = runDepartureBaseline(
        seed,
        geometry,
        30,
        true,
        "continue",
        duration,
      );
      assert.deepEqual(continued.state, baseline.state);
      assert.equal(continued.nextDraw, baseline.nextDraw);
      const trial = runDepartureBaseline(
        seed,
        geometry,
        30,
        true,
        "pass-by",
        duration,
      );
      assert.equal(trial.rockSamples, 0);
      assert.equal(trial.foodUnchanged, true);
      if (geometry === "blocked") assert.equal(trial.exits, 0);
      const pack = ({ state, ...metrics }) => ({
        ...metrics,
        stateHash: createHash("sha256")
          .update(JSON.stringify(state))
          .digest("hex"),
      });
      console.log(
        JSON.stringify({
          duration,
          baseline: pack(baseline),
          trial: pack(trial),
          continueParity: true,
          actualRequests: 0,
        }),
      );
    }
