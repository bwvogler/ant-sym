import { SEEN } from "./params.ts";
import { DEFAULT_FIGHT } from "./battle.ts";
import { combatObservers } from "./combatObservation.ts";
// The assay catalogue (docs/refactor.md S3.6, ja-fnd.4.6): the arena assays and the lists ASSAYS, ONE_ASSAYS and ONE_PENDING. The
// harness they run on (runGame, the probes, Arena, oneArena) is harness.ts; the whole-game and one-world assays are oneAssays.ts and
// the desert ant's desertAssays.ts. Everything is re-exported here, so scripts and tests import experiment.ts by name.

import { type ColonyParams, type Layer, PLANE } from "./colony.ts";
import { FAINT, MODES, type Mode, type Stance } from "./vocab.ts";
import { isFed, LARVA, LARVA_FOOD } from "./brood.ts";
import { Game } from "./game.ts";
import { CELL, hexDistance, R } from "./hex.ts";
import { STRAINS } from "./fungus.ts";
import { generateOneWorld, type OneWorld } from "./oneWorld.ts";
import { enemyHeading, holeRaid } from "./sense.ts";
import { localResponses, responses } from "./responses.ts";
import { isSky, takeFoodCell, OPEN, rockAt, type WorldMap } from "./world.ts";

import {
  type Assay,
  Arena,
  cellsIn,
  mean,
  antsNear,
  at,
  crossingProbe,
  discWorld,
  foodIn,
  gateProbe,
  occupancyProbe,
  onLayer,
  marchProbe,
  onPlane,
  runGame,
  type Probe,
  type Rect,
  type RunResult,
  type RunSpec,
} from "./harness.ts";
export * from "./harness.ts";
export * from "./oneAssays.ts";
export * from "./desertAssays.ts";
export * from "./neglectusAssays.ts";
export * from "./builderAssays.ts";
import { BUILDER_ASSAYS } from "./builderAssays.ts";
import { desertChamber, desertFirstFind, desertHeat, desertInvitation, desertNoTrail, desertTrips } from "./desertAssays.ts";
import { neglectusImmunisation, neglectusTolerance } from "./neglectusAssays.ts";
import { forage1, game1, gameRoyalDelivery, gameRoyalRecovery, lockstep1, memory1, route1, search1, searchTight1 } from "./oneAssays.ts";

const always =
  <T extends string>(v: T) =>
  (): T =>
    v;

/**
 * Each ant's own stance (docs/stance.md): a colony whose waiting foragers go out as raid scouts whenever no food comes back
 * (what a raid stance did before), and one whose never do (a forage stance).
 */
export const RAIDING = responses({
  leave: (t) => (t.mode !== "fight" && t.stance === "forage" && t.returns === "none" ? "raid" : localResponses.leave(t)),
});
export const NEVER_RAID = responses({
  leave: (t) => {
    const a = localResponses.leave(t);
    return a === "raid" ? "wait" : a;
  },
});

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
        .path(
          [
            [n.x - 5, y],
            [n.x + 5, y],
          ],
          4.5,
        ) // nest room
        .path(
          [
            [n.x, y],
            [ax, y],
          ],
          half,
        ) // stem
        .path(
          [
            [ax, y],
            [ax + dx, shortY],
            [bx - dx, shortY],
            [bx, y],
          ],
          half,
        ) // short branch
        .path(
          [
            [ax, y],
            [ax + dx, y + up * dy],
            [ax + dx, longY],
            [bx - dx, longY],
            [bx - dx, y + up * dy],
            [bx, y],
          ],
          half,
        ) // long branch
        .path(
          [
            [bx, y],
            [76, y],
          ],
          half,
        ) // to the food
        .path(
          [
            [72, y],
            [80, y],
          ],
          4.5,
        ) // food room
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
    const shortShare = r.metrics["you.stored"] >= BRIDGE_MIN_STORED ? passShare : NaN;
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
    map: () =>
      new Arena(100, 100, true)
        .pile(25, 20, 3, 200)
        .pile(75, 20, 3, 200)
        .build([{ x: 50, y: 85, r: 3 }]),
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
        if (!Number.isNaN(emptyAt) && Number.isNaN(follow60) && game.time >= emptyAt + 60)
          follow60 = game.player.counts().follow / Math.max(1, game.player.population);
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
        for (let k = when + 1; k < Math.min(crowd.length, when + 11); k++) if (crowd[k] < crowd[low]) low = k;
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
        const o = onLayer(game, c, i, PLANE) && Math.hypot(c.x[i] - nest.x, c.y[i] - nest.y) > disc.r + 2 ? 1 : 0;
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
    map: () =>
      a.build([
        { x: 20, y: 20, r: 3 },
        { x: 100, y: 20, r: 3 },
      ]),
    game: { antCount: 200, rivalAnts: PASS_DEFENDERS },
    // Every attacker marches at the defenders' hole (raidGate 0): A6 is about who reaches whom at a pass, not about finding the
    // rival (A11). Raiding by trail, only recruited ants went, a few at a time, and no battle formed at the pass (ja-sf1:
    // gain 1.26, 3/20 on main).
    // Both sides keep the colony's stance (stanceGate 0, docs/stance.md): A6 is about who reaches whom at a pass, and with each
    // ant's own stance the defenders 40 cells from home turned away from the pass instead of holding it (gain 1.64 against 1.95).
    sides: {
      policy: always<Mode>("fight"),
      stance: always<Stance>("raid"),
      colony: { raidGate: 0, stanceGate: 0 },
      rival: { stanceGate: 0 },
    },
  };
}

const exchange = (r: RunResult) => {
  const att = r.metrics["you.losses"];
  const def = r.metrics["rival.losses"];
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

/**
 * A6 on one world with no colony-wide stance (S2.2c, owner's D2 on #184): the arena made the plane, the attackers (colony 0)
 * in fight mode with their own stance, walked to the defenders' hole by the harness (marchProbe) instead of marching at its
 * coordinates; the defenders with their own stance. The same for the open control, so the gain compares like with like.
 */
export const passWalked: Assay = {
  ...passAssay((spec) => walked(onPlane(spec), 0, 1)),
  title: `${pass.title} (one world, attackers walked)`,
};

/** A battle spec with its colony-wide stances taken off (no stance policy, no stanceGate 0) and side `k` walked at side `to`'s hole. */
function walked(spec: RunSpec, k: number, to: number): RunSpec {
  const { stance: _s, rivalStance: _r, colony, rival, ...sides } = spec.sides ?? {};
  const own = (p?: Partial<ColonyParams>) => {
    if (!p) return undefined;
    const { stanceGate: _g, ...rest } = p;
    return rest;
  };
  return {
    ...spec,
    sides: { ...sides, ...(own(colony) ? { colony: own(colony) } : {}), ...(own(rival) ? { rival: own(rival) } : {}) },
    probes: [...(spec.probes ?? []), marchProbe(k, to)],
  };
}
export const open: Assay = {
  id: "open",
  title: "A6 control: the same battle on open ground",
  target: "control for `pass` (which runs it too); report only",
  seconds: 180,
  spec: (s) => battleSpec(s, false),
  score: exchange,
};

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
export function raidProbe(own: { x: number; y: number }, rival: { x: number; y: number }): Probe {
  const reached = new Set<number>();
  const was: ([number, number] | undefined)[] = [];
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
      // One world (U6b): distances are the plane's, so only plane ants are measured; an ant in the curtain is home (its own
      // nest, where the gate recruits) or down the rival's shaft, which it reached on the plane first.
      const one = game.world !== null;
      const disc = one ? (c.layers[PLANE] as Layer).nest : c.nest;
      if (!prev || prev.length !== c.n) {
        prev = new Uint8Array(c.n);
        prevRep = new Uint8Array(c.n);
      }
      for (let i = 0; i < c.n; i++) {
        if (!c.alive[i]) continue;
        const plane = onLayer(game, c, i, PLANE);
        if (c.recruited[i] && !prev[i] && !ever.has(i)) {
          ever.add(i);
          if (!plane || Math.hypot(c.x[i] - own.x, c.y[i] - own.y) <= disc.r) atHome++;
        }
        if (c.reporting[i] && !(prevRep as Uint8Array)[i]) {
          finds++;
          if (plane) findDist += Math.hypot(c.x[i] - rival.x, c.y[i] - rival.y);
        }
        prev[i] = c.recruited[i];
        (prevRep as Uint8Array)[i] = c.reporting[i];
        // Raiders only: on a raid stance an ant not recruited carries on as a forager (behaviour MR 5.2); raidGate 0 sends all.
        if (plane && (c.recruited[i] || c.params.raidGate <= 0) && Math.hypot(c.x[i] - rival.x, c.y[i] - rival.y) <= RAID_REACH) {
          reached.add(i);
          if (Number.isNaN(first)) first = game.time;
        }
      }
      if (game.time + 1e-9 < nextAt) return;
      nextAt += 20;
      // The raid trail at the nest's rim, toward the rival (where recruits would smell it); in one world, where it ends at the
      // hole, as an ant held at the gate smells it (holeRaid).
      let best = 0;
      if (one) best = holeRaid(c);
      else for (let k = -2; k <= 2; k++) best = Math.max(best, c.ph.read("raid", own.x + c.nest.r + 1, own.y + k));
      nestRaid += best;
      if (best >= FAINT) nestSmelt++;
      samples++;
      for (let i = 0; i < c.n; i++) {
        const x = c.x[i];
        const y = c.y[i];
        const prev = was[i];
        const plane = onLayer(game, c, i, PLANE);
        was[i] = plane ? [x, y] : undefined;
        if (!c.alive[i] || !prev || !plane) continue;
        if (Math.hypot(x - own.x, y - own.y) <= disc.r + 2 || Math.hypot(x - rival.x, y - rival.y) <= RAID_REACH) continue;
        outside++;
        if (Math.hypot(x - prev[0], y - prev[1]) < 3) stuck++;
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
    map: () =>
      a.build([
        { x: 20, y: 30, r: 3 },
        { x: 100, y: 30, r: 3 },
      ]),
    game: { antCount: 200, rivalAnts: PASS_DEFENDERS },
    sides: { stance: always<Stance>("raid"), responses: RAIDING, rivalResponses: NEVER_RAID, ...(colony ? { colony } : {}) },
    probes: [raidProbe(own, rival)],
  };
}
/** A11 on the arenas `remap` makes of its own (as they are, or one world's plane: onPlane), its deaf and straight runs too. */
export function raidFindAssay(remap: (spec: RunSpec) => RunSpec): Assay {
  return {
    id: "raidFind",
    title: "A11 raiders find the rival: the raid trail's gain, and stuck ants",
    target: `≥ ${RAID_GAIN}× as many raiders reach the rival's nest with the raid trail as without; ≤ ${RAID_STUCK * 100} % of outside samples stuck (design marks; docs/raid-recruitment.md, ja-jwy)`,
    seconds: 300,
    spec: (s) => remap(raidFindSpec(s)),
    score: (r) => {
      const reached = r.metrics.reached as number;
      const deaf = runGame(remap(raidFindSpec(r.seed, { raidLay: 0 }))).result.metrics.reached as number;
      const straight = runGame(remap(raidFindSpec(r.seed, { raidGate: 0 }))).result.metrics.reached as number; // main: at the rival hole's coordinates
      const gain = deaf > 0 ? reached / deaf : NaN;
      const stuck = r.metrics.stuck as number;
      const m = r.metrics;
      return {
        reached,
        deaf,
        straight,
        gain,
        stuck,
        firstReach: m.firstReach as number,
        recruited: m.recruited as number,
        recruitedAtHome: m.recruitedAtHome as number,
        recruitsReaching: m.recruitsReaching as number,
        finds: m.finds as number,
        findDist: m.findDist as number,
        recruitsDead: m.recruitsDead as number,
        deadReached: m.deadReached as number,
        nestRaid: m.nestRaid as number,
        nestSmelt: m.nestSmelt as number,
        pass: gain >= RAID_GAIN && stuck <= RAID_STUCK ? 1 : 0,
      };
    },
  };
}
export const raidFind = raidFindAssay((spec) => spec);

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
      return a.build([
        { x: 50, y: 50, r: 3 },
        { x: 91, y: 91, r: 3 },
      ]);
    },
    game: { antCount: 300, rivalAnts: 30 },
    sides: { stance: always<Stance>(stance), responses: stance === "raid" ? RAIDING : NEVER_RAID },
    probes: [outingProbe(nest, { Late: [720, 900] }), { tick() {}, summary: () => ({ foodAt: food.y }) }],
  };
}
/** A12 on the arenas `remap` makes of its own (as they are, or one world's plane: onPlane), its forage-stance control too. */
export function raidStopAssay(remap: (spec: RunSpec) => RunSpec): Assay {
  return {
    id: "raidStop",
    title: "A12 a raid no one can find doesn't starve the colony",
    target: `food stored over 900 s on a raid stance with no rival ≥ ${RAID_STOP_FOOD * 100} % of the same colony's on a forage stance (design mark; docs/raid-recruitment.md)`,
    seconds: 900,
    spec: (seed) => remap(raidStopSpec(seed, "raid")),
    score: (r) => {
      const stored = r.metrics["you.stored"];
      const control = runGame(remap(raidStopSpec(r.seed, "forage"))).result.metrics["you.stored"];
      const share = control > 0 ? stored / control : NaN;
      return { stored, control, share, outsideLate: r.metrics.outsideLate as number, pass: share >= RAID_STOP_FOOD ? 1 : 0 };
    },
  };
}
export const raidStop = raidStopAssay((spec) => spec);

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
    map: () =>
      new Arena(120, 60, true).pile(60, 30, 4, 200).build([
        { x: 12, y: 30, r: 3 },
        { x: 108, y: 30, r: 3 },
      ]),
    game: { antCount: 200, rivalAnts: 200 },
    sides: { stance: always<Stance>("forage"), rivalStance: always<Stance>("forage"), responses: NEVER_RAID, rivalResponses: NEVER_RAID },
  }),
  score: (r) => {
    const lost = r.metrics["you.losses"] + r.metrics["rival.losses"];
    const home = r.metrics["you.stored"] + r.metrics["rival.stored"];
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
  let defenderIntentNear = 0;
  let raiderIntentNear = 0;
  let atPile = 0;
  let samples = 0;
  let next = 20;
  return {
    seed,
    seconds: 300,
    map: () => {
      const a = new Arena(160, 60, true).pile(15, 30, 4, 300);
      if (sealed) a.wall(140, 20, 158, 40).carve(145, 25, 155, 35);
      return a.build([
        { x: 60, y: 30, r: 3 },
        { x: 150, y: 30, r: 3 },
      ]);
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
            const x = c.x[i];
            const y = c.y[i];
            const fighting = MODES[c.mode[i]] === "fight";
            if (Math.hypot(x - nest.x, y - nest.y) <= NEAR_HOME) {
              if (fighting) fightNear++;
              if (c.attackLayer[i] >= 0 && c.attackLayer[i] === c.layer[i]) defenderIntentNear++;
            }
            if (!fighting && Math.hypot(x - pile.x, y - pile.y) <= 8) atPile++;
          }
          const rival = game.rival;
          if (rival)
            for (let i = 0; i < rival.n; i++) {
              if (!rival.alive[i] || rival.attackLayer[i] < 0 || rival.attackLayer[i] !== rival.layer[i]) continue;
              if (Math.hypot(rival.x[i] - nest.x, rival.y[i] - nest.y) <= NEAR_HOME) raiderIntentNear++;
            }
          samples++;
        },
        summary: () => ({
          fightNear: samples ? fightNear / samples : 0,
          atPile: samples ? atPile / samples : 0,
          defenderIntentNear: samples ? defenderIntentNear / samples : 0,
          raiderIntentNear: samples ? raiderIntentNear / samples : 0,
        }),
      },
    ],
  };
}
/**
 * A13 on one world with no colony-wide stance (S2.2c): the arena made the plane, the war party (colony 1) in fight mode with
 * its own stance, walked to the colony's hole by the harness (marchProbe). The broadcast arm has no one-world twin (the
 * colony-wide stance is what S2 deletes); in its place `noDefence` is the same battle with nobody defending (defendAt ∞).
 * Design mark (owner, 2026-11-15, S2.2c): food at least DEFEND_FOOD of the no-defence colony's, and at least half the war
 * party killed: defending by its senses should cost the colony no more than not defending, and stop the raiders.
 */
/** One arm of A13 on one world: the war party (colony 1) walked at the colony's hole. The spec and both controls use it. */
const defendArm = (seed: number, sealed: boolean, colony?: Partial<ColonyParams>): RunSpec =>
  walked(onPlane(defendSpec(seed, sealed, colony)), 1, 0);

/** Match the treatment's combat and elapsed time in both A13 comparison games. */
export function defendControl(
  seed: number,
  sealed: boolean,
  seconds: number,
  fight: Game["params"]["fight"],
  colony?: Partial<ColonyParams>,
): RunSpec {
  const spec = defendArm(seed, sealed, colony);
  return { ...spec, seconds, game: { ...spec.game, fight: { ...fight } } };
}

/** Count decisions before movement and combat exposure at the hazard calculation. */
function observedDefence(spec: RunSpec): RunSpec {
  const counts: Record<string, number> = {};
  const withdrawals = new Map<number, { contact: number; pressure: number; missed: boolean; clearTicks: number }>();
  const countWithdrawal = (key: string) => {
    const metric = `defender.withdrawal.${key}`;
    counts[metric] = (counts[metric] ?? 0) + 1;
  };
  return {
    ...spec,
    events: [
      ...(spec.events ?? []),
      {
        at: 0,
        kind: "call",
        run(game) {
          game.colonies.forEach((colony, side) => {
            const prefix = side === 0 ? "defender" : "raider";
            const add = (key: string, value = 1) => {
              const metric = `${prefix}.${key}`;
              counts[metric] = (counts[metric] ?? 0) + value;
            };
            for (const key of [
              "attack",
              "withdraw",
              "continue",
              "ignore",
              "protectedLoad",
              "reporting",
              "exposed",
              "pressure",
              "hazardInput",
              "combatDeaths",
            ])
              add(key, 0);
            const contacts = new Map<
              number,
              { time: number; alarm: string; movement: string; homeSeen: boolean; x: number; y: number; layer: number; heading: number }
            >();
            const exposures = new Map<number, { time: number; streak: number }>();
            const attacks = new Map<number, { time: number; streak: number }>();
            const dt = spec.dt ?? 1 / 30;
            combatObservers.set(colony, {
              contact(action, ant, sensed, heading) {
                if (side === 0 && game.time <= 30) {
                  const episode = withdrawals.get(ant);
                  if (episode) episode.contact = game.time;
                  else if (action.movement === "withdraw") {
                    withdrawals.set(ant, { contact: game.time, pressure: 0, missed: false, clearTicks: 0 });
                    countWithdrawal("started");
                  }
                }
                if (side === 0 && game.time <= 30)
                  contacts.set(ant, {
                    time: game.time,
                    alarm: sensed.alarm,
                    movement: action.movement,
                    x: colony.x[ant],
                    y: colony.y[ant],
                    layer: colony.layer[ant],
                    heading,
                    homeSeen: colony.s[3] === SEEN || colony.s[4] === SEEN || colony.s[5] === SEEN,
                  });
                if (action.movement === "attack" && game.time <= 30) {
                  const previous = attacks.get(ant);
                  const repeated = previous !== undefined && Math.abs(game.time - previous.time - dt) < 1e-8;
                  const streak = repeated ? previous.streak + 1 : 1;
                  attacks.set(ant, { time: game.time, streak });
                  add("earlyAttackChoices");
                  add("earlyRepeatedAttackChoices", Number(repeated));
                  counts[`${prefix}.earlyLongestAttackSeconds`] = Math.max(counts[`${prefix}.earlyLongestAttackSeconds`] ?? 0, streak * dt);
                }
                add(action.movement);
                if (action.reason === "protect load") add("protectedLoad");
                if (action.reason === "report home") add("reporting");
              },
              exposure(pressure, allies, killed, ant) {
                add("exposed");
                add("pressure", pressure);
                add("hazardInput", pressure / allies);
                if (side === 0 && game.time <= 30) {
                  const episode = withdrawals.get(ant);
                  if (episode) episode.pressure = game.time;
                }
                const contact = contacts.get(ant);
                const current = contact?.time === game.time ? contact : undefined;
                if (side === 0 && game.time <= 30) {
                  const previous = exposures.get(ant);
                  const repeated = previous !== undefined && Math.abs(game.time - previous.time - dt) < 1e-8;
                  const streak = repeated ? previous.streak + 1 : 1;
                  if (killed) exposures.delete(ant);
                  else exposures.set(ant, { time: game.time, streak });
                  add("earlyExposures");
                  add("earlyExposuresWithoutContact", Number(!current));
                  if (!current) {
                    // Re-read the defender's ordinary recognition from the refreshed, post-movement occupancy.
                    const [x, y] = CELL;
                    const previousLayer = colony.cur;
                    colony.bind(colony.layer[ant]);
                    try {
                      if (enemyHeading(colony, ant) !== null) {
                        add("earlyNoContactPressureVisibleAfterMove");
                        if (killed) add("earlyNoContactDeathsVisibleAfterMove");
                      }
                    } finally {
                      colony.bind(previousLayer);
                      CELL[0] = x;
                      CELL[1] = y;
                    }
                  }
                  add("earlyRepeatedExposures", Number(repeated));
                  if (current?.movement === "withdraw" && current.layer === colony.layer[ant]) {
                    const dx = colony.x[ant] - current.x;
                    const dy = colony.y[ant] - current.y;
                    const toward = dx * Math.cos(current.heading) + dy * Math.sin(current.heading);
                    add("earlyWithdrawalExposures");
                    add("earlyWithdrawalSteppedAway", Number(toward < -1e-8));
                    add("earlyWithdrawalStationary", Number(Math.hypot(dx, dy) < 1e-8));
                    if (killed) add("earlyWithdrawalDeathExposureTicks", streak);
                  }
                }
                if (killed) {
                  add("combatDeaths");
                  counts[`${prefix}.firstCombatDeath`] ??= game.time;
                  if (side !== 0 || game.time > 30) return;
                  const layer = colony.layer[ant];
                  const nest = colony.layers[layer]!.nest;
                  const distance = Math.hypot(colony.x[ant] - nest.x, colony.y[ant] - nest.y);
                  add("earlyDeaths");
                  add("earlyDeathsOutsideNest", Number(distance >= nest.r));
                  add("earlyDeathsWithoutContact", Number(!current));
                  add("earlyDeathsWithAlarm", Number(current !== undefined && current.alarm !== "none"));
                  add("earlyDeathsWithHomeInSight", Number(current?.homeSeen ?? false));
                  if (counts[`${prefix}.earlyDeaths`] === 1) {
                    add("firstDeathLayer", layer);
                    add("firstDeathX", colony.x[ant]);
                    add("firstDeathY", colony.y[ant]);
                    add("firstDeathDistanceFromNest", distance);
                    add(`firstDeathAction.${current?.movement ?? "noContact"}`);
                  }
                }
              },
            });
          });
        },
      },
    ],
    probes: [
      ...(spec.probes ?? []),
      {
        tick(game) {
          if (game.time > 30) return;
          for (const [ant, episode] of withdrawals) {
            const contact = episode.contact === game.time;
            const pressure = episode.pressure === game.time;
            if (!contact && pressure) countWithdrawal("pressureTicksWithoutContact");
            if (!game.player.alive[ant]) {
              countWithdrawal(pressure ? "combatDeaths" : "otherDeaths");
              withdrawals.delete(ant);
              continue;
            }
            if (contact && episode.missed) countWithdrawal("renewedContact");
            episode.missed = !contact;
            episode.clearTicks = contact || pressure ? 0 : episode.clearTicks + 1;
            if (episode.clearTicks === 3) {
              countWithdrawal("cleared");
              withdrawals.delete(ant);
            }
          }
        },
        summary: () => ({ ...counts, "defender.withdrawal.openAtCutoff": withdrawals.size }),
      },
    ],
  };
}

export const defendWalked: Assay = {
  id: "defendHome",
  title: "A13 defence from senses (one world, the war party walked)",
  target: `food ≥ ${DEFEND_FOOD * 100} % of the same colony's with nobody defending, and ≥ half the war party killed (design marks; docs/stance.md)`,
  seconds: 300,
  spec: (seed) => observedDefence(defendArm(seed, false)),
  score: (r, game) => {
    const run = (sealed: boolean, colony?: Partial<ColonyParams>) =>
      runGame(defendControl(r.seed, sealed, r.seconds, game.params.fight, colony)).result.metrics;
    const stored = r.metrics["you.stored"];
    const control = run(true)["you.stored"];
    const none = run(false, { defendAt: Infinity });
    const killed = r.metrics["rival.losses"];
    const vsNone = control > 0 && none["you.stored"] > 0 ? stored / none["you.stored"] : NaN;
    const half = game.params.rivalAnts / 2;
    const lost = r.metrics["you.losses"];
    return {
      stored,
      control,
      foodShare: control > 0 ? stored / control : NaN,
      noDefence: none["you.stored"] / Math.max(1, control),
      vsNone,
      noDefenceKilled: none["rival.losses"],
      noDefenceLost: none["you.losses"],
      killed,
      lost,
      exchange: killed / Math.max(1, lost),
      fightNear: r.metrics.fightNear as number,
      atPile: r.metrics.atPile as number,
      marched: r.metrics.marched as number,
      pass: vsNone >= DEFEND_FOOD && killed >= half ? 1 : 0,
    };
  },
};

export const defendHome: Assay = {
  id: "defendHome",
  title: "A13 defence from senses: the nest is defended, the far pile still worked",
  target: `food (against the same colony with no war party) ≥ ${DEFEND_FOOD * 100} % of the broadcast stance's, and ≥ half the war party killed (design marks; docs/stance.md)`,
  seconds: 300,
  spec: (seed) => defendSpec(seed, false),
  score: (r) => {
    const stored = r.metrics["you.stored"];
    const control = runGame(defendSpec(r.seed, true)).result.metrics["you.stored"];
    const foodShare = control > 0 ? stored / control : NaN;
    const killed = r.metrics["rival.losses"];
    const lost = r.metrics["you.losses"];
    const broadcast = runGame(defendSpec(r.seed, false, { stanceGate: 0 })).result.metrics["you.stored"] / Math.max(1, control);
    return {
      stored,
      control,
      foodShare,
      broadcast,
      killed,
      lost,
      exchange: killed / Math.max(1, lost),
      fightNear: r.metrics.fightNear as number,
      atPile: r.metrics.atPile as number,
      pass: foodShare >= DEFEND_FOOD * broadcast && killed >= 40 ? 1 : 0,
    };
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
      events: [0, 2, 4, 6, 8].map((d) => ({
        at: when + d,
        kind: "paint" as const,
        channel: "alarm" as const,
        x: spot.x,
        y: spot.y,
        r: 2,
        amount: 0.4,
      })),
      probes: [probe],
    };
  },
  score: (r) => ({ pass: (r.metrics.draw as number) >= FAINT_DRAW ? 1 : 0 }),
};

/**
 * G — the real game as the page opens it (the side view), 600 + 600 ants, 10 minutes. Also the
 * homing guard (A7): no colony with more than 2 foragers holding food over 120 s at any 10-s sample
 * (the side view's slow/side.test bound, now G1's).
 */
export const game: Assay = {
  id: "game",
  title: "G the side-view game (with A7: foragers holding food)",
  target:
    "≤ 2 foragers holding food over 120 s per colony at any 10-s sample (the side view's slow/side.test bound, now G1's); food home and outcome reported",
  seconds: 600,
  spec: (seed) => ({ seed, seconds: 600, game: { antCount: 600, rivalAnts: 600 } }),
  score: (r) => {
    const worst = Math.max(r.metrics["you.maxHeld"] ?? 0, r.metrics["rival.maxHeld"] ?? 0);
    // Porters are reported, not judged: they have no bound yet (ja-3po).
    return {
      maxHeld: worst,
      maxPorting: Math.max(r.metrics["you.maxPorting"] ?? 0, r.metrics["rival.maxPorting"] ?? 0),
      pass: worst <= 2 ? 1 : 0,
    };
  },
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
      return {
        beyond: samples ? beyond / samples : NaN,
        receptionMax,
        starved,
        firstBirth,
        portTrips: game.player.portTrips,
        handedOn: game.player.handedOn,
      };
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
  target:
    "report only (Tschinkel, Rink & Kwapich 2015: food dropped in the top chambers is carried down by others); larvae unfed beside food ≤ 5 is the economy test's bound",
  seconds: 900,
  spec: (seed) => ({ seed, seconds: 900, game: { antCount: 600, rival: false }, probes: [nestFlowProbe()] }),
  score: (r) => ({
    beyond: r.metrics.beyond as number,
    receptionMax: r.metrics.receptionMax as number,
    starved: r.metrics.starved as number,
    firstBirth: r.metrics.firstBirth as number,
    portTrips: r.metrics.portTrips as number,
  }),
};

/**
 * Where the young sit (ja-k4k.15; docs/brood-odour.md): every 30 s from 120 s on, for the first colony's ants underground,
 * the mean hex distance to the nearest brood item lying in the nest (not held), by band (young, middle-aged), and to the
 * queen (world units, about a cell each). `margin` is the middle-aged's distance to the brood less the young's: positive when the young keep nearer it.
 */
export function nurseZoneProbe(): Probe {
  let nextAt = 120;
  const toBrood = [0, 0];
  const toQueen = [0, 0];
  const counts = [0, 0];
  return {
    tick(game) {
      if (game.time + 1e-9 < nextAt) return;
      nextAt += 30;
      const c = game.player;
      // One world: the nest is in the curtain (game.map is the plane).
      const map = game.world?.curtain ?? game.map;
      const lying = c.brood.items.filter((b) => b.held < 0);
      const q = c.queen;
      if (lying.length === 0 || !q?.alive) return;
      for (let i = 0; i < c.n; i++) {
        if (!c.alive[i] || !c.under[i]) continue;
        const band = c.band(i);
        if (band > 1) continue;
        c.antCell(i);
        const ax = CELL[0];
        const ay = CELL[1];
        if (isSky(map, ax, ay)) continue;
        let near = Infinity;
        for (const b of lying) near = Math.min(near, hexDistance(ax, ay, b.x, b.y));
        toBrood[band]! += near;
        toQueen[band]! += Math.hypot(c.x[i]! - q.x, c.y[i]! - q.y);
        counts[band]!++;
      }
    },
    summary() {
      const young = counts[0] ? toBrood[0]! / counts[0] : NaN;
      const middle = counts[1] ? toBrood[1]! / counts[1] : NaN;
      return {
        youngToBrood: young,
        middleToBrood: middle,
        margin: middle - young,
        youngToQueen: counts[0] ? toQueen[0]! / counts[0] : NaN,
        middleToQueen: counts[1] ? toQueen[1]! / counts[1] : NaN,
      };
    },
  };
}

/**
 * Nurse zone (ja-k4k.15.1): the young keep to the brood. Workers are drawn to brood odour and the brood pile holds nurses
 * (Glancey & Dickens 1988; Sendova-Franks & Franks 1995); in *P. badius* over 90 % of workers below 70 cm are young,
 * where the brood lies (Tschinkel & Hanley 2017). The side view, one colony of 600, 600 s.
 */
export const nurseZone: Assay = {
  id: "nurseZone",
  title: "Nurse zone: the young keep nearer the brood than the middle-aged",
  target: "margin (middle-aged's mean distance to the nearest brood less the young's, cells) > 0; report the distances to the queen",
  seconds: 600,
  spec: (seed) => ({ seed, seconds: 600, game: { antCount: 600, rival: false }, probes: [nurseZoneProbe()] }),
  score: (r) => ({
    youngToBrood: r.metrics.youngToBrood as number,
    middleToBrood: r.metrics.middleToBrood as number,
    margin: r.metrics.margin as number,
    youngToQueen: r.metrics.youngToQueen as number,
    pass: (r.metrics.margin as number) > 0 ? 1 : 0,
  }),
};

/** Food lying below the ground (not sky) on `map`, and the open cells there (the nest's and its tunnels' ground, net of fills). */
function underground(map: WorldMap): { food: number; open: number } {
  let food = 0;
  let open = 0;
  for (let y = 0; y < map.size.h; y++)
    for (let x = map.x0; x < map.x0 + map.size.w; x++) {
      if (isSky(map, x, y)) continue;
      food += map.food.get(x, y);
      if (rockAt(map, x, y) === OPEN) open++;
    }
  return { food, open };
}

/**
 * P1 (ja-16rp.1, docs/foraging-tunnels.md): how much of the soil's buried food a colony takes, and what its digging
 * costs. At the start and the end: the food lying below the ground and the open cells there. `buriedTaken` is the food
 * gone from below the ground (carried home, eaten in passing or dropped elsewhere), `buriedShare` its share of what
 * lay there, `opened` the open cells gained underground (tunnels and chambers, net of fills), `soilOut` the pellets
 * brought out.
 */
export function buriedProbe(): Probe {
  let start: { food: number; open: number } | null = null;
  return {
    tick(game) {
      start ??= underground(game.map);
    },
    summary(game) {
      const end = underground(game.map);
      const s = start ?? end;
      return {
        buriedStart: s.food,
        buriedTaken: s.food - end.food,
        buriedShare: s.food > 0 ? (s.food - end.food) / s.food : 0,
        opened: end.open - s.open,
        soilOut: game.player.soilOut,
      };
    },
  };
}

/**
 * P1: foraging the buried food (ja-16rp, PRD §70). One colony of 600 on the app's side map for an hour, on the local
 * rule. Fire ants keep a standing network of foraging tunnels under their territory (Tschinkel 2011), but no paper
 * gives a share of soil food an ant colony takes, so the target is design: a measurable share within the hour, by the
 * worst seed. The guards (food home, workers alive, cells opened, spoil out, ms per tick) must not worsen.
 */
export const pockets: Assay = {
  id: "pockets",
  title: "P1 buried food: the share of the soil's food taken in an hour",
  target:
    "design (docs/foraging-tunnels.md): a measurable share of the buried food within 3,600 s, by the worst seed; food home, workers alive, cells opened and ms per tick not worse",
  seconds: 3600,
  spec: (seed) => ({ seed, seconds: 3600, game: { antCount: 600, rival: false }, probes: [buriedProbe()] }),
  score: (r) => ({
    buriedShare: r.metrics.buriedShare as number,
    buriedTaken: r.metrics.buriedTaken as number,
    stored: r.metrics["you.stored"] as number,
    ants: r.metrics["you.ants"] as number,
    opened: r.metrics.opened as number,
    soilOut: r.metrics.soilOut as number,
  }),
};

/**
 * slow/economy.test's world: the tests' small one world (a 160 × 100 plane over its curtain) with 0.3 of both layers' food, about
 * the full game's food per ant for a colony of 110. World `((seed - 1) % 4) + 1`, so seeds 1-16 play worlds 1-4 four times each.
 */
export function economyMap(seed: number): OneWorld {
  const world = generateOneWorld(((seed - 1) % 4) + 1, { plane: { size: { w: 160, h: 100 } } });
  for (const map of [world.plane, world.curtain]) {
    let total = 0;
    for (let y = 0; y < map.size.h; y++)
      for (let x = map.x0; x < map.x0 + map.size.w; x++) {
        const v = map.food.get(x, y) * 0.3;
        map.food.set(x, y, v);
        total += v;
      }
    map.foodTotal = map.foodLeft = total;
  }
  return world;
}

/** Workers and larvae starved by the end, and births, of the first colony. */
function starvedProbe(): Probe {
  return {
    tick() {},
    summary(game) {
      const c = game.player;
      return { diedHungry: c.diedHungry, broodStarved: c.broodStarved, diedOld: c.diedOld };
    },
  };
}

/**
 * Larvae fed when the young are gone (ja-7r7x.1, docs/task-reversion.md, PRD §74): slow/economy.test's hour as an assay.
 * A colony of 110 on that test's map; its founders age as one cohort, so for a stretch it has no young ants and its
 * larvae are fed only if old ants come to them. `starved` is the most larvae at once waiting over 120 s, unfed, with
 * food enough for them in the nest (nestFlowProbe's measure, sampled every 30 s). Target: no seed above 8, the
 * economy test's bound and ja-rvli's acceptance; workers starved, workers alive and food stored are the guards.
 */
export const larvae: Assay = {
  id: "larvae",
  title: "Larvae fed when the young are gone: the most larvae left waiting beside food in an hour",
  target:
    "no seed above 8 larvae waiting over 120 s beside enough food (slow/economy.test, ja-rvli); no worker starved; workers alive and food stored not worse",
  seconds: 3600,
  spec: (seed) => ({
    seed,
    map: economyMap,
    seconds: 3600,
    game: { antCount: 110, rival: false },
    probes: [nestFlowProbe(), starvedProbe()],
  }),
  score: (r) => ({
    waiting: r.metrics.starved as number,
    ants: r.metrics["you.ants"] as number,
    births: r.metrics["you.births"] as number,
    stored: r.metrics["you.stored"] as number,
    diedHungry: r.metrics.diedHungry as number,
    broodStarved: r.metrics.broodStarved as number,
    pass: (r.metrics.starved as number) <= 8 && r.metrics.diedHungry === 0 ? 1 : 0,
  }),
};

/**
 * New queens (ja-lo8.9, royal.ts), on the first colony of a solo side-view game: when the fungus reaches the queen,
 * when the first gyne is reared, how many are culled, when the first alate flies, and when the first daughter's first
 * worker ecloses and first goes out. `arm` forces one of the fungus's queen levers in every host from the start, so
 * the rearing is measured apart from how fast the fungus spreads: "signal" the queen's signal at "damp" (0.4), "scent"
 * every worker's perception of her scent at "damp" (0.3); "none" forces nothing (the fungus lands and plays the local
 * rule, which pulls neither: dilution alone).
 */
export function lifecycleProbe(arm: "none" | "signal" | "scent", one = false): Probe {
  const at: Record<string, number> = { queen: NaN, gyne: NaN, flight: NaN, daughter: NaN, daughterWorker: NaN, daughterOut: NaN };
  const first = (k: string, t: number) => {
    if (Number.isNaN(at[k])) at[k] = t;
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
          // Out: on the ground above its nest (the side view), or up on the plane (one world).
          if (d.alive[i] && (one ? d.layer[i] === PLANE : isSky(game.map, Math.floor(d.x[i]), Math.floor(d.y[i] / R)))) {
            first("daughterOut", t);
            break;
          }
    },
    summary(game) {
      const c = game.player;
      return {
        ...Object.fromEntries(Object.entries(at).map(([k, v]) => [`t.${k}`, v])),
        gynes: c.gynes,
        culled: c.gynesCulled,
        flights: c.flights,
        daughters: game.lineage(0).length - 1,
      };
    },
  };
}

/** The lifecycle assay for one arm: on a solo side-view game, or (`one`) on a solo one world (S2.2b, ja-fnd.3.2.2). */
function lifecycleAssay(arm: "none" | "signal" | "scent", one = false): Assay {
  const id = arm === "none" ? "lifecycle" : `lifecycle-${arm}`;
  return {
    id,
    title: `L new queens${arm === "none" ? " (the fungus lands; no queen lever forced)" : arm === "signal" ? " (the queen's signal damped)" : " (nurses perceive her scent damped)"}${one ? " (one world)" : ""}`,
    target:
      "report only (design, docs/new-queens.md §5): times to the queen, the first gyne, the first flight, and the daughter's first worker and forager; gynes, culls",
    seconds: 1800,
    spec: (seed) => ({
      seed,
      seconds: 1800,
      ...(one ? { map: (s: number) => generateOneWorld(s) } : {}),
      game: { antCount: 600, rival: false },
      events: [
        {
          at: 0,
          kind: "call",
          run: (g) =>
            void g.land(
              0,
              STRAINS.findIndex((x) => x.id === "garden"),
            ),
        },
      ],
      probes: [lifecycleProbe(arm, one)],
    }),
    score: (r) =>
      Object.fromEntries(
        ["t.queen", "t.gyne", "t.flight", "t.daughterWorker", "t.daughterOut", "gynes", "culled", "flights"].map((k) => [k, r.metrics[k]]),
      ),
  };
}

export const lifecycle = lifecycleAssay("none");
export const lifecycleSignal = lifecycleAssay("signal");
export const lifecycleScent = lifecycleAssay("scent");
/** The three on one world (ONE_ASSAYS, same ids): the alates fly from the plane and their daughters dig in the curtain. */
export const lifecycleOne = (["none", "signal", "scent"] as const).map((arm) => lifecycleAssay(arm, true));

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

/** A8 on one world: the solo colony's nest in the curtain (nestFlowProbe reads the curtain's chambers). */
const nestFlowOne: Assay = {
  ...nestFlow,
  title: `${nestFlow.title} (one world)`,
  spec: (seed) => ({ ...nestFlow.spec(seed), map: (s) => generateOneWorld(s) }),
};

/** A run spec on one world's plane (onPlane) that also reports the ants held at the gate at the top of each shaft (gateProbe). */
const onPlaneGated = (spec: RunSpec): RunSpec => {
  const s = onPlane(spec);
  return { ...s, probes: [...(s.probes ?? []), gateProbe()] };
};

/**
 * The assays rerun on one world (`experiment.mjs --one`): A1, A2a, A2b, A3, A4, A5, A5b, A6, A9, A10, A11 and A12 on their
 * arenas made the plane (onPlane), A8 in the curtain, and G1. Same ids as the legacy ones, so `--one bridge` is A1 on the
 * plane. A5, A5b (ja-web), A11 and A12 (U6b) count outside on the plane, past the disc round the hole, and report the ants
 * held at the gate at the top of the shaft (gateProbe). A11 and A12 run their controls (no trail, straight at the hole,
 * a forage stance) on the plane too; their raiders are recruited at the gate (ja-web), so a recruit in the curtain is home.
 * Also the one-world assays of their own (S1, F1, R1), the desert ant's, the builder's, and the lifecycle assays (L ×3,
 * lifecycleOne) on a solo one world, 30 minutes each.
 */
/** Experimental response using the contact policy's existing perception of its own entrance. */
function entranceDefence(spec: RunSpec, cue: "any contact" | "alarm" | "alarm or outnumbered" | "approach alarm" = "any contact"): RunSpec {
  const base = spec.sides?.responses ?? spec.game?.species?.responses ?? localResponses;
  let game: Game | undefined;
  let entranceContacts = 0;
  let entranceContactsWithAlarm = 0;
  let approachAlarmContacts = 0;
  const times: Record<string, number> = {};
  return {
    ...spec,
    events: [
      ...(spec.events ?? []),
      {
        at: 0,
        kind: "call",
        run: (started) => {
          game = started;
        },
      },
    ],
    probes: [
      ...(spec.probes ?? []),
      { tick() {}, summary: () => ({ entranceContacts, entranceContactsWithAlarm, approachAlarmContacts, ...times }) },
    ],
    sides: {
      ...spec.sides,
      responses: {
        ...base,
        contact(t, draw) {
          if (t.enemy && t.place === "hole" && t.carrying === "none") {
            entranceContacts++;
            if (game) times.firstEntranceContact ??= game.time;
            if (t.alarm !== "none") {
              entranceContactsWithAlarm++;
              if (game) times.firstEntranceContactWithAlarm ??= game.time;
            }
            if (cue === "any contact" || t.alarm !== "none" || (cue === "alarm or outnumbered" && t.odds === "outnumbered")) return "fight";
          }
          // The assay reuses the current ant's three home sensors. The ordinary contact policy has no home-sensor field.
          if (
            cue === "approach alarm" &&
            game?.player.onPlane &&
            t.enemy &&
            t.place === "out" &&
            t.carrying === "none" &&
            t.alarm !== "none"
          ) {
            const sensed = game.player.s;
            if (sensed[3] === SEEN || sensed[4] === SEEN || sensed[5] === SEEN) {
              approachAlarmContacts++;
              times.firstApproachAlarmContact ??= game.time;
              return "fight";
            }
          }
          return base.contact(t, draw);
        },
      },
    },
    game: { ...spec.game, fight: { ...DEFAULT_FIGHT, ...spec.game?.fight, intent: true } },
  };
}

const defendEntrance: Assay = {
  ...defendWalked,
  id: "defendEntrance",
  title: "A13 directed combat with contact defense at the entrance",
  spec: (seed) => entranceDefence(defendWalked.spec(seed)),
};

const contactEntrance: Assay = {
  ...onPlaneAssay(contact),
  id: "contactEntrance",
  title: "A9 neutral contact with entrance defense enabled for one colony",
  spec: (seed) => entranceDefence(onPlane(contact.spec(seed))),
};

const defendAlarmEntrance: Assay = {
  ...defendEntrance,
  id: "defendAlarmEntrance",
  title: "A13 directed combat with alarm-gated entrance defense",
  spec: (seed) => entranceDefence(defendWalked.spec(seed), "alarm"),
};

const contactAlarmEntrance: Assay = {
  ...contactEntrance,
  id: "contactAlarmEntrance",
  title: "A9 neutral contact with alarm-gated entrance defense for one colony",
  spec: (seed) => entranceDefence(onPlane(contact.spec(seed)), "alarm"),
};

const defendThreatEntrance: Assay = {
  ...defendEntrance,
  id: "defendThreatEntrance",
  title: "A13 entrance defense on local alarm or when outnumbered",
  spec: (seed) => entranceDefence(defendWalked.spec(seed), "alarm or outnumbered"),
};

const contactThreatEntrance: Assay = {
  ...contactEntrance,
  id: "contactThreatEntrance",
  title: "A9 neutral contact with alarm-or-outnumbered entrance defense",
  spec: (seed) => entranceDefence(onPlane(contact.spec(seed)), "alarm or outnumbered"),
};

const defendAlarmApproach: Assay = {
  ...defendEntrance,
  id: "defendAlarmApproach",
  title: "A13 alarm-gated defense at a locally sensed nest approach",
  spec: (seed) => entranceDefence(defendWalked.spec(seed), "approach alarm"),
};

const contactAlarmApproach: Assay = {
  ...contactEntrance,
  id: "contactAlarmApproach",
  title: "A9 neutral contact with alarm-gated defense at the nest approach",
  spec: (seed) => entranceDefence(onPlane(contact.spec(seed)), "approach alarm"),
};

export const ONE_ASSAYS: Assay[] = [
  ...[bridge, twin, richPoor, deplete, alarm].map((a) => onPlaneAssay(a)),
  ...[regulate, regulateStop].map((a) => onPlaneAssay(a, () => [gateProbe()])),
  passWalked,
  { ...open, title: `${open.title} (one world, attackers walked)`, spec: (s) => walked(onPlane(open.spec(s)), 0, 1) },
  { ...raidFindAssay(onPlaneGated), title: `${raidFind.title} (one world)` },
  { ...raidStopAssay(onPlaneGated), title: `${raidStop.title} (one world)` },
  onPlaneAssay(contact),
  onPlaneAssay(faintAlarm),
  nestFlowOne,
  nurseZone,
  pockets,
  larvae,
  game1,
  gameRoyalDelivery,
  gameRoyalRecovery,
  lockstep1,
  searchTight1,
  memory1,
  search1,
  forage1,
  route1,
  desertNoTrail,
  desertInvitation,
  desertChamber,
  desertFirstFind,
  desertTrips,
  desertHeat,
  neglectusImmunisation,
  neglectusTolerance,
  ...BUILDER_ASSAYS,
  ...lifecycleOne,
  defendWalked,
  defendEntrance,
  contactEntrance,
  defendAlarmEntrance,
  contactAlarmEntrance,
  defendThreatEntrance,
  contactThreatEntrance,
  defendAlarmApproach,
  contactAlarmApproach,
];

/** The one-world twin of assay `id` (ONE_ASSAYS): the gate tests run these (S2.2e, ja-fnd.3.2.5). */
export function oneAssay(id: string): Assay {
  const a = ONE_ASSAYS.find((x) => x.id === id);
  if (!a) throw new Error(`no one-world assay ${id}`);
  return a;
}

/** Assays not rerun on one world yet, and why (`experiment.mjs --one` reports them so): none since U6b. */
export const ONE_PENDING: Record<string, string> = {};
