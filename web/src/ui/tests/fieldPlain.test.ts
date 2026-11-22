import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

// ui/field/ is plain TypeScript (ja-fnd.6.3, docs/field-split.md): what a frame needs from the browser comes through FieldEnv (field/env.ts), so a
// Node test can run it. This holds that line: no React, no DOM global, no clock, no build flag in a field file except env.ts itself, which only
// touches them inside browserEnv().

const DIR = fileURLToPath(new URL("../field/", import.meta.url));
const FILES = readdirSync(DIR).filter((f) => f.endsWith(".ts") && f !== "env.ts");

test("ui/field files (but env.ts) use no React, DOM global, clock or build flag", () => {
  assert.ok(FILES.includes("prelude.ts") && FILES.includes("result.ts"), "the field files were found");
  const banned = [
    /from "react/,
    /\bwindow\./,
    /\bdocument\./,
    /\bperformance\.now\b/,
    /\bimport\.meta\.env\b/,
    /\bnew Image\(/,
    /\bmatchMedia\(/,
    /\bnew Path2D\(/,
  ];
  for (const f of FILES) {
    const code = readFileSync(DIR + f, "utf8")
      .split("\n")
      .filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*") && !l.trim().startsWith("/*"))
      .join("\n");
    for (const re of banned) assert.ok(!re.test(code), `${f} uses ${re}: take it from FieldEnv`);
  }
});

test("field/env.ts imports with no DOM (browserEnv() is what touches it)", async () => {
  const m = await import("../field/env.ts");
  assert.equal(typeof m.browserEnv, "function");
});
