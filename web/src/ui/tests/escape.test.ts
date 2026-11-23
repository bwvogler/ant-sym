import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { attachEscape, claimEscape, ESCAPE_LAYER, EscapeStack } from "../escape.ts";

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

test("below the field the listener is a bubble one, so a control's own handler and the field's come first", () => {
  const s = new EscapeStack();
  s.register(ESCAPE_LAYER.drawer, () => true);
  const calls: [string, unknown][] = [];
  const target = {
    addEventListener: (t: string, _f: unknown, c: unknown) => void calls.push([t, c]),
    removeEventListener: (t: string, _f: unknown, c: unknown) => void calls.push([`off ${t}`, c]),
  };
  attachEscape(s, target as unknown as Window, false)();
  assert.deepEqual(calls, [
    ["keydown", false],
    ["off keydown", false],
  ]);
});

/** The surfaces below the field, each closing itself when it takes the key; the Lab takes it only when the key was pressed with focus in it. */
function closedBelow(focusInLab: boolean): string[] {
  const s = new EscapeStack();
  const closed: string[] = [];
  const offs: Record<string, () => void> = {};
  for (const [name, layer, wants] of [
    ["builder", ESCAPE_LAYER.builder, true],
    ["drawer", ESCAPE_LAYER.drawer, true],
    ["lab", ESCAPE_LAYER.lab, focusInLab],
    ["codex", ESCAPE_LAYER.codex, true],
    ["tooltip", ESCAPE_LAYER.tooltip, true],
  ] as const)
    offs[name] = s.register(layer, () => {
      if (!wants) return false;
      closed.push(name);
      offs[name]!();
      return true;
    });
  for (let i = 0; i < 6; i++) s.handle(press());
  return closed;
}

test("below the field: a tooltip, then the Codex, then a drawer, then the builder: one at a time; the Lab passes the key unless focus is in it", () => {
  assert.deepEqual(closedBelow(false), ["tooltip", "codex", "drawer", "builder"], "the Lab passed the key on: its focus was elsewhere");
});

test("with focus in the Lab, it closes before a drawer and the builder, after a tooltip and the Codex", () => {
  assert.deepEqual(closedBelow(true), ["tooltip", "codex", "lab", "drawer", "builder"]);
});

/** A window stand-in that records its listeners. */
function fakeWindow() {
  const live = new Set<string>();
  const log: string[] = [];
  return {
    live,
    log,
    target: {
      addEventListener: (t: string, _f: unknown, c: unknown) => void (live.add(`${t} ${c}`), log.push(`add ${t} ${c}`)),
      removeEventListener: (t: string, _f: unknown, c: unknown) => void (live.delete(`${t} ${c}`), log.push(`remove ${t} ${c}`)),
    } as unknown as Window,
  };
}

test("a claim above the field listens in the capture phase, one below it in the bubble phase; both can be live, each by its own stack", () => {
  const w = fakeWindow();
  const offAbove = claimEscape("above", ESCAPE_LAYER.popover, () => true, w.target);
  assert.deepEqual([...w.live], ["keydown true"]);
  const offBelow = claimEscape("below", ESCAPE_LAYER.drawer, () => true, w.target);
  assert.deepEqual([...w.live].sort(), ["keydown false", "keydown true"]);
  offAbove();
  assert.deepEqual([...w.live], ["keydown false"], "the stack above emptied: its listener only");
  offBelow();
  assert.deepEqual([...w.live], []);
});

test("a stack keeps its one listener while any claim is on it, and gets it again after the last is gone", () => {
  const w = fakeWindow();
  const a = claimEscape("below", ESCAPE_LAYER.drawer, () => true, w.target);
  const b = claimEscape("below", ESCAPE_LAYER.builder, () => true, w.target);
  assert.deepEqual(w.log, ["add keydown false"], "one listener for two claims");
  a();
  assert.deepEqual([...w.live], ["keydown false"], "one claim left");
  b();
  assert.deepEqual([...w.live], []);
  const c = claimEscape("below", ESCAPE_LAYER.drawer, () => true, w.target);
  assert.deepEqual([...w.live], ["keydown false"], "attached afresh");
  c();
});

test("a control that took the key itself (a chart's crosshair, the aim box) keeps it from the stack below the field", () => {
  const s = new EscapeStack();
  let asked = 0;
  s.register(ESCAPE_LAYER.drawer, () => (asked++, true));
  assert.equal(s.handle(press("Escape", true)), false);
  assert.equal(asked, 0);
});

// The page used to decide who owned Escape by asking the document (a [aria-modal] in it, a [role=tooltip]). Every surface is on the stack now.
// The scan is a tripwire, not a proof: it reads every source under ui/ for a `querySelector`, `querySelectorAll`, `closest` or `matches` call
// whose selector names a `role` of tooltip or dialog, or `aria-modal`, in either quote style (a selector held in a constant is not seen).
const UI = new URL("../", import.meta.url).pathname;

function* sources(dir: string): Generator<string> {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name !== "tests") yield* sources(p);
    } else if (/\.tsx?$/.test(e.name)) yield p;
  }
}

/** Whether source text asks the DOM about a dialog, a tooltip or a modal. */
export const asksTheDom = (text: string): boolean =>
  /(querySelector(All)?|closest|matches)\([^)]*(role=["']?(tooltip|dialog)|aria-modal)/.test(text);

test("no surface asks the DOM whether it owns Escape", () => {
  const asking = [...sources(UI)].filter((f) => asksTheDom(readFileSync(f, "utf8"))).map((f) => f.slice(UI.length));
  assert.deepEqual(asking, []);
});

test("the scan sees a selector in either quote style, a list, and the other calls", () => {
  assert.ok(asksTheDom(`document.querySelector('[role="tooltip"]')`));
  assert.ok(asksTheDom(`document.querySelector("[role='tooltip']")`));
  assert.ok(asksTheDom(`document.querySelectorAll('[role="dialog"]')`));
  assert.ok(asksTheDom(`el.closest('[aria-modal="true"]')`));
  assert.ok(asksTheDom(`document.querySelector('[role="tooltip"], [role="dialog"]:not([aria-label="tutorial"])')`));
  assert.ok(!asksTheDom(`document.querySelector("main canvas")`));
  assert.ok(!asksTheDom(`t.closest("button, [role='button'], [role='tab']")`), "a control's role is not a surface's");
});
