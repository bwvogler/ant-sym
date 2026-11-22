import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// scripts/progression-table.mjs: the table progression.yml's report job prints from each seed's progression.mjs output.
// Held here on fixtures, without playing a game.

const SCRIPT = new URL("../../../../scripts/progression-table.mjs", import.meta.url).pathname;

const seedText = (seed: number, quarter: string, queen: string, commit = "0123456789abcdef0123456789abcdef01234567") =>
  `commit ${commit}\none world, hyphae, aim unite, evolving (buys), garden, 600 s\n` +
  `seed ${seed}: first host 5 s, quarter ${quarter}, half never, queen ${queen}, rival's first never · mutations earned 2 (growth 7), kept 1, mycelium 8.6\n` +
  `  bought: 27s mycelium\n  per minute (share%/resist): \nworst seed: quarter ${quarter} (some seed), queen ${queen} (some seed)\n`;

function run(files: Record<string, string>): { out: string; status: number | null } {
  const dir = mkdtempSync(join(tmpdir(), "progression-table-"));
  try {
    for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, name), text);
    const r = spawnSync("node", [SCRIPT, dir], { encoding: "utf8", timeout: 20_000 });
    return { out: r.stdout, status: r.status };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("a row a seed, in seed order, with the worst seed and the median of the quarter and the queen", () => {
  const { out, status } = run({
    "seed-10.txt": seedText(10, "300 s", "500 s"),
    "seed-2.txt": seedText(2, "100 s", "400 s"),
    "seed-3.txt": seedText(3, "200 s", "never"),
  });
  assert.equal(status, 0);
  assert.match(out, /Commit measured: 0123456\n/);
  const rows = out.split("\n").filter((l) => /^\| \d+ \|/.test(l));
  assert.deepEqual(
    rows.map((l) => l.split("|")[1]!.trim()),
    ["2", "3", "10"],
    "seed order is numeric, not alphabetical",
  );
  assert.ok(rows[0]!.includes("| 100 s |"));
  assert.match(out, /quarter: worst 300 s \(seed 10\), median 200 s, reached on 3 of 3 seeds/);
  assert.match(
    out,
    /queen: worst never \(seed 3\), median 500 s, reached on 2 of 3 seeds/,
    "never is the worst and sorts above every time",
  );
});

test("two commits are both named, so a table that mixes arms shows it", () => {
  const { out } = run({
    "seed-1.txt": seedText(1, "100 s", "200 s", "aaaaaaa000000000000000000000000000000000"),
    "seed-2.txt": seedText(2, "100 s", "200 s", "bbbbbbb000000000000000000000000000000000"),
  });
  assert.match(out, /Commits measured: aaaaaaa, bbbbbbb/);
});

test("a file with no result line fails the table and is named; the others are still shown", () => {
  const { out, status } = run({ "seed-1.txt": seedText(1, "100 s", "200 s"), "seed-2.txt": "commit abcdef0\nseed 2: TypeError: boom\n" });
  assert.equal(status, 1);
  assert.match(out, /::error title=progression::seed-2\.txt has no result line for seed 2/);
  assert.match(out, /\| 1 \| 5 s \| 100 s \|/);
});

test("no directory is bad usage", () => {
  const r = spawnSync("node", [SCRIPT], { encoding: "utf8", timeout: 20_000 });
  assert.equal(r.status, 2);
});
