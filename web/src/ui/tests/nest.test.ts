import { test } from "node:test";
import assert from "node:assert/strict";
import { Colony, CURTAIN, PLANE } from "../../colony/colony.ts";
import { Game, gameRng } from "../../colony/game.ts";
import { CELL, cellOf } from "../../colony/hex.ts";
import { generateOneWorld } from "../../colony/oneWorld.ts";
import { generateSideWorld, generateWorld, mulberry32 } from "../../colony/world.ts";
import { nestView } from "../nest.ts";

const SMALL = { size: { w: 256, h: 160 }, nestGap: 120, surface: 40, nestCount: 2 };

test("a top-down map has no nest to show", () => {
  assert.equal(nestView(new Colony(generateWorld(1), { antCount: 10 }, mulberry32(1))), null);
});

test("the side view's nest: its own chambers only, the royal one with the queen in it, below the ground line", () => {
  const map = generateSideWorld(2, SMALL);
  const a = new Colony(map, { antCount: 40, nest: 0 }, mulberry32(1));
  const b = new Colony(map, { antCount: 40, nest: 1 }, mulberry32(2));
  for (let t = 0; t < 300; t++) {
    a.tick(1 / 10);
    b.tick(1 / 10);
  }
  for (const [col, k] of [[a, 0], [b, 1]] as const) {
    const v = nestView(col)!;
    assert.ok(v.chambers.length >= 1);
    const ids = new Set(map.chambers!.list.filter((c) => c.colony === k).map((c) => c.id));
    assert.ok(v.chambers.every((c) => ids.has(c.id)), "only its own colony's chambers");
    const royal = v.chambers.find((c) => c.role === "royal")!;
    assert.ok(royal.queen, "the queen is in the royal chamber");
    assert.equal(v.chambers.filter((c) => c.queen).length, 1);
    assert.equal(v.queen, "alive");
    assert.ok(v.chambers.every((c) => c.depth > 0), "every chamber lies under the ground line");
    for (let i = 1; i < v.chambers.length; i++) assert.ok(v.chambers[i]!.depth >= v.chambers[i - 1]!.depth, "shallowest first");
    const inChambers = v.chambers.reduce((s, c) => s + c.ants, 0);
    assert.ok(inChambers <= col.population);
    assert.deepEqual(v.brood, col.brood.counts());
  }
});

test("one world's nest: an ant on the plane over a chamber is not in it; only the curtain's ants count", () => {
  const g = new Game(generateOneWorld(7, { plane: { size: { w: 160, h: 100 } } }), { antCount: 30, rivalAnts: 30 }, gameRng(7));
  const col = g.player;
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
