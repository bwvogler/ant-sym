import { test } from "node:test";
import assert from "node:assert/strict";
import { clearProbe, type FieldProbe, lensNow, type LensState, nextLens, offerProbe, shownOn, unpin } from "../lensStore.ts";

// Where the lens looks (PRD §69.3): a hover follows the pointer; a click pins a card on its view till a new click or a
// close; the two are kept apart, so the lens works on the other view while a card waits pinned (review of #196, S6).

const at = (x: number, pinned = false, lv = 0): FieldProbe => ({ sx: x, sy: 0, lv, x, y: 0, ant: null, pinned });
const none: LensState = { pinned: null, hover: null };

test("a hover moves the hover; a click pins, replacing any pinned card; leaving clears the hover only", () => {
  const h = nextLens(none, at(1));
  assert.deepEqual(h, { pinned: null, hover: at(1) });
  const p = nextLens(h, at(2, true));
  assert.deepEqual(p, { pinned: at(2, true), hover: at(1) });
  assert.deepEqual(nextLens(p, at(3)), { pinned: at(2, true), hover: at(3) }, "the pointer wanders: the pinned card stays");
  assert.deepEqual(nextLens(p, null), { pinned: at(2, true), hover: null }, "the pointer leaves: it stays");
  assert.deepEqual(nextLens(p, at(4, true)).pinned, at(4, true), "a new click moves it");
});

test("each view shows its pinned card, else the pointer's there (review of #196, S6)", () => {
  const s: LensState = { pinned: at(1, true, 0), hover: at(2, false, 1) };
  assert.deepEqual(shownOn(s, 0), at(1, true, 0), "the pinned card's view: the card, over the hover");
  assert.deepEqual(shownOn(s, 1), at(2, false, 1), "the other view: the pointer's, though a card waits pinned");
  assert.equal(shownOn({ pinned: at(1, true, 0), hover: null }, 1), null);
  assert.deepEqual(shownOn({ pinned: null, hover: at(2, false, 0) }, 0), at(2, false, 0));
});

test("the store: unpin closes the pinned card and leaves the hover; clear closes both", () => {
  clearProbe();
  offerProbe(at(1, true));
  offerProbe(at(2));
  assert.equal(lensNow().pinned?.x, 1);
  unpin();
  assert.deepEqual(lensNow(), { pinned: null, hover: at(2) });
  offerProbe(at(3, true));
  clearProbe();
  assert.deepEqual(lensNow(), none);
});
