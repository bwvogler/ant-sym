import { test } from "node:test";
import assert from "node:assert/strict";
import { N3_DISTANCES, N3_TRIALS, classN3, neglectusImmunisation, neglectusTolerance, runAssay } from "../../experiment.ts";

// The invasive garden ant's assays (ja-e668.2, PRD §64.2): landed before the species, so today they measure the generic ant, which fails
// each. N2 and N4 have no assay yet: the game's brood carries no fungus and no colony buds; each comes with its mechanic.

test(
  "N1 a sick nestmate's fungus spreads thin through its nestmates",
  { todo: "ja-e668.4: contact passes load freely (every nestmate carries about as much as the exposed ant, seeds 1-10)" },
  () => {
    for (const seed of [1, 2]) {
      const m = runAssay(neglectusImmunisation, seed).metrics;
      assert.equal(m.pass, 1, `seed ${seed}: carriers ${m.carriers}, exposedRatio ${m.exposedRatio}`);
    }
  },
);

test("N2 infected pupae are destroyed before they sporulate", { todo: "ja-e668.5: the game's brood carries no fungus yet" }, () => {
  assert.fail("no assay until brood can carry the fungus (ja-e668.5)");
});

test(
  "N3 colonies fight in proportion to how unalike they smell: most distances mixed over their trials, rising with distance",
  { todo: "ja-e668.10: recognition is a step at the tolerance (see PRD §64.2 for seeds 1-40)" },
  () => {
    const runs = [];
    for (let seed = 1; seed <= N3_DISTANCES.length * N3_TRIALS; seed++) runs.push(runAssay(neglectusTolerance, seed).metrics);
    const c = classN3(runs as { distance: number; meetings: number; fought: number }[]);
    assert.ok(c.mixed >= 0.5, `mixed ${c.mixed} (Ugelvig et al. 2008: 67 %)`);
    const classes = [...c.byDistance.values()];
    for (let k = 1; k < classes.length; k++)
      assert.ok(classes[k]! >= classes[k - 1]! || classes[k]! === 1, "aggression rises with distance");
  },
);

test("N4 a crowded colony with several queens buds within its network", { todo: "ja-e668.6: no colony buds yet" }, () => {
  assert.fail("no assay until budding exists (ja-e668.6, on ja-8fd.1)");
});
