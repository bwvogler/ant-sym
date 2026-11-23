import assert from "node:assert/strict";
import { test } from "node:test";
import { CHUNK, CHUNK_BITS, local } from "../../chunks.ts";
import { ENDLESS_PLANE, EndlessPlane, holeLine, LINE_CLEARANCE, NEW_LINE_GAP, segmentGap } from "../../endlessPlane.ts";
import { cellOf, CELL, centreX, centreY, R } from "../../hex.ts";
import { type Nest, ROCK } from "../../world.ts";

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

test("dropping the caches changes nothing: the world is the seed's, even with every cache holding six entries", () => {
  const big = new EndlessPlane(7);
  const small = new EndlessPlane(7, { cacheChunks: 6 });
  const a = big.chunk(1, 1);
  // a long walk fills and clears the small caches again and again, mid-computation
  for (let i = 0; i < 40; i++)
    assert.ok(same(small.chunk(i - 20, ((i * 7) % 11) - 5), big.chunk(i - 20, ((i * 7) % 11) - 5)), `walk step ${i}`);
  assert.ok(same(small.chunk(1, 1), a));
  for (let ry = -2; ry <= 2; ry++) for (let rx = -2; rx <= 2; rx++) assert.deepEqual(small.site(rx, ry), big.site(rx, ry));
  assert.deepEqual(small.startNests(), big.startNests());
});

test("a region must hold what a site's conflicts reach: a constructor that cannot judge a region alone refuses", () => {
  assert.throws(() => new EndlessPlane(1, { regionChunks: 2 }));
  assert.throws(() => new EndlessPlane(1, { regionChunks: 3, wildGap: 200 }));
  assert.doesNotThrow(() => new EndlessPlane(1, { regionChunks: 3 }));
});

/** A plane whose seed terrain is given (open, or rock where `rockAtCell` says): to build the sealed pockets a real seed rarely has. */
class Stubbed extends EndlessPlane {
  readonly rockAtCell: (x: number, y: number) => boolean;
  constructor(rockAtCell: (x: number, y: number) => boolean) {
    super(1);
    this.rockAtCell = rockAtCell;
  }
  /** a sealed world has no start nests to find: put them far away, where they touch nothing */
  override startNests(): readonly [Nest, Nest] {
    return [
      { x: 1e6, y: 1e6, r: 3 },
      { x: 1e6 + 140, y: 1e6, r: 3 },
    ];
  }
  override rockOf(cx: number, cy: number): Uint8Array {
    const r = new Uint8Array(CHUNK * CHUNK);
    for (let j = 0; j < CHUNK; j++)
      for (let i = 0; i < CHUNK; i++) r[local(i, j)] = this.rockAtCell((cx << CHUNK_BITS) + i, (cy << CHUNK_BITS) + j) ? ROCK : 0;
    return r;
  }
}

/** An open disc of radius r round cell (cx, cy) inside rock; `corridor` also opens a strip along row cy from the disc to the east, past the window. */
const pocket = (cx: number, cy: number, r: number, corridor: boolean) => (x: number, y: number) => {
  if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) return false;
  return !(corridor && y === cy && x > cx);
};

test("walksOut: an open disc sealed in rock does not, one with a corridor out does, rock never does", () => {
  const sealed = new Stubbed(pocket(32, 32, 20, false));
  const [px, py] = [centreX(32, 32), centreY(32)];
  assert.equal(sealed.walksOut(px, py, 48), false, "a pocket of radius 20 cannot lead 48 steps");
  assert.equal(sealed.walksOut(px, py, 10), true, "but it can lead 10");
  const open = new Stubbed(pocket(32, 32, 20, true));
  assert.equal(open.walksOut(px, py, 48), true, "a corridor leaves it");
  assert.equal(open.walksOut(centreX(100, 100), centreY(100), 4), false, "rock");
});

test("a kept patch's centre joins open ground that leaves its window: a sealed pocket's patches are dropped, a pocket with a way out keeps its own", () => {
  const sealed = new Stubbed(pocket(32, 32, 20, false));
  for (const [cx, cy] of ring(3)) assert.equal(sealed.patchesOf(cx, cy).length, 0, `chunk ${cx},${cy} of a sealed world`);
  const open = new Stubbed(pocket(32, 32, 20, true));
  let kept = 0;
  for (const [cx, cy] of ring(3))
    for (const p of open.patchesOf(cx, cy)) {
      kept++;
      cellOf(p.x, p.y);
      assert.ok(!open.isRock(CELL[0]!, CELL[1]!), "a patch's centre is open ground");
    }
  assert.ok(kept > 0, "the pocket's own patches are kept");
  const everywhere = new Stubbed(() => false);
  let all = 0;
  for (const [cx, cy] of ring(3)) all += everywhere.patchesOf(cx, cy).length;
  assert.ok(all > 20, "open ground keeps its patches");
});

test("a patch near a chunk's edge feeds and clears the neighbour's cells too (read from patchesOf and rockOf, not from chunk)", () => {
  const w = new EndlessPlane(2);
  let spills = 0;
  for (const [cx, cy] of ring(3))
    for (const p of w.patchesOf(cx, cy))
      for (const [dx, dy] of [
        [-1, 0],
        [1, 0],
        [0, -1],
        [0, 1],
      ] as const) {
        const ncx = cx + dx;
        const ncy = cy + dy;
        const { rock, food } = w.chunk(ncx, ncy);
        for (let j = 0; j < CHUNK; j++)
          for (let i = 0; i < CHUNK; i++) {
            const x = (ncx << CHUNK_BITS) + i;
            const y = (ncy << CHUNK_BITS) + j;
            if (Math.hypot(centreX(x, y) - p.x, centreY(y) - p.y) > p.radius) continue;
            spills++;
            assert.equal(food[local(i, j)], ENDLESS_PLANE.foodPerCell, `patch of ${cx},${cy} at cell ${x},${y} of ${ncx},${ncy}`);
            assert.equal(rock[local(i, j)], 0);
          }
      }
  assert.ok(spills > 10, `${spills} cells of patches spilled into a neighbour`);
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
