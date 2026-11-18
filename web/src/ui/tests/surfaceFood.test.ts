import { test } from "node:test";
import assert from "node:assert/strict";
import { cellKey, nx, ny } from "../../colony/index.ts";
import { LEAF_STEP, leafTiles, SurfaceLeaves } from "../surfaceFood.ts";

const keys = (tiles: ReturnType<typeof leafTiles>) =>
  new Set(tiles.map((t) => `${Math.round(t.x / LEAF_STEP)},${Math.round(t.y / LEAF_STEP)}`));

test("harvesting removes fixed pieces, keeps a final morsel, and empties at zero", () => {
  let previous = keys(leafTiles(10, 10, () => 12));
  for (const amount of [10, 8, 5, 2, 0.1, 0.001]) {
    const next = keys(leafTiles(10, 10, () => amount));
    assert.ok(next.size > 0);
    assert.ok(next.size <= previous.size);
    for (const key of next) assert.ok(previous.has(key), "remaining tissue never shifts or grows during harvest");
    previous = next;
  }
  assert.deepEqual(
    leafTiles(10, 10, () => 0),
    [],
  );
  assert.deepEqual(
    leafTiles(10, 10, () => NaN),
    [],
  );
});

test("full food cells join across all six hex directions, including negative columns", () => {
  for (const [x, y] of [
    [0, 10],
    [-10, 11],
  ])
    for (let d = 0; d < 6; d++) {
      const a = [x, y],
        b = [nx(x, y, d), ny(y, d)];
      const cells = new Set([cellKey(...(a as [number, number])), cellKey(...(b as [number, number]))]);
      const read = (x: number, y: number) => (cells.has(cellKey(x, y)) ? 12 : 0);
      const first = keys(leafTiles(x, y, read)),
        second = keys(leafTiles(b[0], b[1], read));
      assert.ok(
        [...first].some((key) => {
          const [a, b] = key.split(",").map(Number);
          return [
            [a - 1, b],
            [a + 1, b],
            [a, b - 1],
            [a, b + 1],
          ].some((p) => second.has(p.join(",")));
        }),
        `direction ${d} joins without a gap`,
      );
    }
});

test("a per-view cache invalidates for consumption and depleted neighbours, with no mutation", () => {
  const values = new Map([
    [cellKey(5, 5), 12],
    [cellKey(6, 5), 12],
  ]);
  const read = (x: number, y: number) => values.get(cellKey(x, y)) ?? 0;
  const cache = new SurfaceLeaves();
  const first = cache.get(5, 5, read);
  assert.equal(cache.get(5, 5, read), first);
  values.set(cellKey(5, 5), 5);
  const bitten = cache.get(5, 5, read);
  assert.notEqual(bitten, first);
  values.set(cellKey(6, 5), 0);
  assert.notEqual(cache.get(5, 5, read), bitten);
  assert.equal(values.get(cellKey(5, 5)), 5);
});
