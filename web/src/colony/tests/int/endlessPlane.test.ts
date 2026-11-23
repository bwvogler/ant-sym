import assert from "node:assert/strict";
import { test } from "node:test";
import { CHUNK, CHUNK_BITS, local } from "../../chunks.ts";
import { ENDLESS_PLANE, EndlessPlane, holeLine, LINE_CLEARANCE, NEW_LINE_GAP, segmentGap } from "../../endlessPlane.ts";
import { centreX, centreY, R } from "../../hex.ts";
import { ROCK } from "../../world.ts";

// The endless plane's generator (docs/endless-world.md §3, §4; PRD §66 E2): every chunk a pure function of (seed, chunk).

const SEEDS = [1, 2, 3];

/** A small deterministic shuffle (the order of visits must not matter). */
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

function ring(r: number): [number, number][] {
  const out: [number, number][] = [];
  for (let cy = -r; cy <= r; cy++) for (let cx = -r; cx <= r; cx++) out.push([cx, cy]);
  return out;
}

const same = (a: { rock: Uint8Array; food: Float32Array }, b: { rock: Uint8Array; food: Float32Array }) =>
  Buffer.compare(Buffer.from(a.rock), Buffer.from(b.rock)) === 0 &&
  Buffer.compare(Buffer.from(a.food.buffer), Buffer.from(b.food.buffer)) === 0;

test("any order of visits gives the same chunks, bit for bit", () => {
  for (const seed of [1, 2]) {
    const cells = ring(2);
    const reference = new Map<string, ReturnType<EndlessPlane["chunk"]>>();
    const base = new EndlessPlane(seed);
    for (const [cx, cy] of cells) reference.set(`${cx},${cy}`, base.chunk(cx, cy));
    for (const o of [11, 12]) {
      const world = new EndlessPlane(seed);
      for (const [cx, cy] of shuffled(cells, o))
        assert.ok(same(world.chunk(cx, cy), reference.get(`${cx},${cy}`)!), `seed ${seed} chunk ${cx},${cy} order ${o}`);
    }
  }
});

test("a chunk generated alone is the chunk generated amid its neighbours", () => {
  const warm = new EndlessPlane(5);
  for (const [cx, cy] of ring(2)) warm.chunk(cx, cy);
  for (const [cx, cy] of [
    [0, 0],
    [2, -1],
    [-2, 2],
    [1, 1],
  ] as const)
    assert.ok(same(new EndlessPlane(5).chunk(cx, cy), warm.chunk(cx, cy)), `${cx},${cy}`);
});

test("dropping the caches changes nothing: the world is the seed's", () => {
  const w = new EndlessPlane(7, {});
  const a = w.chunk(1, 1);
  // a long walk fills and clears the caches
  for (let i = 0; i < 40; i++) w.chunk(i * 3, i * 2);
  assert.ok(same(w.chunk(1, 1), a));
});

test("food lies on open ground only, 12 a cell, and the rock under it is cleared", () => {
  for (const seed of SEEDS) {
    const w = new EndlessPlane(seed);
    let cells = 0;
    for (const [cx, cy] of ring(3)) {
      const { rock, food } = w.chunk(cx, cy);
      for (let i = 0; i < food.length; i++)
        if (food[i]) {
          cells++;
          assert.equal(food[i], ENDLESS_PLANE.foodPerCell);
          assert.notEqual(rock[i], ROCK);
        }
    }
    assert.ok(cells > 0, `seed ${seed} has food`);
  }
});

test("patches per chunk are near the plane's 1.5 (PRD §12), fewer where the nests or the rock take them", () => {
  const w = new EndlessPlane(2);
  let n = 0;
  const cells = ring(5);
  for (const [cx, cy] of cells) n += w.patchesOf(cx, cy).length;
  const per = n / cells.length;
  assert.ok(per > 0.9 && per < 1.8, `${per} patches a chunk`);
});

test("no patch is closer than foodMinDist to a nest the world placed", () => {
  for (const seed of SEEDS) {
    const w = new EndlessPlane(seed);
    for (const [cx, cy] of ring(4))
      for (const p of w.patchesOf(cx, cy))
        for (const n of w.nestsNear(p.x, p.y, 200))
          assert.ok(Math.hypot(p.x - n.x, p.y - n.y) - p.radius - 1 >= ENDLESS_PLANE.foodMinDist, `${seed}: patch ${p.x},${p.y}`);
  }
});

test("the start nests: open, walk out, about nestGap apart, and the same every time", () => {
  for (const seed of SEEDS) {
    const w = new EndlessPlane(seed);
    const [a, b] = w.startNests();
    for (const n of [a, b]) assert.ok(w.walksOut(n.x, n.y, 48), `seed ${seed}`);
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    assert.ok(d >= 0.7 * ENDLESS_PLANE.nestGap && d < 1.6 * 1.5 * ENDLESS_PLANE.nestGap, `${d}`);
    assert.deepEqual(new EndlessPlane(seed).startNests(), w.startNests());
    // the nests clear their ground
    const c = w.chunk(Math.floor(a.x) >> CHUNK_BITS, Math.floor(a.y / R) >> CHUNK_BITS);
    const x = Math.floor(a.x);
    const y = Math.floor(a.y / R);
    assert.notEqual(c.rock[local(x & (CHUNK - 1), y & (CHUNK - 1))], ROCK);
  }
});

test("wild sites: on ground that walks out, farther than a unit from the start nests, apart from each other, their lines clear", () => {
  for (const seed of SEEDS) {
    const w = new EndlessPlane(seed);
    const sites = [];
    for (let ry = -3; ry <= 3; ry++)
      for (let rx = -3; rx <= 3; rx++) {
        const s = w.site(rx, ry);
        if (s) sites.push(s);
      }
    assert.ok(sites.length >= 12, `seed ${seed}: ${sites.length} sites in 49 regions`);
    const start = w.startNests();
    for (const s of sites) {
      assert.ok(w.walksOut(s.x, s.y, 48));
      for (const n of start) assert.ok(Math.hypot(s.x - n.x, s.y - n.y) > NEW_LINE_GAP);
      assert.ok(segmentGap(holeLine(s.x, s.y, s.heading), w.startSegment()) >= LINE_CLEARANCE);
    }
    for (let i = 0; i < sites.length; i++)
      for (let j = i + 1; j < sites.length; j++) {
        const a = sites[i]!;
        const b = sites[j]!;
        assert.ok(Math.hypot(a.x - b.x, a.y - b.y) >= ENDLESS_PLANE.wildGap, `seed ${seed}`);
        assert.ok(segmentGap(holeLine(a.x, a.y, a.heading), holeLine(b.x, b.y, b.heading)) >= LINE_CLEARANCE, `seed ${seed} lines`);
      }
  }
});

test("a site is judged alone: its answer does not depend on which regions were asked first", () => {
  const a = new EndlessPlane(4);
  const b = new EndlessPlane(4);
  for (const [rx, ry] of shuffled(ring(3), 3)) a.site(rx, ry);
  for (const [rx, ry] of ring(3)) assert.deepEqual(b.site(rx, ry), a.site(rx, ry));
  assert.deepEqual(new EndlessPlane(4).site(2, -1), a.site(2, -1));
});

test("sitesIn finds exactly the sites in a box", () => {
  const w = new EndlessPlane(1);
  const all = [];
  for (let ry = -2; ry <= 2; ry++)
    for (let rx = -2; rx <= 2; rx++) {
      const s = w.site(rx, ry);
      if (s) all.push(s);
    }
  const x0 = -300;
  const x1 = 400;
  const y0 = -200;
  const y1 = 350;
  const want = all.filter((s) => s.x >= x0 && s.x <= x1 && s.y >= y0 && s.y <= y1).sort((p, q) => p.x - q.x);
  assert.deepEqual(
    w.sitesIn(x0, y0, x1, y1).sort((p, q) => p.x - q.x),
    want,
  );
});

test("segmentGap: crossing, parallel, end to end", () => {
  assert.equal(segmentGap([0, 0, 10, 0], [5, -5, 5, 5]), 0);
  assert.equal(segmentGap([0, 0, 10, 0], [0, 3, 10, 3]), 3);
  assert.equal(segmentGap([0, 0, 10, 0], [13, 4, 20, 4]), 5);
  assert.equal(segmentGap([0, 0, 0, 0], [3, 4, 3, 4]), 5);
});

test("a small endless-plane golden: its seed-1 ring of chunks hashes to what it did", () => {
  const w = new EndlessPlane(1);
  let h = 2166136261;
  for (const [cx, cy] of ring(2)) {
    const { rock, food } = w.chunk(cx, cy);
    for (let i = 0; i < rock.length; i++) h = Math.imul(h ^ (rock[i]! + (food[i]! > 0 ? 7 : 0)), 16777619) >>> 0;
  }
  const [a, b] = w.startNests();
  assert.equal(
    h.toString(16),
    "a5bd306c",
    `hash ${h.toString(16)} start nests ${a.x.toFixed(2)},${a.y.toFixed(2)} ${b.x.toFixed(2)},${b.y.toFixed(2)}`,
  );
});

void centreX;
void centreY;
