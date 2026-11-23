import { test } from "node:test";
import assert from "node:assert/strict";
import { oneAssay, runAssay } from "../../experiment.ts";

// A6 and A13 on one world, with the attackers walked to the defenders' hole by the harness (marchProbe; S2.2c, PRD §76.3).
// Both fail their marks today, so under the owner's marks rule (2026-11-14, 2026-11-15) they are held only to no worse than
// their worst seed over 1–20, widened by 10 %, until their beads are fixed.

// A6 passes 4/20 (gain median 1.04; ja-lp4.6.5, its defenders ja-lp4.6.5.1): the gain at least A6_GUARD (worst 0.33 on main over seeds 1-20, assays run
// 45096886181, − 10 %). Recalibrated 0.54 -> 0.30 (owner, 2026-11-23, PR #320): the rule above was set when the worst seed was 0.603; main's own worst is now 0.33,
// and with the brood-odour climb on (no ant turns to the queen's position any more) seed 2's gain is 0.521, the same under every climb setting (A6's colony has
// no brood: the young wander where they used to hold near the queen: a plausible cause, not tested). Seeds 1 and 2 are not the worst seeds, but they fell: main's
// gains on them are 1.528 and 2.132 (run 45096886181), at this head about 1.00 and 0.52 (down 35 % and 76 %; A6 passes 4/20 -> 2/20), and the new floor lets
// seed 2 fall another 42 % without a failure. A6's brood-less colony after the climb is filed as ja-ajqo.
const A6_GUARD = 0.3;
test("A6 a pass on one world, guarded (ja-lp4.6.5): the defenders' exchange no worse than today's worst seed", () => {
  for (const seed of [1, 2]) {
    const m = runAssay(oneAssay("pass"), seed).metrics;
    assert.ok(m.gain >= A6_GUARD, `seed ${seed}: gain ${m.gain}, guard ${A6_GUARD}`);
  }
});

// A13 passes 8/20 (ja-lp4.6.20: defending pays nothing over not defending): food against the no-defence colony's at least
// A13_FOOD (worst 0.568, seed 1, − 10 %), and at least A13_KILLED raiders killed (worst 27, seed 4, − 10 %).
const A13_FOOD = 0.51;
const A13_KILLED = 24;
test("A13 defence on one world, guarded (ja-lp4.6.20): food and kills no worse than today's worst seed", () => {
  for (const seed of [1, 2]) {
    const m = runAssay(oneAssay("defendHome"), seed).metrics;
    assert.ok(m.vsNone >= A13_FOOD, `seed ${seed}: food ${m.vsNone} of the no-defence colony's, guard ${A13_FOOD}`);
    assert.ok(m.killed >= A13_KILLED, `seed ${seed}: ${m.killed} raiders killed, guard ${A13_KILLED}`);
  }
});
