import { test } from "node:test";
import assert from "node:assert/strict";
import { Colony, CURTAIN, PLANE, Game, gameRng, CELL, cellOf, generateOneWorld, mulberry32 } from "../../colony/index.ts";
import { nestView } from "../nest.ts";

test("the nest: its own chambers only, the royal one with the queen in it, below the ground line", () => {
  // On the curtain of a small one world (S2.3c).
  const w = generateOneWorld(2, { plane: { size: { w: 160, h: 100 } } });
  const map = w.curtain;
  const at = { plane: w.plane, line: w.line };
  const a = new Colony(map, { antCount: 40, nest: 0 }, mulberry32(1), undefined, at);
  const b = new Colony(map, { antCount: 40, nest: 1 }, mulberry32(2), undefined, at);
  for (let t = 0; t < 300; t++) {
    a.tick(1 / 10);
    b.tick(1 / 10);
  }
  for (const [col, k] of [
    [a, 0],
    [b, 1],
  ] as const) {
    const v = nestView(col)!;
    assert.ok(v.chambers.length >= 1);
    const ids = new Set(map.chambers!.list.filter((c) => c.colony === k).map((c) => c.id));
    assert.ok(
      v.chambers.every((c) => ids.has(c.id)),
      "only its own colony's chambers",
    );
    const royal = v.chambers.find((c) => c.role === "royal")!;
    assert.ok(royal.queen, "the queen is in the royal chamber");
    assert.equal(v.chambers.filter((c) => c.queen).length, 1);
    assert.equal(v.queen, "alive");
    assert.ok(
      v.chambers.every((c) => c.depth > 0),
      "every chamber lies under the ground line",
    );
    for (let i = 1; i < v.chambers.length; i++) assert.ok(v.chambers[i]!.depth >= v.chambers[i - 1]!.depth, "shallowest first");
    const inChambers = v.chambers.reduce((s, c) => s + c.ants, 0);
    assert.ok(inChambers <= col.population);
    assert.deepEqual(v.brood, col.brood.counts());
  }
});

test("one world's nest: an ant on the plane over a chamber is not in it; only the curtain's ants count", () => {
  const g = new Game(generateOneWorld(7, { plane: { size: { w: 160, h: 100 } } }), {}, gameRng(7), [{ antCount: 30 }, { antCount: 30 }]);
  const col = g.colonies[0]!;
  const before = nestView(col)!;
  const royal = before.chambers.find((c) => c.role === "royal")!;
  const inRoyal = royal.ants;
  // Every ant starts underground, most in the royal chamber. One of them onto the plane at the chamber's own coordinates
  // (the plane is another map: above ground, not in it).
  let a = -1;
  for (let i = 0; i < col.n && a < 0; i++) if (col.alive[i] && col.layer[i] === CURTAIN && cellIn(col, i) === royal.id) a = i;
  assert.ok(a >= 0 && inRoyal > 1);
  col.putAnt(a, PLANE, royal.x, royal.y);
  const after = nestView(col)!.chambers.find((c) => c.id === royal.id)!;
  assert.equal(after.ants, inRoyal - 1, "the plane ant over the chamber isn't in it");
});

/** The chamber ant i stands in, on the colony's home map. */
function cellIn(col: Colony, i: number): number {
  cellOf(col.x[i]!, col.y[i]!);
  return col.map.chambers!.at(CELL[0]!, CELL[1]!);
}
