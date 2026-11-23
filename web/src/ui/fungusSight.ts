import {
  CELL,
  cellOf,
  centreX,
  centreY,
  ChunkLayer,
  CHUNK,
  CHUNK_BITS,
  chunkKey,
  chunkOf,
  R,
  type Colony,
  type Game,
} from "../colony/index.ts";
import { BODY_EVERY, bodySight, hostSight } from "./fog/observers.ts";

// What the field shows of the colonies' scent (PRD §65, ja-pc72.1): only what the fungus's hosts have sensed. Every frame,
// each infected ant of any colony marks the cells within its antennae's reach with the time; a cell's trails and alarm
// show as strongly as that mark is fresh, fading over SENSED_FADE. You are the fungus: you know what your hosts smell,
// where they walk, for a while. A picture only: no ant senses it, and the game never reads it. Who sees (the hosts of the
// player's strain and the fungus's living body) is fog/observers.ts (docs/fog-of-war.md §4.1, ja-1ypq.1).

/** Sim seconds over which a sensed cell fades from full to nothing. */
export const SENSED_FADE = 20;
/** How far past an ant's sensors its hosts' noses reach, in cells: the sensors probe sensorDistance ahead, to either side. */
export const REACH_MARGIN = 1;

/** How strongly a cell last sensed at `t` shows at `now`: 1 just sensed, 0 after SENSED_FADE (or never). */
export function sightOf(t: number, now: number): number {
  return t === -Infinity ? 0 : Math.max(0, Math.min(1, 1 - (now - t) / SENSED_FADE));
}

/**
 * The sim time each cell was last sensed by a host, per layer (0: the plane; 1: the curtain). A
 * chunk no host has sensed for SENSED_FADE shows nothing, so it is dropped and leaves one bit: revealed (the fog of
 * war's, endless-world §8). What it holds then grows with the ground hosts sense now, not all they ever sensed (§7).
 */
export class SensedMap {
  #layers = new Map<number, ChunkLayer<Float32Array>>();
  /** per layer: each chunk kept, by chunkKey, and the last time a host sensed any cell of it */
  #fresh = new Map<number, Map<number, number>>();
  /** per layer: every chunk a host has ever sensed (chunkKey) */
  #revealed = new Map<number, Set<number>>();
  /** the time of the last stamp: what `sightOf` is read against */
  now = 0;
  /** the sim time the body was last stamped (it is stamped every BODY_EVERY, not every step) */
  #bodyAt = -Infinity;

  /** Whether a host has ever sensed any cell of chunk (cx, cy) on layer `l`. */
  revealed(l: number, cx: number, cy: number): boolean {
    return this.#revealed.get(l)?.has(chunkKey(cx, cy)) ?? false;
  }

  /** Chunks a host has ever sensed on layer `l`. */
  revealedCount(l: number): number {
    return this.#revealed.get(l)?.size ?? 0;
  }

  /** The layer's grid, or null before any host has sensed there. */
  layer(l: number): ChunkLayer<Float32Array> | null {
    return this.#layers.get(l) ?? null;
  }

  /** How strongly cell (gx, gy) of layer `l` shows now. */
  sight(l: number, gx: number, gy: number): number {
    const c = this.#layers.get(l)?.chunk(gx >> CHUNK_BITS, gy >> CHUNK_BITS);
    return c ? sightOf(c[((gy & (CHUNK - 1)) << CHUNK_BITS) | (gx & (CHUNK - 1))]!, this.now) : 0;
  }

  /** Mark what every host of `colonies` senses at sim time `now` (any strain). Time gone back (a restart, a load) forgets everything. */
  stamp(colonies: readonly Colony[], now: number, strain = -1): void {
    this.#begin(now);
    hostSight(colonies, strain, REACH_MARGIN, (l, x, y, r) => this.mark(l, x, y, r));
    this.#forget();
  }

  /**
   * Mark what the player's organisms sense after one sim step of `game` (call it once per step, not per frame, so what is seen does not
   * depend on the frame rate): the hosts of the fungus's strain every step, its living body every BODY_EVERY.
   */
  stampGame(game: Game): void {
    const now = game.time;
    this.#begin(now);
    // The game's fungus evolves one strain, the player's; without one (the lab, the tests) every strain counts.
    hostSight(game.colonies, game.fungus.evolution?.strain ?? -1, REACH_MARGIN, (l, x, y, r) => this.mark(l, x, y, r));
    if (now - this.#bodyAt >= BODY_EVERY) {
      this.#bodyAt = now;
      bodySight(game.fungus, game.layers.length, (l, x, y, r) => this.mark(l, x, y, r));
    }
    this.#forget();
  }

  #begin(now: number): void {
    if (now < this.now) {
      this.#layers.clear();
      this.#fresh.clear();
      this.#revealed.clear();
      this.#bodyAt = -Infinity;
    }
    this.now = now;
  }

  /** Drop every chunk faded right out: it shows nothing now, and its revealed bit stays. */
  #forget(): void {
    for (const [l, fresh] of this.#fresh) {
      const grid = this.#layers.get(l)!;
      for (const [key, t] of fresh)
        if (this.now - t >= SENSED_FADE) {
          fresh.delete(key);
          const [cx, cy] = chunkOf(key);
          grid.drop(cx, cy);
        }
    }
  }

  /** Mark the cells whose centres lie within `r` of world point (x, y) on layer `l`, at the current time. */
  mark(l: number, x: number, y: number, r: number): void {
    let grid = this.#layers.get(l);
    if (!grid) this.#layers.set(l, (grid = new ChunkLayer((n) => new Float32Array(n), -Infinity)));
    let fresh = this.#fresh.get(l);
    if (!fresh) this.#fresh.set(l, (fresh = new Map()));
    let revealed = this.#revealed.get(l);
    if (!revealed) this.#revealed.set(l, (revealed = new Set()));
    cellOf(x, y);
    const gx0 = CELL[0];
    const gy0 = CELL[1];
    const rows = Math.ceil(r / R) + 1;
    const cols = Math.ceil(r) + 1;
    const r2 = r * r;
    for (let gy = gy0 - rows; gy <= gy0 + rows; gy++) {
      if (gy < 0) continue;
      const dy = centreY(gy) - y;
      const inside = (gx: number) => {
        const dx = centreX(gx, gy) - x;
        return dx * dx + dy * dy <= r2;
      };
      // A disc intersects each row in one interval. Keep the exact circle test
      // at its edges, then update a contiguous range within each touched chunk.
      let left = gx0 - cols;
      let right = gx0 + cols;
      while (left <= right && !inside(left)) left++;
      while (right > left && !inside(right)) right--;
      const cy = gy >> CHUNK_BITS;
      const row = (gy & (CHUNK - 1)) << CHUNK_BITS;
      for (let gx = left; gx <= right;) {
        const cx = gx >> CHUNK_BITS;
        const end = Math.min(right + 1, (cx + 1) * CHUNK);
        const start = row + (gx & (CHUNK - 1));
        grid.ensure(cx, cy).fill(this.now, start, start + end - gx);
        const key = chunkKey(cx, cy);
        if (fresh.get(key) !== this.now) {
          fresh.set(key, this.now);
          revealed.add(key);
        }
        gx = end;
      }
    }
  }
}
