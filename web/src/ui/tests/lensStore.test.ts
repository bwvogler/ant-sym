import { test } from "node:test";
import assert from "node:assert/strict";
import { clearProbe, type FieldProbe, nextProbe, offerProbe, probeNow } from "../lensStore.ts";

// Where the lens looks (PRD §69.3): a hover follows the pointer; a click pins the card till a new click or a close.

const at = (x: number, pinned = false): FieldProbe => ({ sx: x, sy: 0, lv: 0, x, y: 0, ant: null, pinned });

test("a hover replaces a hover and nothing; a click replaces anything; a pinned card outlasts hovers and leaving", () => {
  assert.deepEqual(nextProbe(null, at(1)), at(1));
  assert.deepEqual(nextProbe(at(1), at(2)), at(2));
  assert.deepEqual(nextProbe(at(1, true), at(2)), at(1, true), "the pointer wanders: the pinned card stays");
  assert.deepEqual(nextProbe(at(1, true), null), at(1, true), "the pointer leaves: it stays");
  assert.deepEqual(nextProbe(at(1, true), at(3, true)), at(3, true), "a new click moves it");
  assert.equal(nextProbe(at(1), null), null, "a hover card goes with the pointer");
});

test("the store: offered points follow the rule, and a close clears even a pinned card", () => {
  clearProbe();
  offerProbe(at(1, true));
  offerProbe(at(2));
  assert.equal(probeNow()?.x, 1);
  clearProbe();
  assert.equal(probeNow(), null);
});
