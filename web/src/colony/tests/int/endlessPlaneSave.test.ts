import assert from "node:assert/strict";
import { test } from "node:test";
import { CHUNK } from "../../chunks.ts";
import { generateEndlessPlane, loadEndless, saveEndless, type EndlessMap } from "../../endlessMap.ts";
import { ENDLESS_PLANE, GENERATOR_VERSION, planeFingerprint, type EndlessOptions } from "../../endlessPlane.ts";
import { foodIn } from "../../world.ts";

// A save names the plane it is the delta of (ja-qpv.5.9, owner 2026-11-25): the generator's version and the plane's options. A load into another plane is refused
// at the load, naming what differs, before anything changes; it used to load silently and drift, and since the food ledger was saved it threw from inside the
// generator on a tick (review of #436, D1).

const SEED = 5;
const json = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/** A map that has made a few chunks, so a load into it has something to leave alone. */
function played(opts: Partial<EndlessOptions> = {}): EndlessMap {
  const map = generateEndlessPlane(SEED, opts);
  for (let cy = -1; cy <= 1; cy++) for (let cx = -1; cx <= 1; cx++) foodIn(map, cx * CHUNK + 1, cy * CHUNK + 1);
  return map;
}

/** The value an option takes in another plane (valid for the generator: a region is at least 3 chunks and the density at most 1). */
const changed = (k: keyof EndlessOptions): number => (k === "regionChunks" ? 5 : k === "density" ? 0.9 : ENDLESS_PLANE[k] * 1.1);

const OPTIONS = (Object.keys(ENDLESS_PLANE) as (keyof EndlessOptions)[]).filter((k) => k !== "cacheChunks");

test("a save names the generator and the plane's options, without the cache size", () => {
  const saved = json(saveEndless(played())) as { plane: { generator: number; options: Record<string, number> } };
  assert.equal(saved.plane.generator, GENERATOR_VERSION);
  assert.deepEqual(saved.plane.options, planeFingerprint(ENDLESS_PLANE));
  assert.equal("cacheChunks" in saved.plane.options, false);
  assert.deepEqual(Object.keys(saved.plane.options).sort(), [...OPTIONS].sort());
});

test("a save loads into a plane with the same options, whatever its cache size", () => {
  const a = played();
  const saved = json(saveEndless(a));
  const b = generateEndlessPlane(SEED);
  loadEndless(b, saved);
  assert.equal(b.foodTotal, a.foodTotal);
  const small = generateEndlessPlane(SEED, { cacheChunks: 8 });
  loadEndless(small, json(saveEndless(a)));
  assert.equal(small.foodTotal, a.foodTotal, "the caches only save work: a plane with smaller ones is the same plane");
});

test("a save is refused by a plane with any other option, naming the option and both values, at the load", () => {
  const saved = json(saveEndless(played()));
  for (const k of OPTIONS) {
    const other = generateEndlessPlane(SEED, { [k]: changed(k) });
    assert.throws(
      () => loadEndless(other, json(saved)),
      (e: Error) =>
        /another plane/.test(e.message) &&
        e.message.includes(`${k} ${String(ENDLESS_PLANE[k])} in the save, ${String(changed(k))} in this map`),
      `${k} differs`,
    );
  }
});

test("a save from another generator version is refused", () => {
  const saved = json(saveEndless(played())) as { plane: { generator: number } };
  saved.plane.generator = GENERATOR_VERSION + 1;
  assert.throws(() => loadEndless(generateEndlessPlane(SEED), saved as never), /another plane \(generator version \d+ in the save/);
});

test("a refused load changes nothing: the map keeps its counters and chunks", () => {
  const saved = json(saveEndless(played()));
  const b = played({ foodPerCell: 3 });
  const [total, left, chunks, counted] = [b.foodTotal, b.foodLeft, b.food.count, b.ledger.chunks];
  assert.throws(() => loadEndless(b, saved), /foodPerCell/);
  assert.deepEqual([b.foodTotal, b.foodLeft, b.food.count, b.ledger.chunks], [total, left, chunks, counted]);
});

test("a save made before the plane was recorded loads without the check", () => {
  const a = played();
  const old = json(saveEndless(a));
  delete (old as { plane?: unknown }).plane;
  const b = generateEndlessPlane(SEED, { foodPerCell: 3 });
  loadEndless(b, old); // no check: it cannot say which plane it was made on
  assert.ok(b.foodTotal > 0);
});
