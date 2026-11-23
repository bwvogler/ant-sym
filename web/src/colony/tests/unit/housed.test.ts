import { test } from "node:test";
import assert from "node:assert/strict";
import { Colony } from "../../colony.ts";
import { mulberry32 } from "../../world.ts";
import { hexMap } from "../hexmaps.ts";
import { smallOne } from "../builders.ts";

// `Colony.housed` (ja-fnd.5.5.1, docs/nest-kind.md): whether the colony lives in a nest (chambers, brood, stores, workers zoned by age), the gate the
// code used to read as `queen !== null`. Today it is that boolean; these tests hold the two questions apart so the queen can become several queens
// (ja-8fd.1) or a nest have none without touching the gates.

/** A one-world colony of two ants on its curtain, where the nest is and the queen lies on the royal chamber's floor. */
function housed(): Colony {
  const w = smallOne(2);
  return new Colony(w.curtain, { antCount: 2, maxAnts: 2 }, mulberry32(1), undefined, { plane: w.plane, line: w.line });
}

/** A colony on a bare field: no chambers, so no queen and no nest life. */
function bare(): Colony {
  return new Colony(hexMap(["sssssssss", "s.......s", "sssssssss"]), { antCount: 2, maxAnts: 2 }, mulberry32(1));
}

test("housed: a curtain colony with its queen on the royal floor; a colony on a bare field has neither", () => {
  const c = housed();
  assert.ok(c.queen !== null && c.housed);
  const b = bare();
  assert.equal(b.queen, null);
  assert.equal(b.housed, false);
});

test("a dead queen leaves the colony housed (orphaned, still in its nest): the nest and the queen are two questions", () => {
  const c = housed();
  c.killQueen();
  assert.ok(c.orphaned, "no queen alive");
  assert.ok(c.housed, "the nest is still there");
  assert.equal(c.queen?.alive, false);
});

test("the age zones and the dig, forage and stay-in rules follow housed: on a bare field every ant is old and digs wherever it explores", () => {
  const b = bare();
  for (const i of [0, 1]) {
    assert.equal(b.band(i), 2, "on the plane every ant is old");
    assert.equal(b.digs(i), true, "any explorer digs");
    assert.equal(b.outbound(i), false);
    assert.equal(b.staysIn(i), false);
    assert.equal(b.forageDigs(i), false);
  }
  const c = housed();
  const lifespan = c.params.lifespan;
  c.age[0] = 0; // young: a nurse
  c.age[1] = lifespan * (c.params.youngShare + c.params.middleShare) * 0.5 + lifespan * c.params.youngShare * 0.5; // middle-aged
  assert.equal(c.band(0), 0, "young by its age");
  assert.equal(c.digs(0), false, "a nurse does not dig");
  assert.equal(c.band(1), 1, "middle-aged by its age");
  assert.equal(c.digs(1), true, "the middle-aged dig");
  c.age[1] = lifespan; // old
  assert.equal(c.band(1), 2);
  assert.equal(c.outbound(1), true, "an old ant is a forager on its way out");
  c.under[0] = 1;
  assert.equal(c.mayGoOut(0), false, "a nurse underground is kept in");
  assert.equal(c.staysIn(0), true);
});

test("spare food: all of the larder on a bare field; in a nest, only what the brood does not owe (an orphaned colony's is all spare)", () => {
  const b = bare();
  b.larder = 7;
  assert.equal(b.spare(), 7);
  const c = housed();
  c.larder = 7;
  assert.ok(c.spare() <= 7, "a nest owes some of it to the brood");
  c.killQueen();
  assert.equal(c.spare(), c.larder + c.inJaws + c.inCrops - c.brood.owed(), "orphaned: the formula for the spare");
});
