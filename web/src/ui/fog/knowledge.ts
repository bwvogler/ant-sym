import { CELL, CHUNK, CHUNK_BITS, cellOf, chunkKey } from "../../colony/index.ts";
import { SENSED_FADE, type SensedMap } from "../fungusSight.ts";

// What the fungus knows of the ground (docs/fog-of-war.md §4.2-4.3, PRD §89, ja-1ypq.2). Three states per cell: unknown (never
// sensed), remembered (sensed before, no observer there now) and live (an observer senses it now, or did within GRACE). A picture
// only: nothing in the simulation reads it. Live comes from SensedMap's marks; this adds what they leave out, the memory:
//   - an explored bit per cell, set on first sight and never cleared (512 B a chunk);
//   - a snapshot of the ground as last seen: each cell of each `Source` is copied from the truth while the cell is live, so a
//     remembered cell keeps what its observer last saw, and a cell outside a walking host's disc keeps its own last sight;
//   - when a block of 8 × 8 cells was last seen, for "last seen N s ago".
// Draw every explored cell from its snapshot: a cell still live within the grace of its last sensing is at most GRACE stale, and the
// snapshot is what it will show when it turns remembered, so nothing pops. `state` decides what else shows there (ants only where live).
// Ants are never remembered (owner, 2026-11-23): they are not a Source.

/**
 * Sim seconds a cell stays live after its last observer senses it: the edge of a walking host's disc must not flicker, and the
 * living body, stamped every BODY_EVERY (fog/observers.ts), must stay live between its stamps, so GRACE exceeds BODY_EVERY.
 */
export const GRACE = 1.5;

export const UNKNOWN = 0;
export const REMEMBERED = 1;
export const LIVE = 2;
export type FogState = typeof UNKNOWN | typeof REMEMBERED | typeof LIVE;

/** A cell array a chunk of layer `layer` holds: its flat chunk array of 64 × 64 cells, or undefined where the truth has none. */
export type Cells = Uint8Array | Int8Array | Uint16Array | Int16Array | Uint32Array | Int32Array | Float32Array | Float64Array;
export interface Source {
  /** what the renderer asks for the snapshot by */
  name: string;
  layer: number;
  /** the truth: chunk (cx, cy)'s cells now (never generates one) */
  at(cx: number, cy: number): Cells | undefined;
}

const WORDS = (CHUNK * CHUNK) >> 5;
const BLOCKS = 1 << (2 * (CHUNK_BITS - 3));
const BLOCK_ROW = 1 << (CHUNK_BITS - 3);

interface Chunk {
  /** explored: one bit a cell */
  bits: Uint32Array;
  /** per 8 × 8 block, the sim time it was last seen (-1: never) */
  seen: Float32Array;
  /** the snapshot of each source of this layer, by source name, allocated when its first cell is seen */
  snaps: Map<string, Cells>;
}

export class Knowledge {
  readonly #sensed: SensedMap;
  readonly #sources: readonly Source[];
  readonly #liveAt: number;
  readonly #layers = new Map<number, Map<number, Chunk>>();

  constructor(sensed: SensedMap, sources: readonly Source[], grace = GRACE) {
    this.#sensed = sensed;
    this.#sources = sources;
    // sight() is 1 when just sensed and falls to 0 over SENSED_FADE: live is the first `grace` of that.
    this.#liveAt = 1 - grace / SENSED_FADE - 1e-6;
    sensed.onSeen = (l, cx, cy, start, end) => this.#see(l, cx, cy, start, end);
    sensed.onReset = () => this.#layers.clear();
  }

  #see(l: number, cx: number, cy: number, start: number, end: number): void {
    let chunks = this.#layers.get(l);
    if (!chunks) this.#layers.set(l, (chunks = new Map()));
    const key = chunkKey(cx, cy);
    let c = chunks.get(key);
    if (!c) chunks.set(key, (c = { bits: new Uint32Array(WORDS), seen: new Float32Array(BLOCKS).fill(-1), snaps: new Map() }));
    for (let i = start; i < end; i++) c.bits[i >> 5]! |= 1 << (i & 31);
    // A run lies in one row, so its blocks are one block row's.
    const row = (start >> CHUNK_BITS) >> 3;
    for (let b = (start & (CHUNK - 1)) >> 3; b <= ((end - 1) & (CHUNK - 1)) >> 3; b++) c.seen[row * BLOCK_ROW + b] = this.#sensed.now;
    for (const src of this.#sources) {
      if (src.layer !== l) continue;
      const truth = src.at(cx, cy);
      if (!truth) continue;
      let snap = c.snaps.get(src.name);
      if (!snap) c.snaps.set(src.name, (snap = new (truth.constructor as new (n: number) => Cells)(truth.length)));
      for (let i = start; i < end; i++) snap[i] = truth[i]!;
    }
  }

  /** Whether cell (gx, gy) of layer `l` has ever been sensed. */
  explored(l: number, gx: number, gy: number): boolean {
    const c = this.#layers.get(l)?.get(chunkKey(gx >> CHUNK_BITS, gy >> CHUNK_BITS));
    if (!c) return false;
    const i = ((gy & (CHUNK - 1)) << CHUNK_BITS) | (gx & (CHUNK - 1));
    return (c.bits[i >> 5]! & (1 << (i & 31))) !== 0;
  }

  /** The cell's state: unknown, remembered, or live. */
  state(l: number, gx: number, gy: number): FogState {
    if (!this.explored(l, gx, gy)) return UNKNOWN;
    return this.#sensed.sight(l, gx, gy) >= this.#liveAt ? LIVE : REMEMBERED;
  }

  /** What source `name` held at cell (gx, gy) of layer `l` when it was last live there; undefined if never seen. Read it only where state() is not unknown. */
  snapshot(l: number, name: string, gx: number, gy: number): number | undefined {
    const c = this.#layers.get(l)?.get(chunkKey(gx >> CHUNK_BITS, gy >> CHUNK_BITS));
    return c?.snaps.get(name)?.[((gy & (CHUNK - 1)) << CHUNK_BITS) | (gx & (CHUNK - 1))];
  }

  /** The sim time the 8 × 8 block holding cell (gx, gy) was last seen (any of its cells); -1 if never. */
  lastSeen(l: number, gx: number, gy: number): number {
    const c = this.#layers.get(l)?.get(chunkKey(gx >> CHUNK_BITS, gy >> CHUNK_BITS));
    if (!c) return -1;
    return c.seen[(((gy & (CHUNK - 1)) >> 3) << (CHUNK_BITS - 3)) | ((gx & (CHUNK - 1)) >> 3)]!;
  }

  /** A chunk's explored bits and snapshots for painting it whole; undefined while none of it has been sensed. */
  view(l: number, cx: number, cy: number): { bits: Uint32Array; snap(name: string): Cells | undefined } | undefined {
    const c = this.#layers.get(l)?.get(chunkKey(cx, cy));
    return c && { bits: c.bits, snap: (name) => c.snaps.get(name) };
  }

  /** The state at world point (x, y) of layer `l`: what the actors drawn there (ants, brood, a queen) ask. */
  stateAt(l: number, x: number, y: number): FogState {
    cellOf(x, y);
    return this.state(l, CELL[0], CELL[1]);
  }

  /** Chunks with any explored cell on layer `l`. */
  chunks(l: number): number {
    return this.#layers.get(l)?.size ?? 0;
  }

  /** Bytes held: the explored bits, the block times and the snapshots. */
  bytes(): number {
    let n = 0;
    for (const chunks of this.#layers.values())
      for (const c of chunks.values()) {
        n += c.bits.byteLength + c.seen.byteLength;
        for (const s of c.snaps.values()) n += s.byteLength;
      }
    return n;
  }
}
