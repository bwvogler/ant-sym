import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BOUND, CEILING, SEEDS, WITHIN, judge, seedsFrom, type Held } from "../slow/g1/g1Rule.ts";

// G1's rule (slow/g1/g1Rule.ts) is judged by the local test and by scripts/g1-verdict.mjs, the `g1 verdict` job of slow.yml.
// Here the rule and the script are held without playing a game.

const seed = (s: number, worst: number): Held => ({ seed: s, you: worst, rival: 0, worst });
/** Seeds 1-10, the first `n` of them at `worst`, the rest at BOUND + 1. */
const ten = (n: number, worst = BOUND): Held[] => SEEDS.map((s, i) => seed(s, i < n ? worst : BOUND + 1));

test("the rule's numbers are the owner's: bound 2, 5 of seeds 1-10 within it, none at 10", () => {
  assert.deepEqual([BOUND, WITHIN, CEILING, SEEDS.length], [2, 5, 10, 10]);
});

test("judge: WITHIN seeds within BOUND pass, one fewer fails and says how many", () => {
  assert.equal(judge(ten(WITHIN)).ok, true);
  const v = judge(ten(WITHIN - 1));
  assert.equal(v.ok, false);
  assert.match(v.failures.join("\n"), /4 of 10 seeds within 2 \(need 5\)/);
});

test("judge: a seed at CEILING fails even when enough seeds are within BOUND, and is named", () => {
  const held = ten(9);
  held[9] = seed(10, CEILING);
  const v = judge(held);
  assert.equal(v.ok, false);
  assert.match(v.failures.join("\n"), /seeds at 10 or more: 10 /);
  held[9] = seed(10, CEILING - 1);
  assert.equal(judge(held).ok, true, "9 is under the ceiling");
});

test("judge: a seed with no result fails and is named, though the others pass", () => {
  const v = judge(ten(10).filter((h) => h.seed !== 7 && h.seed !== 3));
  assert.equal(v.ok, false);
  assert.deepEqual(v.failures, ["no result for seeds 3 7 (their runners failed)"]);
});

test("seedsFrom: unset is all ten, a list is those seeds, anything else throws", () => {
  assert.deepEqual(seedsFrom(undefined), SEEDS);
  assert.deepEqual(seedsFrom(""), SEEDS);
  assert.deepEqual(seedsFrom("4"), [4]);
  assert.deepEqual(seedsFrom("2, 9"), [2, 9]);
  for (const bad of ["0", "11", "4,4", "x", "1-3"]) assert.throws(() => seedsFrom(bad), /G1_SEEDS/, bad);
});

const verdict = (held: Held[]): { code: number | null; out: string } => {
  const dir = mkdtempSync(join(tmpdir(), "g1-verdict-"));
  try {
    for (const h of held) writeFileSync(join(dir, `g1-seed-${h.seed}.json`), JSON.stringify([h]));
    const r = spawnSync(process.execPath, [new URL("../../../../../scripts/g1-verdict.mjs", import.meta.url).pathname, dir], {
      encoding: "utf8",
    });
    return { code: r.status, out: r.stdout + r.stderr };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

test("g1-verdict.mjs: exits 0 on a passing set, 1 with an ::error naming the seed on a missing, over-bound or jammed one", () => {
  const ok = verdict(ten(WITHIN));
  assert.equal(ok.code, 0, ok.out);
  assert.doesNotMatch(ok.out, /::error/);

  const few = verdict(ten(WITHIN - 1));
  assert.equal(few.code, 1);
  assert.match(few.out, /::error title=G1::4 of 10 seeds within 2/);

  const missing = verdict(ten(10).filter((h) => h.seed !== 6));
  assert.equal(missing.code, 1);
  assert.match(missing.out, /::error title=G1::no result for seeds 6 /);

  const jam = ten(9);
  jam[9] = seed(10, CEILING);
  const j = verdict(jam);
  assert.equal(j.code, 1);
  assert.match(j.out, /seeds at 10 or more: 10/);
});
