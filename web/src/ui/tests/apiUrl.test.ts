import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

// The Pages build serves under /ant-sym/, so a bare "/api/..." fetch would hit the
// wrong origin path. Every API call goes through apiUrl() (ui/backend.ts).

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return n === "tests" ? [] : files(p);
    return /\.tsx?$/.test(n) ? [p] : [];
  });
}

test("no fetch to a bare /api/ path", () => {
  const bad = files(new URL("../../", import.meta.url).pathname).filter((f) => /fetch\(\s*["'`]\/api\//.test(readFileSync(f, "utf8")));
  assert.deepEqual(bad, [], 'use fetch(apiUrl("api/...")) instead');
});
