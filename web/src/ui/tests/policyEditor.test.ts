import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { AIMS, DOCTRINES } from "../../colony/index.ts";
import { growShape, type Preset, presetButtonClass, presetRowClass, wordsBoxClass, wordsRules } from "../policyEditing.ts";
import { seg } from "../styles.ts";

// The one editor for a policy's words (ja-fnd.6.4.3): the aim bar, a colony's doctrine in the Lab and the new queen's pen use it.

function keyEvent(key: string, over: { shiftKey?: boolean; composing?: boolean } = {}) {
  const e = {
    key,
    shiftKey: over.shiftKey ?? false,
    nativeEvent: { isComposing: over.composing ?? false },
    prevented: 0,
    blurred: 0,
    preventDefault: () => void e.prevented++,
    currentTarget: { blur: () => void e.blurred++ },
  };
  return e;
}

test("typing is a draft, and losing focus commits what the box holds", () => {
  const seen: string[] = [];
  const on = wordsRules({ onDraft: (t) => seen.push(`draft ${t}`), onCommit: (t) => seen.push(`commit ${t}`) });
  on.change({ target: { value: "ab" } });
  on.blur({ target: { value: "abc" } });
  assert.deepEqual(seen, ["draft ab", "commit abc"]);
});

test("with no commit (the pen) a blur says nothing", () => {
  const on = wordsRules({ onDraft: () => {} });
  assert.doesNotThrow(() => on.blur({ target: { value: "x" } }));
});

test("where Enter commits (the aim): Enter and Escape leave the box; Shift+Enter and an input method's Enter do not", () => {
  const on = wordsRules({ onDraft: () => {}, enterCommits: true });
  for (const k of ["Enter", "Escape"]) {
    const e = keyEvent(k);
    on.key(e);
    assert.deepEqual([e.prevented, e.blurred], [1, 1], k);
  }
  for (const e of [keyEvent("Enter", { shiftKey: true }), keyEvent("Enter", { composing: true }), keyEvent("a")]) {
    on.key(e);
    assert.deepEqual([e.prevented, e.blurred], [0, 0], e.key);
  }
});

test("elsewhere (a doctrine) Enter is a new line", () => {
  const on = wordsRules({ onDraft: () => {} });
  const e = keyEvent("Enter");
  on.key(e);
  assert.deepEqual([e.prevented, e.blurred], [0, 0]);
});

test("a preset button: the Lab's and the bar's by the shared segment style (the bar's smaller), the pen's as chips, active or not", () => {
  assert.equal(presetButtonClass("segmented", true), seg(true));
  assert.equal(presetButtonClass("segmented", false), seg(false));
  assert.equal(presetButtonClass("compact", true), `${seg(true)} px-2.5 py-1`);
  assert.match(presetButtonClass("chips", true), /border-accent text-accent/);
  assert.match(presetButtonClass("chips", false), /border-line text-fg-2 hover:bg-raised/);
  assert.doesNotMatch(presetButtonClass("chips", false), /border-accent/);
});

test("a row of presets: the three looks, with the place's own classes added", () => {
  assert.equal(presetRowClass("segmented"), "flex overflow-hidden rounded-md border border-line text-sm");
  assert.equal(presetRowClass("compact"), "flex shrink-0 overflow-hidden rounded-md border border-line text-[13px]");
  assert.equal(presetRowClass("chips", "mt-4"), "flex flex-wrap gap-2 mt-4");
});

test("the shipped aims and doctrines are presets the editor can show", () => {
  for (const p of [...AIMS, ...DOCTRINES] satisfies readonly Preset[]) assert.ok(p.id && p.name && p.text, p.id);
});

test("a growing box is one line, not wrapping and with its overflow hidden, until it has focus; then four lines, wrapping", () => {
  assert.deepEqual(growShape(false), { rows: 1, wrap: "off" });
  assert.deepEqual(growShape(true), { rows: 4, wrap: "soft" });
  assert.match(wordsBoxClass("x", true, false), /overflow-hidden/);
  assert.doesNotMatch(wordsBoxClass("x", true, true), /overflow-hidden/);
  assert.doesNotMatch(wordsBoxClass("x", false, false), /overflow-hidden/, "only a growing box hides its overflow");
  assert.match(wordsBoxClass("mt-1 w-full", false, false), /^resize-none .*mt-1 w-full$/);
});

// One editor: no component keeps a words box of its own.
const UI = new URL("../", import.meta.url).pathname;

test("no <textarea outside PolicyEditor.tsx", () => {
  const found = readdirSync(UI)
    .filter((f) => f.endsWith(".tsx") && f !== "PolicyEditor.tsx")
    .filter((f) => /<textarea\b/.test(readFileSync(join(UI, f), "utf8")));
  assert.deepEqual(found, [], "use WordsBox (and PresetPicker for the presets)");
});
