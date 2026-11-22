// G1's verdict from the per-seed results of slow.yml's `g1 (n)` runners (oneWorldG1.test.ts with G1_SEEDS=n and
// G1_RESULT=<dir>/g1-seed-n.json): merges them and applies the rule the local test uses (g1Rule.ts). A seed with no file
// (its runner failed) fails the verdict and is named, and so does a file that isn't one seed's finite figures (an ::error line
// says what is wrong with it).
//
// Usage: node scripts/g1-verdict.mjs <dir with g1-seed-N.json files>
// Exit 0 when the rule holds, 1 when it doesn't (an ::error line per broken part), 2 on bad usage.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { SEEDS, BOUND, CEILING, WITHIN, judge, seedResult } from "../web/src/colony/tests/slow/g1/g1Rule.ts";
import { helpAndExit } from "./lib/usage.mjs";
helpAndExit(import.meta.url);

const dir = process.argv[2];
if (!dir) {
  console.error("usage: node scripts/g1-verdict.mjs <dir with g1-seed-N.json files>");
  process.exit(2);
}
const held = [];
const problems = [];
const broken = []; // seeds with a file that is left out: the ::error says why, so judge() doesn't also say their runner failed
for (const s of SEEDS) {
  const file = join(dir, `g1-seed-${s}.json`);
  if (!existsSync(file)) continue; // judge() names a seed with no result
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(file, "utf8"));
  } catch (e) {
    problems.push(`seed ${s}: ${file} is not JSON (${e.message})`);
    broken.push(s);
    continue;
  }
  const r = seedResult(s, parsed);
  if ("held" in r) held.push(r.held);
  else {
    problems.push(`seed ${s}: ${r.problem}`);
    broken.push(s);
  }
}
const v = judge(held, SEEDS, broken);
console.log(`G1: ${v.within} of ${SEEDS.length} seeds within ${BOUND} (need ${WITHIN}, none at ${CEILING}): ${v.table}`);
for (const p of problems) console.log(`::error title=G1::${p}`);
for (const f of v.failures) console.log(`::error title=G1::${f}`);
process.exit(v.ok && problems.length === 0 ? 0 : 1);
