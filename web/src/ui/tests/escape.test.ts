import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { attachEscape, ESCAPE_LAYER, EscapeStack } from "../escape.ts";

// One Escape closes one thing (PRD §69): the palette or the sheet, then a pinned lens card, then the Go to menu or the notices.

function press(key = "Escape", prevented = false) {
  const e = {
    key,
    defaultPrevented: prevented,
    prevented: 0,
    stopped: 0,
    preventDefault: () => void e.prevented++,
    stopPropagation: () => void e.stopped++,
  };
  return e;
}

test("the highest layer takes the key, and the event is settled so nothing under it acts on it", () => {
  const s = new EscapeStack();
  const took: string[] = [];
  s.register(ESCAPE_LAYER.popover, () => (took.push("menu"), true));
  s.register(ESCAPE_LAYER.modal, () => (took.push("modal"), true));
  s.register(ESCAPE_LAYER.card, () => (took.push("card"), true));
  const e = press();
  assert.equal(s.handle(e), true);
  assert.deepEqual(took, ["modal"], "the others are not even asked");
  assert.deepEqual([e.prevented, e.stopped], [1, 1]);
});

test("the order is the PRD's: a dialog, then a pinned lens card, then the Go to menu", () => {
  const s = new EscapeStack();
  const closed: string[] = [];
  const offs: Record<string, () => void> = {};
  // Each surface closes itself when it takes the key, as a real one unmounts and releases its claim.
  for (const [name, layer] of [
    ["menu", ESCAPE_LAYER.popover],
    ["card", ESCAPE_LAYER.card],
    ["modal", ESCAPE_LAYER.modal],
  ] as const)
    offs[name] = s.register(layer, () => (closed.push(name), offs[name]!(), true));
  for (let i = 0; i < 4; i++) s.handle(press());
  assert.deepEqual(closed, ["modal", "card", "menu"], "then nothing is left to take it");
});

test("a claim that does not want the key passes it down; with none taking it, the event is left alone", () => {
  const s = new EscapeStack();
  const asked: string[] = [];
  s.register(ESCAPE_LAYER.popover, () => (asked.push("low"), true));
  s.register(ESCAPE_LAYER.card, () => (asked.push("high"), false));
  const e = press();
  assert.equal(s.handle(e), true);
  assert.deepEqual(asked, ["high", "low"]);
  const lone = new EscapeStack();
  lone.register(ESCAPE_LAYER.card, () => false);
  const f = press();
  assert.equal(lone.handle(f), false);
  assert.deepEqual([f.prevented, f.stopped], [0, 0], "the field and the drawers still get it");
});

test("on one layer the latest claim is asked first; another key, or an event already taken, is not the stack's", () => {
  const s = new EscapeStack();
  const took: string[] = [];
  s.register(ESCAPE_LAYER.popover, () => (took.push("first"), true));
  s.register(ESCAPE_LAYER.popover, () => (took.push("second"), true));
  s.handle(press());
  assert.deepEqual(took, ["second"]);
  assert.equal(s.handle(press("Enter")), false);
  assert.equal(s.handle(press("Escape", true)), false, "something took it already");
  assert.deepEqual(took, ["second"]);
});

test("a claim is gone once it is released", () => {
  const s = new EscapeStack();
  const off = s.register(ESCAPE_LAYER.modal, () => true);
  assert.equal(s.size, 1);
  off();
  off();
  assert.equal(s.size, 0);
  assert.equal(s.handle(press()), false);
});

test("one capture listener on the target carries the key to the stack, and can be taken off", () => {
  const s = new EscapeStack();
  s.register(ESCAPE_LAYER.card, () => true);
  const heard: [string, unknown, unknown][] = [];
  let fn: ((e: KeyboardEvent) => void) | undefined;
  const target = {
    addEventListener: (t: string, f: unknown, c: unknown) => (heard.push([t, f, c]), (fn = f as typeof fn)),
    removeEventListener: (t: string, f: unknown, c: unknown) => heard.push([`off ${t}`, f, c]),
  };
  const detach = attachEscape(s, target as unknown as Window);
  assert.deepEqual([heard[0]![0], heard[0]![2]], ["keydown", true], "capture, so before the field's and a drawer's");
  const e = press();
  fn!(e as unknown as KeyboardEvent);
  assert.equal(e.prevented, 1);
  detach();
  assert.deepEqual([heard[1]![0], heard[1]![2]], ["off keydown", true]);
  assert.equal(heard[1]![1], heard[0]![1], "the same function comes off");
});

// The page used to decide who owned Escape by asking the document (a [aria-modal] in it, a [role=tooltip]). The group above the field is on the
// stack now; the surfaces below the field still ask, and are named here until they are on it too (ja-fnd.6.4.1, slice 2).
const UI = new URL("../", import.meta.url).pathname;
const STILL_ASKING = ["kit.tsx", "LabBench.tsx", "useBuilder.ts"];

test("no surface above the field asks the DOM whether it owns Escape; the ones that still do are named", () => {
  const asking = readdirSync(UI)
    .filter((f) => /\.tsx?$/.test(f))
    .filter((f) => /querySelector\([^)]*(aria-modal|role="(tooltip|dialog)")/.test(readFileSync(join(UI, f), "utf8")))
    .sort();
  assert.deepEqual(asking, [...STILL_ASKING].sort());
});
