import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CELL,
  cellOf,
  centreX,
  centreY,
  corners,
  DIR_ANGLE,
  dirOf,
  discOffsets,
  extent,
  hexDistance,
  hexLine,
  nx,
  ny,
  R,
  SIDE,
} from "../../hex.ts";

const near = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) < eps;

test("cellOf is the inverse of a cell's centre, and finds the nearest centre for any point (negative cells too)", () => {
  for (let y = -70; y <= 70; y += 7)
    for (let x = -70; x <= 70; x += 9) {
      cellOf(centreX(x, y), centreY(y));
      assert.deepEqual([CELL[0], CELL[1]], [x, y]);
    }
  // Any point lies in the cell whose centre is nearest (that is what a hexagon is).
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 200 - 100;
  for (let k = 0; k < 4000; k++) {
    const px = rand();
    const py = rand();
    cellOf(px, py);
    const [cx, cy] = [CELL[0]!, CELL[1]!];
    const d = Math.hypot(centreX(cx, cy) - px, centreY(cy) - py);
    for (let w = 0; w < 6; w++)
      assert.ok(
        d <= Math.hypot(centreX(nx(cx, cy, w), ny(cy, w)) - px, centreY(ny(cy, w)) - py) + 1e-9,
        `(${px}, ${py}) is nearer a neighbour of (${cx}, ${cy})`,
      );
    assert.ok(d <= SIDE + 1e-9, "within the hexagon's circumradius");
  }
});

test("six neighbours, each 1 away at the way's angle; going there and back returns, on even and odd rows", () => {
  for (const [x, y] of [
    [5, 4],
    [5, 5],
    [-3, -1],
    [-3, -2],
    [63, 63],
    [64, 64],
  ] as const) {
    for (let d = 0; d < 6; d++) {
      const ax = nx(x, y, d);
      const ay = ny(y, d);
      const dx = centreX(ax, ay) - centreX(x, y);
      const dy = centreY(ay) - centreY(y);
      assert.ok(near(Math.hypot(dx, dy), 1), "unit spacing");
      assert.ok(near(Math.atan2(dy, dx), Math.atan2(Math.sin(DIR_ANGLE[d]!), Math.cos(DIR_ANGLE[d]!))), `way ${d} from (${x}, ${y})`);
      const back = (d + 3) % 6;
      assert.deepEqual([nx(ax, ay, back), ny(ay, back)], [x, y]);
      assert.equal(hexDistance(x, y, ax, ay), 1);
    }
  }
});

test("dirOf rounds a heading to the nearest of the six ways; hexDistance counts steps", () => {
  assert.equal(dirOf(0), 0);
  assert.equal(dirOf(0.5), 0);
  assert.equal(dirOf(0.6), 1);
  assert.equal(dirOf(Math.PI), 3);
  assert.equal(dirOf(-0.6), 5);
  assert.equal(dirOf(-Math.PI / 2), 5, "north rounds to north-east or north-west");
  assert.equal(dirOf(7 * Math.PI), 3);
  assert.equal(hexDistance(0, 0, 3, 0), 3);
  assert.equal(hexDistance(0, 0, 0, 4), 4);
  assert.equal(hexDistance(2, 2, 2, 2), 0);
});

test("discOffsets: 1, 7, 19 cells; every offset within the radius, centre first, on both row parities", () => {
  for (const [radius, n] of [
    [0, 1],
    [1, 7],
    [2, 19],
    [3, 37],
  ] as const) {
    for (const parity of [0, 1]) {
      const o = discOffsets(radius)[parity]!;
      assert.equal(o.length / 2, n);
      assert.deepEqual([o[0], o[1]], [0, 0]);
      for (let k = 0; k < o.length; k += 2) assert.ok(hexDistance(4, parity, 4 + o[k]!, parity + o[k + 1]!) <= radius);
    }
  }
});

test("corners are SIDE from the centre; the map's extent covers every cell's hexagon", () => {
  const c = corners(10, 20, 1);
  for (let k = 0; k < 12; k += 2) assert.ok(near(Math.hypot(c[k]! - 10, c[k + 1]! - 20), SIDE));
  const e = extent(512, 368);
  assert.ok(near(e.w, 512.5));
  assert.ok(e.h > 367.5 * R + SIDE - 1e-9 && e.h < 368 * R + 1, `height ${e.h}`);
});

test("hexLine: both ends, one neighbour per step, hexDistance + 1 cells, each within a hexagon of the straight line", () => {
  let seed = 11;
  const rand = (n: number) => Math.floor(((seed = (seed * 16807) % 2147483647) / 2147483647) * (2 * n + 1)) - n;
  for (let k = 0; k < 500; k++) {
    const [ax, ay, bx, by] = [rand(80), rand(80), rand(80), rand(80)];
    const line = hexLine(ax, ay, bx, by);
    const n = hexDistance(ax, ay, bx, by);
    assert.equal(line.length, 2 * (n + 1));
    assert.deepEqual([line[0], line[1]], [ax, ay]);
    assert.deepEqual([line[2 * n], line[2 * n + 1]], [bx, by]);
    for (let i = 1; i <= n; i++)
      assert.equal(
        hexDistance(line[2 * i - 2]!, line[2 * i - 1]!, line[2 * i]!, line[2 * i + 1]!),
        1,
        `step ${i} of (${ax}, ${ay}) → (${bx}, ${by})`,
      );
    // Each cell lies within a hexagon's reach of the straight line between the centres.
    const [x1, y1, x2, y2] = [centreX(ax, ay), centreY(ay), centreX(bx, by), centreY(by)];
    const len = Math.hypot(x2 - x1, y2 - y1);
    for (let i = 0; i <= n; i++) {
      const px = centreX(line[2 * i]!, line[2 * i + 1]!);
      const py = centreY(line[2 * i + 1]!);
      const off = len === 0 ? 0 : Math.abs((x2 - x1) * (y1 - py) - (x1 - px) * (y2 - y1)) / len;
      assert.ok(off <= SIDE + 1e-6, `cell ${i} is ${off} off the line`);
    }
  }
  assert.deepEqual([...hexLine(3, 4, 3, 4)], [3, 4]);
  // The line from b to a is the line from a to b reversed, along cell edges too (PR #55 review).
  for (let k = 0; k < 500; k++) {
    const [ax, ay, bx, by] = [rand(60), rand(60), rand(60), rand(60)];
    const fwd = hexLine(ax, ay, bx, by);
    const back = hexLine(bx, by, ax, ay);
    const n = fwd.length / 2;
    for (let i = 0; i < n; i++)
      assert.deepEqual(
        [back[2 * (n - 1 - i)], back[2 * (n - 1 - i) + 1]],
        [fwd[2 * i], fwd[2 * i + 1]],
        `(${ax}, ${ay}) ↔ (${bx}, ${by}) at ${i}`,
      );
  }
  for (const [ax, ay, bx, by] of [
    [0, 0, 3, 6],
    [0, 0, 6, 4],
    [2, 1, -4, 9],
  ]) {
    const fwd = [...hexLine(ax, ay, bx, by)];
    const back = [...hexLine(bx, by, ax, ay)];
    const rev: number[] = [];
    for (let i = back.length - 2; i >= 0; i -= 2) rev.push(back[i]!, back[i + 1]!);
    assert.deepEqual(rev, fwd, `edge-aligned (${ax}, ${ay}) ↔ (${bx}, ${by})`);
  }
  assert.deepEqual([...hexLine(0, 0, 4, 0)], [0, 0, 1, 0, 2, 0, 3, 0, 4, 0]);
});
