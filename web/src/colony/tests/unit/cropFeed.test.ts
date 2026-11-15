import { test } from "node:test";
import assert from "node:assert/strict";
import { LARVA } from "../../brood.ts";
import { Colony } from "../../colony.ts";
import { CELL, cellOf, centreX, centreY } from "../../hex.ts";
import { digCell, OPEN, rockAt } from "../../world.ts";
import { oneColony, broodChamber } from "../builders.ts";

// Larval feeding by mouth (cropFeed, ja-638i, docs/larval-feeding.md, PRD §75): crops filled at the stores, passed mouth
// to mouth to a needier nestmate, fed to larvae; the food in crops stays the colony's (inCrops). Seed 2's small one world, in colony 0's nest in the curtain (S2.3c: until then world 2 of the small side map).

/** A colony of `n` ants with crops of `cap`, and a four-cell store holding 20 food off the nest chamber's far wall. */
function colony(cap: number, n: number) {
  const { map, c } = oneColony(n, { maxAnts: n + 4, cropFeed: cap });
  const ch = map.chambers!;
  cellOf(map.nest.x, map.nest.y);
  const sy = CELL[1];
  let sx = CELL[0];
  while (rockAt(map, sx - 1, sy) === OPEN) sx--;
  const store = ch.add(0, sy, "store");
  for (let k = 1; k <= 4; k++) {
    digCell(map, sx - k, sy);
    ch.claim(store.id, sx - k, sy, (a, b) => rockAt(map, a, b) === OPEN);
  }
  c.stock(store, 20);
  return { map, c, store, at: [sx - 2, sy] as const };
}

/** Hold ant i at cell (x, y), feeling `need`, for `secs` seconds (the need is set again each tick: body feels it anew). */
function hold(c: Colony, place: () => void, secs: number) {
  for (let t = 0; t < 30 * secs; t++) {
    place();
    c.tick(1 / 30);
  }
}
const put = (c: Colony, i: number, x: number, y: number, need: number) => {
  c.x[i] = centreX(x, y);
  c.y[i] = centreY(y);
  c.need[i] = need;
  c.energy[i] = 1; // well fed: it doesn't eat what it carries
};

test("cropFeed: an ant feeling need fills its crop at a store up to the cap; the food stays the colony's", () => {
  const { c, store, at } = colony(0.5, 1);
  const before = c.larder;
  hold(c, () => put(c, 0, at[0], at[1], 0.5), 3);
  // (It may also have picked up a unit to port, held in its jaws: inJaws.)
  assert.ok(Math.abs(c.crop[0] - 0.5) < 1e-6, `filled to the cap: ${c.crop[0]}`);
  assert.ok(Math.abs(c.inCrops - c.crop[0]) < 1e-6, "inCrops counts it");
  assert.ok(Math.abs(before - c.larder - c.inJaws - c.crop[0]) < 1e-9, `taken from the store: ${before - c.larder - c.inJaws}`);
  assert.ok(store.food < 20);
});

test("cropFeed: an ant feeling no need, or with the setting off, takes nothing", () => {
  const calm = colony(0.5, 1);
  hold(calm.c, () => put(calm.c, 0, calm.at[0], calm.at[1], 0), 3);
  assert.equal(calm.c.crop[0], 0);
  const off = colony(0, 1);
  hold(off.c, () => put(off.c, 0, off.at[0], off.at[1], 0.5), 3);
  assert.equal(off.c.crop[0], 0);
  assert.equal(off.c.inCrops, 0);
});

test("cropFeed: food passes mouth to mouth from a fuller crop to a nestmate that feels more need, not the other way", () => {
  const run = (needA: number, needB: number) => {
    const { c, map } = colony(0.5, 2);
    cellOf(map.nest.x, map.nest.y); // the nest's centre, away from the store
    const [x, y] = [CELL[0], CELL[1]];
    c.crop[0] = 0.5;
    c.inCrops = 0.5;
    hold(
      c,
      () => {
        put(c, 0, x, y, needA);
        put(c, 1, x, y, needB);
      },
      2,
    );
    return { a: c.crop[0], b: c.crop[1], total: c.inCrops };
  };
  const toNeedy = run(0.1, 0.6);
  assert.ok(toNeedy.b > 0.1, `the needier got some: ${toNeedy.b}`);
  assert.ok(Math.abs(toNeedy.a + toNeedy.b - 0.5) < 1e-6, "nothing made or lost in passing");
  const toCalm = run(0.6, 0.1);
  assert.equal(toCalm.b, 0, "a calmer nestmate gets none");
});

test("cropFeed: a nurse with food in its crop feeds a larva still owed its growth food; every unit is accounted for", () => {
  const { c, map } = colony(0.5, 1);
  const { b: room, cell } = broodChamber(map);
  const larva = c.brood.add(cell[0], cell[1], room.id);
  room.brood++;
  larva.stage = LARVA;
  larva.energy = 1; // not hungry: owed its growth food only
  c.crop[0] = 0.5;
  c.inCrops = 0.5;
  const total = () => c.larder + c.inCrops + larva.fed + c.eaten;
  const before = total();
  hold(c, () => put(c, 0, cell[0], cell[1], 0), 2);
  assert.ok(larva.fed > 0.05, `fed from the crop: ${larva.fed}`);
  assert.ok(c.crop[0] < 0.5);
  assert.ok(Math.abs(total() - before) < 1e-9, `conserved: ${before} -> ${total()}`);
});

test("cropFeed: the food in a dying ant's crop leaves the economy with it", () => {
  const { c } = colony(0.5, 1);
  c.crop[0] = 0.4;
  c.inCrops = 0.4;
  const eaten = c.eaten;
  c.kill(0, false);
  assert.equal(c.crop[0], 0);
  assert.ok(Math.abs(c.inCrops) < 1e-9);
  assert.ok(Math.abs(c.eaten - eaten - 0.4) < 1e-6);
});

test("cropFeed: a hungry ant away from the stores eats from its own crop first (review of #217, S2)", () => {
  const { c, map } = colony(0.5, 1);
  cellOf(map.nest.x, map.nest.y);
  const [x, y] = [CELL[0], CELL[1]];
  c.crop[0] = 0.3;
  c.inCrops = 0.3;
  c.x[0] = centreX(x, y);
  c.y[0] = centreY(y);
  c.energy[0] = 0.5; // below EAT_BELOW
  const eaten = c.eaten;
  c.tick(1 / 30);
  assert.ok(c.crop[0] < 0.3, `it ate from its crop: ${c.crop[0]}`);
  assert.ok(c.energy[0] > 0.5, `its energy rose: ${c.energy[0]}`);
  assert.ok(Math.abs(c.eaten - eaten - (0.3 - c.crop[0])) < 1e-9, "counted as eaten, the same food");
  assert.ok(Math.abs(c.inCrops - c.crop[0]) < 1e-12, "inCrops is the crop");
});

test("cropFeed: crop food is the colony's spare food too, and lets the queen lay (review of #217, S3)", () => {
  const { c } = colony(0.5, 1);
  c.params.maxAnts = c.population + c.brood.size; // at its cap: spare() counts what it holds
  const before = c.spare();
  c.inCrops = 0.4;
  assert.ok(Math.abs(c.spare() - before - 0.4) < 1e-9, "spare() counts the crops");
});

test("cropFeed: crops fill only at the colony's own store or reception, never from a brood chamber's food", () => {
  const { c, map } = colony(0.5, 1);
  const { b: room, cell } = broodChamber(map);
  c.stock(room, 5); // the larvae's food
  hold(c, () => put(c, 0, cell[0], cell[1], 0.5), 2);
  assert.equal(c.crop[0], 0, "nothing taken from the brood chamber");
  assert.equal(room.food, 5);
});

test("cropFeed: a hungrier larva is fed faster from a nurse's crop (Cassill & Tschinkel 1995, the rate follows hunger)", () => {
  const fedIn = (energy: number) => {
    const { c, map } = colony(0.5, 1);
    const { b: room, cell } = broodChamber(map);
    const larva = c.brood.add(cell[0], cell[1], room.id);
    room.brood++;
    larva.stage = LARVA;
    larva.energy = energy;
    c.crop[0] = 0.5;
    c.inCrops = 0.5;
    hold(c, () => put(c, 0, cell[0], cell[1], 0), 0.5);
    return 0.5 - c.crop[0];
  };
  const hungry = fedIn(0.1);
  const owedOnly = fedIn(1);
  assert.ok(hungry > owedOnly * 1.5, `hungry ${hungry} against owed only ${owedOnly}`);
});

test("cropFeed: the queen's egg gate counts food in crops: with the larder short she lays only if crops make it up", () => {
  const laid = (inCrops: number) => {
    const { c, map, store } = colony(0.5, 1);
    c.stock(store, -store.food); // the store emptied
    cellOf(c.queen!.x, c.queen!.y);
    const royal = map.chambers!.list[map.chambers!.at(CELL[0], CELL[1])]!;
    c.stock(royal, 2 - royal.food); // two units by her: enough to eat for an egg, short of the gate's EGG + LARVA food
    c.inCrops = inCrops;
    const before = c.brood.size;
    for (let t = 0; t < 30; t++) {
      c.x[0] = c.nest.x + 400; // its one ant far off, out of the way
      c.tick(1 / 30);
    }
    return c.brood.size - before;
  };
  assert.equal(laid(0), 0, "the larder alone is short");
  assert.ok(laid(10) > 0, "with food in crops she lays");
});
