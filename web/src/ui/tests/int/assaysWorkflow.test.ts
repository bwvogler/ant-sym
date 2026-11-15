import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

// .github/workflows/assays.yml (ja-w7ef.12) runs scripts/experiment.mjs on one runner per seed, each with --json, and its
// report job joins them with `experiment.mjs merge`. The flags the workflow builds must be ones the script takes, its plan
// step must refuse inputs that aren't ids, seeds or overrides (they reach bash), and the merged report must be the one a
// single run over every seed prints: that table is what an agent reads in the job log.

const exec = promisify(execFile);
const ROOT = join(new URL("../../../../../", import.meta.url).pathname);
const SCRIPT = join(ROOT, "scripts/experiment.mjs");
const workflow = readFileSync(join(ROOT, ".github/workflows/assays.yml"), "utf8");
const script = readFileSync(SCRIPT, "utf8");

test("assays.yml passes experiment.mjs only flags it takes, merges with its merge mode, and downloads what it uploads", () => {
  // The flags plan builds into $args, and those on the lines that run the script.
  const lines = workflow.split("\n").filter((l) => /args="\$args --|node scripts\/experiment\.mjs/.test(l));
  const flags = new Set(lines.flatMap((l) => l.match(/--[a-z]+/g) ?? []));
  assert.ok(flags.size >= 6, `found ${[...flags].join(" ")}`);
  for (const f of flags)
    assert.ok(script.includes(`a === "${f}"`) || script.includes(`args[k] === "${f}"`), `experiment.mjs does not take ${f}`);
  assert.match(workflow, /node scripts\/experiment\.mjs \$ARGS --seeds "\$SEED" --json "out\/seed-\$SEED\.json"/);
  assert.match(workflow, /node scripts\/experiment\.mjs merge out\/seed-\*\.json --json assays\.json/);
  const uploaded = /name: (assay-seed-)\$\{\{ matrix\.seed \}\}/.exec(workflow)?.[1];
  const pattern = /pattern: (\S+)/.exec(workflow)?.[1];
  assert.equal(pattern, `${uploaded}*`, "report downloads the per-seed artifacts run uploads");
});

/** The plan job's script, as the runner gets it (the block under its `run: |`). */
function planScript(): string {
  const lines = workflow.split("\n");
  const at = lines.findIndex((l) => l.trim() === "run: |" && lines.slice(0, lines.indexOf(l)).some((p) => p.trim() === "- id: plan"));
  const indent = (lines[at + 1] ?? "").search(/\S/);
  const body: string[] = [];
  for (const l of lines.slice(at + 1)) {
    if (l.trim() !== "" && l.search(/\S/) < indent) break;
    body.push(l.slice(indent));
  }
  return body.join("\n");
}

test("assays.yml's plan step refuses inputs that aren't ids, seeds or overrides, and builds the arguments from good ones", async () => {
  const dir = mkdtempSync(join(tmpdir(), "assays-plan-"));
  const script = planScript();
  const plan = async (inputs: Record<string, string>): Promise<{ code: number; out: string }> => {
    const output = join(dir, "output");
    writeFileSync(output, "");
    const env = {
      PATH: process.env.PATH ?? "",
      GITHUB_OUTPUT: output,
      GITHUB_STEP_SUMMARY: join(dir, "summary"),
      ASSAYS: "all",
      ONE: "false",
      SEEDS: "1-10",
      SET: "",
      SECONDS_IN: "",
      SPECIES: "",
      ...inputs,
    };
    const r = await exec("bash", ["--noprofile", "--norc", "-eo", "pipefail", "-c", script], { cwd: dir, env }).then(
      (x) => ({ code: 0, out: x.stdout }),
      (e: { code: number; stdout: string }) => ({ code: e.code, out: e.stdout }),
    );
    return { code: r.code, out: r.out + readFileSync(output, "utf8") };
  };
  const good = await plan({
    ASSAYS: "game1",
    ONE: "true",
    SEEDS: "1-3,7",
    SET: "colony.routeStep=3,4 game.fight.rate=1",
    SECONDS_IN: "60",
    SPECIES: "desert",
  });
  assert.equal(good.code, 0, good.out);
  assert.match(good.out, /^seeds=\[1,2,3,7\]$/m);
  assert.match(good.out, /^args=game1 --one --set colony\.routeStep=3,4 --set game\.fight\.rate=1 --seconds 60 --species desert$/m);
  for (const bad of [
    { ASSAYS: "a; rm -rf /" },
    { ASSAYS: "all merge" },
    { SEEDS: "1-50" },
    { SEEDS: "1\n2" },
    { SET: "x=$(id)" },
    { SET: "*" },
    { SPECIES: "../x" },
    { SECONDS_IN: "1 2" },
  ]) {
    const r = await plan(bad);
    assert.equal(r.code, 1, `${JSON.stringify(bad)} was accepted: ${r.out}`);
    assert.match(r.out, /::error title=assays input::/);
  }
});

test("experiment.mjs merge of per-seed files prints the table of one run over all the seeds, legacy and one world", async () => {
  const dir = mkdtempSync(join(tmpdir(), "assays-"));
  const run = async (...args: string[]): Promise<string> => (await exec("node", [SCRIPT, ...args], { cwd: ROOT, timeout: 60_000 })).stdout;
  const timing = (s: string): string => s.replace(/^\| ms\/tick .*$/gm, "");
  for (const [name, quick] of [
    ["legacy", ["bridge", "--seconds", "5", "--set", "colony.deposit=2,4", "--jobs", "2"]],
    ["one", ["bridge", "--one", "--seconds", "3", "--jobs", "2"]],
  ] as const) {
    const all = await run(...quick, "--seeds", "1-2");
    await run(...quick, "--seeds", "1", "--json", join(dir, `${name}1.json`));
    await run(...quick, "--seeds", "2", "--json", join(dir, `${name}2.json`));
    const merged = await run("merge", join(dir, `${name}2.json`), join(dir, `${name}1.json`));
    assert.equal(timing(merged), timing(all), name);
    if (name === "one") assert.match(merged, /^## A1 .*\(one world\)$/m, "a --one run reports one world's assay");
    else assert.match(merged, /\*\*colony\.deposit=4\*\* — pass 0\/2 \(failing seeds: 1, 2\)/, "the failing seeds are named");
  }
  await assert.rejects(run("merge", join(dir, "legacy1.json"), join(dir, "legacy1.json")), /seed 1 in more than one file/);
});
