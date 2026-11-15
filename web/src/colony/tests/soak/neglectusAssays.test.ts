import { test } from "node:test";
import assert from "node:assert/strict";
import { INFECTED } from "../../fungus.ts";
import { N1_DOSE, neglectusImmunisation, neglectusTolerance, runAssay } from "../../experiment.ts";

// The assays' own guard (ja-e668.2): each measures what it says on today's ants, the baseline in PRD §64.2.

test("N1 doses one ant inside the nest and reads its nestmates' loads: today the fungus spreads to nearly all, thick", () => {
  const m = runAssay(neglectusImmunisation, 1).metrics;
  assert.ok(Math.abs(m.exposedPeak - N1_DOSE) < 1e-6, `the exposed ant took the dose: ${m.exposedPeak}`);
  assert.ok(m.carriers > 0.9 && m.carriers <= 1, `carriers ${m.carriers}`);
  assert.ok(m.medianLoad >= INFECTED && m.peakRatio > 1 && m.peakRatio < 8, `median ${m.medianLoad}, ratio ${m.peakRatio}`);
  assert.ok(m.meanResist > 0, "grooming primed the nestmates");
  assert.equal(m.pass, 0);
});

test("N3 plays the seed's odour distance: alike never fight, past the tolerance they do", () => {
  const near = runAssay(neglectusTolerance, 1).metrics;
  const far = runAssay(neglectusTolerance, 8).metrics;
  assert.equal(near.distance, 0);
  assert.equal(far.distance, 0.5);
  assert.ok(near.meetings > 0 && far.meetings > 0, "the colonies met");
  assert.equal(near.kind, 0, `alike: ${near.deaths} deaths`);
  assert.ok(far.deaths > 0 && far.kind === 2, `far apart: ${far.deaths} deaths, ${far.per100} per 100 meetings`);
});
