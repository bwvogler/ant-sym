import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// .github/workflows/e2e.yml runs the page's browser guard on PRs (ja-w7ef.8). It runs the npm script, not a copy of the
// command, and starts only on PRs that touch the paths it lists: a script or helper left out of that list could break
// the guard on a PR that never runs it. These tests hold the workflow to the script and its paths to what the guard uses.

const ROOT = join(new URL("../../../../", import.meta.url).pathname);
const rootScripts: Record<string, string> = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")).scripts;
const yml = readFileSync(join(ROOT, ".github/workflows/e2e.yml"), "utf8");

/** The `paths:` filter of the pull_request trigger: its positive patterns and its `!` exclusions. */
const filter = (): { include: string[]; exclude: string[] } => {
  const block = /^ {2}pull_request:\n {4}paths:\n((?: {6}- .+\n)+)/m.exec(yml)?.[1] ?? assert.fail("e2e.yml has no pull_request paths");
  const all = [...block.matchAll(/- "([^"]+)"/g)].map((m) => m[1] ?? "");
  return { include: all.filter((p) => !p.startsWith("!")), exclude: all.filter((p) => p.startsWith("!")).map((p) => p.slice(1)) };
};
/** A path filter pattern as a regex: `**` any depth, `*` within one folder (the subset of GitHub's syntax used here). */
const re = (glob: string): RegExp =>
  new RegExp(
    `^${glob
      .replace(/[.+^${}()|[\]\\]/g, "\\$&")
      .replace(/\*\*/g, "\0")
      .replace(/\*/g, "[^/]*")
      .replace(/\0/g, ".*")}$`,
  );
const runs = (path: string): boolean => {
  const { include, exclude } = filter();
  return include.some((g) => re(g).test(path)) && !exclude.some((g) => re(g).test(path));
};

test("e2e.yml runs `npm run e2e`, and that script is the one-world guard", () => {
  assert.match(yml, /^\s+run: npm run e2e$/m, "e2e.yml runs the npm script itself, not a copy of its command");
  assert.equal(rootScripts.e2e, "node scripts/e2e-one-world.mjs");
});

test("e2e.yml runs on PRs that touch the page, the guard, its helpers or itself, not on tests alone", () => {
  const script = readFileSync(join(ROOT, "scripts/e2e-one-world.mjs"), "utf8");
  const helpers = [...script.matchAll(/from "\.\/(lib\/[^"]+)"/g)].map((m) => `scripts/${m[1]}`);
  assert.ok(helpers.length > 0, "the guard's local imports were found");
  for (const path of [
    "scripts/e2e-one-world.mjs",
    ...helpers,
    ".github/workflows/e2e.yml",
    "web/src/ui/App.tsx",
    "web/src/ui/hud/Bell.tsx",
    "web/src/colony/colony.ts",
    "web/server/api.ts",
    "web/index.html",
    "web/public/precache/x.json",
    "web/shared/jev.ts",
    "web/vite.config.ts",
    "web/package.json",
    "web/package-lock.json",
    "web/tsconfig.app.json",
    "package.json",
  ]) {
    assert.ok(runs(path), `a PR touching ${path} runs the e2e`);
  }
  for (const path of [
    "web/src/ui/tests/ciShards.test.ts",
    "web/src/colony/tests/unit/x.test.ts",
    "web/server/tests/jev.test.ts",
    "docs/PRD.md",
  ]) {
    assert.ok(!runs(path), `a PR touching only ${path} does not`);
  }
});

test("every e2e step heading goes through section(), so a failure names its step (review of #233, S1)", () => {
  const script = readFileSync(join(ROOT, "scripts/e2e-one-world.mjs"), "utf8");
  assert.doesNotMatch(script, /console\.log\(["`]\d/, "a numbered heading printed with console.log");
  assert.match(script, /section\("15\. Lab mode"\)/);
});

test("the tweezers check picks an ant no other ant sits near, as the page's pick would choose it (review of #233, S3)", () => {
  const script = readFileSync(join(ROOT, "scripts/e2e-one-world.mjs"), "utf8");
  const field = readFileSync(join(ROOT, "web/src/ui/ColonyField.tsx"), "utf8");
  const pick = Number(/^const PICK_PX = (\d+);$/m.exec(field)?.[1]);
  assert.ok(pick > 0, "ColonyField's PICK_PX");
  const radius = Number(/Math\.hypot\(ox - sx, oy - sy\) < (\d+)\) return true/.exec(script)?.[1]);
  assert.ok(radius >= 2 * pick, `the e2e keeps other ants ${radius} px away, at least twice the pick radius (${pick} px)`);
  assert.match(script, /^\s*if \(crowded\) continue;$/m);
  assert.match(script, /const crowded = window\.jevAnts\.game\.colonies\.some\(/, "every colony's ants, as pick() looks at every colony");
});

// A notice floats over the map as a button that takes the press: the tweezers' drag from an ant under one lands on the toast and
// the ant stays put. It flaked on CI for days (11 failures in three days, ja-w7ef.24): every miss reproduced locally had a
// toast at the press point, every lift had the canvas there. The check keeps to ants the press reaches.
test("the tweezers check skips an ant whose press point is not the canvas (ja-w7ef.24)", () => {
  const script = readFileSync(join(ROOT, "scripts/e2e-one-world.mjs"), "utf8");
  assert.match(
    script,
    /^\s*if \(document\.elementFromPoint\(sx, sy\) !== cv \|\| document\.elementFromPoint\(sx, sy \+ 50\) !== cv\) continue;\n(?:\s*\/\/.*\n)*\s*const crowded = /m,
    "an ant under a toast or the HUD is skipped, at the first finger's point and the second's (+50), before the crowded check",
  );
});

// The HUD fits a 360 px phone with the page's font and with a wide system fallback (ja-9xc1): a player without Inter gets the
// system's. The check runs once per font; dropping the wide one leaves the bar measured in Inter only.
test("the 360 px HUD check also runs in a wide fallback font (ja-9xc1)", () => {
  const script = readFileSync(join(ROOT, "scripts/e2e-one-world.mjs"), "utf8");
  assert.match(script, /for \(const font of \[null, "DejaVu Sans"\]\) \{/, "once with the page's font, once in DejaVu Sans");
  assert.match(script, /font-family:"\$\{f\}",sans-serif !important/, "the page's text takes that font");
  assert.match(script, /hudBar\.x \+ hudBar\.width <= 360 - 8/, "and the bar must end inside the gutter");
  assert.match(script, /lb\.x \+ lb\.width <= 360 - 8/, "and so must the lens button");
  assert.match(
    script,
    /ff\.includes\(font\) && barRight > plainRight \+ 1/,
    "and the forced font took effect and is installed: it is on the bar and the bar is wider",
  );
});

test("the tutorial step's camera check reads the poll's last value, not a second read (review of #253, N1)", () => {
  const script = readFileSync(join(ROOT, "scripts/e2e-one-world.mjs"), "utf8");
  assert.match(script, /let off = null;\s*await until\(/, "the value the check reads is declared before the poll");
  assert.match(script, /off = await hostOff\(\);\s*return off !== null && off < 1;/, "the poll keeps what it read");
  assert.doesNotMatch(script, /const off = await hostOff\(\)/, "and the check doesn't read the camera again");
});

test("e2e.yml installs one exact Playwright version", () => {
  assert.match(yml, /^\s+PLAYWRIGHT_VERSION: \d+\.\d+\.\d+$/m, "pin an exact x.y.z: a range would change the browser under the guard");
  assert.match(yml, /playwright@\$PLAYWRIGHT_VERSION/);
});
