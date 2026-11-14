import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// .github/workflows/ci.yml runs the int, golden and soak files sharded, with their globs copied from web/package.json (node
// ignores --test-shard after the file list, so the npm scripts can't take it). PR CI and the deploy (pages.yml calls ci.yml)
// both run those copies, so a directory added to an npm script but not to ci.yml would run in neither, and stay green
// (ja-zyi5, review of #163 S1). These tests hold the copies equal.

const ROOT = join(new URL("../../../../", import.meta.url).pathname);
const scripts: Record<string, string> = JSON.parse(readFileSync(join(ROOT, "web/package.json"), "utf8")).scripts;
const ci = readFileSync(join(ROOT, ".github/workflows/ci.yml"), "utf8");

const globs = (cmd: string): string[] => cmd.split(/\s+/).filter((w) => w.endsWith(".test.ts"));
const timeout = (cmd: string): string | undefined => /--test-timeout=(\d+)/.exec(cmd)?.[1];
const script = (name: string): string => scripts[name] ?? assert.fail(`web/package.json has no ${name} script`);
/** The `run:` line of the ci.yml step whose name starts with `name` (other keys such as `if:` may come between). */
const step = (name: string): string => {
  const at = ci.indexOf(`- name: ${name}`);
  const m = at < 0 ? null : /^\s+run: (.+)$/m.exec(ci.slice(at).split(/\n\s+- /)[0] ?? "");
  return m?.[1] ?? assert.fail(`ci.yml has no step named "${name} …" with a run:`);
};

test("ci.yml's int-and-golden step runs test:int's and test:golden's files, at their per-file limit", () => {
  const run = step("int and golden");
  assert.deepEqual(globs(run), [...globs(script("test:int")), ...globs(script("test:golden"))]);
  assert.equal(timeout(run), timeout(script("test:int")));
  assert.equal(timeout(run), timeout(script("test:golden")));
});

test("ci.yml's soak step runs test:soak's files, at its per-file limit", () => {
  const run = step("soak");
  assert.deepEqual(globs(run), globs(script("test:soak")));
  assert.equal(timeout(run), timeout(script("test:soak")));
});

test("CI covers every file npm test runs: test:unit in the check job, the rest in the shards", () => {
  assert.match(ci, /^\s+- run: npm --prefix web run test:unit$/m, "the check job runs test:unit");
  const ciGlobs = [...globs(script("test:unit")), ...globs(step("int and golden")), ...globs(step("soak"))];
  assert.deepEqual(new Set(ciGlobs), new Set(globs(script("test"))));
});

test("the shard steps take the shard count from the matrix, not a copy of it", () => {
  for (const name of ["int and golden", "soak"]) {
    assert.match(step(name), /--test-shard=\$\{\{ matrix\.shard \}\}\/\$\{\{ strategy\.job-total \}\} /, name);
  }
});
