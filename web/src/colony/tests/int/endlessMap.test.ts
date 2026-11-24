import assert from "node:assert/strict";
import { test } from "node:test";
import { CHUNK, CHUNK_BITS, local } from "../../chunks.ts";
import { dropClean, ENDLESS_HALF, generateEndlessPlane, isEndless } from "../../endlessMap.ts";
import { EndlessPlane } from "../../endlessPlane.ts";
import { cellOf, CELL, centreX, centreY } from "../../hex.ts";
import {
  clampCol,
  disc,
  digCell,
  dropFood,
  fillCell,
  foodIn,
  generateWorld,
  inBounds,
  OPEN,
  qualityAt,
  rockAt,
  ROCK,
  setRock,
  SOIL,
  takeFoodCell,
  terrainAt,
} from "../../world.ts";

// The endless plane as a WorldMap (PRD §66 E6.0.1): reads are the plane's chunks in any order, writes are kept per chunk, and a chunk nobody
// wrote can be dropped and comes back the same.

function shuffled<T>(a: readonly T[], seed: number): T[] {
  const out = [...a];
  let s = seed;
  for (let i = out.length - 1; i > 0; i--) {
    s = (Math.imul(s, 1103515245) + 12345) & 0x7fffffff;
    const j = s % (i + 1);
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/** Chunks near the origin, far east and west, far north and south, and negative: ±100,000 cells. */
const FAR: [number, number][] = [
  [0, 0],
  [-1, -1],
  [1, 0],
  [0, -1],
  [1562, 3],
  [-1563, -2],
  [7, 1562],
  [-9, -1563],
  [-1562, -1562],
  [1562, 1562],
  [2, 2],
];

/** Sample cells of the chunk (every 7th in x and y, and the four corners). */
function cellsOf(cx: number, cy: number): [number, number][] {
  const out: [number, number][] = [];
  for (let ly = 0; ly < CHUNK; ly += 7) for (let lx = 0; lx < CHUNK; lx += 7) out.push([(cx << CHUNK_BITS) + lx, (cy << CHUNK_BITS) + ly]);
  for (const [lx, ly] of [
    [0, 0],
    [CHUNK - 1, 0],
    [0, CHUNK - 1],
    [CHUNK - 1, CHUNK - 1],
  ] as const)
    out.push([(cx << CHUNK_BITS) + lx, (cy << CHUNK_BITS) + ly]);
  return out;
}

const key = (x: number, y: number) => `${x},${y}`;

test("every cell read through the map is the plane's own, in any order, far and negative", () => {
  for (const seed of [1, 2]) {
    const plane = new EndlessPlane(seed);
    const all = FAR.flatMap(([cx, cy]) => cellsOf(cx, cy));
    for (const order of [all, shuffled(all, 5)]) {
      const map = generateEndlessPlane(seed);
      assert.ok(isEndless(map));
      for (const [x, y] of order) {
        const c = plane.chunk(x >> CHUNK_BITS, y >> CHUNK_BITS);
        const i = local(x & (CHUNK - 1), y & (CHUNK - 1));
        assert.equal(rockAt(map, x, y), c.rock[i], `rock ${key(x, y)}`);
        assert.equal(foodIn(map, x, y), c.food[i], `food ${key(x, y)}`);
        assert.equal(qualityAt(map, x, y), 1);
        assert.ok(inBounds(map, x, y));
      }
    }
  }
});

test("every cell of the chunks round the start, food-bearing ones included, equals the plane's, edges and corners too", () => {
  const map = generateEndlessPlane(2);
  let fed = 0;
  for (let cy = -2; cy <= 2; cy++)
    for (let cx = -2; cx <= 2; cx++) {
      const c = map.plane.chunk(cx, cy);
      for (let ly = 0; ly < CHUNK; ly++)
        for (let lx = 0; lx < CHUNK; lx++) {
          const x = (cx << CHUNK_BITS) + lx;
          const y = (cy << CHUNK_BITS) + ly;
          assert.equal(rockAt(map, x, y), c.rock[local(lx, ly)]);
          assert.equal(foodIn(map, x, y), c.food[local(lx, ly)]);
          if (c.food[local(lx, ly)]! > 0) fed++;
        }
    }
  assert.ok(fed > 0);
});

test("a read of a region the plane made rock is rock, and the map has food and open ground away from the origin", () => {
  const map = generateEndlessPlane(3);
  let rock = 0;
  let food = 0;
  let open = 0;
  for (const [cx, cy] of FAR)
    for (const [x, y] of cellsOf(cx, cy)) {
      if (rockAt(map, x, y) === ROCK) rock++;
      else open++;
      if (foodIn(map, x, y) > 0) food++;
    }
  assert.ok(rock > 0 && open > rock, `rock ${rock}, open ${open}`);
  assert.ok(food > 0 || map.foodTotal > 0);
  assert.ok(map.foodTotal > 0);
});

test("the map has no edge: clampCol, disc and terrainAt work at negative and huge coordinates", () => {
  const map = generateEndlessPlane(1);
  assert.equal(clampCol(map, -5_000_000), -5_000_000);
  assert.equal(clampCol(map, 123_456), 123_456);
  assert.ok(ENDLESS_HALF > 100_000);
  const seen: string[] = [];
  disc(map, -100_000, -50, 3, (x, y) => seen.push(key(x, y)));
  // the same disc, one world over, visits the same number of cells and has rows above row 0
  const east: string[] = [];
  disc(map, 100_000, 50, 3, (x, y) => east.push(key(x, y)));
  assert.ok(seen.length > 20 && east.length > 20);
  assert.ok(seen.some((s) => Number(s.split(",")[1]) < 0));
  assert.equal(terrainAt(map, -100_000.5, -40), rockAt(map, ...(cellOf(-100_000.5, -40), [CELL[0]!, CELL[1]!] as [number, number])));
});

/** An open cell with food at (or near) the chunk, found by scanning the plane. */
function foodCell(map: ReturnType<typeof generateEndlessPlane>): [number, number] {
  for (let cy = -3; cy <= 3; cy++)
    for (let cx = -3; cx <= 3; cx++) {
      const c = map.plane.chunk(cx, cy);
      for (let ly = 0; ly < CHUNK; ly++)
        for (let lx = 0; lx < CHUNK; lx++) if (c.food[local(lx, ly)]! > 0) return [(cx << CHUNK_BITS) + lx, (cy << CHUNK_BITS) + ly];
    }
  throw new Error("no food near the origin");
}

test("writes change what is read, are kept per chunk, and an untouched chunk drops and regenerates the same", () => {
  const map = generateEndlessPlane(2);
  const [fx, fy] = foodCell(map);
  const fcx = fx >> CHUNK_BITS;
  const fcy = fy >> CHUNK_BITS;
  const before = foodIn(map, fx, fy);
  const total = map.foodTotal;
  const left = map.foodLeft;
  assert.ok(takeFoodCell(map, fx, fy));
  assert.equal(foodIn(map, fx, fy), before - 1);
  assert.equal(map.foodLeft, left - 1);
  assert.equal(map.foodTotal, total);
  // eaten: the chunk is a delta and stays
  assert.equal(dropClean(map, fcx, fcy), false);
  assert.equal(foodIn(map, fx, fy), before - 1);

  // a fill back to soil and a rock written are kept too (open cell near a nest-free chunk)
  const far = generateEndlessPlane(2);
  let ox = 100_000;
  while (rockAt(far, ox, 40) !== OPEN) ox++;
  assert.ok(fillCell(far, ox, 40, 7));
  assert.equal(rockAt(far, ox, 40), SOIL);
  assert.equal(far.filled, 1);
  assert.equal(dropClean(far, ox >> CHUNK_BITS, 40 >> CHUNK_BITS), false);
  setRock(far, ox, 41, ROCK);
  assert.equal(rockAt(far, ox, 41), ROCK);
  // a quality write (dropFood) is kept per chunk
  cellOf(-90_000, -300);
  foodIn(far, CELL[0]!, CELL[1]!); // generates the chunk, so its food is in foodLeft before the write
  const pre = far.foodLeft;
  cellOf(-90_000, -300);
  dropFood(far, -90_000, -300, 3, 2);
  assert.equal(far.foodLeft, pre + 3);
  assert.equal(dropClean(far, CELL[0]! >> CHUNK_BITS, CELL[1]! >> CHUNK_BITS), false);
  assert.equal(qualityAt(far, CELL[0]!, CELL[1]!), 2);

  // an untouched chunk drops and comes back identical, adding no food the second time
  const plane = new EndlessPlane(2);
  const clean = generateEndlessPlane(2);
  const snapshot = (cx: number, cy: number) => {
    const out: number[] = [];
    for (const [x, y] of cellsOf(cx, cy)) out.push(rockAt(clean, x, y), foodIn(clean, x, y), qualityAt(clean, x, y));
    return out;
  };
  const first = snapshot(800, -800);
  const t1 = clean.foodTotal;
  const left1 = clean.foodLeft;
  const count = clean.rock.count;
  assert.equal(dropClean(clean, 800, -800), true);
  assert.equal(clean.rock.count, count - 1);
  assert.deepEqual(snapshot(800, -800), first);
  assert.equal(clean.foodTotal, t1);
  assert.equal(clean.foodLeft, left1);
  assert.equal(clean.ledger.chunks, 1);
  const c = plane.chunk(800, -800);
  assert.equal(foodIn(clean, 800 * CHUNK, -800 * CHUNK), c.food[0]);
});

test("reading 2,000 random far chunks then dropping them leaves the few kept", () => {
  const map = generateEndlessPlane(4, { patchesPerChunk: 0, density: 0 }); // no patches or sites: a far chunk is then ~1.5 ms (a patch floods its 3x3 window, ~70 ms)
  let s = 99;
  const rnd = () => (s = (Math.imul(s, 1103515245) + 12345) & 0x7fffffff) / 0x7fffffff;
  const chunks: [number, number][] = [];
  const seen = new Set<string>();
  while (chunks.length < 2000) {
    const cx = Math.floor((rnd() - 0.5) * 3000);
    const cy = Math.floor((rnd() - 0.5) * 3000);
    if (seen.has(key(cx, cy))) continue;
    seen.add(key(cx, cy));
    chunks.push([cx, cy]);
    rockAt(map, (cx << CHUNK_BITS) + 5, (cy << CHUNK_BITS) + 5);
    foodIn(map, (cx << CHUNK_BITS) + 5, (cy << CHUNK_BITS) + 5);
  }
  assert.equal(map.rock.count, 2000);
  assert.equal(map.food.count, 2000);
  // write into 3 of them: they are the kept set
  const kept = chunks.slice(0, 3);
  for (const [cx, cy] of kept) setRock(map, (cx << CHUNK_BITS) + 5, (cy << CHUNK_BITS) + 5, SOIL);
  let dropped = 0;
  for (const [cx, cy] of chunks) if (dropClean(map, cx, cy)) dropped++;
  assert.equal(dropped, 1997);
  assert.equal(map.rock.count, 3);
  assert.equal(map.food.count, 3);
  assert.equal(map.quality.count, 0);
  assert.ok(map.rock.regions <= 3);
  for (const [cx, cy] of kept) assert.equal(rockAt(map, (cx << CHUNK_BITS) + 5, (cy << CHUNK_BITS) + 5), SOIL);
});

test("a bounded map is unchanged: its edge is rock, its bounds and clamps are its box", () => {
  const map = generateWorld(1, { size: { w: 128, h: 96 } });
  assert.equal(map.endless, undefined);
  assert.ok(!isEndless(map));
  for (const [x, y] of [
    [-1, 5],
    [5, -1],
    [128, 5],
    [5, 96],
    [-100_000, -100_000],
    [100_000, 100_000],
  ] as const) {
    assert.equal(rockAt(map, x, y), ROCK);
    assert.equal(inBounds(map, x, y), false);
  }
  assert.equal(inBounds(map, 0, 0), true);
  assert.equal(inBounds(map, 127, 95), true);
  assert.equal(clampCol(map, -9), 0);
  assert.equal(clampCol(map, 9999), 127);
  assert.equal(fillCell(map, -3, 4), false);
  dropFood(map, -50, 4, 5);
  assert.equal(foodIn(map, -50, 4), 0);
  let n = 0;
  disc(map, 2, 2, 6, (x, y) => {
    assert.ok(x >= 0 && y >= 0);
    n++;
  });
  assert.ok(n > 0);
  const edge = (cx: number, cy: number) => centreX(cx, cy) >= 0 && centreY(cy) >= 0;
  assert.ok(edge(0, 0));
});

test("dropClean keeps a chunk whose only change is a quality, a dug time, or a filled-then-dug cell; frees one a write restored to the plane's", () => {
  // quality only: food put back and taken again leaves the food equal but quality 2
  const q = generateEndlessPlane(2);
  const [fx, fy] = foodCell(q);
  foodIn(q, fx, fy);
  dropFood(q, centreX(fx, fy), centreY(fy), 1, 2);
  assert.ok(takeFoodCell(q, fx, fy));
  assert.equal(dropClean(q, fx >> CHUNK_BITS, fy >> CHUNK_BITS), false, "a quality of 2 is a change");
  assert.ok(qualityAt(q, fx, fy) > 1, "the quality is a mix now, above the plane's 1");
  // fill then dig: the rock reads open again, but a time was noted
  const d = generateEndlessPlane(2);
  let ox = 100_000;
  while (rockAt(d, ox, 40) !== OPEN) ox++;
  assert.ok(fillCell(d, ox, 40, 3));
  assert.ok(digCell(d, ox, 40, 5));
  assert.equal(rockAt(d, ox, 40), OPEN);
  assert.equal(dropClean(d, ox >> CHUNK_BITS, 40 >> CHUNK_BITS), false, "a time noted is a change");
  // a quality of 1 (the plane's) written and restored: the chunk is clean and its quality chunk is freed
  const c = generateEndlessPlane(2);
  const [cx, cy] = foodCell(c);
  foodIn(c, cx, cy);
  dropFood(c, centreX(cx, cy), centreY(cy), 1, 1);
  assert.ok(takeFoodCell(c, cx, cy));
  assert.ok(c.quality.count > 0);
  assert.equal(dropClean(c, cx >> CHUNK_BITS, cy >> CHUNK_BITS), true);
  assert.equal(c.quality.count, 0, "the quality chunk went with it");
});

test("generating a chunk adds its food to foodTotal and foodLeft together", () => {
  const map = generateEndlessPlane(2);
  const [fx, fy] = foodCell(map);
  foodIn(map, fx, fy);
  assert.ok(map.foodTotal > 0);
  assert.equal(map.foodLeft, map.foodTotal);
});

test("whole chunks of dense food equal the plane's, corner cells included", () => {
  const map = generateEndlessPlane(3, { patchesPerChunk: 30 });
  const plane = new EndlessPlane(3, { patchesPerChunk: 30 });
  let corner = false;
  for (let cx = -4; cx <= 4; cx++)
    for (let cy = -4; cy <= 4; cy++) {
      foodIn(map, cx * CHUNK, cy * CHUNK);
      const own = plane.chunk(cx, cy).food;
      assert.deepEqual([...(map.food.chunk(cx, cy) as Float32Array)], [...own], `chunk ${cx},${cy}`);
      if (own[0]! > 0 || own[CHUNK - 1]! > 0 || own[own.length - CHUNK]! > 0 || own[own.length - 1]! > 0) corner = true;
    }
  assert.ok(corner, "some chunk has food on a corner cell, so the compare covers corners");
});

test("a chunk is made by the plane once, whichever of rock and food is read first", () => {
  for (const first of ["rock", "food"] as const) {
    const map = generateEndlessPlane(5, { patchesPerChunk: 0, density: 0 });
    const own = map.plane.chunk.bind(map.plane);
    let calls = 0;
    map.plane.chunk = (cx: number, cy: number) => {
      calls++;
      return own(cx, cy);
    };
    const chunks: [number, number][] = Array.from({ length: 20 }, (_, i) => [3000 + i * 7, -2000 - i * 5]);
    for (const [cx, cy] of chunks) {
      if (first === "rock") {
        rockAt(map, cx * CHUNK, cy * CHUNK);
        foodIn(map, cx * CHUNK, cy * CHUNK);
      } else {
        foodIn(map, cx * CHUNK, cy * CHUNK);
        rockAt(map, cx * CHUNK, cy * CHUNK);
      }
    }
    assert.equal(calls, 20, `${first} first`);
  }
});

test("dropClean on a chunk nobody read generates nothing and adds no food (ja-qpv.8.1)", () => {
  const map = generateEndlessPlane(2);
  assert.equal(dropClean(map, 900, 900), true);
  assert.equal(map.rock.count, 0);
  assert.equal(map.food.count, 0);
  assert.equal(map.ledger.chunks, 0);
  assert.equal(map.foodTotal, 0);
  assert.equal(map.foodLeft, 0);
  // a chunk only the rock layer holds drops without the food layer making its half
  rockAt(map, 900 * CHUNK + 3, 900 * CHUNK + 3);
  assert.equal(map.rock.count, 1);
  assert.equal(dropClean(map, 900, 900), true);
  assert.equal(map.rock.count, 0);
  assert.equal(map.food.count, 0);
  assert.equal(map.ledger.chunks, 0);
});

test("the ledger keeps no running left that can go stale: the map's foodLeft is the one count (ja-qpv.8.1)", () => {
  const map = generateEndlessPlane(2);
  const c = new EndlessPlane(2).chunk(0, 0);
  let at = -1;
  for (let i = 0; i < c.food.length; i++) if (c.food[i]! > 0) at = i;
  assert.ok(at >= 0, "the start chunk has food");
  const x = at & (CHUNK - 1);
  const y = at >> CHUNK_BITS;
  foodIn(map, x, y);
  const total = map.foodTotal;
  assert.equal(takeFoodCell(map, x, y), true);
  assert.equal(map.foodLeft, total - 1);
  assert.equal(map.foodTotal, total);
  assert.equal(map.ledger.generatedTotal, total, "generated food is the ledger's one figure, and a take never moves it");
  assert.equal("left" in map.ledger, false);
  assert.equal("total" in map.ledger, false);
});
