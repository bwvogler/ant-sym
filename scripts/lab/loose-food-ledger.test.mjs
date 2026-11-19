import { test } from "node:test";
import assert from "node:assert/strict";
import { observeLooseFood } from "./loose-food-ledger.mjs";

test("ledger separates approved collection, other removal and repeated sites while preserving writes", () => {
  const cells = new Map([["0,0", 2]]);
  const field = {
    get(x, y) {
      return cells.get(`${x},${y}`) ?? 0;
    },
    set(x, y, n) {
      cells.set(`${x},${y}`, n);
      return n;
    },
    forEach(fn) {
      fn(0, 0, [...cells.values()]);
    },
  };
  let now = 0;
  const ledger = observeLooseFood(field, () => now);
  now = 1;
  assert.equal(field.set(1, 0, 1), 1);
  now = 2;
  ledger.expectPickup(1, 0);
  field.set(1, 0, 0);
  now = 3;
  field.set(1, 0, 1);
  now = 4;
  ledger.expectPickup(1, 0);
  field.set(1, 0, 0);
  field.set(0, 0, 1); // Another removal is not credited as collection.
  now = 5;
  assert.deepEqual(ledger.snapshot(), {
    addedBacklog: 0,
    peakAddedBacklog: 1,
    addedBacklogSeconds: 2,
    collectedAdded: 2,
    additionsMixingInitialFood: 0,
    initial: 2,
    ground: 1,
    added: 2,
    removed: 3,
    pickups: 2,
    pickupsAtAddedSites: 2,
    repeatedSitePickups: 1,
    maxPickupsAtSite: 2,
    peakGround: 3,
    groundSeconds: 11,
    pickupSites: 1,
  });
});

test("mixed initial food is reported and cancelling pickup attribution leaves conservation intact", () => {
  let value = 4,
    now = 0;
  const field = {
    get() {
      return value;
    },
    set(_x, _y, n) {
      value = n;
    },
    forEach(fn) {
      fn(0, 0, [value]);
    },
  };
  const ledger = observeLooseFood(field, () => now);
  field.set(0, 0, 6);
  now = 2;
  ledger.expectPickup(0, 0);
  ledger.clearPickup();
  field.set(0, 0, 3);
  const result = ledger.snapshot();
  assert.equal(value, 3);
  assert.equal(result.addedBacklog, 0);
  assert.equal(result.additionsMixingInitialFood, 1);
  assert.equal(result.addedBacklogSeconds, 4);
  assert.equal(result.pickups, 0);
  assert.equal(result.collectedAdded, 0);
  assert.equal(result.initial + result.added - result.removed, result.ground);
});
