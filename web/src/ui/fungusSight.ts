import { CELL, cellOf, centreX, centreY, ChunkLayer, CHUNK, CHUNK_BITS, INFECTED, R, type Colony } from "../colony/index.ts";

// What the field shows of the colonies' scent (PRD §65, ja-pc72.1): only what the fungus's hosts have sensed. Every frame,
// each infected ant of any colony marks the cells within its antennae's reach with the time; a cell's trails and alarm
// show as strongly as that mark is fresh, fading over SENSED_FADE. You are the fungus: you know what your hosts smell,
// where they walk, for a while. A picture only: no ant senses it, and the game never reads it.

/** Sim seconds over which a sensed cell fades from full to nothing. */
export const SENSED_FADE = 20;
/** How far past an ant's sensors its hosts' noses reach, in cells: the sensors probe sensorDistance ahead, to either side. */
export const REACH_MARGIN = 1;

/** How strongly a cell last sensed at `t` shows at `now`: 1 just sensed, 0 after SENSED_FADE (or never). */
export function sightOf(t: number, now: number): number {
  return t === -Infinity ? 0 : Math.max(0, Math.min(1, 1 - (now - t) / SENSED_FADE));
}

/** The sim time each cell was last sensed by a host, per layer (0: the plane or the one map; 1: one world's curtain). */
export class SensedMap {
  #layers = new Map<number, ChunkLayer<Float32Array>>();
  /** the time of the last stamp: what `sightOf` is read against */
  now = 0;

  /** The layer's grid, or null before any host has sensed there. */
  layer(l: number): ChunkLayer<Float32Array> | null {
    return this.#layers.get(l) ?? null;
  }

  /** How strongly cell (gx, gy) of layer `l` shows now. */
  sight(l: number, gx: number, gy: number): number {
    const c = this.#layers.get(l)?.chunk(gx >> CHUNK_BITS, gy >> CHUNK_BITS);
    return c ? sightOf(c[((gy & (CHUNK - 1)) << CHUNK_BITS) | (gx & (CHUNK - 1))]!, this.now) : 0;
  }

  /** Mark what every host of `colonies` senses at sim time `now`. Time gone back (a restart, a load) forgets everything. */
  stamp(colonies: readonly Colony[], now: number): void {
    if (now < this.now) this.#layers.clear();
    this.now = now;
    for (const c of colonies) {
      const r = c.params.sensorDistance + REACH_MARGIN;
      for (let i = 0; i < c.n; i++) if (c.alive[i] && c.load[i] >= INFECTED) this.mark(c.layer[i] ?? 0, c.x[i], c.y[i], r);
    }
  }

  /** Mark the cells whose centres lie within `r` of world point (x, y) on layer `l`, at the current time. */
  mark(l: number, x: number, y: number, r: number): void {
    let grid = this.#layers.get(l);
    if (!grid) this.#layers.set(l, (grid = new ChunkLayer((n) => new Float32Array(n), -Infinity)));
    cellOf(x, y);
    const gx0 = CELL[0];
    const gy0 = CELL[1];
    const rows = Math.ceil(r / R) + 1;
    const cols = Math.ceil(r) + 1;
    const r2 = r * r;
    for (let gy = gy0 - rows; gy <= gy0 + rows; gy++) {
      if (gy < 0) continue;
      const dy = centreY(gy) - y;
      for (let gx = gx0 - cols; gx <= gx0 + cols; gx++) {
        const dx = centreX(gx, gy) - x;
        if (dx * dx + dy * dy > r2) continue;
        const a = grid.ensure(gx >> CHUNK_BITS, gy >> CHUNK_BITS);
        a[((gy & (CHUNK - 1)) << CHUNK_BITS) | (gx & (CHUNK - 1))] = this.now;
      }
    }
  }
}
