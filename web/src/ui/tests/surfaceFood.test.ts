import { test } from "node:test";
import assert from "node:assert/strict";
import { cellKey, nx, ny } from "../../colony/index.ts";
import { LEAF_STEP, leafTiles, SurfaceLeaves, MapLeafSprites } from "../surfaceFood.ts";

const keys = (tiles: ReturnType<typeof leafTiles>) =>
  new Set(tiles.map((t) => `${Math.round(t.x / LEAF_STEP)},${Math.round(t.y / LEAF_STEP)}`));

test("aerial leaf bitmaps reuse unchanged tissue, preserve world scale, and refresh after harvest", () => {
  let allocated = 0;
  const context = new Proxy({}, { get: () => () => {} }) as CanvasRenderingContext2D;
  const sprites = new MapLeafSprites(() => {
    allocated++;
    return { width: 0, height: 0, getContext: () => context } as unknown as HTMLCanvasElement;
  });
  const draws: number[][] = [];
  const output = { drawImage: (_image: unknown, ...args: number[]) => draws.push(args) } as unknown as CanvasRenderingContext2D;
  const tissue = leafTiles(10, 10, () => 12);
  sprites.draw(output, tissue, 12, 0, 0);
  sprites.draw(output, tissue, 24, 10, 20);
  assert.equal(allocated, 1, "panning and zooming reuse the same raster");
  assert.equal(draws[1][2], draws[0][2] * 2);
  assert.equal(draws[1][3], draws[0][3] * 2);
  assert.equal(draws[1][0], draws[0][0] * 2 + 10);
  assert.equal(draws[1][1], draws[0][1] * 2 + 20);
  sprites.draw(
    output,
    leafTiles(10, 10, () => 5),
    12,
    0,
    0,
  );
  assert.equal(allocated, 2, "harvested tissue gets its own raster");
});

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

test("three contiguous full leaves have no enclosed ground holes at any hex junction", () => {
  for (const y of [10, 11])
    for (let d = 0; d < 6; d++) {
      const cells: [[number, number], [number, number], [number, number]] = [
        [0, y],
        [nx(0, y, d), ny(y, d)],
        [nx(0, y, (d + 1) % 6), ny(y, (d + 1) % 6)],
      ];
      const present = new Set(cells.map((c) => cellKey(...c)));
      const read = (x: number, y: number) => (present.has(cellKey(x, y)) ? 12 : 0);
      const tissue = keys(cells.flatMap((c) => leafTiles(...c, read)));
      const coords = [...tissue].map((k) => k.split(",").map(Number));
      const x0 = Math.min(...coords.map((p) => p[0])) - 1,
        x1 = Math.max(...coords.map((p) => p[0])) + 1;
      const y0 = Math.min(...coords.map((p) => p[1])) - 1,
        y1 = Math.max(...coords.map((p) => p[1])) + 1;
      const reached = new Set<string>(),
        queue = [[x0, y0]];
      for (let i = 0; i < queue.length; i++) {
        const [x, y] = queue[i],
          key = `${x},${y}`;
        if (x < x0 || x > x1 || y < y0 || y > y1 || tissue.has(key) || reached.has(key)) continue;
        reached.add(key);
        queue.push([x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]);
      }
      for (let x = x0; x <= x1; x++)
        for (let yy = y0; yy <= y1; yy++)
          assert.ok(tissue.has(`${x},${yy}`) || reached.has(`${x},${yy}`), `no trapped hole at ${x},${yy}, direction ${d}`);
    }
});

test("leaf tissue has an air gap, solid thickness and raised veins without internal seam walls", async () => {
  const { leafFaces, LEAF_BOTTOM, LEAF_TOP, LEAF_VEIN_TOP } = await import("../surfaceFood.ts");
  const tiles = [
    { x: 0, y: 0, vein: false },
    { x: LEAF_STEP, y: 0, vein: false },
  ];
  const faces = leafFaces(tiles);
  assert.ok(LEAF_BOTTOM > 0 && LEAF_TOP > LEAF_BOTTOM && LEAF_VEIN_TOP > LEAF_TOP);
  assert.ok(faces.every((f) => f.points.every((p) => p[2] >= LEAF_BOTTOM)));
  assert.ok(!faces.some((f) => f.points.every((p) => p[0] === LEAF_STEP) && new Set(f.points.map((p) => p[2])).size > 1));
  const ridge = leafFaces([
    { x: 0, y: 0, vein: true },
    { x: LEAF_STEP, y: 0, vein: false },
  ]);
  assert.ok(ridge.some((f) => f.points.every((p) => p[2] === LEAF_VEIN_TOP)));
  assert.ok(
    ridge.some(
      (f) =>
        f.points.every((p) => p[0] === LEAF_STEP) &&
        Math.min(...f.points.map((p) => p[2])) === LEAF_TOP &&
        Math.max(...f.points.map((p) => p[2])) === LEAF_VEIN_TOP,
    ),
  );
});
