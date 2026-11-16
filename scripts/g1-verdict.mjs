// G1's verdict from the per-seed results of slow.yml's `g1 (n)` runners (oneWorldG1.test.ts with G1_SEEDS=n and
// G1_RESULT=<dir>/g1-seed-n.json): merges them and applies the rule the local test uses (g1Rule.ts). A seed with no file
// (its runner failed) fails the verdict and is named.
//
// Usage: node scripts/g1-verdict.mjs <dir with g1-seed-N.json files>
// Exit 0 when the rule holds, 1 when it doesn't (an ::error line per broken part), 2 on bad usage.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { SEEDS, BOUND, CEILING, WITHIN, judge } from "../web/src/colony/tests/slow/g1/g1Rule.ts";

const dir = process.argv[2];
if (!dir) {
  console.error("usage: node scripts/g1-verdict.mjs <dir with g1-seed-N.json files>");
  process.exit(2);
}
const held = SEEDS.flatMap((s) => {
  const file = join(dir, `g1-seed-${s}.json`);
  return existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : [];
});
const v = judge(held);
console.log(`G1: ${v.within} of ${SEEDS.length} seeds within ${BOUND} (need ${WITHIN}, none at ${CEILING}): ${v.table}`);
for (const f of v.failures) console.log(`::error title=G1::${f}`);
process.exit(v.ok ? 0 : 1);
