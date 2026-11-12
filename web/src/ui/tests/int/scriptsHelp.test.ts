import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";

// Every maintained script answers --help with its own header (scripts/lib/usage.mjs): an agent that asks a script what it
// does must get its usage, without the script running (colony-live and precache spend real money). A new script that
// skips the one-line `helpAndExit(import.meta.url)` fails here.

const exec = promisify(execFile);
const SCRIPTS = join(new URL("../../../../../scripts/", import.meta.url).pathname);
const scripts = readdirSync(SCRIPTS).filter((f) => f.endsWith(".mjs"));

test("there are maintained scripts to hold (a moved folder would pass vacuously)", () => {
  assert.ok(scripts.length >= 10, `${scripts.length} scripts`);
});

for (const script of scripts) {
  test(`${script} --help and -h print its header (with a Usage line) and exit 0, running nothing`, async () => {
    for (const flag of ["--help", "-h"]) {
      // The key is off: were --help ignored, a paid script would fail at once instead of asking Jev.
      const { stdout } = await exec("node", [join(SCRIPTS, script), flag], { env: { ...process.env, JEV_API_KEY: "" }, timeout: 20_000 });
      assert.match(stdout, /usage/i, `${script} ${flag}: no Usage line in its header`);
      assert.ok(!stdout.startsWith("//"), "the comment marks are stripped");
      assert.ok(stdout.split("\n").length >= 3, "a header, not a stub");
    }
  });
}
