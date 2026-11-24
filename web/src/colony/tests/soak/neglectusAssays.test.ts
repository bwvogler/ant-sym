import { test } from "node:test";
import assert from "node:assert/strict";
import { INFECTED } from "../../fungus.ts";
import {
  N1_DOSE,
  N3_BASE,
  N3_MIN_MEET,
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
  assert.ok(m.medianLoad >= INFECTED, `median ${m.medianLoad}`);
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

test("N1 reads carriers at INFECTED and up, and scores on the exposed ant's load at the reading, not its dose", () => {
  // Ant 0 exposed (0.8 dose, 0.4 now); ants 1-6 its nestmates: two clean, one just under INFECTED, three carriers at 1, 1.2 and 1.4 × INFECTED.
  const e = INFECTED;
  const load = [0.4, 0, 0, e * 0.99, e, e * 1.2, e * 1.4];
  const alive = [1, 1, 1, 1, 1, 1, 1];
  const resist = [0, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1];
  const r = n1Read(load, alive, resist, load.length, 0, 0.8);
  assert.equal(r.carriers, 3 / 6, "a load just under INFECTED is not a carrier");
  assert.equal(r.medianLoad, e * 1.2);
  assert.ok(Math.abs(r.exposedRatio - 0.4 / (e * 1.2)) < 1e-9 && Math.abs(r.doseRatio - 0.8 / (e * 1.2)) < 1e-9);
  assert.ok(Math.abs(r.meanResist - 0.1) < 1e-9);
  // 50 % carriers; the dose is 13x their median but the load at the reading only 6.7x: no pass (Konrad compares the same days).
  assert.equal(n1Score(r, 0.8).pass, 0);
  assert.equal(n1Score({ ...r, exposedNow: 0.6, exposedRatio: 0.6 / (e * 1.2) }, 0.8).pass, 1);
  assert.ok(Number.isNaN(n1Score(null, 0.8).carriers));
});

const NEAR_SEED = 27;

test("N3 plays the seed's odour distance on its trial's world, on band centres: alike never fight, past the tolerance they do", () => {
  assert.deepEqual(n3Trial(1), { distance: 0, trial: 0 });
  assert.deepEqual(n3Trial(9), { distance: 0, trial: 1 });
  assert.equal(N3_BASE, 0.25);
  const near = runAssay(neglectusTolerance, NEAR_SEED).metrics;
  const far = runAssay(neglectusTolerance, 6).metrics;
  assert.equal(far.distance, 0.5);
  // Retune (brood-odour climb on by default, which moved every game's stream): meetings are a trajectory, and seed 1's fell from 12.5 to
  // 3.0 (below N3_MIN_MEET, so that trial would not even count); across the alike seeds they run 0-100 ant-seconds either way. Seed 27 (world 4,
  // distance 0.2, under the tolerance, so alike: no fight) now meets 14.3, and the band below is this one's 12.5 band (10.9-13.8) scaled by
  // 14.3/12.5, the same share of its width (the move the comment below records for the law). Alike never fight (distances up to 0.3 on seeds 1-4, 9-12, 17-20, 25-28, 33-36: 0
  // deaths) and far apart do whenever the colonies meet (seeds 6-8, 13-16, 24, 30-32, 37-40 all fought; 21-23 never met) still hold; the bounds on `fought` are untouched.
  // Meetings on seed 1 were 12.5 ant-seconds with piErrorLaw 1 (PRD §79; 14.9 by the odometer law, 17.8 then if ants on
  // different layers counted as meeting): a band catches a miscount. The band moved with the law, its width the same share
  // (13–16.5 round 14.9 then, 10.9–13.8 round 12.5 now).
  // The band is a fingerprint of this one run (a miscount catches it; a change of stream moves it), not what N3 is for: that is the two asserts below.
  // Retune 2 (the odour channel's fade went 0.03 -> 0.1, moving every stream again): seed 27 now meets 9.93, so the band is re-recorded on this run
  // at the same share of its width (8.6-11.0 = 9.93 x 0.867-1.105, the ratios of the 12.4-15.8 band round 14.3). It stays a fingerprint of this one
  // run, kept because it is the only guard on a miscount of meetings (PRD §79) and a stream-free bound cannot catch one. What does not depend on the
  // stream is looped over more alike seeds below: each must meet above N3_MIN_MEET (so its trial counts) and never fight (seeds 1 and 2 met 13.9 and 12.2; a third seed was left out to keep the file under the soak tier's limit).
  // Retune 3 (floor marks as a max rule, markMax 1 and markDecay 6 by default, PRD §77.8): seed 27 now meets 6.8, so the band is re-recorded on this run at the same
  // share of its width (5.9-7.5 = 6.8 x 0.867-1.105). Still a fingerprint of this one run. Seeds 1 and 2 now meet 20.4 and 5.2 (2 was 12.2): the loop plays 1 and 9 (26.2),
  // where the alike check has most to hold; all five alike seeds measured on this stream (27, 1, 2, 9, 10) had no fight.
  assert.ok(near.meetings > 5.9 && near.meetings < 7.5, `meetings ${near.meetings}`);
  for (const seed of [1, 9]) {
    const alike = runAssay(neglectusTolerance, seed).metrics;
    assert.ok(alike.meetings > N3_MIN_MEET, `seed ${seed}: meetings ${alike.meetings}`);
    assert.equal(alike.fought, 0, `seed ${seed} alike: ${alike.deaths} deaths`);
  }
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
