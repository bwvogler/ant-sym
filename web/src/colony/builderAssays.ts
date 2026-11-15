// The builder's assays B1–B6 (docs/builder.md "The mechanic", PRD §73, ja-kjj8.1): what today's ants do when a child changes
// their world. Each runs on one world, as the page plays, with a scripted builder stroke applied between ticks (Builder,
// builder.ts). They measure the ants; nothing here changes how an ant behaves.
//
//   B1 crayonLine  a crayon line out from the hole across empty ground, against its mirror image undrawn
//   B2 wall        a rock wall dropped across an established trail: does food come home again by another way?
//   B3 rain        rain along an established trail: how far does delivery dip, and how fast does it come back? (report)
//   B4 lateSugar   sugar dropped beside a crumb pile the colony already works (report; Beckers et al. 1990)
//   B5 crayonRing  a crayon circle round the hole: how long do ants stay on it? (report; Butterfield et al. 2025)
//   B7 noEntryFork a no-entry sign on one branch of a crayon fork: do followers take the other? (Robinson et al. 2005)
//   B8 tweezers    carriers moved sideways: do they run their old vector before finding home? (report; Wehner & Srinivasan 1981)
//   B6 fillShaft   dirt poured over the colony's largest chamber: do the ants dig it out? (report; Rajendran et al. 2026)
//   B9 aphidsFound      a clump of aphids far from the hole: how soon is it first found? (docs/aphids.md, PRD §78)
//   B10 aphidsRenewable a clump against sugar on the same cells: which brings more home over 5 minutes, and is a trail laid?
//   B11 tendersDefend   two colonies meet at a clump between them: what share of ants in contact with a rival stand and fight there?

import { Builder, type Stroke } from "./builder.ts";
import type { Game } from "./game.ts";
import { centreX, centreY } from "./hex.ts";
import { generateOneWorld } from "./oneWorld.ts";
import { CURTAIN, MODES, PLANE } from "./vocab.ts";
import { OPEN, rockAt } from "./world.ts";
import { type Assay, Arena, at, foodIn, mean, onLayer, onPlane, type Probe, type RunSpec } from "./harness.ts";

type Pt = { x: number; y: number };

/** A builder stroke as a harness event at `when`. `done` hears how many cells it changed. */
function strokeAt(
  when: number,
  stroke: Stroke | ((g: Game) => Stroke),
  done?: (g: Game, n: number) => void,
): NonNullable<RunSpec["events"]>[number] {
  return {
    at: when,
    kind: "call",
    run: (g: Game) => {
      const n = new Builder(g).apply(typeof stroke === "function" ? stroke(g) : stroke);
      done?.(g, n);
    },
  };
}

/** Colony 0's ants on the plane within `half` of segment a–b. */
function nearSegment(game: Game, a: Pt, b: Pt, half: number): number {
  const c = game.colonies[0];
  if (!c) return 0;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy || 1;
  let n = 0;
  for (let i = 0; i < c.n; i++) {
    if (!c.alive[i] || !onLayer(game, c, i, PLANE)) continue;
    const t = Math.max(0, Math.min(1, ((c.x[i] - a.x) * dx + (c.y[i] - a.y) * dy) / len2));
    if (Math.hypot(c.x[i] - a.x - t * dx, c.y[i] - a.y - t * dy) <= half) n++;
  }
  return n;
}

/** Colony 0's ants on the plane whose distance from `o` lies in [r0, r1]. */
function inRing(game: Game, o: Pt, r0: number, r1: number): number {
  const c = game.colonies[0];
  if (!c) return 0;
  let n = 0;
  for (let i = 0; i < c.n; i++) {
    if (!c.alive[i] || !onLayer(game, c, i, PLANE)) continue;
    const d = Math.hypot(c.x[i] - o.x, c.y[i] - o.y);
    if (d >= r0 && d <= r1) n++;
  }
  return n;
}

/** Something sampled once a second into a series. */
function everySecond(sample: (game: Game) => number, out: number[]): Probe["tick"] {
  let next = 1;
  return (game) => {
    if (game.time + 1e-9 < next) return;
    next += 1;
    out.push(sample(game));
  };
}

/** Points along a–b, `step` world units apart (a stroke the way a finger drags). */
function along(a: Pt, b: Pt, step = 1): Pt[] {
  const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / step));
  return Array.from({ length: n + 1 }, (_, k) => ({ x: a.x + ((b.x - a.x) * k) / n, y: a.y + ((b.y - a.y) * k) / n }));
}

/**
 * Delivery: food stored per second by colony 0, from a per-second series of `stored`. The rate over [from, to) seconds.
 */
const rate = (stored: number[], from: number, to: number) => {
  const a = stored[Math.max(0, Math.floor(from) - 1)] ?? 0;
  const b = stored[Math.min(stored.length, Math.floor(to)) - 1] ?? a;
  return (b - a) / Math.max(1, to - from);
};

const NEST = { x: 50, y: 82, r: 3 };

/** B1: a crayon line from beside the hole out across empty ground; the same line mirrored, undrawn, as the control. */
export const crayonLine: Assay = {
  id: "crayonLine",
  title: "B1 a crayon line: do foragers follow it?",
  target:
    "ants on the drawn line ≥ 3× those on its undrawn mirror over the minute after drawing, in ≥ 8 of 10 seeds (design mark; Choe et al. 2012: a blend line drew 5.0 ants, one compound 0.2)",
  seconds: 90,
  spec: (seed) => {
    const line = { a: at(46, 76), b: at(31, 38) };
    const mirror = { a: at(54, 76), b: at(69, 38) };
    const drawn: number[] = [];
    const undrawn: number[] = [];
    const tick1 = everySecond((g) => nearSegment(g, line.a, line.b, 1.6), drawn);
    const tick2 = everySecond((g) => nearSegment(g, mirror.a, mirror.b, 1.6), undrawn);
    return onPlane({
      seed,
      seconds: 90,
      // No food (as Choe et al.'s line led to none): a pile found on either side lays a trail of its own and swamps the cue.
      map: () => new Arena(100, 100, true).build([NEST]),
      game: { antCount: 300, rival: false },
      events: [strokeAt(5, { tool: "crayon", layer: PLANE, colony: 0, points: along(line.a, line.b) })],
      probes: [
        {
          tick: (g, dt) => (tick1(g, dt), tick2(g, dt)),
          summary: () => ({ onLine: mean(drawn.slice(10, 70)), onMirror: mean(undrawn.slice(10, 70)) }),
        },
      ],
    });
  },
  score: (r) => {
    const on = r.metrics.onLine as number;
    const off = r.metrics.onMirror as number;
    const ratio = on / Math.max(off, 0.1);
    return { lineRatio: ratio, pass: ratio >= 3 ? 1 : 0 };
  },
};

/** The trail arena of B2 and B3: one pile straight up from the hole. */
const trailArena = () => new Arena(100, 100, true).pile(50, 25, 3, 400).build([NEST]);

/** B2: a rock wall across the trail once it is established. */
export const wall: Assay = {
  id: "wall",
  title: "B2 a rock wall across a trail: does food come home again by another way?",
  target:
    "delivery 150–270 s after the wall ≥ 50 % of its rate before, in ≥ 8 of 10 seeds (design mark; Dussutour et al. 2009: 18 of 21 colonies moved to the other branch). Without a wall the same span runs at ≈ 1.0× (PRD §73)",
  seconds: 420,
  spec: (seed) => {
    const stored: number[] = [];
    let walled = 0;
    return onPlane({
      seed,
      seconds: 420,
      map: trailArena,
      game: { antCount: 300, rival: false },
      events: [strokeAt(150, { tool: "rock", layer: PLANE, points: along(at(35, 55), at(65, 55)) }, (_, n) => (walled = n))],
      probes: [
        {
          tick: everySecond((g) => g.colonies[0]!.stored, stored),
          summary: () => {
            const before = rate(stored, 90, 150);
            const after = rate(stored, 300, 420);
            return { before, wallCells: walled, after, afterShare: before > 0 ? after / before : NaN };
          },
        },
      ],
    });
  },
  score: (r) => ({ pass: (r.metrics.afterShare as number) >= 0.5 ? 1 : 0 }),
};

/** B3: rain along the whole trail once it is established. Report only: no study measured rain washing a trail. */
export const rain: Assay = {
  id: "rain",
  title: "B3 rain along a trail: the dip, and the way back (report)",
  target: "report only: delivery in the 30 s after rain, and 90–210 s after, as shares of before (no measurement in the literature)",
  seconds: 360,
  spec: (seed) => {
    const stored: number[] = [];
    return onPlane({
      seed,
      seconds: 360,
      map: trailArena,
      game: { antCount: 300, rival: false },
      events: [strokeAt(150, { tool: "rain", layer: PLANE, points: along(at(50, 80), at(50, 27), 3) })],
      probes: [
        {
          tick: everySecond((g) => g.colonies[0]!.stored, stored),
          summary: () => {
            const before = rate(stored, 90, 150);
            return {
              before,
              dip: before > 0 ? rate(stored, 150, 180) / before : NaN,
              afterShare: before > 0 ? rate(stored, 240, 360) / before : NaN,
            };
          },
        },
      ],
    });
  },
  score: () => ({}),
};

/** B4: sugar dropped beside a crumb pile already worked. Report only: Beckers et al. 1990 saw Lasius stay on the old source. */
export const lateSugar: Assay = {
  id: "lateSugar",
  title: "B4 sugar dropped beside a worked crumb pile: does the colony switch? (report)",
  target:
    "report only: the sugar's share of the food carried in the 180 s after it is dropped (Beckers et al. 1990: an established trail to the poor source can hold)",
  seconds: 330,
  spec: (seed) => {
    const crumb = at(30, 25);
    const sugar = at(70, 25);
    let atDrop: { crumb: number; sugar: number } | null = null;
    const ring = [0, 60, 120, 180, 240, 300].map((deg) => ({
      x: sugar.x + 2 * Math.cos((deg * Math.PI) / 180),
      y: sugar.y + 2 * Math.sin((deg * Math.PI) / 180),
    }));
    return onPlane({
      seed,
      seconds: 330,
      map: () => new Arena(100, 100, true).pile(30, 25, 3, 200, 0.5).build([NEST]),
      game: { antCount: 300, rival: false },
      events: [
        strokeAt(150, { tool: "sugar", layer: PLANE, points: [sugar, ...ring] }, (g) => {
          atDrop = { crumb: foodIn(g.map, crumb.x, crumb.y, 4), sugar: foodIn(g.map, sugar.x, sugar.y, 4) };
        }),
      ],
      probes: [
        {
          tick: () => {},
          summary: (g) => {
            if (!atDrop) return { sugarShare: NaN, sugarPut: NaN, carriedAfter: NaN };
            const fromCrumb = atDrop.crumb - foodIn(g.map, crumb.x, crumb.y, 4);
            const fromSugar = atDrop.sugar - foodIn(g.map, sugar.x, sugar.y, 4);
            const all = fromCrumb + fromSugar;
            return { sugarShare: all > 0 ? fromSugar / all : NaN, sugarPut: atDrop.sugar, carriedAfter: all };
          },
        },
      ],
    });
  },
  score: () => ({}),
};

/** B5: a crayon circle round the hole. Report only: drawn circles are left after about half a lap (Butterfield et al. 2025). */
export const crayonRing: Assay = {
  id: "crayonRing",
  title: "B5 a crayon circle round the hole: how long do ants stay on it? (report)",
  target:
    "report only: ants on the ring against a ring of the same width just outside it, over three spans (Butterfield et al. 2025: no mill)",
  seconds: 200,
  spec: (seed) => {
    const nest = { x: 50, y: 60, r: 3 };
    const o = at(nest.x, nest.y);
    const R0 = 10;
    const onRing: number[] = [];
    const outside: number[] = [];
    const t1 = everySecond((g) => inRing(g, o, R0 - 1.5, R0 + 1.5), onRing);
    const t2 = everySecond((g) => inRing(g, o, R0 + 4.5, R0 + 7.5), outside);
    const circle = Array.from({ length: 49 }, (_, k) => ({
      x: o.x + R0 * Math.cos((k * Math.PI) / 24),
      y: o.y + R0 * Math.sin((k * Math.PI) / 24),
    }));
    // The outer ring is longer: ants per unit of ring length.
    const ratio = (a: number[], b: number[], from: number, to: number) =>
      mean(a.slice(from, to)) / R0 / Math.max(0.05, mean(b.slice(from, to)) / (R0 + 6));
    return onPlane({
      seed,
      seconds: 200,
      map: () => new Arena(100, 100, true).pile(50, 15, 3, 200).build([nest]),
      game: { antCount: 300, rival: false },
      events: [strokeAt(5, { tool: "crayon", layer: PLANE, colony: 0, points: circle })],
      probes: [
        {
          tick: (g, dt) => (t1(g, dt), t2(g, dt)),
          summary: () => ({
            ring0to30: ratio(onRing, outside, 5, 35),
            ring30to90: ratio(onRing, outside, 35, 95),
            ring90to180: ratio(onRing, outside, 95, 185),
          }),
        },
      ],
    });
  },
  score: () => ({}),
};

/** B6: dirt poured over colony 0's largest chamber (early on, the queen's). Report only: the cave-in response is a later mechanic. */
export const fillShaft: Assay = {
  id: "fillShaft",
  title: "B6 a chamber filled with dirt: do the ants dig it out? (report)",
  target: "report only: the share of the filled cells open again 240 s later (Rajendran et al. 2026: 93 % of a collapse recovered)",
  seconds: 300,
  spec: (seed) => {
    const wasOpen: number[] = [];
    const filled: number[] = [];
    return {
      seed,
      seconds: 300,
      map: () => generateOneWorld(seed, { plane: { size: { w: 160, h: 100 } } }),
      game: { antCount: 150, rivalAnts: 20, regrow: 0 },
      events: [
        strokeAt(
          60,
          (g) => {
            const map = g.layers[CURTAIN]!;
            const ch = map.chambers;
            const nest = g.colonies[0]!.params.nest;
            // Its largest chamber; early in a game that is the queen's own, and the guards keep her, the brood and every ant clear.
            const pick = ch?.list.filter((c) => c.colony === nest).sort((a, b) => b.cells - a.cells)[0];
            const points: Pt[] = [];
            if (ch && pick)
              for (let y = pick.y0; y <= pick.y1; y++)
                for (let x = pick.x0; x <= pick.x1; x++)
                  if (ch.at(x, y) === pick.id && rockAt(map, x, y) === OPEN) {
                    wasOpen.push(x, y);
                    points.push({ x: centreX(x, y), y: centreY(y) });
                  }
            return { tool: "dirt", layer: CURTAIN, points };
          },
          (g) => {
            const map = g.layers[CURTAIN]!;
            for (let k = 0; k < wasOpen.length; k += 2)
              if (rockAt(map, wasOpen[k]!, wasOpen[k + 1]!) !== OPEN) filled.push(wasOpen[k]!, wasOpen[k + 1]!);
          },
        ),
      ],
      probes: [
        {
          tick: () => {},
          summary: (g) => {
            const map = g.layers[CURTAIN]!;
            let open = 0;
            for (let k = 0; k < filled.length; k += 2) if (rockAt(map, filled[k]!, filled[k + 1]!) === OPEN) open++;
            return {
              chamberCells: wasOpen.length / 2,
              plugCells: filled.length / 2,
              redugShare: filled.length ? open / (filled.length / 2) : NaN,
            };
          },
        },
      ],
    };
  },
  score: () => ({}),
};

/**
 * B7: a crayon fork from the hole, with the no-entry paint across the start of one branch (`paint` false: the same fork
 * bare, the control). Which branch do the ants on the fork take? Robinson et al. 2005: 71 % took the unmarked one.
 * Which branch is painted alternates with the seed.
 */
function noEntryForkAssay(paint: boolean): Assay {
  return {
    id: paint ? "noEntryFork" : "noEntryForkBare",
    title: paint
      ? "B7 a no-entry sign on one branch of a crayon fork: do followers take the other?"
      : "B7 control: the same crayon fork, no sign (report)",
    target: paint
      ? "≥ 70 % of the ants on the fork's branches on the unpainted one, 10–70 s after drawing, in ≥ 8 of 10 seeds (Robinson et al. 2005: 71 %)"
      : "report only: the share on the branch B7 would paint's other side (about half, with no sign)",
    seconds: 80,
    spec: (seed) => {
      const fork = at(50, 60);
      const stem = { a: at(50, 76), b: fork };
      const left = { a: fork, b: at(30, 35) };
      const right = { a: fork, b: at(70, 35) };
      const painted = seed % 2 === 1 ? left : right;
      const other = painted === left ? right : left;
      // The sign: across the painted branch a few cells in, from where it leaves the fork.
      const t0 = 0.12;
      const t1 = 0.3;
      const sign = along(
        { x: painted.a.x + (painted.b.x - painted.a.x) * t0, y: painted.a.y + (painted.b.y - painted.a.y) * t0 },
        { x: painted.a.x + (painted.b.x - painted.a.x) * t1, y: painted.a.y + (painted.b.y - painted.a.y) * t1 },
      );
      // Counted beyond the sign, on each branch alike.
      const beyond = (br: { a: Pt; b: Pt }) => ({
        a: { x: br.a.x + (br.b.x - br.a.x) * 0.35, y: br.a.y + (br.b.y - br.a.y) * 0.35 },
        b: br.b,
      });
      const onPainted: number[] = [];
      const onOther: number[] = [];
      const t1p = everySecond((g) => nearSegment(g, beyond(painted).a, beyond(painted).b, 1.6), onPainted);
      const t2p = everySecond((g) => nearSegment(g, beyond(other).a, beyond(other).b, 1.6), onOther);
      const events: NonNullable<RunSpec["events"]> = [
        {
          at: 5,
          kind: "call",
          run: (g: Game) => {
            const b = new Builder(g);
            for (const br of [stem, left, right]) b.apply({ tool: "crayon", layer: PLANE, colony: 0, points: along(br.a, br.b) });
            if (paint) b.apply({ tool: "noEntry", layer: PLANE, points: sign });
          },
        },
      ];
      return onPlane({
        seed,
        seconds: 80,
        // No food: the crayon is the only trail, as in B1.
        map: () => new Arena(100, 100, true).build([NEST]),
        game: { antCount: 300, rival: false },
        events,
        probes: [
          {
            tick: (g, dt) => (t1p(g, dt), t2p(g, dt)),
            summary: () => {
              const p = mean(onPainted.slice(10, 70));
              const o = mean(onOther.slice(10, 70));
              return { onPainted: p, onOther: o, otherShare: p + o > 0 ? o / (p + o) : NaN };
            },
          },
        ],
      });
    },
    score: (r): Record<string, number> => (paint ? { pass: (r.metrics.otherShare as number) >= 0.7 ? 1 : 0 } : {}),
  };
}
export const noEntryFork = noEntryForkAssay(true);
export const noEntryForkBare = noEntryForkAssay(false);

/**
 * B8: the tweezers on carriers. At 120 s every food carrier of colony 0 out on the plane, 15 or more from the hole, is
 * moved 30–60 sideways. Do they run their old vector, coming near where home would be by it, before they find home?
 * Wehner & Srinivasan 1981: displaced desert ants run the whole vector, then search (report only).
 */
export const tweezers: Assay = {
  id: "tweezers",
  title: "B8 tweezers: do carriers moved sideways run their old vector before finding home? (report)",
  target:
    "report only: the share that come within 6 of where home would be by their vector before they reach home, and the share home within 300 s",
  seconds: 420,
  spec: (seed) => {
    const moved: { i: number; gen: number; wx: number; wy: number; near: boolean; home: number }[] = [];
    let at = 0;
    let next = 0;
    return onPlane({
      seed,
      seconds: 420,
      map: () => new Arena(100, 100, true).pile(50, 25, 3, 400).build([NEST]),
      game: { antCount: 300, rival: false },
      events: [
        {
          at: 120,
          kind: "call",
          run: (g: Game) => {
            at = g.time;
            const b = new Builder(g);
            const c = g.colonies[0]!;
            const hole = c.layers[PLANE]!.nest;
            let r = (seed * 2654435761) >>> 0;
            const rnd = () => (r = (r * 1664525 + 1013904223) >>> 0) / 4294967296;
            for (let i = 0; i < c.n; i++) {
              if (!c.alive[i] || c.layer[i] !== PLANE || !c.carrying[i]) continue;
              if (Math.hypot(c.x[i]! - hole.x, c.y[i]! - hole.y) < 15) continue;
              const d = (30 + 30 * rnd()) * (c.x[i]! < 50 ? 1 : -1);
              if (!b.moveAnt(0, i, c.x[i]! + d, c.y[i]!)) continue;
              // Where home would be by its vector now: the hole, its drift, and what it was carried.
              const odo = c.odoSurf[i]!;
              moved.push({
                i,
                gen: c.gen[i]!,
                wx: hole.x + odo * c.driftSurf[i]! + c.carriedX[i]!,
                wy: hole.y + odo * c.driftSurfY[i]! + c.carriedY[i]!,
                near: false,
                home: NaN,
              });
            }
          },
        },
      ],
      probes: [
        {
          tick: (g) => {
            if (!moved.length || g.time + 1e-9 < next) return;
            next = g.time + 0.5;
            const c = g.colonies[0]!;
            for (const m of moved) {
              if (!Number.isNaN(m.home) || !c.alive[m.i] || c.gen[m.i] !== m.gen) continue;
              if (c.layer[m.i] !== PLANE) {
                m.home = g.time - at;
                continue;
              }
              if (Math.hypot(c.x[m.i]! - m.wx, c.y[m.i]! - m.wy) <= 6) m.near = true;
            }
          },
          summary: () => {
            const n = moved.length;
            const home = moved.filter((m) => m.home <= 300);
            return {
              moved: n,
              ranVector: n ? moved.filter((m) => m.near).length / n : NaN,
              home300: n ? home.length / n : NaN,
              medianHome: home.length ? home.map((m) => m.home).sort((a, b) => a - b)[Math.floor(home.length / 2)]! : NaN,
            };
          },
        },
      ],
    });
  },
  score: () => ({}),
};

// ———— Aphids (docs/aphids.md "The mechanic", PRD §78, ja-nzkg.1) ————

/** Where the assays put a clump: up the arena from the hole, as far as B2's pile. */
const CLUMP = at(50, 22);
/** A tap and a ring round it: the clump (or the sugar) the aphid assays put down, about 19 cells. */
const clumpPoints = (o: Pt) => [
  o,
  ...[0, 60, 120, 180, 240, 300].map((deg) => ({
    x: o.x + 2 * Math.cos((deg * Math.PI) / 180),
    y: o.y + 2 * Math.sin((deg * Math.PI) / 180),
  })),
];

/**
 * Food taken from the map since `base` (foodTotal and foodLeft then): what was added (honeydew, a stroke) less what still
 * lies. On an arena with no other food, honeydew taken by ants.
 */
const taken = (g: Game, base: { total: number; left: number }) => g.map.foodTotal - base.total - (g.map.foodLeft - base.left);

/** B9's clump: a far corner of the arena, about 75 units from the hole, so a few scouts take a while to come by. */
const FAR = at(15, 15);

/** B9: a clump far from the hole, on bare ground, with few ants out: when is it first found? */
export const aphidsFound: Assay = {
  id: "aphidsFound",
  title: "B9 a clump of aphids far from the hole: how soon is it first found?",
  target:
    "with the aphid plume (ja-nzkg.3), sooner than without it, seed for seed, in most seeds (Verheggen et al. 2012: L. niger scouts head toward aphid odour; docs/aphids.md). Report until the plume is built",
  seconds: 240,
  spec: (seed) => {
    let found = NaN;
    let base: { total: number; left: number } | null = null;
    return onPlane({
      seed,
      seconds: 240,
      map: () => new Arena(100, 100, true).build([NEST]),
      game: { antCount: 60, rival: false },
      events: [
        strokeAt(5, { tool: "aphids", layer: PLANE, points: clumpPoints(FAR) }, (g) => {
          base = { total: g.map.foodTotal, left: g.map.foodLeft };
        }),
      ],
      probes: [
        {
          tick: (g) => {
            if (Number.isNaN(found) && base && taken(g, base) > 0) found = g.time - 5;
          },
          summary: () => ({ firstFind: found }),
        },
      ],
    });
  },
  score: () => ({}),
};

/** B10 and its control: a clump, or the builder's sugar on the same cells, up the arena from the hole. */
function renewableAssay(tool: "aphids" | "sugar"): Assay {
  return {
    id: tool === "aphids" ? "aphidsRenewable" : "aphidsRenewableSugar",
    title:
      tool === "aphids"
        ? "B10 a clump of aphids: more food home over 5 minutes than sugar on the same cells, and a trail to it"
        : "B10 control: the builder's sugar on the clump's cells",
    target:
      tool === "aphids"
        ? "stored from the clump over 300 s > the sugar control's, seed for seed, in ≥ 8 of 10 seeds; ants on the hole–clump line ≥ 3× those on a bare line off to the side (honeydew renews; recruitment as to food: Mailleux et al. 2000, 2003; docs/aphids.md)"
        : "report: the control for aphidsRenewable",
    seconds: 320,
    spec: (seed) => {
      const stored: number[] = [];
      const onLine: number[] = [];
      const onMirror: number[] = [];
      // The line from the hole to the clump, and as long a line from the hole off to the side where nothing is: the control.
      const hole = at(NEST.x, NEST.y);
      const side = at(NEST.x + 50, NEST.y - 30);
      const tick1 = everySecond((g) => g.colonies[0]!.stored, stored);
      const tick2 = everySecond((g) => nearSegment(g, hole, CLUMP, 1.6), onLine);
      const tick3 = everySecond((g) => nearSegment(g, hole, side, 1.6), onMirror);
      return onPlane({
        seed,
        seconds: 320,
        map: () => new Arena(100, 100, true).build([NEST]),
        game: { antCount: 300, rival: false },
        events: [strokeAt(5, { tool, layer: PLANE, points: clumpPoints(CLUMP) })],
        probes: [
          {
            tick: (g, dt) => (tick1(g, dt), tick2(g, dt), tick3(g, dt)),
            summary: () => ({
              stored300: (stored[304] ?? stored[stored.length - 1] ?? 0) - (stored[4] ?? 0),
              onLine: mean(onLine.slice(120, 300)),
              onSide: mean(onMirror.slice(120, 300)),
            }),
          },
        ],
      });
    },
    score: () => ({}),
  };
}
export const aphidsRenewable = renewableAssay("aphids");
export const aphidsRenewableSugar = renewableAssay("sugar");

/**
 * B11: two colonies, 90 cells apart, with a clump put down halfway between them, far off either's home ground. Among ants in
 * contact with a rival (within 1.5 units), the share standing and fighting (the defend stance, or the fight mode) at the clump,
 * against out in the open away from both homes and the clump. The mark is tendDefend's: at the clump, more than with it off,
 * seed for seed (Gaber et al. 2024: L. niger caretakers bit an intruder more often than other ants, 90 % against 76 %).
 */
export const tendersDefend: Assay = {
  id: "tendersDefend",
  title: "B11 two colonies at a clump of aphids between them: do the ants touching it stand and fight?",
  target:
    "the share of ants in contact with a rival that fight at the clump > the same seed's with tendDefend 0, in most seeds (Gaber et al. 2024: 90 % of caretakers bit against 76 % of other ants; against rival ants: design)",
  seconds: 300,
  spec: (seed) => {
    const nests = [
      { x: 15, y: 30, r: 3 },
      { x: 105, y: 30, r: 3 },
    ];
    const clump = at(60, 30);
    const homes = nests.map((n) => at(n.x, n.y));
    const tally = { atClump: 0, fightAtClump: 0, away: 0, fightAway: 0 };
    let next = 6;
    return onPlane({
      seed,
      seconds: 300,
      map: () => new Arena(120, 60, true).build(nests),
      game: { antCount: 200, rivalAnts: 200, rival: true },
      events: [strokeAt(5, { tool: "aphids", layer: PLANE, points: clumpPoints(clump) })],
      probes: [
        {
          tick: (g) => {
            if (g.time + 1e-9 < next) return;
            next += 1;
            const [a, b] = g.colonies;
            if (!a || !b) return;
            for (const [c, o] of [
              [a, b],
              [b, a],
            ] as const)
              for (let i = 0; i < c.n; i++) {
                if (!c.alive[i] || !onLayer(g, c, i, PLANE)) continue;
                const x = c.x[i]!;
                const y = c.y[i]!;
                let touch = false;
                for (let j = 0; j < o.n && !touch; j++)
                  touch =
                    !!o.alive[j] && onLayer(g, o, j, PLANE) && Math.abs(o.x[j]! - x) < 1.5 && Math.hypot(o.x[j]! - x, o.y[j]! - y) < 1.5;
                if (!touch) continue;
                const fights = c.stanceOf(i) === "defend" || MODES[c.mode[i]!] === "fight";
                if (Math.hypot(x - clump.x, y - clump.y) <= 4) {
                  tally.atClump++;
                  if (fights) tally.fightAtClump++;
                } else if (homes.every((h) => Math.hypot(x - h.x, y - h.y) > 20) && Math.hypot(x - clump.x, y - clump.y) > 10) {
                  tally.away++;
                  if (fights) tally.fightAway++;
                }
              }
          },
          summary: () => ({
            contactsAtClump: tally.atClump,
            fightShareAtClump: tally.atClump ? tally.fightAtClump / tally.atClump : NaN,
            contactsAway: tally.away,
            fightShareAway: tally.away ? tally.fightAway / tally.away : NaN,
          }),
        },
      ],
    });
  },
  score: () => ({}),
};

export const BUILDER_ASSAYS: Assay[] = [
  crayonLine,
  wall,
  rain,
  lateSugar,
  crayonRing,
  fillShaft,
  noEntryFork,
  noEntryForkBare,
  tweezers,
  aphidsFound,
  aphidsRenewable,
  aphidsRenewableSugar,
  tendersDefend,
];
