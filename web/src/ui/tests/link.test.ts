import { test } from "node:test";
import assert from "node:assert/strict";
import { CELL, cellOf, centreX, centreY } from "../../colony/hex.ts";
import { CRUST, STRIP } from "../../colony/oneWorld.ts";
import { cellAt, makeTransect } from "../../colony/transect.ts";
import { mulberry32 } from "../../colony/world.ts";
import { columnNear, LINK_REACH, planePoint, stripColumn, stripPoint } from "../link.ts";

// The views linked (U5.2): a click on the line above opens the side view at its column; a click on the strip below opens
// the top view at P(s). On a line with a bend each way.

const line = makeTransect([
  { x: 100, y: 100 },
  { x: 160, y: 124 },
  { x: 210, y: 80 },
]);

test("a click on a line cell's centre gives a column over that cell", () => {
  for (let s = line.sMin; s <= line.sMax; s++) {
    const p = planePoint(line, s)!;
    const near = columnNear(line, p.x, p.y);
    assert.notEqual(near, null, `column ${s}`);
    cellAt(line, s);
    const [x, y] = [CELL[0], CELL[1]];
    cellAt(line, near!);
    assert.deepEqual([CELL[0], CELL[1]], [x, y], `column ${s}: the click found column ${near}, over another cell`);
    assert.ok(Math.abs(near! - s) <= 1, `column ${s} → ${near}`);
  }
});

test("a click within the reach of the line finds it, and one past it doesn't", () => {
  const rnd = mulberry32(7);
  let hits = 0;
  let misses = 0;
  for (let n = 0; n < 2000; n++) {
    const wx = 60 + rnd() * 220;
    const wy = 40 + rnd() * 130;
    // The true distance to the nearest line cell's centre, by brute force.
    let best = Infinity;
    for (let s = line.sMin; s <= line.sMax; s++) {
      const p = planePoint(line, s)!;
      best = Math.min(best, Math.hypot(p.x - wx, p.y - wy));
    }
    const s = columnNear(line, wx, wy);
    if (best <= LINK_REACH - 1e-9) {
      assert.notEqual(s, null, `(${wx.toFixed(2)}, ${wy.toFixed(2)}) is ${best.toFixed(2)} from the line`);
      const p = planePoint(line, s!)!;
      assert.ok(Math.abs(Math.hypot(p.x - wx, p.y - wy) - best) < 1e-9, "not the nearest line cell");
      hits++;
    } else if (best > LINK_REACH + 1e-9) {
      assert.equal(s, null, `(${wx.toFixed(2)}, ${wy.toFixed(2)}) is ${best.toFixed(2)} from the line`);
      misses++;
    }
  }
  assert.ok(hits > 50 && misses > 50, `${hits} hits, ${misses} misses`);
});

test("a click on the strip or the sky over it gives the strip's column there; below it, nothing", () => {
  for (let s = line.sMin; s <= line.sMax; s += 7) {
    const q = stripPoint(s);
    assert.equal(stripColumn(line, q.x, q.y), s, `the strip at ${s}`);
    // The sky rows above it, odd and even: still the strip's column.
    for (const y of [0, 13, STRIP - 1]) assert.equal(stripColumn(line, q.x, centreY(y)), s, `row ${y} over ${s}`);
    assert.equal(stripColumn(line, q.x, centreY(CRUST)), null, `the crust under ${s}`);
    assert.equal(stripColumn(line, q.x, centreY(STRIP + 30)), null, `deep under ${s}`);
  }
  assert.equal(stripColumn(line, stripPoint(line.sMin - 3).x, stripPoint(0).y), null, "past the line's start");
  assert.equal(stripColumn(line, stripPoint(line.sMax + 3).x, stripPoint(0).y), null, "past the line's end");
});

test("the strip's column and the line's agree both ways: below at s, then above, comes back to s's cell", () => {
  for (let s = line.sMin; s <= line.sMax; s++) {
    const q = stripPoint(s);
    const back = stripColumn(line, q.x, q.y)!;
    const p = planePoint(line, back)!;
    const again = columnNear(line, p.x, p.y)!;
    cellOf(p.x, p.y);
    const [x, y] = [CELL[0], CELL[1]];
    cellAt(line, again);
    assert.deepEqual([CELL[0], CELL[1]], [x, y], `column ${s}`);
  }
  assert.equal(planePoint(line, line.sMax + 1), null);
  assert.deepEqual(stripPoint(5), { x: centreX(5, STRIP), y: centreY(STRIP) });
});

test("a click at the edge of the reach, any way round a line cell, still finds the line", () => {
  // Points 2.5 to 3 from a line cell's centre: the click's own cell can then be several steps off the line.
  const rnd = mulberry32(11);
  for (let n = 0; n < 6000; n++) {
    const s = line.sMin + Math.floor(rnd() * (line.sMax - line.sMin + 1));
    const p = planePoint(line, s)!;
    const a = rnd() * 2 * Math.PI;
    const d = 2.5 + rnd() * (LINK_REACH - 2.5 - 1e-6);
    const near = columnNear(line, p.x + d * Math.cos(a), p.y + d * Math.sin(a));
    assert.notEqual(near, null, `${d.toFixed(3)} from column ${s}'s cell`);
  }
});

test("a click exactly between two line cells gives the lower column", () => {
  // A line running east–west: neighbouring columns on one row, whose centres are exactly 1 apart, so the point midway
  // is exactly as near each (and either way round the click's own cell).
  const flat = makeTransect([
    { x: 40, y: 50 },
    { x: 90, y: 50 },
  ]);
  let pairs = 0;
  for (let s = flat.sHole[0]!; s < flat.sHole[1]!; s++) {
    const a = planePoint(flat, s)!;
    const b = planePoint(flat, s + 1)!;
    if (a.y !== b.y) continue;
    for (const dy of [0, 0.3, -0.3]) {
      assert.equal(columnNear(flat, (a.x + b.x) / 2, a.y + dy), s, `between columns ${s} and ${s + 1}, ${dy} off the row`);
      pairs++;
    }
  }
  assert.ok(pairs >= 90, `${pairs} ties`);
});
