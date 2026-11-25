import { CELL, CHUNK, CHUNK_BITS, cellOf, chunkKey, decode, encode } from "../../colony/index.ts";
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
  /**
   * What chunk (cx, cy) reads while nothing has changed it, when that can be made again from the seed (the endless plane's own rock and food, a layer's
   * `empty`): a snapshot that matches it on every explored cell is dropped and read from here instead (F7, ja-1ypq.7). Absent: the snapshot is kept.
   */
  regen?(cx: number, cy: number): Cells | undefined;
}

const WORDS = (CHUNK * CHUNK) >> 5;
const BLOCKS = 1 << (2 * (CHUNK_BITS - 3));
const BLOCK_ROW = 1 << (CHUNK_BITS - 3);

interface Chunk {
  l: number;
  cx: number;
  cy: number;
  /** explored: one bit a cell */
  bits: Uint32Array;
  /** per 8 × 8 block, the sim time it was last seen (-1: never) */
  seen: Float32Array;
  /** the snapshot of each source of this layer, by source name, allocated when its first cell is seen */
  snaps: Map<string, Cells>;
  /** sensed since `compact` last checked it */
  fresh?: boolean;
  /** the sources whose snapshot was dropped as equal to what `Source.regen` gives: read from it (compact) */
  gone?: Set<string>;
}

/** The chunks explored on a layer, as a box: from chunk (cx0, cy0) to chunk (cx1, cy1), both inclusive. */
export interface ChunkBox {
  cx0: number;
  cy0: number;
  cx1: number;
  cy1: number;
}

/** How many chunks `compact` checks in one call by default: each costs one regeneration of the plane's chunk when it is not cached (20-40 ms cold). */
export const COMPACT_BUDGET = 1;

/** How many regenerated chunk arrays `Knowledge` keeps for reading dropped snapshots (rock 4 KB, food 16 KB: at most about 8 MB): a zoomed-out view, and the minimap's window, of dropped chunks. */
export const REGEN_KEPT = 512;

/** The snapshot of a chunk saved: its parts as plain values (typed arrays), encoded for JSON by `Knowledge.save`. */
interface SavedChunk {
  cx: number;
  cy: number;
  bits: Uint32Array;
  seen: Float32Array;
  snaps: [string, Cells][];
  gone: string[];
}

export class Knowledge {
  readonly #sensed: SensedMap;
  readonly #sourcesOf: (layer: number) => readonly Source[];
  readonly #liveAt: number;
  readonly #layers = new Map<number, Map<number, Chunk>>();
  /** the box of chunks explored on each layer, grown when a chunk is first sensed (the camera's bound under the fog, F7b) */
  readonly #boxes = new Map<number, ChunkBox>();
  /** the chunk looked up last: a draw reads a run of neighbouring cells, so most reads skip the two map lookups (hot on a phone) */
  #lastL = -1;
  #lastK = -1;
  #last: Chunk | undefined;
  /** the chunks `compact` has still to check this pass, and where it is */
  #queue: Chunk[] = [];
  #at = 0;
  /**
   * What dropped snapshots read as, by layer, source and chunk: a painter reads rock, then food, then spoil for the same cell, and the
   * regeneration behind a read is the plane's chunk (20-40 ms cold), so each is made once and kept (at most REGEN_KEPT chunks of it).
   */
  readonly #regen = new Map<string, Cells | undefined>();

  /**
   * `sources` is the ground the knowledge copies: a list, or a function of the layer for a game whose layers come and go (a line's curtain
   * founded mid-game, ja-1ypq.7); the function is asked once for each layer.
   */
  constructor(sensed: SensedMap, sources: readonly Source[] | ((layer: number) => readonly Source[]), grace = GRACE) {
    this.#sensed = sensed;
    if (typeof sources === "function") {
      const byLayer = new Map<number, readonly Source[]>();
      this.#sourcesOf = (l) => {
        let list = byLayer.get(l);
        if (!list) byLayer.set(l, (list = sources(l)));
        return list;
      };
    } else {
      const byLayer = new Map<number, Source[]>();
      for (const src of sources) byLayer.set(src.layer, [...(byLayer.get(src.layer) ?? []), src]);
      this.#sourcesOf = (l) => byLayer.get(l) ?? [];
    }
    // sight() is 1 when just sensed and falls to 0 over SENSED_FADE: live is the first `grace` of that.
    this.#liveAt = 1 - grace / SENSED_FADE - 1e-6;
    sensed.onSeen = (l, cx, cy, start, end) => this.#see(l, cx, cy, start, end);
    sensed.onReset = () => {
      this.#layers.clear();
      this.#boxes.clear();
      this.#last = undefined;
      this.#queue = [];
      this.#regen.clear();
    };
  }

  #see(l: number, cx: number, cy: number, start: number, end: number): void {
    let chunks = this.#layers.get(l);
    if (!chunks) this.#layers.set(l, (chunks = new Map()));
    const key = chunkKey(cx, cy);
    let c = chunks.get(key);
    if (!c) {
      chunks.set(
        key,
        (c = { l, cx, cy, fresh: true, bits: new Uint32Array(WORDS), seen: new Float32Array(BLOCKS).fill(-1), snaps: new Map() }),
      );
      this.#grow(l, cx, cy);
    }
    c.fresh = true;
    for (let i = start; i < end; i++) c.bits[i >> 5]! |= 1 << (i & 31);
    // A run lies in one row, so its blocks are one block row's.
    const row = (start >> CHUNK_BITS) >> 3;
    for (let b = (start & (CHUNK - 1)) >> 3; b <= ((end - 1) & (CHUNK - 1)) >> 3; b++) c.seen[row * BLOCK_ROW + b] = this.#sensed.now;
    for (const src of this.#sourcesOf(l)) {
      const truth = src.at(cx, cy);
      if (!truth) continue;
      let snap = c.snaps.get(src.name);
      if (!snap) {
        c.snaps.set(src.name, (snap = new (truth.constructor as new (n: number) => Cells)(truth.length)));
        // a snapshot dropped as equal to the seed's ground comes back whole, so the cells not sensed this time keep what they read
        if (c.gone?.delete(src.name)) {
          const was = src.regen?.(cx, cy);
          if (was) for (let i = 0; i < was.length; i++) snap[i] = was[i]!;
        }
      }
      for (let i = start; i < end; i++) snap[i] = truth[i]!;
    }
  }

  #grow(l: number, cx: number, cy: number): void {
    const b = this.#boxes.get(l);
    if (!b) this.#boxes.set(l, { cx0: cx, cy0: cy, cx1: cx, cy1: cy });
    else {
      b.cx0 = Math.min(b.cx0, cx);
      b.cy0 = Math.min(b.cy0, cy);
      b.cx1 = Math.max(b.cx1, cx);
      b.cy1 = Math.max(b.cy1, cy);
    }
  }

  /** The box of chunks any cell of which has been sensed on layer `l`, or undefined while none has (it only grows; read it, never change it). */
  bounds(l: number): Readonly<ChunkBox> | undefined {
    return this.#boxes.get(l);
  }

  /** Chunk (cx, cy) of layer `l`, if any cell of it has been sensed (the last one asked for is remembered). */
  #chunk(l: number, cx: number, cy: number): Chunk | undefined {
    const key = chunkKey(cx, cy);
    if (this.#last && l === this.#lastL && key === this.#lastK) return this.#last;
    const c = this.#layers.get(l)?.get(key);
    if (c) {
      this.#lastL = l;
      this.#lastK = key;
      this.#last = c;
    }
    return c;
  }

  /** Whether cell (gx, gy) of layer `l` has ever been sensed. */
  explored(l: number, gx: number, gy: number): boolean {
    const c = this.#chunk(l, gx >> CHUNK_BITS, gy >> CHUNK_BITS);
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
    const c = this.#chunk(l, gx >> CHUNK_BITS, gy >> CHUNK_BITS);
    return c && this.#snapOf(c, name)?.[((gy & (CHUNK - 1)) << CHUNK_BITS) | (gx & (CHUNK - 1))];
  }

  /** Chunk `c`'s snapshot of source `name`: held, or (dropped as equal to the seed's ground) what the source regenerates. */
  #snapOf(c: Chunk, name: string): Cells | undefined {
    const held = c.snaps.get(name);
    if (held || !c.gone?.has(name)) return held;
    const key = `${c.l}|${name}|${c.cx}|${c.cy}`;
    if (this.#regen.has(key)) return this.#regen.get(key);
    const cells = this.#sourcesOf(c.l)
      .find((s) => s.name === name)
      ?.regen?.(c.cx, c.cy);
    if (this.#regen.size >= REGEN_KEPT) this.#regen.delete(this.#regen.keys().next().value as string); // the oldest goes, not all of them
    this.#regen.set(key, cells);
    return cells;
  }

  /** The sim time the 8 × 8 block holding cell (gx, gy) was last seen (any of its cells); -1 if never. */
  lastSeen(l: number, gx: number, gy: number): number {
    const c = this.#chunk(l, gx >> CHUNK_BITS, gy >> CHUNK_BITS);
    if (!c) return -1;
    return c.seen[(((gy & (CHUNK - 1)) >> 3) << (CHUNK_BITS - 3)) | ((gx & (CHUNK - 1)) >> 3)]!;
  }

  /** A chunk's explored bits and snapshots for painting it whole; undefined while none of it has been sensed. */
  view(l: number, cx: number, cy: number): { bits: Uint32Array; snap(name: string): Cells | undefined } | undefined {
    const c = this.#chunk(l, cx, cy);
    return c && { bits: c.bits, snap: (name) => this.#snapOf(c, name) };
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

  /**
   * Drop the snapshots that say nothing the seed does not (F7, ja-1ypq.7): of up to `budget` chunks no observer senses now, a source's snapshot
   * that matches what the source regenerates on every explored cell is freed, and read from the source from then on, so memory grows with
   * the ground changed out of sight, not the ground explored. A cell changed after it was seen keeps its snapshot, which still shows what was seen.
   * A chunk checked costs one regeneration of the plane's chunk when it is not cached, so call this a chunk or two a second, not every step.
   * Returns the chunks it checked.
   */
  compact(budget = COMPACT_BUDGET): number {
    let spent = 0;
    for (let pass = 0; pass < 2 && spent < budget; pass++) {
      if (this.#at >= this.#queue.length) {
        this.#queue = [];
        this.#at = 0;
        for (const chunks of this.#layers.values()) for (const c of chunks.values()) if (c.fresh && c.snaps.size > 0) this.#queue.push(c);
      }
      while (this.#at < this.#queue.length && spent < budget) {
        const c = this.#queue[this.#at++]!;
        // live, or sensed lately, or already compacted: nothing to do now
        if (!c.fresh || c.snaps.size === 0 || this.#sensed.newest(c.l, c.cx, c.cy) !== undefined) continue;
        c.fresh = false;
        const sources = this.#sourcesOf(c.l);
        let tried = false;
        for (const [name, snap] of c.snaps) {
          const was = sources.find((s) => s.name === name)?.regen?.(c.cx, c.cy);
          if (!was) continue;
          tried = true;
          let same = true;
          for (let i = 0; i < snap.length && same; i++) if ((c.bits[i >> 5]! & (1 << (i & 31))) !== 0 && snap[i] !== was[i]) same = false;
          if (!same) continue;
          c.snaps.delete(name);
          (c.gone ??= new Set()).add(name);
        }
        if (tried) spent++;
      }
    }
    return spent;
  }

  /** Bytes held: the explored bits, the block times and the snapshots; of layer `l` alone when given. */
  bytes(l?: number): number {
    let n = 0;
    for (const [layer, chunks] of this.#layers)
      if (l === undefined || layer === l)
        for (const c of chunks.values()) {
          n += c.bits.byteLength + c.seen.byteLength;
          for (const s of c.snaps.values()) n += s.byteLength;
        }
    return n;
  }

  /** Everything remembered, as JSON (typed arrays as base64): what a save of the page's fog holds. */
  save(): unknown {
    const layers: [number, SavedChunk[]][] = [];
    for (const [l, chunks] of this.#layers)
      layers.push([
        l,
        [...chunks.values()].map((c) => ({
          cx: c.cx,
          cy: c.cy,
          bits: c.bits,
          seen: c.seen,
          snaps: [...c.snaps],
          gone: [...(c.gone ?? [])],
        })),
      ]);
    return encode({ layers });
  }

  /** Put a `save()` back in place of what is remembered now. */
  load(saved: unknown): void {
    const { layers } = decode(saved) as { layers: [number, SavedChunk[]][] };
    this.#layers.clear();
    this.#boxes.clear();
    this.#last = undefined;
    this.#queue = [];
    this.#at = 0;
    this.#regen.clear();
    for (const [l, list] of layers) {
      const chunks = new Map<number, Chunk>();
      for (const s of list) {
        const c: Chunk = { l, cx: s.cx, cy: s.cy, bits: s.bits, seen: s.seen, snaps: new Map(s.snaps) };
        if (s.gone.length > 0) c.gone = new Set(s.gone);
        chunks.set(chunkKey(s.cx, s.cy), c);
        this.#grow(l, s.cx, s.cy);
      }
      this.#layers.set(l, chunks);
    }
  }
}
