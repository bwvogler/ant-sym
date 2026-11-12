import { test } from "node:test";
import assert from "node:assert/strict";
import { journalFromUrl, journalLine } from "../journal.ts";
import { colonyName } from "../names.ts";

// The page's journal (ja-8tb): off unless ?log= asks; a spec it can't read warns in the console instead of breaking the page.

/** Run `fn` with console.debug, info and warn caught. */
function quietly<T>(fn: () => T): { out: T; said: Record<"debug" | "info" | "warn", unknown[][]> } {
  const said = { debug: [] as unknown[][], info: [] as unknown[][], warn: [] as unknown[][] };
  const was = { debug: console.debug, info: console.info, warn: console.warn };
  for (const k of ["debug", "info", "warn"] as const) console[k] = (...a: unknown[]) => void said[k].push(a);
  try {
    return { out: fn(), said };
  } finally {
    Object.assign(console, was);
  }
}

test("no ?log, ?log= or ?log=off: no journal", () => {
  assert.equal(journalFromUrl(""), null);
  assert.equal(journalFromUrl("?seed=3"), null);
  assert.equal(quietly(() => journalFromUrl("?log=")).out, null);
  assert.equal(quietly(() => journalFromUrl("?log=off")).out, null);
});

test("?log=summary: a journal whose events go to console.debug, the colony by its name", () => {
  const { out: j, said } = quietly(() => {
    const j = journalFromUrl("?log=summary");
    j?.note("jev", 1, "asked 3 mode situations", { lane: "mode" });
    return j;
  });
  assert.ok(j);
  assert.equal(said.info.length, 1);
  assert.equal(said.debug.length, 1);
  assert.match(String(said.debug[0]![0]), new RegExp(`${colonyName(1)} +jev +asked 3 mode situations`));
  assert.deepEqual(said.debug[0]![1], { lane: "mode" });
});

test("a spec it can't read: a console warning and no journal, not a throw", () => {
  const { out, said } = quietly(() => journalFromUrl("?log=deaths"));
  assert.equal(out, null);
  assert.match(String(said.warn[0]![0]), /unknown "deaths"/);
});

test("journalLine names the game's own events 'game'", () => {
  assert.match(journalLine({ t: 3, cat: "colony", colony: -1, text: "outcome: playing → fallen" }), /game +colony +outcome/);
});
