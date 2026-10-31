import { CHUNK, CHUNK_BITS, CHUNK_CELLS, ChunkLayer, chunkKey, chunkOf } from "./chunks.ts";
import type { WorldMap } from "./world.ts";

// Pheromone fields, pure: one chunked Float32 layer per channel, laid by
// ants, read by their sensors, evaporating and spreading every tick. This is
// the colony's free coordination: no ant talks to another, they all read the
// ground. Food trail: laid by ants carrying food home, so it leads to food.
// Home trail: laid by ants walking out, so it leads home. Alarm: painted by
// the fungus and laid in fights; it fades fast and ants steer away.
//
// Sparse: only *awake* chunks are stepped. A chunk wakes when scent is laid
// in it or a neighbour's facing edge holds some, and sleeps (zeroed) once
// everything in it has faded below SLEEP and no neighbour feeds it, so a
// large map with trails in a few places costs only those places. The step is double-buffered like a dense one: every chunk
// reads the old values of itself and its neighbours.

export type Channel = "food" | "home" | "alarm";
export const CHANNELS: Channel[] = ["food", "home", "alarm"];

export interface ChannelParams {
  /** share lost per second */
  evaporation: number;
  /** spread per second toward the 4-neighbour mean (0 = none) */
  diffusion: number;
}

export const DEFAULT_CHANNELS: Record<Channel, ChannelParams> = {
  food: { evaporation: 0.06, diffusion: 0.3 },
  home: { evaporation: 0.02, diffusion: 0.3 },
  alarm: { evaporation: 0.25, diffusion: 0.8 },
};

/** No cell holds more than this, so a crowded trail does not drown the gradient. */
export const MAX_LEVEL = 20;
/** A chunk whose every cell is below this is asleep: zeroed and not stepped. Far under any level a sensor acts on (FAINT = 0.05). */
export const SLEEP = 1e-4;

const EDGE = CHUNK - 1;

/** The longest a channel may go between steps: no step spreads more than 5 % or evaporates more than 2 % (and never more than ¼ s). */
export function stepInterval(p: ChannelParams): number {
  return Math.min(0.25, p.diffusion > 0 ? 0.05 / p.diffusion : Infinity, p.evaporation > 0 ? 0.02 / p.evaporation : Infinity);
}

/**
 * Below this a level is zero, so long-faded ground takes the cheap path. Far below SLEEP: a cell at
 * the faint front of a spreading trail gains only k/4 of its neighbour per step, so flushing at
 * SLEEP itself would stall faint fronts (measured: 7× too little five cells past a trail's end).
 */
const FLUSH = 1e-6;

function flush(v: number): number {
  return v < FLUSH ? 0 : v;
}

/** A neighbour's level across a chunk border: this cell's own level `v` when the neighbour is rock or off the map. */
function across(rock: Uint8Array | undefined, field: Float32Array | undefined, i: number, v: number): number {
  if (!rock || rock[i]) return v;
  return field ? (field[i] as number) : 0;
}

export class Pheromones {
  readonly map: WorldMap;
  readonly fields: Record<Channel, ChunkLayer<Float32Array>>;
  params: Record<Channel, ChannelParams>;
  readonly #awake: Record<Channel, Set<number>>;
  /** seconds owed per channel since its last step (advance) */
  #clock: Record<Channel, number> = { food: 0, home: 0, alarm: 0 };
  /** chunks a neighbour's edge spread scent into this step (they stay awake) */
  #fed = new Set<number>();
  /** spare chunk arrays for the double buffer */
  #pool: Float32Array[] = [];
  /** the four neighbours of the chunk being stepped: rock and field arrays, undefined where there are none */
  #nb: { rl?: Uint8Array; fl?: Float32Array; rr?: Uint8Array; fr?: Float32Array; ru?: Uint8Array; fu?: Float32Array; rd?: Uint8Array; fd?: Float32Array } = {};

  constructor(map: WorldMap, params: Record<Channel, ChannelParams> = DEFAULT_CHANNELS) {
    this.map = map;
    this.params = params;
    const layer = () => new ChunkLayer((n) => new Float32Array(n), 0);
    this.fields = { food: layer(), home: layer(), alarm: layer() };
    this.#awake = { food: new Set(), home: new Set(), alarm: new Set() };
  }

  /** Add to the cell under (x, y). */
  deposit(channel: Channel, x: number, y: number, amount: number): void {
    const cx = Math.floor(x);
    const cy = Math.floor(y);
    if (cx < 0 || cy < 0 || cx >= this.map.size.w || cy >= this.map.size.h) return;
    const f = this.fields[channel];
    f.set(cx, cy, Math.min(MAX_LEVEL, f.get(cx, cy) + amount));
    this.#awake[channel].add(chunkKey(cx >> CHUNK_BITS, cy >> CHUNK_BITS));
  }

  /** The level under (x, y); −1 off the map, so a sensor reads the edge as worse than bare ground. */
  read(channel: Channel, x: number, y: number): number {
    const cx = Math.floor(x);
    const cy = Math.floor(y);
    if (cx < 0 || cy < 0 || cx >= this.map.size.w || cy >= this.map.size.h) return -1;
    return this.fields[channel].get(cx, cy);
  }

  /** Awake chunks, summed over channels: what a step costs. */
  awakeChunks(): number {
    let s = 0;
    for (const ch of CHANNELS) s += this.#awake[ch].size;
    return s;
  }

  /** Evaporate and spread every channel by dt seconds, now. Rock cells hold nothing and take nothing. */
  step(dt: number): void {
    for (const ch of CHANNELS) this.#stepChannel(ch, dt);
  }

  /**
   * Let dt seconds pass: each channel steps only once enough time has built up for it, so a slow
   * trail (home, food) steps a few times a second and fast alarm many. On a large map the field
   * steps are most of a tick's cost. `phase` (0..1) offsets the clocks, so colonies step on
   * different ticks.
   */
  advance(dt: number): void {
    for (const ch of CHANNELS) {
      this.#clock[ch] += dt;
      if (this.#clock[ch] >= stepInterval(this.params[ch])) {
        this.#stepChannel(ch, this.#clock[ch]);
        this.#clock[ch] = 0;
      }
    }
  }

  /** Start each channel's clock part-way through its interval. */
  phase(fraction: number): void {
    for (const ch of CHANNELS) this.#clock[ch] = fraction * stepInterval(this.params[ch]);
  }

  #stepChannel(ch: Channel, dt: number): void {
    const awake = this.#awake[ch];
    if (awake.size === 0) return;
    const layer = this.fields[ch];
    const map = this.map;
    const maxCx = (map.size.w - 1) >> CHUNK_BITS;
    const maxCy = (map.size.h - 1) >> CHUNK_BITS;
    const keep = Math.max(0, 1 - this.params[ch].evaporation * dt);
    const k = Math.min(0.25, this.params[ch].diffusion * dt);

    // Wake the neighbours that scent can spread into this step: any whose shared edge holds some.
    // A chunk fed this way may not sleep this step, even if what reached it is still below SLEEP:
    // otherwise faint scent at a border would be wiped every step and never cross it.
    const fed = this.#fed;
    fed.clear();
    if (k > 0) {
      for (const key of [...awake]) {
        const [cx, cy] = chunkOf(key);
        const a = layer.chunk(cx, cy);
        if (!a) continue;
        let w = 0;
        let e = 0;
        let n = 0;
        let s = 0;
        for (let t = 0; t < CHUNK; t++) {
          w = Math.max(w, a[t << CHUNK_BITS] as number);
          e = Math.max(e, a[(t << CHUNK_BITS) | EDGE] as number);
          n = Math.max(n, a[t] as number);
          s = Math.max(s, a[(EDGE << CHUNK_BITS) | t] as number);
        }
        const wake = (nx: number, ny: number) => {
          const nk = chunkKey(nx, ny);
          awake.add(nk);
          fed.add(nk);
        };
        if (w > SLEEP && cx > 0) wake(cx - 1, cy);
        if (e > SLEEP && cx < maxCx) wake(cx + 1, cy);
        if (n > SLEEP && cy > 0) wake(cx, cy - 1);
        if (s > SLEEP && cy < maxCy) wake(cx, cy + 1);
      }
    }

    // Step every awake chunk into a fresh buffer, reading only old values.
    const next: { cx: number; cy: number; out: Float32Array; max: number }[] = [];
    for (const key of awake) {
      const [cx, cy] = chunkOf(key);
      const f = layer.ensure(cx, cy);
      const rock = map.rock.chunk(cx, cy);
      const out = this.#pool.pop() ?? new Float32Array(CHUNK_CELLS);
      let max = 0;
      if (!rock) {
        out.fill(0); // no ground here: nothing to hold
        next.push({ cx, cy, out, max });
        continue;
      }
      // Interior cells: every neighbour is in this chunk. Most cells of an awake chunk hold nothing
      // and neither do their neighbours; those are zero without looking at the rock.
      for (let ly = 1; ly < EDGE; ly++) {
        const row = ly << CHUNK_BITS;
        for (let lx = 1; lx < EDGE; lx++) {
          const i = row | lx;
          const v = f[i] as number;
          const fl = f[i - 1] as number;
          const fr = f[i + 1] as number;
          const fu = f[i - CHUNK] as number;
          const fd = f[i + CHUNK] as number;
          if (v === 0 && fl === 0 && fr === 0 && fu === 0 && fd === 0) {
            out[i] = 0;
            continue;
          }
          if (rock[i]) {
            out[i] = 0;
            continue;
          }
          // Mean of the open neighbours; rock counts as this cell, so nothing leaks into it.
          const l = rock[i - 1] ? v : fl;
          const r = rock[i + 1] ? v : fr;
          const u = rock[i - CHUNK] ? v : fu;
          const d = rock[i + CHUNK] ? v : fd;
          const nv = flush((v + k * ((l + r + u + d) / 4 - v)) * keep);
          out[i] = nv;
          if (nv > max) max = nv;
        }
      }
      // The border cells, whose neighbours may be in the next chunk; a chunk off the map is rock.
      const nb = this.#nb;
      nb.rl = map.rock.chunk(cx - 1, cy);
      nb.fl = layer.chunk(cx - 1, cy);
      nb.rr = map.rock.chunk(cx + 1, cy);
      nb.fr = layer.chunk(cx + 1, cy);
      nb.ru = map.rock.chunk(cx, cy - 1);
      nb.fu = layer.chunk(cx, cy - 1);
      nb.rd = map.rock.chunk(cx, cy + 1);
      nb.fd = layer.chunk(cx, cy + 1);
      for (let t = 0; t < CHUNK; t++) {
        max = Math.max(max, this.#edgeCell(f, rock, out, t, 0, k, keep));
        max = Math.max(max, this.#edgeCell(f, rock, out, t, EDGE, k, keep));
        if (t > 0 && t < EDGE) {
          max = Math.max(max, this.#edgeCell(f, rock, out, 0, t, k, keep));
          max = Math.max(max, this.#edgeCell(f, rock, out, EDGE, t, k, keep));
        }
      }
      next.push({ cx, cy, out, max });
    }

    // Commit: swap the buffers in; a chunk with nothing left above SLEEP, and no neighbour feeding it, goes to sleep, zeroed.
    for (const { cx, cy, out, max } of next) {
      if (max < SLEEP && !fed.has(chunkKey(cx, cy))) {
        out.fill(0);
        awake.delete(chunkKey(cx, cy));
      }
      const old = layer.put(cx, cy, out);
      if (old) this.#pool.push(old);
    }
  }

  /** Step one border cell (lx, ly) of a chunk into `out`, reading across into the neighbours in #nb; returns its new level. */
  #edgeCell(f: Float32Array, rock: Uint8Array, out: Float32Array, lx: number, ly: number, k: number, keep: number): number {
    const i = (ly << CHUNK_BITS) | lx;
    if (rock[i]) {
      out[i] = 0;
      return 0;
    }
    const nb = this.#nb;
    const v = f[i] as number;
    // Mean of the open neighbours; rock and the edge of the map count as this cell, so nothing leaks into them.
    const l = lx > 0 ? (rock[i - 1] ? v : (f[i - 1] as number)) : across(nb.rl, nb.fl, (ly << CHUNK_BITS) | EDGE, v);
    const r = lx < EDGE ? (rock[i + 1] ? v : (f[i + 1] as number)) : across(nb.rr, nb.fr, ly << CHUNK_BITS, v);
    const u = ly > 0 ? (rock[i - CHUNK] ? v : (f[i - CHUNK] as number)) : across(nb.ru, nb.fu, (EDGE << CHUNK_BITS) | lx, v);
    const d = ly < EDGE ? (rock[i + CHUNK] ? v : (f[i + CHUNK] as number)) : across(nb.rd, nb.fd, lx, v);
    const nv = flush((v + k * ((l + r + u + d) / 4 - v)) * keep);
    out[i] = nv;
    return nv;
  }

  total(channel: Channel): number {
    let s = 0;
    this.fields[channel].forEach((_, __, a) => {
      for (const v of a) s += v;
    });
    return s;
  }

  clear(): void {
    for (const ch of CHANNELS) {
      this.fields[ch].clear();
      this.#awake[ch].clear();
    }
  }
}
