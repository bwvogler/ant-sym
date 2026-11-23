import { test } from "node:test";
import assert from "node:assert/strict";
import { destMark } from "../../homing.ts";
import { Colony } from "../../colony.ts";
import { mulberry32 } from "../../world.ts";
import { smallOne } from "../builders.ts";

// A forager carrying food in the nest heads for the reception chamber once it has RECEPTION_MIN cells, else the royal chamber (foodTo). If
// the reception chamber's road signs don't reach where it stands it searches on; after `deliveryFallback` seconds of holding the food it
// tries the royal chamber's signs instead (PRD §77.7: G1 seed 10 held 16 foragers over two minutes without it). Its own timer only.

/** A colony whose nest has a reception chamber of at least 4 cells (the smallest that takes food), and one ant carrying food at `since` seconds. */
function carrier(deliveryFallback: number, since: number, porter = 0) {
  const w = smallOne(2);
  const c = new Colony(w.curtain, { antCount: 1, maxAnts: 5, deliveryFallback }, mulberry32(1), () => "explore", {
    plane: w.plane,
    line: w.line,
  });
  // The nest starts with its royal chamber only: let that one stand in as a reception chamber (foodTo picks it; the fallback's "royal" is the literal role).
  const stand = w.curtain.chambers!.list.find((k) => k.colony === c.params.nest && k.role === "royal")!;
  stand.role = "reception";
  stand.cells = Math.max(stand.cells, 4);
  c.carrying[0] = 1;
  c.porter[0] = porter as 0 | 1;
  c.since[0] = since;
  return c;
}

test("a carrier holding food for less than the limit heads for reception; past it, for the royal chamber's signs", () => {
  assert.equal(destMark(carrier(60, 10), 0), "reception");
  assert.equal(destMark(carrier(60, 59), 0), "reception");
  assert.equal(destMark(carrier(60, 61), 0), "royal");
});

test("deliveryFallback 0 never falls back, and a porter (moving food between chambers on purpose) never does", () => {
  assert.equal(destMark(carrier(0, 500), 0), "reception");
  assert.equal(destMark(carrier(60, 500, 1), 0), "reception");
});
