import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";

// The colony's tuning constants live by domain under colony/tuning/ (ja-fnd.4.5); colony/tuning.ts only re-exports them. A constant added
// to tuning.ts itself would merge cleanly and pass every other test (review of #227), so this holds the line: tuning.ts is re-exports of
// tuning/ only, and every file there is re-exported.

const COLONY = new URL("../../colony/", import.meta.url);

test("tuning.ts only re-exports the domain files under tuning/, and every one of them", () => {
  const lines = readFileSync(new URL("tuning.ts", COLONY), "utf8")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l !== "" && !l.startsWith("//"));
  const reexported: string[] = [];
  for (const l of lines) {
    const m = /^export \* from "\.\/tuning\/([\w-]+\.ts)";$/.exec(l);
    assert.ok(m, `tuning.ts holds only re-exports of tuning/; put this in a domain file under tuning/: ${l}`);
    reexported.push(m[1]!);
  }
  const files = readdirSync(new URL("tuning/", COLONY))
    .filter((f) => f.endsWith(".ts"))
    .sort();
  assert.deepEqual([...reexported].sort(), files, "every file under tuning/ is re-exported, once");
});
