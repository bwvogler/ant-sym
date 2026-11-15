import { test } from "node:test";
import assert from "node:assert/strict";
import { N3_DISTANCES, neglectusImmunisation, neglectusTolerance, runAssay } from "../../experiment.ts";

// The invasive garden ant's assays (ja-e668.2, PRD §64.2): landed before the species, so today they measure the generic ant, which fails
// each. N2 and N4 have no assay yet: the game's brood carries no fungus and no colony buds; each comes with its mechanic.

test(
  "N1 a sick nestmate's fungus spreads thin through its nestmates",
  { todo: "ja-e668.4: contact passes load freely (every nestmate carries about half the exposed ant's peak, seeds 1-10)" },
  () => {
    for (const seed of [1, 2]) {
      const m = runAssay(neglectusImmunisation, seed).metrics;
      assert.equal(m.pass, 1, `seed ${seed}: carriers ${m.carriers}, peakRatio ${m.peakRatio}`);
    }
  },
);

test("N2 infected pupae are destroyed before they sporulate", { todo: "ja-e668.5: the game's brood carries no fungus yet" }, () => {
  assert.fail("no assay until brood can carry the fungus (ja-e668.5)");
});

test(
  "N3 colonies fight in proportion to how unalike they smell: most pairs mixed",
  { todo: "ja-e668.10: recognition is a step at the tolerance (seeds 1-10: 5 never, 5 always, 0 mixed)" },
  () => {
    let mixed = 0;
    for (let seed = 1; seed <= N3_DISTANCES.length; seed++) if (runAssay(neglectusTolerance, seed).metrics.kind === 1) mixed++;
    assert.ok(mixed >= 5, `${mixed} of ${N3_DISTANCES.length} pairs mixed (Ugelvig et al. 2008: 67 %)`);
  },
);

test("N4 a crowded colony with several queens buds within its network", { todo: "ja-e668.6: no colony buds yet" }, () => {
  assert.fail("no assay until budding exists (ja-e668.6, on ja-8fd.1)");
});
