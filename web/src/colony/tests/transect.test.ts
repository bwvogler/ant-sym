import { test } from "node:test";
import assert from "node:assert/strict";
import { CELL, centreX, centreY, hexDistance } from "../hex.ts";
import { NEST_GAP } from "../game.ts";
import { canFound, cellAt, columnsOver, grow, HOLE_GAP_2D, makeTransect, MARGIN, nearestValid, type Cell, type Transect } from "../transect.ts";
import { mulberry32 } from "../world.ts";

const open = () => true;
const at = (t: Transect, s: number): [number, number] => {
  assert.ok(cellAt(t, s), `column ${s} is on the line`);
  return [CELL[0]!, CELL[1]!];
};
// Two holes 100 apart on one even row: Ink at V₀, Amber at V₁ (one-world §3: the game starts with one segment).
const A = { x: 100, y: 100 };
const B = { x: 200, y: 100 };

test("two holes east–west: one column per step, V₀ at s = 0, a straight margin of 64 past each end", () => {
  const t = makeTransect([A, B]);
  assert.deepEqual(t.sHole, [0, 100]);
  assert.equal(t.sMin, -MARGIN);
  assert.equal(t.sMax, 100 + MARGIN);
  for (let s = t.sMin; s <= t.sMax; s++) assert.deepEqual(at(t, s), [100 + s, 100]);
  assert.equal(cellAt(t, t.sMin - 1), false);
  assert.equal(cellAt(t, t.sMax + 1), false);
  assert.equal(cellAt(t, 0.5), false);
  assert.deepEqual(columnsOver(t, 150, 100), [50]);
  assert.deepEqual(columnsOver(t, 150, 101), []);
});

test("a slanted segment is hexDistance columns long: never shorter than the surface, at most ~15% longer", () => {
  for (const b of [{ x: 140, y: 160 }, { x: 160, y: 30 }, { x: 70, y: 180 }, { x: 100, y: 200 }]) {
    const t = makeTransect([A, b]);
    const steps = hexDistance(A.x, A.y, b.x, b.y);
    assert.equal(t.sHole[1], steps);
    const len = Math.hypot(centreX(b.x, b.y) - centreX(A.x, A.y), centreY(b.y) - centreY(A.y));
    assert.ok(steps >= len - 1e-9 && steps <= len * (2 / Math.sqrt(3)) + 1, `${steps} steps for ${len.toFixed(1)}`);
    assert.deepEqual(at(t, steps), [b.x, b.y]);
    assert.deepEqual(columnsOver(t, A.x, A.y), [0]);
  }
});

test("growing at V₀ takes negative s: every column between the old V₀ and the far end keeps its cell", () => {
  const t = makeTransect([A, B]);
  const p = { x: 30, y: 140 };
  assert.deepEqual(canFound(t, p, open), { ok: true, end: "start" });
  const g = grow(t, "start", p);
  assert.equal(g.sHole[0], -hexDistance(p.x, p.y, A.x, A.y));
  assert.deepEqual(g.sHole.slice(1), [0, 100]);
  for (let s = 0; s <= t.sMax; s++) assert.deepEqual(at(g, s), at(t, s), `column ${s}`);
  // The old V₀ margin is gone: its columns now run along the new segment.
  assert.notDeepEqual(at(g, -20), at(t, -20));
  const e = grow(t, "end", { x: 300, y: 60 });
  assert.equal(e.sHole[0], 0);
  for (let s = t.sMin; s <= 100; s++) assert.deepEqual(at(e, s), at(t, s), `column ${s}`);
});

test("rule 1: the nearest hole must be an end; a tie with an interior hole is refused, a tie between the ends grows V₀", () => {
  const t = makeTransect([A, B, { x: 300, y: 100 }]);
  assert.deepEqual(canFound(t, { x: 200, y: 160 }, open), { ok: false, reason: "interior" });
  // As near B (interior) as C (an end): refused.
  assert.deepEqual(canFound(t, { x: 250, y: 160 }, open), { ok: false, reason: "interior" });
  // Two holes: a point as near both ends grows at V₀ (here 117.6° from straight on, inside the 120° limit).
  const two = makeTransect([A, B]);
  assert.deepEqual(canFound(two, { x: 150, y: 210 }, open), { ok: true, end: "start" });
  assert.deepEqual(canFound(two, { x: 260, y: 100 }, open), { ok: true, end: "end" });
  assert.deepEqual(canFound(two, { x: 40, y: 100 }, open), { ok: true, end: "start" });
});

test("rule 1's ties are exact on every row: equal distances in floating point are compared as whole numbers (PR #55 review)", () => {
  // B and C equally far from p, 20 rows above and below it: Math.hypot of the centres differs in its last bit on some rows.
  for (let y0 = 0; y0 < 200; y0++) {
    const t = makeTransect([{ x: 100, y: y0 }, { x: 100, y: y0 + 40 }, { x: 100, y: y0 + 80 }]);
    assert.deepEqual(canFound(t, { x: 140, y: y0 + 60 }, open), { ok: false, reason: "interior" }, `y0 = ${y0}`);
  }
  // And the ends: a point as far from Ink as from Amber grows at V₀ on every row.
  for (let y0 = 0; y0 < 200; y0++) {
    const t = makeTransect([{ x: 100, y: y0 }, { x: 100, y: y0 + 40 }]);
    const f = canFound(t, { x: 180, y: y0 + 20 }, open);
    assert.ok(!f.ok || f.end === "start", `y0 = ${y0}: a tie between the ends grows at V₀`);
  }
});

test("rule 2, the turn: at most 120° back on the end segment", () => {
  const t = makeTransect([A, B]);
  // Measured from B, straight on is east. A spot 140° round is refused; one 110° round is allowed.
  const spot = (deg: number, d = 40): Cell => {
    const a = (deg * Math.PI) / 180;
    const y = Math.round((centreY(B.y) + d * Math.sin(a)) / (Math.sqrt(3) / 2) - 0.5);
    return { x: Math.round(centreX(B.x, B.y) + d * Math.cos(a) - 0.5 - 0.5 * (y & 1)), y };
  };
  assert.deepEqual(canFound(t, spot(140), open), { ok: false, reason: "turn" });
  assert.deepEqual(canFound(t, spot(-140), open), { ok: false, reason: "turn" });
  assert.deepEqual(canFound(t, spot(110), open), { ok: true, end: "end" });
  assert.deepEqual(canFound(t, spot(-110), open), { ok: true, end: "end" });
});

test("rule 2, crossing and clearance: the new segment and its margin keep clear of the line, the far end's margin included", () => {
  // An L: Ink, Amber, then a third hole straight up from Amber; the line grows at the third.
  const C = { x: 200, y: 40 };
  const long = makeTransect([A, B, C], { margin: 200 });
  // About 15° below due west from C: well inside the turn limit (105°), but with a 200-cell margin the line runs on across
  // the margin west of Ink.
  assert.deepEqual(canFound(long, { x: 161, y: 52 }, open), { ok: false, reason: "crosses" });
  // About 10° below west: it never crosses, but its margin ends within 12 of Ink's.
  assert.deepEqual(canFound(long, { x: 161, y: 48 }, open), { ok: false, reason: "clearance" });
  // With the usual 64-cell margin, both stop short of Ink's margin.
  const t = makeTransect([A, B, C]);
  assert.deepEqual(canFound(t, { x: 161, y: 52 }, open), { ok: true, end: "end" });
  assert.deepEqual(canFound(t, { x: 161, y: 48 }, open), { ok: true, end: "end" });
});

test("rules 3 and 4: a hole gap from every hole, on open ground", () => {
  const t = makeTransect([A, B]);
  assert.deepEqual(canFound(t, { x: 208, y: 100 }, open), { ok: false, reason: "hole-gap" });
  assert.deepEqual(canFound(t, { x: 212, y: 100 }, open), { ok: true, end: "end" });
  assert.deepEqual(canFound(t, B, open), { ok: false, reason: "hole-gap" });
  // Behind Amber, on the line: refused for crowding the hole, the reason a player should read, not for the turn.
  assert.deepEqual(canFound(t, { x: 195, y: 100 }, open), { ok: false, reason: "hole-gap" });
  const rock = (x: number, y: number) => !(x === 260 && y === 100);
  assert.deepEqual(canFound(t, { x: 260, y: 100 }, rock), { ok: false, reason: "ground" });
});

test("one hole: no line to fold back on yet, so any open spot a hole gap away grows at V₀", () => {
  const t = makeTransect([A]);
  assert.deepEqual([t.sMin, t.sMax], [-MARGIN, MARGIN]);
  for (const p of [{ x: 160, y: 100 }, { x: 40, y: 100 }, { x: 100, y: 30 }]) assert.deepEqual(canFound(t, p, open), { ok: true, end: "start" });
  assert.deepEqual(canFound(t, { x: 105, y: 100 }, open), { ok: false, reason: "hole-gap" });
  // Its first founding re-aims both margins straight on from the new segment: a lone hole has no direction yet.
  const g = grow(t, "start", { x: 100, y: 30 });
  assert.equal(g.sHole[1], 0);
  assert.deepEqual(at(g, 10), [100, 110], "past the old hole, the line runs on away from the new one");
  assert.throws(() => makeTransect([A, A]), /same cell/);
  assert.throws(() => grow(makeTransect([A, B]), "end", B), /same cell/);
  assert.throws(() => makeTransect([A, B], { margin: 2.5 }), /margin/);
  assert.throws(() => makeTransect([A, B], { margin: -1 }), /margin/);
  assert.throws(() => makeTransect([A, B], { s0: 0.5 }), /s0/);
});

test("one gap for one world: HOLE_GAP_2D is game.ts's NEST_GAP", () => {
  assert.equal(HOLE_GAP_2D, NEST_GAP);
});

test("nearestValid: the nearest allowed cell within the radius, or null when there is none", () => {
  const t = makeTransect([A, B]);
  // Too near Amber: moved out to the hole gap, straight on.
  const r = nearestValid(t, { x: 204, y: 100 }, 20, open);
  assert.ok(r);
  assert.equal(r.end, "end");
  assert.ok(Math.hypot(centreX(r.cell.x, r.cell.y) - centreX(B.x, B.y), centreY(r.cell.y) - centreY(B.y)) >= 12);
  assert.ok(Math.hypot(centreX(r.cell.x, r.cell.y) - centreX(204, 100), centreY(r.cell.y) - centreY(100)) <= 8.5);
  assert.deepEqual(nearestValid(t, { x: 204, y: 100 }, 20, open), r, "the same answer every time");
  // Midway along the line: nothing within 10 cells is allowed (it is nearest an end only by turning back over the line).
  assert.equal(nearestValid(t, { x: 150, y: 100 }, 10, open), null);
  // The radius is round: a cell 65.8 straight down, 76 steps away (a hexagon of 70 steps reaches only ~60.6 that way),
  // is found; a cell 71 due east, where 70 steps do reach 70, is not (PR #55 review).
  const only = (c: Cell) => (x: number, y: number) => x === c.x && y === c.y;
  const far = { x: 300, y: 76 };
  const d = Math.hypot(centreX(far.x, far.y) - centreX(300, 0), centreY(far.y) - centreY(0));
  assert.ok(d > 61 && d < 70 && hexDistance(300, 0, far.x, far.y) > 70, `${d}`);
  const line = makeTransect([{ x: 100, y: 0 }, { x: 200, y: 0 }]);
  assert.deepEqual(nearestValid(line, { x: 300, y: 0 }, 70, only(far))?.cell, far);
  assert.equal(nearestValid(line, { x: 300, y: 0 }, 70, only({ x: 371, y: 0 })), null);
  assert.deepEqual(nearestValid(line, { x: 300, y: 0 }, 71, only({ x: 371, y: 0 }))?.cell, { x: 371, y: 0 });
  // Nowhere open: the flight fails.
  assert.equal(nearestValid(t, { x: 260, y: 100 }, 10, () => false), null);
});

/** A random line: two holes, then up to `n` foundings, each at the nearest valid spot to a random point beyond an end. */
function randomLine(seed: number, n: number): Transect {
  const rng = mulberry32(seed);
  const a = { x: Math.floor(rng() * 400), y: Math.floor(rng() * 400) };
  const ang = rng() * 2 * Math.PI;
  const d = 40 + rng() * 160;
  const b = { x: Math.round(a.x + d * Math.cos(ang)), y: Math.round(a.y + d * Math.sin(ang)) };
  let t = makeTransect([a, b]);
  for (let i = 0; i < n; i++) {
    const v = rng() < 0.5 ? t.holes[0]! : t.holes[t.holes.length - 1]!;
    const g = rng() * 2 * Math.PI;
    const r = 20 + rng() * 140;
    const p = { x: Math.round(v.x + r * Math.cos(g)), y: Math.round(v.y + r * Math.sin(g)) };
    const f = nearestValid(t, p, 12, open);
    if (!f) continue;
    const before = t;
    t = grow(t, f.end, f.cell);
    // Growing renumbers nothing: the columns between the two outer holes keep their cells.
    const lo = f.end === "start" ? before.sHole[0]! : before.sMin;
    const hi = f.end === "start" ? before.sMax : before.sHole[before.sHole.length - 1]!;
    for (let s = lo; s <= hi; s++) {
      assert.ok(cellAt(before, s));
      const was = [CELL[0], CELL[1]];
      assert.ok(cellAt(t, s));
      assert.deepEqual([CELL[0], CELL[1]], was, `seed ${seed}: column ${s} moved when the line grew`);
    }
  }
  return t;
}

test("property: over random lines, neighbouring columns lie over the same or neighbouring cells", () => {
  for (let seed = 1; seed <= 120; seed++) {
    const t = randomLine(seed, 6);
    let [px, py] = at(t, t.sMin);
    for (let s = t.sMin + 1; s <= t.sMax; s++) {
      const [x, y] = at(t, s);
      assert.ok(hexDistance(px, py, x, y) <= 1, `seed ${seed}: columns ${s - 1} and ${s} are ${hexDistance(px, py, x, y)} apart`);
      [px, py] = [x, y];
    }
  }
});

test("property: no valid founding makes the curtain overlap itself (a cell over two columns only right at a bend)", () => {
  let lines = 0;
  for (let seed = 1; seed <= 120; seed++) {
    const t = randomLine(seed, 6);
    if (t.holes.length > 2) lines++;
    const seen = new Map<number, number[]>();
    for (let s = t.sMin; s <= t.sMax; s++) {
      const [x, y] = at(t, s);
      const key = y * 100000 + x;
      const cols = seen.get(key) ?? [];
      cols.push(s);
      seen.set(key, cols);
    }
    for (const cols of seen.values()) {
      if (cols.length < 2) continue;
      const lo = Math.min(...cols);
      const hi = Math.max(...cols);
      // Measured on 600 random lines (PR #55 review): no cell sat over two columns at all; allow two either side of a bend.
      assert.ok(t.sHole.some((sv) => Math.abs(lo - sv) <= 2 && Math.abs(hi - sv) <= 2), `seed ${seed}: one cell over columns ${cols.join(", ")}, away from every bend`);
    }
  }
  assert.ok(lines >= 100, `most random lines grew (${lines} of 120)`);
});
