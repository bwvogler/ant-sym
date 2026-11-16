import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BOUND, CEILING, SEEDS, WITHIN, judge, seedResult, seedsFrom, type Held } from "../slow/g1/g1Rule.ts";

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

const verdictOf = (files: Record<string, string>): { code: number | null; out: string } => {
  const dir = mkdtempSync(join(tmpdir(), "g1-verdict-"));
  try {
    for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, name), text);
    const r = spawnSync(process.execPath, [new URL("../../../../../scripts/g1-verdict.mjs", import.meta.url).pathname, dir], {
      encoding: "utf8",
    });
    return { code: r.status, out: r.stdout + r.stderr };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

const verdict = (held: Held[]): { code: number | null; out: string } =>
  verdictOf(Object.fromEntries(held.map((h) => [`g1-seed-${h.seed}.json`, JSON.stringify([h])])));

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

// Review of #267, N5: the verdict trusts nothing a file says. A duplicated seed counted twice, a `null` (what JSON.stringify
// writes for NaN) passed the bound, and an unparseable file gave a stack and not a line naming the seed.
test("seedResult: one entry for the seed with finite figures is a result; anything else says what is wrong", () => {
  assert.deepEqual(seedResult(3, [seed(3, 2)]), { held: seed(3, 2) });
  const problem = (parsed: unknown): string => {
    const r = seedResult(3, parsed);
    return "problem" in r ? r.problem : "a result";
  };
  assert.match(problem({}), /not a list/);
  assert.match(problem([]), /0 entries/);
  assert.match(problem([seed(3, 1), seed(3, 1)]), /2 entries/);
  assert.match(problem([seed(7, 1)]), /holds seed 7/);
  assert.match(problem([{ you: 1, rival: 1, worst: 1 }]), /holds seed null/);
  assert.match(problem([{ ...seed(3, 1), worst: null }]), /worst is null/);
  assert.match(problem([{ ...seed(3, 1), you: "2" }]), /you is "2"/);
  assert.match(problem([{ ...seed(3, 1), rival: Infinity }]), /rival is null/); // JSON.stringify writes null for Infinity
  assert.match(problem([null]), /holds seed null/);
});

test("g1-verdict.mjs: a file that is not one seed's finite figures fails the verdict with an ::error naming the seed", () => {
  const files = (): Record<string, string> => Object.fromEntries(ten(10).map((h) => [`g1-seed-${h.seed}.json`, JSON.stringify([h])]));
  const bad = (name: string, text: string): { code: number | null; out: string } => verdictOf({ ...files(), [name]: text });
  const one = JSON.stringify([seed(1, 1)]);

  const dup = bad("g1-seed-1.json", JSON.stringify([seed(1, 1), seed(1, 1)]));
  assert.equal(dup.code, 1, "a seed counted twice does not make eleven");
  assert.match(dup.out, /::error title=G1::seed 1: 2 entries/);

  const nul = bad("g1-seed-2.json", JSON.stringify([{ ...seed(2, 0), worst: null }]));
  assert.equal(nul.code, 1, "a null is not within the bound");
  assert.match(nul.out, /::error title=G1::seed 2: worst is null/);

  const junk = bad("g1-seed-3.json", "{not json");
  assert.equal(junk.code, 1);
  assert.match(junk.out, /::error title=G1::seed 3: .*is not JSON/);
  assert.doesNotMatch(junk.out, /\n\s+at /, "a line naming the seed, not a stack");

  const other = bad("g1-seed-4.json", JSON.stringify([seed(9, 0)]));
  assert.equal(other.code, 1, "a file holding another seed's result is not this seed's");
  assert.match(other.out, /::error title=G1::seed 4: it holds seed 9/);

  assert.equal(verdictOf({ ...files(), "g1-seed-1.json": one }).code, 0, "the good set still passes");
});
