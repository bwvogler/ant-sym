import { test } from "node:test";
import assert from "node:assert/strict";
import { bridge, regulate, runAssay, twin } from "../../experiment.ts";

// The behaviour assays today's ants don't pass yet (experiment.ts, docs/PRD.md §42): they run, and their
// pass mark is the goal of the behaviour MR named in each `todo`; that MR turns it into a test. Too slow
// together for npm test's 60 s per file. (G, the whole side-view game, is guarded by slow/side.test.ts.)

test("A1 double bridge: ≥ 80 % on the short branch", { todo: "behaviour MR 3: trail marking as a response" }, () => {
  const m = runAssay(bridge, 1).metrics;
  assert.ok(Number.isFinite(m.shortShare));
  assert.equal(m.pass, 1, `shortShare ${m.shortShare}`);
});

test("A2a two equal sources: the colony concentrates on one", { todo: "behaviour MR 3: trail marking as a response" }, () => {
  const m = runAssay(twin, 1).metrics;
  assert.ok(Number.isFinite(m.majorityShare));
  assert.equal(m.pass, 1, `majorityShare ${m.majorityShare}`);
});

test("A5 regulation: foragers stay home without food", { todo: "behaviour MR 5: forager activation from returns" }, () => {
  const m = runAssay(regulate, 1).metrics;
  assert.ok(Number.isFinite(m.outsideBefore));
  assert.equal(m.pass, 1, `outside before ${m.outsideBefore}, after ${m.outsideAfter}`);
});
