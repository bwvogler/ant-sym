import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
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

/** The script's leading `//` block as --help should print it, worked out here on its own (not by usage.mjs): the oracle. */
function headerOf(script: string): string {
  const out: string[] = [];
  for (const line of readFileSync(join(SCRIPTS, script), "utf8").split("\n")) {
    if (line.startsWith("#!")) continue;
    if (!line.startsWith("//")) break;
    out.push(line.replace(/^\/\/ ?/, ""));
  }
  return out.join("\n");
}

for (const script of scripts) {
  test(`${script} --help and -h print exactly its header (with a Usage line) and nothing else, and exit 0`, async () => {
    const header = headerOf(script);
    assert.match(header, /usage/i, `${script}: no Usage line in its header`);
    for (const flag of ["--help", "-h"]) {
      // The key is off, and stdout must be the header and nothing more: a script that printed it and carried on (colony-live and
      // precache spend real money; fungus-cost plays a game) would print more, or run into the timeout.
      const { stdout } = await exec("node", [join(SCRIPTS, script), flag], { env: { ...process.env, JEV_API_KEY: "" }, timeout: 20_000 });
      assert.equal(stdout, `${header}\n`, `${script} ${flag}`);
    }
  });
}
