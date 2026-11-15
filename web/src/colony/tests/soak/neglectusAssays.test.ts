import { test } from "node:test";
import assert from "node:assert/strict";
import {
  N1_CARRY,
  N1_DOSE,
  N3_BASE,
  classN3,
  n1Pass,
  n1Read,
  n1Score,
  n3Trial,
  neglectusImmunisation,
  neglectusTolerance,
  runAssay,
} from "../../experiment.ts";

// The assays' own guard (ja-e668.2): each measures what it says on today's ants, the baseline in PRD §64.2.

test("N1 doses one ant inside the nest and reads its nestmates against its load then: today the fungus spreads to nearly all, thick", () => {
  const m = runAssay(neglectusImmunisation, 1).metrics;
  assert.ok(Math.abs(m.exposedPeak - N1_DOSE) < 1e-6, `the exposed ant took the dose: ${m.exposedPeak}`);
  assert.ok(m.carriers > 0.9 && m.carriers <= 1, `carriers ${m.carriers}`);
  assert.ok(m.medianLoad >= N1_CARRY, `median ${m.medianLoad}`);
  // The pass reads the exposed ant's load at the reading, not its dose (review of #228, S2): the two differ today.
  assert.ok(
    Math.abs(m.exposedRatio - m.exposedNow / m.medianLoad) < 1e-9 && m.exposedRatio < m.doseRatio,
    `ratios ${m.exposedRatio}, ${m.doseRatio}`,
  );
  assert.ok(m.meanResist > 0, "grooming primed the nestmates");
  assert.equal(m.pass, n1Pass(m.carriers, m.exposedRatio));
  assert.equal(m.pass, 0);
});

test("N1's pass: 40-85 % carriers and the exposed ant's load at least 8 times theirs", () => {
  assert.equal(n1Pass(0.64, 10), 1);
  assert.equal(n1Pass(0.64, 7.9), 0);
  assert.equal(n1Pass(0.39, 10), 0);
  assert.equal(n1Pass(0.86, 10), 0);
});

test("N1 reads carriers at N1_CARRY and up, and scores on the exposed ant's load at the reading, not its dose", () => {
  // Ant 0 exposed; ants 1-6 its nestmates: two clean, one just under N1_CARRY, three carriers at 1, 1.2 and 1.4 × N1_CARRY (median 1.2 ×).
  const e = N1_CARRY;
  const median = e * 1.2;
  const now = 5.6 * median; // under 8 times their median
  const dose = 10.4 * median; // over it: the dose would pass where the load at the reading does not
  const load = [now, 0, 0, e * 0.99, e, e * 1.2, e * 1.4];
  const alive = [1, 1, 1, 1, 1, 1, 1];
  const resist = [0, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1];
  const r = n1Read(load, alive, resist, load.length, 0, dose);
  assert.equal(r.carriers, 3 / 6, "a load just under N1_CARRY is not a carrier");
  assert.equal(r.medianLoad, median);
  assert.ok(Math.abs(r.exposedRatio - 5.6) < 1e-9 && Math.abs(r.doseRatio - 10.4) < 1e-9, `ratios ${r.exposedRatio}, ${r.doseRatio}`);
  assert.ok(Math.abs(r.meanResist - 0.1) < 1e-9);
  // 50 % carriers; the dose is 10.4 times their median but the load at the reading only 5.6: no pass (Konrad compares the same days).
  assert.equal(n1Score(r, dose).pass, 0);
  assert.equal(n1Score({ ...r, exposedNow: 9 * median, exposedRatio: 9 }, dose).pass, 1);
  assert.ok(Number.isNaN(n1Score(null, dose).carriers));
  // Only nestmates in the nest count: the same loads with the last two marked out leave one carrier of four.
  const inNest = [1, 1, 1, 1, 1, 0, 0];
  assert.equal(n1Read(load, alive, resist, load.length, 0, dose, inNest).carriers, 1 / 4);
});

test("N3 plays the seed's odour distance on its trial's world, on band centres: alike never fight, past the tolerance they do", () => {
  assert.deepEqual(n3Trial(1), { distance: 0, trial: 0 });
  assert.deepEqual(n3Trial(9), { distance: 0, trial: 1 });
  assert.equal(N3_BASE, 0.25);
  const near = runAssay(neglectusTolerance, 1).metrics;
  const far = runAssay(neglectusTolerance, 6).metrics;
  assert.equal(far.distance, 0.5);
  // Meetings on seed 1 are 14.9 ant-seconds today (17.8 if ants on different layers counted as meeting): a band catches a miscount.
  assert.ok(near.meetings > 13 && near.meetings < 16.5, `meetings ${near.meetings}`);
  assert.equal(near.fought, 0, `alike: ${near.deaths} deaths`);
  assert.ok(far.deaths > 0 && far.fought === 1, `far apart: ${far.deaths} deaths`);
});

test("N3 classes a distance over the trials where the colonies met: never, always, or mixed", () => {
  const runs = [
    ...[0, 0, 0].map((f) => ({ distance: 0, meetings: 10, fought: f })),
    ...[1, 1, 1].map((f) => ({ distance: 0.5, meetings: 10, fought: f })),
    ...[1, 0, 1].map((f) => ({ distance: 0.3, meetings: 10, fought: f })),
    // A trial where the colonies barely met doesn't count: without it, 0.5 would read mixed.
    { distance: 0.5, meetings: 1, fought: 0 },
    // A distance with no trial that met is left out.
    { distance: 0.7, meetings: 0, fought: 0 },
    // A trial that fought counts however short the meeting: 0.2 fought once in a brief meeting and once not, so mixed.
    { distance: 0.2, meetings: 2, fought: 1 },
    { distance: 0.2, meetings: 10, fought: 0 },
  ];
  const c = classN3(runs);
  assert.deepEqual(
    [...c.byDistance],
    [
      [0, 0],
      [0.2, 1],
      [0.3, 1],
      [0.5, 2],
    ],
  );
  assert.ok(Math.abs(c.mixed - 2 / 4) < 1e-12 && Math.abs(c.never - 1 / 4) < 1e-12 && Math.abs(c.always - 1 / 4) < 1e-12);
});
