// The builder's assays B1–B6 (docs/builder.md "The mechanic", PRD §70, ja-kjj8.1): what today's ants do when a child changes
// their world. Each runs on one world, as the page plays, with a scripted builder stroke applied between ticks (Builder,
// builder.ts). They measure the ants; nothing here changes how an ant behaves.
//
//   B1 crayonLine  a crayon line out from the hole across empty ground, against its mirror image undrawn
//   B2 wall        a rock wall dropped across an established trail: does food come home again by another way?
//   B3 rain        rain along an established trail: how far does delivery dip, and how fast does it come back? (report)
//   B4 lateSugar   sugar dropped beside a crumb pile the colony already works (report; Beckers et al. 1990)
//   B5 crayonRing  a crayon circle round the hole: how long do ants stay on it? (report; Butterfield et al. 2025)
//   B6 fillShaft   dirt poured over the colony's largest chamber: do the ants dig it out? (report; Rajendran et al. 2026)

import { Builder, type Stroke } from "./builder.ts";
import type { Game } from "./game.ts";
import { centreX, centreY } from "./hex.ts";
import { generateOneWorld } from "./oneWorld.ts";
import { CURTAIN, PLANE } from "./vocab.ts";
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
    "delivery 150–270 s after the wall ≥ 50 % of its rate before, in ≥ 8 of 10 seeds (design mark; Dussutour et al. 2009: 18 of 21 colonies moved to the other branch). Without a wall the same span runs at ≈ 1.0× (PRD §70)",
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

export const BUILDER_ASSAYS: Assay[] = [crayonLine, wall, rain, lateSugar, crayonRing, fillShaft];
