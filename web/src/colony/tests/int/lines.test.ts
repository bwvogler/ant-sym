import assert from "node:assert/strict";
import { test } from "node:test";
import { cellKey, cellOf, CELL, centreX, centreY } from "../../hex.ts";
import { EndlessPlane, holeLine, LINE_CLEARANCE, LINE_MARGIN, pointGap } from "../../endlessPlane.ts";
import { applyFounding, canFoundIn, type Line, lineSalt, NEW_LINE_GAP, nearestValidIn, oneHoleLine, type Reserved } from "../../lines.ts";
import { CLEARANCE, type Cell, HOLE_GAP_2D, makeTransect, MARGIN, nearestValid } from "../../transect.ts";

// Many lines (docs/endless-world.md §5, PRD §66 E3.1): the founding rule over every line and every wild site.

const cellAt = (x: number, y: number): Cell => {
  cellOf(x, y);
  return { x: CELL[0]!, y: CELL[1]! };
};

/** A world: the start line through the two start nests, and the wild sites of the regions round the origin. */
function world(seed: number, regions = 3) {
  const plane = new EndlessPlane(seed);
  const [a, b] = plane.startNests();
  const start: Line = { transect: makeTransect([cellAt(a.x, a.y), cellAt(b.x, b.y)]), salt: 0 };
  const sites: Reserved[] = [];
  for (let ry = -regions; ry <= regions; ry++)
    for (let rx = -regions; rx <= regions; rx++) {
      const s = plane.site(rx, ry);
      if (s) sites.push(s);
    }
  const open = (x: number, y: number) => !plane.isRock(x, y);
  return { plane, start, sites, open };
}

const hole = (l: Line, k = 0) => l.transect.holes[k]!;
const world2 = (c: Cell) => ({ x: centreX(c.x, c.y), y: centreY(c.y) });

/** A tiny deterministic stream. */
function stream(seed: number) {
  let s = seed;
  return () => {
    s = (Math.imul(s, 1103515245) + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

test("the constants agree: the line margin and clearance are the transect's, the unit is 140", () => {
  assert.equal(LINE_MARGIN, MARGIN);
  assert.equal(LINE_CLEARANCE, CLEARANCE);
  assert.equal(NEW_LINE_GAP, 140);
});

test("salts: the first line's is 0, every other line's is non-zero, and two lines' differ", () => {
  assert.equal(lineSalt(1, { x: 5, y: 5 }, true), 0);
  const salts = new Set<number>();
  for (let i = 0; i < 50; i++) {
    const s = lineSalt(1, { x: i * 17, y: i * 5 - 90 }, false);
    assert.notEqual(s, 0);
    salts.add(s);
  }
  assert.equal(salts.size, 50);
  assert.equal(lineSalt(1, { x: 3, y: 4 }, false), lineSalt(1, { x: 3, y: 4 }, false), "fixed for the line's life");
});

test("a one-hole line's margins run along its heading, and a default one is west and east as before", () => {
  const h = { x: 200, y: 200 };
  const t = makeTransect([h], { heading: Math.PI / 2 });
  const first = t.cells.slice(0, 2);
  const last = t.cells.slice(t.cells.length - 2);
  assert.ok(Math.abs(centreX(first[0]!, first[1]!) - centreX(h.x, h.y)) < 3 && centreY(first[1]!) !== centreY(h.y), "a vertical line");
  assert.notEqual(first[1], last[1]);
  const west = makeTransect([h]);
  assert.ok(west.cells[0]! < h.x && west.cells[west.cells.length - 2]! > h.x, "no heading: west at the start, east at the end");
  assert.deepEqual(makeTransect([h], { heading: undefined }).cells, west.cells);
});

test("a point far from every hole and site, on open ground, starts a new line along the given heading", () => {
  const { start, sites, open } = world(1);
  const far = cellAt(-1700, 900);
  assert.ok(open(far.x, far.y));
  const f = canFoundIn([start], sites, far, open, 0.7);
  assert.deepEqual(f, { ok: true, kind: "new", heading: 0.7 });
});

test("a point within a unit of a wild site is refused, whichever rule would have taken it", () => {
  const { start, sites, open } = world(1);
  assert.ok(sites.length > 5);
  let tried = 0;
  for (const s of sites.slice(0, 8)) {
    for (const [dx, dy] of [
      [0, 0],
      [60, 0],
      [-100, 30],
      [0, 130],
    ] as const) {
      const p = cellAt(s.x + dx, s.y + dy);
      if (!open(p.x, p.y)) continue;
      tried++;
      const f = canFoundIn([start], sites, p, open, 0);
      assert.deepEqual(f, { ok: false, reason: "site" }, `near site ${s.x.toFixed(0)},${s.y.toFixed(0)} +${dx},${dy}`);
    }
  }
  assert.ok(tried > 10);
});

test("near an end of a line it grows that line, at the end the point lies beyond", () => {
  const { start, sites, open } = world(2);
  const v0 = hole(start, 0);
  const v1 = hole(start, 1);
  let grew = 0;
  for (const [h, name] of [
    [v0, "start"],
    [v1, "end"],
  ] as const) {
    const other = h === v0 ? v1 : v0;
    const dx = world2(h).x - world2(other).x;
    const dy = world2(h).y - world2(other).y;
    const len = Math.hypot(dx, dy);
    for (const d of [40, 55, 70]) {
      const p = cellAt(world2(h).x + (dx / len) * d, world2(h).y + (dy / len) * d);
      if (!open(p.x, p.y)) continue;
      const f = canFoundIn([start], sites, p, open, 0);
      if (f.ok && f.kind === "grow") {
        assert.equal(f.line, 0);
        assert.equal(f.end, name);
        grew++;
      } else assert.ok(!f.ok || f.kind !== "new", "never a new line this near a hole");
    }
  }
  assert.ok(grew >= 2, `${grew} foundings grew an end`);
});

test("a line of one hole grows from either side of its hole", () => {
  const { sites, open, plane } = world(3);
  // an open spot far from the start nests and every site, with open ground 45 each side of it
  let base = cellAt(2400, 2400);
  for (let i = 0; i < 400; i++) {
    base = cellAt(2400 + i * 7, 2400 + i * 3);
    const c = world2(base);
    if ([-45, 0, 45].every((dx) => open(cellAt(c.x + dx, c.y).x, cellAt(c.x + dx, c.y).y))) break;
  }
  assert.equal(plane.isRock(base.x, base.y), false);
  const line = oneHoleLine(3, base, 0.3);
  assert.equal(line.transect.holes.length, 1);
  let sides = 0;
  for (const dx of [-45, 45]) {
    const p = cellAt(world2(base).x + dx, world2(base).y);
    if (!open(p.x, p.y)) continue;
    const f = canFoundIn([line], sites, p, open, 0);
    assert.ok(f.ok && f.kind === "grow" && f.line === 0, `landing ${dx} from the hole`);
    sides++;
    const grown = applyFounding(3, [line], p, f as never)[0]!;
    assert.equal(grown.transect.holes.length, 2);
    assert.equal(grown.salt, line.salt, "a line keeps its salt as it grows");
  }
  assert.equal(sides, 2, "both sides were open ground");
});

test("holes keep the hole gap: a point crowding a hole is refused for that", () => {
  const { start, sites, open } = world(1);
  const h = world2(hole(start, 1));
  const p = cellAt(h.x + 8, h.y);
  const f = canFoundIn([start], sites, p, open, 0);
  assert.equal(f.ok, false);
  if (!f.ok) assert.equal(f.reason, "hole-gap");
  assert.ok(HOLE_GAP_2D > 8);
});

test("random foundings: no plane cell lies over two lines or on a site's line, a new line is far from every hole, no hole is within a unit of a site", () => {
  for (const seed of [1, 4]) {
    const { start, sites, open } = world(seed);
    const r = stream(seed * 977);
    let lines: Line[] = [start];
    let news = 0;
    let grows = 0;
    for (let n = 0; n < 160; n++) {
      // mostly near the holes (to grow), some far (to start lines)
      const anchor = lines[Math.floor(r() * lines.length)]!;
      const h = world2(hole(anchor, Math.floor(r() * anchor.transect.holes.length)));
      const reach = r() < 0.5 ? 90 : 700;
      const p = cellAt(h.x + (r() * 2 - 1) * reach, h.y + (r() * 2 - 1) * reach);
      if (!open(p.x, p.y)) continue;
      const heading = r() * Math.PI;
      const f = canFoundIn(lines, sites, p, open, heading);
      if (!f.ok) continue;
      const here = world2(p);
      for (const s of sites) assert.ok(Math.hypot(s.x - here.x, s.y - here.y) > NEW_LINE_GAP, "no founding within a unit of a site");
      if (f.kind === "new") {
        news++;
        for (const l of lines)
          for (const v of l.transect.holes)
            assert.ok(Math.hypot(world2(v).x - here.x, world2(v).y - here.y) > NEW_LINE_GAP, "a new line is far from every hole");
      } else grows++;
      lines = applyFounding(seed, lines, p, f);
      // no plane cell over two curtains, and every line keeps off every site's reserved line
      const seen = new Map<number, number>();
      lines.forEach((l, i) => {
        const own = new Set<number>();
        for (let j = 0; j < l.transect.cells.length; j += 2) own.add(cellKey(l.transect.cells[j]!, l.transect.cells[j + 1]!));
        for (const k of own) {
          assert.equal(seen.get(k) ?? i, i, `a plane cell is over lines ${seen.get(k)} and ${i}`);
          seen.set(k, i);
        }
        for (let j = 0; j < l.transect.cells.length; j += 2)
          for (const s of sites)
            assert.ok(
              pointGap(
                centreX(l.transect.cells[j]!, l.transect.cells[j + 1]!),
                centreY(l.transect.cells[j + 1]!),
                holeLine(s.x, s.y, s.heading),
              ) >= CLEARANCE,
              "a line comes within the clearance of a site's reserved line",
            );
      });
    }
    assert.ok(news >= 3 && grows >= 3, `seed ${seed}: ${news} new lines, ${grows} grown`);
    assert.ok(lines.length >= 4, `seed ${seed}: ${lines.length} lines`);
  }
});

test("two lines' salts differ across a game's lines, whichever order they were founded in", () => {
  const { start, sites, open } = world(1);
  const r = stream(5);
  let lines: Line[] = [start];
  for (let n = 0; n < 80; n++) {
    const p = cellAt((r() * 2 - 1) * 1600, (r() * 2 - 1) * 1600);
    if (!open(p.x, p.y)) continue;
    const f = canFoundIn(lines, sites, p, open, r() * Math.PI);
    if (f.ok) lines = applyFounding(1, lines, p, f);
  }
  const salts = lines.map((l) => l.salt);
  assert.equal(new Set(salts).size, salts.length);
  assert.equal(salts[0], 0);
  assert.ok(lines.length >= 3);
});

test("nearestValidIn moves a crowded point to the nearest cell where the rule holds, within the radius, and finds none where none is", () => {
  const { start, sites, open } = world(1);
  const h = world2(hole(start, 1));
  const p = cellAt(h.x + 6, h.y);
  const got = nearestValidIn([start], sites, p, 40, open, 0);
  assert.ok(got, "a cell within 40 of a crowded point");
  assert.ok(Math.hypot(world2(got.cell).x - world2(p).x, world2(got.cell).y - world2(p).y) <= 40);
  assert.ok(Math.hypot(world2(got.cell).x - h.x, world2(got.cell).y - h.y) >= HOLE_GAP_2D);
  const a = nearestValidIn([start], sites, p, 40, open, 0);
  assert.deepEqual(a, got, "the same every time");
  assert.equal(
    nearestValidIn([start], sites, p, 40, () => false, 0),
    null,
    "nowhere to land",
  );
});

test("growing an end is refused where the grown line's margin would come within the clearance of another line", () => {
  // A: two holes, running east. B: a vertical one-hole line 130 past A's end. A point 62 beyond A's end is nearer A (62) than B (68), and its
  // margin would reach 4 from B's line.
  const a: Line = {
    transect: makeTransect([
      { x: 0, y: 100 },
      { x: 60, y: 100 },
    ]),
    salt: 0,
  };
  const b = oneHoleLine(1, { x: 190, y: 100 }, Math.PI / 2);
  const p = { x: 122, y: 100 };
  const f = canFoundIn([a, b], [], p, () => true, 0);
  assert.deepEqual(f, { ok: false, reason: "line-clearance" });
  // with B moved well away the same point grows A
  const c = oneHoleLine(1, { x: 400, y: 100 }, Math.PI / 2);
  assert.deepEqual(
    canFoundIn([a, c], [], p, () => true, 0),
    { ok: true, kind: "grow", line: 0, end: "end" },
  );
});

test("a new line is refused where its margins would come within the clearance of another line's tiles, even far from every hole", () => {
  // A: holes 300 apart. A point beside the middle of its segment is 158 from either hole, but a vertical new line there would cross it.
  const a: Line = {
    transect: makeTransect([
      { x: 0, y: 100 },
      { x: 300, y: 100 },
    ]),
    salt: 0,
  };
  const mid = { x: 150, y: 100 + 58 };
  const f = canFoundIn([a], [], mid, () => true, Math.PI / 2);
  assert.ok(!(f.ok && f.kind === "new"), "no new line across A");
  // the same point with a heading along A's own run keeps the clearance only if the line stays 12 off: a horizontal line 50 above A does not cross, but
  // its tiles come within 12 of nothing here (A is 50 below), so it may start
  const along = canFoundIn([a], [], mid, () => true, 0);
  assert.deepEqual(along, { ok: true, kind: "new", heading: 0 });
});

test("a new line needs open ground: a far point on rock is refused for the ground, not given a line", () => {
  const { start, sites } = world(1);
  const far = cellAt(-1700, 900);
  assert.deepEqual(
    canFoundIn([start], sites, far, () => false, 0.7),
    { ok: false, reason: "ground" },
  );
});

test("a tie between two lines' holes goes to the lower line index, in either order, by exact distance", () => {
  const l0 = oneHoleLine(1, { x: 0, y: 100 }, Math.PI / 2);
  const l1 = oneHoleLine(1, { x: 200, y: 100 }, Math.PI / 2);
  const p = { x: 100, y: 100 };
  const a = canFoundIn([l0, l1], [], p, () => true, 0);
  assert.ok(a.ok && a.kind === "grow" && a.line === 0, JSON.stringify(a));
  const b = canFoundIn([l1, l0], [], p, () => true, 0);
  assert.ok(b.ok && b.kind === "grow" && b.line === 0, "the lower index wins whichever line it is");
});

test("a growing line is refused across a wild site: a far point whose new line fails the clearance falls to rule 2, and the grown line keeps off the site's line", () => {
  // A: one hole. B: a long line. A site between A and p. p is 300 from A's hole, 150 from the site; a vertical new line at p would come within the
  // clearance of B, so the point falls to rule 2, where A would grow 300 cells straight through the site's hole.
  const a = oneHoleLine(1, { x: 0, y: 100 }, 0);
  const b: Line = {
    transect: makeTransect([
      { x: -400, y: 173 },
      { x: 700, y: 173 },
    ]),
    salt: 0,
  };
  const site = { x: 150, y: centreY(100), heading: 0 };
  const p = { x: 300, y: 100 };
  assert.deepEqual(
    canFoundIn([a, b], [site], p, () => true, Math.PI / 2),
    { ok: false, reason: "line-clearance" },
  );
  const noSite = canFoundIn([a, b], [], p, () => true, Math.PI / 2);
  assert.ok(noSite.ok && noSite.kind === "grow", "without the site the line would grow through where it stands");
});

test("a far point that fails only the clearance is not given a new line: it falls to the growing rule, never refused for being far", () => {
  const a = oneHoleLine(1, { x: 0, y: 100 }, 0);
  const b: Line = {
    transect: makeTransect([
      { x: -400, y: 173 },
      { x: 700, y: 173 },
    ]),
    salt: 0,
  };
  const f = canFoundIn([a, b], [], { x: 300, y: 100 }, () => true, Math.PI / 2);
  assert.ok(f.ok && f.kind === "grow" && f.line === 0, JSON.stringify(f));
});

test("nearestValidIn lands where transect.ts nearestValid does on one line: the same cell at every crowded point, ties included", () => {
  const { start, open } = world(1);
  const r = stream(11);
  let moved = 0;
  for (let n = 0; n < 120; n++) {
    const h = world2(hole(start, r() < 0.5 ? 0 : 1));
    // points on or near a hole, where distance ties between landings are common
    const p = cellAt(h.x + Math.round((r() * 2 - 1) * 12), h.y + Math.round((r() * 2 - 1) * 12));
    const want = nearestValid(start.transect, p, 60, open);
    const got = nearestValidIn([start], [], p, 60, open, 0);
    assert.deepEqual(got?.cell ?? null, want?.cell ?? null, `crowded point ${p.x},${p.y}`);
    if (want && (want.cell.x !== p.x || want.cell.y !== p.y)) moved++;
  }
  assert.ok(moved > 30, `${moved} points were moved`);
});
