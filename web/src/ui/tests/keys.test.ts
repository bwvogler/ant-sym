import { test } from "node:test";
import assert from "node:assert/strict";
import { type KeyPress, modK, pageKey, shortcuts } from "../keys.ts";

// The page's keys (PRD §69.3): one table for the handler and the shortcuts sheet.

const SPEEDS = [1, 2, 4, 8];
const press = (key: string, more: Partial<KeyPress> = {}): KeyPress => ({
  key,
  ctrl: false,
  meta: false,
  alt: false,
  typing: false,
  control: false,
  ...more,
});

test("each page key's action", () => {
  assert.deepEqual(pageKey(press("?"), SPEEDS), { kind: "shortcuts" });
  assert.deepEqual(pageKey(press(" "), SPEEDS), { kind: "play" });
  assert.deepEqual(pageKey(press("1"), SPEEDS), { kind: "speed", speed: 1 });
  assert.deepEqual(pageKey(press("4"), SPEEDS), { kind: "speed", speed: 8 });
  assert.equal(pageKey(press("5"), SPEEDS), null, "four speeds, four keys");
  assert.deepEqual(pageKey(press("i"), SPEEDS), { kind: "lens" });
  assert.deepEqual(pageKey(press("V"), SPEEDS), { kind: "view" }, "Shift or Caps Lock still switches");
  assert.deepEqual(pageKey(press("f"), SPEEDS), { kind: "host" });
  assert.equal(pageKey(press("x"), SPEEDS), null);
});

test("⌘K and Ctrl+K open the palette from anywhere, even a text field; nothing else does from one", () => {
  for (const mod of [{ meta: true }, { ctrl: true }]) {
    assert.deepEqual(pageKey(press("k", mod), SPEEDS), { kind: "palette" });
    assert.deepEqual(pageKey(press("K", { ...mod, typing: true }), SPEEDS), { kind: "palette" });
  }
  assert.equal(pageKey(press("k", { ctrl: true, alt: true }), SPEEDS), null);
  for (const k of ["?", " ", "1", "i", "v", "f"]) assert.equal(pageKey(press(k, { typing: true }), SPEEDS), null, `“${k}” typed`);
});

test("the browser's shortcuts pass, and Space on a button presses the button", () => {
  for (const mod of [{ ctrl: true }, { meta: true }, { alt: true }]) assert.equal(pageKey(press("1", mod), SPEEDS), null);
  assert.equal(pageKey(press(" ", { control: true }), SPEEDS), null);
  assert.deepEqual(pageKey(press("1", { control: true }), SPEEDS), { kind: "speed", speed: 1 }, "only Space is the control's");
});

test("the sheet lists every page key, and every key it lists away from the map is one the page answers", () => {
  const SHORTCUTS = shortcuts(SPEEDS);
  const anywhere = SHORTCUTS.find((g) => g.group === "Anywhere")!.rows.flatMap((r) => r.keys);
  const asKey: Record<string, KeyPress> = {
    "⌘K": press("k", { meta: true }),
    "Ctrl+K": press("k", { ctrl: true }),
    Space: press(" "),
  };
  for (const k of anywhere) {
    if (k === "Esc") continue; // each surface's own (the menu, the map, a drawer)
    assert.notEqual(pageKey(asKey[k] ?? press(k), SPEEDS), null, `the sheet lists “${k}”`);
  }
  for (const k of ["?", " ", "1", "2", "3", "4", "i", "v", "f"])
    assert.ok(anywhere.includes(k === " " ? "Space" : k), `the page answers “${k}”: the sheet lists it`);
  assert.ok(
    SHORTCUTS.filter((g) => g.group !== "Anywhere").every((g) => g.rows.every((r) => r.map)),
    "the map's keys are marked as the map's",
  );
});

test("the sheet's speed row is the HUD's speeds, whatever they are (review of #196, N7)", () => {
  const row = (speeds: number[]) => shortcuts(speeds)[0]!.rows.find((r) => r.does.startsWith("speed"))!;
  assert.deepEqual(row(SPEEDS), { keys: ["1", "2", "3", "4"], does: "speed: 1×, 2×, 4×, 8×" });
  assert.deepEqual(row([1, 3, 9]), { keys: ["1", "2", "3"], does: "speed: 1×, 3×, 9×" });
});

test("the palette's key as the machine names it (review of #196, N5)", () => {
  assert.equal(modK("MacIntel"), "⌘K");
  assert.equal(modK("iPhone"), "⌘K");
  assert.equal(modK("Win32"), "Ctrl+K");
  assert.equal(modK("Linux x86_64"), "Ctrl+K");
});
