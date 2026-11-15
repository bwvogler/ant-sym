import { test } from "node:test";
import assert from "node:assert/strict";
import { LARVA } from "../../brood.ts";
import { Colony } from "../../colony.ts";
import { CELL, cellOf, centreX, centreY } from "../../hex.ts";
import { digCell, OPEN, rockAt } from "../../world.ts";
import { oneColony, broodChamber } from "../builders.ts";

// The pick-up reach (portReach, ja-ukac.3, docs/relay-transport.md, PRD §80): how far from a stocked store an idle ant can
// start a carry. 0 is today's two cells (PORT_REACH), bit for bit. Seed 2's small one world, colony 0's nest in the curtain.

/** One ant, a four-cell store of 20 food off the nest chamber's far wall, and a brood chamber with a larva owed food. Returns a cell 3 from the store. */
function setup(portReach: number) {
  const { map, c } = oneColony(1, { maxAnts: 5, portReach });
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
  const { b: room, cell } = broodChamber(map);
  const larva = c.brood.add(cell[0], cell[1], room.id);
  room.brood++;
  larva.stage = LARVA;
  larva.energy = 0.3; // hungry: the colony wants food in that chamber
  assert.equal(rockAt(map, sx + 2, sy), OPEN, "the chamber is open three cells from the store");
  return { c, at: [sx + 2, sy] as const };
}

/** Hold ant 0 at (x, y), idle and willing, for `secs`; true if it took a unit from the store. */
function tries(c: Colony, at: readonly [number, number], secs: number): boolean {
  for (let t = 0; t < 30 * secs && c.inJaws < 1; t++) {
    c.x[0] = centreX(at[0], at[1]);
    c.y[0] = centreY(at[1]);
    c.need[0] = 0.5;
    c.energy[0] = 1;
    c.tick(1 / 30);
  }
  return c.inJaws >= 1;
}

test("portReach: an idle ant three cells from a stocked store starts a carry only with a wider reach", () => {
  const off = setup(0);
  assert.equal(tries(off.c, off.at, 20), false, "two cells (off): out of reach");
  const wide = setup(4);
  assert.equal(tries(wide.c, wide.at, 20), true, "four cells: it takes a unit");
});

test("portReach: an ant within two cells starts a carry with the setting off, as before", () => {
  const { c, at } = setup(0);
  assert.equal(tries(c, [at[0] - 1, at[1]], 20), true);
});
