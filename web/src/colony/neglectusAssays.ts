// The invasive garden ant's assays (ja-e668.2, docs/lasius-neglectus.md "The mechanic", PRD §64.2), on the harness (harness.ts). ONE_ASSAYS
// lists them (experiment.ts). Landed before the species (no behaviour change): today they measure the generic ant, the baseline. N2
// (destructive disinfection) and N4 (budding) have nothing to measure yet (the game's brood carries no fungus; a colony never buds): they come
// with their mechanics (ja-e668.5, ja-e668.6), and tests/slow/neglectus.test.ts holds them as todos.

import { type Colony, PLANE } from "./colony.ts";
import { INFECTED, STRAINS } from "./fungus.ts";
import { Game } from "./game.ts";
import { binCentre, binOf } from "./recognition.ts";
import { generateOneWorld } from "./oneWorld.ts";

import { type Assay, type Probe, type RunSpec } from "./harness.ts";

/** N1: when the exposed ant is dosed, and how long after it the spread is read (game seconds stand in for Konrad's days 3–5: design). */
export const N1_EXPOSE_AT = 20;
export const N1_READ_AFTER = 120;
/** N1: the exposed ant's dose (Konrad et al. 2012 applied a lethal dose: about half the exposed died). */
export const N1_DOSE = 0.8;

/** N1's pass: nestmates carrying 40–85 % and the exposed ant's load at least 8 times their median (Konrad et al. 2012). */
export function n1Pass(carriers: number, exposedRatio: number): 0 | 1 {
  return carriers >= 0.4 && carriers <= 0.85 && exposedRatio >= 8 ? 1 : 0;
}

/** What N1 reads at its moment: each number in the summary but the pass. */
export interface N1Read {
  carriers: number;
  medianLoad: number;
  exposedRatio: number;
  doseRatio: number;
  meanResist: number;
  exposedPeak: number;
  exposedNow: number;
}

/**
 * N1's reading over a colony's per-ant arrays: the nestmates (living, not the exposed ant) carrying a load of INFECTED or more, their median
 * load, the exposed ant's load now and its peak (the dose) against that median, and the nestmates' mean resistance.
 */
export function n1Read(
  load: ArrayLike<number>,
  alive: ArrayLike<number>,
  resist: ArrayLike<number>,
  n: number,
  exposed: number,
  peak: number,
): N1Read {
  let mates = 0;
  let carriers = 0;
  let res = 0;
  const loads: number[] = [];
  for (let i = 0; i < n; i++) {
    if (!alive[i] || i === exposed) continue;
    mates++;
    res += resist[i]!;
    if (load[i]! >= INFECTED) {
      carriers++;
      loads.push(load[i]!);
    }
  }
  loads.sort((a, b) => a - b);
  const median = loads.length ? loads[loads.length >> 1]! : 0;
  const now = alive[exposed] ? load[exposed]! : 0;
  return {
    carriers: mates ? carriers / mates : 0,
    medianLoad: median,
    exposedRatio: median > 0 ? now / median : Infinity,
    doseRatio: median > 0 ? peak / median : Infinity,
    meanResist: mates ? res / mates : 0,
    exposedPeak: peak,
    exposedNow: now,
  };
}

/** N1's summary: its reading (NaN where the run never got there) and the pass, on the exposed ant's load at the reading. */
export function n1Score(read: N1Read | null, peak: number): Record<string, number> {
  const r = read ?? {
    carriers: NaN,
    medianLoad: NaN,
    exposedRatio: NaN,
    doseRatio: NaN,
    meanResist: NaN,
    exposedPeak: peak,
    exposedNow: NaN,
  };
  return { ...r, pass: n1Pass(r.carriers, r.exposedRatio) };
}

const BLOOM = STRAINS.findIndex((s) => s.id === "bloom");

/** The first living ant of colony c inside its nest (not on one world's plane): the exposed ant, chosen without a random draw. */
function insideAnt(c: Colony): number {
  for (let i = 0; i < c.n; i++) if (c.alive[i] && c.layer[i] !== PLANE) return i;
  return -1;
}

/**
 * N1 — immunisation (Konrad et al. 2012, *L. neglectus* and *Metarhizium*, full text): one worker inside the nest takes a heavy dose of Bloom
 * (the game's *Metarhizium*). Konrad: by days 3–5 about two-thirds of nestmates (64 %) carried a low-level infection, their loads about 8–12
 * times lower than the exposed ants' loads on the same days (4.4 against 36 CFU); grooming primes them. Deaths are not modelled (the game's
 * fungus kills no worker by itself: lasius-neglectus.md §3, For the model). Pass, both, N1_READ_AFTER s after the dose: nestmates carrying a
 * load (≥ INFECTED) between 40 % and 85 %, and the exposed ant's load then at least 8 times the carriers' median (`exposedRatio`; the dose
 * itself, `doseRatio`, is reported, review of #228 S2). Today grooming is fixed-rate and contact passes load freely.
 */
export const neglectusImmunisation: Assay = {
  id: "n1",
  title: "N1 immunisation: a sick nestmate's fungus spreads thin, as low loads, through its nestmates (one world)",
  target:
    "nestmates with a load 40–85 % (64 %) and their median load ≤ 1/8 of the exposed ant's at the same time (8–12×), Konrad et al. 2012 (full text)",
  seconds: N1_EXPOSE_AT + N1_READ_AFTER,
  spec: (seed): RunSpec => {
    let exposed = -1;
    let peak = 0;
    let read: N1Read | null = null;
    const probe: Probe = {
      tick(game) {
        const c = game.colonies[0]!;
        if (exposed < 0) return;
        peak = Math.max(peak, c.load[exposed] ?? 0);
        if (read || game.time < N1_EXPOSE_AT + N1_READ_AFTER - 1e-6) return;
        read = n1Read(c.load, c.alive, c.resist, c.n, exposed, peak);
      },
      summary() {
        return n1Score(read, peak);
      },
    };
    return {
      seed,
      seconds: N1_EXPOSE_AT + N1_READ_AFTER,
      map: (s) => generateOneWorld(s),
      colonies: [{ antCount: 60 }],
      events: [
        {
          at: N1_EXPOSE_AT,
          kind: "call",
          run: (g: Game) => {
            const c = g.colonies[0]!;
            exposed = insideAnt(c);
            if (exposed < 0) return;
            c.load[exposed] = N1_DOSE;
            c.strain[exposed] = BLOOM;
            // The fungus steps only while it has a host or spores: a dose set by hand is a host from now.
            g.fungus.hosts = Math.max(1, g.fungus.hosts);
          },
        },
      ],
      probes: [probe],
    };
  },
  score: () => ({}),
};

/**
 * N3: the odour distances, in steps of one recognition band (recognition.ts reads odour in 10 bands: review of #228, N2), from alike to twice
 * the generic tolerance (0.35).
 */
export const N3_DISTANCES = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7] as const;
/** N3: the first colony's odour, a band's centre, so every distance lands on one too. */
export const N3_BASE = binCentre(binOf(0.2));
/** N3: trials per distance, each on its own world (owner, review of #228 D1: classed over repeated trials, as Ugelvig's pairs were). */
export const N3_TRIALS = 5;
/** N3: seconds each trial plays. */
export const N3_SECONDS = 240;
/** N3: a peaceful trial counts only if the colonies met for this many ant-seconds: on some worlds they barely do, and a trial with no meeting can't fight. */
export const N3_MIN_MEET = 5;
/** N3: within this (world units) an ant of one colony meets one of the other. */
const MEET = 2.5;

/** The distance and trial seed s plays: seeds 1–8 the eight distances on world 1, 9–16 on world 2, … to 40 (N3_TRIALS worlds). */
export function n3Trial(seed: number): { distance: number; trial: number } {
  const k = Math.max(0, seed - 1);
  return { distance: N3_DISTANCES[k % N3_DISTANCES.length]!, trial: Math.floor(k / N3_DISTANCES.length) };
}

/** A distance's class over its trials: 0 never aggressive (no trial fought), 2 always (every trial did), 1 mixed. */
export type N3Class = 0 | 1 | 2;

/**
 * N3's classes from its runs (each with `distance`, `meetings` and `fought`), over the trials where the colonies met (N3_MIN_MEET): per
 * distance (one with no such trial is left out), and the shares never, always and mixed.
 */
export function classN3(runs: readonly { distance: number; meetings: number; fought: number }[]): {
  byDistance: Map<number, N3Class>;
  never: number;
  always: number;
  mixed: number;
} {
  const tally = new Map<number, { fought: number; trials: number }>();
  for (const r of runs) {
    // A trial that fought counts however short the meeting (review of #228, S3): only an unmet, peaceful trial says nothing.
    if (r.meetings < N3_MIN_MEET && !r.fought) continue;
    const t = tally.get(r.distance) ?? { fought: 0, trials: 0 };
    t.trials++;
    if (r.fought) t.fought++;
    tally.set(r.distance, t);
  }
  const byDistance = new Map<number, N3Class>();
  for (const [d, t] of [...tally].sort((a, b) => a[0] - b[0])) byDistance.set(d, t.fought === 0 ? 0 : t.fought === t.trials ? 2 : 1);
  const n = Math.max(1, byDistance.size);
  const share = (k: N3Class): number => [...byDistance.values()].filter((v) => v === k).length / n;
  return { byDistance, never: share(0), always: share(2), mixed: share(1) };
}

/**
 * N3 — graded tolerance (Ugelvig et al. 2008, *L. neglectus*, full text): of 91 population pairs, 14 % were never aggressive, 19 % always,
 * 67 % mixed, aggression tracking chemical distance. A trial: two colonies of 60 on one world, the second's odour a distance from the first's
 * (n3Trial); it reports the meetings (ant-seconds of the first colony beside the second's ants), the fight deaths and whether any (`fought`).
 * A distance is classed over its N3_TRIALS trials (classN3: never, always, mixed); seeds 1–40 play every distance on five worlds. The slow
 * test holds the target (mostly mixed, rising with distance) as a todo. Today recognition is a step at the tolerance: strangers or not.
 */
export const neglectusTolerance: Assay = {
  id: "n3",
  title: "N3 graded tolerance: colonies fight in proportion to how unalike they smell (one world)",
  target:
    "over seeds 1–40 (odour distances 0–0.7, 5 trials each): 14 % of distances never aggressive, 19 % always, 67 % mixed, by distance (Ugelvig et al. 2008, full text)",
  seconds: N3_SECONDS,
  spec: (seed): RunSpec => {
    const { distance: d, trial } = n3Trial(seed);
    let meetings = 0;
    const probe: Probe = {
      tick(game, dt) {
        const [a, b] = game.colonies;
        if (!a || !b) return;
        for (let i = 0; i < a.n; i++) {
          if (!a.alive[i]) continue;
          for (let j = 0; j < b.n; j++)
            if (b.alive[j] && a.layer[i] === b.layer[j] && Math.hypot(a.x[i]! - b.x[j]!, a.y[i]! - b.y[j]!) < MEET) {
              meetings += dt;
              break;
            }
        }
      },
      summary(game) {
        const deaths = game.colonies.reduce((s, c) => s + c.losses, 0);
        return { distance: d, trial, meetings, deaths, fought: deaths > 0 ? 1 : 0 };
      },
    };
    return {
      seed,
      seconds: N3_SECONDS,
      // A trial's distances share one world, so they are compared on the same ground; each trial is another world.
      map: () => generateOneWorld(1 + trial),
      colonies: [
        { antCount: 60, colony: { odour: N3_BASE } },
        { antCount: 60, colony: { odour: N3_BASE + d } },
      ],
      probes: [probe],
    };
  },
  score: () => ({}),
};
