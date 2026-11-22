import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";

// scripts/pr-notes.mjs and .github/workflows/pr-notes.yml (ja-w7ef.7, ja-w7ef.6): the comment that tells a PR what
// CLAUDE.md asks it to say (the Jev cost before and after, the golden masters it re-records). The readers parse
// colony-cost's and fungus-cost's real output, so a change to either script's wording fails here, not silently in CI.

const exec = promisify(execFile);
const ROOT = join(new URL("../../../../../", import.meta.url).pathname);
type Cost = { usdPerHour: number | null; tokPerQuestion: number | null; responsesUsdPerHour?: number | null };
type Mod = {
  MARKER: string;
  isGolden: (f: string) => boolean;
  readColonyCost: (t: string) => Cost;
  readFungusCost: (t: string) => Cost;
  notes: (o: {
    changed: string[];
    body: string;
    colony: null | { base: Cost; head: Cost };
    fungus: null | { base: Cost; head: Cost };
    costRan?: boolean;
  }) => string;
};
const load = async (): Promise<Mod> => (await import(join(ROOT, "scripts/pr-notes.mjs"))) as Mod;

test("pr-notes reads colony-cost's and fungus-cost's real output", async () => {
  const { readColonyCost, readFungusCost } = await load();
  const run = async (script: string, ...args: string[]): Promise<string> =>
    (await exec("node", [join(ROOT, "scripts", script), ...args], { cwd: ROOT, timeout: 60_000 })).stdout;
  const colony = readColonyCost(await run("colony-cost.mjs", "--one", "0.5", "100", "1"));
  for (const [k, v] of Object.entries(colony)) assert.ok(typeof v === "number" && v > 0, `colony-cost ${k}: ${v}`);
  const fungus = readFungusCost(await run("fungus-cost.mjs", "lockpick", "1", "100", "1"));
  for (const [k, v] of Object.entries(fungus)) assert.ok(typeof v === "number" && v > 0, `fungus-cost ${k}: ${v}`);
});

test("pr-notes: the cost table, its change, and whether a re-recorded golden is named in the description", async () => {
  const { notes, MARKER, isGolden } = await load();
  const same = { usdPerHour: 0.19, tokPerQuestion: 680, responsesUsdPerHour: 0.3 };
  const quiet = notes({ changed: ["web/src/ui/app.tsx"], body: "", colony: null, fungus: null });
  assert.ok(quiet.startsWith(MARKER), "the first line finds the comment again");
  assert.match(quiet, /Not run: the PR changes nothing under `web\/src\/colony\/`/);
  assert.match(quiet, /None changed\./);

  const flat = notes({ changed: [], body: "", colony: { base: same, head: same }, fungus: null });
  assert.match(flat, /\| modes, \$\/h \| \$0\.19000 \| \$0\.19000 \| unchanged \|/);
  assert.match(flat, /No lane's cost moved\./);

  const dearer = { ...same, usdPerHour: 0.209, tokPerQuestion: 748 };
  const moved = notes({ changed: [], body: "", colony: { base: same, head: dearer }, fungus: null });
  assert.match(moved, /\| modes, \$\/h \| \$0\.19000 \| \$0\.20900 \| \+\$0\.01900 \(\+10\.0 %\) \|/);
  assert.match(moved, /\| modes, tokens a question \| 680 \| 748 \| \+68 \(\+10\.0 %\) \|/);
  assert.match(moved, /The cost moved: CLAUDE\.md asks the PR to note the new figure/);
  const fungusMoved = notes({
    changed: [],
    body: "",
    colony: null,
    fungus: { base: { usdPerHour: 0.04, tokPerQuestion: 984 }, head: { usdPerHour: 0.03, tokPerQuestion: 900 } },
  });
  assert.match(fungusMoved, /\| fungus, \$\/h \| \$0\.04000 \| \$0\.03000 \| −\$0\.01000 \(-25\.0 %\) \|/);
  assert.match(fungusMoved, /The cost moved/);
  // Every figure counts, compared as printed (review of #234, S2, N5).
  const responses = notes({ changed: [], body: "", colony: { base: same, head: { ...same, responsesUsdPerHour: 0.6 } }, fungus: null });
  assert.match(responses, /The cost moved/, "a response lane's $/h");
  const tokensOnly = { base: { usdPerHour: 0.04, tokPerQuestion: 770 }, head: { usdPerHour: 0.04, tokPerQuestion: 900 } };
  assert.match(notes({ changed: [], body: "", colony: null, fungus: tokensOnly }), /The cost moved/, "the fungus's tokens a question");
  const tiny = notes({ changed: [], body: "", colony: { base: same, head: { ...same, usdPerHour: 0.190001 } }, fungus: null });
  assert.match(tiny, /\| \$0\.19000 \| \$0\.19000 \| unchanged \|/);
  assert.match(tiny, /No lane's cost moved\./, "a change below what the table prints is no change");
  const blank = { usdPerHour: null, tokPerQuestion: null, responsesUsdPerHour: null };
  assert.match(
    notes({ changed: [], body: "", colony: { base: blank, head: blank }, fungus: null }),
    /⚠ Couldn't read colony-cost's output/,
  );
  // N4: the estimates ran, but a pair is missing: one failed, which the comment says instead of a red check.
  const failed = notes({ changed: [], body: "", colony: { base: same, head: same }, fungus: null, costRan: true });
  assert.match(failed, /⚠ fungus-cost didn't finish on the base or the head/);
  assert.doesNotMatch(failed, /Not run/);
  // S3: no figure read on both sides gives "unknown", never "no lane moved".
  const crashed = notes({ changed: [], body: "", colony: null, fungus: null, costRan: true });
  assert.match(crashed, /⚠ colony-cost didn't finish/);
  assert.match(crashed, /⚠ fungus-cost didn't finish/);
  assert.match(crashed, /whether the cost moved is unknown/);
  assert.doesNotMatch(crashed, /Not run|No lane's cost moved|\| lane \|/);
  for (const [base, head] of [
    [same, blank],
    [blank, same],
  ]) {
    const oneSide = notes({ changed: [], body: "", colony: { base, head }, fungus: null });
    assert.match(oneSide, /whether the cost moved is unknown/, "a figure read on one side only is not a change");
  }

  const golden = "web/src/colony/tests/golden/oneWorldGolden.json";
  assert.ok(isGolden(golden) && isGolden("web/src/colony/tests/slow/golden.json") && !isGolden("web/src/colony/params.ts"));
  const unnamed = notes({ changed: [golden, "web/src/colony/params.ts"], body: "Tunes routeStep.", colony: null, fungus: null });
  assert.match(unnamed, new RegExp(`- \`${golden}\` re-recorded`));
  assert.match(unnamed, /⚠ The description doesn't mention the goldens/);
  const named = notes({ changed: [golden], body: "Re-records the one-world golden (GOLDEN_WRITE=1).", colony: null, fungus: null });
  assert.match(named, /The description mentions the goldens\./);
});

test("pr-notes.yml passes pr-notes.mjs the flags it reads, and runs the cost only for colony or shared changes", () => {
  const yml = readFileSync(join(ROOT, ".github/workflows/pr-notes.yml"), "utf8");
  const script = readFileSync(join(ROOT, "scripts/pr-notes.mjs"), "utf8");
  for (const flag of ["--changed", "--body", "--colony-base", "--colony-head", "--fungus-base", "--fungus-head", "--cost-ran"])
    assert.ok(script.includes(`"${flag}"`), `pr-notes.mjs reads ${flag}`);
  assert.match(yml, /args=\(--changed "\$RUNNER_TEMP\/changed\.txt" --body "\$RUNNER_TEMP\/body\.txt"\)/);
  assert.match(yml, /args\+=\("--\$lane-base" "\$RUNNER_TEMP\/\$lane-base\.txt" "--\$lane-head" "\$RUNNER_TEMP\/\$lane-head\.txt"\)/);
  assert.match(yml, /for lane in colony fungus; do/);
  assert.match(yml, /grep -qE '\^web\/\(src\/colony\|shared\)\/'/);
  // The description reaches bash as an environment variable, never spliced into the script.
  assert.match(yml, /BODY: \$\{\{ github\.event\.pull_request\.body \}\}/);
  // Anywhere in the file, not only on a run: line: every run here is a `run: |` block (review of #234, S1).
  for (const line of yml.split("\n").filter((l) => /github\.(event\.pull_request\.(body|title|head\.ref)|head_ref)/.test(l)))
    assert.match(line, /^\s+[A-Z_]+: \$\{\{ github\.(event\.pull_request\.[\w.]+|head_ref) \}\}$/, `only as an env value: ${line.trim()}`);
  assert.match(yml, /if \[ "\$COST_RAN" = "true" \]; then args\+=\(--cost-ran\); fi/, "the workflow tells the script the estimates ran");
  // A failed estimate is reported in the comment, not as a red step that skips it (review of #234, N8).
  assert.equal((yml.match(/^\s+continue-on-error: true$/gm) ?? []).length, 2, "both cost steps continue on error");
  assert.match(yml, /^\s+set -euo pipefail$/m, "the comment step fails loudly rather than posting a duplicate");
  assert.match(yml, /persist-credentials: false/, "the write token stays out of .git/config");
  assert.match(yml, /select\(\.user\.login == \\"github-actions\[bot\]\\"/, "only the bot's own comment is edited");
});
