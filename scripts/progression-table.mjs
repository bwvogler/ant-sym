// The table progression.yml's `report` job prints: each seed's times to the first host, a quarter, a half and the queen,
// read from the `seed N: first host …` line scripts/lab/progression.mjs prints for it (progression.yml's runners save
// each seed's whole output as seed-N.txt, its first line `commit <sha>` the code it measured). "never" is a seed that
// didn't get there in the game's time, and counts as slower than any time. Offline, no key, no spend.
//
// Where every seed's line also says `patches P (flowers F, [spread S,] mat cells M)` (a game with hyphae), the table adds those three (four with spread)
// columns and a line counting the flowers. Where every seed also says `hyphae C cells, spores on S cells` (ja-kura: how much mycelium and how many
// cells with spores the game ended with), it adds those two columns and a line with their medians and ranges.
//
// Usage: node scripts/progression-table.mjs <dir with seed-N.txt files>
// Prints a Markdown table, then the worst seed and the median for the quarter and the queen. Exit 0; 1 when a file has no
// result line (an ::error line says which); 2 on bad usage.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { helpAndExit } from "./lib/usage.mjs";
helpAndExit(import.meta.url);

const dir = process.argv[2];
if (!dir) {
  console.error("usage: node scripts/progression-table.mjs <dir with seed-N.txt files>");
  process.exit(2);
}

/** "123 s" -> 123, "never" -> Infinity (slower than any time). */
const secs = (t) => (t === "never" ? Infinity : Number(t.replace(/ s$/, "")));
const show = (n) => (n === Infinity ? "never" : `${n} s`);
const TIME = String.raw`(never|\d+ s)`;
const LINE = new RegExp(`^seed (\\d+): first host ${TIME}, quarter ${TIME}, half ${TIME}, queen ${TIME}`, "m");

const files = readdirSync(dir)
  .map((f) => /^seed-(\d+)\.txt$/.exec(f))
  .filter(Boolean)
  .map((m) => ({ seed: Number(m[1]), file: m[0] }))
  .sort((a, b) => a.seed - b.seed);

const rows = [];
const commits = new Set();
let failed = false;
for (const { seed, file } of files) {
  const text = readFileSync(join(dir, file), "utf8");
  const commit = /^commit ([0-9a-f]{7,40})/m.exec(text);
  if (commit) commits.add(commit[1].slice(0, 7));
  const m = LINE.exec(text);
  if (!m || Number(m[1]) !== seed) {
    console.log(`::error title=progression::${file} has no result line for seed ${seed}`);
    failed = true;
    continue;
  }
  const extra = /patches (\d+) \(flowers (\d+)(?:, spread (\d+))?, mat cells (\d+)\)/.exec(text);
  const size = /hyphae (\d+) cells, spores on (\d+) cells/.exec(text);
  rows.push({
    seed,
    first: secs(m[2]),
    quarter: secs(m[3]),
    half: secs(m[4]),
    queen: secs(m[5]),
    ...(extra
      ? {
          patches: Number(extra[1]),
          flowers: Number(extra[2]),
          spread: extra[3] === undefined ? undefined : Number(extra[3]),
          mat: Number(extra[4]),
        }
      : {}),
    ...(size ? { cells: Number(size[1]), sporeCells: Number(size[2]) } : {}),
  });
}
const withExtra = rows.length > 0 && rows.every((r) => r.patches !== undefined);
// `spread` (a flower that touched a patch and extended it, #363) is its own column only where every seed says it.
const withSpread = withExtra && rows.every((r) => r.spread !== undefined);
// How much mycelium and how many spore cells the game ended with are columns only where every seed says them.
const withSize = rows.length > 0 && rows.every((r) => r.cells !== undefined);

if (commits.size) console.log(`Commit${commits.size > 1 ? "s" : ""} measured: ${[...commits].join(", ")}\n`);
// One list of columns, so a column that only some outputs have is one line, not another branch of a ternary.
/** @type {[string, (r: any) => string | number][]} */
const cols = [
  ["seed", (r) => r.seed],
  ["first host", (r) => show(r.first)],
  ["quarter", (r) => show(r.quarter)],
  ["half", (r) => show(r.half)],
  ["queen", (r) => show(r.queen)],
];
if (withExtra) cols.push(["patches", (r) => r.patches], ["flowers", (r) => r.flowers]);
if (withSpread) cols.push(["spread", (r) => r.spread]);
if (withExtra) cols.push(["mat cells", (r) => r.mat]);
if (withSize) cols.push(["hyphae cells", (r) => r.cells], ["spore cells", (r) => r.sporeCells]);
console.log(`| ${cols.map(([name]) => name).join(" | ")} |\n|${cols.map(() => "---:").join("|")}|`);
for (const r of rows) console.log(`| ${cols.map(([, get]) => get(r)).join(" | ")} |`);

/** The worst (largest, "never" worst) and the median of a column, with the seeds that reached it. */
function summary(key) {
  if (!rows.length) return `${key}: no seeds`;
  const v = rows.map((r) => r[key]).sort((a, b) => a - b);
  const median = v.length % 2 ? v[(v.length - 1) / 2] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2;
  const worst = v[v.length - 1];
  const at = rows.filter((r) => r[key] === worst).map((r) => r.seed);
  const reached = v.filter((x) => x !== Infinity).length;
  return `${key}: worst ${show(worst)} (seed${at.length > 1 ? "s" : ""} ${at.join(", ")}), median ${show(median)}, reached on ${reached} of ${v.length} seeds`;
}
const flowerLine = withExtra
  ? `\n- flowers: ${rows.reduce((s, r) => s + r.flowers, 0)} in all, in ${rows.filter((r) => r.flowers > 0).length} of ${rows.length} games; patches: median ${[...rows.map((r) => r.patches)].sort((a, b) => a - b)[Math.floor(rows.length / 2)]}`
  : "";
/** The median and the range of a count that is never "never", over the seeds. */
const spanOf = (key) => {
  const v = rows.map((r) => r[key]).sort((a, b) => a - b);
  const median = v.length % 2 ? v[(v.length - 1) / 2] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2;
  return `median ${median}, ${v[0]} to ${v[v.length - 1]}`;
};
const sizeLine = withSize ? `\n- hyphae cells: ${spanOf("cells")}; cells with spores: ${spanOf("sporeCells")}` : "";
console.log(`\n- ${summary("quarter")}\n- ${summary("queen")}${flowerLine}${sizeLine}`);
process.exit(failed ? 1 : 0);
