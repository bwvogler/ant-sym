// Chunked grids, pure: the world's cells in 64×64 chunks, so a map can be
// large (and, later, endless) while only the parts in use cost memory and
// time. A layer is one typed array per chunk, allocated when first written;
// a chunk never written reads as the layer's `empty` value (or, for a layer
// with a generator, is generated on first touch). Chunk coordinates are
// signed, so the world can grow in any direction; the chunks are kept in
// regions of 16 × 16, so far-apart places cost 256 times fewer slots than
// a box of chunks. Reads are a few integer operations (`x >> 6`, `x & 63`)
// and two array indexes, cheap enough for every ant's sensors every tick.

export const CHUNK_BITS = 6;
/** Cells along one side of a chunk. */
export const CHUNK = 1 << CHUNK_BITS;
export const CHUNK_CELLS = CHUNK * CHUNK;
const MASK = CHUNK - 1;
/** The sparse per-cell sum grids (ants, strangers, spore load) keep a flag per 8×8 block, so an empty neighbourhood is skipped at once. */
export const BLOCK_BITS = 3;
const OFFSET = 1 << 15;

export type Cells = Uint8Array | Uint16Array | Float32Array;

/** One number per chunk coordinate pair, for sets and maps of chunks; signed coordinates up to ±32k chunks. */
export function chunkKey(cx: number, cy: number): number {
  return (cy + OFFSET) * 2 * OFFSET + (cx + OFFSET);
}

export function chunkOf(key: number): [number, number] {
  const cx = (key % (2 * OFFSET)) - OFFSET;
  const cy = Math.floor(key / (2 * OFFSET)) - OFFSET;
  return [cx, cy];
}

/** Index of local cell (lx, ly) inside a chunk's array. */
export function local(lx: number, ly: number): number {
  return (ly << CHUNK_BITS) | lx;
}

/** A region is REGION × REGION chunks: the unit ChunkLayer's table grows by (16 × 16 chunks, 1,024 × 1,024 cells). */
const REGION_BITS = 4;
const REGION = 1 << REGION_BITS;
const REGION_MASK = REGION - 1;

/**
 * Chunk arrays, one per chunk, for one kind of value. The table is two levels: a dense box of regions, each region a
 * dense array of REGION × REGION chunk slots. A read is two array indexes, as cheap as a dense box of chunks (measured:
 * scripts/lab/chunk-table-bench.mjs and colony-bench, PRD §66 E1.2), but the box grows by whole regions, so two far
 * places cost 256 times fewer slots than a box of chunks would (endless-world §7). A layer may have a generator, which
 * fills a chunk the first time anything reads or writes it.
 */
export class ChunkLayer<A extends Cells> {
  /** what a cell in a chunk never written reads as */
  readonly empty: number;
  readonly #make: (n: number) => A;
  // Stored with the array widened to Cells, so a layer of one array type stays assignable to another's (see constructor).
  readonly #generate: ((cx: number, cy: number, a: Cells) => void) | null;
  // The box of regions: region (rx, ry) is #table[(ry − #ry0) · #rw + (rx − #rx0)], undefined until a chunk in it is written.
  #rx0 = 0;
  #ry0 = 0;
  #rw = 0;
  #rh = 0;
  #table: ((A | undefined)[] | undefined)[] = [];
  // Chunks held in each slot's region, beside #table: a region whose last chunk is dropped is freed.
  #live: number[] = [];
  #regions = 0;
  #count = 0;

  /**
   * `make` allocates a chunk's array; `empty` is what a cell no one wrote reads as. `generate`, if given, fills a new
   * chunk (already set to `empty`) the first time any read or write touches it, so a missing chunk never reads as empty.
   * It must be a pure function of (cx, cy) that writes only `a`: the chunk is installed before it runs, so if it throws the
   * chunk stays as `empty`, and if it reads a neighbour of this layer it generates that one first (inputs that need
   * neighbours read their pure source, as world generation's `chunkRock`, not the layer).
   */
  constructor(make: (n: number) => A, empty = 0, generate: ((cx: number, cy: number, a: A) => void) | null = null) {
    this.#make = make;
    this.empty = empty;
    this.#generate = generate as ((cx: number, cy: number, a: Cells) => void) | null;
  }

  /** Chunks allocated. */
  get count(): number {
    return this.#count;
  }

  /** Regions allocated (each 16 × 16 chunk slots), each holding at least one chunk: a region is freed with its last chunk. */
  get regions(): number {
    return this.#regions;
  }

  /** Slots in the box of regions: the one part that grows with the spread between places, by whole regions, and never shrinks. */
  get regionSlots(): number {
    return this.#rw * this.#rh;
  }

  /** The array of chunk (cx, cy) if it exists, without generating it. */
  #at(cx: number, cy: number): A | undefined {
    const tx = (cx >> REGION_BITS) - this.#rx0;
    const ty = (cy >> REGION_BITS) - this.#ry0;
    if (tx < 0 || ty < 0 || tx >= this.#rw || ty >= this.#rh) return undefined;
    const r = this.#table[ty * this.#rw + tx];
    return r === undefined ? undefined : r[((cy & REGION_MASK) << REGION_BITS) | (cx & REGION_MASK)];
  }

  /** The array of chunk (cx, cy): undefined if it was never written, unless the layer generates it. */
  chunk(cx: number, cy: number): A | undefined {
    const a = this.#at(cx, cy);
    if (a !== undefined || this.#generate === null) return a;
    return this.ensure(cx, cy);
  }

  /** The array of chunk (cx, cy), allocated (filled with `empty`, then generated) if needed. */
  ensure(cx: number, cy: number): A {
    const have = this.#at(cx, cy);
    if (have !== undefined) return have;
    const a = this.#make(CHUNK_CELLS);
    if (this.empty !== 0) a.fill(this.empty);
    this.put(cx, cy, a);
    if (this.#generate !== null) this.#generate(cx, cy, a);
    return a;
  }

  /** Install `a` as chunk (cx, cy), replacing whatever was there; returns the old array. */
  put(cx: number, cy: number, a: A): A | undefined {
    const rx = cx >> REGION_BITS;
    const ry = cy >> REGION_BITS;
    this.#cover(rx, ry);
    const ti = (ry - this.#ry0) * this.#rw + (rx - this.#rx0);
    let r = this.#table[ti];
    if (r === undefined) {
      r = this.#table[ti] = new Array<A | undefined>(REGION * REGION);
      this.#regions++;
    }
    const i = ((cy & REGION_MASK) << REGION_BITS) | (cx & REGION_MASK);
    const old = r[i];
    r[i] = a;
    if (old === undefined) {
      this.#count++;
      this.#live[ti] = (this.#live[ti] ?? 0) + 1;
    }
    return old;
  }

  /**
   * Forget chunk (cx, cy), returning its array: it reads as `empty` again (or is generated afresh on its next read). A
   * region left with no chunk is freed too, so memory follows the ground held now, not all the ground ever held.
   */
  drop(cx: number, cy: number): A | undefined {
    const tx = (cx >> REGION_BITS) - this.#rx0;
    const ty = (cy >> REGION_BITS) - this.#ry0;
    if (tx < 0 || ty < 0 || tx >= this.#rw || ty >= this.#rh) return undefined;
    const ti = ty * this.#rw + tx;
    const r = this.#table[ti];
    if (r === undefined) return undefined;
    const i = ((cy & REGION_MASK) << REGION_BITS) | (cx & REGION_MASK);
    const old = r[i];
    if (old !== undefined) {
      this.#count--;
      r[i] = undefined;
      const live = (this.#live[ti] ?? 1) - 1;
      this.#live[ti] = live;
      if (live === 0) {
        this.#table[ti] = undefined;
        this.#regions--;
      }
    }
    return old;
  }

  /** The cell at integer coordinates (x, y); callers floor first (a fraction like −0.5 would read cell 0). */
  get(x: number, y: number): number {
    // Every ant's sensors read through here: the common case (a chunk that exists) is kept small enough to inline.
    const cx = x >> CHUNK_BITS;
    const cy = y >> CHUNK_BITS;
    const tx = (cx >> REGION_BITS) - this.#rx0;
    const ty = (cy >> REGION_BITS) - this.#ry0;
    const r = tx >= 0 && ty >= 0 && tx < this.#rw && ty < this.#rh ? this.#table[ty * this.#rw + tx] : undefined;
    const a = r === undefined ? undefined : r[((cy & REGION_MASK) << REGION_BITS) | (cx & REGION_MASK)];
    return a !== undefined ? a[((y & MASK) << CHUNK_BITS) | (x & MASK)] : this.#missing(x, y);
  }

  /** What a cell in a chunk that doesn't exist reads as: `empty`, or the generated chunk's value. */
  #missing(x: number, y: number): number {
    if (this.#generate === null) return this.empty;
    return this.ensure(x >> CHUNK_BITS, y >> CHUNK_BITS)[((y & MASK) << CHUNK_BITS) | (x & MASK)];
  }

  set(x: number, y: number, v: number): void {
    const a = this.ensure(x >> CHUNK_BITS, y >> CHUNK_BITS);
    a[((y & MASK) << CHUNK_BITS) | (x & MASK)] = v;
  }

  /** Every allocated chunk, in (cy, cx) order: row by row, as a save and a sum must see them whatever the table's layout. */
  forEach(fn: (cx: number, cy: number, a: A) => void): void {
    // Rows of regions, then the chunk rows within them, then the regions across, then the chunks across: (cy, cx) order.
    for (let ty = 0; ty < this.#rh; ty++)
      for (let ly = 0; ly < REGION; ly++)
        for (let tx = 0; tx < this.#rw; tx++) {
          const r = this.#table[ty * this.#rw + tx];
          if (r === undefined) continue;
          for (let lx = 0; lx < REGION; lx++) {
            const a = r[(ly << REGION_BITS) | lx];
            if (a !== undefined) fn(((tx + this.#rx0) << REGION_BITS) | lx, ((ty + this.#ry0) << REGION_BITS) | ly, a);
          }
        }
  }

  /** Forget every chunk: the layer reads as `empty` everywhere and holds nothing (a save's restore, save.ts). */
  dropAll(): void {
    this.#table.fill(undefined);
    this.#live.fill(0);
    this.#regions = 0;
    this.#count = 0;
  }

  /** Every cell back to what it was made as (`empty`, or generated afresh), keeping the chunks allocated. */
  clear(): void {
    const generate = this.#generate;
    this.forEach((cx, cy, a) => {
      a.fill(this.empty);
      if (generate !== null) generate(cx, cy, a);
    });
  }

  /** Grow the box of regions (never the regions) so it covers region (rx, ry), with room to spare. */
  #cover(rx: number, ry: number): void {
    if (this.#rw > 0 && rx >= this.#rx0 && ry >= this.#ry0 && rx < this.#rx0 + this.#rw && ry < this.#ry0 + this.#rh) return;
    const x0 = this.#rw > 0 ? Math.min(this.#rx0, rx) : rx;
    const y0 = this.#rh > 0 ? Math.min(this.#ry0, ry) : ry;
    const x1 = this.#rw > 0 ? Math.max(this.#rx0 + this.#rw, rx + 1) : rx + 1;
    const y1 = this.#rh > 0 ? Math.max(this.#ry0 + this.#rh, ry + 1) : ry + 1;
    // Grow by at least half again in each direction that grew, so a frontier creeping outward re-tables rarely.
    const padX = this.#rw > 0 ? Math.max(1, this.#rw >> 1) : 0;
    const padY = this.#rh > 0 ? Math.max(1, this.#rh >> 1) : 0;
    const nx0 = x0 < this.#rx0 ? x0 - padX : x0;
    const ny0 = y0 < this.#ry0 ? y0 - padY : y0;
    const nx1 = this.#rw > 0 && x1 > this.#rx0 + this.#rw ? x1 + padX : x1;
    const ny1 = this.#rh > 0 && y1 > this.#ry0 + this.#rh ? y1 + padY : y1;
    const nw = nx1 - nx0;
    const nh = ny1 - ny0;
    const table: ((A | undefined)[] | undefined)[] = new Array(nw * nh);
    const live: number[] = new Array<number>(nw * nh).fill(0);
    for (let ty = 0; ty < this.#rh; ty++)
      for (let tx = 0; tx < this.#rw; tx++) {
        const r = this.#table[ty * this.#rw + tx];
        if (r === undefined) continue;
        const ni = (ty + this.#ry0 - ny0) * nw + (tx + this.#rx0 - nx0);
        table[ni] = r;
        live[ni] = this.#live[ty * this.#rw + tx]!;
      }
    this.#table = table;
    this.#live = live;
    this.#rx0 = nx0;
    this.#ry0 = ny0;
    this.#rw = nw;
    this.#rh = nh;
  }
}
