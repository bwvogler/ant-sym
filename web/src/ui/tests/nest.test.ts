import { test } from "node:test";
import assert from "node:assert/strict";
import { Colony } from "../../colony/colony.ts";
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
