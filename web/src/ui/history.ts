import type { Colony, Fungus } from "../colony/index.ts";

// Lab mode's history (PRD §69.6, ja-mvo9.4): the game sampled once a sim-second, for the History tab's charts. Pure, so
// `node --test` covers it. The buffer keeps the whole game in at most HISTORY_POINTS samples: when it fills, every other
// sample goes and the interval doubles, so a long game reads at a coarser grain rather than losing its start.

/** One moment of the game. Per colony (by index): the share of its living ants carrying the fungus, and how many live. */
export interface Sample {
  t: number;
  infected: number[];
  living: number[];
  /** the two nests' odours apart (Game.unity().gap: 1 at the start) */
  gap: number;
  /** mutations to keep */
  mutations: number;
}

/** At most this many samples are kept. */
export const HISTORY_POINTS = 600;

export class History {
  #samples: Sample[] = [];
  #every = 1;
  #next = 0;

  /** The samples, oldest first. */
  get samples(): readonly Sample[] {
    return this.#samples;
  }

  /** Seconds of game between samples now (1, then 2, 4, … as the game outgrows the buffer). */
  get every(): number {
    return this.#every;
  }

  /**
   * Take a sample at game time t if one is due (`take` builds it only then). Time gone back (a restart, a load) starts the
   * history afresh. Returns whether a sample was taken.
   */
  offer(t: number, take: () => Sample): boolean {
    const last = this.#samples[this.#samples.length - 1];
    if (last && t < last.t) this.reset();
    if (t < this.#next) return false;
    this.#samples.push(take());
    if (this.#samples.length > HISTORY_POINTS) {
      this.#samples = this.#samples.filter((_, i) => i % 2 === 0);
      this.#every *= 2;
    }
    this.#next = t + this.#every; // after any halving: the next sample at the new interval
    return true;
  }

  reset(): void {
    this.#samples = [];
    this.#every = 1;
    this.#next = 0;
  }
}

/** A sample of the game now: every colony's infected share and living count, the odours' gap, the mutations. */
export function sampleOf(t: number, colonies: readonly Colony[], fungus: Fungus, gap: number, mutations: number): Sample {
  const infected: number[] = [];
  const living: number[] = [];
  for (const c of colonies) {
    const n = fungus.census(c);
    infected.push(n.living > 0 ? n.infected / n.living : 0);
    living.push(n.living);
  }
  return { t, infected, living, gap, mutations };
}

/** A round top for a chart's y axis: 1, 2 or 5 times a power of ten, at least the largest value (and at least `floor`). */
export function niceMax(values: readonly number[], floor = 1): number {
  const m = Math.max(floor, ...values);
  const p = 10 ** Math.floor(Math.log10(m));
  for (const k of [1, 2, 5, 10]) if (k * p >= m) return k * p;
  return 10 * p;
}

/** The index of the sample nearest time t (the crosshair's snap), or −1 with none. */
export function nearestSample(samples: readonly Sample[], t: number): number {
  if (!samples.length) return -1;
  let lo = 0;
  let hi = samples.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (samples[mid]!.t < t) lo = mid + 1;
    else hi = mid;
  }
  return lo > 0 && t - samples[lo - 1]!.t < samples[lo]!.t - t ? lo - 1 : lo;
}
