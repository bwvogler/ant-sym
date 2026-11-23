import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// .github/workflows/pixels.yml runs the map's pixel guard (scripts/field-shots.mjs) on a PR with the `pixel-guard` label (ja-fnd.6.3.18): record on the merge
// base, check on the head. It runs the script's own `record` and `check` on one directory, with the head's script on both sides, and it starts only for
// a labelled PR. These tests hold the workflow to the script's usage and to those choices.

const ROOT = join(new URL("../../../../", import.meta.url).pathname);
const yml = readFileSync(join(ROOT, ".github/workflows/pixels.yml"), "utf8");
const script = readFileSync(join(ROOT, "scripts/field-shots.mjs"), "utf8");
const e2e = readFileSync(join(ROOT, ".github/workflows/e2e.yml"), "utf8");

const pathsOf = (text: string): string[] => {
  const block =
    /^ {2}pull_request:\n(?: {4}types:.*\n)? {4}paths:\n((?: {6}- .+\n)+)/m.exec(text)?.[1] ?? assert.fail("no pull_request paths");
  return [...block.matchAll(/- "([^"]+)"/g)].map((m) => m[1] ?? "");
};

test("the workflow records on the base and checks on the head with the script's own usage, into one directory", () => {
  assert.match(script, /node scripts\/field-shots\.mjs record <dir>/);
  assert.match(script, /node scripts\/field-shots\.mjs check <dir>/);
  const record = /node scripts\/field-shots\.mjs record "\$RUNNER_TEMP\/pixels"/.exec(yml);
  const check = /node scripts\/field-shots\.mjs check "\$RUNNER_TEMP\/pixels"/.exec(yml);
  assert.ok(record && check, "record and check name the same folder");
  assert.ok(record.index < check.index, "the baseline is recorded before it is checked");
  assert.match(
    yml,
    /working-directory: \$\{\{ runner\.temp \}\}\/base\n\s+run: node scripts\/field-shots\.mjs record/,
    "record runs in the base's checkout",
  );
  assert.ok(!/--any-browser/.test(yml), "one runner, one Chromium: the check must not skip the browser comparison");
});

test("the base is the merge base, and the head's script and helpers record it", () => {
  assert.match(yml, /git merge-base "\$BASE" "\$HEAD"/);
  assert.match(yml, /fetch-depth: 0/);
  assert.match(yml, /ref: \$\{\{ github\.event\.pull_request\.head\.sha \}\}/, "the head, not the merge commit of the PR into its base");
  const copyScript = yml.indexOf('cp scripts/field-shots.mjs "$RUNNER_TEMP/base/scripts/field-shots.mjs"');
  const copyLib = yml.indexOf('cp -r scripts/lib "$RUNNER_TEMP/base/scripts/lib"');
  const record = yml.indexOf("field-shots.mjs record");
  assert.ok(copyScript > 0 && copyLib > 0 && copyScript < record && copyLib < record, "copied before the record");
  // the script's helpers are the ones it imports from lib/
  const imports = [...script.matchAll(/from "\.\/(lib\/[^"]+)"/g)].map((m) => m[1]);
  assert.ok(imports.length > 0 && imports.every((i) => i?.startsWith("lib/")), "the script's imports are all under scripts/lib");
});

test("it runs only for a PR with the pixel-guard label (and for the labeled event only when that label is the one added)", () => {
  assert.match(yml, /types: \[labeled, synchronize, reopened\]/);
  assert.match(yml, /contains\(github\.event\.pull_request\.labels\.\*\.name, 'pixel-guard'\)/);
  assert.match(yml, /github\.event\.action != 'labeled' \|\| github\.event\.label\.name == 'pixel-guard'/);
  assert.match(yml, /cancel-in-progress: true/);
  assert.match(
    yml,
    /github\.event\.label\.name != 'pixel-guard' && format\('-\{0\}', github\.run_id\)/,
    "another label's event does not cancel a run",
  );
  assert.match(yml, /permissions:\n {2}contents: read\n/, "it only reads");
});

test("it starts for a change to what the page draws, the script, its helpers or itself, and not for tests alone", () => {
  const paths = pathsOf(yml);
  for (const p of [
    "web/src/**",
    "web/public/**",
    "web/shared/**",
    "scripts/field-shots.mjs",
    "scripts/lib/**",
    ".github/workflows/pixels.yml",
    "!web/src/**/tests/**",
  ])
    assert.ok(paths.includes(p), `${p} is a path`);
  // the page's own paths are the ones e2e.yml has
  for (const p of pathsOf(e2e).filter((q) => q.startsWith("web/") || q === "package.json"))
    assert.ok(paths.includes(p), `e2e.yml's ${p} is here too`);
});

test("Chromium and the system font are set up as e2e.yml does, and the pictures go up as an artifact whatever the result", () => {
  assert.match(yml, /PLAYWRIGHT_VERSION: 1\.63\.0/);
  assert.match(e2e, /PLAYWRIGHT_VERSION: 1\.63\.0/, "the same Chromium as the e2e run");
  assert.match(yml, /apt-get install -y --no-install-recommends fonts-inter/);
  assert.match(yml, /56-prefer-inter\.conf/);
  assert.match(yml, /name: pixels\n\s+path: \$\{\{ runner\.temp \}\}\/pixels\//);
  assert.match(yml, /if: \$\{\{ !cancelled\(\) \}\}\n\s+uses: actions\/upload-artifact/);
  assert.match(yml, /grep -q "scenes differ"/, "a differing scene is named in an ::error line");
  assert.match(script, /scenes differ/, "and the script still says so in those words");
});
