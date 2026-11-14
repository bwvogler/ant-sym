import { test } from "node:test";
import assert from "node:assert/strict";
import { aimKey } from "../aimKey.ts";

// The aim bar's field (PRD §69.2): Enter commits, Shift+Enter is a new line, Escape gives the keys back to the map, and an
// input method's Enter (picking a word) stays the input method's.

test("Enter and Escape are done; Shift+Enter and the rest type", () => {
  assert.equal(aimKey("Enter", false, false), "done");
  assert.equal(aimKey("Escape", false, false), "done");
  assert.equal(aimKey("Escape", true, false), "done", "Escape with Shift still leaves");
  assert.equal(aimKey("Enter", true, false), "type", "Shift+Enter is a new line");
  assert.equal(aimKey("a", false, false), "type");
  assert.equal(aimKey(" ", false, false), "type", "space types: it is not the map's play key while the field has focus");
});

test("an Enter that confirms an input method's composition is the input method's", () => {
  assert.equal(aimKey("Enter", false, true), "type");
});
