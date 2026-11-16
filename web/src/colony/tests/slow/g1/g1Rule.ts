// G1's rule in one place: oneWorldG1.test.ts (npm run test:slow) and scripts/g1-verdict.mjs (slow.yml's `g1 verdict` job, which
// merges the per-seed results of the `g1 (n)` runners) both judge with it. The history of the numbers, owner decisions
// included, is in oneWorldG1.test.ts's header.
export const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
export const BOUND = 2;
export const WITHIN = 5;
export const CEILING = 10;

/** One seed's game: the most foragers holding food over 120 s at any sample, per colony and the worse of the two. */
export interface Held {
  seed: number;
  you: number;
  rival: number;
  worst: number;
}

export interface Verdict {
  ok: boolean;
  /** Seeds within BOUND. */
  within: number;
  /** "seed 1: 0 / 1; ..." */
  table: string;
  /** One line per broken part of the rule, each naming its seeds. Empty when ok. */
  failures: string[];
}

/** G1_SEEDS, the seeds a CI runner plays: a comma list of distinct seeds of 1-10; unset or empty is all ten. */
export function seedsFrom(spec: string | undefined): number[] {
  if (!spec?.trim()) return SEEDS;
  const seeds = spec.split(",").map((s) => Number(s.trim()));
  if (seeds.some((s) => !SEEDS.includes(s)) || new Set(seeds).size !== seeds.length) {
    throw new Error(`G1_SEEDS "${spec}": a comma list of distinct seeds from 1-10`);
  }
  return seeds;
}

/** The rule over seeds 1-10: a result for every seed, at least WITHIN of them within BOUND, none at CEILING or more. */
export function judge(held: Held[], seeds: number[] = SEEDS): Verdict {
  const sorted = [...held].sort((a, b) => a.seed - b.seed);
  const within = sorted.filter((h) => h.worst <= BOUND).length;
  const table = sorted.map((h) => `seed ${h.seed}: ${h.you} / ${h.rival}`).join("; ");
  const failures: string[] = [];
  const missing = seeds.filter((s) => !sorted.some((h) => h.seed === s));
  if (missing.length > 0) failures.push(`no result for seeds ${missing.join(" ")} (their runners failed)`);
  if (within < WITHIN) failures.push(`${within} of ${seeds.length} seeds within ${BOUND} (need ${WITHIN}): ${table}`);
  const jam = sorted.filter((h) => h.worst >= CEILING);
  if (jam.length > 0) failures.push(`seeds at ${CEILING} or more: ${jam.map((h) => h.seed).join(" ")} (${table})`);
  return { ok: failures.length === 0, within, table, failures };
}
