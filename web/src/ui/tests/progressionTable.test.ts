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

test("an even number of seeds takes the middle pair's mean, and a tie for worst names every seed in it", () => {
  const { out } = run({
    "seed-1.txt": seedText(1, "100 s", "100 s"),
    "seed-2.txt": seedText(2, "200 s", "100 s"),
    "seed-3.txt": seedText(3, "400 s", "100 s"),
    "seed-4.txt": seedText(4, "400 s", "100 s"),
  });
  assert.match(out, /quarter: worst 400 s \(seeds 3, 4\), median 300 s, reached on 4 of 4 seeds/);
});

test("a file whose result line is for another seed fails the table (a misnamed or overwritten file)", () => {
  const { out, status } = run({ "seed-1.txt": seedText(2, "100 s", "200 s") });
  assert.equal(status, 1);
  assert.match(out, /::error title=progression::seed-1\.txt has no result line for seed 1/);
});

test("where every seed says patches, flowers and mat cells, the table gains those columns and a flowers line; with one seed lacking them, it does not", () => {
  const withPatches = (seed: number, flowers: number) =>
    seedText(seed, "100 s", "200 s").replace(
      "mycelium 8.6",
      `mycelium 8.6, patches ${1 + flowers} (flowers ${flowers}, mat cells ${flowers * 7})`,
    );
  const all = run({ "seed-1.txt": withPatches(1, 0), "seed-2.txt": withPatches(2, 3), "seed-3.txt": withPatches(3, 1) });
  assert.match(all.out, /\| seed \| first host \| quarter \| half \| queen \| patches \| flowers \| mat cells \|/);
  assert.match(all.out, /\| 2 \| 5 s \| 100 s \| never \| 200 s \| 4 \| 3 \| 21 \|/);
  assert.match(all.out, /flowers: 4 in all, in 2 of 3 games; patches: median 2/);
  const mixed = run({ "seed-1.txt": withPatches(1, 2), "seed-2.txt": seedText(2, "100 s", "200 s") });
  assert.doesNotMatch(mixed.out, /patches \|/);
  assert.doesNotMatch(mixed.out, /flowers:/);
});

test("a seed line with spread (a flower that extended a patch, #363) gets a spread column where every seed has it; a mix keeps the three columns", () => {
  const withSpread = (seed: number, flowers: number, spread: number) =>
    seedText(seed, "100 s", "200 s").replace(
      "mycelium 8.6",
      `mycelium 8.6, patches ${1 + flowers} (flowers ${flowers}, spread ${spread}, mat cells ${flowers * 7})`,
    );
  const all = run({ "seed-1.txt": withSpread(1, 0, 0), "seed-2.txt": withSpread(2, 3, 5) });
  assert.match(all.out, /\| seed \| first host \| quarter \| half \| queen \| patches \| flowers \| spread \| mat cells \|/);
  assert.match(all.out, /\| 2 \| 5 s \| 100 s \| never \| 200 s \| 4 \| 3 \| 5 \| 21 \|/);
  assert.match(all.out, /flowers: 3 in all, in 1 of 2 games/);
  // one seed with spread and one with the older line: the three columns, no spread
  const older = seedText(2, "100 s", "200 s").replace("mycelium 8.6", "mycelium 8.6, patches 2 (flowers 1, mat cells 7)");
  const mixed = run({ "seed-1.txt": withSpread(1, 2, 1), "seed-2.txt": older });
  assert.match(mixed.out, /\| patches \| flowers \| mat cells \|/);
  assert.doesNotMatch(mixed.out, /spread/);
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
