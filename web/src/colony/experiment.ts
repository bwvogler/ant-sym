import { DEFAULT_FIGHT, type FightParams } from "./battle.ts";
import type { ColonyParams, Mode, Policy, Stance, StancePolicy } from "./colony.ts";
import { isFed, LARVA, LARVA_FOOD } from "./brood.ts";
import { Game, type GameParams, gameRng, type Sides } from "./game.ts";
import { centreX, centreY, R } from "./hex.ts";
import { localResponses, type Responses } from "./responses.ts";
import type { Channel, ChannelParams } from "./pheromone.ts";
import { dropFood, generateSideWorld, generateWorld, OPEN, OPEN_WORLD, ROCK, type Nest, type WorldMap, type WorldSize, worldFromArrays } from "./world.ts";

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
  /** the map, or how to make it from the seed; default the page's: generateSideWorld(seed) */
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

/** Seconds a forager may hold its food before it counts as lost (slow/side.test's guard). */
export const STUCK_AFTER = 120;

/** The map a spec asks for. */
export function specMap(spec: RunSpec): WorldMap {
  return typeof spec.map === "function" ? spec.map(spec.seed) : (spec.map ?? generateSideWorld(spec.seed));
}

/** Run a game headless and collect the standard numbers plus every probe's. */
export function runGame(spec: RunSpec): { game: Game; result: RunResult } {
  const map = specMap(spec);
  const game = new Game(map, spec.game, gameRng(spec.seed), spec.sides);
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
    metrics[`${side}.foodHome`] = map.foodTotal > 0 ? c.stored / map.foodTotal : 0;
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
  if (e.kind === "paint") (game.colonies[e.colony ?? 0] ?? game.player).paint(e.channel, e.x, e.y, e.r, e.amount);
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
 * probe's own clock, from pickup to put-down, wherever the ant is (#31's review, ja-1pm).
 */
export function heldProbe(): Probe {
  const worst: number[] = [];
  const worstCarry: number[] = [];
  const carryT: Float64Array[] = [];
  let nextAt = STUCK_AFTER;
  return {
    tick(game, dt) {
      game.colonies.forEach((c, k) => {
        let t = carryT[k];
        if (!t || t.length < c.n) {
          const grown = new Float64Array(c.n);
          if (t) grown.set(t);
          t = carryT[k] = grown;
        }
        for (let i = 0; i < c.n; i++) t[i] = c.alive[i] && c.carrying[i] && !c.porting(i) ? (t[i] as number) + dt : 0;
      });
      if (game.time + 1e-9 < nextAt) return;
      nextAt += 10;
      game.colonies.forEach((c, k) => {
        let held = 0;
        let carrying = 0;
        const t = carryT[k] as Float64Array;
        for (let i = 0; i < c.n; i++) {
          if (c.alive[i] && c.carrying[i] && !c.porting(i) && (c.since[i] as number) > STUCK_AFTER) held++;
          if ((t[i] as number) > STUCK_AFTER) carrying++;
        }
        worst[k] = Math.max(worst[k] ?? 0, held);
        worstCarry[k] = Math.max(worstCarry[k] ?? 0, carrying);
      });
    },
    summary() {
      const m: Record<string, number> = {};
      worst.forEach((w, k) => (m[`${sideName(k)}.maxHeld`] = w));
      worstCarry.forEach((w, k) => (m[`${sideName(k)}.maxCarrying`] = w));
      return m;
    },
  };
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

/** Ants of a colony within r (world units) of world (x, y) right now. */
export function antsNear(game: Game, x: number, y: number, r: number, colony = 0): number {
  const c = game.colonies[colony];
  if (!c) return 0;
  let s = 0;
  for (let i = 0; i < c.n; i++) if (c.alive[i] && Math.hypot((c.x[i] as number) - x, (c.y[i] as number) - y) <= r) s++;
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

  constructor(w: number, h: number, open = false) {
    this.size = { w, h };
    this.rock = new Uint8Array(w * h).fill(open ? OPEN : ROCK);
    this.food = new Float32Array(w * h);
  }

  /** Open ground over the inclusive cell rectangle. */
  carve(x0: number, y0: number, x1: number, y1: number): this {
    return this.#fill(x0, y0, x1, y1, OPEN);
  }

  /** Rock over the inclusive cell rectangle. */
  wall(x0: number, y0: number, x1: number, y1: number): this {
    return this.#fill(x0, y0, x1, y1, ROCK);
  }

  #fill(x0: number, y0: number, x1: number, y1: number, v: number): this {
    for (let y = Math.max(0, y0); y <= Math.min(this.size.h - 1, y1); y++) for (let x = Math.max(0, x0); x <= Math.min(this.size.w - 1, x1); x++) this.rock[y * this.size.w + x] = v;
    return this;
  }

  /** A pile of `perCell` food on every open cell within r (world units) of cell (cx, cy)'s centre. */
  pile(cx: number, cy: number, r: number, perCell: number): this {
    const c = at(cx, cy);
    discWorld(this.size, c.x, c.y, r, (x, y) => {
      const i = y * this.size.w + x;
      if (this.rock[i] === OPEN) this.food[i] = perCell;
    });
    return this;
  }

  /** The map, with nests centred on cells (cx, cy), radius r (world units). */
  build(nests: { x: number; y: number; r: number }[]): WorldMap {
    const ns: Nest[] = nests.map((n) => ({ ...at(n.x, n.y), r: n.r }));
    return worldFromArrays(this.size, ns, { rock: this.rock, food: this.food });
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

const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);

/**
 * A1 — the double bridge. A small nest room with two exits to one food room: the short branch is
 * ~64 cells, the long one ~102 (it dips 19 rows further down and back up). Real Argentine ants end
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
    probes: [occupancyProbe({ short: cellRect(30, 22, 59, 27), long: cellRect(30, 52, 59, 57) }, 60)],
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
 * modelled yet, so the rich-vs-poor test (A2b) waits for behaviour MR 3.
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
        let back = NaN;
        for (let k = when + 1; k < crowd.length; k++)
          if (mean(crowd.slice(Math.max(when + 1, k - 4), k + 1)) >= 0.5 * before) {
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
    const nest = at(50, 50);
    const food = at(50, 15);
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
          if (Math.hypot((c.x[i] as number) - nest.x, (c.y[i] as number) - nest.y) > c.nest.r + 2) out++;
        }
        outside.push(alive ? out / alive : 0);
      },
      summary() {
        return { outsideBefore: mean(outside.slice(60, 120)), outsideAfter: mean(outside.slice(240, 360)) };
      },
    };
    return {
      seed,
      seconds: 360,
      map: () => new Arena(100, 100, true).build([{ x: 50, y: 50, r: 3 }]),
      game: { antCount: 300, rival: false },
      events: [{ at: 120, kind: "food", x: food.x, y: food.y, r: 3, perCell: 200 }],
      probes: [probe],
    };
  },
  score: (r) => {
    const b = r.metrics.outsideBefore as number;
    const a = r.metrics.outsideAfter as number;
    return { pass: b <= 0.5 * a ? 1 : 0 };
  },
};

/** A6 arenas: attackers (the first colony, always raiding) against defenders (the second, local rule), with or without a 2-cell pass between them. */
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
 * A6 — combat through a narrow pass. Narrow passes favour defenders (Lymbery et al. 2023, via
 * docs/ant-communication.md): only a few attackers can engage at once. Compare the exchange ratio
 * (attackers lost per defender lost) here with `open`; no pass mark until terrain-limited combat
 * lands (behaviour MR 4).
 */
export const pass: Assay = { id: "pass", title: "A6 combat through a 2-cell pass", target: "exchange (attackers lost per defender) well above `open` (Lymbery et al. 2023); report only", seconds: 180, spec: (s) => battleSpec(s, true), score: exchange };
export const open: Assay = { id: "open", title: "A6 control: the same battle on open ground", target: "control for `pass`; report only", seconds: 180, spec: (s) => battleSpec(s, false), score: exchange };

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
    return { maxHeld: worst, pass: worst <= 2 ? 1 : 0 };
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
      const ch = game.map.chambers;
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

export const ASSAYS: Assay[] = [bridge, twin, deplete, alarm, regulate, pass, open, game, gameTop, nestFlow];
