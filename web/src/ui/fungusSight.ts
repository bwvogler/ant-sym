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
  isEndless,
  PLANE,
  type Game,
} from "../colony/index.ts";
import { BODY_EVERY, bodySight, hostSight } from "./fog/observers.ts";
import type { CorpseMemory } from "./fog/corpses.ts";
import type { KnownColonies } from "./fog/known.ts";
import type { SideStats } from "./stats.ts";
import type { Knowledge } from "./fog/knowledge.ts";
import { decayStage } from "./cadaverVisual.ts";

// What the field shows of the colonies' scent (PRD §65, ja-pc72.1): only what the fungus's hosts have sensed. Every frame,
// each infected ant of any colony marks the cells within its antennae's reach with the time; a cell's trails and alarm
// show as strongly as that mark is fresh, fading over SENSED_FADE. You are the fungus: you know what your hosts smell,
// where they walk, for a while. A picture only: no ant senses it, and the game never reads it. Who sees (every host and the
// fungus's living body) is fog/observers.ts (docs/fog-of-war.md §4.1, ja-1ypq.1).

/** Sim seconds over which a sensed cell fades from full to nothing. */
export const SENSED_FADE = 20;

/** Sim seconds between two compactions of the fog's snapshots (Knowledge.compact checks a chunk each). */
export const COMPACT_EVERY = 1;
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
  /**
   * Whether the plane (layer 0) is endless: its rows run on below 0 (the plane is centred, ja-0iuy), so a host there senses them. A curtain, or a
   * bounded map's plane, has no row below 0 and `mark` skips them. `stampGame` sets it from the game before it marks anything.
   */
  endless = false;
  #knowledge: Knowledge | null = null;
  #compactAt = -Infinity;
  #corpses: CorpseMemory | null = null;
  #known: KnownColonies<SideStats> | null = null;
  /**
   * The fog is off for now (the builder is on, docs/fog-of-war.md §5.4): knowledge, corpses and known read null, so everything shows as
   * without the fog. The memory goes on being kept, so the fog comes back as it was.
   */
  suspended = false;
  /** the fog of war's knowledge when the page runs with it (fog/sources.ts sensedFor); null: no fog (or suspended) */
  get knowledge(): Knowledge | null {
    return this.suspended ? null : this.#knowledge;
  }
  set knowledge(k: Knowledge | null) {
    this.#knowledge = k;
  }
  /** the dead the fungus has seen, kept as ground items (fog/corpses.ts); null: no fog (or suspended) */
  get corpses(): CorpseMemory | null {
    return this.suspended ? null : this.#corpses;
  }
  set corpses(c: CorpseMemory | null) {
    this.#corpses = c;
  }
  /** the colonies the fungus knows of, with their numbers as last known (fog/known.ts); null: no fog (or suspended) */
  get known(): KnownColonies<SideStats> | null {
    return this.suspended ? null : this.#known;
  }
  set known(k: KnownColonies<SideStats> | null) {
    this.#known = k;
  }
  /** The fog's three memories whether or not it is suspended: a save must keep what the builder hides (fog/sources.ts saveFog). */
  fogMemory(): { knowledge: Knowledge | null; corpses: CorpseMemory | null; known: KnownColonies<SideStats> | null } {
    return { knowledge: this.#knowledge, corpses: this.#corpses, known: this.#known };
  }
  /** told, for each run of cells just sensed in one chunk row, where (flat indexes start..end of chunk (cx, cy)): the fog's knowledge (fog/knowledge.ts) hangs here */
  onSeen: ((l: number, cx: number, cy: number, start: number, end: number) => void) | null = null;
  /** told when time goes back and everything is forgotten */
  onReset: (() => void) | null = null;
  /**
   * One ant that stays an observer whatever it carries: the tutorial's host, followed through the watch until it is groomed clean (a host
   * below INFECTED sees nothing, and the watch is the page showing exactly that moment). Set by the tutorial (ui/useTutorial.ts).
   */
  watch: { k: number; i: number; gen: number } | null = null;
  /** the sim time the body was last stamped (it is stamped every BODY_EVERY, not every step) */
  #bodyAt = -Infinity;
  /** The colonies the game has frozen, by index, as of the last `stampGame`: the page draws them still and dimmed (ja-qpv.4.5). Empty until a game is stamped. */
  readonly asleep = new Set<number>();

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

  /** The sim time a host last sensed any cell of chunk (cx, cy) on layer `l`, or undefined if the chunk is not kept (never sensed, or faded right out). */
  newest(l: number, cx: number, cy: number): number | undefined {
    return this.#fresh.get(l)?.get(chunkKey(cx, cy));
  }

  /** How strongly cell (gx, gy) of layer `l` shows now. */
  sight(l: number, gx: number, gy: number): number {
    const c = this.#layers.get(l)?.chunk(gx >> CHUNK_BITS, gy >> CHUNK_BITS);
    return c ? sightOf(c[((gy & (CHUNK - 1)) << CHUNK_BITS) | (gx & (CHUNK - 1))]!, this.now) : 0;
  }

  /** Mark what every host of `colonies` senses at sim time `now` (any strain). Time gone back (a restart, a load) forgets everything. */
  stamp(colonies: readonly Colony[], now: number): void {
    this.#begin(now);
    hostSight(colonies, REACH_MARGIN, (l, x, y, r) => this.mark(l, x, y, r));
    this.#watched(colonies);
    this.#forget();
  }

  /**
   * Mark what the player's organisms sense after one sim step of `game` (call it once per step, not per frame, so what is seen does not
   * depend on the frame rate): every host every step, its living body every BODY_EVERY.
   */
  stampGame(game: Game): void {
    const now = game.time;
    this.#begin(now);
    this.endless = isEndless(game.layers[PLANE]!);
    this.asleep.clear();
    for (let k = 0; k < game.colonies.length; k++) if (game.isFrozen(k)) this.asleep.add(k);
    hostSight(game.colonies, REACH_MARGIN, (l, x, y, r) => this.mark(l, x, y, r));
    this.#watched(game.colonies);
    if (now - this.#bodyAt >= BODY_EVERY) {
      this.#bodyAt = now;
      bodySight(game.fungus, game.layers.length, (l, x, y, r) => this.mark(l, x, y, r));
    }
    if (this.#knowledge) this.#corpses?.update(game, this.#knowledge, decayStage);
    if (this.#knowledge) this.#known?.update(game, this.#knowledge);
    // The fog frees the snapshots the seed can make again, a chunk at a time and not every step (Knowledge.compact).
    // (`now < #compactAt` is defensive: the page makes a new SensedMap for a restart or a load, which is when time goes back)
    if (this.#knowledge && (now - this.#compactAt >= COMPACT_EVERY || now < this.#compactAt)) {
      this.#compactAt = now;
      this.#knowledge.compact();
    }
    this.#forget();
  }

  /** The watched ant (see `watch`) senses like a host while it lives. */
  #watched(colonies: readonly Colony[]): void {
    const w = this.watch;
    const c = w && colonies[w.k];
    if (!w || !c || !c.alive[w.i] || c.gen[w.i] !== w.gen) return;
    this.mark(c.layer[w.i] ?? 0, c.x[w.i]!, c.y[w.i]!, c.params.sensorDistance + REACH_MARGIN);
  }

  #begin(now: number): void {
    if (now < this.now) {
      this.#layers.clear();
      this.#fresh.clear();
      this.#revealed.clear();
      this.#bodyAt = -Infinity;
      this.#corpses?.clear();
      this.#known?.clear();
      this.onReset?.();
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
    const below = l === PLANE && this.endless; // rows under 0 are ground only on an endless plane
    for (let gy = gy0 - rows; gy <= gy0 + rows; gy++) {
      if (gy < 0 && !below) continue;
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
        this.onSeen?.(l, cx, cy, start, start + end - gx);
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
