import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

// scripts/ci-report.mjs (ja-w7ef.2, .3) as CI runs it: a real node --test run with the reporter beside spec, over two
// throwaway test files, one with a failing test and one cut off at its per-file limit. What CI shows an agent (the step
// summary, the annotations, the durations artifact) has to name both, with the file and the kind of failure.

const exec = promisify(execFile);
const REPORTER = join(new URL("../../../../../scripts/ci-report.mjs", import.meta.url).pathname);
/** The outer runner's NODE_TEST_CONTEXT would make the inner node --test report to it instead of running on its own. */
const { NODE_TEST_CONTEXT: _outer, ...BASE_ENV } = process.env;

test("ci-report: a failing test and a file cut off at its limit reach the step summary, the annotations and the durations", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ci-report-"));
  writeFileSync(
    join(dir, "fails.test.ts"),
    'import { test } from "node:test";\nimport assert from "node:assert";\ntest("passes", () => {});\ntest("adds up", () => { assert.equal(1 + 1, 3, "one and one"); });\ntest("group", async (t) => { await t.test("inner", () => assert.fail("inner broke")); });\n' +
      'test("not yet", { todo: true }, () => assert.fail("todo"));\n' +
      'test("own limit", { timeout: 50 }, async () => { await new Promise((r) => setTimeout(r, 400)); });\n' +
      'test("outer", { timeout: 50 }, async (t) => { await t.test("cut short", async () => { await new Promise((r) => setTimeout(r, 400)); }); });\n',
  );
  writeFileSync(
    join(dir, "slow.test.ts"),
    'import { test } from "node:test";\ntest("waits", async () => { await new Promise((r) => setTimeout(r, 5000)); });\n',
  );
  const summary = join(dir, "summary.md");
  const durations = join(dir, "durations.json");
  const env = {
    ...BASE_ENV,
    GITHUB_ACTIONS: "true",
    GITHUB_WORKSPACE: dir,
    GITHUB_STEP_SUMMARY: summary,
    TEST_DURATIONS_FILE: durations,
    TEST_REPORT_TITLE: "fixture",
  };
  writeFileSync(summary, "");
  const args = [
    "--test",
    "--test-timeout=1500",
    `--test-reporter=${REPORTER}`,
    "--test-reporter-destination=stdout",
    "fails.test.ts",
    "slow.test.ts",
  ];
  const run = await exec("node", args, { cwd: dir, env, timeout: 20_000 }).catch((e: { stdout: string }) => e);
  const out = run.stdout;

  const md = readFileSync(summary, "utf8");
  assert.match(md, /^### fixture/m);
  assert.match(md, /\| fails\.test\.ts:\d+ \| adds up \| failed \| one and one \|/);
  assert.match(md, /\| slow\.test\.ts \| \(the whole file\) \| cancelled at the limit \|/);
  assert.match(md, /\| fails\.test\.ts:\d+ \| inner \| failed \| inner broke \|/, "a failing subtest is reported");
  assert.doesNotMatch(md, /\| group \|/, "its parent, failed only through it, is not a second row");
  assert.doesNotMatch(md, /not yet/, "a todo test that fails is not a failure");
  assert.match(md, /\| fails\.test\.ts:\d+ \| own limit \| timed out \|/, "a test's own timeout is 'timed out', not the file's");
  assert.match(md, /\| fails\.test\.ts:\d+ \| outer \| timed out \|/);
  assert.doesNotMatch(md, /cut short/, "a subtest cancelled with its parent is not a second row");
  // The limit is read from --test-timeout (no TEST_FILE_LIMIT_MS here); times are the whole file's, so a few ms over.
  assert.match(md, /- slow\.test\.ts: 1\.\d s \(\d+ % of 1\.5 s\) ⚠/);

  assert.match(out, /^::error file=fails\.test\.ts,line=\d+,title=failed%3A adds up::one and one$/m);
  assert.match(out, /^::error file=slow\.test\.ts,title=cancelled at the limit%3A \(the whole file\)::/m);
  assert.match(out, /^::warning file=slow\.test\.ts,title=near its time limit::slow\.test\.ts took 1\.\d s of its 1\.5 s limit/m);
  assert.doesNotMatch(out, /fails\.test\.ts,title=near/, "a quick file gets no warning");

  const ms = JSON.parse(readFileSync(durations, "utf8")) as Record<string, number>;
  assert.deepEqual(Object.keys(ms).sort(), ["fails.test.ts", "slow.test.ts"]);
  assert.ok((ms["slow.test.ts"] ?? 0) >= 1400, `slow.test.ts ${ms["slow.test.ts"]} ms`);
});

test("ci-report: outside Actions it prints nothing, even for a failure (local runs stay as they were)", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ci-report-"));
  writeFileSync(
    join(dir, "ok.test.ts"),
    'import { test } from "node:test";\nimport assert from "node:assert";\ntest("no", () => assert.fail("nope"));\n',
  );
  const env = { ...BASE_ENV, GITHUB_ACTIONS: "", GITHUB_STEP_SUMMARY: "", TEST_DURATIONS_FILE: "" };
  const run = await exec("node", ["--test", `--test-reporter=${REPORTER}`, "--test-reporter-destination=stdout", "ok.test.ts"], {
    cwd: dir,
    env,
    timeout: 20_000,
  }).catch((e: { stdout: string }) => e);
  const stdout = run.stdout;
  assert.equal(stdout, "");
});
