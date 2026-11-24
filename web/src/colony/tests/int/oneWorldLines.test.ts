import assert from "node:assert/strict";
import { test } from "node:test";
import { Game } from "../../game.ts";
import { canFoundIn, nearestValidIn } from "../../lines.ts";
import { generateCurtain, generateOneWorld, growWorld } from "../../oneWorld.ts";
import { cellOf, CELL } from "../../hex.ts";
import { makeTransect, nearestValid } from "../../transect.ts";

// The world holds a list of lines (docs/endless-world.md §5, PRD §66 E3.2): one line until the endless world, `line` and `curtain` its views, and
// the founding rule asked through lines.ts with new lines off, so a game of one line settles exactly as transect.ts nearestValid says.

test("a world holds its lines: one, whose line and curtain are the first's, and growing replaces the line in place", () => {
  const w = generateOneWorld(1);
  assert.equal(w.lines.length, 1);
  assert.equal(w.lines[0]!.salt, 0, "the first line's salt keeps today's seeds");
  assert.equal(w.line, w.lines[0]!.line);
  assert.equal(w.curtain, w.lines[0]!.curtain);
  const before = w.line;
  const h = before.holes[before.holes.length - 1]!;
  const spot = nearestValid(before, { x: h.x + 60, y: h.y }, 40, () => true);
  assert.ok(spot);
  growWorld(w, spot.end, spot.cell);
  assert.notEqual(w.line, before, "the line grew");
  assert.equal(w.line, w.lines[0]!.line, "and the view follows");
  assert.equal(w.line.holes.length, 3);
  assert.equal(w.curtain, w.lines[0]!.curtain, "the curtain is the same map, wider");
});

test("growWorld names its line: a line that is not there is an error", () => {
  const w = generateOneWorld(1);
  const h = w.line.holes[0]!;
  assert.throws(() => growWorld(w, "start", { x: h.x - 40, y: h.y }, 1), /no line 1/);
});

test("Game.settleAt is the founding rule with new lines off: the cell transect.ts nearestValid gives, line 0, at every point tried", () => {
  const g = new Game(generateOneWorld(2));
  const ground = () => true;
  let moved = 0;
  let n = 0;
  for (const dx of [-300, -180, -90, -30, -8, -3, 0, 3, 8, 30, 90, 180, 300])
    for (const dy of [-120, -40, 0, 40, 120]) {
      const h = g.world.line.holes[dx < 0 ? 0 : g.world.line.holes.length - 1]!;
      const p = { x: h.x + dx, y: (h.y + dy) * 0.866 };
      cellOf(p.x, p.y);
      const cell = { x: CELL[0]!, y: CELL[1]! };
      const want = nearestValid(g.world.line, cell, 140, ground);
      const got = g.settleAt(p, ground);
      n++;
      if (want) {
        assert.ok(got.ok, `a spot at ${dx},${dy}`);
        if (got.ok) {
          assert.deepEqual(got.cell, want.cell);
          assert.equal(got.end, want.end);
          assert.equal(got.line, 0);
          if (want.cell.x !== cell.x || want.cell.y !== cell.y) moved++;
        }
      } else assert.equal(got.ok, false, `no spot at ${dx},${dy}`);
    }
  assert.ok(n === 65 && moved >= 4, `${moved} of ${n} were moved`);
});

test("with new lines off a far point is never given a line of its own: it grows an end or is refused; with them on it starts one", () => {
  const w = generateOneWorld(3);
  const lines = [{ transect: w.line, salt: 0 }];
  cellOf(-900, 500);
  const far = { x: CELL[0]!, y: CELL[1]! };
  const on = canFoundIn(lines, [], far, () => true, 0.5);
  assert.deepEqual(on, { ok: true, kind: "new", heading: 0.5 });
  const off = canFoundIn(lines, [], far, () => true, 0.5, { newLines: false });
  assert.ok(!(off.ok && off.kind === "new"), JSON.stringify(off));
  assert.equal(nearestValidIn(lines, [], far, 20, () => true, 0.5, { newLines: false })?.founding.kind, "grow");
  assert.equal(nearestValidIn(lines, [], far, 20, () => true, 0.5)?.founding.kind, "new");
});

test("settleAt equals nearestValid on a grown line of five holes with a patchy ground, interior ties included", () => {
  const g = new Game(generateOneWorld(2));
  // grow the line by hand to five holes
  for (const end of ["end", "start", "end"] as const) {
    const t = g.world.line;
    const v = end === "start" ? t.holes[0]! : t.holes[t.holes.length - 1]!;
    const sign = end === "start" ? -1 : 1;
    const s = nearestValid(t, { x: v.x + sign * 70, y: v.y }, 30, () => true);
    assert.ok(s);
    growWorld(g.world, s.end, s.cell);
  }
  assert.equal(g.world.line.holes.length, 5);
  // a ground that refuses a third of the cells, by a fixed hash
  const patchy = (x: number, y: number) => ((x * 73856093) ^ (y * 19349663)) % 3 !== 0;
  let compared = 0;
  let valid = 0;
  for (let i = 0; i < g.world.line.holes.length; i++) {
    const h = g.world.line.holes[i]!;
    for (const [dx, dy] of [
      [0, 0],
      [5, 3],
      [-9, 6],
      [20, -10],
      [-40, 30],
    ] as const) {
      const cell = { x: h.x + dx, y: h.y + dy };
      const want = nearestValid(g.world.line, cell, 140, patchy);
      const got = g.settleAt({ x: cell.x + 0.5 + 0.5 * (cell.y & 1), y: (cell.y + 0.5) * 0.866 }, patchy);
      compared++;
      if (want) {
        valid++;
        assert.ok(
          got.ok && got.cell.x === want.cell.x && got.cell.y === want.cell.y && got.end === want.end && got.line === 0,
          `hole ${i} +${dx},${dy}`,
        );
      } else assert.equal(got.ok, false);
    }
  }
  assert.ok(compared === 25 && valid > 10, `${valid} of ${compared} had a spot`);
});

test("growWorld grows the line it is told to and leaves the others alone", () => {
  const w = generateOneWorld(1);
  // a second line by hand (the endless world makes them; here only its growth is under test), far from the first
  const far = { x: w.line.holes[0]!.x + 1200, y: w.line.holes[0]!.y + 600 };
  const second = makeTransect([far]);
  w.lines.push({ line: second, curtain: generateCurtain(w.seed, second), salt: 7 });
  const firstBefore = w.lines[0]!.line;
  const spot = nearestValid(second, { x: far.x + 60, y: far.y }, 30, () => true);
  assert.ok(spot);
  growWorld(w, spot.end, spot.cell, 1);
  assert.equal(w.lines[0]!.line, firstBefore, "the first line is untouched");
  assert.equal(w.lines[1]!.line.holes.length, 2, "the second grew");
  assert.equal(w.lines[1]!.salt, 7, "and kept its salt");
  assert.equal(w.line, firstBefore, "the line view is still the first's");
});
