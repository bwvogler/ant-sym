import { FAINT, type ColonyOptions, type Colony, type Policy, type StancePolicy } from "./colony.ts";
import { between, correlation, foodIn, mean, median, runGame, type Rect, type RunResult, type RunSpec } from "./experiment.ts";
import type { GameParams } from "./game.ts";
import type { Responses } from "./responses.ts";
import { mulberry32, worldFromArrays, type Nest, type WorldMap } from "./world.ts";

// Assays, pure: small hand-built arenas, each with a pass/fail target taken
// from published ant behaviour, plus the whole game on generated maps. Every
// later phase runs these (scripts/experiment.mjs sweeps them over seeds and
// params; tests/assays.test.ts pins short versions) and compares against the
// baseline table in docs/PRD.md §14. An assay whose behaviour the colony
// doesn't model yet says so (`pending`); it still runs, so the baseline shows
// how far today's rules are from the target.

/** What a sweep varies: params for the player's colony (both sides in the combat assay), the rival, the game, and the brains. */
export interface AssayConfig {
  colony?: ColonyOptions;
  rival?: ColonyOptions;
  game?: Partial<GameParams>;
  policy?: Policy;
  stance?: StancePolicy;
  responses?: Responses;
}

export interface MetricDef {
  key: string;
  label: string;
  better: "high" | "low";
}

export interface AssayRun {
  seed: number;
  metrics: Record<string, number>;
  pass: boolean;
}

export interface Assay {
  id: string;
  name: string;
  /** where the target comes from */
  source: string;
  /** the pass rule, in words */
  target: string;
  /** set when the behaviour is not modelled yet: which phase adds it */
  pending?: string;
  metrics: MetricDef[];
  /** one seed; `short` is the gate version for npm test (shorter, smaller) */
  run(seed: number, cfg: AssayConfig, short: boolean): AssayRun;
  /** the verdict over seeds; null = informational, no pass/fail */
  verdict(runs: AssayRun[]): boolean | null;
}

/** A hand-built map: rock and food drawn as rectangles and discs. */
class Arena {
  readonly w: number;
  readonly h: number;
  readonly rock: Uint8Array;
  readonly food: Float32Array;
  constructor(w: number, h: number, solid: boolean) {
    this.w = w;
    this.h = h;
    this.rock = new Uint8Array(w * h).fill(solid ? 1 : 0);
    this.food = new Float32Array(w * h);
  }
  fill(r: Rect, v: 0 | 1): this {
    for (let y = Math.max(0, r.y0); y < Math.min(this.h, r.y1); y++) for (let x = Math.max(0, r.x0); x < Math.min(this.w, r.x1); x++) this.rock[y * this.w + x] = v;
    return this;
  }
  open(r: Rect): this {
    return this.fill(r, 0);
  }
  patch(cx: number, cy: number, radius: number, amount: number): this {
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++)
        if (Math.hypot(x + 0.5 - cx, y + 0.5 - cy) <= radius) {
          this.rock[y * this.w + x] = 0;
          this.food[y * this.w + x] = amount;
        }
    return this;
  }
  build(nests: Nest[], seed: number): WorldMap {
    return worldFromArrays({ w: this.w, h: this.h }, nests, { rock: this.rock, food: this.food, seed });
  }
}

const rect = (x0: number, y0: number, x1: number, y1: number): Rect => ({ x0, y0, x1, y1 });
const around = (x: number, y: number, r: number): Rect => rect(Math.floor(x - r), Math.floor(y - r), Math.ceil(x + r), Math.ceil(y + r));
const nest = (x: number, y: number): Nest => ({ x, y, r: 3 });
/** Plenty: a patch that never runs out within an assay. */
const PLENTY = 1000;
const ARENA_ANTS = 150;

/** A solo arena run: the player's colony with the assay's params under the sweep's. */
function solo(seed: number, cfg: AssayConfig, world: (seed: number) => WorldMap, spec: Omit<RunSpec, "seed" | "world">, colony: ColonyOptions = {}): RunResult {
  return runGame({
    seed,
    world,
    game: { rival: false, antCount: ARENA_ANTS, ...cfg.game },
    player: { policy: cfg.policy, stance: cfg.stance, responses: cfg.responses, colony: { antCount: ARENA_ANTS, maxAnts: ARENA_ANTS, ...colony, ...cfg.colony } },
    ...spec,
  });
}

const share = (a: number, b: number) => (a + b > 0 ? a / (a + b) : 0.5);
const passRate = (runs: AssayRun[]) => runs.filter((r) => r.pass).length / Math.max(1, runs.length);

/** A1: two branches from the nest to one food source, one about 1.9× the other. */
export const A1: Assay = {
  id: "a1",
  name: "double bridge",
  source: "Goss et al. 1989 (Linepithema humile, branches 1:2): most colonies converge on the short branch",
  target: "≥ 80 % of seeds put ≥ 80 % of branch crossings on the short branch over the second half",
  metrics: [
    { key: "shortShare", label: "short-branch share", better: "high" },
    { key: "stored", label: "food home", better: "high" },
  ],
  run(seed, cfg, short) {
    const T = short ? 150 : 300;
    // Nest (8, 20) to food (44, 20): 36 cells straight along the short branch, ~68 up, across and down the long one.
    const world = (s: number) =>
      new Arena(60, 40, true)
        .open(rect(2, 14, 14, 26)) // nest chamber
        .open(rect(38, 14, 50, 26)) // food chamber
        .open(rect(14, 17, 38, 23)) // short branch
        .open(rect(5, 1, 11, 14)) // long branch: up,
        .open(rect(5, 1, 47, 7)) // across,
        .open(rect(41, 1, 47, 14)) // and down
        .patch(44, 20, 3, PLENTY)
        .build([nest(8, 20)], s);
    const r = solo(seed, cfg, world, { seconds: T, regions: { short: rect(24, 17, 28, 23), long: rect(24, 1, 28, 7) } });
    const half = between(r.samples, T / 2, T / 2)[0]!.colonies[0]!;
    const end = r.samples.at(-1)!.colonies[0]!;
    const s = end.regions.short!.entries - half.regions.short!.entries;
    const l = end.regions.long!.entries - half.regions.long!.entries;
    const shortShare = share(s, l);
    return { seed, metrics: { shortShare, stored: end.stored }, pass: shortShare >= 0.8 };
  },
  verdict: (runs) => passRate(runs) >= 0.8,
};

/** A2: a rich and a poor source; offered together the rich one should win, but a poor trail that is already strong persists. */
export const A2: Assay = {
  id: "a2",
  name: "rich vs poor source",
  source: "Beckers et al. 1990, 1993 (Lasius niger): the richer source wins when offered together (~43 % more trail marks); an established poor trail persists",
  target: "per seed: together, ≥ 65 % of the food taken comes from the rich source; poor first, ≥ 50 % still comes from the poor one after the rich one appears. ≥ 80 % of seeds pass",
  pending: "Phase 3: food quality per patch (until then both patches are the same food)",
  metrics: [
    { key: "richShare", label: "rich share, together", better: "high" },
    { key: "poorPersists", label: "poor share after rich added", better: "high" },
  ],
  run(seed, cfg, short) {
    const T = short ? 150 : 300;
    // Sides alternate by seed, so a spatial bias cancels out.
    const rich = seed % 2 ? { x: 25, y: 14 } : { x: 75, y: 14 };
    const poor = seed % 2 ? { x: 75, y: 14 } : { x: 25, y: 14 };
    const richR = around(rich.x, rich.y, 4);
    const poorR = around(poor.x, poor.y, 4);
    const together = solo(seed, cfg, (s) => new Arena(100, 60, false).patch(rich.x, rich.y, 3, PLENTY).patch(poor.x, poor.y, 3, PLENTY).build([nest(50, 48)], s), { seconds: T });
    const m0 = together.game.map;
    const richShare = share(patchFood(rich) - foodIn(m0, richR), patchFood(poor) - foodIn(m0, poorR));
    // Poor first; the rich source appears halfway.
    let poorAtSwitch = 0;
    const seq = solo(seed, cfg, (s) => new Arena(100, 60, false).patch(poor.x, poor.y, 3, PLENTY).build([nest(50, 48)], s), {
      seconds: T,
      events: [
        { at: T / 2, kind: "food", x: rich.x, y: rich.y, radius: 3, amount: PLENTY },
        { at: T / 2, kind: "call", run: (g) => (poorAtSwitch = foodIn(g.map, poorR)) },
      ],
    });
    const poorPersists = share(poorAtSwitch - foodIn(seq.game.map, poorR), patchFood(rich) - foodIn(seq.game.map, richR));
    return { seed, metrics: { richShare, poorPersists }, pass: richShare >= 0.65 && poorPersists >= 0.5 };
  },
  verdict: (runs) => passRate(runs) >= 0.8,
};

/** The food a radius-3 patch at p starts with. */
function patchFood(p: { x: number; y: number }): number {
  return foodIn(new Arena(100, 60, false).patch(p.x, p.y, 3, PLENTY).build([nest(50, 48)], 0), around(p.x, p.y, 4));
}

/** A3: a source that empties; traffic should leave the dead trail, and nobody should circle it. */
export const A3: Assay = {
  id: "a3",
  name: "depletion",
  source: "Pharaoh's ants mark emptied trails with a repellent (Robinson et al. 2005); a dead trail loses its traffic as it evaporates, without ant mills",
  target: "per seed: followers on the old trail fall below 25 % of their level within 60 s of the food going, and ≤ 10 % of the colony is still following at the end. ≥ 80 % of seeds pass",
  metrics: [
    { key: "leaveTime", label: "s to leave the dead trail", better: "low" },
    { key: "millEnd", label: "share still following at end", better: "low" },
    { key: "preFollow", label: "followers on trail before", better: "high" },
  ],
  run(seed, cfg, short) {
    const T0 = 120;
    const T = short ? 210 : 300;
    const corridor = rect(25, 20, 70, 40);
    const r = solo(seed, cfg, (s) => new Arena(100, 60, false).patch(80, 30, 3, PLENTY).build([nest(15, 30)], s), {
      seconds: T,
      regions: { trail: corridor },
      events: [{ at: T0, kind: "clearFood" }],
    });
    const follow = (k: number) => r.samples[k]!.colonies[0]!.regions.trail!.modes.follow;
    const preFollow = mean(between(r.samples, T0 - 30, T0).map((s) => s.colonies[0]!.regions.trail!.modes.follow));
    let leaveTime = T - T0;
    for (let k = 2; k < r.samples.length; k++) {
      if (r.samples[k]!.t <= T0) continue;
      if ((follow(k) + follow(k - 1) + follow(k - 2)) / 3 < 0.25 * preFollow) {
        leaveTime = r.samples[k]!.t - T0;
        break;
      }
    }
    const end = r.samples.at(-1)!.colonies[0]!;
    const millEnd = end.population ? end.modes.follow / end.population : 0;
    return { seed, metrics: { leaveTime, millEnd, preFollow }, pass: preFollow >= 3 && leaveTime <= 60 && millEnd <= 0.1 };
  },
  verdict: (runs) => passRate(runs) >= 0.8,
};

/** The largest alarm level and the farthest cell at or above FAINT, within `r` cells of (x, y). */
function alarmSpread(c: Colony, x: number, y: number, r: number): { max: number; reach: number } {
  let max = 0;
  let reach = 0;
  for (let cy = Math.floor(y - r); cy <= Math.ceil(y + r); cy++)
    for (let cx = Math.floor(x - r); cx <= Math.ceil(x + r); cx++) {
      const v = c.ph.read("alarm", cx + 0.5, cy + 0.5);
      if (v > max) max = v;
      if (v >= FAINT) reach = Math.max(reach, Math.hypot(cx + 0.5 - x, cy + 0.5 - y));
    }
  return { max, reach };
}

/** A4: a blot of alarm on a busy trail: its reach and fade, and who comes or goes. */
export const A4: Assay = {
  id: "a4",
  name: "alarm",
  source: "Bossert & Wilson 1963 (Pogonomyrmex badius: alarm reaches ~6 cm ≈ 9 body lengths and fades within ~35 s); docs/ant-communication.md §2; defenders are drawn, foragers keep away",
  target: "per seed: faint alarm reaches 3–10 cells and fades in 10–40 s; foraging, ants near the blot fall to ≤ 50 %; defending, they rise to ≥ 150 %. ≥ 80 % of seeds pass",
  metrics: [
    { key: "reach", label: "reach after 1 s (cells)", better: "high" },
    { key: "fade", label: "s until below faint", better: "low" },
    { key: "scatter", label: "near ÷ before, foraging", better: "low" },
    { key: "gather", label: "near ÷ before, defending", better: "high" },
  ],
  run(seed, cfg, short) {
    const T0 = short ? 60 : 90;
    const T = T0 + 45;
    const blot = { x: 50, y: 30 };
    const near = around(blot.x, blot.y, 6);
    const world = (s: number) => new Arena(100, 60, false).patch(80, 30, 3, PLENTY).build([nest(20, 30)], s);
    let reach = 0;
    let fade = T - T0;
    const probes = Array.from({ length: 90 }, (_, k) => ({
      at: T0 + 0.5 * (k + 1),
      kind: "call" as const,
      run: (g: { player: Colony; time: number }) => {
        const a = alarmSpread(g.player, blot.x, blot.y, 15);
        if (Math.abs(g.time - (T0 + 1)) < 0.26) reach = a.reach;
        if (a.max < FAINT && fade === T - T0) fade = g.time - T0;
      },
    }));
    const paint = { at: T0, kind: "paint" as const, channel: "alarm" as const, x: blot.x, y: blot.y, radius: 3, amount: 12 };
    const ratio = (r: RunResult) => {
      const before = mean(between(r.samples, T0 - 5, T0).map((s) => s.colonies[0]!.regions.near!.ants));
      const after = mean(between(r.samples, T0 + 2, T0 + 5).map((s) => s.colonies[0]!.regions.near!.ants));
      return after / Math.max(1, before);
    };
    const forage = solo(seed, cfg, world, { seconds: T, regions: { near }, events: [paint, ...probes] });
    const defend = solo(seed, cfg, world, { seconds: T, regions: { near }, events: [paint], forceStance: "defend" });
    const scatter = ratio(forage);
    const gather = ratio(defend);
    return { seed, metrics: { reach, fade, scatter, gather }, pass: reach >= 3 && reach <= 10 && fade >= 10 && fade <= 40 && scatter <= 0.5 && gather >= 1.5 };
  },
  verdict: (runs) => passRate(runs) >= 0.8,
};

/** A5: no food, then food: the colony should keep foragers home while foraging fails, and send them out as successful returns pick up. */
export const A5: Assay = {
  id: "a5",
  name: "foraging regulation",
  source: "Gordon 2002, Pinter-Wollman et al. 2013 (Pogonomyrmex barbatus): the rate foragers leave tracks the rate they come back with food, within seconds to minutes",
  target: "per seed: with no food the share of ants out is ≤ 50 % of the share once food is found, and departures follow successful returns (r ≥ 0.5, 10 s windows, one window lag). ≥ 80 % of seeds pass",
  pending: "Phase 5: forager activation from the rate of successful returns",
  metrics: [
    { key: "activityRatio", label: "out without food ÷ with", better: "low" },
    { key: "response", label: "r(returns, departures)", better: "high" },
  ],
  run(seed, cfg, short) {
    const T1 = short ? 100 : 150;
    const T = short ? 200 : 300;
    const r = solo(seed, cfg, (s) => new Arena(100, 60, false).build([nest(30, 30)], s), {
      seconds: T,
      events: [{ at: T1, kind: "food", x: 85, y: 30, radius: 3, amount: PLENTY }],
    });
    const active = (lo: number, hi: number) => mean(between(r.samples, lo, hi).map((s) => s.colonies[0]!.out / Math.max(1, s.colonies[0]!.population)));
    const activityRatio = active(T1 - 50, T1) / Math.max(1e-6, active(T - 50, T));
    const at = (t: number) => between(r.samples, t, t)[0]!.colonies[0]!;
    const returns: number[] = [];
    const departures: number[] = [];
    for (let t = T1; t + 10 <= T; t += 10) {
      returns.push(at(t + 10).stored - at(t).stored);
      departures.push(at(t + 10).exits - at(t).exits);
    }
    const response = correlation(returns.slice(0, -1), departures.slice(1));
    return { seed, metrics: { activityRatio, response }, pass: activityRatio <= 0.5 && response >= 0.5 };
  },
  verdict: (runs) => passRate(runs) >= 0.8,
};

/** Place `count` living ants of colony c at random in a rectangle (the rest dead), every one fighting. */
function muster(c: Colony, count: number, r: Rect, rng: () => number): void {
  for (let i = 0; i < c.n; i++) {
    c.alive[i] = i < count ? 1 : 0;
    c.x[i] = r.x0 + rng() * (r.x1 - r.x0);
    c.y[i] = r.y0 + rng() * (r.y1 - r.y0);
    c.mode[i] = 3; // fight
  }
}

/** One fight between two musters on a 60×30 field, optionally split by a wall with a gap. */
function skirmish(seed: number, cfg: AssayConfig, a: { n: number; at: Rect }, b: { n: number; at: Rect }, seconds: number, wall: boolean): { lossA: number; lossB: number } {
  const fight: Policy = () => "fight";
  const world = (s: number) => {
    const ar = new Arena(60, 30, false);
    if (wall) ar.fill(rect(30, 0, 31, 30), 1).open(rect(30, 14, 31, 16));
    return ar.build([nest(4, 15), nest(56, 15)], s);
  };
  const side = (n: number): ColonyOptions => ({ antCount: n, maxAnts: n, ...cfg.colony });
  const rng = mulberry32(seed * 131 + 17);
  const r = runGame({
    seed,
    world,
    game: { rival: true, antCount: a.n, rivalAnts: b.n, ...cfg.game },
    player: { policy: fight, responses: cfg.responses, colony: side(a.n) },
    rival: { policy: fight, colony: { ...side(b.n), ...cfg.rival } },
    seconds,
    events: [
      {
        at: 0,
        kind: "call",
        run: (g) => {
          muster(g.colonies[0]!, a.n, a.at, rng);
          muster(g.colonies[1]!, b.n, b.at, rng);
        },
      },
    ],
  });
  return { lossA: r.colonies[0]!.losses, lossB: r.colonies[1]!.losses };
}

/** A6: Lanchester trades in the open, and a narrow pass that favours the defenders. */
export const A6: Assay = {
  id: "a6",
  name: "combat",
  source: "Plowes & Adams 2005 (fire ants: local, roughly linear hazard: equal numbers trade, the bigger crowd wins); Lymbery et al. 2023 (narrow passes favour defenders)",
  target: "median even fight: the larger side's loss ≤ 1.5× the smaller's; per seed, outnumbered 2:1 in the open the defenders trade worse than 1:1, and in a 2-cell pass they trade ≥ 1:1 and ≥ 1.5× better. ≥ 80 % of seeds pass",
  pending: "Phase 4: terrain-limited combat (enemies that count are capped by open cells)",
  metrics: [
    { key: "evenImbalance", label: "even fight: larger ÷ smaller loss", better: "low" },
    { key: "openExchange", label: "2:1 open: attackers lost ÷ defenders lost", better: "low" },
    { key: "passExchange", label: "2:1 pass: attackers lost ÷ defenders lost", better: "high" },
  ],
  run(seed, cfg, short) {
    const T = short ? 15 : 25;
    const even = skirmish(seed, cfg, { n: 60, at: rect(26, 12, 30, 18) }, { n: 60, at: rect(30, 12, 34, 18) }, T, false);
    const open = skirmish(seed + 1000, cfg, { n: 80, at: rect(24, 11, 30, 19) }, { n: 40, at: rect(30, 12, 34, 18) }, T, false);
    const pass = skirmish(seed + 2000, cfg, { n: 80, at: rect(22, 10, 30, 20) }, { n: 40, at: rect(31, 12, 35, 18) }, T, true);
    const ex = (f: { lossA: number; lossB: number }) => f.lossA / Math.max(1, f.lossB);
    const evenImbalance = Math.max(even.lossA, even.lossB) / Math.max(1, Math.min(even.lossA, even.lossB));
    const openExchange = ex(open);
    const passExchange = ex(pass);
    return { seed, metrics: { evenImbalance, openExchange, passExchange }, pass: openExchange < 1 && passExchange >= 1 && passExchange >= 1.5 * openExchange };
  },
  verdict: (runs) => {
    return median(runs.map((r) => r.metrics.evenImbalance as number)) <= 1.5 && passRate(runs) >= 0.8;
  },
};

/** The whole game on a generated map, as the page plays it (UI defaults). Shared by A7 and G: one run per seed and config. */
const gameRuns = new WeakMap<AssayConfig, Map<string, RunResult>>();
function gameRun(seed: number, cfg: AssayConfig, short: boolean): RunResult {
  let m = gameRuns.get(cfg);
  if (!m) gameRuns.set(cfg, (m = new Map()));
  const key = `${seed}|${short}`;
  let r = m.get(key);
  if (!r) {
    const ants = short ? 200 : 600;
    r = runGame({
      seed,
      world: short ? { size: { w: 160, h: 100 } } : {},
      game: { antCount: ants, rivalAnts: ants, ...cfg.game },
      player: { policy: cfg.policy, stance: cfg.stance, responses: cfg.responses, colony: cfg.colony },
      rival: { colony: cfg.rival },
      seconds: short ? 240 : 600,
      sampleEvery: 5,
      timeTicks: true,
    });
    r.samples.length = 0; // keep the summary, not the series: a game run is large
    m.set(key, r);
  }
  return r;
}

/**
 * A7 baseline: the stuck share on seeds 1–10 (600 s, 600 + 600 ants, the default map) before any
 * behaviour change (docs/PRD.md §14). The worst and median seed may not rise above these.
 */
export const A7_BASELINE = { worst: 0.069, median: 0.044 };

/** A7: homing regression: ants out > 120 s without being home or finding food (ja-ipu). */
export const A7: Assay = {
  id: "a7",
  name: "homing regression",
  source: "ja-ipu: senses-only homing leaves a few % of a colony out > 120 s on hard maps",
  target: `per seed the larger colony stuck share ≤ 7 %; over seeds the worst ≤ ${A7_BASELINE.worst} + 0.01 and the median ≤ ${A7_BASELINE.median} + 0.01 (the Phase 0 baseline)`,
  metrics: [
    { key: "stuckEnd", label: "stuck share at end", better: "low" },
    { key: "stuckMax", label: "largest stuck share", better: "low" },
  ],
  run(seed, cfg, short) {
    const r = gameRun(seed, cfg, short);
    const stuckEnd = Math.max(...r.colonies.map((c) => c.stuckEnd));
    const stuckMax = Math.max(...r.colonies.map((c) => c.stuckMax));
    return { seed, metrics: { stuckEnd, stuckMax }, pass: stuckEnd <= 0.07 };
  },
  verdict: (runs) => {
    const s = runs.map((r) => r.metrics.stuckEnd as number);
    return Math.max(...s) <= A7_BASELINE.worst + 0.01 && median(s) <= A7_BASELINE.median + 0.01;
  },
};

/** G: the game as a game: food home, who wins, and what a tick costs. Informational. */
export const G: Assay = {
  id: "g",
  name: "game level",
  source: "PRD §11–12; ja-t6u (balance over seeds); colony-bench ~1.8 ms/tick at 600 + 600",
  target: "informational: food home, wins either way (+1 player won or ahead, −1 rival), ms per tick",
  metrics: [
    { key: "foodHome", label: "player food home (share of map)", better: "high" },
    { key: "foodHomeRival", label: "rival food home", better: "high" },
    { key: "lead", label: "player lead (+1 / 0 / −1)", better: "high" },
    { key: "msPerTick", label: "ms per tick", better: "low" },
  ],
  run(seed, cfg, short) {
    const r = gameRun(seed, cfg, short);
    const [p, v] = r.colonies as [RunResult["colonies"][0], RunResult["colonies"][0] | undefined];
    const lead = r.outcome === "won" ? 1 : r.outcome === "lost" ? -1 : v ? Math.sign(p.population - v.population) : 0;
    return { seed, metrics: { foodHome: p.foodHome, foodHomeRival: v?.foodHome ?? 0, lead, msPerTick: r.msPerTick?.mean ?? 0 }, pass: true };
  },
  verdict: () => null,
};

/** A8: placeholder until the nest has rooms. */
export const A8: Assay = {
  id: "a8",
  name: "nest flow",
  source: "food moves from the entrance inward; brood delays growth",
  target: "defined with Phase 2",
  pending: "Phase 2: nest rooms (entrance → granary → brood)",
  metrics: [],
  run: (seed) => ({ seed, metrics: {}, pass: false }),
  verdict: () => null,
};

export const ASSAYS: Assay[] = [A1, A2, A3, A4, A5, A6, A7, G, A8];

export function assayById(id: string): Assay | undefined {
  return ASSAYS.find((a) => a.id === id);
}

/** Median and worst seed of each metric, the verdict and the pass rate: one row of the experiment table. */
export function summarize(a: Assay, runs: AssayRun[]): { metrics: Record<string, { median: number; worst: number }>; passRate: number; verdict: boolean | null } {
  const metrics: Record<string, { median: number; worst: number }> = {};
  for (const m of a.metrics) {
    const xs = runs.map((r) => r.metrics[m.key]).filter((v): v is number => typeof v === "number" && Number.isFinite(v));
    metrics[m.key] = { median: median(xs), worst: xs.length ? (m.better === "high" ? Math.min(...xs) : Math.max(...xs)) : NaN };
  }
  return { metrics, passRate: passRate(runs), verdict: a.pending && !a.metrics.length ? null : a.verdict(runs) };
}
