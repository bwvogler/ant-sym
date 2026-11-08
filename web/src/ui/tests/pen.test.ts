import { test } from "node:test";
import assert from "node:assert/strict";
import { INFECTED } from "../../colony/fungus.ts";
import type { Flight } from "../../colony/royal.ts";
import { penGate } from "../pen.ts";

// The queen's pen (ja-lo8.9): the only time a colony's words change. It opens for a new queen with the fungus in her,
// from a colony whose queen the fungus reached, while Jev can read new words; else she founds on her mother's doctrine.

const flight = (load: number): Flight => ({ mother: 1, x: 0, y: 0, load, strain: 0, at: 10 });

test("the pen opens only for a queen with you in her, from a colony whose queen you reached, while Jev can read words", () => {
  assert.deepEqual(penGate(flight(INFECTED), [false, true], null, "Amber"), { open: true });
  const clean = penGate(flight(INFECTED / 2), [false, true], null, "Amber");
  assert.equal(clean.open, false);
  assert.match(!clean.open ? clean.reason : "", /without you in her/);
  const closed = penGate(flight(1), [true, false], null, "Amber");
  assert.match(!closed.open ? closed.reason : "", /never reached Amber's queen/);
  const locked = penGate(flight(1), [false, true], "Jev's daily budget is spent", "Amber");
  assert.match(!locked.open ? locked.reason : "", /can't read new words now \(Jev's daily budget is spent\)/);
  for (const g of [clean, closed, locked]) assert.match(!g.open ? g.reason : "", /mother's doctrine/);
});
