import { test } from "node:test";
import assert from "node:assert/strict";
import { larvae, runAssay } from "../../experiment.ts";

// Assay `larvae` (experiment.ts, PRD §74–75): an hour of slow/economy.test's small map, whose founders age as one
// cohort, so for a stretch no young ant is left to nurse. The seed holds task reversion's gain (review of #236, S2); the
// game takes about a minute.

// Task reversion (`revert`, ja-7r7x): measured 2026-11-15, seed 30 has 0 larvae waiting and 164 workers with the
// defaults; with `revert` 0, 36 waiting and 2 workers starved.
test("larvae seed 30: with no young left, old ants revert and the larvae are fed (revert)", () => {
  const m = runAssay(larvae, 30).metrics;
  assert.ok((m.starved as number) <= 8, `larvae waiting ${m.starved}`);
  assert.equal(m.broodStarved, 0, "larvae starved");
  assert.equal(m.diedHungry, 0, "workers starved");
});
