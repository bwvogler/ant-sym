import assert from "node:assert/strict";
import { test } from "node:test";
import { summarizeTrailPairs } from "../../experiments/trailBenchmark.ts";

test("paired gains use each pair's own baseline and report mixed outcomes", () => {
  const result = summarizeTrailPairs([
    { baseline: 20, optimized: 10 },
    { baseline: 10, optimized: 12.5 },
    { baseline: 10, optimized: 10 },
    { baseline: 15, optimized: 10 },
  ]);
  assert.equal(result.baselineMs, 12.5);
  assert.equal(result.optimizedMs, 10);
  assert.equal(result.medianGain, 0.25);
  assert.ok(Math.abs(result.minGain - -0.2) < 1e-12);
  assert.equal(result.maxGain, 1);
  assert.equal(result.optimizedWins, 2);
});
