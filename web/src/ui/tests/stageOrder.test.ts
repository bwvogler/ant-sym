// Review of #159, S1: the rule was shown by a scratch poison run; this keeps it true.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// tick's stages share one step record for every ant (docs/refactor.md S3.4, ja-fnd.4.4.8): a stage reads a per-ant field
// (in its prologue, `const x = s.x;`) only after an earlier stage writes it (in its epilogue, `s.x = x;`) on every path,
// or it would get the previous ant's value. The void stages have no early `return;` that would skip their writes.
const COLONY = new URL("../../colony/", import.meta.url).pathname;
const STAGES = ["perceive", "stance", "decide", "steer", "move", "arrive"];
// Set by tick for the whole tick or layer (stageWrites.test.ts), and the held count stanceStep accumulates.
const TICK = new Set([
  "p",
  "rng",
  "dt",
  "a",
  "ca",
  "sa",
  "map",
  "ph",
  "home",
  "gate",
  "hold",
  "leak",
  "metLeak",
  "rgate",
  "foeLeak",
  "sgate",
  "threatLeak",
  "crowdKeep",
  "heldNow",
]);

test("each tick stage reads only per-ant fields an earlier stage writes on every path", () => {
  const written = new Set<string>();
  for (const f of STAGES) {
    const src = readFileSync(`${COLONY}${f}.ts`, "utf8");
    for (const [, name] of src.matchAll(/(?:const|let) \w+ = s\.(\w+);/g))
      assert.ok(TICK.has(name!) || written.has(name!), `${f}.ts reads s.${name} before an earlier stage writes it`);
    if (/s: AntStep\): void/.test(src)) assert.ok(!/\breturn;/.test(src), `${f}.ts returns early, skipping its writes`);
    // Only a write at the stage's top level (two spaces in) is on every path; one in a branch is not.
    for (const [, name] of src.matchAll(/^  s\.(\w+) = \w+;$/gm)) written.add(name!);
  }
});
