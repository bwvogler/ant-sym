// The experiment harness (docs/refactor.md S3.6, ja-fnd.4.6): running a game headless from a spec, scripted events, the probes and
// arenas. The assay catalogue is experiment.ts (with oneAssays.ts and desertAssays.ts); this file holds what every assay runs on.

import { DEFAULT_FIGHT, type FightParams } from "./battle.ts";
import { type Colony, type ColonyParams, PLANE } from "./colony.ts";
import { type Policy, type StancePolicy } from "./vocab.ts";
import { Game, type GameParams, gameRng, isOneWorld, type Sides } from "./game.ts";
import { CELL, cellOf, centreX, centreY, nx, ny, R } from "./hex.ts";
import type { Journal } from "./journal.ts";
import { oneWorldOn, type OneWorld } from "./oneWorld.ts";
import { localResponses, type Responses } from "./responses.ts";
import type { Channel, ChannelParams } from "./pheromone.ts";
import { dropFood, generateSideWorld, OPEN, ROCK, rockAt, type Nest, type WorldMap, type WorldSize, worldFromArrays } from "./world.ts";

// Experiments, pure: run a game headless from a seed, with scripted events
// (paint, add food) and probes that measure behaviour, and score it against a
// target taken from real ants. `runGame` builds games the way the page does
// (`gameRng`, the side view by default), so a number measured here reproduces
// on the page with the same seed.
//
// An *assay* is a small hand-built arena with one question about the colony
// (does the traffic settle on the shorter of two branches? does a trail to an
// emptied patch die out?) and a pass mark from the literature, or a design
// mark where the literature gives none. Arenas are top-down hex maps (the test
// and bench bed, docs/PRD.md §27), drawn in cell coordinates; everything an ant
// or a probe sees is in world units (hex.ts). `game` is the real side-view
// game. scripts/experiment.mjs sweeps assays over seeds and parameter values.
//
// One world (docs/one-world.md, U6a): `oneArena` makes an arena the plane of a one-world game, with a hole at each nest
// and the curtain dug under the line through them; ONE_ASSAYS are the assays rerun so (`experiment.mjs --one`), and
// `game1` (G1) is the whole one-world game. In a one-world game the surface probes (antsNear, the occupancy, crossing
// and outing probes) count only the ants on the plane, since a curtain ant's x, y are the curtain's; paint lands on the
// plane unless an event names a layer.

export type Event =
  | {
      at: number;
      kind: "paint";
      colony?: number;
      channel: Channel;
      x: number;
      y: number;
      r: number;
      amount: number;
      /** one world: the layer painted (default PLANE, the surface); on one map, its only layer */ layer?: number;
    }
  | { at: number; kind: "food"; x: number; y: number; r: number; perCell: number }
  | { at: number; kind: "call"; run: (game: Game) => void };

/** Something that watches a run: called after every tick, asked for its numbers at the end. */
export interface Probe {
  tick(game: Game, dt: number): void;
  summary(game: Game): Record<string, number>;
}

export interface RunSpec {
  seed: number;
  /** the map or one world (game.ts takes either), or how to make it from the seed; default the page's: generateSideWorld(seed) */
  map?: WorldMap | OneWorld | ((seed: number) => WorldMap | OneWorld);
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

/** Seconds a forager may hold its food before it counts as lost (the side view's slow/side.test guard, now G1's). */
export const STUCK_AFTER = 120;

/** The map (or one world) a spec asks for. */
export function specMap(spec: RunSpec): WorldMap | OneWorld {
  return typeof spec.map === "function" ? spec.map(spec.seed) : (spec.map ?? generateSideWorld(spec.seed));
}

/** Run a game headless and collect the standard numbers plus every probe's. */
export function runGame(spec: RunSpec): { game: Game; result: RunResult } {
  const world = specMap(spec);
  const game = new Game(world, spec.game, gameRng(spec.seed), spec.sides);
  // The food the world began with: in one world the plane's piles and the curtain's buried pockets.
  const foodTotal = isOneWorld(world) ? world.plane.foodTotal + world.curtain.foodTotal : world.foodTotal;
  const dt = spec.dt ?? 1 / 30;
  const events = [...(spec.events ?? [])].sort((a, b) => a.at - b.at);
  const probes = [heldProbe(), ...(spec.probes ?? [])];
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
    const side = sideName(k);
    metrics[`${side}.ants`] = c.population;
    metrics[`${side}.stored`] = c.stored;
    metrics[`${side}.foodHome`] = foodTotal > 0 ? c.stored / foodTotal : 0;
    metrics[`${side}.losses`] = c.losses;
    metrics[`${side}.births`] = c.births;
    metrics[`${side}.situations`] = c.situationsSeen;
  });
  const outcome = game.outcome();
  metrics.outcome = outcome === "unified" ? 1 : outcome === "fallen" ? -1 : 0;
  for (const p of probes) Object.assign(metrics, p.summary(game));
  return { game, result: { seed: spec.seed, seconds: game.time, ticks, msPerTick, metrics } };
}

/** "you" for the first colony, "rival" for the second (the names the stack's tests use), then "c2", "c3", … */
export function sideName(k: number): string {
  return k === 0 ? "you" : k === 1 ? "rival" : `c${k}`;
}

function apply(game: Game, e: Event): void {
  // One world: on the plane, where the assays' arenas are, unless the event names a layer.
  if (e.kind === "paint")
    (game.colonies[e.colony ?? 0] ?? game.player).paint(e.channel, e.x, e.y, e.r, e.amount, e.layer ?? (game.world ? PLANE : undefined));
  // Food added later is not part of foodTotal: foodHome stays a share of what the map started with.
  else if (e.kind === "food") discWorld(game.map.size, e.x, e.y, e.r, (x, y) => dropFood(game.map, centreX(x, y), centreY(y), e.perCell));
  else e.run(game);
}

/** Every cell whose centre is within r (world units) of world (wx, wy), clipped to the map. */
export function discWorld(size: WorldSize, wx: number, wy: number, r: number, fn: (x: number, y: number) => void): void {
  const y0 = Math.max(0, Math.floor((wy - r) / R) - 1);
  const y1 = Math.min(size.h - 1, Math.ceil((wy + r) / R) + 1);
  for (let y = y0; y <= y1; y++)
    for (let x = Math.max(0, Math.floor(wx - r) - 1); x <= Math.min(size.w - 1, Math.ceil(wx + r) + 1); x++)
      if (Math.hypot(centreX(x, y) - wx, centreY(y) - wy) <= r) fn(x, y);
}

/** Food left within r (world units) of world (wx, wy). */
export function foodIn(map: WorldMap, wx: number, wy: number, r: number): number {
  let s = 0;
  discWorld(map.size, wx, wy, r, (x, y) => (s += map.food.get(x, y)));
  return s;
}

/**
 * Foragers holding food longer than STUCK_AFTER, the most at any 10-s sample from STUCK_AFTER on, per colony
 * (the side view's slow/side.test measure, now G1's; porters are not counted): `maxHeld`. That measure reads the colony's `since`, which the
 * nest resets every tick, so it misses a carrier that won't put its food down at home; `maxCarrying` counts by the
 * probe's own clock, from pickup to put-down, wherever the ant is (#31's review, ja-1pm). `maxPorting`: porters (food
 * moved between chambers, which both other measures leave out) holding theirs over STUCK_AFTER (review of #36, ja-3po).
 * In one world every layer counts by default (a carrier stuck in the tunnels is stuck too); `layer` counts only the ants
 * on that layer at each sample (their clocks run on either), and `tag` follows each key (`you.maxHeldPlane`).
 */
export function heldProbe(layer = -1, tag = ""): Probe {
  const worst: number[] = [];
  const worstCarry: number[] = [];
  const worstPort: number[] = [];
  const carryT: Float64Array[] = [];
  const portT: Float64Array[] = [];
  let nextAt = STUCK_AFTER;
  return {
    tick(game, dt) {
      game.colonies.forEach((c, k) => {
        const grow = (a: Float64Array[]): Float64Array => {
          let t = a[k];
          if (!t || t.length < c.n) {
            const grown = new Float64Array(c.n);
            if (t) grown.set(t);
            t = a[k] = grown;
          }
          return t;
        };
        const t = grow(carryT);
        const pt = grow(portT);
        for (let i = 0; i < c.n; i++) {
          t[i] = c.alive[i] && c.carrying[i] && !c.porting(i) ? t[i] + dt : 0;
          pt[i] = c.alive[i] && c.carrying[i] && c.porting(i) ? pt[i] + dt : 0;
        }
      });
      if (game.time + 1e-9 < nextAt) return;
      nextAt += 10;
      game.colonies.forEach((c, k) => {
        let held = 0;
        let carrying = 0;
        let porting = 0;
        const t = carryT[k] as Float64Array;
        const pt = portT[k] as Float64Array;
        for (let i = 0; i < c.n; i++) {
          if (!onLayer(game, c, i, layer)) continue;
          if (c.alive[i] && c.carrying[i] && !c.porting(i) && c.since[i] > STUCK_AFTER) held++;
          if (t[i] > STUCK_AFTER) carrying++;
          if (pt[i] > STUCK_AFTER) porting++;
        }
        worst[k] = Math.max(worst[k] ?? 0, held);
        worstCarry[k] = Math.max(worstCarry[k] ?? 0, carrying);
        worstPort[k] = Math.max(worstPort[k] ?? 0, porting);
      });
    },
    summary() {
      const m: Record<string, number> = {};
      worst.forEach((w, k) => (m[`${sideName(k)}.maxHeld${tag}`] = w));
      worstCarry.forEach((w, k) => (m[`${sideName(k)}.maxCarrying${tag}`] = w));
      worstPort.forEach((w, k) => (m[`${sideName(k)}.maxPorting${tag}`] = w));
      return m;
    },
  };
}

/**
 * Whether a probe counts ant i of colony c on `layer`: on one map every ant; in one world only the ants on that layer
 * (−1: every layer). A curtain ant's x, y are the curtain's, so a probe of the surface must leave it out.
 */
export function onLayer(game: Game, c: Colony, i: number, layer: number): boolean {
  return !game.world || layer < 0 || c.layer[i] === layer;
}

/** A rectangle in world units, x0 ≤ x < x1, y0 ≤ y < y1. */
export interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

const inRect = (r: Rect, x: number, y: number) => x >= r.x0 && x < r.x1 && y >= r.y0 && y < r.y1;

/** The world rectangle covering cells x0..x1 × y0..y1 (inclusive, cell coordinates). */
export function cellRect(x0: number, y0: number, x1: number, y1: number): Rect {
  return { x0: centreX(x0, 0) - 0.5, y0: centreY(y0) - 0.5, x1: centreX(x1, 1) + 0.5, y1: centreY(y1) + 0.5 };
}

/** Ant-seconds a colony spends in each region from `from` to `to` (s); in one world, on the plane. */
export function occupancyProbe(regions: Record<string, Rect>, from = 0, to = Infinity, colony = 0): Probe {
  const total: Record<string, number> = Object.fromEntries(Object.keys(regions).map((k) => [k, 0]));
  return {
    tick(game, dt) {
      if (game.time < from || game.time > to) return;
      const c = game.colonies[colony];
      if (!c) return;
      for (let i = 0; i < c.n; i++) {
        if (!c.alive[i] || !onLayer(game, c, i, PLANE)) continue;
        const x = c.x[i];
        const y = c.y[i];
        for (const [k, r] of Object.entries(regions)) if (inRect(r, x, y)) total[k] = total[k] + dt;
      }
    },
    summary: () => ({ ...total }),
  };
}

/**
 * Passages through gates: an ant inside a gate's rectangle that crosses its middle line (x = (x0 + x1) / 2), either
 * way, counts once (`<gate>Passes`). Goss et al. counted passages over each branch; occupancy also counts ants that
 * dawdle (ja-dez). In one world, on the plane: an ant gone down a hole is out of every gate.
 */
export function crossingProbe(gates: Record<string, Rect>, from = 0, colony = 0): Probe {
  const names = Object.keys(gates);
  const total = names.map(() => 0);
  let side: Int8Array[] = [];
  return {
    tick(game) {
      const c = game.colonies[colony];
      if (!c) return;
      if ((side[0]?.length ?? -1) < c.n)
        side = names.map((_, g) => {
          const a = new Int8Array(c.n);
          a.set(side[g] ?? []);
          return a;
        });
      names.forEach((k, g) => {
        const r = gates[k] as Rect;
        const mid = (r.x0 + r.x1) / 2;
        const sd = side[g] as Int8Array;
        for (let i = 0; i < c.n; i++) {
          const x = c.x[i];
          if (!c.alive[i] || !onLayer(game, c, i, PLANE) || !inRect(r, x, c.y[i])) {
            sd[i] = 0;
            continue;
          }
          const now = x < mid ? -1 : 1;
          if (sd[i] !== 0 && sd[i] !== now && game.time >= from) total[g] = total[g] + 1;
          sd[i] = now;
        }
      });
    },
    summary: () => Object.fromEntries(names.map((k, g) => [`${k}Passes`, total[g]])),
  };
}

/** Ants of a colony within r (world units) of world (x, y) right now; in one world, on `layer` (default the plane). */
export function antsNear(game: Game, x: number, y: number, r: number, colony = 0, layer = PLANE): number {
  const c = game.colonies[colony];
  if (!c) return 0;
  let s = 0;
  for (let i = 0; i < c.n; i++) if (c.alive[i] && onLayer(game, c, i, layer) && Math.hypot(c.x[i] - x, c.y[i] - y) <= r) s++;
  return s;
}

/** World position of cell (x, y)'s centre. */
export function at(x: number, y: number): { x: number; y: number } {
  return { x: centreX(x, y), y: centreY(y) };
}

// ---------------------------------------------------------------- arenas

/** A hand-built top-down hex map in cell coordinates: all rock until carved (or all open), then food piles and nests. */
export class Arena {
  readonly size: WorldSize;
  readonly rock: Uint8Array;
  readonly food: Float32Array;
  readonly quality: Float32Array;

  constructor(w: number, h: number, open = false) {
    this.size = { w, h };
    this.rock = new Uint8Array(w * h).fill(open ? OPEN : ROCK);
    this.food = new Float32Array(w * h);
    this.quality = new Float32Array(w * h).fill(1);
  }

  /** Open ground over the inclusive cell rectangle. */
  carve(x0: number, y0: number, x1: number, y1: number): this {
    return this.#fill(x0, y0, x1, y1, OPEN);
  }

  /** Rock over the inclusive cell rectangle. */
  wall(x0: number, y0: number, x1: number, y1: number): this {
    return this.#fill(x0, y0, x1, y1, ROCK);
  }

  /**
   * Open ground along a polyline given in world units: every cell whose centre is within `half` of a segment. Lets an
   * arena have corridors at any angle (the hex rows only give 0° and ±60°), so two branches can leave a choice point
   * at equal angles.
   */
  path(points: [number, number][], half: number): this {
    for (let k = 1; k < points.length; k++) {
      const [ax, ay] = points[k - 1] as [number, number];
      const [bx, by] = points[k] as [number, number];
      const dx = bx - ax;
      const dy = by - ay;
      const len2 = dx * dx + dy * dy || 1;
      const y0 = Math.max(0, Math.floor((Math.min(ay, by) - half) / R) - 1);
      const y1 = Math.min(this.size.h - 1, Math.ceil((Math.max(ay, by) + half) / R) + 1);
      for (let y = y0; y <= y1; y++)
        for (
          let x = Math.max(0, Math.floor(Math.min(ax, bx) - half) - 1);
          x <= Math.min(this.size.w - 1, Math.ceil(Math.max(ax, bx) + half) + 1);
          x++
        ) {
          const px = centreX(x, y);
          const py = centreY(y);
          const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
          if (Math.hypot(px - ax - t * dx, py - ay - t * dy) <= half) this.rock[y * this.size.w + x] = OPEN;
        }
    }
    return this;
  }

  #fill(x0: number, y0: number, x1: number, y1: number, v: number): this {
    for (let y = Math.max(0, y0); y <= Math.min(this.size.h - 1, y1); y++)
      for (let x = Math.max(0, x0); x <= Math.min(this.size.w - 1, x1); x++) this.rock[y * this.size.w + x] = v;
    return this;
  }

  /** A pile of `perCell` food of `quality` (world.ts: WorldMap.quality) on every open cell within r (world units) of cell (cx, cy)'s centre. */
  pile(cx: number, cy: number, r: number, perCell: number, quality = 1): this {
    const c = at(cx, cy);
    discWorld(this.size, c.x, c.y, r, (x, y) => {
      const i = y * this.size.w + x;
      if (this.rock[i] === OPEN) {
        this.food[i] = perCell;
        this.quality[i] = quality;
      }
    });
    return this;
  }

  /** The map, with nests centred on cells (cx, cy), radius r (world units). */
  build(nests: { x: number; y: number; r: number }[]): WorldMap {
    const ns: Nest[] = nests.map((n) => ({ ...at(n.x, n.y), r: n.r }));
    return worldFromArrays(this.size, ns, {
      rock: this.rock,
      food: this.food,
      ...(this.quality.some((q) => q !== 1) ? { quality: this.quality } : {}),
    });
  }
}

/** Cells of a disc of radius r (world units) around cell (cx, cy): how much food a pile of that size starts with, per unit. */
export function cellsIn(size: WorldSize, cx: number, cy: number, r: number): number {
  const c = at(cx, cy);
  let n = 0;
  discWorld(size, c.x, c.y, r, () => n++);
  return n;
}

// ---------------------------------------------------------------- assays

/** Parameter changes from the command line, applied on top of an assay's own. */
export interface Overrides {
  colony?: ColonyOptions;
  rival?: ColonyOptions;
  game?: Partial<Omit<GameParams, "fight">> & { fight?: Partial<FightParams> };
  /** the player's brains (e.g. Jev's cached answers, replayed); an assay that sets its own policy or stance keeps it */
  policy?: Policy;
  stance?: StancePolicy;
  /** the player's responses, hook by hook: they replace the assay's own (or the local ones) only for the hooks they define */
  responses?: Partial<Responses>;
}

/** Colony params as an override gives them: pheromone channels merge per channel and per field. */
export type ColonyOptions = Partial<ColonyParams>;

export interface Assay {
  id: string;
  title: string;
  /** the behaviour expected and where the number comes from */
  target: string;
  seconds: number;
  spec(seed: number): RunSpec;
  /** the control run `score` makes beside it, when it makes one (A6: the same battle on open ground) */
  control?(seed: number): RunSpec;
  /** the assay's own numbers from a run; `pass` is 1 or 0, or absent when there is no pass mark yet */
  score(result: RunResult, game: Game): Record<string, number>;
}

/** An assay's run with overrides merged in (colony and rival params deep-merged per channel; fight merged; brains as documented on Overrides). */
export function withOverrides(spec: RunSpec, o: Overrides = {}): RunSpec {
  const sides: Sides = { ...spec.sides };
  if (o.colony) sides.colony = mergeColony(sides.colony, o.colony);
  if (o.rival) sides.rival = mergeColony(sides.rival, o.rival);
  if (o.policy && !sides.policy) sides.policy = o.policy;
  if (o.stance && !sides.stance) sides.stance = o.stance;
  if (o.responses) sides.responses = { ...(sides.responses ?? localResponses), ...o.responses };
  const game: Partial<GameParams> = { ...spec.game, ...o.game, fight: undefined };
  if (o.game?.fight || spec.game?.fight) game.fight = { ...DEFAULT_FIGHT, ...spec.game?.fight, ...o.game?.fight };
  else delete game.fight;
  return { ...spec, sides, game };
}

function mergeColony(a: ColonyOptions = {}, b: ColonyOptions = {}): ColonyOptions {
  const channels: NonNullable<ColonyOptions["channels"]> = { ...a.channels };
  for (const [ch, cp] of Object.entries(b.channels ?? {}) as [Channel, Partial<ChannelParams>][]) channels[ch] = { ...channels[ch], ...cp };
  return { ...a, ...b, channels };
}

/** A journal (journal.ts, ja-8tb) as a probe: it observes after every tick and adds no metrics. */
export function journalProbe(j: Journal): Probe {
  return { tick: (game) => j.observe(game), summary: () => ({}) };
}

/** Run one assay on one seed; with a journal, it watches the run (`experiment.mjs --log`). */
export function runAssay(assay: Assay, seed: number, o: Overrides = {}, seconds?: number, journal?: Journal): RunResult {
  const spec = withOverrides(assay.spec(seed), o);
  if (seconds !== undefined) spec.seconds = seconds;
  if (journal) spec.probes = [...(spec.probes ?? []), journalProbe(journal)];
  const { game, result } = runGame(spec);
  Object.assign(result.metrics, assay.score(result, game));
  return result;
}

// ---------------------------------------------------------------- one world (U6a, ja-lp4.6.1)

export interface OneArenaOptions {
  /** keep the curtain's buried food; by default there is none, so `stored` counts only food carried down from the plane */
  buried?: boolean;
}

/**
 * An arena as one world's plane (docs/one-world.md §2): the arena's map with an empty mound (`spoil`), a hole at each of
 * its nests, in order, on the line through them (makeTransect: one hole is a line too, its margins straight out east and
 * west), and the curtain dug under that line from `seed` (generateCurtain: each nest's shaft and royal chamber). Every
 * worker starts in the curtain, with the queen and brood (one-world §8 item 12), and forages on the plane. The line's
 * margins run off a small arena: off the plane is rock (transect.ts cellAt).
 */
export function oneArena(arena: WorldMap, seed: number, { buried = false }: OneArenaOptions = {}): OneWorld {
  const world = oneWorldOn(seed, arena);
  if (!buried) {
    const { curtain } = world;
    for (let y = 0; y < curtain.size.h; y++)
      for (let x = curtain.x0; x < curtain.x0 + curtain.size.w; x++) if (curtain.food.get(x, y)) curtain.food.set(x, y, 0);
    curtain.foodTotal = 0;
    curtain.foodLeft = 0;
  }
  return world;
}

/** A run spec moved to one world: its map, an arena (or a function of the seed making one), becomes the plane (oneArena). */
export function onPlane(spec: RunSpec, opts: OneArenaOptions = {}): RunSpec {
  const given = spec.map;
  return {
    ...spec,
    map: (seed) => {
      const m = typeof given === "function" ? given(seed) : given;
      if (!m || isOneWorld(m)) throw new Error("onPlane: the spec's map must be an arena (a top-down map)");
      return oneArena(m, seed, opts);
    },
  };
}

/**
 * One world (ja-web): the ants each colony holds at the gate at the top of its shaft (Colony.gateHeld), sampled every
 * second: the mean and the most, per colony (`you.heldMean`, `you.heldMax`), and their mean share of the colony's
 * living ants (`you.heldShare`).
 */
export function gateProbe(): Probe {
  const sum: number[] = [];
  const most: number[] = [];
  const share: number[] = [];
  let samples = 0;
  let nextAt = 1;
  return {
    tick(game) {
      if (game.time + 1e-9 < nextAt) return;
      nextAt += 1;
      samples++;
      game.colonies.forEach((c, k) => {
        sum[k] = (sum[k] ?? 0) + c.gateHeld;
        most[k] = Math.max(most[k] ?? 0, c.gateHeld);
        const alive = c.population;
        share[k] = (share[k] ?? 0) + (alive > 0 ? c.gateHeld / alive : 0);
      });
    },
    summary() {
      const m: Record<string, number> = {};
      sum.forEach((v, k) => {
        m[`${sideName(k)}.heldMean`] = samples ? v / samples : 0;
        m[`${sideName(k)}.heldMax`] = most[k] ?? 0;
        m[`${sideName(k)}.heldShare`] = samples ? (share[k] ?? 0) / samples : 0;
      });
      return m;
    },
  };
}

/** The mean of a list, NaN for none. */
export const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);

/** How near the hole (in steps of the way round) a walked ant counts as arrived and is let go: MARCH_REACH. */
export const MARCH_REACH = 3;

/**
 * An experimental device, not a behaviour (owner, review of #184 D2): the harness walks colony `k`'s ants on one world's
 * plane to colony `to`'s hole, by the open ground's way round, so no colony code marches at coordinates. Every tick each
 * of them on the plane that has no stranger of colony `to` within its enemy range (+1 cell) is turned toward the cell two
 * steps on along the way (as R1's walk out); one that has is let go, so the fight is the ants' own. So is one within
 * MARCH_REACH steps of the hole. Ants in the curtain come up by their own rules. Reported: `marched`, the share of
 * colony `k`'s ants that reached the hole (within MARCH_REACH steps) at least once. `walks` is [k, to], for tests.
 */
export function marchProbe(k: number, to: number): Probe & { walks: readonly [number, number] } {
  let field: Int32Array | null = null;
  let w = 0;
  let h = 0;
  const arrived = new Set<number>();
  const build = (game: Game): Int32Array => {
    const plane = (game.world as OneWorld).plane;
    w = plane.size.w;
    h = plane.size.h;
    const f = new Int32Array(w * h).fill(-1);
    const nest = game.colonies[to]!.layers[PLANE]!.nest;
    cellOf(nest.x, nest.y);
    const queue = [CELL[0] + CELL[1] * w];
    f[queue[0]!] = 0;
    for (let q = 0; q < queue.length; q++) {
      const at = queue[q]!;
      const x = at % w;
      const y = (at - x) / w;
      for (let d = 0; d < 6; d++) {
        const tx = nx(x, y, d);
        const ty = ny(y, d);
        if (tx < 0 || ty < 0 || tx >= w || ty >= h) continue;
        const t = tx + ty * w;
        if (f[t] >= 0 || rockAt(plane, tx, ty) !== OPEN) continue;
        f[t] = f[at]! + 1;
        queue.push(t);
      }
    }
    return f;
  };
  return {
    walks: [k, to] as const,
    tick(game) {
      if (!game.world) throw new Error("marchProbe: one world only");
      const f = (field ??= build(game));
      const c = game.colonies[k];
      const foe = game.colonies[to];
      if (!c || !foe) return;
      const reach = c.params.enemyRange + 1;
      for (let i = 0; i < c.n; i++) {
        if (!c.alive[i] || c.layer[i] !== PLANE) continue;
        const x = c.x[i];
        const y = c.y[i];
        cellOf(x, y);
        let cx = CELL[0];
        let cy = CELL[1];
        const here = cx >= 0 && cy >= 0 && cx < w && cy < h ? f[cx + cy * w]! : -1;
        if (here < 0) continue;
        if (here <= MARCH_REACH) {
          arrived.add(i);
          continue;
        }
        let near = false;
        for (let j = 0; j < foe.n && !near; j++)
          if (foe.alive[j] && foe.layer[j] === PLANE && Math.hypot(foe.x[j] - x, foe.y[j] - y) <= reach) near = true;
        if (near) continue;
        for (let s = 0; s < 2; s++) {
          let best = f[cx + cy * w]!;
          let bx = cx;
          let by = cy;
          for (let d = 0; d < 6; d++) {
            const tx = nx(cx, cy, d);
            const ty = ny(cy, d);
            if (tx < 0 || ty < 0 || tx >= w || ty >= h) continue;
            const g = f[tx + ty * w]!;
            if (g >= 0 && g < best) {
              best = g;
              bx = tx;
              by = ty;
            }
          }
          cx = bx;
          cy = by;
        }
        c.heading[i] = Math.atan2(centreY(cy) - y, centreX(cx, cy) - x);
      }
    },
    summary(game) {
      return { marched: arrived.size / Math.max(1, game.colonies[k]?.params.antCount ?? 1) };
    },
  };
}
