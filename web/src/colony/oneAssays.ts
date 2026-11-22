// The whole-game and one-world assays (docs/refactor.md S3.6, ja-fnd.4.6): G1, S1, F1 and R1, on the harness (harness.ts).
// ONE_ASSAYS, which also reruns the arena assays on the plane, is in experiment.ts.

import { type Colony, HOLE_SIGHT, type HoleCell, type Layer, LIFESPAN, PI_DRIFT, PLANE, planeMoundReach } from "./colony.ts";
import { piSpanOf } from "./homing.ts";
import { EXPLORE, MODES } from "./vocab.ts";
import { Game } from "./game.ts";
import { CELL, cellOf, centreX, centreY, nx, ny, R } from "./hex.ts";
import { generateOneWorld } from "./oneWorld.ts";
import { encode } from "./save.ts";
import { localResponses } from "./responses.ts";
import { dropFood, heapPlane, mulberry32, rockAt, OPEN, type Nest, type WorldMap } from "./world.ts";

import { type Assay, type Event, mean, gateProbe, heldProbe, sideName, type Probe, type RunSpec } from "./harness.ts";

/**
 * G1 — the one-world game (docs/one-world.md §6, U6): generateOneWorld(seed), 600 + 600 ants, 10 minutes, as G is for
 * the side view, with its bound (A7): no colony with more than 2 foragers holding food over 120 s at any 10-s sample,
 * counted on both layers (`maxHeldPlane`: those on the plane). Reported beside it: food carried down the holes, births,
 * crossings up and down, porter trips and porters holding food over 120 s, per colony.
 */
export const game1: Assay = {
  id: "game1",
  title: "G1 the one-world game (with A7: foragers holding food)",
  target:
    "≤ 2 foragers holding food over 120 s per colony at any 10-s sample, both layers (the side view's slow/side.test bound, now G1's); food carried down, births, crossings and porters reported",
  seconds: 600,
  spec: (seed) => ({
    seed,
    seconds: 600,
    map: (s) => generateOneWorld(s),
    colonies: [{ antCount: 600 }, { antCount: 600 }],
    probes: [heldProbe(PLANE, "Plane"), gateProbe()],
  }),
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
      m[`${side}.heldMean`] = r.metrics[`${side}.heldMean`];
    });
    const worst = both("maxHeld");
    return { ...m, maxHeld: worst, maxHeldPlane: both("maxHeldPlane"), maxPorting: both("maxPorting"), pass: worst <= 2 ? 1 : 0 };
  },
};

/** Compare an explicit chamber destination without changing surface homing. */
function gameRoyalRouting(id: string, title: string, after: number): Assay {
  return {
    ...game1,
    id,
    title,
    spec(seed) {
      const base = game1.spec(seed);
      let player: Colony | undefined;
      let royalChoices = 0;
      return {
        ...base,
        events: [
          ...(base.events ?? []),
          {
            at: 0,
            kind: "call",
            run(game) {
              player = game.player;
            },
          },
        ],
        sides: {
          colony: { deliveryLane: 1 },
          responses: {
            ...localResponses,
            carry(t, draw) {
              // Elapsed time since pickup is an assay input here; the carry policy schema is unchanged.
              const aged = after === 0 || (player !== undefined && player.since[player.ti] >= after);
              if (aged && t.carrying === "food" && (t.place === "tunnel" || t.place === "chamber") && t.deliveryTarget === "none") {
                royalChoices++;
                return "to royal";
              }
              return localResponses.carry(t, draw);
            },
          },
        },
        probes: [...(base.probes ?? []), { tick() {}, summary: () => ({ royalChoices }) }],
      };
    },
  };
}

export const gameRoyalDelivery = gameRoyalRouting(
  "gameRoyalDelivery",
  "G1 with explicit royal delivery after sensing an own tunnel or chamber",
  0,
);
export const gameRoyalRecovery = gameRoyalRouting(
  "gameRoyalRecovery",
  "G1 with explicit royal delivery after holding food for 60 seconds",
  60,
);

/** The open ground of a plane joined to a hole's cell, as a flag per cell (x + y × width): ground a forager can have walked to. */
function joinedOpen(plane: WorldMap, hc: HoleCell): Uint8Array {
  const { w, h } = plane.size;
  const joined = new Uint8Array(w * h);
  const queue = [hc.px + hc.py * w];
  joined[queue[0]] = 1;
  for (let k = 0; k < queue.length; k++) {
    const x = queue[k] % w;
    const y = Math.floor(queue[k] / w);
    for (let d = 0; d < 6; d++) {
      const tx = nx(x, y, d);
      const ty = ny(y, d);
      if (tx < 0 || ty < 0 || tx >= w || ty >= h || joined[tx + ty * w] || rockAt(plane, tx, ty) !== OPEN) continue;
      joined[tx + ty * w] = 1;
      queue.push(tx + ty * w);
    }
  }
  return joined;
}

/** S1's trip lengths (cells walked out on the plane), and the carriers set down at each, per seed. */
export const S1_TRIPS = [100, 200, 400, 600] as const;
export const S1_PER_TRIP = 40;
/** S1: the pellets on the player's mound at the start: about what a colony has out 5 minutes into G1 (800 by 300 s on seed 5). */
export const S1_MOUND = 1000;

/**
 * S1 — lost carriers find their hole (ja-lp4.11.1; docs/nest-search.md, PRD §56). On one world's default plane
 * (generateOneWorld(seed)), S1_PER_TRIP old carriers of the player per trip length T in S1_TRIPS are set down at t = 0
 * with food, homing, their vector as a trip of T out of their own hole leaves it: odoSurf = T, each drift part drawn as
 * the game draws it at the hole (Gaussian, σ = PI_DRIFT/√2, so the miss is σ = 0.1/√2 × T per axis). Each stands at its
 * vector's end (the hole + T × drift, or with piErrorLaw 1 + piSpanOf(T out) × drift: the search's origin), so its search begins there; a draw whose end is off the plane
 * (within 2 of an edge), in rock or in a pocket of open ground walled off from the hole is drawn again. Every other ant is young (stays in), with no scouts, and a carrier home is made young
 * too, so the carriers search alone. The player's mound starts as the game would have heaped S1_MOUND pellets.
 * Per trip (`t400.home120` …): the share home (down its own hole) within 120 s and within 600 s, the
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
      const { w } = plane.size;
      const joined = joinedOpen(plane, hc);
      for (const k of game.colonies) for (let i = 0; i < k.n; i++) if (k.alive[i]) k.age[i] = 0.05 * LIFESPAN;
      // The mound as the game heaps it (#carryOut, #dropPlane): pellet k goes 2 + reach × √u out on a heading drawn for it.
      const holes = c.holeCells.map((h) => ({ x: h.px, y: h.py }));
      for (let k = 0; k < S1_MOUND; k++) {
        const a = rng() * 2 * Math.PI;
        const r = 2 + planeMoundReach(k) * Math.sqrt(rng());
        cellOf(hx + r * Math.cos(a), hy + r * Math.sin(a));
        heapPlane(plane, CELL[0], CELL[1], holes);
      }
      c.loadState({ fields: {}, private: { heaped: encode(S1_MOUND) } });
      for (let i = 0; i < n; i++) {
        const T = S1_TRIPS[Math.floor(i / S1_PER_TRIP)];
        // A trip of T straight out: T walked, T out (piErrorLaw 1 scales the drift by the distance out).
        const span = piSpanOf(c.params.piErrorLaw, c.params.piErrorAt, T, T);
        let dx = 0;
        let dy = 0;
        let bx = 0;
        let by = 0;
        for (;;) {
          dx = (gauss() * PI_DRIFT) / Math.SQRT2;
          dy = (gauss() * PI_DRIFT) / Math.SQRT2;
          bx = hx + span * dx;
          by = hy + span * dy;
          if (bx < 2 || by < 2 || bx > xMax || by > yMax) continue;
          cellOf(bx, by);
          if (joined[CELL[0] + CELL[1] * w]) break;
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
        c.reachSurf[i] = T;
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
            // Young from now on, it stays in: carriers home don't go out again to lay trails the searchers would meet.
            c.age[i] = 0.05 * LIFESPAN;
            // #crossDown puts it at that hole's cell in the curtain.
            if (Math.abs(c.x[i] - centreX(hc.col, hc.row)) < 1e-3 && Math.abs(c.y[i] - centreY(hc.row)) < 1e-3) homeAt[i] = game.time;
            else wrong[i] = 1;
            continue;
          }
          if (!sample) continue;
          const ex = c.x[i] - ox[i];
          const ey = c.y[i] - oy[i];
          sx[i] = sx[i] + ex;
          sy[i] = sy[i] + ey;
          sd[i] = sd[i] + Math.hypot(ex, ey);
          samples[i] = samples[i] + 1;
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
            const t = homeAt[i];
            if (t <= 120) n120++;
            if (t <= game.time) {
              n600++;
              times.push(t);
            }
            nWrong += wrong[i];
            const s = samples[i];
            if (s >= 10) {
              centres.push(Math.hypot(sx[i] / s, sy[i] / s));
              spreads.push(sd[i] / s);
            }
          }
          times.sort((a, b) => a - b);
          const tag = `t${T}`;
          m[`${tag}.home120`] = n120 / k;
          m[`${tag}.home600`] = n600 / k;
          m[`${tag}.median`] = times.length ? times[Math.floor((times.length - 1) / 2)] : NaN;
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
      game: { regrow: 0 },
      colonies: [
        { antCount: n + 20, colony: { scoutRate: 0, raidScout: 0 } },
        { antCount: 10, colony: { scoutRate: 0, raidScout: 0 } },
      ],
      events: [{ at: 0, kind: "call", run: setUp }],
      probes: [probe],
    };
  },
  score: () => ({}),
};

/** F1: foragers set down per seed, each with its own spot. */
export const F1_ANTS = 40;
/** F1: the spot's nearest and farthest from the hole (cells). */
export const F1_NEAR = 40;
export const F1_FAR = 80;
/** F1: seconds a forager has to get to its spot's sight. */
export const F1_SECONDS = 30;

/**
 * F1's run (forage1), with hooks for an assay built on it (M1, memory1): `after` runs once F1's foragers are set down, with their
 * spots and the hole; `probes` are added beside F1's own. F1 itself passes none, so its run is as it was.
 */
function f1Spec(
  seed: number,
  hooks: {
    after?(game: Game, spotX: Float64Array, spotY: Float64Array, hx: number, hy: number): void;
    probes?(spotX: Float64Array, spotY: Float64Array): Probe[];
    events?: Event[];
  } = {},
): RunSpec {
  const n = F1_ANTS;
  const spotX = new Float64Array(n);
  const spotY = new Float64Array(n);
  const startX = new Float64Array(n);
  const startY = new Float64Array(n);
  const lastX = new Float64Array(n);
  const lastY = new Float64Array(n);
  const walked = new Float64Array(n);
  const reachT = new Float64Array(n).fill(Infinity);
  const reachPath = new Float64Array(n);
  const fed = new Uint8Array(n);
  const setUp = (game: Game): void => {
    const rng = mulberry32(seed * 6101 + 17);
    const gauss = (): number => Math.sqrt(-2 * Math.log(1 - rng())) * Math.cos(2 * Math.PI * rng());
    const plane = game.world!.plane;
    const c = game.player;
    const hc = c.holeCells[c.params.nest] as HoleCell;
    const hx = centreX(hc.px, hc.py);
    const hy = centreY(hc.py);
    const { w } = plane.size;
    const joined = joinedOpen(plane, hc);
    const xMax = plane.size.w - 2;
    const yMax = plane.size.h * R - 2;
    const holes = game.colonies.flatMap((k) => k.holeCells.map((h) => ({ x: centreX(h.px, h.py), y: centreY(h.py) })));
    for (const k of game.colonies) for (let i = 0; i < k.n; i++) if (k.alive[i]) k.age[i] = 0.05 * LIFESPAN;
    // No food on the plane: the walk to the spot is not cut short by food met on the way (a pile within 80 cells of the hole took 43 % of the foragers' trips).
    for (let y = 0; y < plane.size.h; y++) for (let x = 0; x < plane.size.w; x++) plane.food.set(x, y, 0);
    plane.foodLeft = 0;
    for (let i = 0; i < n; i++) {
      let sx = 0;
      let sy = 0;
      let a = 0;
      for (;;) {
        a = rng() * 2 * Math.PI;
        const d = F1_NEAR + rng() * (F1_FAR - F1_NEAR);
        sx = hx + d * Math.cos(a);
        sy = hy + d * Math.sin(a);
        if (sx < 2 || sy < 2 || sx > xMax || sy > yMax) continue;
        if (holes.some((h) => Math.hypot(sx - h.x, sy - h.y) < 2 * HOLE_SIGHT)) continue;
        cellOf(sx, sy);
        if (!joined[CELL[0] + CELL[1] * w]) continue;
        // And the straight line out to it is open ground: a forager that found it walked there; F1 asks about its memory, not
        // about getting round rock (an explorer follows no wall).
        let clear = true;
        for (let t = 0; t < 1 && clear; t += 0.5 / Math.hypot(sx - hx, sy - hy)) {
          cellOf(hx + t * (sx - hx), hy + t * (sy - hy));
          clear = rockAt(plane, CELL[0], CELL[1]) === OPEN;
        }
        if (clear) break;
      }
      spotX[i] = sx;
      spotY[i] = sy;
      // Set down a few cells out of the hole, on the way to the spot's side if that ground is open (else at the hole).
      let px = hx + 3 * Math.cos(a);
      let py = hy + 3 * Math.sin(a);
      cellOf(px, py);
      if (!joined[CELL[0] + CELL[1] * w]) {
        px = hx;
        py = hy;
      }
      startX[i] = px;
      startY[i] = py;
      lastX[i] = px;
      lastY[i] = py;
      c.age[i] = 0.5 * LIFESPAN;
      c.putAnt(i, PLANE, px, py);
      c.carrying[i] = 0;
      c.mode[i] = MODES.indexOf("explore");
      c.heading[i] = rng() * 2 * Math.PI;
      c.odoSurf[i] = 3;
      c.reachSurf[i] = 3;
      c.driftSurf[i] = (gauss() * PI_DRIFT) / Math.SQRT2;
      c.driftSurfY[i] = (gauss() * PI_DRIFT) / Math.SQRT2;
      // The find: a straight walk out to the spot, with a drift of its own, as the game draws one at the hole.
      const dx = (gauss() * PI_DRIFT) / Math.SQRT2;
      const dy = (gauss() * PI_DRIFT) / Math.SQRT2;
      // Where its hole was believed to be on that trip, the plane's nest plus its drift: the find's offset from it.
      const nest = plane.nests[c.params.nest] as Nest;
      const out = Math.hypot(sx - hx, sy - hy);
      const odo = piSpanOf(c.params.piErrorLaw, c.params.piErrorAt, out, out);
      rememberAt(c, i, sx - (nest.x + odo * dx), sy - (nest.y + odo * dy));
    }
    hooks.after?.(game, spotX, spotY, hx, hy);
  };
  const probe: Probe = {
    tick(game) {
      const c = game.player;
      for (let i = 0; i < n; i++) {
        if (c.layer[i] !== PLANE) continue;
        const x = c.x[i];
        const y = c.y[i];
        if (c.carrying[i]) fed[i] = 1;
        if (reachT[i] === Infinity) {
          walked[i] = walked[i] + Math.hypot(x - lastX[i], y - lastY[i]);
          if (Math.hypot(x - spotX[i], y - spotY[i]) < HOLE_SIGHT) {
            reachT[i] = game.time;
            reachPath[i] = walked[i];
          }
        }
        lastX[i] = x;
        lastY[i] = y;
      }
    },
    summary(game) {
      const m: Record<string, number> = {};
      const c = game.player;
      const left: number[] = [];
      for (let i = 0; i < n; i++) if (reachT[i] === Infinity) left.push(Math.hypot(c.x[i] - spotX[i], c.y[i] - spotY[i]));
      left.sort((a, b) => a - b);
      const times: number[] = [];
      const ratios: number[] = [];
      const paths: number[] = [];
      for (let i = 0; i < n; i++) {
        if (reachT[i] === Infinity) continue;
        times.push(reachT[i]);
        // To its sight: the straight line is the distance from where it was set down to the spot, less the sight.
        ratios.push(reachPath[i] / Math.max(1, Math.hypot(spotX[i] - startX[i], spotY[i] - startY[i]) - HOLE_SIGHT));
        paths.push(reachPath[i]);
      }
      const med = (v: number[]): number => (v.length ? v.sort((a, b) => a - b)[Math.floor((v.length - 1) / 2)] : NaN);
      m.reach = times.length / n;
      m.median = med(times);
      m.ratio = med(ratios);
      m.walked = med(paths);
      // Those that did not get there: how many picked up food on the way (other food on the plane), and how far from the spot the rest were at the end.
      m.fed = fed.reduce((a, b) => a + b, 0) / n;
      m.short = left.length ? left[Math.floor((left.length - 1) / 2)] : NaN;
      m.pass = m.reach >= 0.8 && m.ratio < 1.5 ? 1 : 0;
      return m;
    },
  };
  return {
    seed,
    seconds: F1_SECONDS,
    map: (s) => generateOneWorld(s),
    game: { regrow: 0 },
    colonies: [
      { antCount: n + 20, colony: { scoutRate: 0, raidScout: 0 } },
      { antCount: 10, colony: { scoutRate: 0, raidScout: 0 } },
    ],
    events: [{ at: 0, kind: "call", run: setUp }, ...(hooks.events ?? [])],
    probes: [probe, ...(hooks.probes?.(spotX, spotY) ?? [])],
  };
}

/**
 * F1 — foragers go back to where they found food (ja-lp4.15.1; docs/forager-trips.md §3, PRD §58). On one world's default
 * plane (generateOneWorld(seed)), F1_ANTS old foragers of the player are each set down just out of their hole, empty-
 * jawed and exploring on a fresh trip (odoSurf 3, a fresh drift as #crossUp draws it, a heading at random), as if sent out
 * again after a find at a known spot: a spot F1_NEAR to F1_FAR cells from the hole, on open ground joined to the hole
 * (as S1's origins: no rock walled off, at least 2 from an edge, outside every hole's sight) and in a straight, open line
 * from the hole (an explorer follows no wall: F1 asks about its memory, not about getting round rock). The plane has no food (the
 * spot's is gone, and the walk is not cut short by a pile met on the way: in a first run with the world's own food 43 % of
 * the foragers picked some up). With `siteFidelity` on, each ant remembers the spot as it would from its find
 * (its straight walk out, a drift drawn for that trip: what its home vector said at pickup); off, it knows nothing of it.
 * Every other ant is young and stays in, with no scouts. 30 s. Reported: `reach` (the share that got within HOLE_SIGHT of
 * the spot within F1_SECONDS), `median` (seconds, of those), `ratio` (the median of walked ÷ straight: the path walked to
 * get there over the straight line from where it was set down to the spot's sight), `walked` (the median path, cells),
 * `fed` (the share that picked up food on the way: other food on the plane) and `short` (the median distance from its
 * spot, at the end, of those that did not reach it).
 * Target: reach ≥ 80 % with ratio under 1.5 (design marks).
 */
export const forage1: Assay = {
  id: "f1",
  title: "F1 foragers go back to their last find (one world)",
  target: "≥ 80 % of foragers within sight of their spot in 30 s, walking under 1.5 times the straight line",
  seconds: F1_SECONDS,
  spec: (seed) => f1Spec(seed),
  score: () => ({}),
};

/** M1: the trail's length (cells, from 3 out of the hole), the level it is kept at, and the least angle between it and a counted ant's spot. */
export const M1_TRAIL = 60;
export const M1_LEVEL = 2;
export const M1_APART = Math.PI / 3;

/**
 * M1 — memory over trail (ja-ykmu.1; docs/steering.md §3: *Lasius niger* foragers that have visited a feeder once follow
 * their memory over a conflicting trail, 82–100 % in Grüter, Czaczkes & Ratnieks 2011, unverified). F1's foragers, each with
 * its own remembered spot (with `siteFidelity` on; off, they know nothing of it), and a strong food trail (kept at M1_LEVEL)
 * running M1_TRAIL cells out of the hole the way farthest from their spots, along open ground; no food anywhere. Counted: the
 * foragers whose spot is at least M1_APART from the trail's direction. Reported: `memory`, the share that reach their spot's
 * sight first; `trail`, the share the trail takes first (to its end, or 20 cells along it within 3 of it); `counted`.
 * Target: with memory on, `memory` ≥ 0.8 (Grüter et al. 2011, unverified).
 */
export const memory1: Assay = {
  id: "m1",
  title: "M1 memory over trail: foragers with a remembered find, a strong trail the other way (one world)",
  target:
    "with memory on: ≥ 80 % reach their own spot before the trail takes them (Grüter et al. 2011: 82–100 %, unverified); memory and trail shares reported",
  seconds: F1_SECONDS,
  spec: (seed) => {
    const n = F1_ANTS;
    const counted = new Uint8Array(n);
    const first = new Uint8Array(n); // 0 neither yet, 1 its spot, 2 the trail
    const cells: number[] = [];
    let hx = 0;
    let hy = 0;
    let ux = 1;
    let uy = 0;
    const keep = (game: Game): void => {
      const ph = (game.player.layers[PLANE] as Layer).ph;
      for (let k = 0; k < cells.length; k += 2) {
        const now = ph.fields.food.get(cells[k] as number, cells[k + 1] as number);
        if (now < M1_LEVEL) ph.depositCell("food", cells[k] as number, cells[k + 1] as number, M1_LEVEL - now);
      }
    };
    const after = (game: Game, spotX: Float64Array, spotY: Float64Array, x0: number, y0: number): void => {
      hx = x0;
      hy = y0;
      const plane = game.world!.plane;
      const spots = Array.from({ length: n }, (_, i) => Math.atan2((spotY[i] as number) - y0, (spotX[i] as number) - x0));
      let best = -1;
      let bestA = 0;
      for (let k = 0; k < 72; k++) {
        const a = (k / 72) * 2 * Math.PI;
        let open = true;
        for (let d = 3; d <= M1_TRAIL && open; d += 0.5) {
          const x = x0 + d * Math.cos(a);
          const y = y0 + d * Math.sin(a);
          if (x < 2 || y < 2 || x > plane.size.w - 2 || y > plane.size.h * R - 2) open = false;
          else {
            cellOf(x, y);
            open = rockAt(plane, CELL[0], CELL[1]) === OPEN;
          }
        }
        if (!open) continue;
        const apart = Math.min(...spots.map((s) => angleBetween(s, a)));
        if (apart > best) {
          best = apart;
          bestA = a;
        }
      }
      ux = Math.cos(bestA);
      uy = Math.sin(bestA);
      for (let d = 3; d <= M1_TRAIL; d += 0.5) {
        cellOf(x0 + d * ux, y0 + d * uy);
        if (cells.at(-2) !== CELL[0] || cells.at(-1) !== CELL[1]) cells.push(CELL[0], CELL[1]);
      }
      for (let i = 0; i < n; i++) counted[i] = best >= 0 && angleBetween(spots[i] as number, bestA) >= M1_APART ? 1 : 0;
      keep(game);
    };
    const events: Event[] = Array.from({ length: F1_SECONDS }, (_, k) => ({ at: k + 1, kind: "call" as const, run: keep }));
    const probes = (spotX: Float64Array, spotY: Float64Array): Probe[] => [
      {
        tick(game) {
          const c = game.player;
          for (let i = 0; i < n; i++) {
            if (!counted[i] || first[i] || c.layer[i] !== PLANE) continue;
            const x = c.x[i];
            const y = c.y[i];
            if (Math.hypot(x - (spotX[i] as number), y - (spotY[i] as number)) < HOLE_SIGHT) first[i] = 1;
            else {
              const along = (x - hx) * ux + (y - hy) * uy;
              const off = Math.abs((x - hx) * uy - (y - hy) * ux);
              if ((along >= 20 && off <= 3) || Math.hypot(x - (hx + M1_TRAIL * ux), y - (hy + M1_TRAIL * uy)) < HOLE_SIGHT) first[i] = 2;
            }
          }
        },
        summary() {
          const k = counted.reduce((a, b) => a + b, 0);
          let mem = 0;
          let trail = 0;
          for (let i = 0; i < n; i++) {
            if (!counted[i]) continue;
            if (first[i] === 1) mem++;
            else if (first[i] === 2) trail++;
          }
          return { counted: k, memory: k ? mem / k : NaN, trail: k ? trail / k : NaN };
        },
      },
    ];
    return f1Spec(seed, { after, probes, events });
  },
  score: (r): Record<string, number> => (Number.isFinite(r.metrics.memory) ? { pass: (r.metrics.memory as number) >= 0.8 ? 1 : 0 } : {}),
};

/** R1: foragers that walk out to the pile in a pocket, per seed. */
export const R1_ANTS = 40;
/** R1: the pocket's nearest and farthest from the hole (cells, straight), and how much longer the way round is than the straight line (at least). */
export const R1_NEAR = 15;
export const R1_FAR = 60;
export const R1_DETOUR = 1.8;
/** R1: seconds a game runs, and the seconds a pocket carrier has to get home for its pickup to count (a pickup after R1_SECONDS − R1_WAIT is not scored). */
export const R1_SECONDS = 420;
export const R1_WAIT = 300;
/** R1: food on the pile (cells of one: each pickup takes one). */
export const R1_PILE = 200;

/**
 * The way round over open ground from `source`'s cell, per cell (x + y × width): 6 neighbours a cell, -1 = not joined to it.
 * Each step costs 1, and `rimCost` more into a cell with rock beside it (0: the steps, a way round in cells; more: a way that keeps off rock faces).
 */
function geodesic(plane: WorldMap, source: number, rimCost = 0): Int32Array {
  const { w, h } = plane.size;
  const dist = new Int32Array(w * h).fill(-1);
  const rim = (x: number, y: number): boolean => {
    for (let d = 0; d < 6; d++) {
      const tx = nx(x, y, d);
      const ty = ny(y, d);
      if (tx < 0 || ty < 0 || tx >= w || ty >= h || rockAt(plane, tx, ty) !== OPEN) return true;
    }
    return false;
  };
  const buckets: number[][] = [[source]];
  dist[source] = 0;
  const settled = new Uint8Array(w * h);
  for (let dd = 0; dd < buckets.length; dd++) {
    const b = buckets[dd];
    if (!b) continue;
    for (let k = 0; k < b.length; k++) {
      const at = b[k];
      if (settled[at] || dist[at] !== dd) continue;
      settled[at] = 1;
      const x = at % w;
      const y = Math.floor(at / w);
      for (let d = 0; d < 6; d++) {
        const tx = nx(x, y, d);
        const ty = ny(y, d);
        if (tx < 0 || ty < 0 || tx >= w || ty >= h || rockAt(plane, tx, ty) !== OPEN) continue;
        const nd = dd + 1 + (rimCost > 0 && rim(tx, ty) ? rimCost : 0);
        const cur = dist[tx + ty * w];
        if (cur >= 0 && cur <= nd) continue;
        dist[tx + ty * w] = nd;
        (buckets[nd] ??= []).push(tx + ty * w);
      }
    }
  }
  return dist;
}

/**
 * R1 — pocket carriers get home (ja-lp4.16.2; docs/route-memory.md "Assays", PRD §59). On one world's default plane
 * (generateOneWorld(seed)) the pockets are the open cells R1_NEAR to R1_FAR cells (straight) from the player's hole, joined
 * to it, outside every hole's sight, with no clear straight line to it and a way round (the open ground's steps) at least
 * R1_DETOUR times the straight distance. The plane's food is cleared and one pile of R1_PILE put on a pocket cell drawn
 * for the seed (a seed with no pocket reports `pockets` 0 and scores nothing). R1_ANTS old foragers of the player are set
 * down three steps out of the hole along that way, exploring on a fresh trip (odoSurf 3, a fresh drift as #crossUp draws it), and walk out to the pile
 * by the way round: the probe turns each toward the next cells of the way round, every tick, until it carries food, so
 * the walk out is a real path (no teleporting) and from the pickup it is the ant's own steering that carries it home. Every
 * other ant is young and stays in, with no scouts; an ant that is home is made young too. R1_SECONDS. Per pocket pickup
 * (one before R1_SECONDS − R1_WAIT): the seconds from pickup to going down its own hole. Reported: `pockets` (cells),
 * `dist` (the pile's straight distance from the hole), `way` (its way round), `picked` (pickups scored), `home120` and
 * `home300` (the shares of them home within 120 and 300 s), `median` (seconds, of those home), `ratio` (the median of
 * walked ÷ the way round from the pickup cell, of those home) and `held` (the share still on the plane holding food at
 * the end) and `wrong` (pickups that went down another hole). Target (design: no paper measures a pocket detour): home300 ≥ 95 % and ratio ≤ 4.
 */
export const route1: Assay = {
  id: "r1",
  title: "R1 pocket carriers get home (one world)",
  target: "≥ 95 % of pocket pickups home within 300 s, median walked ÷ the way round at most 4",
  seconds: R1_SECONDS,
  spec: (seed) => {
    const n = R1_ANTS;
    const pickT = new Float64Array(n).fill(Infinity);
    const homeAt = new Float64Array(n).fill(Infinity);
    const wrong = new Uint8Array(n);
    const walked = new Float64Array(n);
    const lastX = new Float64Array(n);
    const lastY = new Float64Array(n);
    const wayHome = new Float64Array(n);
    const done = new Uint8Array(n);
    let pockets = 0;
    let pileDist = NaN;
    let pileWay = NaN;
    let toPile: Int32Array | null = null;
    let fromHole: Int32Array | null = null;
    const setUp = (game: Game): void => {
      const rng = mulberry32(seed * 8209 + 31);
      const gauss = (): number => Math.sqrt(-2 * Math.log(1 - rng())) * Math.cos(2 * Math.PI * rng());
      const plane = game.world!.plane;
      const c = game.player;
      const hc = c.holeCells[c.params.nest] as HoleCell;
      const hx = centreX(hc.px, hc.py);
      const hy = centreY(hc.py);
      const { w, h } = plane.size;
      for (const k of game.colonies) for (let i = 0; i < k.n; i++) if (k.alive[i]) k.age[i] = 0.05 * LIFESPAN;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) plane.food.set(x, y, 0);
      plane.foodLeft = 0;
      fromHole = geodesic(plane, hc.px + hc.py * w);
      const holes = game.colonies.flatMap((k) => k.holeCells.map((q) => ({ x: centreX(q.px, q.py), y: centreY(q.py) })));
      const pocket: number[] = [];
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          const g = fromHole[x + y * w];
          if (g < 0) continue;
          const px = centreX(x, y);
          const py = centreY(y);
          const d = Math.hypot(px - hx, py - hy);
          if (d < R1_NEAR || d > R1_FAR || g < R1_DETOUR * d) continue;
          if (holes.some((q) => Math.hypot(px - q.x, py - q.y) < 2 * HOLE_SIGHT)) continue;
          let clear = true;
          for (let t = 0; t < 1 && clear; t += 0.5 / d) {
            cellOf(hx + t * (px - hx), hy + t * (py - hy));
            clear = rockAt(plane, CELL[0], CELL[1]) === OPEN;
          }
          if (!clear) pocket.push(x + y * w);
        }
      pockets = pocket.length;
      if (pockets === 0) return;
      const cell = pocket[Math.floor(rng() * pockets)];
      const pxc = centreX(cell % w, Math.floor(cell / w));
      const pyc = centreY(Math.floor(cell / w));
      pileDist = Math.hypot(pxc - hx, pyc - hy);
      pileWay = fromHole[cell];
      dropFood(plane, pxc, pyc, R1_PILE);
      toPile = geodesic(plane, cell, 4);
      // Set down three steps out of the hole along the way round (at its cell, an explorer would go straight back down).
      let sx = hc.px;
      let sy = hc.py;
      for (let s = 0; s < 3; s++) {
        let best = (toPile as Int32Array)[sx + sy * w];
        let bx = sx;
        let by = sy;
        for (let d = 0; d < 6; d++) {
          const tx = nx(sx, sy, d);
          const ty = ny(sy, d);
          if (tx < 0 || ty < 0 || tx >= w || ty >= h) continue;
          const g = (toPile as Int32Array)[tx + ty * w];
          if (g >= 0 && g < best) {
            best = g;
            bx = tx;
            by = ty;
          }
        }
        sx = bx;
        sy = by;
      }
      const ox = centreX(sx, sy);
      const oy = centreY(sy);
      for (let i = 0; i < n; i++) {
        c.age[i] = 0.5 * LIFESPAN;
        c.putAnt(i, PLANE, ox, oy);
        c.carrying[i] = 0;
        c.mode[i] = MODES.indexOf("explore");
        c.heading[i] = Math.atan2(oy - hy, ox - hx);
        c.odoSurf[i] = 3;
        c.reachSurf[i] = 3;
        c.driftSurf[i] = (gauss() * PI_DRIFT) / Math.SQRT2;
        c.driftSurfY[i] = (gauss() * PI_DRIFT) / Math.SQRT2;
        lastX[i] = ox;
        lastY[i] = oy;
      }
    };
    const probe: Probe = {
      tick(game) {
        const c = game.player;
        const hc = c.holeCells[c.params.nest] as HoleCell;
        const plane = game.world!.plane;
        const { w } = plane.size;
        if (!toPile || !fromHole) return;
        for (let i = 0; i < n; i++) {
          if (done[i]) continue;
          if (c.layer[i] !== PLANE) {
            done[i] = 1;
            c.age[i] = 0.05 * LIFESPAN;
            if (pickT[i] === Infinity) continue;
            if (Math.abs(c.x[i] - centreX(hc.col, hc.row)) < 1e-3 && Math.abs(c.y[i] - centreY(hc.row)) < 1e-3) homeAt[i] = game.time;
            else wrong[i] = 1;
            continue;
          }
          const x = c.x[i];
          const y = c.y[i];
          if (c.carrying[i]) {
            if (pickT[i] === Infinity) {
              pickT[i] = game.time;
              cellOf(x, y);
              wayHome[i] = Math.max(1, fromHole[CELL[0] + CELL[1] * w] ?? 1);
            } else walked[i] = walked[i] + Math.hypot(x - lastX[i], y - lastY[i]);
          } else if (pickT[i] === Infinity) {
            // On its way out: toward the cell three steps on along the way round to the pile.
            cellOf(x, y);
            let cx = CELL[0];
            let cy = CELL[1];
            for (let s = 0; s < 2; s++) {
              let best = toPile[cx + cy * w];
              let bx = cx;
              let by = cy;
              for (let d = 0; d < 6; d++) {
                const tx = nx(cx, cy, d);
                const ty = ny(cy, d);
                if (tx < 0 || ty < 0 || tx >= w || ty >= plane.size.h) continue;
                const g = toPile[tx + ty * w];
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
          lastX[i] = x;
          lastY[i] = y;
        }
      },
      summary(game) {
        const m: Record<string, number> = { pockets, dist: pileDist, way: pileWay };
        const c = game.player;
        const counted: number[] = [];
        for (let i = 0; i < n; i++) if (pickT[i] <= R1_SECONDS - R1_WAIT) counted.push(i);
        const took = (i: number): number => homeAt[i] - pickT[i];
        const share = (T: number): number => (counted.length ? counted.filter((i) => took(i) <= T).length / counted.length : NaN);
        const med = (v: number[]): number => (v.length ? v.sort((a, b) => a - b)[Math.floor((v.length - 1) / 2)] : NaN);
        const home = counted.filter((i) => homeAt[i] !== Infinity);
        m.picked = counted.length;
        m.home120 = share(120);
        m.home300 = share(R1_WAIT);
        m.median = med(home.map(took));
        m.ratio = med(home.map((i) => walked[i] / wayHome[i]));
        let held = 0;
        for (let i = 0; i < n; i++) if (c.layer[i] === PLANE && c.carrying[i]) held++;
        m.held = held / n;
        m.wrong = counted.filter((i) => wrong[i]).length;
        if (counted.length > 0) m.pass = m.home300 >= 0.95 && m.ratio <= 4 ? 1 : 0;
        return m;
      },
    };
    return {
      seed,
      seconds: R1_SECONDS,
      map: (s) => generateOneWorld(s),
      game: { regrow: 0 },
      colonies: [
        { antCount: n + 20, colony: { scoutRate: 0, raidScout: 0 } },
        { antCount: 10, colony: { scoutRate: 0, raidScout: 0 } },
      ],
      events: [{ at: 0, kind: "call", run: setUp }],
      probes: [probe],
    };
  },
  score: () => ({}),
};

/**
 * F1's find, remembered: ant i's belief of the food relative to its hole, as Colony's pickup would have left it (with siteFidelity or,
 * steerLane on, as the pickup does: arrive.ts; both off, none).
 */
function rememberAt(c: Colony, i: number, rx: number, ry: number): void {
  if (c.params.siteFidelity <= 0 && c.params.steerLane <= 0) return;
  c.foodX[i] = rx;
  c.foodY[i] = ry;
}

/**
 * How much a colony's ants move in lockstep (ja-0kys): sampled every second from `from` s, over its free ants
 * (alive, and in the mode their policy chose: `question` ≥ 0; a carrier goes home by rule and is left out).
 * - `lockAgree`: among ants whose mode answered the same situation, the share in that situation's commonest mode,
 *   over every such ant (a situation only one ant is in is left out): 1 = every ant in a situation does the same.
 * - `lockSwing`: how far the colony's mode mix moves from one second to the next (total variation, 0 to 1), averaged.
 * - `lockBurst`: the Fano factor (variance over mean) of mode switches a second, among ants free at both samples:
 *   about 1 when ants switch independently of each other, far above when many switch at once.
 */
export function lockstepProbe(from = 30): Probe {
  interface Seen {
    prev: Int8Array;
    gen: Uint32Array;
    agree: number;
    agreeN: number;
    swing: number;
    swingN: number;
    switches: number[];
    mix: number[] | null;
  }
  const seen: Seen[] = [];
  let nextAt = from;
  return {
    tick(game) {
      if (game.time + 1e-9 < nextAt) return;
      nextAt += 1;
      game.colonies.forEach((c, k) => {
        let s = seen[k];
        if (!s || s.prev.length < c.n) {
          const prev = new Int8Array(c.n).fill(-1);
          const gen = new Uint32Array(c.n);
          if (s) {
            prev.set(s.prev);
            gen.set(s.gen);
          }
          s = seen[k] = s ? { ...s, prev, gen } : { prev, gen, agree: 0, agreeN: 0, swing: 0, swingN: 0, switches: [], mix: null };
        }
        const groups = new Map<number, number[]>();
        const mix = [0, 0, 0, 0];
        let free = 0;
        let switched = 0;
        for (let i = 0; i < c.n; i++) {
          const q = c.alive[i] ? c.question[i] : -1;
          // A slot reused by a newborn is a new ant: it did not switch.
          if (q < 0 || c.gen[i] !== s.gen[i]) {
            s.gen[i] = c.gen[i];
            s.prev[i] = -1;
            if (q < 0) continue;
          }
          const m = c.mode[i];
          free++;
          mix[m]++;
          let g = groups.get(q);
          if (!g) groups.set(q, (g = [0, 0, 0, 0]));
          g[m]++;
          if (s.prev[i] >= 0 && s.prev[i] !== m) switched++;
          s.prev[i] = m;
        }
        for (const g of groups.values()) {
          const n = g[0]! + g[1]! + g[2]! + g[3]!;
          if (n < 2) continue;
          s.agree += Math.max(...g);
          s.agreeN += n;
        }
        if (free) {
          const now = mix.map((x) => x / free);
          const before = s.mix;
          if (before) {
            s.swing += 0.5 * now.reduce((a, p, j) => a + Math.abs(p - before[j]!), 0);
            s.swingN++;
          }
          s.mix = now;
        }
        s.switches.push(switched);
      });
    },
    summary() {
      const m: Record<string, number> = {};
      seen.forEach((s, k) => {
        const side = sideName(k);
        const sw = s.switches.slice(1); // the first sample has nothing to switch from
        const mu = mean(sw);
        const variance = sw.length > 1 ? sw.reduce((a, x) => a + (x - mu) ** 2, 0) / (sw.length - 1) : NaN;
        m[`${side}.lockAgree`] = s.agreeN ? s.agree / s.agreeN : NaN;
        m[`${side}.lockSwing`] = s.swingN ? s.swing / s.swingN : NaN;
        m[`${side}.lockBurst`] = mu > 0 ? variance / mu : NaN;
        m[`${side}.switchesPerS`] = mu;
      });
      return m;
    },
  };
}

/**
 * L — lockstep, one world (ja-0kys): the page's game, 300 + 300 ants, 300 s, with lockstepProbe and the food
 * and losses beside it. Report only: compare settings on the same seeds, e.g. the shipped answers for both colonies
 * drawn and not (`--one lockstep --policy precache:forage --set both.sampleTemp=0,1`).
 */
export const lockstep1: Assay = {
  id: "lockstep",
  title: "L lockstep: same situation, same act; the mode mix's swings; bursts of switching (one world)",
  target: "report only: lockAgree (1 = lockstep), lockSwing, lockBurst (≈ 1 = switches independent), switchesPerS, per colony",
  seconds: 300,
  spec: (seed) => ({
    seed,
    seconds: 300,
    map: (s) => generateOneWorld(s),
    colonies: [{ antCount: 300 }, { antCount: 300 }],
    probes: [lockstepProbe()],
  }),
  score: () => ({}),
};

/** The angle between two headings, 0 to π. */
const angleBetween = (a: number, b: number): number => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));

/** T1: within this of its last find an explorer counts as searching where it found food; beyond T1_FAR (or with no find yet), as ranging. */
export const T1_NEAR = 8;
export const T1_FAR = 25;
/** T1's pass mark: near ÷ far turning at least this (design: today's ants measure 1.00, 0.98–1.04 on seeds 1–10, and noise round 1 must not pass). */
export const T1_PASS = 1.5;

/**
 * How sharply the first colony's explorers turn near their last find and away from it (ja-ykmu.1; docs/steering.md
 * §7): an observer. It notes where each ant picks food up on the plane (its last find; a newborn in a slot has none), and over
 * every tick an empty-jawed explorer on the plane walks, the turning (radians) and the distance it covers, near its last find
 * (within T1_NEAR) or away (beyond T1_FAR, or no find). `turnNear` and `turnFar` are radians per unit walked; `ratio`
 * = near ÷ far; `nearWalk` and `farWalk` the distance each is measured over.
 */
export function searchTurnProbe(): Probe {
  let pickX = new Float64Array(0);
  let pickY = new Float64Array(0);
  let prevH = new Float64Array(0);
  let prevX = new Float64Array(0);
  let prevY = new Float64Array(0);
  let had = new Uint8Array(0);
  let gen = new Uint32Array(0);
  let turnNear = 0;
  let walkNear = 0;
  let turnFar = 0;
  let walkFar = 0;
  return {
    tick(game) {
      const c = game.player;
      if (pickX.length < c.n) {
        const grow = <T extends Float64Array | Uint8Array | Uint32Array>(a: T, make: (n: number) => T, fill?: number): T => {
          const b = make(c.n);
          if (fill !== undefined) (b as Float64Array).fill(fill);
          b.set(a as never);
          return b;
        };
        pickX = grow(pickX, (k) => new Float64Array(k), NaN);
        pickY = grow(pickY, (k) => new Float64Array(k), NaN);
        prevH = grow(prevH, (k) => new Float64Array(k), NaN);
        prevX = grow(prevX, (k) => new Float64Array(k), NaN);
        prevY = grow(prevY, (k) => new Float64Array(k), NaN);
        had = grow(had, (k) => new Uint8Array(k));
        gen = grow(gen, (k) => new Uint32Array(k));
      }
      for (let i = 0; i < c.n; i++) {
        if (!c.alive[i] || c.gen[i] !== gen[i]) {
          gen[i] = c.gen[i];
          pickX[i] = pickY[i] = prevH[i] = NaN;
          had[i] = 0;
          continue;
        }
        const onPlane = c.layer[i] === PLANE;
        if (c.carrying[i] && !had[i] && onPlane) {
          pickX[i] = c.x[i];
          pickY[i] = c.y[i];
        }
        had[i] = c.carrying[i];
        const exploring = onPlane && !c.carrying[i] && !c.pellet[i] && c.mode[i] === EXPLORE && c.question[i] >= 0;
        if (exploring && !Number.isNaN(prevH[i])) {
          const walk = Math.hypot(c.x[i] - prevX[i], c.y[i] - prevY[i]);
          if (walk > 0) {
            const turn = angleBetween(c.heading[i], prevH[i]);
            const d = Number.isNaN(pickX[i]) ? Infinity : Math.hypot(c.x[i] - pickX[i], c.y[i] - pickY[i]);
            if (d <= T1_NEAR) {
              turnNear += turn;
              walkNear += walk;
            } else if (d >= T1_FAR) {
              turnFar += turn;
              walkFar += walk;
            }
          }
        }
        prevH[i] = exploring ? c.heading[i] : NaN;
        prevX[i] = c.x[i];
        prevY[i] = c.y[i];
      }
    },
    summary() {
      const near = walkNear > 0 ? turnNear / walkNear : NaN;
      const far = walkFar > 0 ? turnFar / walkFar : NaN;
      return { turnNear: near, turnFar: far, ratio: near / far, nearWalk: walkNear, farWalk: walkFar };
    },
  };
}

/**
 * T1 — search turns tight where an ant found food (ja-ykmu.1; docs/steering.md §7: *Formica schaufussi* search with a high
 * turning rate at the find, Fourcassié & Traniello 1993–94, unverified): the page's one-world game, 300 + 300 ants, 300 s, with
 * searchTurnProbe. Target: explorers turn more per unit walked near their last find than away from it, `ratio` ≥ T1_PASS (a
 * design mark: no number from the papers is used).
 */
export const searchTight1: Assay = {
  id: "t1",
  title: "T1 search turns tight near the last find (one world)",
  target:
    "explorers turn more per unit walked within T1_NEAR of their last find than beyond T1_FAR: ratio > 1 (design mark; Fourcassié & Traniello, unverified)",
  seconds: 300,
  spec: (seed) => ({
    seed,
    seconds: 300,
    map: (s) => generateOneWorld(s),
    colonies: [{ antCount: 300 }, { antCount: 300 }],
    probes: [searchTurnProbe()],
  }),
  score: (r): Record<string, number> => (Number.isFinite(r.metrics.ratio) ? { pass: (r.metrics.ratio as number) >= T1_PASS ? 1 : 0 } : {}),
};
