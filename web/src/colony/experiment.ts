import { MODES, type Colony, type Mode, type Stance } from "./colony.ts";
import { Game, type GameParams, type Side } from "./game.ts";
import type { Channel } from "./pheromone.ts";
import { generateWorld, mulberry32, type WorldMap, type WorldOptions } from "./world.ts";

// The experiment harness, pure: build a game from a spec, run it headless for
// N seconds with scripted events, and collect a metrics time series and a
// summary. This is the one place seeding is defined: the colony page, the
// scripts and the tests all build games through `newGame`, so a seed means
// the same game everywhere (ja-jdu). Assays (assays.ts) and the sweep script
// (scripts/experiment.mjs) are built on `runGame`.

/** The sim step every headless run uses, and the page's longest step. */
export const DT = 1 / 30;
/** An ant out this long without being home or finding food counts as stuck (ja-ipu). */
export const STUCK_AFTER = 120;
/** Below this many living ants a colony's stuck share is not counted (one stuck ant of three is not a homing failure). */
export const MIN_STUCK_POP = 20;

/**
 * The game's rng for a seed: the map comes from the seed itself (generateWorld), the ants' rng
 * from this. `generation` is the page's Restart counter: the same map, a fresh run.
 */
export function gameRng(seed: number, generation = 0): () => number {
  return mulberry32(seed * 7919 + generation);
}

/** A cell rectangle, x0 ≤ x < x1, y0 ≤ y < y1. */
export interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export function inRect(r: Rect, x: number, y: number): boolean {
  return x >= r.x0 && x < r.x1 && y >= r.y0 && y < r.y1;
}

/** Something that happens to the game at a set time (seconds), before that tick. */
export type GameEvent =
  | { at: number; kind: "paint"; colony?: number; channel: Channel; x: number; y: number; radius: number; amount: number }
  | { at: number; kind: "food"; x: number; y: number; radius: number; amount: number }
  | { at: number; kind: "clearFood"; rect?: Rect }
  | { at: number; kind: "call"; run: (game: Game) => void };

export interface GameSpec {
  seed: number;
  /** a generated world's options (default: generateWorld(seed)), or a hand-built arena */
  world?: Partial<WorldOptions> | ((seed: number) => WorldMap);
  game?: Partial<GameParams>;
  player?: Side;
  rival?: Side;
  /** the page's Restart counter */
  generation?: number;
}

export interface RunSpec extends GameSpec {
  seconds: number;
  dt?: number;
  events?: GameEvent[];
  /** seconds between samples (default 1) */
  sampleEvery?: number;
  /** named regions: ants inside are counted at each sample, entries every tick */
  regions?: Record<string, Rect>;
  /** hold the player's stance at this, whatever the strategist says (assays) */
  forceStance?: Stance;
  /** time every tick (ms per tick in the summary); off by default, it costs a little */
  timeTicks?: boolean;
}

/** A game from a spec: the same seed and spec are the same game on the page, in a script or in a test. */
export function newGame(spec: GameSpec): Game {
  const map = typeof spec.world === "function" ? spec.world(spec.seed) : generateWorld(spec.seed, spec.world);
  return new Game(map, spec.game, gameRng(spec.seed, spec.generation), spec.player, spec.rival);
}

export interface RegionSample {
  ants: number;
  carrying: number;
  modes: Record<Mode, number>;
  /** ants that walked into the region since the start */
  entries: number;
}

export interface ColonySample {
  population: number;
  stored: number;
  births: number;
  losses: number;
  decisions: number;
  situationsSeen: number;
  modes: Record<Mode, number>;
  carrying: number;
  /** ants more than two cells outside the nest's radius */
  out: number;
  /** ants that have left the nest since the start */
  exits: number;
  /** ants out longer than STUCK_AFTER without being home or finding food */
  stuck: number;
  stance: Stance;
  regions: Record<string, RegionSample>;
}

export interface Sample {
  t: number;
  foodLeft: number;
  colonies: ColonySample[];
}

export interface ColonySummary {
  population: number;
  stored: number;
  /** stored ÷ all the food the map had (at the start, plus any added by events) */
  foodHome: number;
  births: number;
  losses: number;
  decisions: number;
  situationsSeen: number;
  /** stuck ÷ population at the end (0 for a colony under MIN_STUCK_POP ants) */
  stuckEnd: number;
  /** the largest stuck share over the samples */
  stuckMax: number;
}

export interface RunResult {
  seed: number;
  seconds: number;
  outcome: ReturnType<Game["outcome"]>;
  foodTotal: number;
  colonies: ColonySummary[];
  msPerTick: { mean: number; p90: number } | null;
  samples: Sample[];
  game: Game;
}

/** Living ants per mode. */
export function modeCounts(c: Colony): Record<Mode, number> {
  return c.counts();
}

export function carryingCount(c: Colony): number {
  let s = 0;
  for (let i = 0; i < c.n; i++) if (c.alive[i] && c.carrying[i]) s++;
  return s;
}

/** Whether ant i is out of its nest: more than two cells past the nest's radius. */
export function isOut(c: Colony, i: number): boolean {
  const r = c.nest.r + 2;
  const dx = (c.x[i] as number) - c.nest.x;
  const dy = (c.y[i] as number) - c.nest.y;
  return dx * dx + dy * dy > r * r;
}

export function outCount(c: Colony): number {
  let s = 0;
  for (let i = 0; i < c.n; i++) if (c.alive[i] && isOut(c, i)) s++;
  return s;
}

/** Ants out longer than `after` seconds without being home or finding food. */
export function stuckCount(c: Colony, after = STUCK_AFTER): number {
  let s = 0;
  for (let i = 0; i < c.n; i++) if (c.alive[i] && (c.since[i] as number) > after) s++;
  return s;
}

/** Ants of colony c inside a rectangle, with their modes and loads. */
export function regionCount(c: Colony, r: Rect): Omit<RegionSample, "entries"> {
  const modes = { explore: 0, follow: 0, return: 0, fight: 0 };
  let ants = 0;
  let carrying = 0;
  for (let i = 0; i < c.n; i++) {
    if (!c.alive[i] || !inRect(r, c.x[i] as number, c.y[i] as number)) continue;
    ants++;
    if (c.carrying[i]) carrying++;
    modes[MODES[c.mode[i] as number] as Mode]++;
  }
  return { ants, carrying, modes };
}

/** Food units left on the map inside a rectangle. */
export function foodIn(map: WorldMap, r: Rect): number {
  let s = 0;
  for (let y = Math.max(0, r.y0); y < Math.min(map.size.h, r.y1); y++) for (let x = Math.max(0, r.x0); x < Math.min(map.size.w, r.x1); x++) s += map.food.get(x, y);
  return s;
}

/** Remove every unit of food inside a rectangle (the whole map when none is given), keeping foodLeft true. */
export function clearFood(map: WorldMap, r?: Rect): number {
  const rect = r ?? { x0: 0, y0: 0, x1: map.size.w, y1: map.size.h };
  let removed = 0;
  for (let y = Math.max(0, rect.y0); y < Math.min(map.size.h, rect.y1); y++)
    for (let x = Math.max(0, rect.x0); x < Math.min(map.size.w, rect.x1); x++) {
      const v = map.food.get(x, y);
      if (!v) continue;
      map.food.set(x, y, 0);
      removed += v;
    }
  map.foodLeft -= removed;
  return removed;
}

/** Put `amount` food on every open cell within `radius` of (x, y). */
export function addFood(map: WorldMap, x: number, y: number, radius: number, amount: number): void {
  for (let cy = Math.max(0, Math.floor(y - radius)); cy <= Math.min(map.size.h - 1, Math.floor(y + radius)); cy++)
    for (let cx = Math.max(0, Math.floor(x - radius)); cx <= Math.min(map.size.w - 1, Math.floor(x + radius)); cx++) {
      if (map.rock.get(cx, cy) || Math.hypot(cx + 0.5 - x, cy + 0.5 - y) > radius) continue;
      map.food.set(cx, cy, map.food.get(cx, cy) + amount);
      map.foodLeft += amount;
      map.foodTotal += amount;
    }
}

function apply(game: Game, e: GameEvent): void {
  switch (e.kind) {
    case "paint":
      game.colonies[e.colony ?? 0]?.paint(e.channel, e.x, e.y, e.radius, e.amount);
      break;
    case "food":
      addFood(game.map, e.x, e.y, e.radius, e.amount);
      break;
    case "clearFood":
      clearFood(game.map, e.rect);
      break;
    case "call":
      e.run(game);
      break;
  }
}

/** Per colony, per ant slot: whether the ant was out of the nest / in each region last tick, and the entry counts. */
class Tracker {
  readonly out: Uint8Array[];
  readonly exits: number[];
  readonly inside: Record<string, Uint8Array[]> = {};
  readonly entries: Record<string, number[]> = {};
  readonly game: Game;
  readonly regions: Record<string, Rect>;
  constructor(game: Game, regions: Record<string, Rect>) {
    this.game = game;
    this.regions = regions;
    this.out = game.colonies.map((c) => {
      const a = new Uint8Array(c.n);
      for (let i = 0; i < c.n; i++) a[i] = c.alive[i] && isOut(c, i) ? 1 : 0;
      return a;
    });
    this.exits = game.colonies.map(() => 0);
    for (const [name, r] of Object.entries(regions)) {
      this.inside[name] = game.colonies.map((c) => {
        const a = new Uint8Array(c.n);
        for (let i = 0; i < c.n; i++) a[i] = c.alive[i] && inRect(r, c.x[i] as number, c.y[i] as number) ? 1 : 0;
        return a;
      });
      this.entries[name] = game.colonies.map(() => 0);
    }
  }

  step(): void {
    const names = Object.keys(this.regions);
    this.game.colonies.forEach((c, k) => {
      const out = this.out[k] as Uint8Array;
      for (let i = 0; i < c.n; i++) {
        if (!c.alive[i]) {
          out[i] = 0;
          for (const name of names) (this.inside[name]![k] as Uint8Array)[i] = 0;
          continue;
        }
        const o = isOut(c, i) ? 1 : 0;
        if (o && !out[i]) this.exits[k]!++;
        out[i] = o;
        for (const name of names) {
          const ins = this.inside[name]![k] as Uint8Array;
          const v = inRect(this.regions[name] as Rect, c.x[i] as number, c.y[i] as number) ? 1 : 0;
          if (v && !ins[i]) this.entries[name]![k]!++;
          ins[i] = v;
        }
      }
    });
  }
}

function sample(game: Game, tracker: Tracker, regions: Record<string, Rect>): Sample {
  return {
    t: game.time,
    foodLeft: game.map.foodLeft,
    colonies: game.colonies.map((c, k) => {
      const reg: Record<string, RegionSample> = {};
      for (const [name, r] of Object.entries(regions)) reg[name] = { ...regionCount(c, r), entries: tracker.entries[name]![k] as number };
      return {
        population: c.population,
        stored: c.stored,
        births: c.births,
        losses: c.losses,
        decisions: c.decisions,
        situationsSeen: c.situationsSeen,
        modes: modeCounts(c),
        carrying: carryingCount(c),
        out: outCount(c),
        exits: tracker.exits[k] as number,
        stuck: stuckCount(c),
        stance: c.stance,
        regions: reg,
      };
    }),
  };
}

/** Run a game headless for spec.seconds and collect its samples and summary. */
export function runGame(spec: RunSpec): RunResult {
  const game = newGame(spec);
  const dt = spec.dt ?? DT;
  const every = spec.sampleEvery ?? 1;
  const regions = spec.regions ?? {};
  const events = [...(spec.events ?? [])].sort((a, b) => a.at - b.at);
  const tracker = new Tracker(game, regions);
  const samples: Sample[] = [];
  const ms: number[] = [];
  const steps = Math.round(spec.seconds / dt);
  const sampleSteps = Math.max(1, Math.round(every / dt));
  let ev = 0;
  if (spec.forceStance) game.player.stance = spec.forceStance;
  samples.push(sample(game, tracker, regions));
  for (let k = 0; k < steps; k++) {
    while (ev < events.length && (events[ev] as GameEvent).at <= game.time + dt / 2) apply(game, events[ev++] as GameEvent);
    if (spec.timeTicks) {
      const t0 = performance.now();
      game.tick(dt);
      ms.push(performance.now() - t0);
    } else game.tick(dt);
    if (spec.forceStance) game.player.stance = spec.forceStance;
    tracker.step();
    if ((k + 1) % sampleSteps === 0) samples.push(sample(game, tracker, regions));
  }
  const foodTotal = game.map.foodTotal; // at the end: food added by events counts
  let msPerTick: RunResult["msPerTick"] = null;
  if (ms.length) {
    const warm = ms.slice(Math.min(ms.length - 1, Math.round(5 / dt))).sort((a, b) => a - b);
    msPerTick = { mean: warm.reduce((a, b) => a + b, 0) / warm.length, p90: warm[Math.floor(0.9 * (warm.length - 1))] as number };
  }
  return {
    seed: spec.seed,
    seconds: spec.seconds,
    outcome: game.outcome(),
    foodTotal,
    colonies: game.colonies.map((c, k) => {
      // A colony of a handful of ants (nearly beaten) says nothing about homing: its share counts as 0.
      const stuckShare = (c: ColonySample) => (c.population >= MIN_STUCK_POP ? c.stuck / c.population : 0);
      const shares = samples.map((s) => stuckShare(s.colonies[k]!));
      const last = samples.at(-1)!.colonies[k]!;
      return {
        population: c.population,
        stored: c.stored,
        foodHome: foodTotal > 0 ? c.stored / foodTotal : 0,
        births: c.births,
        losses: c.losses,
        decisions: c.decisions,
        situationsSeen: c.situationsSeen,
        stuckEnd: stuckShare(last),
        stuckMax: Math.max(0, ...shares),
      };
    }),
    msPerTick,
    samples,
    game,
  };
}

/** Samples with lo ≤ t ≤ hi. */
export function between(samples: Sample[], lo: number, hi: number): Sample[] {
  return samples.filter((s) => s.t >= lo - 1e-6 && s.t <= hi + 1e-6);
}

export function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

export function median(xs: number[]): number {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? (s[m] as number) : ((s[m - 1] as number) + (s[m] as number)) / 2;
}

/** Pearson correlation; 0 when either series is flat. */
export function correlation(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n < 2) return 0;
  const ma = mean(a.slice(0, n));
  const mb = mean(b.slice(0, n));
  let sab = 0;
  let saa = 0;
  let sbb = 0;
  for (let i = 0; i < n; i++) {
    const da = (a[i] as number) - ma;
    const db = (b[i] as number) - mb;
    sab += da * db;
    saa += da * da;
    sbb += db * db;
  }
  return saa > 0 && sbb > 0 ? sab / Math.sqrt(saa * sbb) : 0;
}
