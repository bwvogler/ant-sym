import { test } from "node:test";
import assert from "node:assert/strict";
import { CountGrid } from "../../battle.ts";
import { trafficAt } from "../../fungus.ts";

// The ants round a cell (docs/hyphal-traffic.md, PRD §88): count and levels, over a radius, clipped to the map, on either row parity.

const MAP = { x0: 0, size: { w: 40, h: 40 } };
const grid = (cells: [number, number, number?][]) => {
  const g = new CountGrid();
  for (const [x, y, n] of cells) g.add(x, y, n ?? 1);
  return g;
};

test("count is the ants in the disc of every colony, and none beyond the radius", () => {
  const a = grid([[20, 20, 3]]);
  const b = grid([[21, 20, 2]]);
  assert.equal(trafficAt([a, b], MAP, "count", 1, 20, 20), 5, "both colonies' ants, the cell and its neighbour");
  assert.equal(trafficAt([a, b], MAP, "count", 1, 24, 20), 0, "four cells off at r 1: none");
  assert.equal(trafficAt([a], MAP, "count", 3, 22, 20), 3, "two cells off at r 3");
});

test("the disc is the right one on an even row and on an odd row (the diagonal neighbours lean west on an even row, east on an odd one)", () => {
  const count = (x: number, y: number, cx: number, cy: number) => trafficAt([grid([[x, y]])], MAP, "count", 1, cx, cy);
  for (const y of [20, 21]) {
    assert.equal(count(21, y, 20, y), 1, `east neighbour, row ${y}`);
    for (const dy of [-1, 1]) {
      assert.equal(count(20, y + dy, 20, y), 1, `same x one row ${dy}, row ${y}: a neighbour on both parities`);
      assert.equal(count(19, y + dy, 20, y), y % 2 === 0 ? 1 : 0, `x - 1, row ${dy} from row ${y}`);
      assert.equal(count(21, y + dy, 20, y), y % 2 === 0 ? 0 : 1, `x + 1, row ${dy} from row ${y}`);
    }
  }
});

test("levels: none, one occupied cell, up to a tenth of the disc, more", () => {
  const level = (cells: [number, number][]) => trafficAt([grid(cells)], MAP, "levels", 3, 20, 20);
  assert.equal(level([]), 0);
  assert.equal(level([[20, 20, 9] as never]), 1, "one occupied cell, however many ants");
  // A disc of radius 3 holds 37 cells: 2 or 3 occupied cells are up to a tenth (3.7), 4 or more are more.
  assert.equal(
    level([
      [20, 20],
      [21, 20],
    ]),
    2,
  );
  assert.equal(
    level([
      [20, 20],
      [21, 20],
      [19, 20],
    ]),
    2,
  );
  assert.equal(
    level([
      [20, 20],
      [21, 20],
      [19, 20],
      [18, 20],
    ]),
    3,
  );
});

test("cells off the map are not counted: at the corner the disc is smaller, so the share is judged on the cells there", () => {
  // At (0, 0) of radius 3 only a quarter of the disc is on the map (about 10 cells): two occupied is over a tenth.
  const g = grid([
    [0, 0],
    [1, 0],
  ]);
  assert.equal(trafficAt([g], MAP, "levels", 3, 0, 0), 3);
  assert.equal(trafficAt([g], MAP, "levels", 3, 20, 20), 0, "far from the ants: none");
});
