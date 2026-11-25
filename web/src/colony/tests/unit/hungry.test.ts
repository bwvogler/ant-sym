import { test } from "node:test";
import assert from "node:assert/strict";
import { Evolution, EARNED, MUTATION } from "../../evolution.ts";

// A hungry fungus (FungusParams.hungry, PRD §93, ja-a2no.4): a cheap spore, a landing reserve, the free pool's higher share.

const grown = (hungry: boolean): Evolution => {
  const e = new Evolution(0);
  e.hungry = hungry;
  e.patches = 10;
  e.mass = 4;
  for (let k = 0; k < 4000; k++) {
    const spores = e.grow(0.5);
    void spores;
  }
  return e;
};

test("hungry: the free term pays out its reserve and stops; not hungry, it does not", () => {
  const h = grown(true);
  assert.ok(Math.abs(h.reserveUsed - EARNED.reserve) < 1e-6, `spent ${h.reserveUsed} of ${EARNED.reserve}`);
  assert.ok(Math.abs(h.ledger.free - EARNED.reserve) < 1e-6);
  const n = grown(false);
  assert.ok(n.ledger.free > 5 * EARNED.reserve, `not hungry: ${n.ledger.free}`);
  assert.equal(n.reserveUsed, 0, "the reserve is counted only when hungry");
});

test("hungry: a spore costs EARNED.sporeCost, and the free pool counts ground growth at EARNED.share", () => {
  const e = new Evolution(0);
  assert.equal(e.sporeCost, 1);
  e.hungry = true;
  assert.equal(e.sporeCost, EARNED.sporeCost);
  e.growth = 100;
  e.ground = 100;
  assert.ok(Math.abs(e.pools.free - EARNED.share * 100) < 1e-9);
  const n = new Evolution(0);
  n.growth = 100;
  n.ground = 100;
  assert.ok(Math.abs(n.pools.free - MUTATION * 100) < 1e-9, "not hungry: MUTATION as before");
});

test("hungry saves the reserve it spent and loads it; a fungus that is not hungry saves no extra key", () => {
  const h = grown(true);
  const back = Evolution.load(JSON.parse(JSON.stringify(h.save())));
  assert.equal(back.hungry, true);
  assert.equal(back.reserveUsed, h.reserveUsed);
  const keys = Object.keys(grown(false).save());
  assert.ok(!keys.includes("hungry") && !keys.includes("reserveUsed"), `keys ${keys}`);
});
