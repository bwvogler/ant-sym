import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { segButtonClass, segRowClass } from "../segmented.ts";
import { seg } from "../styles.ts";

// One joined group of buttons (ja-fnd.6.4.5): nine hand-written copies, now Segmented. The classes of each place as it wrote them, as sets
// (their order in a class attribute does nothing).

const set = (s: string): string[] => s.split(/\s+/).filter(Boolean).sort();
const same = (a: string, b: string, what: string) => assert.deepEqual(set(a), set(b), what);

test("a group's frame: the joined, rounded border, with the place's own classes added", () => {
  same(segRowClass(), "flex overflow-hidden rounded-md border border-line", "the speed and the view (the view adds a margin)");
  same(segRowClass("ml-1"), "ml-1 flex overflow-hidden rounded-md border border-line", "the view");
  same(segRowClass("mt-2 text-sm"), "mt-2 flex overflow-hidden rounded-md border border-line text-sm", "trails drawn, appearance, sounds");
  same(segRowClass("ml-2 text-sm"), "ml-2 flex overflow-hidden rounded-md border border-line text-sm", "the Codex's tabs");
  same(segRowClass("text-xs"), "flex overflow-hidden rounded-md border border-line text-xs", "the notices");
  same(
    segRowClass("shrink-0 text-[13px]"),
    "flex shrink-0 overflow-hidden rounded-md border border-line text-[13px]",
    "the aim bar's presets",
  );
});

test("a button: the segment look by whether it is on, with the place's own classes after it", () => {
  for (const on of [true, false]) {
    assert.equal(segButtonClass(on), seg(on));
    assert.equal(
      segButtonClass(on, { more: "max-sm:px-1.5 max-sm:text-[13px]" }),
      `${seg(on)} max-sm:px-1.5 max-sm:text-[13px]`,
      "the speed",
    );
    assert.equal(
      segButtonClass(on, { more: "flex items-center justify-center gap-1 max-sm:px-1.5" }),
      `${seg(on)} flex items-center justify-center gap-1 max-sm:px-1.5`,
      "the view",
    );
    assert.equal(segButtonClass(on, { more: "px-2.5 py-1" }), `${seg(on)} px-2.5 py-1`, "the aim bar's presets");
  }
});

test("buttons that share the group's width start with flex-1, as the places that filled it wrote it", () => {
  for (const on of [true, false]) assert.equal(segButtonClass(on, { fill: true }), `flex-1 ${seg(on)}`);
});

test("the soft look (the pen's side): small, tinted by the accent when on, no solid fill", () => {
  assert.equal(segButtonClass(true, { soft: true }), "px-2 py-1 text-xs bg-accent-soft text-accent");
  assert.equal(segButtonClass(false, { soft: true }), "px-2 py-1 text-xs text-fg-2 hover:bg-raised");
  assert.doesNotMatch(segButtonClass(true, { soft: true }), /bg-accent text-accent-ink/);
});

test("the segment look: the one that is on takes the accent; the rest are the panel's", () => {
  assert.match(seg(true), /bg-accent text-accent-ink/);
  assert.match(seg(false), /bg-panel text-fg-2 hover:bg-raised/);
  assert.match(seg(false), /disabled:opacity-60/);
});

// One group: no source repeats the frame, or the segment look, outside the kit.
const SRC = new URL("../../", import.meta.url).pathname;

function* sources(dir: string): Generator<string> {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name !== "tests") yield* sources(p);
    } else if (/\.tsx?$/.test(e.name)) yield p;
  }
}

/** The files under web/src (not tests) whose text matches `re`. */
export const filesWith = (re: RegExp, read: (f: string) => string = (f) => readFileSync(f, "utf8")): string[] =>
  [...sources(SRC)].filter((f) => re.test(read(f))).map((f) => f.slice(SRC.length));

test("no source writes the group's frame itself, or calls seg(), outside segmented.ts and its stylesheet", () => {
  assert.deepEqual(filesWith(/overflow-hidden rounded-md border border-line/), ["ui/segmented.ts"]);
  assert.deepEqual(filesWith(/\bseg\(/).sort(), ["ui/segmented.ts", "ui/styles.ts"], "styles.ts defines it; segmented.ts is its one user");
});
