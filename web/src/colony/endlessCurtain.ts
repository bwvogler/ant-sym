// The endless world's curtain food, pure (docs/endless-world.md §3, PRD §66 E2.2, `ja-r84`): a line's curtain ground and its buried
// food are functions of (seed, the line's salt, the block of columns), so any order of visits gives the same chunks. Where the bounded
// curtain keeps food only if some colony can reach it from a nest across the WHOLE curtain (`keepReachableFood`), here the reach is
// a flood over the block's window: the block and its two neighbours, from the crust, through every cell that is not rock (digging).
// Food sealed in stone inside the window is dropped; a pocket sealed by more than a window can still hold food nobody reaches, which
// costs nothing (§3).
//
// Pockets are placed as `buryAlong` places them (each 64-column block × 64-row band from its own stream, 12 tries each), but keep clear
// of the nests the WORLD placed on this line (`nests`, in the curtain's own coordinates), never of foundings: those are history.
// The first line's salt is 0, so its ground and food keep the bounded curtain's seeds (E3).

import { CHUNK, CHUNK_BITS, local } from "./chunks.ts";
import { centreX, centreY, nx, ny, R } from "./hex.ts";
import { CRUST, CURTAIN_DEPTH, CURTAIN_WORLD, groundCell, groundSeed } from "./oneWorld.ts";
import { AIR, hash4, mulberry32, nearNests, OPEN, ROCK, rockCut, soilCut, type Nest } from "./world.ts";

/** Rows of the curtain, sky included. */
export const CURTAIN_RS = CRUST + CURTAIN_DEPTH;
/** Row bands of 64 rows: chunk rows 0 … CURTAIN_BANDS − 1. */
export const CURTAIN_BANDS = Math.ceil(CURTAIN_RS / CHUNK);

/** A line's seed: the world seed itself for the first line (salt 0: today's ground and food), else mixed with the salt. */
export function lineSeed(seed: number, salt: number): number {
  return salt === 0 ? seed : hash4(seed, 98, salt, 0);
}

export interface CurtainChunk {
  rock: Uint8Array;
  food: Float32Array;
}

interface Pocket {
  x: number;
  y: number;
  radius: number;
}

export class EndlessCurtain {
  readonly seed: number;
  readonly salt: number;
  readonly #seed: number;
  readonly #gs: number;
  readonly #cut = rockCut(CURTAIN_WORLD.rockiness);
  readonly #scut = soilCut(CURTAIN_WORLD.soil);
  readonly #near: (x: number, y: number, d: number) => boolean;
  readonly #cacheBlocks: number;
  #pockets = new Map<string, Pocket[]>();
  #blocks = new Map<number, CurtainChunk[]>();

  /**
   * `nests`: the nests the world placed on this line, in the curtain's coordinates (s, row), fixed for the line's life. `cacheBlocks`: how many
   * blocks the caches hold before they are dropped (they only save work; a small number is for tests).
   */
  constructor(seed: number, salt = 0, nests: readonly Nest[] = [], cacheBlocks = 256) {
    this.#cacheBlocks = cacheBlocks;
    this.seed = seed;
    this.salt = salt;
    this.#seed = lineSeed(seed, salt);
    this.#gs = groundSeed(this.#seed);
    this.#near = nearNests(nests);
  }

  /** The curtain's ground at column s, row y before any pocket opens it: sky above the crust, then the side view's ground. */
  groundAt(s: number, y: number): number {
    if (y < 0 || y >= CURTAIN_RS) return ROCK;
    if (y < CRUST) return AIR;
    return groundCell(this.#gs, y - CRUST, centreX(s, y), centreY(y), this.#cut, this.#scut);
  }

  /** Block bs's pockets, band by (the bounded `buryAlong`'s draw, order kept), clear of the world's nests. */
  #bandPockets(bs: number, by: number): Pocket[] {
    const key = `${bs},${by}`;
    const have = this.#pockets.get(key);
    if (have) return have;
    const o = CURTAIN_WORLD;
    const r = mulberry32(hash4(this.#seed, 79, bs, by));
    const count = Math.floor(o.patchesPerChunk) + (r() < o.patchesPerChunk % 1 ? 1 : 0);
    const out: Pocket[] = [];
    for (let p = 0; p < count; p++)
      for (let tries = 0; tries < 12; tries++) {
        const row = by * CHUNK + Math.floor(r() * CHUNK);
        const s = bs * CHUNK + Math.floor(r() * CHUNK);
        if (row >= CURTAIN_RS - 3 || row < CRUST + 10) continue;
        const x = centreX(s, row);
        const y = centreY(row);
        const radius = 2 + r() * 2;
        if (this.#near(x, y, o.foodMinDist + radius + 1)) continue;
        out.push({ x, y, radius });
        break;
      }
    if (this.#pockets.size >= 4 * this.#cacheBlocks) this.#pockets.clear();
    this.#pockets.set(key, out);
    return out;
  }

  /** Block bs's chunks, one per band: its columns' ground, opened and fed by the pockets of the block and its neighbours that reach it. */
  #block(bs: number): CurtainChunk[] {
    const have = this.#blocks.get(bs);
    if (have) return have;
    const w = 3 * CHUNK;
    const h = CURTAIN_RS;
    const s0 = (bs - 1) << CHUNK_BITS;
    const rock = new Uint8Array(w * h);
    const food = new Float32Array(w * h);
    for (let y = 0; y < h; y++) for (let i = 0; i < w; i++) rock[y * w + i] = this.groundAt(s0 + i, y);
    const { foodPerCell } = CURTAIN_WORLD;
    for (let b = bs - 1; b <= bs + 1; b++)
      for (let by = 0; by < CURTAIN_BANDS; by++)
        for (const p of this.#bandPockets(b, by)) {
          const ya = Math.max(CRUST, Math.floor(p.y / R - p.radius / R - 1));
          const yb = Math.min(h - 1, Math.ceil(p.y / R + p.radius / R));
          for (let y = ya; y <= yb; y++)
            for (let s = Math.floor(p.x - p.radius - 1); s <= Math.ceil(p.x + p.radius); s++) {
              const i = s - s0;
              if (i < 0 || i >= w || Math.hypot(centreX(s, y) - p.x, centreY(y) - p.y) > p.radius) continue;
              rock[y * w + i] = OPEN;
              food[y * w + i] = foodPerCell;
            }
        }
    // Reach: digging from the crust through everything that is not rock; food outside it is dropped.
    const reach = new Uint8Array(w * h);
    const queue = new Int32Array(w * h);
    let tail = 0;
    for (let i = 0; i < w; i++) {
      const o = CRUST * w + i;
      if (rock[o] !== ROCK && rock[o] !== AIR) {
        reach[o] = 1;
        queue[tail++] = o;
      }
    }
    for (let head = 0; head < tail; head++) {
      const o = queue[head]!;
      const i = o % w;
      const y = (o - i) / w;
      for (let d = 0; d < 6; d++) {
        const ax = nx(i + s0, y, d) - s0;
        const ay = ny(y, d);
        if (ax < 0 || ax >= w || ay < CRUST || ay >= h) continue;
        const n = ay * w + ax;
        if (reach[n] || rock[n] === ROCK || rock[n] === AIR) continue;
        reach[n] = 1;
        queue[tail++] = n;
      }
    }
    const out: CurtainChunk[] = [];
    for (let by = 0; by < CURTAIN_BANDS; by++) {
      const c: CurtainChunk = { rock: new Uint8Array(CHUNK * CHUNK), food: new Float32Array(CHUNK * CHUNK) };
      for (let j = 0; j < CHUNK; j++) {
        const y = by * CHUNK + j;
        if (y >= h) {
          c.rock.fill(ROCK, local(0, j), local(0, j) + CHUNK);
          continue;
        }
        for (let i = 0; i < CHUNK; i++) {
          const o = y * w + CHUNK + i;
          c.rock[local(i, j)] = rock[o]!;
          if (food[o] && reach[o]) c.food[local(i, j)] = food[o]!;
        }
      }
      out.push(c);
    }
    if (this.#blocks.size >= this.#cacheBlocks) this.#blocks.clear();
    this.#blocks.set(bs, out);
    return out;
  }

  /** Chunk (bs, by) of the curtain: columns 64·bs … 64·bs + 63, rows 64·by … 64·by + 63, rows past the curtain's floor rock. */
  chunk(bs: number, by: number): CurtainChunk {
    if (by < 0 || by >= CURTAIN_BANDS) throw new Error(`EndlessCurtain: no band ${by}`);
    return this.#block(bs)[by]!;
  }

  /** The food generated in block bs, all bands. */
  foodInBlock(bs: number): number {
    let t = 0;
    for (const c of this.#block(bs)) for (const v of c.food) t += v;
    return t;
  }
}
