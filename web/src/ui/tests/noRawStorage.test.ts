import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

// The page keeps a value in the browser through `persisted` (ui/storage.ts, ja-fnd.6.1.2), which guards missing, blocked and full storage
// once. A store that reaches for `localStorage` or `sessionStorage` itself would need its own guard, and would be a key the table of
// names does not see. This holds the line for the page's code (index.html's boot script, which runs before the page, is not it).

const SRC = new URL("../../", import.meta.url).pathname;

function* sources(dir: string): Generator<string> {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name !== "tests") yield* sources(p);
    } else if (/\.[mc]?[jt]sx?$/.test(e.name)) yield p;
  }
}

/** The code of a source file: its comments (and so a note that names localStorage) taken out, its strings left. */
export const code = (text: string): string => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");

test("only ui/storage.ts touches localStorage or sessionStorage", () => {
  const found: string[] = [];
  for (const file of sources(SRC)) {
    const rel = relative(SRC, file);
    if (rel === "ui/storage.ts") continue;
    if (/\b(localStorage|sessionStorage)\b/.test(code(readFileSync(file, "utf8")))) found.push(rel);
  }
  assert.deepEqual(found, [], "use persisted(key) (ui/storage.ts) for a value kept in the browser");
});

test("the comment stripper leaves code, and takes out what a note says", () => {
  assert.match(code("const a = localStorage.getItem(k);"), /localStorage/);
  assert.match(code('const u = "http://x"; localStorage.clear();'), /localStorage/);
  assert.doesNotMatch(code("// localStorage is blocked\nconst a = 1;"), /localStorage/);
  assert.doesNotMatch(code("/** where localStorage\n * is blocked */\nconst a = 1;"), /localStorage/);
  assert.match(code("const a = 1; // note\nlocalStorage.clear();"), /localStorage/);
});
