import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

// .github/workflows/assays.yml (ja-w7ef.12) runs scripts/experiment.mjs on one runner per seed, each with --json, and its
// report job joins them with `experiment.mjs merge`. The flags the workflow builds must be ones the script takes, and the
// merged report must be the one a single run over every seed prints: that table is what an agent reads in the job log.

const exec = promisify(execFile);
const ROOT = join(new URL("../../../../../", import.meta.url).pathname);
const SCRIPT = join(ROOT, "scripts/experiment.mjs");
const workflow = readFileSync(join(ROOT, ".github/workflows/assays.yml"), "utf8");
const script = readFileSync(SCRIPT, "utf8");

test("assays.yml passes experiment.mjs only flags it takes, and merges with its merge mode", () => {
  // The flags plan builds into $args, and those on the lines that run the script.
  const lines = workflow.split("\n").filter((l) => /args="\$args --|node scripts\/experiment\.mjs/.test(l));
  const flags = new Set(lines.flatMap((l) => l.match(/--[a-z]+/g) ?? []));
  assert.ok(flags.size >= 6, `found ${[...flags].join(" ")}`);
  for (const f of flags)
    assert.ok(script.includes(`a === "${f}"`) || script.includes(`args[k] === "${f}"`), `experiment.mjs does not take ${f}`);
  assert.match(workflow, /node scripts\/experiment\.mjs \$ARGS --seeds "\$SEED" --json "out\/seed-\$SEED\.json"/);
  assert.match(workflow, /node scripts\/experiment\.mjs merge out\/seed-\*\.json --json assays\.json/);
});

test("experiment.mjs merge of per-seed files prints the table of one run over all the seeds", async () => {
  const dir = mkdtempSync(join(tmpdir(), "assays-"));
  const run = async (...args: string[]): Promise<string> => (await exec("node", [SCRIPT, ...args], { cwd: ROOT, timeout: 60_000 })).stdout;
  const quick = ["bridge", "--seconds", "5", "--set", "colony.deposit=2,4", "--jobs", "2"];
  const timing = (s: string): string => s.replace(/^\| ms\/tick .*$/gm, "");
  const all = await run(...quick, "--seeds", "1-2", "--json", join(dir, "all.json"));
  await run(...quick, "--seeds", "1", "--json", join(dir, "s1.json"));
  await run(...quick, "--seeds", "2", "--json", join(dir, "s2.json"));
  const merged = await run("merge", join(dir, "s2.json"), join(dir, "s1.json"));
  assert.match(all, /\*\*colony\.deposit=4\*\*/);
  assert.equal(timing(merged), timing(all));
  await assert.rejects(run("merge", join(dir, "s1.json"), join(dir, "s1.json")), /seed 1 in more than one file/);
});
