import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { SEEDS } from "../../colony/tests/slow/g1/g1Rule.ts";

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
/** A workflow step's block, from its `- name: <name> …` line to the next step (`env:` or `if:` may sit before its `run:`). */
const block = (yml: string, name: string, file: string): string => {
  const at = yml.indexOf(`- name: ${name}`);
  return at < 0 ? assert.fail(`${file} has no step named "${name} …"`) : (yml.slice(at).split(/\n\s+- /)[0] ?? "");
};
/** The `run:` line of a workflow step whose name starts with `name`. */
const runOf = (yml: string, name: string, file: string): string =>
  /^\s+run: (.+)$/m.exec(block(yml, name, file))?.[1] ?? assert.fail(`${file}'s "${name} …" step has no run:`);
const step = (name: string): string => runOf(ci, name, "ci.yml");
const slowYml = readFileSync(join(ROOT, ".github/workflows/slow.yml"), "utf8");
/** Both reporters, as ci.yml has run them since #175: spec for people, scripts/ci-report.mjs for ::error lines and durations. */
const REPORTERS =
  "--test-reporter=spec --test-reporter-destination=stdout --test-reporter=../scripts/ci-report.mjs --test-reporter-destination=stdout";

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

// Every test file runs somewhere: a *.test.ts outside every glob of npm test and test:slow runs in no tier, locally or in
// CI, and nothing says so (review of #165: a file moved to an unglobbed folder passed every check).
const testFiles = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((d) =>
    d.name === "node_modules"
      ? []
      : d.isDirectory()
        ? testFiles(join(dir, d.name))
        : d.name.endsWith(".test.ts")
          ? [join(dir, d.name)]
          : [],
  );

test("every *.test.ts under web/ is in a glob of npm test or test:slow", () => {
  const web = join(ROOT, "web");
  const all = [...globs(script("test")), ...globs(script("test:slow"))];
  for (const g of all) assert.match(g, /^[^*]+\/\*\.test\.ts$/, `${g}: only <dir>/*.test.ts globs are understood here`);
  const dirs = new Set(all.map((g) => dirname(g)));
  const missed = testFiles(web)
    .map((f) => relative(web, f))
    .filter((f) => !dirs.has(dirname(f)));
  assert.deepEqual(missed, [], "test files no tier runs: add their folder to an npm script (and ci.yml), or move them");
});

// slow.yml runs test:slow sharded, on a schedule and on labelled colony PRs (ja-w7ef.4), with the same kind of copied globs.
test("slow.yml's step runs test:slow's files at its per-file limit, sharded by the matrix", () => {
  const run = runOf(slowYml, "slow guards", "slow.yml");
  const g1 = runOf(slowYml, "G1, seed", "slow.yml");
  assert.match(block(slowYml, "slow guards", "slow.yml"), /^\s+working-directory: web$/m);
  assert.match(block(slowYml, "G1, seed", "slow.yml"), /^\s+working-directory: web$/m);
  // The shards run every slow folder but G1's, which has a job of its own (ja-w7ef.15): together, test:slow's globs.
  assert.deepEqual(globs(g1), ["src/colony/tests/slow/g1/*.test.ts"]);
  // The file itself, not only the glob: back in slow/, the shards would run it again (review of #240, N2).
  assert.deepEqual(
    readdirSync(join(ROOT, "web/src/colony/tests/slow/g1")).filter((f) => f.endsWith(".test.ts")),
    ["oneWorldG1.test.ts"],
  );
  assert.ok(!readdirSync(join(ROOT, "web/src/colony/tests/slow")).includes("oneWorldG1.test.ts"), "G1 is not in the shards' folder");
  assert.deepEqual([...globs(run), ...globs(g1)], globs(script("test:slow")));
  assert.equal(timeout(run), timeout(script("test:slow")));
  assert.equal(timeout(g1), timeout(script("test:slow")));
  assert.doesNotMatch(g1, /--test-shard/, "G1 is not sharded: a runner per seed, by G1_SEEDS");
  // It runs exactly when the shards do: the same condition.
  const cond = (job: string): string =>
    new RegExp(`^  ${job}:\\n(?:    (?:#|name:).*\\n)*    if: >-\\n((?:      .+\\n)+)`, "m").exec(slowYml)?.[1] ?? "";
  assert.ok(cond("slow").length > 0 && cond("g1") === cond("slow"), "the g1 job's if: is the slow job's");
  assert.match(run, /--test-shard=\$\{\{ matrix\.shard \}\}\/\$\{\{ strategy\.job-total \}\} /);
});

test("every sharded test step runs both reporters, so a failure prints its ::error line and the files their times (ja-w7ef.11)", () => {
  for (const [yml, name, file] of [
    [ci, "int and golden", "ci.yml"],
    [ci, "soak", "ci.yml"],
    [slowYml, "slow guards", "slow.yml"],
    [slowYml, "G1, seed", "slow.yml"],
  ] as const) {
    const b = block(yml, name, file);
    assert.ok(runOf(yml, name, file).includes(REPORTERS), `${file} "${name}" runs spec and ci-report`);
    assert.match(b, /TEST_DURATIONS_FILE: /, `${file} "${name}" writes its durations`);
  }
  assert.match(slowYml, /^\s+name: slow-durations-\$\{\{ matrix\.shard \}\}$/m, "slow.yml uploads each shard's durations");
  assert.match(slowYml, /^\s+name: slow-durations-g1-\$\{\{ matrix\.seed \}\}$/m, "and each G1 seed's");
});

// G1 (ja-w7ef.20): a runner per seed, then one verdict job applying g1Rule.ts's rule to their results.
test("slow.yml's g1 job is a matrix over G1's seeds, one seed and one result file each; the checks are g1 (n) and g1 verdict", () => {
  const job = (id: string): string =>
    new RegExp(`^  ${id}:\\n(?:    .*\\n|\\n(?=    ))+`, "m").exec(slowYml)?.[0] ?? assert.fail(`slow.yml has no ${id} job`);
  const g1 = job("g1");
  assert.match(g1, /^    name: g1 \(\$\{\{ matrix\.seed \}\}\)$/m, "the check is `g1 (n)`");
  const listed = /^        seed: \[([\d, ]+)\]$/m.exec(g1)?.[1]?.split(",").map(Number);
  assert.deepEqual(listed, SEEDS, "the matrix plays exactly the seeds of the rule");
  assert.match(g1, /^\s+fail-fast: false$/m, "one red seed doesn't cancel the others: the verdict names them all");
  const b = block(g1, "G1, seed", "slow.yml");
  assert.match(b, /^\s+G1_SEEDS: \$\{\{ matrix\.seed \}\}$/m);
  assert.match(b, /^\s+G1_RESULT: \$\{\{ runner\.temp \}\}\/g1\/g1-seed-\$\{\{ matrix\.seed \}\}\.json$/m);
  assert.match(g1, /^\s+name: g1-seed-\$\{\{ matrix\.seed \}\}$/m, "each seed uploads its result");
  assert.match(g1, /^\s+path: \$\{\{ runner\.temp \}\}\/g1\/$/m, "from the folder G1_RESULT writes into");
  assert.match(g1, /^\s+persist-credentials: false$/m);

  const v = job("g1-verdict");
  assert.match(v, /^    name: g1 verdict$/m, "the check is `g1 verdict`");
  assert.match(v, /^    needs: g1$/m);
  // After a red seed too (that is its job), but not when the matrix was skipped (no label on a PR).
  assert.match(v, /^    if: \$\{\{ !cancelled\(\) && needs\.g1\.result != 'skipped' \}\}$/m);
  assert.match(v, /^\s+pattern: g1-seed-\*$/m);
  assert.match(v, /^\s+path: g1$/m, "into the folder the verdict script is given");
  assert.match(v, /^\s+merge-multiple: true$/m);
  const run = block(v, "G1 verdict", "slow.yml");
  assert.match(run, /set -euo pipefail/);
  assert.match(run, /node scripts\/g1-verdict\.mjs g1 \| tee -a "\$GITHUB_STEP_SUMMARY"/, "the verdict is the shared rule's script");
  assert.match(v, /^\s+persist-credentials: false$/m);
  assert.doesNotMatch(v, /\$\{\{ (?:inputs|github\.event)/, "no inputs or PR text in a run: script");
});

// The nightly tiers job (ja-w7ef.10) times each unit and int file alone against its tier's line (docs/agent-guide.md,
// Tests: unit under ~1.5 s, int to 12 s). Its globs and lines are copies; these hold them.
test("slow.yml's tiers job times test:unit's and test:int's files alone, against the agent guide's lines", () => {
  assert.match(slowYml, /^  tiers:\n    if: github\.event_name != 'pull_request'$/m, "the tiers job never runs on a PR");
  assert.match(block(slowYml, "int files alone", "slow.yml"), /^\s+if: \$\{\{ !cancelled\(\) \}\}$/m, "int runs after a red unit step");
  const guide = readFileSync(join(ROOT, "docs/agent-guide.md"), "utf8");
  assert.match(guide, /under about 1\.5 s `unit\/`, to 12 s `int\/`, over that `soak\/`/, "the agent guide's lines are 1.5 s and 12 s");
  for (const [name, npm, tier] of [
    ["unit files alone", "test:unit", "unit:1500:int"],
    ["int files alone", "test:int", "int:12000:soak"],
  ] as const) {
    const run = runOf(slowYml, name, "slow.yml");
    assert.deepEqual(globs(run), globs(script(npm)), name);
    assert.equal(timeout(run), timeout(script(npm)), name);
    assert.match(run, /--test-concurrency=1 /, `${name}: one file at a time, or the times aren't "alone"`);
    assert.ok(run.includes(REPORTERS), name);
    assert.match(block(slowYml, name, "slow.yml"), new RegExp(`TEST_TIER: ${tier}$`, "m"), name);
  }
});
