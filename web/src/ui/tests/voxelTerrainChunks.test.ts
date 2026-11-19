import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { cadaverArtFixture } from "../inspectionArtFixture.ts";
import { buildGame } from "../useColony.ts";
import { SensedMap } from "../fungusSight.ts";
import { inspectViewport } from "../inspectionPatch.ts";
import { buildPatchTerrain, faceColour } from "../drawInspectionPatch.ts";
import { buildVoxelTerrainChunk, terrainChunkDescriptors, VoxelTerrainCache } from "../voxelTerrainChunks.ts";
import { PLANE, CURTAIN, centreX, centreY } from "../../colony/index.ts";

const game = buildGame({ species: "generic", seed: 3, antCount: 50, rival: false, generation: 0 }),
  sensed = new SensedMap(),
  read = (x = centreX(50, 50), layer = PLANE) => inspectViewport(game, sensed, layer, x, centreY(50), 2, 1, { food: false, home: false });

test("column meshing preserves the pre-optimization geometry, grain and face order exactly", () => {
  // Recorded from the previous explicit solid-voxel mesher, including both camera paths and both crop types.
  for (const [below, wide, expected] of [
    [false, false, "5e1b51f298a6d6eaea1d283ffb6e38ade42ccaef5fef5012e04c9690b3bf08dd"],
    [false, true, "87d29ad9d0d818ac15a4bb50d1d61359afd870fc3e4e77247b25bd99cc109f48"],
    [true, false, "89973a25e0e813ace5dfc77c7bb2b33a49d17f8775e57e4bb40b4cf8a6ec5e1f"],
    [true, true, "522e9e1570c054dfcb2ebf51a2b47834f280b9e444a3899e9ff50c789808087b"],
  ] as const) {
    const patch = cadaverArtFixture(below);
    if (wide) patch.bounds = { left: -3, right: 3, top: -3, bottom: 3 };
    assert.equal(
      createHash("sha256")
        .update(
          JSON.stringify(
            buildPatchTerrain(patch, true).map(({ points, kind, normal, depth, grain, front }) => ({
              points,
              normal,
              kind,
              depth,
              grain,
              front,
            })),
          ),
        )
        .digest("hex"),
      expected,
    );
  }
});

test("terrain meshes survive fractional pans, selected-cell crossings, actor changes and nearby round trips", () => {
  let serial = 0;
  const cache = new VoxelTerrainCache(
      () => ++serial,
      () => {},
    ),
    a = cache.update(read(centreX(50, 50) + 0.49));
  assert.ok(a.length > 1);
  assert.equal(cache.rebuilt, a.length);
  assert.deepEqual(cache.update(read(centreX(50, 50) + 0.51)), a);
  assert.equal(cache.rebuilt, 0, "recentring the camera does not rebuild world-anchored chunks");
  const patch = read(centreX(50, 50) + 0.51);
  patch.selected.ants = [];
  patch.selected.place.food += 1;
  assert.deepEqual(cache.update(patch), a);
  assert.equal(cache.rebuilt, 0, "actors and food do not invalidate terrain");
  cache.update(read(centreX(50, 50) + 3.2));
  assert.ok(cache.rebuilt > 0);
  assert.deepEqual(cache.update(read(centreX(50, 50) + 0.51)), a);
  assert.equal(cache.rebuilt, 0, "nearby previous chunks remain warm");
  cache.dispose();
});

test("digging invalidates neighbouring chunk halos locally, and viewport eviction never drops visible terrain", () => {
  const values: { released: boolean }[] = [],
    cache = new VoxelTerrainCache(
      () => {
        const v = { released: false };
        values.push(v);
        return v;
      },
      (value) => {
        assert.equal(value.released, false);
        value.released = true;
      },
      2,
    ),
    patch = read(),
    first = cache.update(patch);
  assert.equal(cache.size, first.length, "an active region may exceed the warm cache budget");
  const cell = patch.cells.find((c) => c.state.cell[0] === 50 && c.state.cell[1] === 50)!;
  cell.state.place.ground = cell.state.place.ground === "rock" ? "open" : "rock";
  const changed = cache.update(patch);
  assert.ok(cache.rebuilt > 0 && cache.rebuilt < first.length, "only chunks affected by the changed cell rebuild");
  assert.ok(changed.every((c) => !c.value.released));
  const next = cache.update(read(centreX(50, 50) + 12));
  assert.ok(next.every((c) => !c.value.released));
  assert.equal(cache.size, next.length);
  assert.ok(
    first.every((c) => c.value.released),
    "unneeded distant meshes are released",
  );
  cache.dispose();
  assert.ok(values.every((v) => v.released));
});

test("mound levels change surface soil colours and invalidate nearby terrain", () => {
  const patch = read(),
    selected = patch.selected.cell,
    cell = patch.cells.find((c) => c.state.cell[0] === selected[0] && c.state.cell[1] === selected[1])!,
    cache = new VoxelTerrainCache(
      () => ({}),
      () => {},
    );
  cell.state.place.ground = "open";
  const first = cache.update(patch);
  const topColour = () => {
    const face = buildPatchTerrain(patch, true).find(
      (f) => f.normal[2] === 1 && Math.abs(f.points[0][0]) < 0.2 && Math.abs(f.points[0][1]) < 0.2,
    )!;
    return faceColour(face, "surface");
  };
  const colours = [topColour()];
  for (const level of [1, 2, 4]) {
    cell.state.place.mound = level;
    cache.update(patch);
    assert.ok(cache.rebuilt > 0 && cache.rebuilt < first.length);
    colours.push(topColour());
  }
  assert.equal(new Set(colours).size, colours.length);
  cache.dispose();
});

test("surface and below terrain cache independently, including projected strip terrain", () => {
  let serial = 0;
  const cache = new VoxelTerrainCache(
      () => ++serial,
      () => {},
    ),
    surface = cache.update(read()),
    belowPatch = read(centreX(50, 50), CURTAIN),
    below = cache.update(belowPatch);
  assert.ok(below.every((c) => !surface.some((s) => s.id === c.id)));
  const cell = belowPatch.cells[0];
  cell.surfaceStrip = true;
  cell.projectedGround = "rock";
  cache.update(belowPatch);
  assert.ok(cache.rebuilt > 0);
  assert.deepEqual(cache.update(read()), surface);
  assert.equal(cache.rebuilt, 0);
  cache.dispose();
});

for (const layer of [PLANE, CURTAIN])
  test(`chunk boundaries preserve the complete ${layer === PLANE ? "surface" : "below"} terrain without internal cut walls`, () => {
    const patch = read(centreX(50, 50), layer),
      cx = centreX(...patch.selected.cell),
      cy = centreY(patch.selected.cell[1]);
    patch.bounds = { left: 48 - cx, right: 54 - cx, top: 42 - cy, bottom: 45 - cy };
    for (const c of patch.cells) {
      c.valid = true;
      c.surfaceStrip = false;
      c.state.place.ground = c.state.cell[0] >= 51 ? "rock" : "open";
    }
    const below = layer === CURTAIN,
      signature = (f: ReturnType<typeof buildPatchTerrain>[number], dx = 0, dy = 0) => {
        const points = f.points.map((p) => [p[0] + dx + cx, p[1] + (below ? 0 : dy - cy), p[2] + (below ? dy - cy : 0)]),
          x = points.reduce((s, p) => s + p[0] / points.length, 0),
          y = -points.reduce((s, p) => s + p[below ? 2 : 1] / points.length, 0);
        if (x <= 48.1 || x >= 53.9 || y <= 42.1 || y >= 44.9) return null;
        return JSON.stringify([points.map((p) => p.map((v) => +v.toFixed(5))), f.normal, f.kind, f.grain]);
      },
      expected = buildPatchTerrain(patch, true)
        .map((f) => signature(f))
        .filter((v) => v !== null)
        .sort(),
      actual = terrainChunkDescriptors(patch)
        .flatMap((chunk) => buildVoxelTerrainChunk(chunk).map((f) => signature(f, chunk.x - cx, cy - chunk.y)))
        .filter((v) => v !== null)
        .sort();
    assert.ok(expected.length > 0);
    assert.deepEqual(actual, expected);
  });
