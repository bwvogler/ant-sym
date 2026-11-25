import assert from "node:assert/strict";
import { test } from "node:test";
import { CHUNK, CHUNK_BITS, chunkKey, local } from "../../chunks.ts";
import { generateEndlessPlane, loadEndless, saveEndless, type EndlessMap } from "../../endlessMap.ts";
import { foodIn, takeFoodCell } from "../../world.ts";

// The food counters across a save and a load (ja-qpv.5.2, owner 2026-11-25 on ja-jqhh): `foodLeft` and `foodTotal` of a loaded endless game equal the
// original's at once, not only the chunks made since the load, because a save carries the chunks whose food was counted (`madeFood`).

const SEED = 5;

/** Make the chunks of a block round the origin by reading one cell of each (a layer makes a chunk on its first read). */
function makeChunks(map: EndlessMap, radius: number): void {
  for (let cy = -radius; cy <= radius; cy++) for (let cx = -radius; cx <= radius; cx++) foodIn(map, cx * CHUNK + 1, cy * CHUNK + 1);
}

/** The first cell holding food in chunk (cx, cy), or null. */
function foodAt(map: EndlessMap, cx: number, cy: number): [number, number] | null {
  const c = map.plane.chunk(cx, cy);
  for (let ly = 0; ly < CHUNK; ly++)
    for (let lx = 0; lx < CHUNK; lx++) if (c.food[local(lx, ly)]! > 0) return [(cx << CHUNK_BITS) + lx, (cy << CHUNK_BITS) + ly];
  return null;
}

/** An endless map after some play: chunks made round the origin, and food taken from three of them. */
function played(): EndlessMap {
  const map = generateEndlessPlane(SEED);
  makeChunks(map, 4);
  let taken = 0;
  for (let cy = -4; cy <= 4 && taken < 3; cy++)
    for (let cx = -4; cx <= 4 && taken < 3; cx++) {
      const cell = foodAt(map, cx, cy);
      if (cell && takeFoodCell(map, cell[0], cell[1])) taken++;
    }
  assert.equal(taken, 3, "food was taken from three chunks");
  return map;
}

const json = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

test("a loaded endless map's food counters equal the original's, and so does what it counts next", () => {
  const a = played();
  assert.ok(a.foodTotal > 0 && a.foodLeft < a.foodTotal, "something is generated and something taken");
  const saved = json(saveEndless(a));

  const b = generateEndlessPlane(SEED);
  loadEndless(b, saved);
  assert.equal(b.foodTotal, a.foodTotal, "the total");
  assert.equal(b.foodLeft, a.foodLeft, "what is left");
  assert.equal(b.ledger.chunks, a.ledger.chunks, "the chunks counted");
  assert.equal(b.ledger.generatedTotal, a.ledger.generatedTotal, "the food generated");

  // chunks made after the load count the same in both: the ones the save carried count nothing a second time
  makeChunks(a, 6);
  makeChunks(b, 6);
  assert.equal(b.foodTotal, a.foodTotal, "the total after more chunks are made");
  assert.equal(b.foodLeft, a.foodLeft, "what is left after more chunks are made");
  assert.equal(b.ledger.chunks, a.ledger.chunks);
});

test("a chunk the save carried and the load did not make tells the game when it is made, as a chunk freed and made again does", () => {
  const a = played();
  const b = generateEndlessPlane(SEED);
  loadEndless(b, json(saveEndless(a)));
  const made: number[] = [];
  const regen: number[] = [];
  b.foodHooks.push((cx, cy) => made.push(cx * 1000 + cy));
  b.regenHooks.push((cx, cy) => regen.push(cx * 1000 + cy));
  makeChunks(b, 4);
  assert.equal(made.length, 0, "none of them is new: the ledger counted them");
  assert.ok(regen.length > 0, "the game is told, so its piles take them up");
});

test("the game is told of each changed chunk at the load, whether or not the ledger was saved", () => {
  const a = played();
  const saved = json(saveEndless(a)) as ReturnType<typeof saveEndless> & { food: { $chunks: unknown[] } };
  const changed = saved.food.$chunks.length;
  assert.ok(changed >= 1);
  for (const [name, mutate] of [
    ["with the ledger", (s: Record<string, unknown>) => s],
    ["an older save without it", (s: Record<string, unknown>) => (delete s.madeFood, s)],
  ] as const) {
    const b = generateEndlessPlane(SEED);
    let told = 0;
    b.foodHooks.push(() => told++);
    loadEndless(b, mutate(json(saveEndless(a))));
    assert.equal(told, changed, name);
  }
});

test("a save without the ledger loads as before: only the changed chunks count until others are made", () => {
  const a = played();
  const old = json(saveEndless(a));
  delete old.madeFood;
  const b = generateEndlessPlane(SEED);
  loadEndless(b, old);
  assert.ok(b.foodTotal < a.foodTotal, "the counters start short of the original");
  makeChunks(b, 4);
  assert.equal(b.foodTotal, a.foodTotal, "and converge as the chunks are made");
  assert.equal(b.foodLeft, a.foodLeft);
});

test("a saved amount that is not what the plane generates is refused, and the ledger a save carries is small", () => {
  const a = played();
  const saved = json(saveEndless(a));
  const made = saved.madeFood as [string, number][];
  assert.equal(made.length, a.ledger.chunks);
  assert.ok(JSON.stringify(made).length < 60 * made.length, `${JSON.stringify(made).length} bytes for ${made.length} chunks`);
  // a changed chunk's amount is checked against the plane as the load counts it
  const changedKey = (saved.food as { $chunks: [number, number, unknown][] }).$chunks[0]!;
  const key = `food:${chunkKey(changedKey[0], changedKey[1])}`;
  const tampered = made.map(([k, amount]) => [k, k === key ? amount + 1 : amount] as [string, number]);
  assert.ok(
    tampered.some(([k], i) => k === key && tampered[i]![1] !== made[i]![1]),
    "the test found the changed chunk's entry",
  );
  assert.throws(() => loadEndless(generateEndlessPlane(SEED), { ...saved, madeFood: tampered }), /FoodLedger/);
});

test("a save loads into a map that has already made chunks, and the counters are the save's, not a sum of the two", () => {
  const a = played();
  const saved = json(saveEndless(a));
  const b = generateEndlessPlane(SEED);
  makeChunks(b, 2); // a game that has played: its ledger counts chunks before the load (loadEndless resets it first)
  assert.ok(b.ledger.chunks > 0);
  loadEndless(b, saved);
  assert.equal(b.foodTotal, a.foodTotal);
  assert.equal(b.foodLeft, a.foodLeft);
  assert.equal(b.ledger.chunks, a.ledger.chunks);
  assert.equal(b.ledger.generatedTotal, a.ledger.generatedTotal);
});

test("the counters a save carries are exact, not an offset that can differ in the last bits", () => {
  const a = played();
  const g = a.ledger.generatedTotal;
  // a food left well under half the generated total (much eaten) with a fraction, for which (left - generated) + generated is not left: the offset form loses it
  let left = 0;
  for (let k = 1; k < 5000 && left === 0; k++) {
    const x = g * 0.3 + k * 0.0137;
    if (x - g + g !== x) left = x;
  }
  assert.ok(left > 0, "found a food left the offset form cannot carry");
  a.foodLeft = left;
  const b = generateEndlessPlane(SEED);
  loadEndless(b, json(saveEndless(a)));
  assert.equal(b.foodTotal, a.foodTotal);
  assert.equal(b.foodLeft, a.foodLeft);
});
