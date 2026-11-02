import { DEFAULT_FIGHT, type FightParams } from "./battle.ts";
import type { ColonyOptions, Mode, Stance } from "./colony.ts";
import { Game, type GameParams, gameRng, type Sides } from "./game.ts";
import type { Channel } from "./pheromone.ts";
import { dropFood, generateWorld, type Nest, type WorldMap, type WorldSize, worldFromArrays } from "./world.ts";

// Experiments, pure: run a game headless from a seed, with scripted events
// (paint, add food) and probes that measure behaviour, and score it against a
// target taken from real ants. `runGame` is the one place a run's random
// numbers are defined (`gameRng`, shared with the page), so a number measured
// here reproduces on the colony page with the same seed.
//
// An *assay* is a small hand-built arena with one question about the colony
// (does the traffic settle on the shorter of two branches? does a trail to an
// emptied patch die out?) and a pass mark from the literature, or a design
// target where the literature gives none. scripts/experiment.mjs sweeps
// assays over seeds and parameter values.

export type Event =
  | { at: number; kind: "paint"; colony?: number; channel: Channel; x: number; y: number; r: number; amount: number }
  | { at: number; kind: "food"; x: number; y: number; r: number; perCell: number }
  | { at: number; kind: "call"; run: (game: Game) => void };

/** Something that watches a run: called after every tick, asked for its numbers at the end. */
export interface Probe {
  tick(game: Game, dt: number): void;
  summary(game: Game): Record<string, number>;
}

export interface RunSpec {
  seed: number;
  /** the map, or how to make it from the seed; default generateWorld(seed) */
  map?: WorldMap | ((seed: number) => WorldMap);
  game?: Partial<GameParams>;
  sides?: Sides;
  seconds: number;
  /** sim step, seconds; the page steps at most 1/30 s */
  dt?: number;
  events?: Event[];
  probes?: Probe[];
}

export interface RunResult {
  seed: number;
  seconds: number;
  ticks: number;
  msPerTick: number;
  metrics: Record<string, number>;
}

/** Seconds out before an ant counts as stuck (ja-ipu's measure). */
export const STUCK_AFTER = 120;

/** Run a game headless and collect the standard numbers plus every probe's. */
export function runGame(spec: RunSpec): { game: Game; result: RunResult } {
  const map = typeof spec.map === "function" ? spec.map(spec.seed) : (spec.map ?? generateWorld(spec.seed));
  const game = new Game(map, spec.game, gameRng(spec.seed), spec.sides);
  const dt = spec.dt ?? 1 / 30;
  const events = [...(spec.events ?? [])].sort((a, b) => a.at - b.at);
  const probes = [stuckProbe(), ...(spec.probes ?? [])];
  let next = 0;
  let ticks = 0;
  const t0 = performance.now();
  while (game.time < spec.seconds - 1e-9) {
    while (next < events.length && (events[next] as Event).at <= game.time + 1e-9) apply(game, events[next++] as Event);
    game.tick(dt);
    ticks++;
    for (const p of probes) p.tick(game, dt);
  }
  const msPerTick = (performance.now() - t0) / Math.max(1, ticks);
  const metrics: Record<string, number> = {};
  game.colonies.forEach((c, k) => {
    const side = k === 0 ? "you" : "rival";
    metrics[`${side}.ants`] = c.population;
    metrics[`${side}.stored`] = c.stored;
    metrics[`${side}.foodHome`] = map.foodTotal > 0 ? c.stored / map.foodTotal : 0;
    metrics[`${side}.losses`] = c.losses;
    metrics[`${side}.births`] = c.births;
    metrics[`${side}.situations`] = c.situationsSeen;
  });
  const outcome = game.outcome();
  metrics.outcome = outcome === "won" ? 1 : outcome === "lost" ? -1 : 0;
  for (const p of probes) Object.assign(metrics, p.summary(game));
  return { game, result: { seed: spec.seed, seconds: game.time, ticks, msPerTick, metrics } };
}

function apply(game: Game, e: Event): void {
  if (e.kind === "paint") (game.colonies[e.colony ?? 0] ?? game.player).paint(e.channel, e.x, e.y, e.r, e.amount);
  // Food added later is not part of foodTotal: foodHome stays a share of what the map started with.
  else if (e.kind === "food") disc(game.map.size, e.x, e.y, e.r, (x, y) => dropFood(game.map, x + 0.5, y + 0.5, e.perCell));
  else e.run(game);
}

/** Every cell within r of (cx, cy), clipped to the map. */
export function disc(size: WorldSize, cx: number, cy: number, r: number, fn: (x: number, y: number) => void): void {
  for (let y = Math.max(0, Math.floor(cy - r)); y <= Math.min(size.h - 1, Math.ceil(cy + r)); y++)
    for (let x = Math.max(0, Math.floor(cx - r)); x <= Math.min(size.w - 1, Math.ceil(cx + r)); x++) if (Math.hypot(x + 0.5 - cx, y + 0.5 - cy) <= r) fn(x, y);
}

/** Food left within r of (cx, cy). */
export function foodIn(map: WorldMap, cx: number, cy: number, r: number): number {
  let s = 0;
  disc(map.size, cx, cy, r, (x, y) => (s += map.food.get(x, y)));
  return s;
}

/** The largest share of each colony out longer than STUCK_AFTER, sampled every second after the first STUCK_AFTER seconds. */
export function stuckProbe(): Probe {
  const worst: number[] = [];
  let nextAt = STUCK_AFTER;
  return {
    tick(game) {
      if (game.time < nextAt) return;
      nextAt += 1;
      game.colonies.forEach((c, k) => {
        let out = 0;
        let alive = 0;
        for (let i = 0; i < c.n; i++) {
          if (!c.alive[i]) continue;
          alive++;
          if ((c.since[i] as number) > STUCK_AFTER) out++;
        }
        worst[k] = Math.max(worst[k] ?? 0, alive > 0 ? out / alive : 0);
      });
    },
    summary() {
      const m: Record<string, number> = {};
      worst.forEach((w, k) => (m[`${k === 0 ? "you" : "rival"}.maxStuck`] = w));
      return m;
    },
  };
}

export interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

const inRect = (r: Rect, x: number, y: number) => x >= r.x0 && x < r.x1 && y >= r.y0 && y < r.y1;

/** Ant-seconds a colony spends in each region from `from` to `to` (s). */
export function occupancyProbe(regions: Record<string, Rect>, from = 0, to = Infinity, colony = 0): Probe {
  const total: Record<string, number> = Object.fromEntries(Object.keys(regions).map((k) => [k, 0]));
  return {
    tick(game, dt) {
      if (game.time < from || game.time > to) return;
      const c = game.colonies[colony];
      if (!c) return;
      for (let i = 0; i < c.n; i++) {
        if (!c.alive[i]) continue;
        const x = c.x[i] as number;
        const y = c.y[i] as number;
        for (const [k, r] of Object.entries(regions)) if (inRect(r, x, y)) total[k] = (total[k] as number) + dt;
      }
    },
    summary: () => ({ ...total }),
  };
}

/** Ants of a colony within r of (x, y) right now. */
export function antsNear(game: Game, x: number, y: number, r: number, colony = 0): number {
  const c = game.colonies[colony];
  if (!c) return 0;
  let s = 0;
  for (let i = 0; i < c.n; i++) if (c.alive[i] && Math.hypot((c.x[i] as number) - x, (c.y[i] as number) - y) <= r) s++;
  return s;
}

// ---------------------------------------------------------------- arenas

/** A hand-built map: all rock until carved, then food piles and nests. */
export class Arena {
  readonly size: WorldSize;
  readonly rock: Uint8Array;
  readonly food: Float32Array;

  constructor(w: number, h: number, open = false) {
    this.size = { w, h };
    this.rock = new Uint8Array(w * h).fill(open ? 0 : 1);
    this.food = new Float32Array(w * h);
  }

  /** Open ground over the inclusive rectangle. */
  carve(x0: number, y0: number, x1: number, y1: number): this {
    for (let y = Math.max(0, y0); y <= Math.min(this.size.h - 1, y1); y++) for (let x = Math.max(0, x0); x <= Math.min(this.size.w - 1, x1); x++) this.rock[y * this.size.w + x] = 0;
    return this;
  }

  /** Rock over the inclusive rectangle. */
  wall(x0: number, y0: number, x1: number, y1: number): this {
    for (let y = Math.max(0, y0); y <= Math.min(this.size.h - 1, y1); y++) for (let x = Math.max(0, x0); x <= Math.min(this.size.w - 1, x1); x++) this.rock[y * this.size.w + x] = 1;
    return this;
  }

  /** A pile of `perCell` food on every open cell within r of (cx, cy). */
  pile(cx: number, cy: number, r: number, perCell: number): this {
    disc(this.size, cx, cy, r, (x, y) => {
      const i = y * this.size.w + x;
      if (!this.rock[i]) this.food[i] = perCell;
    });
    return this;
  }

  build(nests: Nest[]): WorldMap {
    return worldFromArrays(this.size, nests, { rock: this.rock, food: this.food });
  }
}

// ---------------------------------------------------------------- assays

/** Parameter changes from the command line, applied on top of an assay's own. */
export interface Overrides {
  colony?: ColonyOptions;
  rival?: ColonyOptions;
  game?: Partial<Omit<GameParams, "fight">> & { fight?: Partial<FightParams> };
}

export interface Assay {
  id: string;
  title: string;
  /** the behaviour expected and where the number comes from */
  target: string;
  seconds: number;
  spec(seed: number): RunSpec;
  /** the assay's own numbers from a run; `pass` is 1 or 0, or absent when there is no pass mark yet */
  score(result: RunResult, game: Game): Record<string, number>;
}

/** An assay's run with overrides merged in (colony and rival params deep-merged per channel; fight merged). */
export function withOverrides(spec: RunSpec, o: Overrides = {}): RunSpec {
  const sides = { ...spec.sides };
  if (o.colony) sides.colony = mergeColony(sides.colony, o.colony);
  if (o.rival) sides.rival = mergeColony(sides.rival, o.rival);
  const game: Partial<GameParams> = { ...spec.game, ...o.game, fight: undefined };
  if (o.game?.fight || spec.game?.fight) game.fight = { ...DEFAULT_FIGHT, ...spec.game?.fight, ...o.game?.fight };
  else delete game.fight;
  return { ...spec, sides, game };
}

function mergeColony(a: ColonyOptions = {}, b: ColonyOptions = {}): ColonyOptions {
  const channels: NonNullable<ColonyOptions["channels"]> = { ...a.channels };
  for (const [ch, cp] of Object.entries(b.channels ?? {}) as [Channel, object][]) channels[ch] = { ...channels[ch], ...cp };
  return { ...a, ...b, channels };
}

/** Run one assay on one seed. */
export function runAssay(assay: Assay, seed: number, o: Overrides = {}, seconds?: number): RunResult {
  const spec = withOverrides(assay.spec(seed), o);
  if (seconds !== undefined) spec.seconds = seconds;
  const { game, result } = runGame(spec);
  Object.assign(result.metrics, assay.score(result, game));
  return result;
}

const always =
  <T extends string>(v: T) =>
  (): T =>
    v;

/**
 * A1 — the double bridge. A small nest room with two exits to one food room: the short branch is
 * ~64 cells, the long one ~102 (it dips 19 cells further down and back up). Real Argentine ants end
 * up almost all on the short branch in most trials (Goss et al. 1989): the first ants back are the
 * ones that took it, so its trail grows first. Measured on equal 30-cell stretches of each branch
 * from 60 s on.
 */
export const bridge: Assay = {
  id: "bridge",
  title: "A1 double bridge: short vs long branch",
  target: "≥ 80 % of branch traffic on the short branch (Goss et al. 1989: almost all ants, most trials)",
  seconds: 300,
  spec: (seed) => ({
    seed,
    seconds: 300,
    map: () =>
      new Arena(100, 62)
        .carve(2, 22, 15, 38) // nest room
        .carve(80, 22, 97, 38) // food room
        .carve(16, 22, 79, 27) // short branch
        .carve(16, 33, 21, 38) // long branch: out of the room's lower exit,
        .carve(16, 33, 21, 57) // down,
        .carve(16, 52, 75, 57) // along (the stretch measured),
        .carve(70, 33, 75, 57) // up,
        .carve(70, 33, 79, 38) // and into the food room
        .pile(89, 30, 4, 40)
        .build([{ x: 8, y: 30, r: 3 }]),
    game: { antCount: 300, rival: false },
    probes: [occupancyProbe({ short: { x0: 30, y0: 22, x1: 60, y1: 28 }, long: { x0: 30, y0: 52, x1: 60, y1: 58 } }, 60)],
  }),
  score: (r) => {
    const s = r.metrics.short as number;
    const l = r.metrics.long as number;
    const share = s + l > 0 ? s / (s + l) : NaN;
    return { shortShare: share, pass: share >= 0.8 ? 1 : 0 };
  },
};

/**
 * A2a — two equal sources at the same distance. A mass-recruiting colony breaks the symmetry and
 * concentrates on one (Beckers et al. 1990, Lasius niger with two 1 M sources). Food quality is not
 * modelled yet, so the rich-vs-poor test (A2b) waits for Phase 3.
 */
export const twin: Assay = {
  id: "twin",
  title: "A2a two equal sources: does the colony pick one?",
  target: "the busier source takes ≥ 70 % of the food carried (design mark; Beckers et al. 1990: the colony concentrates on one)",
  seconds: 240,
  spec: (seed) => ({
    seed,
    seconds: 240,
    map: () => new Arena(100, 100, true).pile(25, 20, 3, 200).pile(75, 20, 3, 200).build([{ x: 50, y: 85, r: 3 }]),
    game: { antCount: 300, rival: false },
  }),
  score: (_r, game) => {
    const start = 200 * countDisc(game.map.size, 25, 20, 3);
    const left = start - foodIn(game.map, 25, 20, 3);
    const right = start - foodIn(game.map, 75, 20, 3);
    const share = left + right > 0 ? Math.max(left, right) / (left + right) : NaN;
    return { majorityShare: share, pass: share >= 0.7 ? 1 : 0 };
  },
};

function countDisc(size: WorldSize, cx: number, cy: number, r: number): number {
  let n = 0;
  disc(size, cx, cy, r, () => n++);
  return n;
}

/**
 * A3 — a patch runs out. Traffic to it should die away soon after: the food trail is no longer
 * refreshed and evaporates (half-life ~12 s), and ants that find nothing should leave rather than
 * circle (no ant mills). Design mark: the crowd at the patch is under a fifth of its peak within 60 s.
 */
export const deplete: Assay = {
  id: "deplete",
  title: "A3 depletion: traffic leaves an emptied patch",
  target: "crowd at the emptied patch < 20 % of its peak within 60 s of the last food (design mark)",
  seconds: 300,
  spec: (seed) => {
    const patch = { x: 50, y: 40 };
    const crowd: number[] = [];
    let emptyAt = NaN;
    let nextAt = 1;
    let follow60 = NaN;
    const probe: Probe = {
      tick(game) {
        if (game.time + 1e-9 < nextAt) return;
        nextAt += 1;
        crowd.push(antsNear(game, patch.x, patch.y, 6));
        if (Number.isNaN(emptyAt) && foodIn(game.map, patch.x, patch.y, 2) <= 0) emptyAt = game.time;
        if (!Number.isNaN(emptyAt) && Number.isNaN(follow60) && game.time >= emptyAt + 60) follow60 = game.player.counts().follow / Math.max(1, game.player.population);
      },
      summary(): Record<string, number> {
        if (Number.isNaN(emptyAt)) return { emptyAt: NaN, peakCrowd: NaN, clearAfter: NaN, followAfter60: NaN };
        const k0 = Math.floor(emptyAt);
        const peak = Math.max(...crowd.slice(0, k0 + 1));
        const smooth = (k: number) => crowd.slice(Math.max(0, k - 4), k + 1).reduce((a, b) => a + b, 0) / Math.min(5, k + 1);
        let clear = NaN;
        for (let k = k0; k < crowd.length; k++)
          if (smooth(k) < 0.2 * peak) {
            clear = k + 1 - emptyAt;
            break;
          }
        return { emptyAt, peakCrowd: peak, clearAfter: clear, followAfter60: follow60 };
      },
    };
    return {
      seed,
      seconds: 300,
      map: () => new Arena(100, 100, true).pile(patch.x, patch.y, 2, 10).build([{ x: 50, y: 80, r: 3 }]),
      game: { antCount: 200, rival: false },
      probes: [probe],
    };
  },
  score: (r) => {
    const c = r.metrics.clearAfter as number;
    return { pass: Number.isFinite(c) && c <= 60 ? 1 : 0 };
  },
};

/**
 * A4 — alarm on a busy trail. The fungus's alarm brush on the middle of a trail: foragers should
 * scatter from it at once, and the trail should be back in use once the alarm has faded
 * (evaporation 0.25/s). Design marks: the crowd drops to half within 10 s; back to half its
 * earlier level within 60 s.
 */
export const alarm: Assay = {
  id: "alarm",
  title: "A4 alarm on a trail: scatter, then recover",
  target: "crowd ≤ 50 % in the 10 s after alarm; back to ≥ 50 % of before within 60 s (design marks)",
  seconds: 240,
  spec: (seed) => {
    const spot = { x: 50, y: 50 };
    const at = 120;
    const crowd: number[] = [];
    let nextAt = 1;
    const probe: Probe = {
      tick(game) {
        if (game.time + 1e-9 < nextAt) return;
        nextAt += 1;
        crowd.push(antsNear(game, spot.x, spot.y, 6));
      },
      summary() {
        const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);
        const before = mean(crowd.slice(at - 10, at));
        const after = mean(crowd.slice(at + 1, at + 11));
        let back = NaN;
        for (let k = at + 1; k < crowd.length; k++)
          if (mean(crowd.slice(Math.max(at + 1, k - 4), k + 1)) >= 0.5 * before) {
            back = k + 1 - at;
            break;
          }
        return { crowdBefore: before, scatter: before > 0 ? after / before : NaN, recoverAfter: back };
      },
    };
    return {
      seed,
      seconds: 240,
      map: () => new Arena(100, 100, true).pile(50, 18, 3, 200).build([{ x: 50, y: 82, r: 3 }]),
      game: { antCount: 300, rival: false },
      events: [{ at, kind: "paint", channel: "alarm", x: spot.x, y: spot.y, r: 3, amount: 12 }],
      probes: [probe],
    };
  },
  score: (r) => {
    const s = r.metrics.scatter as number;
    const b = r.metrics.recoverAfter as number;
    return { pass: s <= 0.5 && Number.isFinite(b) && b <= 60 ? 1 : 0 };
  },
};

/**
 * A5 — foraging regulation. With no food, a harvester-ant colony keeps most foragers home; when
 * foragers start coming back with food, more go out (Gordon; Pinter-Wollman et al. 2013: the rate of
 * returning foragers sets the rate of outgoing ones). Food appears at 120 s. Design mark: the share
 * of the colony outside the nest before food is at most half what it is once food flows.
 */
export const regulate: Assay = {
  id: "regulate",
  title: "A5 foraging regulation: do foragers stay home without food?",
  target: "share outside before food ≤ ½ × share outside once food flows (Gordon; Pinter-Wollman et al. 2013)",
  seconds: 360,
  spec: (seed) => {
    const nest = { x: 50, y: 50, r: 3 };
    const outside: number[] = [];
    let nextAt = 1;
    const probe: Probe = {
      tick(game) {
        if (game.time + 1e-9 < nextAt) return;
        nextAt += 1;
        const c = game.player;
        let out = 0;
        let alive = 0;
        for (let i = 0; i < c.n; i++) {
          if (!c.alive[i]) continue;
          alive++;
          if (Math.hypot((c.x[i] as number) - nest.x, (c.y[i] as number) - nest.y) > nest.r + 2) out++;
        }
        outside.push(alive ? out / alive : 0);
      },
      summary() {
        const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);
        return { outsideBefore: mean(outside.slice(60, 120)), outsideAfter: mean(outside.slice(240, 360)) };
      },
    };
    return {
      seed,
      seconds: 360,
      map: () => new Arena(100, 100, true).build([nest]),
      game: { antCount: 300, rival: false },
      events: [{ at: 120, kind: "food", x: 50, y: 15, r: 3, perCell: 200 }],
      probes: [probe],
    };
  },
  score: (r) => {
    const b = r.metrics.outsideBefore as number;
    const a = r.metrics.outsideAfter as number;
    return { pass: b <= 0.5 * a ? 1 : 0 };
  },
};

/** A6 arenas: attackers (you, always raiding) against defenders (the rival, local rule), with or without a 2-cell pass between them. */
function battleSpec(seed: number, pass: boolean): RunSpec {
  const a = new Arena(120, 40).carve(2, 2, 117, 37);
  if (pass) a.wall(56, 2, 63, 37).carve(56, 19, 63, 20);
  return {
    seed,
    seconds: 180,
    map: () => a.build([{ x: 20, y: 20, r: 3 }, { x: 100, y: 20, r: 3 }]),
    game: { antCount: 200, rivalAnts: 200 },
    sides: { policy: always<Mode>("fight"), stance: always<Stance>("raid") },
  };
}

const exchange = (r: RunResult) => {
  const att = r.metrics["you.losses"] as number;
  const def = r.metrics["rival.losses"] as number;
  return { attackerLosses: att, defenderLosses: def, exchange: att / Math.max(1, def) };
};

/**
 * A6 — combat through a narrow pass. Narrow passes favour defenders (Lymbery et al. 2023, via the
 * research note): only a few attackers can engage at once. Compare the exchange ratio (attackers
 * lost per defender lost) here with `open`; no pass mark until terrain-limited combat lands (Phase 4).
 */
export const pass: Assay = { id: "pass", title: "A6 combat through a 2-cell pass", target: "exchange (attackers lost per defender) well above `open` (Lymbery et al. 2023); report only", seconds: 180, spec: (s) => battleSpec(s, true), score: exchange };
export const open: Assay = { id: "open", title: "A6 control: the same battle on open ground", target: "control for `pass`; report only", seconds: 180, spec: (s) => battleSpec(s, false), score: exchange };

/**
 * G — the real game on a generated world, 600 + 600 ants. Also the homing regression (A7): the
 * share of either colony out longer than 120 s must stay at or under 7 % (ja-ipu's baseline).
 */
export const game: Assay = {
  id: "game",
  title: "G full game on generated worlds (with A7 homing)",
  target: "no colony with > 7 % of its ants out over 120 s at any moment (provisional: also counts far explorers, see PRD §14.2); food home and outcome reported",
  seconds: 600,
  spec: (seed) => ({ seed, seconds: 600, game: { antCount: 600, rivalAnts: 600 } }),
  score: (r) => {
    const worst = Math.max(r.metrics["you.maxStuck"] ?? 0, r.metrics["rival.maxStuck"] ?? 0);
    return { maxStuck: worst, pass: worst <= 0.07 ? 1 : 0 };
  },
};

export const ASSAYS: Assay[] = [bridge, twin, deplete, alarm, regulate, pass, open, game];
