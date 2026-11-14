// Offline, no key: which table should ChunkLayer keep its chunks in (docs/endless-world.md §7, ja-qpv.1.2)? Today it is a
// dense bounding box of slots (one per chunk between the farthest two touched), which grows with the square of the spread
// and could not hold an endless world. Candidates, each with the same reads the game makes:
//   dense  the bounding box (today's ChunkLayer)
//   map    a Map keyed by chunkKey, with the last chunk read cached
//   region a Map of regions of 16 × 16 chunks, each a dense array, with the last region read cached
//   box    a dense box of those regions, no map and no cache: what ChunkLayer keeps (chosen by colony-bench, PRD §66 E1.2)
// The pattern is the ants' sensors: N ants on a random walk over a 512 × 368 plane, each reading a 3 × 3 block of cells
// round it on every layer it senses, every tick. A second run spreads the same ants over two spots 100 chunks apart
// (an endless world's two busy places), where the dense box must span the gap.
//
// Usage, from the repo root: node scripts/lab/chunk-table-bench.mjs [ants=2400] [ticks=600] [layers=8]
import { CHUNK, CHUNK_BITS, CHUNK_CELLS, chunkKey } from "../../web/src/colony/chunks.ts";

const [ants = 2400, ticks = 600, layers = 8] = process.argv
  .slice(2)
  .filter((a) => !a.startsWith("--"))
  .map(Number);
const MASK = CHUNK - 1;

class Dense {
  #cx0 = 0;
  #cy0 = 0;
  #cw = 0;
  #ch = 0;
  #table = [];
  get(x, y) {
    const tx = (x >> CHUNK_BITS) - this.#cx0;
    const ty = (y >> CHUNK_BITS) - this.#cy0;
    if (tx < 0 || ty < 0 || tx >= this.#cw || ty >= this.#ch) return 0;
    const a = this.#table[ty * this.#cw + tx];
    return a ? a[((y & MASK) << CHUNK_BITS) | (x & MASK)] : 0;
  }
  put(cx, cy, a) {
    if (!(this.#cw > 0 && cx >= this.#cx0 && cy >= this.#cy0 && cx < this.#cx0 + this.#cw && cy < this.#cy0 + this.#ch)) {
      const x0 = this.#cw ? Math.min(this.#cx0, cx) : cx;
      const y0 = this.#ch ? Math.min(this.#cy0, cy) : cy;
      const x1 = this.#cw ? Math.max(this.#cx0 + this.#cw, cx + 1) : cx + 1;
      const y1 = this.#ch ? Math.max(this.#cy0 + this.#ch, cy + 1) : cy + 1;
      const t = new Array((x1 - x0) * (y1 - y0));
      for (let ty = 0; ty < this.#ch; ty++)
        for (let tx = 0; tx < this.#cw; tx++) t[(ty + this.#cy0 - y0) * (x1 - x0) + tx + this.#cx0 - x0] = this.#table[ty * this.#cw + tx];
      this.#table = t;
      this.#cx0 = x0;
      this.#cy0 = y0;
      this.#cw = x1 - x0;
      this.#ch = y1 - y0;
    }
    this.#table[(cy - this.#cy0) * this.#cw + (cx - this.#cx0)] = a;
  }
  get slots() {
    return this.#cw * this.#ch;
  }
}

class Keyed {
  #map = new Map();
  #lastKey = NaN;
  #last = undefined;
  get(x, y) {
    const k = chunkKey(x >> CHUNK_BITS, y >> CHUNK_BITS);
    let a;
    if (k === this.#lastKey) a = this.#last;
    else {
      a = this.#map.get(k);
      if (a) {
        this.#lastKey = k;
        this.#last = a;
      }
    }
    return a ? a[((y & MASK) << CHUNK_BITS) | (x & MASK)] : 0;
  }
  put(cx, cy, a) {
    this.#map.set(chunkKey(cx, cy), a);
  }
  get slots() {
    return this.#map.size;
  }
}

const RB = 4; // 16 × 16 chunks a region
const RM = (1 << RB) - 1;
class Region {
  #map = new Map();
  #lastKey = NaN;
  #last = undefined;
  get(x, y) {
    const cx = x >> CHUNK_BITS;
    const cy = y >> CHUNK_BITS;
    const k = chunkKey(cx >> RB, cy >> RB);
    let r;
    if (k === this.#lastKey) r = this.#last;
    else {
      r = this.#map.get(k);
      if (!r) return 0;
      this.#lastKey = k;
      this.#last = r;
    }
    const a = r[((cy & RM) << RB) | (cx & RM)];
    return a ? a[((y & MASK) << CHUNK_BITS) | (x & MASK)] : 0;
  }
  put(cx, cy, a) {
    const k = chunkKey(cx >> RB, cy >> RB);
    let r = this.#map.get(k);
    if (!r) this.#map.set(k, (r = new Array(1 << (2 * RB))));
    r[((cy & RM) << RB) | (cx & RM)] = a;
  }
  get slots() {
    return this.#map.size << (2 * RB);
  }
}

// What ChunkLayer keeps (E1.2): a dense box of regions, each a dense array of 16 × 16 chunk slots; no map, no cache.
class Box {
  #rx0 = 0;
  #ry0 = 0;
  #rw = 0;
  #rh = 0;
  #table = [];
  get(x, y) {
    const cx = x >> CHUNK_BITS;
    const cy = y >> CHUNK_BITS;
    const tx = (cx >> RB) - this.#rx0;
    const ty = (cy >> RB) - this.#ry0;
    const r = tx >= 0 && ty >= 0 && tx < this.#rw && ty < this.#rh ? this.#table[ty * this.#rw + tx] : undefined;
    const a = r === undefined ? undefined : r[((cy & RM) << RB) | (cx & RM)];
    return a !== undefined ? a[((y & MASK) << CHUNK_BITS) | (x & MASK)] : 0;
  }
  put(cx, cy, a) {
    const rx = cx >> RB;
    const ry = cy >> RB;
    if (!(this.#rw > 0 && rx >= this.#rx0 && ry >= this.#ry0 && rx < this.#rx0 + this.#rw && ry < this.#ry0 + this.#rh)) {
      const x0 = this.#rw ? Math.min(this.#rx0, rx) : rx;
      const y0 = this.#rh ? Math.min(this.#ry0, ry) : ry;
      const x1 = this.#rw ? Math.max(this.#rx0 + this.#rw, rx + 1) : rx + 1;
      const y1 = this.#rh ? Math.max(this.#ry0 + this.#rh, ry + 1) : ry + 1;
      const t = new Array((x1 - x0) * (y1 - y0));
      for (let ty = 0; ty < this.#rh; ty++)
        for (let tx = 0; tx < this.#rw; tx++) t[(ty + this.#ry0 - y0) * (x1 - x0) + tx + this.#rx0 - x0] = this.#table[ty * this.#rw + tx];
      this.#table = t;
      this.#rx0 = x0;
      this.#ry0 = y0;
      this.#rw = x1 - x0;
      this.#rh = y1 - y0;
    }
    const ti = (ry - this.#ry0) * this.#rw + (rx - this.#rx0);
    const r = (this.#table[ti] ??= new Array(1 << (2 * RB)));
    r[((cy & RM) << RB) | (cx & RM)] = a;
  }
  get slots() {
    return this.#rw * this.#rh + this.#table.filter(Boolean).length * (1 << (2 * RB));
  }
}

function run(Kind, spots) {
  const tables = Array.from({ length: layers }, () => new Kind());
  // Fill every chunk round each spot (as the game's map layers are), with a value so reads can't be optimised away.
  for (const [sx, sy] of spots)
    for (let cy = (sy >> CHUNK_BITS) - 4; cy <= (sy >> CHUNK_BITS) + 4; cy++)
      for (let cx = (sx >> CHUNK_BITS) - 5; cx <= (sx >> CHUNK_BITS) + 5; cx++)
        for (const t of tables) t.put(cx, cy, new Float32Array(CHUNK_CELLS).fill(1));
  let seed = 7;
  const rand = () => (seed = (seed * 1103515245 + 12345) >>> 0) / 2 ** 32;
  const xs = new Float64Array(ants);
  const ys = new Float64Array(ants);
  for (let i = 0; i < ants; i++) {
    const [sx, sy] = spots[i % spots.length];
    xs[i] = sx + (rand() - 0.5) * 400;
    ys[i] = sy + (rand() - 0.5) * 300;
  }
  let sum = 0;
  const t0 = performance.now();
  for (let k = 0; k < ticks; k++)
    for (let i = 0; i < ants; i++) {
      xs[i] += (rand() - 0.5) * 2;
      ys[i] += (rand() - 0.5) * 2;
      const x = xs[i] | 0;
      const y = ys[i] | 0;
      for (const t of tables) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) sum += t.get(x + dx, y + dy);
    }
  const ms = performance.now() - t0;
  const reads = ticks * ants * layers * 9;
  return { ns: (ms * 1e6) / reads, slots: tables[0].slots, sum };
}

const near = [[256, 184]];
const far = [
  [256, 184],
  [256 + 100 * CHUNK, 184 + 60 * CHUNK],
];
// One kind per process (--kind=dense|map|region|box), so the reads stay monomorphic as they are in the game; without
// --kind, this script runs itself once per kind.
const KINDS = { dense: Dense, map: Keyed, region: Region, box: Box };
const only = process.argv.find((a) => a.startsWith("--kind="))?.slice(7);
if (only) {
  for (const [name, spots] of [
    ["one spot (today's plane)", near],
    ["two spots 100 × 60 chunks apart", far],
  ]) {
    run(KINDS[only], spots); // warm-up
    const r = run(KINDS[only], spots);
    console.log(`${name}: ${only.padEnd(6)} ${r.ns.toFixed(2)} ns a read; ${r.slots} slots a layer`);
  }
} else {
  const { execFileSync } = await import("node:child_process");
  console.log(`${ants} ants, ${ticks} ticks, ${layers} layers, 3 × 3 reads each`);
  for (const kind of Object.keys(KINDS))
    process.stdout.write(execFileSync(process.execPath, [process.argv[1], `${ants}`, `${ticks}`, `${layers}`, `--kind=${kind}`]));
}
