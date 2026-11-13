import { decode, encode, fillLike } from "./save.ts";
import { CHUNK, CHUNK_BITS, CHUNK_CELLS, ChunkLayer, chunkKey, chunkOf } from "./chunks.ts";
import { CELL, cellOf } from "./hex.ts";
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
//
// The grid is hexagons in offset rows (hex.ts): each cell spreads toward the
// mean of its six neighbours. On unit spacing the hex mean less the centre is
// ≈ ¼∇², the same as the square grid's four-neighbour mean, so `diffusion`
// means the same; it just spreads round instead of in diamonds. With odd rows
// shifted right, a chunk's top-left corner also touches the chunk diagonally
// up-left, and its bottom-right corner the chunk diagonally down-right.

export type Channel = "food" | "home" | "alarm" | "noEntry" | "raid" | Mark;
/**
 * The nest's road signs (nest slice 3, docs/nest-and-home.md §3.3): each chamber's role, laid on the floor by ants that
 * have been in it, fading the farther they have walked, so each leads back to its kind of chamber (Heyman et al. 2017).
 * Only the side view lays them; elsewhere they stay asleep and cost nothing.
 */
export type Mark = "royal" | "brood" | "store" | "reception" | "midden";
export const MARKS: Mark[] = ["royal", "brood", "store", "reception", "midden"];
export const CHANNELS: Channel[] = ["food", "home", "alarm", "noEntry", "raid", ...MARKS];

export interface ChannelParams {
  /** share lost per second */
  evaporation: number;
  /** spread per second toward the mean of the six neighbours (0 = none) */
  diffusion: number;
  /** the most a cell holds (default MAX_LEVEL) */
  max?: number;
}

export const DEFAULT_CHANNELS: Record<Channel, ChannelParams> = {
  food: { evaporation: 0.06, diffusion: 0.3 },
  home: { evaporation: 0.02, diffusion: 0.3 },
  alarm: { evaporation: 0.25, diffusion: 0.8 },
  // "No entry" (behaviour MR 3, docs/trails.md): laid where a food trail ends at no food. Robinson et al. 2008: the
  // repellent lasts about 2.4× the short-lived attractive trail (78 against 33 min), so t½ ≈ 27 s against food's 11.6 s.
  noEntry: { evaporation: 0.026, diffusion: 0.3 },
  // The raid trail (behaviour MR 5.2, docs/raid-recruitment.md): laid by a scout that met strangers, going home. It outlives
  // a trip out, not the raid: t½ ≈ 17 s.
  raid: { evaporation: 0.04, diffusion: 0.3 },
  // Floor marks keep: slow to fade, not spreading (a sign on the floor, not a cloud; spreading them cost 10 % of a tick).
  royal: { evaporation: 0.01, diffusion: 0 },
  brood: { evaporation: 0.01, diffusion: 0 },
  store: { evaporation: 0.01, diffusion: 0 },
  reception: { evaporation: 0.01, diffusion: 0 },
  midden: { evaporation: 0.01, diffusion: 0 },
};

/** A record with one entry per channel. */
function perChannel<T>(make: (ch: Channel) => T): Record<Channel, T> {
  return Object.fromEntries(CHANNELS.map((ch) => [ch, make(ch)])) as Record<Channel, T>;
}

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
 * the faint front of a spreading trail gains only k/6 of its neighbour per step, so flushing at
 * SLEEP itself would stall faint fronts (measured: 7× too little five cells past a trail's end).
 */
const FLUSH = 1e-6;

function flush(v: number): number {
  return v < FLUSH ? 0 : v;
}

/** A neighbour's level across a chunk border: this cell's own level `v` when the neighbour is rock or off the map. */
function across(rock: Uint8Array | undefined, field: Float32Array | undefined, i: number, v: number): number {
  if (!rock || rock[i]) return v;
  return field ? field[i] : 0;
}

export class Pheromones {
  readonly map: WorldMap;
  readonly fields: Record<Channel, ChunkLayer<Float32Array>>;
  params: Record<Channel, ChannelParams>;
  readonly #awake: Record<Channel, Set<number>>;
  /** seconds owed per channel since its last step (advance) */
  #clock: Record<Channel, number> = perChannel(() => 0);
  /** the head start phase() put on each clock, not yet stepped (time that did not pass) */
  #head: Record<Channel, number> = perChannel(() => 0);
  /** chunks a neighbour's edge spread scent into this step (they stay awake) */
  #fed = new Set<number>();
  /** spare chunk arrays for the double buffer */
  #pool: Float32Array[] = [];
  /** the 3×3 block of chunks round the one being stepped, (dy + 1) * 3 + (dx + 1): rock and field arrays, undefined where there are none */
  #nbRock: (Uint8Array | undefined)[] = new Array(9);
  #nbField: (Float32Array | undefined)[] = new Array(9);

  /** the channels a species lacks (ja-fnd.5.11): never laid, so they hold nothing and every read of them is 0; null: it has them all */
  readonly #absent: ReadonlySet<Channel> | null;

  /** `params`: per channel; channels left out keep their defaults. `has`: the channels the species lays and reads (null: all). */
  constructor(map: WorldMap, params: Partial<Record<Channel, ChannelParams>> = DEFAULT_CHANNELS, has: readonly Channel[] | null = null) {
    this.map = map;
    this.params = { ...DEFAULT_CHANNELS, ...params };
    this.#absent = has ? new Set(CHANNELS.filter((ch) => !has.includes(ch))) : null;
    this.fields = perChannel(() => new ChunkLayer((n) => new Float32Array(n), 0));
    this.#awake = perChannel(() => new Set<number>());
  }

  /** Add to the cell under world (x, y). */
  deposit(channel: Channel, x: number, y: number, amount: number): void {
    cellOf(x, y);
    this.depositCell(channel, CELL[0], CELL[1], amount);
  }

  /** Add to integer cell (cx, cy). */
  depositCell(channel: Channel, cx: number, cy: number, amount: number): void {
    const { map } = this;
    if (cx < map.x0 || cy < 0 || cx >= map.x0 + map.size.w || cy >= map.size.h) return;
    if (this.#absent !== null && this.#absent.has(channel)) return; // a channel the species lacks: nothing is laid, nothing wakes
    const f = this.fields[channel];
    f.set(cx, cy, Math.min(this.params[channel].max ?? MAX_LEVEL, f.get(cx, cy) + amount));
    this.#awake[channel].add(chunkKey(cx >> CHUNK_BITS, cy >> CHUNK_BITS));
  }

  /** The level under world (x, y); −1 off the map, so a sensor reads the edge as worse than bare ground. */
  read(channel: Channel, x: number, y: number): number {
    cellOf(x, y);
    const cx = CELL[0];
    const cy = CELL[1];
    const { map } = this;
    if (cx < map.x0 || cy < 0 || cx >= map.x0 + map.size.w || cy >= map.size.h) return -1;
    return this.fields[channel].get(cx, cy);
  }

  /** Whether the species has this channel at all (ja-fnd.5.11). */
  has(channel: Channel): boolean {
    return this.#absent === null || !this.#absent.has(channel);
  }

  /** Whether any of a channel's chunks is awake: false, and it holds nothing anywhere (a sensor need not read it). */
  live(channel: Channel): boolean {
    return this.#awake[channel].size > 0;
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
      // A hair of tolerance: five ticks of 1/30 s sum to just under 1/6 s in floating point, and
      // without it a 1/6 s interval would wait a sixth tick.
      if (this.#clock[ch] >= stepInterval(this.params[ch]) - 1e-9) {
        // Step by the time that actually passed: the clock less any head start phase() gave it.
        this.#stepChannel(ch, this.#clock[ch] - this.#head[ch]);
        this.#clock[ch] = 0;
        this.#head[ch] = 0;
      }
    }
  }

  /** Start each channel's clock part-way through its interval, so this colony's first steps come early (but are no longer). */
  phase(fraction: number): void {
    for (const ch of CHANNELS) {
      this.#clock[ch] = fraction * stepInterval(this.params[ch]);
      this.#head[ch] = this.#clock[ch];
    }
  }

  #stepChannel(ch: Channel, dt: number): void {
    const awake = this.#awake[ch];
    if (awake.size === 0) return;
    const layer = this.fields[ch];
    const map = this.map;
    const minCx = map.x0 >> CHUNK_BITS;
    const maxCx = (map.x0 + map.size.w - 1) >> CHUNK_BITS;
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
          w = Math.max(w, a[t << CHUNK_BITS]);
          e = Math.max(e, a[(t << CHUNK_BITS) | EDGE]);
          n = Math.max(n, a[t]);
          s = Math.max(s, a[(EDGE << CHUNK_BITS) | t]);
        }
        const wake = (nx: number, ny: number) => {
          const nk = chunkKey(nx, ny);
          awake.add(nk);
          fed.add(nk);
        };
        if (w > SLEEP && cx > minCx) wake(cx - 1, cy);
        if (e > SLEEP && cx < maxCx) wake(cx + 1, cy);
        if (n > SLEEP && cy > 0) wake(cx, cy - 1);
        if (s > SLEEP && cy < maxCy) wake(cx, cy + 1);
        // The two corners that touch a diagonal chunk (odd rows sit half a cell right).
        if (a[0] > SLEEP && cx > minCx && cy > 0) wake(cx - 1, cy - 1);
        if (a[(EDGE << CHUNK_BITS) | EDGE] > SLEEP && cx < maxCx && cy < maxCy) wake(cx + 1, cy + 1);
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
        // The rows above and below: an even row's neighbours there are x − 1 and x, an odd row's x and x + 1.
        const o = (ly & 1) - 1;
        for (let lx = 1; lx < EDGE; lx++) {
          const i = row | lx;
          const ua = i - CHUNK + o;
          const da = i + CHUNK + o;
          const v = f[i];
          const fl = f[i - 1];
          const fr = f[i + 1];
          const f1 = f[ua];
          const f2 = f[ua + 1];
          const f3 = f[da];
          const f4 = f[da + 1];
          if (v === 0 && fl === 0 && fr === 0 && f1 === 0 && f2 === 0 && f3 === 0 && f4 === 0) {
            out[i] = 0;
            continue;
          }
          if (rock[i]) {
            out[i] = 0;
            continue;
          }
          // Mean of the open neighbours; rock counts as this cell, so nothing leaks into it.
          const sum =
            (rock[i - 1] ? v : fl) +
            (rock[i + 1] ? v : fr) +
            (rock[ua] ? v : f1) +
            (rock[ua + 1] ? v : f2) +
            (rock[da] ? v : f3) +
            (rock[da + 1] ? v : f4);
          const nv = flush((v + k * (sum / 6 - v)) * keep);
          out[i] = nv;
          if (nv > max) max = nv;
        }
      }
      // The border cells, whose neighbours may be in the next chunks; a chunk off the map is rock.
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          this.#nbRock[(dy + 1) * 3 + dx + 1] = map.rock.chunk(cx + dx, cy + dy);
          this.#nbField[(dy + 1) * 3 + dx + 1] = layer.chunk(cx + dx, cy + dy);
        }
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

  /** Step one border cell (lx, ly) of a chunk into `out`, reading across into the chunks round it; returns its new level. */
  #edgeCell(f: Float32Array, rock: Uint8Array, out: Float32Array, lx: number, ly: number, k: number, keep: number): number {
    const i = (ly << CHUNK_BITS) | lx;
    if (rock[i]) {
      out[i] = 0;
      return 0;
    }
    const v = f[i];
    const o = (ly & 1) - 1;
    // Mean of the open neighbours; rock and the edge of the map count as this cell, so nothing leaks into them.
    const sum =
      this.#at(lx - 1, ly, v) +
      this.#at(lx + 1, ly, v) +
      this.#at(lx + o, ly - 1, v) +
      this.#at(lx + o + 1, ly - 1, v) +
      this.#at(lx + o, ly + 1, v) +
      this.#at(lx + o + 1, ly + 1, v);
    const nv = flush((v + k * (sum / 6 - v)) * keep);
    out[i] = nv;
    return nv;
  }

  /** The old level at local (lx, ly), which may lie in a chunk round this one (−1..64); `v` if it is rock or off the map. */
  #at(lx: number, ly: number, v: number): number {
    const dx = lx < 0 ? -1 : lx > EDGE ? 1 : 0;
    const dy = ly < 0 ? -1 : ly > EDGE ? 1 : 0;
    const k = (dy + 1) * 3 + dx + 1;
    return across(this.#nbRock[k], this.#nbField[k], ((ly & EDGE) << CHUNK_BITS) | (lx & EDGE), v);
  }

  total(channel: Channel): number {
    let s = 0;
    this.fields[channel].forEach((_, __, a) => {
      for (const v of a) s += v;
    });
    return s;
  }

  /** This field's state for a save (save.ts): its layers, settings, which chunks are awake, and its clocks. */
  saveState(): Record<string, unknown> {
    return {
      fields: encode(this.fields),
      params: encode(this.params),
      awake: encode(this.#awake),
      clock: encode(this.#clock),
      head: encode(this.#head),
    };
  }

  loadState(r: Record<string, unknown>): void {
    fillLike(this.fields, r.fields);
    this.params = decode(r.params) as Record<Channel, ChannelParams>;
    fillLike(this.#awake, r.awake);
    this.#clock = fillLike(this.#clock, r.clock) as Record<Channel, number>;
    this.#head = fillLike(this.#head, r.head) as Record<Channel, number>;
  }
}

/** Brood read as store and store as brood (the fungus's muddle, nest slice 8); any other mark as it is. */
export function swapBroodStore(m: Mark): Mark {
  return m === "brood" ? "store" : m === "store" ? "brood" : m;
}
