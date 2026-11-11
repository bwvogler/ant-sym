import { DEFAULT_FIGHT, type FightParams } from "./battle.ts";
import { type Colony, type ColonyParams, FAINT, type HoleCell, type Layer, LIFESPAN, MODES, type Mode, PI_DRIFT, PLANE, type Policy, type Stance, type StancePolicy } from "./colony.ts";
import { isFed, LARVA, LARVA_FOOD } from "./brood.ts";
import { Game, type GameParams, gameRng, isOneWorld, type Sides } from "./game.ts";
import { CELL, cellOf, centreX, centreY, R } from "./hex.ts";
import { STRAINS } from "./fungus.ts";
import { generateOneWorld, oneWorldOn, type OneWorld } from "./oneWorld.ts";
import { localResponses, responses, type Responses } from "./responses.ts";
import type { Channel, ChannelParams } from "./pheromone.ts";
import { dropFood, isSky, mulberry32, rockAt, takeFoodCell, generateSideWorld, generateWorld, OPEN, OPEN_WORLD, ROCK, type Nest, type WorldMap, type WorldSize, worldFromArrays } from "./world.ts";

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
  | { at: number; kind: "paint"; colony?: number; channel: Channel; x: number; y: number; r: number; amount: number; /** one world: the layer painted (default PLANE, the surface); on one map, its only layer */ layer?: number }
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

/** Seconds a forager may hold its food before it counts as lost (slow/side.test's guard). */
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
  if (e.kind === "paint") (game.colonies[e.colony ?? 0] ?? game.player).paint(e.channel, e.x, e.y, e.r, e.amount, e.layer ?? (game.world ? PLANE : undefined));
  // Food added later is not part of foodTotal: foodHome stays a share of what the map started with.
  else if (e.kind === "food") discWorld(game.map.size, e.x, e.y, e.r, (x, y) => dropFood(game.map, centreX(x, y), centreY(y), e.perCell));
  else e.run(game);
}

/** Every cell whose centre is within r (world units) of world (wx, wy), clipped to the map. */
export function discWorld(size: WorldSize, wx: number, wy: number, r: number, fn: (x: number, y: number) => void): void {
  const y0 = Math.max(0, Math.floor((wy - r) / R) - 1);
  const y1 = Math.min(size.h - 1, Math.ceil((wy + r) / R) + 1);
  for (let y = y0; y <= y1; y++)
    for (let x = Math.max(0, Math.floor(wx - r) - 1); x <= Math.min(size.w - 1, Math.ceil(wx + r) + 1); x++) if (Math.hypot(centreX(x, y) - wx, centreY(y) - wy) <= r) fn(x, y);
}

/** Food left within r (world units) of world (wx, wy). */
export function foodIn(map: WorldMap, wx: number, wy: number, r: number): number {
  let s = 0;
  discWorld(map.size, wx, wy, r, (x, y) => (s += map.food.get(x, y)));
  return s;
}

/**
 * Foragers holding food longer than STUCK_AFTER, the most at any 10-s sample from STUCK_AFTER on, per colony
 * (slow/side.test's measure; porters are not counted): `maxHeld`. That measure reads the colony's `since`, which the
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
          t[i] = c.alive[i] && c.carrying[i] && !c.porting(i) ? (t[i] as number) + dt : 0;
          pt[i] = c.alive[i] && c.carrying[i] && c.porting(i) ? (pt[i] as number) + dt : 0;
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
          if (c.alive[i] && c.carrying[i] && !c.porting(i) && (c.since[i] as number) > STUCK_AFTER) held++;
          if ((t[i] as number) > STUCK_AFTER) carrying++;
          if ((pt[i] as number) > STUCK_AFTER) porting++;
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
        const x = c.x[i] as number;
        const y = c.y[i] as number;
        for (const [k, r] of Object.entries(regions)) if (inRect(r, x, y)) total[k] = (total[k] as number) + dt;
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
          const x = c.x[i] as number;
          if (!c.alive[i] || !onLayer(game, c, i, PLANE) || !inRect(r, x, c.y[i] as number)) {
            sd[i] = 0;
            continue;
          }
          const now = x < mid ? -1 : 1;
          if (sd[i] !== 0 && sd[i] !== now && game.time >= from) total[g] = (total[g] as number) + 1;
          sd[i] = now;
        }
      });
    },
    summary: () => Object.fromEntries(names.map((k, g) => [`${k}Passes`, total[g] as number])),
  };
}

/** Ants of a colony within r (world units) of world (x, y) right now; in one world, on `layer` (default the plane). */
export function antsNear(game: Game, x: number, y: number, r: number, colony = 0, layer = PLANE): number {
  const c = game.colonies[colony];
  if (!c) return 0;
  let s = 0;
  for (let i = 0; i < c.n; i++) if (c.alive[i] && onLayer(game, c, i, layer) && Math.hypot((c.x[i] as number) - x, (c.y[i] as number) - y) <= r) s++;
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
        for (let x = Math.max(0, Math.floor(Math.min(ax, bx) - half) - 1); x <= Math.min(this.size.w - 1, Math.ceil(Math.max(ax, bx) + half) + 1); x++) {
          const px = centreX(x, y);
          const py = centreY(y);
          const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
          if (Math.hypot(px - ax - t * dx, py - ay - t * dy) <= half) this.rock[y * this.size.w + x] = OPEN;
        }
    }
    return this;
  }

  #fill(x0: number, y0: number, x1: number, y1: number, v: number): this {
    for (let y = Math.max(0, y0); y <= Math.min(this.size.h - 1, y1); y++) for (let x = Math.max(0, x0); x <= Math.min(this.size.w - 1, x1); x++) this.rock[y * this.size.w + x] = v;
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
    return worldFromArrays(this.size, ns, { rock: this.rock, food: this.food, ...(this.quality.some((q) => q !== 1) ? { quality: this.quality } : {}) });
  }
}

/** Cells of a disc of radius r (world units) around cell (cx, cy): how much food a pile of that size starts with, per unit. */
function cellsIn(size: WorldSize, cx: number, cy: number, r: number): number {
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
 * Each ant's own stance (docs/stance.md): a colony whose waiting foragers go out as raid scouts whenever no food comes back
 * (what a raid stance did before), and one whose never do (a forage stance).
 */
export const RAIDING = responses({ leave: (t) => (t.mode !== "fight" && t.stance === "forage" && t.returns === "none" ? "raid" : localResponses.leave(t)) });
export const NEVER_RAID = responses({
  leave: (t) => {
    const a = localResponses.leave(t);
    return a === "raid" ? "wait" : a;
  },
});

const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);

/** Food a colony must bring home for a bridge run to count: a share measured on almost no traffic says nothing (ja-dez). */
export const BRIDGE_MIN_STORED = 20;

/**
 * A1 — the double bridge (Goss et al. 1989; docs/trails.md, PRD §45.1). One stem from the nest to a choice point; two
 * branches leave it at ±30° and look alike for their first 10 units, then the short one runs straight across and the
 * long one out, along and back (twice the length), and they meet at a mirror-image fork before the food. Only length
 * tells the branches apart. The long branch's side alternates with the seed (below on odd seeds, above on even ones),
 * as Goss swapped sides between trials: homing ants on this map lean to one side at a symmetric fork (ja-dez's
 * measurements), and a fixed side would score that lean, not the trail. Score: passages over equal 16-unit straight
 * stretches of each branch from 60 s on (ant-seconds too, as `timeShare`), counted only when food came home.
 * (MR 0's box arena, where the short branch was also the straight line home, scored 0.59 for that reason alone.)
 */
function bridgeSpec(seed: number): RunSpec {
  // World units. The stem runs right from the nest to fork A; the branches meet at fork B; then the food room.
  const half = 2.2;
  const ax = 18;
  const bx = 62;
  const d = 10;
  const dx = d * Math.cos(Math.PI / 6);
  const dy = d * Math.sin(Math.PI / 6);
  // The long branch's legs out and back make it twice the short one: 2d + 2v + run = 2 (2d + run).
  const run = bx - ax - 2 * dx;
  const v = (2 * d + run) / 2;
  const up = seed % 2 === 1 ? 1 : -1; // which way the long branch goes (+1: down the map)
  const row = up === 1 ? 35 : 2 * Math.ceil((dy + v + 6) / R / 2) + 1;
  const n = at(8, row);
  const y = n.y;
  const shortY = y - up * dy;
  const longY = y + up * (dy + v);
  const rows = Math.ceil((Math.max(y + dy, longY) + 6) / R);
  const mid = (ax + bx) / 2;
  const stretch = (yy: number): Rect => ({ x0: mid - 8, x1: mid + 8, y0: yy - half, y1: yy + half });
  const gates = { short: stretch(shortY), long: stretch(longY) };
  return {
    seed,
    seconds: 300,
    map: () =>
      new Arena(84, rows)
        .path([[n.x - 5, y], [n.x + 5, y]], 4.5) // nest room
        .path([[n.x, y], [ax, y]], half) // stem
        .path([[ax, y], [ax + dx, shortY], [bx - dx, shortY], [bx, y]], half) // short branch
        .path([[ax, y], [ax + dx, y + up * dy], [ax + dx, longY], [bx - dx, longY], [bx - dx, y + up * dy], [bx, y]], half) // long branch
        .path([[bx, y], [76, y]], half) // to the food
        .path([[72, y], [80, y]], 4.5) // food room
        .pile(76, row, 4, 40)
        .build([{ x: 8, y: row, r: 3 }]),
    game: { antCount: 300, rival: false },
    probes: [occupancyProbe(gates, 60), crossingProbe(gates, 60)],
  };
}

export const bridge: Assay = {
  id: "bridge",
  title: "A1 double bridge: short vs long branch",
  target: `≥ 80 % of passages on the short branch, with ≥ ${BRIDGE_MIN_STORED} food home (Goss et al. 1989: almost all ants, most trials)`,
  seconds: 300,
  spec: bridgeSpec,
  score: (r) => {
    const ratio = (a: number, b: number) => (a + b > 0 ? a / (a + b) : NaN);
    const passShare = ratio(r.metrics.shortPasses as number, r.metrics.longPasses as number);
    const shortShare = (r.metrics["you.stored"] as number) >= BRIDGE_MIN_STORED ? passShare : NaN;
    return { shortShare, timeShare: ratio(r.metrics.short as number, r.metrics.long as number), pass: shortShare >= 0.8 ? 1 : 0 };
  },
};

/**
 * A2a — two equal sources at the same distance. A mass-recruiting colony breaks the symmetry and
 * concentrates on one (Beckers et al. 1990, Lasius niger with two 1 M sources). A2b (richPoor) has a rich and a poor one.
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
    const start = 200 * cellsIn(game.map.size, 25, 20, 3);
    const a = at(25, 20);
    const b = at(75, 20);
    const left = start - foodIn(game.map, a.x, a.y, 3);
    const right = start - foodIn(game.map, b.x, b.y, 3);
    const share = left + right > 0 ? Math.max(left, right) / (left + right) : NaN;
    return { majorityShare: share, pass: share >= 0.7 ? 1 : 0 };
  },
};

/**
 * A2b — a rich and a poor source at the same distance (quality 1.5 against 0.5: Beckers et al. 1993's 1 M against
 * 0.1 M sugar; docs/trails.md). *Lasius niger* foragers lay more trail for the richer food, and the colony settles on
 * it. Same arena as A2a; which side is rich alternates with the seed.
 */
export const richPoor: Assay = {
  id: "richPoor",
  title: "A2b rich vs poor source: does the colony pick the richer?",
  target: "the rich source takes ≥ 70 % of the food carried (design mark; Beckers et al. 1993: the colony selects the richer source)",
  seconds: 240,
  spec: (seed) => {
    const richLeft = seed % 2 === 1;
    return {
      seed,
      seconds: 240,
      map: () =>
        new Arena(100, 100, true)
          .pile(25, 20, 3, 200, richLeft ? 1.5 : 0.5)
          .pile(75, 20, 3, 200, richLeft ? 0.5 : 1.5)
          .build([{ x: 50, y: 85, r: 3 }]),
      game: { antCount: 300, rival: false },
    };
  },
  score: (r, game) => {
    const start = 200 * cellsIn(game.map.size, 25, 20, 3);
    const a = at(25, 20);
    const b = at(75, 20);
    const left = start - foodIn(game.map, a.x, a.y, 3);
    const right = start - foodIn(game.map, b.x, b.y, 3);
    const rich = r.seed % 2 === 1 ? left : right;
    const share = left + right > 0 ? rich / (left + right) : NaN;
    return { richShare: share, pass: share >= 0.7 ? 1 : 0 };
  },
};

/**
 * A3 — a patch runs out. Traffic to it should die away soon after: the food trail is no longer
 * refreshed and evaporates, and ants that find nothing should leave rather than circle (no ant
 * mills). Design mark: the crowd at the patch is under a fifth of its peak within 60 s.
 */
export const deplete: Assay = {
  id: "deplete",
  title: "A3 depletion: traffic leaves an emptied patch",
  target: "crowd at the emptied patch < 20 % of its peak within 60 s of the last food (design mark)",
  seconds: 300,
  spec: (seed) => {
    const patch = at(50, 40);
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
      map: () => new Arena(100, 100, true).pile(50, 40, 2, 10).build([{ x: 50, y: 80, r: 3 }]),
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
 * scatter from it at once, and the trail should be back in use once the alarm has faded. Design
 * marks: the crowd drops to half within 10 s; back to half its earlier level within 60 s.
 */
export const alarm: Assay = {
  id: "alarm",
  title: "A4 alarm on a trail: scatter, then recover",
  target: "crowd ≤ 50 % in the 10 s after alarm; back to ≥ 50 % of before within 60 s (design marks)",
  seconds: 240,
  spec: (seed) => {
    const spot = at(50, 50);
    const when = 120;
    const crowd: number[] = [];
    let nextAt = 1;
    const probe: Probe = {
      tick(game) {
        if (game.time + 1e-9 < nextAt) return;
        nextAt += 1;
        crowd.push(antsNear(game, spot.x, spot.y, 6));
      },
      summary() {
        const before = mean(crowd.slice(when - 10, when));
        const after = mean(crowd.slice(when + 1, when + 11));
        // Recovery is searched from the crowd's lowest point in the 10 s after the alarm, not from the alarm itself
        // (ja-qld): with no scatter at all the crowd never dips, and "back" counted from before it had left.
        let low = when + 1;
        for (let k = when + 1; k < Math.min(crowd.length, when + 11); k++) if ((crowd[k] as number) < (crowd[low] as number)) low = k;
        let back = NaN;
        for (let k = low; k < crowd.length; k++)
          if (mean(crowd.slice(Math.max(low, k - 4), k + 1)) >= 0.5 * before) {
            back = k + 1 - when;
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
      events: [{ at: when, kind: "paint", channel: "alarm", x: spot.x, y: spot.y, r: 3, amount: 12 }],
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
 * A5's probe: once a second, the share of the colony outside the nest; every tick, trips out (an ant crossing from inside
 * the nest's radius + 2 to outside it). Both are reported over windows of seconds [from, to). In one world outside is on
 * the plane, beyond the plane's nest (the disc round the hole) + 2: every ant in the curtain is in.
 */
export function outingProbe(nest: { x: number; y: number }, windows: Record<string, [number, number]>): Probe {
  const outside: number[] = [];
  const departs: number[] = [];
  let was: Uint8Array = new Uint8Array(0);
  let nextAt = 1;
  return {
    tick(game) {
      const c = game.player;
      if (was.length < c.n) {
        const w = new Uint8Array(c.n);
        w.set(was);
        was = w;
      }
      const sec = Math.floor(game.time);
      const disc = game.world ? (c.layers[PLANE] as Layer).nest : c.nest;
      let out = 0;
      let alive = 0;
      for (let i = 0; i < c.n; i++) {
        if (!c.alive[i]) continue;
        alive++;
        const o = onLayer(game, c, i, PLANE) && Math.hypot((c.x[i] as number) - nest.x, (c.y[i] as number) - nest.y) > disc.r + 2 ? 1 : 0;
        if (o && !was[i]) departs[sec] = (departs[sec] ?? 0) + 1;
        was[i] = o;
        out += o;
      }
      if (game.time + 1e-9 >= nextAt) {
        nextAt += 1;
        outside.push(alive ? out / alive : 0);
      }
    },
    summary() {
      const m: Record<string, number> = {};
      for (const [k, [a, b]] of Object.entries(windows)) {
        m[`outside${k}`] = mean(outside.slice(a, b));
        let d = 0;
        for (let t = a; t < b; t++) d += departs[t] ?? 0;
        m[`departs${k}`] = (d / (b - a)) * 60; // trips out per minute
      }
      return m;
    },
  };
}

/** Take every unit of food from the cells within r of world (x, y). */
function clearFood(game: Game, x: number, y: number, r: number): void {
  discWorld(game.map.size, x, y, r + 2, (cx, cy) => {
    while (takeFoodCell(game.map, cx, cy));
  });
}

/**
 * A5 — foraging regulation. With no food, a harvester-ant colony keeps most foragers home; when
 * foragers start coming back with food, more go out (Gordon; Pinter-Wollman et al. 2013: the rate of
 * returning foragers sets the rate of outgoing ones; docs/activation.md). Food appears at 120 s. Design mark: the share
 * of the colony outside the nest before food is at most half what it is once food flows. Trips out per minute are
 * reported beside it, so a pass shows its cause.
 */
export const regulate: Assay = {
  id: "regulate",
  title: "A5 foraging regulation: do foragers stay home without food?",
  target: "share outside before food ≤ ½ × share outside once food flows (Gordon; Pinter-Wollman et al. 2013)",
  seconds: 360,
  spec: (seed) => {
    const nest = at(50, 50);
    const food = at(50, 15);
    return {
      seed,
      seconds: 360,
      map: () => new Arena(100, 100, true).build([{ x: 50, y: 50, r: 3 }]),
      game: { antCount: 300, rival: false },
      events: [{ at: 120, kind: "food", x: food.x, y: food.y, r: 3, perCell: 200 }],
      probes: [outingProbe(nest, { Before: [60, 120], After: [240, 360] })],
    };
  },
  score: (r) => {
    const b = r.metrics.outsideBefore as number;
    const a = r.metrics.outsideAfter as number;
    return { pass: b <= 0.5 * a ? 1 : 0 };
  },
};

/**
 * A5b — foraging stops when food does. Food appears at 60 s and is taken away at 240 s, carriers' loads aside. With no
 * successful foragers coming back, departures fall within minutes (Gordon 2002: removing returning foragers cut the
 * outgoing rate, settling in about 3 min; docs/activation.md). Design mark: trips out per minute over the last two
 * minutes are at most half those while food flowed.
 */
export const regulateStop: Assay = {
  id: "regulateStop",
  title: "A5b foraging stops: do departures fall once the food is gone?",
  target: "trips out per minute, 300–420 s ≤ ½ × 150–240 s (Gordon 2002)",
  seconds: 420,
  spec: (seed) => {
    const nest = at(50, 50);
    const food = at(50, 15);
    return {
      seed,
      seconds: 420,
      map: () => new Arena(100, 100, true).build([{ x: 50, y: 50, r: 3 }]),
      game: { antCount: 300, rival: false },
      events: [
        { at: 60, kind: "food", x: food.x, y: food.y, r: 3, perCell: 200 },
        { at: 240, kind: "call", run: (g) => clearFood(g, food.x, food.y, 3) },
      ],
      probes: [outingProbe(nest, { Flow: [150, 240], Gone: [300, 420] })],
    };
  },
  score: (r) => {
    const f = r.metrics.departsFlow as number;
    const g = r.metrics.departsGone as number;
    return { pass: g <= 0.5 * f ? 1 : 0 };
  },
};

/**
 * A6 arenas: attackers (the first colony, always raiding) against defenders (the second, local rule), with or without a
 * 2-cell pass between them. The attackers outnumber the defenders, 200 to PASS_DEFENDERS.
 */
export const PASS_DEFENDERS = 80;
function battleSpec(seed: number, pass: boolean): RunSpec {
  const a = new Arena(120, 40).carve(2, 2, 117, 37);
  if (pass) a.wall(56, 2, 63, 37).carve(56, 19, 63, 20);
  return {
    seed,
    seconds: 180,
    map: () => a.build([{ x: 20, y: 20, r: 3 }, { x: 100, y: 20, r: 3 }]),
    game: { antCount: 200, rivalAnts: PASS_DEFENDERS },
    // Every attacker marches at the defenders' hole (raidGate 0): A6 is about who reaches whom at a pass, not about finding the
    // rival (A11). Raiding by trail, only recruited ants went, a few at a time, and no battle formed at the pass (ja-sf1:
    // gain 1.26, 3/20 on main).
    // Both sides keep the colony's stance (stanceGate 0, docs/stance.md): A6 is about who reaches whom at a pass, and with each
    // ant's own stance the defenders 40 cells from home turned away from the pass instead of holding it (gain 1.64 against 1.95).
    sides: { policy: always<Mode>("fight"), stance: always<Stance>("raid"), colony: { raidGate: 0, stanceGate: 0 }, rival: { stanceGate: 0 } },
  };
}

const exchange = (r: RunResult) => {
  const att = r.metrics["you.losses"] as number;
  const def = r.metrics["rival.losses"] as number;
  return { attackerLosses: att, defenderLosses: def, exchange: att / Math.max(1, def) };
};

/**
 * A6 — few against many, through a narrow pass. Narrow ground favours the smaller side: in open arenas numbers win, in
 * cluttered ones few meat ants held off many Argentine ants (Lymbery et al. 2023; docs/combat.md), because only a few
 * attackers reach the defenders at once. Fights here count every stranger within reach, so in the open numbers win as
 * the square of the odds; a pass is what limits who reaches whom. Score: the exchange (attackers lost per defender) in
 * the pass against the same seed's open battle. Design mark: at least PASS_GAIN times the open exchange. (Before MR 4
 * A6 pitted equal armies, 200 against 200, where terrain should favour neither side, and asked the pass to: it didn't.)
 */
export const PASS_GAIN = 1.5;
/** A6 on the arenas `remap` makes of its own (as they are, or one world's plane: onPlane), the open control too. */
function passAssay(remap: (spec: RunSpec) => RunSpec): Assay {
  const control = (s: number): RunSpec => remap(battleSpec(s, false));
  return {
    id: "pass",
    title: "A6 few against many through a 2-cell pass",
    target: `the defenders' exchange in the pass ≥ ${PASS_GAIN}× the same battle's on open ground (design mark; Lymbery et al. 2023)`,
    seconds: 180,
    spec: (s) => remap(battleSpec(s, true)),
    control,
    score: (r) => {
      const e = exchange(r);
      const o = exchange(runGame(control(r.seed)).result);
      const gain = o.exchange > 0 ? e.exchange / o.exchange : NaN;
      return { ...e, openExchange: o.exchange, gain, pass: gain >= PASS_GAIN ? 1 : 0 };
    },
  };
}
export const pass = passAssay((spec) => spec);
export const open: Assay = { id: "open", title: "A6 control: the same battle on open ground", target: "control for `pass` (which runs it too); report only", seconds: 180, spec: (s) => battleSpec(s, false), score: exchange };

/**
 * A11 — raiders find the rival round a pocket of wall (behaviour MR 5.2, docs/raid-recruitment.md). Two nests at either
 * end of a 120 × 60 arena; a pocket of wall between them, open toward the first nest, so a straight line from one to the
 * other runs into its back. The first colony is forced to raid; the second defends by the local rule.
 * Reported: the share of the colony's raiders (the ants recruited: scouts, and those a scout's trail called) that ever came within RAID_REACH of the rival's nest; the share of the time raiders
 * outside their own nest were stuck (moved under 3 cells in 20 s, and not at the rival's nest); the first arrival.
 * Score: the trail's gain, the share reaching the rival with the raid trail against the same seed with no trail laid
 * (raidLay 0: scouts search alone; Polyergus raids stop without scouts, Topoff et al. 1987). Design marks: at least
 * RAID_GAIN times as many reach the rival with the trail, and at most RAID_STUCK of the outside samples are stuck.
 * `straight` is the same battle with the raiders sent at the rival hole's coordinates (`raidGate` 0, as before MR 5.2): the
 * trail is a sensed cue, and costs reach against it (review of #41).
 */
export const RAID_REACH = 10;
export const RAID_GAIN = 1.5;
export const RAID_STUCK = 0.1;
function raidProbe(own: { x: number; y: number }, rival: { x: number; y: number }): Probe {
  const reached = new Set<number>();
  const was: number[][] = [];
  let nextAt = 20;
  let first = NaN;
  let stuck = 0;
  let outside = 0;
  // Diagnosis (ja-sf1): who is recruited, where, and what the trail at the nest is.
  let prev: Uint8Array | null = null;
  let prevRep: Uint8Array | null = null;
  const ever = new Set<number>();
  let atHome = 0;
  let finds = 0;
  let findDist = 0;
  let nestRaid = 0;
  let nestSmelt = 0;
  let samples = 0;
  return {
    tick(game) {
      const c = game.player;
      if (!prev || prev.length !== c.n) {
        prev = new Uint8Array(c.n);
        prevRep = new Uint8Array(c.n);
      }
      for (let i = 0; i < c.n; i++) {
        if (!c.alive[i]) continue;
        if (c.recruited[i] && !prev[i] && !ever.has(i)) {
          ever.add(i);
          if (Math.hypot((c.x[i] as number) - own.x, (c.y[i] as number) - own.y) <= c.nest.r) atHome++;
        }
        if (c.reporting[i] && !(prevRep as Uint8Array)[i]) {
          finds++;
          findDist += Math.hypot((c.x[i] as number) - rival.x, (c.y[i] as number) - rival.y);
        }
        prev[i] = c.recruited[i] as number;
        (prevRep as Uint8Array)[i] = c.reporting[i] as number;
        // Raiders only: on a raid stance an ant not recruited carries on as a forager (behaviour MR 5.2); raidGate 0 sends all.
        if ((c.recruited[i] || c.params.raidGate <= 0) && Math.hypot((c.x[i] as number) - rival.x, (c.y[i] as number) - rival.y) <= RAID_REACH) {
          reached.add(i);
          if (Number.isNaN(first)) first = game.time;
        }
      }
      if (game.time + 1e-9 < nextAt) return;
      nextAt += 20;
      // The raid trail at the nest's rim, toward the rival (where recruits would smell it).
      let best = 0;
      for (let k = -2; k <= 2; k++) best = Math.max(best, c.ph.read("raid", own.x + c.nest.r + 1, own.y + k));
      nestRaid += best;
      if (best >= FAINT) nestSmelt++;
      samples++;
      for (let i = 0; i < c.n; i++) {
        const x = c.x[i] as number;
        const y = c.y[i] as number;
        const prev = was[i];
        was[i] = [x, y];
        if (!c.alive[i] || !prev) continue;
        if (Math.hypot(x - own.x, y - own.y) <= c.nest.r + 2 || Math.hypot(x - rival.x, y - rival.y) <= RAID_REACH) continue;
        outside++;
        if (Math.hypot(x - (prev[0] as number), y - (prev[1] as number)) < 3) stuck++;
      }
    },
    summary(game) {
      const n = Math.max(1, game.player.params.antCount);
      let hit = 0;
      let dead = 0;
      let deadHit = 0;
      for (const i of ever) {
        if (reached.has(i)) hit++;
        if (!game.player.alive[i]) {
          dead++;
          if (reached.has(i)) deadHit++;
        }
      }
      return {
        reached: reached.size / n,
        stuck: outside ? stuck / outside : NaN,
        firstReach: first,
        recruited: ever.size / n,
        recruitedAtHome: ever.size ? atHome / ever.size : NaN,
        recruitsReaching: ever.size ? hit / ever.size : NaN,
        finds,
        findDist: finds ? findDist / finds : NaN,
        recruitsDead: ever.size ? dead / ever.size : NaN,
        deadReached: dead ? deadHit / dead : NaN,
        nestRaid: samples ? nestRaid / samples : 0,
        nestSmelt: samples ? nestSmelt / samples : 0,
      };
    },
  };
}
function raidFindSpec(seed: number, colony?: Partial<ColonyParams>): RunSpec {
  const a = new Arena(120, 60).carve(2, 2, 117, 57).wall(40, 18, 60, 20).wall(40, 40, 60, 42).wall(58, 18, 60, 42);
  const own = at(20, 30);
  const rival = at(100, 30);
  return {
    seed,
    seconds: 300,
    map: () => a.build([{ x: 20, y: 30, r: 3 }, { x: 100, y: 30, r: 3 }]),
    game: { antCount: 200, rivalAnts: PASS_DEFENDERS },
    sides: { stance: always<Stance>("raid"), responses: RAIDING, rivalResponses: NEVER_RAID, ...(colony ? { colony } : {}) },
    probes: [raidProbe(own, rival)],
  };
}
export const raidFind: Assay = {
  id: "raidFind",
  title: "A11 raiders find the rival: the raid trail's gain, and stuck ants",
  target: `≥ ${RAID_GAIN}× as many raiders reach the rival's nest with the raid trail as without; ≤ ${RAID_STUCK * 100} % of outside samples stuck (design marks; docs/raid-recruitment.md, ja-jwy)`,
  seconds: 300,
  spec: (s) => raidFindSpec(s),
  score: (r) => {
    const reached = r.metrics.reached as number;
    const deaf = runGame(raidFindSpec(r.seed, { raidLay: 0 })).result.metrics.reached as number;
    const straight = runGame(raidFindSpec(r.seed, { raidGate: 0 })).result.metrics.reached as number; // main: at the rival hole's coordinates
    const gain = deaf > 0 ? reached / deaf : NaN;
    const stuck = r.metrics.stuck as number;
    const m = r.metrics;
    return { reached, deaf, straight, gain, stuck, firstReach: m.firstReach as number, recruited: m.recruited as number, recruitedAtHome: m.recruitedAtHome as number, recruitsReaching: m.recruitsReaching as number, finds: m.finds as number, findDist: m.findDist as number, recruitsDead: m.recruitsDead as number, deadReached: m.deadReached as number, nestRaid: m.nestRaid as number, nestSmelt: m.nestSmelt as number, pass: gain >= RAID_GAIN && stuck <= RAID_STUCK ? 1 : 0 };
  },
};

/**
 * A12 — a raid no one can find doesn't starve the colony (behaviour MR 5.2, docs/raid-recruitment.md). One colony forced onto
 * a raid stance with its rival sealed in rock, and a food pile it could forage. A raid stance is a bias, not an order: ants not
 * recruited by a scout's trail go on foraging, and scouts that find no one tire and come home. (The first version made
 * raiders wait at home for a trail that never came, and the strategist raids when no food comes in, so it never ate: 10 of
 * 7,400.) Score: food stored over 900 s against the same colony on a forage stance. Design mark: at least RAID_STOP_FOOD
 * of it. Reported: the share outside in the last 3 min.
 */
export const RAID_STOP_FOOD = 0.5;
function raidStopSpec(seed: number, stance: Stance): RunSpec {
  const nest = at(50, 50);
  const food = at(50, 15);
  return {
    seed,
    seconds: 900,
    map: () => {
      // The rival's nest is sealed in a pocket of rock: a stance is consulted only with two colonies, and no one can find it.
      const a = new Arena(100, 100, true).wall(84, 84, 98, 98).carve(87, 87, 95, 95);
      a.pile(50, 15, 3, 200);
      return a.build([{ x: 50, y: 50, r: 3 }, { x: 91, y: 91, r: 3 }]);
    },
    game: { antCount: 300, rivalAnts: 30 },
    sides: { stance: always<Stance>(stance), responses: stance === "raid" ? RAIDING : NEVER_RAID },
    probes: [outingProbe(nest, { Late: [720, 900] }), { tick() {}, summary: () => ({ foodAt: food.y }) }],
  };
}
export const raidStop: Assay = {
  id: "raidStop",
  title: "A12 a raid no one can find doesn't starve the colony",
  target: `food stored over 900 s on a raid stance with no rival ≥ ${RAID_STOP_FOOD * 100} % of the same colony's on a forage stance (design mark; docs/raid-recruitment.md)`,
  seconds: 900,
  spec: (seed) => raidStopSpec(seed, "raid"),
  score: (r) => {
    const stored = r.metrics["you.stored"] as number;
    const control = runGame(raidStopSpec(r.seed, "forage")).result.metrics["you.stored"] as number;
    const share = control > 0 ? stored / control : NaN;
    return { stored, control, share, outsideLate: r.metrics.outsideLate as number, pass: share >= RAID_STOP_FOOD ? 1 : 0 };
  },
};

/**
 * A9 — strangers meet at food (behaviour MR 4, docs/combat.md). Two colonies on stance forage, nests at either end of
 * an open field, one food pile between them: their foragers meet there. At food, the ant that didn't start an encounter
 * usually retreats (Human & Gordon 1996); foragers don't fight to the death over a bait. Score: ants lost per 100 food
 * brought home (both colonies), and food home. Design mark: at most CONTACT_LOSSES lost per 100 food, half of what the
 * colonies lost before MR 4 (8.7, 7.2–10.6 on seeds 1–10: every forager that met a stranger fought it).
 */
export const CONTACT_LOSSES = 4;
export const contact: Assay = {
  id: "contact",
  title: "A9 strangers meet at food: forage, not war",
  target: `≤ ${CONTACT_LOSSES} ants lost per 100 food home, both colonies (design mark; docs/combat.md)`,
  seconds: 300,
  spec: (seed) => ({
    seed,
    seconds: 300,
    map: () => new Arena(120, 60, true).pile(60, 30, 4, 200).build([{ x: 12, y: 30, r: 3 }, { x: 108, y: 30, r: 3 }]),
    game: { antCount: 200, rivalAnts: 200 },
    sides: { stance: always<Stance>("forage"), rivalStance: always<Stance>("forage"), responses: NEVER_RAID, rivalResponses: NEVER_RAID },
  }),
  score: (r) => {
    const lost = (r.metrics["you.losses"] as number) + (r.metrics["rival.losses"] as number);
    const home = (r.metrics["you.stored"] as number) + (r.metrics["rival.stored"] as number);
    const per100 = home > 0 ? (100 * lost) / home : Infinity;
    return { lostPer100Food: per100, foodHomeBoth: home, pass: per100 <= CONTACT_LOSSES ? 1 : 0 };
  },
};

/**
 * A13 — defence from senses (docs/stance.md). One colony forages a pile 45 cells west of its nest; a war party of strangers
 * (the rival, sent marching at the colony's hole: an experimental device) comes from the east. Defence is an individual's:
 * the ants that sense a threat near home fight it, and foragers far off at the pile go on carrying (pavement ants: a
 * threshold raised by encounters, Hoover et al. 2016; Pheidole: the fight moves closer to the nest as it grows). Score: food
 * stored against the same seed with the war party sealed in rock (`foodShare`), the strangers killed per ant lost
 * (`exchange`), and, sampled each second from 20 s, the colony's fighters within NEAR_HOME of its nest (`fightNear`) and its
 * ants at the pile that are not fighting (`atPile`). `broadcast` is the same battle with the colony's stance chosen by its
 * strategist and told to every ant (stanceGate 0, as before). Design mark: food at least DEFEND_FOOD of the broadcast's
 * share, and at least half the war party killed. (An absolute mark of 0.8 of the control failed under both: an 80-strong
 * war party forced to fight costs a 200-ant colony 120-130 ants whoever defends.)
 */
export const DEFEND_FOOD = 0.9;
export const NEAR_HOME = 15;
function defendSpec(seed: number, sealed: boolean, colony?: Partial<ColonyParams>): RunSpec {
  const nest = at(60, 30);
  const pile = at(15, 30);
  let fightNear = 0;
  let atPile = 0;
  let samples = 0;
  let next = 20;
  return {
    seed,
    seconds: 300,
    map: () => {
      const a = new Arena(160, 60, true).pile(15, 30, 4, 300);
      if (sealed) a.wall(140, 20, 158, 40).carve(145, 25, 155, 35);
      return a.build([{ x: 60, y: 30, r: 3 }, { x: 150, y: 30, r: 3 }]);
    },
    game: { antCount: 200, rivalAnts: 80 },
    sides: {
      ...(colony ? { colony } : {}),
      rivalPolicy: always<Mode>("fight"),
      rivalStance: always<Stance>("raid"),
      rival: { raidGate: 0, stanceGate: 0 },
    },
    probes: [
      {
        tick(game) {
          if (game.time + 1e-9 < next) return;
          next += 1;
          const c = game.player;
          for (let i = 0; i < c.n; i++) {
            if (!c.alive[i]) continue;
            const x = c.x[i] as number;
            const y = c.y[i] as number;
            const fighting = MODES[c.mode[i] as number] === "fight";
            if (fighting && Math.hypot(x - nest.x, y - nest.y) <= NEAR_HOME) fightNear++;
            if (!fighting && Math.hypot(x - pile.x, y - pile.y) <= 8) atPile++;
          }
          samples++;
        },
        summary: () => ({ fightNear: samples ? fightNear / samples : 0, atPile: samples ? atPile / samples : 0 }),
      },
    ],
  };
}
export const defendHome: Assay = {
  id: "defendHome",
  title: "A13 defence from senses: the nest is defended, the far pile still worked",
  target: `food (against the same colony with no war party) ≥ ${DEFEND_FOOD * 100} % of the broadcast stance's, and ≥ half the war party killed (design marks; docs/stance.md)`,
  seconds: 300,
  spec: (seed) => defendSpec(seed, false),
  score: (r) => {
    const stored = r.metrics["you.stored"] as number;
    const control = runGame(defendSpec(r.seed, true)).result.metrics["you.stored"] as number;
    const foodShare = control > 0 ? stored / control : NaN;
    const killed = r.metrics["rival.losses"] as number;
    const lost = r.metrics["you.losses"] as number;
    const broadcast = (runGame(defendSpec(r.seed, false, { stanceGate: 0 })).result.metrics["you.stored"] as number) / Math.max(1, control);
    return { stored, control, foodShare, broadcast, killed, lost, exchange: killed / Math.max(1, lost), fightNear: r.metrics.fightNear as number, atPile: r.metrics.atPile as number, pass: foodShare >= DEFEND_FOOD * broadcast && killed >= 40 ? 1 : 0 };
  },
};

/**
 * A10 — faint alarm draws (behaviour MR 4, docs/combat.md: low doses attract, ten times more repel; Moser et al. 1968,
 * Lopes et al. 2022). A faint alarm is painted 30 cells from the nest of a colony with no food to find at 40 s, while
 * every ant still explores (later they tire and head home): the crowd within 4 cells of it over the next 10 s against
 * the 10 s before. Design mark: at least FAINT_DRAW more ants (before MR 4 it emptied: alarm only repelled).
 */
export const FAINT_DRAW = 2;
export const faintAlarm: Assay = {
  id: "faintAlarm",
  title: "A10 faint alarm draws ants",
  target: `≥ ${FAINT_DRAW} more ants near a faint alarm than before it (design mark; docs/combat.md)`,
  seconds: 60,
  spec: (seed) => {
    const spot = at(50, 50);
    const when = 40;
    const crowd: number[] = [];
    let nextAt = 1;
    const probe: Probe = {
      tick(game) {
        if (game.time + 1e-9 < nextAt) return;
        nextAt += 1;
        crowd.push(antsNear(game, spot.x, spot.y, 4));
      },
      summary() {
        const before = mean(crowd.slice(when - 10, when));
        const after = mean(crowd.slice(when + 1, when + 11));
        return { nearBefore: before, nearAfter: after, draw: after - before };
      },
    };
    return {
      seed,
      seconds: 60,
      // No food: every ant explores, as the idle foragers a faint alarm should draw (on a busy trail they follow it).
      map: () => new Arena(100, 100, true).build([{ x: 50, y: 82, r: 3 }]),
      game: { antCount: 300, rival: false },
      // Faint: above the sensors' FAINT (0.05), well under STRONG (1), for a few seconds at the spot.
      events: [0, 2, 4, 6, 8].map((d) => ({ at: when + d, kind: "paint" as const, channel: "alarm" as const, x: spot.x, y: spot.y, r: 2, amount: 0.4 })),
      probes: [probe],
    };
  },
  score: (r) => ({ pass: (r.metrics.draw as number) >= FAINT_DRAW ? 1 : 0 }),
};

/**
 * G — the real game as the page opens it (the side view), 600 + 600 ants, 10 minutes. Also the
 * homing guard (A7): no colony with more than 2 foragers holding food over 120 s at any 10-s sample
 * (slow/side.test's bound).
 */
export const game: Assay = {
  id: "game",
  title: "G the side-view game (with A7: foragers holding food)",
  target: "≤ 2 foragers holding food over 120 s per colony at any 10-s sample (slow/side.test's bound); food home and outcome reported",
  seconds: 600,
  spec: (seed) => ({ seed, seconds: 600, game: { antCount: 600, rivalAnts: 600 } }),
  score: (r) => {
    const worst = Math.max(r.metrics["you.maxHeld"] ?? 0, r.metrics["rival.maxHeld"] ?? 0);
    // Porters are reported, not judged: they have no bound yet (ja-3po).
    return { maxHeld: worst, maxPorting: Math.max(r.metrics["you.maxPorting"] ?? 0, r.metrics["rival.maxPorting"] ?? 0), pass: worst <= 2 ? 1 : 0 };
  },
};

/** The same game on the top-down map (OPEN_WORLD): the bench bed, no queen. */
export const gameTop: Assay = {
  id: "gameTop",
  title: "G' the top-down game (OPEN_WORLD)",
  target: "report only: food home, held food, outcome",
  seconds: 600,
  spec: (seed) => ({ seed, seconds: 600, map: (s) => generateWorld(s, OPEN_WORLD), game: { antCount: 600, rivalAnts: 600 } }),
  score: (r) => ({ maxHeld: Math.max(r.metrics["you.maxHeld"] ?? 0, r.metrics["rival.maxHeld"] ?? 0) }),
};

/**
 * Inside the nest (side view, the first colony), every 30 s: food lying in each kind of chamber, larvae waiting unfed
 * with food enough in the nest, and the first birth. `beyond` is the share of the food lying in the nest that has
 * been carried on past reception (stores, brood chambers, the queen's), averaged over the samples from 300 s on.
 */
export function nestFlowProbe(): Probe {
  let nextAt = 30;
  let beyond = 0;
  let samples = 0;
  let receptionMax = 0;
  let starved = 0;
  let firstBirth = NaN;
  return {
    tick(game) {
      const c = game.player;
      if (Number.isNaN(firstBirth) && c.births > 0) firstBirth = game.time;
      if (game.time + 1e-9 < nextAt) return;
      nextAt += 30;
      // One world: the nest is in the curtain (game.map is the plane).
      const ch = (game.world?.curtain ?? game.map).chambers;
      if (!ch) return;
      let reception = 0;
      let lying = 0;
      for (const k of ch.list) {
        if (k.colony !== c.params.nest) continue;
        lying += k.food;
        if (k.role === "reception") reception += k.food;
      }
      receptionMax = Math.max(receptionMax, reception);
      const waiting = c.brood.items.filter((b) => b.stage === LARVA && b.t > 120 && !isFed(b)).length;
      if (c.larder >= waiting * LARVA_FOOD) starved = Math.max(starved, waiting);
      if (game.time >= 300 && lying > 0) {
        beyond += 1 - reception / lying;
        samples++;
      }
    },
    summary(game) {
      return { beyond: samples ? beyond / samples : NaN, receptionMax, starved, firstBirth, portTrips: game.player.portTrips, handedOn: game.player.handedOn };
    },
  };
}

/**
 * A8: the nest's food flow (behaviour MR 2). Harvester foragers drop seeds only in the top chambers and other workers
 * carry them down to the seed chambers in stages (Tschinkel, Rink & Kwapich 2015); larvae are fed from what reaches
 * them. No rate could be read (docs/nest-and-home.md §3.5), so it reports: the share carried on past reception,
 * reception's largest pile, larvae left unfed beside food (the economy test's measure, slow/economy.test), the first
 * birth, porter trips.
 */
export const nestFlow: Assay = {
  id: "nestFlow",
  title: "A8 nest flow: food carried on from reception, larvae fed",
  target: "report only (Tschinkel, Rink & Kwapich 2015: food dropped in the top chambers is carried down by others); larvae unfed beside food ≤ 5 is the economy test's bound",
  seconds: 900,
  spec: (seed) => ({ seed, seconds: 900, game: { antCount: 600, rival: false }, probes: [nestFlowProbe()] }),
  score: (r) => ({ beyond: r.metrics.beyond as number, receptionMax: r.metrics.receptionMax as number, starved: r.metrics.starved as number, firstBirth: r.metrics.firstBirth as number, portTrips: r.metrics.portTrips as number }),
};

/**
 * New queens (ja-lo8.9, royal.ts), on the first colony of a solo side-view game: when the fungus reaches the queen,
 * when the first gyne is reared, how many are culled, when the first alate flies, and when the first daughter's first
 * worker ecloses and first goes out. `arm` forces one of the fungus's queen levers in every host from the start, so
 * the rearing is measured apart from how fast the fungus spreads: "signal" the queen's signal at "damp" (0.4), "scent"
 * every worker's perception of her scent at "damp" (0.3); "none" forces nothing (the fungus lands and plays the local
 * rule, which pulls neither: dilution alone).
 */
export function lifecycleProbe(arm: "none" | "signal" | "scent"): Probe {
  const at: Record<string, number> = { queen: NaN, gyne: NaN, flight: NaN, daughter: NaN, daughterWorker: NaN, daughterOut: NaN };
  const first = (k: string, t: number) => {
    if (Number.isNaN(at[k] as number)) at[k] = t;
  };
  return {
    tick(game) {
      const c = game.player;
      if (arm === "signal" && c.queen) c.queen.signal = 0.4;
      if (arm === "scent") c.scentGain.fill(0.3);
      const t = game.time;
      if (game.revealed[0]) first("queen", t);
      if (c.gynes > 0) first("gyne", t);
      if (c.flights > 0) first("flight", t);
      const k = game.lineage(0)[1];
      const d = k === undefined ? undefined : game.colonies[k];
      if (!d) return;
      first("daughter", t);
      if (!d.founding) first("daughterWorker", t);
      if (Number.isNaN(at.daughterOut as number))
        for (let i = 0; i < d.n; i++)
          if (d.alive[i] && isSky(game.map, Math.floor(d.x[i] as number), Math.floor((d.y[i] as number) / R))) {
            first("daughterOut", t);
            break;
          }
    },
    summary(game) {
      const c = game.player;
      return { ...Object.fromEntries(Object.entries(at).map(([k, v]) => [`t.${k}`, v])), gynes: c.gynes, culled: c.gynesCulled, flights: c.flights, daughters: game.lineage(0).length - 1 };
    },
  };
}

function lifecycleAssay(arm: "none" | "signal" | "scent"): Assay {
  const id = arm === "none" ? "lifecycle" : `lifecycle-${arm}`;
  return {
    id,
    title: `L new queens${arm === "none" ? " (the fungus lands; no queen lever forced)" : arm === "signal" ? " (the queen's signal damped)" : " (nurses perceive her scent damped)"}`,
    target: "report only (design, docs/new-queens.md §5): times to the queen, the first gyne, the first flight, and the daughter's first worker and forager; gynes, culls",
    seconds: 1800,
    spec: (seed) => ({ seed, seconds: 1800, game: { antCount: 600, rival: false }, events: [{ at: 0, kind: "call", run: (g) => void g.land(0, STRAINS.findIndex((x) => x.id === "garden")) }], probes: [lifecycleProbe(arm)] }),
    score: (r) => Object.fromEntries(["t.queen", "t.gyne", "t.flight", "t.daughterWorker", "t.daughterOut", "gynes", "culled", "flights"].map((k) => [k, r.metrics[k] as number])),
  };
}

export const lifecycle = lifecycleAssay("none");
export const lifecycleSignal = lifecycleAssay("signal");
export const lifecycleScent = lifecycleAssay("scent");

export const ASSAYS: Assay[] = [bridge, twin, richPoor, deplete, alarm, regulate, regulateStop, pass, open, raidFind, raidStop, contact, defendHome, faintAlarm, game, gameTop, nestFlow, lifecycle, lifecycleSignal, lifecycleScent];

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
    for (let y = 0; y < curtain.size.h; y++) for (let x = curtain.x0; x < curtain.x0 + curtain.size.w; x++) if (curtain.food.get(x, y)) curtain.food.set(x, y, 0);
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

/** An arena assay rerun on one world's plane (onPlane), its probes counting the plane's ants, its paint on the plane; `probes` added to its own. */
function onPlaneAssay(a: Assay, probes: () => Probe[] = () => []): Assay {
  return {
    ...a,
    title: `${a.title} (one world)`,
    spec: (seed) => {
      const s = onPlane(a.spec(seed));
      return { ...s, probes: [...(s.probes ?? []), ...probes()] };
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

/**
 * G1 — the one-world game (docs/one-world.md §6, U6): generateOneWorld(seed), 600 + 600 ants, 10 minutes, as G is for
 * the side view, with its bound (A7): no colony with more than 2 foragers holding food over 120 s at any 10-s sample,
 * counted on both layers (`maxHeldPlane`: those on the plane). Reported beside it: food carried down the holes, births,
 * crossings up and down, porter trips and porters holding food over 120 s, per colony.
 */
export const game1: Assay = {
  id: "game1",
  title: "G1 the one-world game (with A7: foragers holding food)",
  target: "≤ 2 foragers holding food over 120 s per colony at any 10-s sample, both layers (slow/side.test's bound); food carried down, births, crossings and porters reported",
  seconds: 600,
  spec: (seed) => ({ seed, seconds: 600, map: (s) => generateOneWorld(s), game: { antCount: 600, rivalAnts: 600 }, probes: [heldProbe(PLANE, "Plane"), gateProbe()] }),
  score: (r, g) => {
    const m: Record<string, number> = {};
    const both = (k: string) => Math.max(r.metrics[`you.${k}`] ?? 0, r.metrics[`rival.${k}`] ?? 0);
    g.colonies.forEach((c, k) => {
      const side = sideName(k);
      m[`${side}.carriedDown`] = c.carriedDown;
      m[`${side}.births`] = c.births;
      m[`${side}.crossedUp`] = c.crossedUp;
      m[`${side}.crossedDown`] = c.crossedDown;
      m[`${side}.portTrips`] = c.portTrips;
      // Raids (ja-web): scouts sent out on `leave` = raid, finders home to tell, ants the raid trail recruited.
      m[`${side}.raidScouts`] = c.raidScouts;
      m[`${side}.finds`] = c.finds;
      m[`${side}.recruits`] = c.recruits;
      m[`${side}.heldMean`] = r.metrics[`${side}.heldMean`] as number;
    });
    const worst = both("maxHeld");
    return { ...m, maxHeld: worst, maxHeldPlane: both("maxHeldPlane"), maxPorting: both("maxPorting"), pass: worst <= 2 ? 1 : 0 };
  },
};

/** S1's trip lengths (cells walked out on the plane), and the carriers set down at each, per seed. */
export const S1_TRIPS = [100, 200, 400, 600] as const;
export const S1_PER_TRIP = 20;

/**
 * S1 — lost carriers find their hole (ja-lp4.11.1; docs/nest-search.md, PRD §55). On one world's default plane
 * (generateOneWorld(seed)), S1_PER_TRIP old carriers of the player per trip length T in S1_TRIPS are set down at t = 0
 * with food, homing, their vector as a trip of T out of their own hole leaves it: odoSurf = T, each drift part drawn as
 * the game draws it at the hole (Gaussian, σ = PI_DRIFT/√2, so the miss is σ = 0.1/√2 × T per axis). Each stands at its
 * vector's end (the hole + T × drift: the search's origin), so its search begins there; a draw whose end is off the plane
 * (within 2 of an edge) or in rock is drawn again. Every other ant is young (stays in), with no scouts, so the carriers
 * search alone. Per trip (`t400.home120` …): the share home (down its own hole) within 120 s and within 600 s, the
 * median time of those home, the search's centredness (`centre`: per carrier with 10 s or more on the plane, the
 * distance of its mean position, sampled each second, from its origin; their mean, in cells) and spread (`spread`: the
 * mean distance from the origin, the same way), and carriers that went down another hole (`wrong`). Target: ≥ 99 % home
 * within 600 s at every trip (Wehner & Srinivasan 1981: searches run for an hour or more; design mark).
 */
export const search1: Assay = {
  id: "s1",
  title: "S1 lost carriers find their hole (one world)",
  target: "≥ 99 % home within 600 s at every trip length; the share in 120 s, the median time and the search's centredness reported",
  seconds: 600,
  spec: (seed) => {
    const n = S1_TRIPS.length * S1_PER_TRIP;
    const trip = new Float64Array(n);
    const ox = new Float64Array(n);
    const oy = new Float64Array(n);
    const homeAt = new Float64Array(n).fill(Infinity);
    const wrong = new Uint8Array(n);
    const done = new Uint8Array(n);
    const sx = new Float64Array(n);
    const sy = new Float64Array(n);
    const sd = new Float64Array(n);
    const samples = new Uint32Array(n);
    let nextAt = 1;
    const setUp = (game: Game): void => {
      const rng = mulberry32(seed * 7907 + 101);
      const gauss = (): number => Math.sqrt(-2 * Math.log(1 - rng())) * Math.cos(2 * Math.PI * rng());
      const plane = game.world!.plane;
      const c = game.player;
      const hc = c.holeCells[c.params.nest] as HoleCell;
      const hx = centreX(hc.px, hc.py);
      const hy = centreY(hc.py);
      const xMax = plane.size.w - 2;
      const yMax = plane.size.h * R - 2;
      for (const k of game.colonies) for (let i = 0; i < k.n; i++) if (k.alive[i]) k.age[i] = 0.05 * LIFESPAN;
      for (let i = 0; i < n; i++) {
        const T = S1_TRIPS[Math.floor(i / S1_PER_TRIP)] as number;
        let dx = 0;
        let dy = 0;
        let bx = 0;
        let by = 0;
        for (;;) {
          dx = (gauss() * PI_DRIFT) / Math.SQRT2;
          dy = (gauss() * PI_DRIFT) / Math.SQRT2;
          bx = hx + T * dx;
          by = hy + T * dy;
          if (bx < 2 || by < 2 || bx > xMax || by > yMax) continue;
          cellOf(bx, by);
          if (rockAt(plane, CELL[0] as number, CELL[1] as number) === OPEN) break;
        }
        trip[i] = T;
        ox[i] = bx;
        oy[i] = by;
        c.age[i] = 0.5 * LIFESPAN;
        c.putAnt(i, PLANE, bx, by);
        c.carrying[i] = 1;
        c.mode[i] = MODES.indexOf("return");
        c.heading[i] = rng() * 2 * Math.PI;
        c.odoSurf[i] = T;
        c.driftSurf[i] = dx;
        c.driftSurfY[i] = dy;
      }
    };
    const probe: Probe = {
      tick(game) {
        const c = game.player;
        const hc = c.holeCells[c.params.nest] as HoleCell;
        const sample = game.time + 1e-9 >= nextAt;
        if (sample) nextAt += 1;
        for (let i = 0; i < n; i++) {
          if (done[i]) continue;
          if (c.layer[i] !== PLANE) {
            done[i] = 1;
            // #crossDown puts it at that hole's cell in the curtain.
            if (Math.abs((c.x[i] as number) - centreX(hc.col, hc.row)) < 1e-3 && Math.abs((c.y[i] as number) - centreY(hc.row)) < 1e-3) homeAt[i] = game.time;
            else wrong[i] = 1;
            continue;
          }
          if (!sample) continue;
          const ex = (c.x[i] as number) - (ox[i] as number);
          const ey = (c.y[i] as number) - (oy[i] as number);
          sx[i] = (sx[i] as number) + ex;
          sy[i] = (sy[i] as number) + ey;
          sd[i] = (sd[i] as number) + Math.hypot(ex, ey);
          samples[i] = (samples[i] as number) + 1;
        }
      },
      summary(game) {
        const m: Record<string, number> = {};
        let pass = 1;
        for (const T of S1_TRIPS) {
          let n120 = 0;
          let n600 = 0;
          let nWrong = 0;
          let k = 0;
          const times: number[] = [];
          const centres: number[] = [];
          const spreads: number[] = [];
          for (let i = 0; i < n; i++) {
            if (trip[i] !== T) continue;
            k++;
            const t = homeAt[i] as number;
            if (t <= 120) n120++;
            if (t <= game.time) {
              n600++;
              times.push(t);
            }
            nWrong += wrong[i] as number;
            const s = samples[i] as number;
            if (s >= 10) {
              centres.push(Math.hypot((sx[i] as number) / s, (sy[i] as number) / s));
              spreads.push((sd[i] as number) / s);
            }
          }
          times.sort((a, b) => a - b);
          const tag = `t${T}`;
          m[`${tag}.home120`] = n120 / k;
          m[`${tag}.home600`] = n600 / k;
          m[`${tag}.median`] = times.length ? (times[Math.floor((times.length - 1) / 2)] as number) : NaN;
          m[`${tag}.centre`] = mean(centres);
          m[`${tag}.spread`] = mean(spreads);
          m[`${tag}.wrong`] = nWrong;
          if (n600 / k < 0.99) pass = 0;
        }
        m.pass = pass;
        return m;
      },
    };
    return {
      seed,
      seconds: 600,
      map: (s) => generateOneWorld(s),
      game: { antCount: n + 20, rivalAnts: 10, regrow: 0 },
      sides: { colony: { scoutRate: 0, raidScout: 0 }, rival: { scoutRate: 0, raidScout: 0 } },
      events: [{ at: 0, kind: "call", run: setUp }],
      probes: [probe],
    };
  },
  score: () => ({}),
};

/** A8 on one world: the solo colony's nest in the curtain (nestFlowProbe reads the curtain's chambers). */
const nestFlowOne: Assay = { ...nestFlow, title: `${nestFlow.title} (one world)`, spec: (seed) => ({ ...nestFlow.spec(seed), map: (s) => generateOneWorld(s) }) };

/**
 * The assays rerun on one world (`experiment.mjs --one`): A1, A2a, A2b, A3, A4, A5, A5b, A6, A9 and A10 on their arenas
 * made the plane (onPlane), A8 in the curtain, and G1. Same ids as the legacy ones, so `--one bridge` is A1 on the plane.
 * A5 and A5b (ja-web) count outside on the plane, past the disc round the hole, and report the ants held at the gate
 * at the top of the shaft (gateProbe).
 */
export const ONE_ASSAYS: Assay[] = [...[bridge, twin, richPoor, deplete, alarm].map((a) => onPlaneAssay(a)), ...[regulate, regulateStop].map((a) => onPlaneAssay(a, () => [gateProbe()])), { ...passAssay(onPlane), title: `${pass.title} (one world)` }, onPlaneAssay(open), onPlaneAssay(contact), onPlaneAssay(faintAlarm), nestFlowOne, game1, search1];

/** Assays not rerun on one world yet, and why (`experiment.mjs --one` reports them so). */
export const ONE_PENDING: Record<string, string> = {
  raidFind: "U6b: raids by trail on one world (raid scouts start from leave = raid at the gate, ja-web)",
  raidStop: "U6b: raids by trail on one world (raid scouts start from leave = raid at the gate, ja-web)",
};
