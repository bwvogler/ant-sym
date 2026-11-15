// The invasive garden ant's assays (ja-e668.2, docs/lasius-neglectus.md "The mechanic", PRD §64.2), on the harness (harness.ts). ONE_ASSAYS
// lists them (experiment.ts). Landed before the species (no behaviour change): today they measure the generic ant, the baseline. N2
// (destructive disinfection) and N4 (budding) have nothing to measure yet (the game's brood carries no fungus; a colony never buds): they come
// with their mechanics (ja-e668.5, ja-e668.6), and tests/slow/assays.test.ts holds them as todos.

import { type Colony, PLANE } from "./colony.ts";
import { INFECTED, STRAINS } from "./fungus.ts";
import { Game } from "./game.ts";
import { generateOneWorld } from "./oneWorld.ts";

import { type Assay, type Probe, type RunSpec } from "./harness.ts";

/** N1: when the exposed ant is dosed, and how long after it the spread is read (game seconds stand in for Konrad's days 3–5: design). */
export const N1_EXPOSE_AT = 20;
export const N1_READ_AFTER = 120;
/** N1: the exposed ant's dose (Konrad et al. 2012 applied a lethal dose: about half the exposed died). */
export const N1_DOSE = 0.8;

const BLOOM = STRAINS.findIndex((s) => s.id === "bloom");

/** The first living ant of colony c inside its nest (not on one world's plane): the exposed ant, chosen without a random draw. */
function insideAnt(c: Colony): number {
  for (let i = 0; i < c.n; i++) if (c.alive[i] && c.layer[i] !== PLANE) return i;
  return -1;
}

/**
 * N1 — immunisation (Konrad et al. 2012, *L. neglectus* and *Metarhizium*, full text): one worker inside the nest takes a heavy dose of Bloom
 * (the game's *Metarhizium*). Konrad: by days 3–5 about two-thirds of nestmates (64 %) carried a low-level infection, their loads about 8–12
 * times lower than the exposed ant's; grooming primes them. Deaths are not modelled (the game's fungus kills no worker by itself:
 * lasius-neglectus.md §3, For the model). Pass, both: nestmates carrying a load (≥ INFECTED) between 40 % and 85 % N1_READ_AFTER s after the
 * dose, and the exposed ant's peak at least 8 times the carriers' median load. Today grooming is fixed-rate and contact passes load freely.
 */
export const neglectusImmunisation: Assay = {
  id: "n1",
  title: "N1 immunisation: a sick nestmate's fungus spreads thin, as low loads, through its nestmates (one world)",
  target:
    "nestmates with a load 40–85 % (64 %) and their median load ≤ 1/8 of the exposed ant's peak (8–12×), Konrad et al. 2012 (full text)",
  seconds: N1_EXPOSE_AT + N1_READ_AFTER,
  spec: (seed): RunSpec => {
    let exposed = -1;
    let peak = 0;
    let read: Record<string, number> | null = null;
    const probe: Probe = {
      tick(game) {
        const c = game.player;
        if (exposed < 0) return;
        peak = Math.max(peak, c.load[exposed] ?? 0);
        if (read || game.time < N1_EXPOSE_AT + N1_READ_AFTER - 1e-6) return;
        let mates = 0;
        let carriers = 0;
        let resist = 0;
        const loads: number[] = [];
        for (let i = 0; i < c.n; i++) {
          if (!c.alive[i] || i === exposed) continue;
          mates++;
          resist += c.resist[i]!;
          if (c.load[i]! >= INFECTED) {
            carriers++;
            loads.push(c.load[i]!);
          }
        }
        loads.sort((a, b) => a - b);
        const median = loads.length ? loads[loads.length >> 1]! : 0;
        read = {
          carriers: mates ? carriers / mates : 0,
          medianLoad: median,
          peakRatio: median > 0 ? peak / median : Infinity,
          meanResist: mates ? resist / mates : 0,
          exposedPeak: peak,
          exposedNow: c.alive[exposed] ? c.load[exposed]! : 0,
        };
      },
      summary() {
        const r = read ?? { carriers: NaN, medianLoad: NaN, peakRatio: NaN, meanResist: NaN, exposedPeak: peak, exposedNow: NaN };
        return { ...r, pass: r.carriers >= 0.4 && r.carriers <= 0.85 && r.peakRatio >= 8 ? 1 : 0 };
      },
    };
    return {
      seed,
      seconds: N1_EXPOSE_AT + N1_READ_AFTER,
      map: (s) => generateOneWorld(s),
      game: { antCount: 60, rival: false },
      events: [
        {
          at: N1_EXPOSE_AT,
          kind: "call",
          run: (g: Game) => {
            const c = g.player;
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

/** N3: the odour distances the seeds play, in turn (seed 1 the first): from alike to as far apart as the generic tolerance (0.35) twice over. */
export const N3_DISTANCES = [0, 0.1, 0.2, 0.3, 0.35, 0.4, 0.45, 0.5, 0.6, 0.7] as const;
/** N3: seconds each pair plays. */
export const N3_SECONDS = 240;
/** N3: within this (world units) an ant of one colony meets one of the other. */
const MEET = 2.5;
/** N3: fight deaths per 100 meetings (an ant-second beside a stranger) from which a pair counts as always aggressive (design). */
export const N3_ALWAYS = 5;

/**
 * N3 — graded tolerance (Ugelvig et al. 2008, *L. neglectus*, full text): of 91 population pairs, 14 % were never aggressive, 19 % always,
 * 67 % mixed, aggression tracking chemical distance. Two colonies of 60 on one world, the second's odour N3_DISTANCES[seed − 1 mod 10] from the
 * first's; the run reports the meetings (ant-seconds of the first colony beside the second's ants), the fight deaths, and its class: 0 never
 * (no fight death), 2 always (N3_ALWAYS or more per 100 meetings), 1 mixed. Over seeds 1–10 the target is mostly mixed, graded by distance
 * (the slow test holds that as a todo). Today recognition is a step at the tolerance: strangers or not, so no pair is mixed.
 */
export const neglectusTolerance: Assay = {
  id: "n3",
  title: "N3 graded tolerance: colonies fight in proportion to how unalike they smell (one world)",
  target:
    "over seeds 1–10 (odour distances 0–0.7): 14 % of pairs never aggressive, 19 % always, 67 % mixed, by distance (Ugelvig et al. 2008, full text)",
  seconds: N3_SECONDS,
  spec: (seed): RunSpec => {
    const d = N3_DISTANCES[(((seed - 1) % N3_DISTANCES.length) + N3_DISTANCES.length) % N3_DISTANCES.length]!;
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
        const per100 = meetings > 0 ? (100 * deaths) / meetings : 0;
        return { distance: d, meetings, deaths, per100, kind: deaths === 0 ? 0 : per100 >= N3_ALWAYS ? 2 : 1 };
      },
    };
    return {
      seed,
      seconds: N3_SECONDS,
      // Seeds 1–10 share one world (seeds 11–20 the next), so the distances are compared on the same ground.
      map: (s) => generateOneWorld(1 + Math.floor((s - 1) / N3_DISTANCES.length)),
      game: { antCount: 60, rivalAnts: 60 },
      sides: { colony: { odour: 0.2 }, rival: { odour: 0.2 + d } },
      probes: [probe],
    };
  },
  score: () => ({}),
};
