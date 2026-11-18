// Verify that the observational probe did not change any previously measured run.
// Usage: node scripts/lab/check-pickup-observation.mjs baseline.jsonl observed.jsonl
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const [baselinePath, observedPath] = process.argv.slice(2);
assert.ok(
  baselinePath && observedPath,
  "provide baseline and observed JSONL paths",
);
const rows = (path) =>
  readFileSync(path, "utf8").trim().split("\n").map(JSON.parse);
const baseline = new Map(rows(baselinePath).map((r) => [r.seed, r]));
const observed = rows(observedPath);
assert.equal(
  observed.length,
  baseline.size,
  "all baseline seeds must be observed",
);
assert.equal(
  new Set(observed.map((r) => r.seed)).size,
  observed.length,
  "duplicate seed",
);
let checked = 0;
for (const row of observed) {
  assert.deepEqual(
    row.runs.map((r) => r.arm),
    ["off", "cached-refuse"],
  );
  for (const r of row.runs) {
    const old = baseline.get(row.seed)?.runs.find((b) => b.arm === r.arm);
    assert.ok(old, `missing baseline ${row.seed}/${r.arm}`);
    for (const field of [
      "seconds",
      "hash",
      "encounters",
      "accepted",
      "distinct",
      "foodHome",
      "losses",
      "actualRequests",
    ])
      assert.deepEqual(
        r[field],
        old[field],
        `changed ${row.seed}/${r.arm}/${field}`,
      );
    checked++;
  }
}
console.log(
  `${checked} runs across ${observed.length} seeds: state hashes and counters unchanged.`,
);
