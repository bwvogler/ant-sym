import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

// The colony's public surface is colony/index.ts (docs/refactor.md S1): the page, the server, the worker and the maintained
// scripts import from it, never from a module file, so a module can move or split without touching them. experiment.ts (the
// assay harness) stays out of the index and is imported by name; scripts/lab is one-off and not held to this.

const WEB = new URL("../../../", import.meta.url).pathname; // web/
const ROOT = join(WEB, "..");
const INTERNAL = /["'](?:\.\.?\/)+(?:web\/src\/)?colony\/(?!index\.ts|experiment\.ts|tests\/)[\w/]+\.ts["']/;

function* walk(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "dist" || name === "lab") continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (/\.(ts|tsx|mjs)$/.test(name)) yield p;
  }
}

test("code outside web/src/colony imports the colony through colony/index.ts", () => {
  const roots = [join(WEB, "src"), join(WEB, "server"), join(WEB, "worker"), join(ROOT, "scripts")];
  const bad: string[] = [];
  for (const r of roots)
    for (const f of walk(r)) {
      if (f.startsWith(join(WEB, "src", "colony") + sep)) continue;
      readFileSync(f, "utf8")
        .split("\n")
        .forEach((line, k) => {
          if (INTERNAL.test(line)) bad.push(`${relative(ROOT, f)}:${k + 1}: ${line.trim().slice(0, 100)}`);
        });
    }
  assert.deepEqual(bad, [], "import these from colony/index.ts");
});
