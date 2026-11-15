// The whole-game and one-world assays (docs/refactor.md S3.6, ja-fnd.4.6): G1, S1, F1 and R1, on the harness (harness.ts).
// ONE_ASSAYS, which also reruns the arena assays on the plane, is in experiment.ts.

import { type Colony, HOLE_SIGHT, type HoleCell, LIFESPAN, PI_DRIFT, PLANE, planeMoundReach } from "./colony.ts";
import { MODES } from "./vocab.ts";
import { Game } from "./game.ts";
import { CELL, cellOf, centreX, centreY, nx, ny, R } from "./hex.ts";
import { generateOneWorld } from "./oneWorld.ts";
import { encode } from "./save.ts";
import { dropFood, heapPlane, mulberry32, rockAt, OPEN, type Nest, type WorldMap } from "./world.ts";

import { type Assay, mean, gateProbe, heldProbe, sideName, type Probe } from "./harness.ts";

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
    game: { antCount: 600, rivalAnts: 600 },
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
 * vector's end (the hole + T × drift: the search's origin), so its search begins there; a draw whose end is off the plane
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
      game: { antCount: n + 20, rivalAnts: 10, regrow: 0 },
      sides: { colony: { scoutRate: 0, raidScout: 0 }, rival: { scoutRate: 0, raidScout: 0 } },
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
  spec: (seed) => {
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
        c.driftSurf[i] = (gauss() * PI_DRIFT) / Math.SQRT2;
        c.driftSurfY[i] = (gauss() * PI_DRIFT) / Math.SQRT2;
        // The find: a straight walk out to the spot, with a drift of its own, as the game draws one at the hole.
        const dx = (gauss() * PI_DRIFT) / Math.SQRT2;
        const dy = (gauss() * PI_DRIFT) / Math.SQRT2;
        // Where its hole was believed to be on that trip, the plane's nest plus its drift: the find's offset from it.
        const nest = plane.nests[c.params.nest] as Nest;
        const odo = Math.hypot(sx - hx, sy - hy);
        rememberAt(c, i, sx - (nest.x + odo * dx), sy - (nest.y + odo * dy));
      }
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
      game: { antCount: n + 20, rivalAnts: 10, regrow: 0 },
      sides: { colony: { scoutRate: 0, raidScout: 0 }, rival: { scoutRate: 0, raidScout: 0 } },
      events: [{ at: 0, kind: "call", run: setUp }],
      probes: [probe],
    };
  },
  score: () => ({}),
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
      game: { antCount: n + 20, rivalAnts: 10, regrow: 0 },
      sides: { colony: { scoutRate: 0, raidScout: 0 }, rival: { scoutRate: 0, raidScout: 0 } },
      events: [{ at: 0, kind: "call", run: setUp }],
      probes: [probe],
    };
  },
  score: () => ({}),
};

/** F1's find, remembered: ant i's belief of the food relative to its hole, as Colony's pickup would have left it (siteFidelity on; off, none). */
function rememberAt(c: Colony, i: number, rx: number, ry: number): void {
  if (c.params.siteFidelity <= 0) return;
  c.foodX[i] = rx;
  c.foodY[i] = ry;
}
