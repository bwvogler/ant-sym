import { test } from "node:test";
import assert from "node:assert/strict";
import { noEntryFork, noEntryForkBare, runAssay } from "../../experiment.ts";

// The builder's no-entry sign turns trail followers (docs/builder.md "Slice 2", PRD §73.3; review of #229, S2): on a
// crayon fork, more of the ants on its branches take the unpainted one than on the same fork bare. A short run of
// assay B7 and its control, one seed: the full assay (seeds 1–10, 80 s) is in PRD §73.3.

test("a no-entry sign on one branch of a crayon fork sends followers down the other", () => {
  const painted = runAssay(noEntryFork, 2, {}, 50).metrics.otherShare as number;
  const bare = runAssay(noEntryForkBare, 2, {}, 50).metrics.otherShare as number;
  assert.ok(painted > bare + 0.12, `unpainted branch's share: ${painted} with the sign, ${bare} bare`);
});
