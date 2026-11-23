// The desert ant's assays (docs/refactor.md S3.6, ja-fnd.4.6), on the harness (harness.ts). ONE_ASSAYS lists them (experiment.ts).

import { leaveRate, paceAfter, paceReturns } from "./invite.ts";
import { dayPhase, sunHigh } from "./heat.ts";
import { holdsAt } from "./crossing.ts";
import { DESERT_ANT } from "./desertAnt.ts";
import { type ColonyParams, type Layer, CURTAIN, PLANE } from "./colony.ts";
import { FAINT, RETURN } from "./vocab.ts";
import { Game } from "./game.ts";
import { generateOneWorld } from "./oneWorld.ts";
import { type Responses, type Touch } from "./responses.ts";
import type { Channel } from "./pheromone.ts";
import { mulberry32 } from "./world.ts";

import { type Assay, type Probe, type RunSpec } from "./harness.ts";

// ---------------------------------------------------------------- the desert ant (ja-rf5.2, docs/desert-ant.md "The mechanic")
//
// Assays for the desert ant, landed before it (no behaviour change): today they measure the generic ant, the baseline. Each runs
// one world's default plane with its own food for D_SECONDS; the species comes in as `game.species` through an override once it
// exists (ja-rf5.3). Targets read in full text are marked so; the rest are unverified (owner, 2026-11-13: mark them, don't wait for the
// paywalled papers). Target (c), a forager whose vector fails finds home by search loops, is S1 (search1).

/** D1–D4: seconds of play. */
export const D_SECONDS = 120;

/** One world's default plane, a player colony alone, `probe` watching. */
function desertSpec(seed: number, probe: Probe): RunSpec {
  return { seed, seconds: D_SECONDS, map: (s) => generateOneWorld(s), colonies: [{ antCount: 60 }], probes: [probe] };
}

/** Cells of the plane at or above a faint trail on `channel`. */
function trailCells(game: Game, channel: Channel): number {
  const L = game.colonies[0]!.layers[PLANE] as Layer;
  const { w, h } = L.map.size;
  let n = 0;
  for (let y = 0; y < h; y++) for (let x = L.map.x0; x < L.map.x0 + w; x++) if (L.ph.fields[channel].get(x, y) >= FAINT) n++;
  return n;
}

/**
 * D1 — a desert ant lays no trail. Target: no cell of the plane holds a food or home trail at the end. *Cataglyphis* has no trail
 * pheromone (Wolf & Wehner 2000, unverified) and Razin et al. 2013 (full text) open with *C. niger* as a species that lacks
 * pheromone-based recruitment. Today's ant lays both: a todo until the desert ant (ja-rf5.3).
 */
export const desertNoTrail: Assay = {
  id: "d1",
  title: "D1 a desert ant lays no trail (one world)",
  target: "no food or home trail on the plane after 120 s (Razin 2013, full text; Wolf & Wehner 2000, unverified)",
  seconds: D_SECONDS,
  spec: (seed) =>
    desertSpec(seed, {
      tick() {},
      summary(game) {
        const food = trailCells(game, "food");
        const home = trailCells(game, "home");
        return { foodCells: food, homeCells: home, pass: food === 0 && home === 0 ? 1 : 0 };
      },
    }),
  score: () => ({}),
};

/**
 * Departures (curtain to plane), returns (plane to curtain, with whether the ant carried food) and deaths out on the plane of the
 * player's ants, with the time. A slot an ant dies in may be reused by a birth (in the curtain): it starts a fresh record.
 */
function crossingsProbe(
  onSummary: (
    game: Game,
    out: { t: number; ant: number }[],
    back: { t: number; ant: number; food: boolean }[],
    died: { t: number; ant: number }[],
  ) => Record<string, number>,
): Probe {
  let was: Uint8Array = new Uint8Array(0);
  const out: { t: number; ant: number }[] = [];
  const back: { t: number; ant: number; food: boolean }[] = [];
  const died: { t: number; ant: number }[] = [];
  return {
    tick(game) {
      const c = game.colonies[0]!;
      if (was.length < c.n) {
        // New slots start as "no ant" (255), not as PLANE (0), so a slot filled later is not read as a return (review of #134).
        const grown = new Uint8Array(Math.max(c.n, 64)).fill(255);
        grown.set(was);
        was = grown;
      }
      for (let i = 0; i < c.n; i++) {
        const l = c.alive[i] ? c.layer[i]! : 255;
        const before = was[i];
        if (before === CURTAIN && l === PLANE) out.push({ t: game.time, ant: i });
        else if (before === PLANE && l === CURTAIN) back.push({ t: game.time, ant: i, food: c.carrying[i] === 1 });
        else if (before === PLANE && l === 255) died.push({ t: game.time, ant: i });
        was[i] = l;
      }
    },
    summary: (game) => onSummary(game, out, back, died),
  };
}

/** D2: the seconds after (and before) each return with food that departures are counted in. */
export const D2_WINDOW = 10;

/**
 * D2 — a returning finder invites nestmates out. For each forager that comes home with food, the idle ants' departures (not a finder's
 * going back out) in the D2_WINDOW seconds after it against the D2_WINDOW seconds before it, summed over every such return: about 1 when returns invite nobody. Target: at least 7.
 * Razin, Eckmann & Feinerman 2013 (full text): a recruiter's entry raises the idle ants leaving in the next minute sevenfold over a
 * spontaneous mover (*C. niger*, lab nests of 4–8 ants). The game's returns come every second or so, so a minute on either side would
 * overlap every other return's: the window is shorter, and the mark is provisional; meeting it is the invitation's (ja-rf5.6).
 */
export const desertInvitation: Assay = {
  id: "d2",
  title: "D2 a returning finder invites nestmates out (one world)",
  target:
    "the leaving rate of ants waiting at the top of the shaft in the 10 s after a finder comes down ≥ 7× that in the 10 s before (Razin 2013, full text; provisional window)",
  seconds: D_SECONDS,
  spec: (seed) => {
    // Each tick: how many of the player's ants wait at the gate (held), and which of last tick's waiting ants climbed out (a departure from
    // the waiting pool). Each finder that comes down the hole with food is a return. The rate is per waiting-ant-second, as Razin's sevenfold
    // is a rate for the idle ants of the chamber (ja-rf5.6): counted whole, the finders cycling straight back out swamped the few that wait.
    const exposure: { t: number; held: number }[] = [];
    const leftAt: number[] = [];
    const returns: number[] = [];
    let wasHeld = new Uint8Array(0);
    let wasLayer = new Int8Array(0);
    let wasCarrying = new Uint8Array(0);
    return desertSpec(seed, {
      tick(game) {
        const c = game.colonies[0]!;
        if (wasHeld.length < c.n) {
          const grow = <T extends Uint8Array | Int8Array>(a: T, make: (n: number) => T) => {
            const b = make(Math.max(c.n, 64));
            b.set(a);
            return b;
          };
          wasHeld = grow(wasHeld, (n) => new Uint8Array(n));
          wasLayer = grow(wasLayer, (n) => new Int8Array(n).fill(-1));
          wasCarrying = grow(wasCarrying, (n) => new Uint8Array(n));
        }
        let held = 0;
        for (let i = 0; i < c.n; i++) {
          const alive = c.alive[i] === 1;
          const layer = alive ? c.layer[i] : -1;
          if (alive && wasLayer[i] === PLANE && layer !== PLANE && wasCarrying[i] === 1) returns.push(game.time);
          // It waited since it last came in: its climb out after its pass (several ticks, no longer held) is a departure from the pool.
          if (alive && wasHeld[i] === 1 && layer === PLANE) leftAt.push(game.time);
          let h = 0;
          if (alive && layer !== PLANE) {
            const was = c.cur;
            c.bind(layer);
            h = holdsAt(c, i) ? 1 : 0;
            c.bind(was);
          }
          wasHeld[i] = !alive || layer === PLANE ? 0 : wasHeld[i] === 1 || h === 1 ? 1 : 0;
          held += h;
          wasLayer[i] = layer;
          wasCarrying[i] = alive ? c.carrying[i] : 0;
        }
        exposure.push({ t: game.time, held });
      },
      summary(game) {
        const dt = exposure.length > 1 ? exposure[1]!.t - exposure[0]!.t : 1 / 30;
        const heldIn = (lo: number, hi: number) => exposure.reduce((sum, e) => (e.t > lo && e.t <= hi ? sum + e.held * dt : sum), 0);
        const leftIn = (lo: number, hi: number) => leftAt.reduce((n, t) => (t > lo && t <= hi ? n + 1 : n), 0);
        let after = 0;
        let before = 0;
        let expAfter = 0;
        let expBefore = 0;
        let used = 0;
        // Only isolated returns, as Razin's recruiter entries were: none other in the 2 windows before. With finders coming down every few
        // seconds, a waiting ant's pace stays raised through the window before as well, and the ratio reads 1 whatever invites.
        const isolated = returns.filter((r, k) => k === 0 || r - returns[k - 1]! >= 2 * D2_WINDOW);
        for (const r of isolated) {
          if (r < D2_WINDOW || r > game.time - D2_WINDOW) continue;
          used++;
          after += leftIn(r, r + D2_WINDOW);
          before += leftIn(r - D2_WINDOW, r);
          expAfter += heldIn(r, r + D2_WINDOW);
          expBefore += heldIn(r - D2_WINDOW, r);
        }
        const rateAfter = expAfter > 0 ? after / expAfter : NaN;
        const rateBefore = expBefore > 0 ? before / expBefore : NaN;
        const ratio = rateBefore > 0 ? rateAfter / rateBefore : rateAfter > 0 ? Infinity : NaN;
        const meanHeld = exposure.length ? exposure.reduce((s2, e) => s2 + e.held, 0) / exposure.length : NaN;
        return { returnsWithFood: used, leftWaiting: leftAt.length, meanHeld, rateAfter, rateBefore, ratio, pass: ratio >= 7 ? 1 : 0 };
      },
    });
  },
  score: () => ({}),
};

/** D2c's window either side of a finder's entry (seconds): Razin counted the idle ants leaving in the minute after (owner, review of #186 D1). */
export const CHAMBER_WINDOW = 60;

/** D2c's group sizes: Razin's entrance chambers held 2–13 ants. */
export const CHAMBER_SIZES = [2, 4, 8, 13] as const;

/**
 * Razin's chamber, staged (ja-rf5.6): `n` ants waiting at the top of the shaft, at rest; for CHAMBER_WINDOW seconds no finder comes
 * (spontaneous leaving), then one finder comes down past them and the next CHAMBER_WINDOW seconds are counted. The same rule as the game (invite.ts: the pace a
 * finder raises, damped by the crowd, here the n − 1 still waiting round each; the leave response on it), `trials` times. The game's crowd
 * sense differs (review of #186, S2): it counts every nestmate round the top of the shaft (about 5 on average where about 1.5 wait), so a
 * finder's lift fades about twice as fast in play; and it is wired only where there is a rival (game.ts), so in a game alone it reads 0. An ant that leaves is gone for the trial.
 * The leave response is asked with no draw: a replayed cache plays Jev's own answer here, where the game draws each ant's (ja-m7rr).
 */
export function invitationChamber(
  p: ColonyParams,
  leave: Responses["leave"],
  n: number,
  trials: number,
  rng: () => number,
): { before: number; after: number; expBefore: number; expAfter: number } {
  const dt = 1 / 30;
  const steps = Math.round(CHAMBER_WINDOW / dt);
  let before = 0;
  let after = 0;
  let expBefore = 0;
  let expAfter = 0;
  const pace = new Float64Array(n);
  const waiting = new Uint8Array(n);
  for (let k = 0; k < trials; k++) {
    pace.fill(p.paceRest);
    waiting.fill(1);
    for (let step = 0; step < 2 * steps; step++) {
      const second = step >= steps;
      const left = waiting.reduce((a, w) => a + w, 0);
      for (let i = 0; i < n; i++) {
        if (!waiting[i]) continue;
        pace[i] = paceAfter(p, pace[i]!, step === steps ? 1 : 0, left - 1, dt);
        if (second) expAfter += dt;
        else expBefore += dt;
        const answer = leave({ returns: paceReturns(p, pace[i]!) } as Touch);
        if (rng() < 1 - Math.exp(-leaveRate(p, answer) * dt)) {
          waiting[i] = 0;
          if (second) after++;
          else before++;
        }
      }
    }
  }
  return { before, after, expBefore, expAfter };
}

/**
 * D2c — the invitation, staged as Razin's chamber (ja-rf5.6; Razin, Eckmann & Feinerman 2013, full text, C. niger: a recruiter's entry raised
 * the idle ants leaving in the next minute sevenfold, in nests of 4–8; more ants in the nest lowered exits). For each group size in
 * CHAMBER_SIZES, 400 trials (invitationChamber) on the colony's own rule and params: the leaving rate in the minute after a finder comes
 * down against the minute before. Pass: at least 7× for groups of 4 and 8, and the rate after a finder lower in a group of 13 than of 4 (crowding).
 * The game's own measure, D2, stays beside it (noisy: few isolated returns in a game).
 */
export const desertChamber: Assay = {
  id: "d2c",
  title: "D2c the invitation, staged as Razin's chamber: one finder, groups of 2–13 waiting",
  target: "leaving ≥ 7× after a finder for groups of 4 and 8; lower after-rate at 13 than at 4 (Razin 2013, full text)",
  seconds: 0.1,
  spec: (seed) => {
    const spec = desertSpec(seed, {
      tick() {},
      summary(game) {
        const c = game.colonies[0]!;
        const rng = mulberry32(seed * 7919 + 17);
        const out: Record<string, number> = {};
        const rateAfter: Record<number, number> = {};
        for (const n of CHAMBER_SIZES) {
          const r = invitationChamber(c.params, c.responses.leave, n, 400, rng);
          const ra = r.after / r.expAfter;
          const rb = r.before / r.expBefore;
          rateAfter[n] = ra;
          out[`ratio${n}`] = rb > 0 ? ra / rb : ra > 0 ? Infinity : NaN;
          out[`after${n}`] = ra;
        }
        const pass = out.ratio4! >= 7 && out.ratio8! >= 7 && rateAfter[13]! < rateAfter[4]! ? 1 : 0;
        return { ...out, pass };
      },
    });
    return { ...spec, seconds: 0.1, game: { ...spec.game, species: DESERT_ANT } };
  },
  score: () => ({}),
};

/**
 * D3 — the first find. With no pass mark of its own: the plume (ja-rf5.4) is to bring it sooner than the same seed's blind search
 * (`colony: { foodPlume: 0 }`), as tests/slow/assays.test.ts checks with the desert ant. The first finder is otherwise blind whatever the
 * colony lays (no trail leads to food nobody has found). A forager turns in to food odour up to about 6 m (Buehlmann et al. 2014, a
 * pre-publication draft only: unverified).
 */
export const desertFirstFind: Assay = {
  id: "d3",
  title: "D3 the first find (one world; with the desert ant's food plume, against its blind search)",
  target: "with the plume (ja-rf5.4) the first find comes sooner than with foodPlume 0, seed for seed (Buehlmann 2014, draft: unverified)",
  seconds: D_SECONDS,
  spec: (seed) => {
    let first = Infinity;
    let finds = 0;
    let held: Uint8Array = new Uint8Array(0);
    return desertSpec(seed, {
      tick(game) {
        const c = game.colonies[0]!;
        if (held.length < c.n) {
          const grown = new Uint8Array(Math.max(c.n, 64));
          grown.set(held);
          held = grown;
        }
        for (let i = 0; i < c.n; i++) {
          const has = c.alive[i] && c.layer[i] === PLANE && c.carrying[i] === 1 ? 1 : 0;
          if (has && !held[i]) {
            finds++;
            if (first === Infinity) first = game.time;
          }
          held[i] = has;
        }
      },
      summary: () => ({ firstFind: Number.isFinite(first) ? first : NaN, found: Number.isFinite(first) ? 1 : 0, pickups: finds }),
    });
  },
  score: () => ({}),
};

/**
 * D4 — trips, the heat budget's baseline. No pass mark until heat exists (ja-rf5.5): its trips are to be bursts inside a heat budget.
 * Unset targets, all unverified: the thermal window and how fast heat kills (*C. bombycina*: Wehner, Marsh & Wehner 1992, abstract
 * only); a forager life of 4–6 days and about 16 % of foragers lost a day (*C. bicolor*: Schmid-Hempel & Schmid-Hempel 1984, a summary).
 * Reported: trips completed (out of the hole and back), still out at the end (`open`), and ended by death out on the plane (`diedOut`);
 * the median, 90th percentile and longest over completed and open trips (an open one counted to the end, as at least that long), in
 * seconds, and the completed trips' median.
 */
export const desertTrips: Assay = {
  id: "d4",
  title: "D4 trips out of the hole and back (one world; the heat budget's baseline)",
  target: "baseline only: trips inside a heat budget once heat exists (ja-rf5.5; Wehner 1992, Schmid-Hempel 1984: unverified)",
  seconds: D_SECONDS,
  spec: (seed) =>
    desertSpec(
      seed,
      crossingsProbe((game, out, back, died) => {
        const done: number[] = [];
        const left = new Map<number, number>();
        let diedOut = 0;
        const events = [
          ...out.map((o) => ({ t: o.t, ant: o.ant, k: 0 })),
          ...back.map((b) => ({ t: b.t, ant: b.ant, k: 1 })),
          ...died.map((d) => ({ t: d.t, ant: d.ant, k: 2 })),
        ].sort((a, b) => a.t - b.t);
        for (const e of events) {
          if (e.k === 0) left.set(e.ant, e.t);
          else if (left.has(e.ant)) {
            if (e.k === 1) done.push(e.t - left.get(e.ant)!);
            else diedOut++; // a trip that ended in death: what the heat budget is about (review of #134, S2)
            left.delete(e.ant);
          }
        }
        // Trips still out at the end count to the end, as at least that long: dropping them made the median short (S2).
        const open = [...left.values()].map((t) => game.time - t);
        const all = [...done, ...open].sort((a, b) => a - b);
        done.sort((a, b) => a - b);
        const at = (v: number[], q: number): number => (v.length ? v[Math.min(v.length - 1, Math.floor(q * v.length))]! : NaN);
        return {
          trips: done.length,
          open: open.length,
          diedOut,
          median: at(all, 0.5),
          p90: at(all, 0.9),
          longest: all.length ? all[all.length - 1]! : NaN,
          completedMedian: at(done, 0.5),
        };
      }),
    ),
  score: () => ({}),
};

/** D5's length: two of the desert ant's 10-minute days (heatDay). */
export const D5_SECONDS = 1200;

/**
 * D5 — heat (ja-rf5.5, ja-rf5.12; docs/desert-heat.md, PRD §60.5): the desert ant over two days. Its ground heats toward noon; an ant out heats
 * with it, comes back when it feels hot and dies past its critical heat (53.6 °C, C. bombycina, a borrowing: unverified). The papers' direction
 * (owner, review of #155 D1): the hot-adapted Cataglyphis forage at the hottest hours, close to their limit (desert-heat.md §1), and the sun's
 * height sets the nest's day (Amor 2011, unverified). Pass, all four: more ants out on the plane at noon (the daylight's middle quarter) than in
 * the low sun (its first and last eighth); at night (the sun down) no more setting out (not on their way home) than a tenth of those out at
 * noon, and no more out at all (lost homers too: ja-rf5.14, owner 2026-11-15) than a tenth of noon; heat deaths a day no more than 16 % of
 * the colony (C. bicolor loses about 16 % of its foragers a day to every cause: Schmid-Hempel & Schmid-Hempel 1984, a summary, unverified); and no cliff: food picked up in every 30 s while the sun is high, after the first minute.
 */
export const desertHeat: Assay = {
  id: "d5",
  title: "D5 heat: the desert ant forages under the high sun, stays in at night, and few die of heat (one world, two days)",
  target:
    "out at noon > in the low sun; at night ≤ 0.1 × noon, setting out and out at all; heat deaths ≤ 16 % of the colony a day; food every 30 s under the high sun (Amor 2011, borrowings: unverified)",
  seconds: D5_SECONDS,
  spec: (seed) => {
    let noon = 0;
    let noonN = 0;
    let dawn = 0;
    let dawnN = 0;
    let night = 0;
    let nightAll = 0;
    let nightN = 0;
    let aliveSum = 0;
    let aliveN = 0;
    let held: Uint8Array = new Uint8Array(0);
    const bins: number[] = [];
    const spec = desertSpec(seed, {
      tick(game) {
        const c = game.colonies[0]!;
        const day = c.params.heatDay;
        if (held.length < c.n) {
          const grown = new Uint8Array(Math.max(c.n, 64));
          grown.set(held);
          held = grown;
        }
        let out = 0;
        let alive = 0;
        const bin = Math.floor(game.time / 30);
        while (bins.length <= bin) bins.push(0);
        for (let i = 0; i < c.n; i++) {
          if (!c.alive[i]) {
            held[i] = 0;
            continue;
          }
          alive++;
          if (c.layer[i] === PLANE) out++;
          const has = c.layer[i] === PLANE && c.carrying[i] === 1 ? 1 : 0;
          if (has && !held[i]) bins[bin]!++;
          held[i] = has;
        }
        aliveSum += alive;
        aliveN++;
        if (day <= 0) return;
        // The day's quarters of daylight: noon, its middle quarter; the low sun, the first and last eighth of it; then the night.
        const phase = dayPhase(c.params, game.time);
        const light = 1 - c.params.heatNight;
        if (phase >= light) {
          // At night: those out and not on their way home (a lost carrier still searching for the hole is coming home, not setting out).
          // Every ant out counts too (ja-rf5.14): lost homers included, reported beside it.
          for (let i = 0; i < c.n; i++)
            if (c.alive[i] && c.layer[i] === PLANE) {
              nightAll++;
              if (c.mode[i] !== RETURN) night++;
            }
          nightN++;
        } else if (Math.abs(phase - light / 2) < light / 8) {
          noon += out;
          noonN++;
        } else if (phase < light / 8 || phase > light - light / 8) {
          dawn += out;
          dawnN++;
        }
      },
      summary(game) {
        const c = game.colonies[0]!;
        const days = c.params.heatDay > 0 ? game.time / c.params.heatDay : NaN;
        const outNoon = noon / Math.max(1, noonN);
        const outDawn = dawn / Math.max(1, dawnN);
        const ratio = outNoon / outDawn;
        const outNight = night / Math.max(1, nightN);
        const outNightAll = nightAll / Math.max(1, nightN);
        const deathsADay = c.diedHot / days / (aliveSum / Math.max(1, aliveN));
        // The 30-s windows after the first minute, but those in the high sun (any moment of them), where a lull is the biology (desert-heat.md §1).
        const after = bins
          .slice(0, Math.floor(game.time / 30))
          .filter((_, b) => b >= 2 && [0, 10, 20, 30].every((s) => sunHigh(c.params, b * 30 + s)));
        const minPickups = after.length ? Math.min(...after) : NaN;
        return {
          outNoon,
          outDawn,
          ratio,
          outNight,
          outNightAll,
          heatDeaths: c.diedHot,
          deathsADay,
          minPickups,
          pass: ratio > 1 && outNight <= 0.1 * outNoon && outNightAll <= 0.1 * outNoon && deathsADay <= 0.16 && minPickups > 0 ? 1 : 0,
        };
      },
    });
    return { ...spec, seconds: D5_SECONDS, game: { ...spec.game, species: DESERT_ANT } };
  },
  score: () => ({}),
};
