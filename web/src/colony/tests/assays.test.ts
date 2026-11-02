import { test } from "node:test";
import assert from "node:assert/strict";
import { A1, A2, A3, A4, A5, A6, A7, ASSAYS, summarize, type Assay, type AssayRun } from "../assays.ts";

// The gate: short versions of the assays (assays.ts), two or three seeds
// each, so a change that breaks a behaviour the colony already has fails
// npm test. The full sweeps (ten seeds, full length, parameter grids) stay in
// scripts/experiment.mjs. An assay the colony does not pass yet is a `todo`
// naming the phase meant to make it pass (one seed: enough to see it flip);
// that phase turns it into a test.

const runs = (a: Assay, seeds: number[]): AssayRun[] => seeds.map((s) => a.run(s, {}, true));
const show = (r: AssayRun) => `seed ${r.seed}: ${Object.entries(r.metrics).map(([k, v]) => `${k} ${v.toFixed(2)}`).join(", ")}`;

test("assays: ids are unique and every metric names which way is better", () => {
  const ids = ASSAYS.map((a) => a.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const a of ASSAYS) for (const m of a.metrics) assert.ok(m.better === "high" || m.better === "low", `${a.id}.${m.key}`);
});

test("A1 double bridge (short): traffic settles on the short branch", () => {
  for (const r of runs(A1, [1, 2])) assert.ok(r.pass, show(r));
});

test("A4 alarm (short): a blot of alarm reaches a few cells and fades within seconds", () => {
  for (const r of runs(A4, [1, 2])) {
    const { reach, fade } = r.metrics as { reach: number; fade: number };
    assert.ok(reach >= 3 && reach <= 10, show(r));
    assert.ok(fade >= 10 && fade <= 40, show(r));
  }
});

test("A6 combat (short): in the open, outnumbered 2:1, the defenders lose more than they kill", () => {
  for (const r of runs(A6, [1, 2, 3])) assert.ok((r.metrics.openExchange as number) < 1, show(r));
});

test("A7 homing (short): few ants are stuck out on a small map", () => {
  for (const r of runs(A7, [1, 2])) assert.ok(r.pass, show(r));
});

test("A3 depletion (short): traffic leaves a dead trail within 60 s, no mills", { todo: "Phase 3: the no-entry mark (baseline: ~65–75 s)" }, () => {
  for (const r of runs(A3, [1])) assert.ok(r.pass, show(r));
});

test("A4 alarm (short): foragers scatter from alarm, defenders gather", { todo: "Phase 4: graded alarm (baseline is borderline)" }, () => {
  for (const r of runs(A4, [1])) assert.ok(r.pass, show(r));
});

test("A6 combat (short): even fights trade evenly and a narrow pass favours the defenders", { todo: "Phase 4: terrain-limited combat" }, () => {
  const rs = runs(A6, [1, 2, 3]);
  assert.ok(summarize(A6, rs).verdict, rs.map(show).join("; "));
});

test("A2 rich vs poor (short): the rich source wins; an established poor trail persists", { todo: "Phase 3: food quality" }, () => {
  for (const r of runs(A2, [1])) assert.ok(r.pass, show(r));
});

test("A5 regulation (short): foragers stay home while foraging fails and go out as returns pick up", { todo: "Phase 5: activation from the rate of successful returns" }, () => {
  for (const r of runs(A5, [1])) assert.ok(r.pass, show(r));
});
