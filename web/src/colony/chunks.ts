// Chunked grids, pure: the world's cells in 64×64 chunks, so a map can be
// large (and, later, endless) while only the parts in use cost memory and
// time. A layer is one typed array per chunk, allocated when first written;
// a chunk never written reads as the layer's `empty` value. Chunk coordinates
// are signed, so the world can grow in any direction: the table of chunks
// grows to cover any chunk asked for. Reads are a few integer operations
// (`x >> 6`, `x & 63`), cheap enough for every ant's sensors every tick.

export const CHUNK_BITS = 6;
/** Cells along one side of a chunk. */
export const CHUNK = 1 << CHUNK_BITS;
export const CHUNK_CELLS = CHUNK * CHUNK;
const MASK = CHUNK - 1;
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

export class ChunkLayer<A extends Cells> {
  /** what a cell in a chunk never written reads as */
  readonly empty: number;
  readonly #make: (n: number) => A;
  #cx0 = 0;
  #cy0 = 0;
  #cw = 0;
  #ch = 0;
  #table: (A | undefined)[] = [];
  #count = 0;

  constructor(make: (n: number) => A, empty = 0) {
    this.#make = make;
    this.empty = empty;
  }

  /** Chunks allocated. */
  get count(): number {
    return this.#count;
  }

  /** The array of chunk (cx, cy), or undefined if it was never written. */
  chunk(cx: number, cy: number): A | undefined {
    const tx = cx - this.#cx0;
    const ty = cy - this.#cy0;
    if (tx < 0 || ty < 0 || tx >= this.#cw || ty >= this.#ch) return undefined;
    return this.#table[ty * this.#cw + tx];
  }

  /** The array of chunk (cx, cy), allocated (filled with `empty`) if needed. */
  ensure(cx: number, cy: number): A {
    const have = this.chunk(cx, cy);
    if (have) return have;
    const a = this.#make(CHUNK_CELLS);
    if (this.empty !== 0) a.fill(this.empty);
    this.put(cx, cy, a);
    return a;
  }

  /** Install `a` as chunk (cx, cy), replacing whatever was there; returns the old array. */
  put(cx: number, cy: number, a: A): A | undefined {
    this.#cover(cx, cy);
    const i = (cy - this.#cy0) * this.#cw + (cx - this.#cx0);
    const old = this.#table[i];
    this.#table[i] = a;
    if (!old) this.#count++;
    return old;
  }

  /** Forget chunk (cx, cy): it reads as `empty` again. */
  drop(cx: number, cy: number): void {
    const tx = cx - this.#cx0;
    const ty = cy - this.#cy0;
    if (tx < 0 || ty < 0 || tx >= this.#cw || ty >= this.#ch) return;
    const i = ty * this.#cw + tx;
    if (this.#table[i]) this.#count--;
    this.#table[i] = undefined;
  }

  /** The cell at integer coordinates (x, y); callers floor first (a fraction like −0.5 would read cell 0). */
  get(x: number, y: number): number {
    const tx = (x >> CHUNK_BITS) - this.#cx0;
    const ty = (y >> CHUNK_BITS) - this.#cy0;
    if (tx < 0 || ty < 0 || tx >= this.#cw || ty >= this.#ch) return this.empty;
    const a = this.#table[ty * this.#cw + tx];
    return a ? (a[((y & MASK) << CHUNK_BITS) | (x & MASK)] as number) : this.empty;
  }

  set(x: number, y: number, v: number): void {
    const a = this.ensure(x >> CHUNK_BITS, y >> CHUNK_BITS);
    a[((y & MASK) << CHUNK_BITS) | (x & MASK)] = v;
  }

  /** Every allocated chunk, in table order. */
  forEach(fn: (cx: number, cy: number, a: A) => void): void {
    for (let ty = 0; ty < this.#ch; ty++)
      for (let tx = 0; tx < this.#cw; tx++) {
        const a = this.#table[ty * this.#cw + tx];
        if (a) fn(tx + this.#cx0, ty + this.#cy0, a);
      }
  }

  /** Every cell, zeroed (or set to `empty`), keeping the chunks allocated. */
  clear(): void {
    this.forEach((_, __, a) => a.fill(this.empty));
  }

  /** Grow the table (never the chunks) so it covers chunk (cx, cy), with room to spare. */
  #cover(cx: number, cy: number): void {
    if (this.#cw > 0 && cx >= this.#cx0 && cy >= this.#cy0 && cx < this.#cx0 + this.#cw && cy < this.#cy0 + this.#ch) return;
    const x0 = this.#cw > 0 ? Math.min(this.#cx0, cx) : cx;
    const y0 = this.#ch > 0 ? Math.min(this.#cy0, cy) : cy;
    const x1 = this.#cw > 0 ? Math.max(this.#cx0 + this.#cw, cx + 1) : cx + 1;
    const y1 = this.#ch > 0 ? Math.max(this.#cy0 + this.#ch, cy + 1) : cy + 1;
    // Grow by at least half again in each direction that grew, so a frontier creeping outward re-tables rarely.
    const padX = this.#cw > 0 ? Math.max(1, this.#cw >> 1) : 0;
    const padY = this.#ch > 0 ? Math.max(1, this.#ch >> 1) : 0;
    const nx0 = x0 < this.#cx0 ? x0 - padX : x0;
    const ny0 = y0 < this.#cy0 ? y0 - padY : y0;
    const nx1 = this.#cw > 0 && x1 > this.#cx0 + this.#cw ? x1 + padX : x1;
    const ny1 = this.#ch > 0 && y1 > this.#cy0 + this.#ch ? y1 + padY : y1;
    const nw = nx1 - nx0;
    const nh = ny1 - ny0;
    const table: (A | undefined)[] = new Array(nw * nh);
    for (let ty = 0; ty < this.#ch; ty++)
      for (let tx = 0; tx < this.#cw; tx++) {
        const a = this.#table[ty * this.#cw + tx];
        if (a) table[(ty + this.#cy0 - ny0) * nw + (tx + this.#cx0 - nx0)] = a;
      }
    this.#table = table;
    this.#cx0 = nx0;
    this.#cy0 = ny0;
    this.#cw = nw;
    this.#ch = nh;
  }
}
