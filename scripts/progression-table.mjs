// The table progression.yml's `report` job prints: each seed's times to the first host, a quarter, a half and the queen,
// read from the `seed N: first host …` line scripts/lab/progression.mjs prints for it (progression.yml's runners save
// each seed's whole output as seed-N.txt, its first line `commit <sha>` the code it measured). "never" is a seed that
// didn't get there in the game's time, and counts as slower than any time. Offline, no key, no spend.
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
  rows.push({ seed, first: secs(m[2]), quarter: secs(m[3]), half: secs(m[4]), queen: secs(m[5]) });
}

if (commits.size) console.log(`Commit${commits.size > 1 ? "s" : ""} measured: ${[...commits].join(", ")}\n`);
console.log("| seed | first host | quarter | half | queen |\n|---:|---:|---:|---:|---:|");
for (const r of rows) console.log(`| ${r.seed} | ${show(r.first)} | ${show(r.quarter)} | ${show(r.half)} | ${show(r.queen)} |`);

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
console.log(`\n- ${summary("quarter")}\n- ${summary("queen")}`);
process.exit(failed ? 1 : 0);
