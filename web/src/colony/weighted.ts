// A choice answer kept with Jev's probabilities (ja-nan3): "follow=0.62,explore=0.3,return=0.08". Jev's choice
// comes back with a probability for every option; before this the caches kept only the choice, so every ant in one
// situation did the same thing and whole groups flipped together. The choice Jev gave comes first, so `topOf` is the
// answer the caches held before; a bare choice ("follow") is a certain one and still reads everywhere. A leaf: no colony
// imports, so the brains, the lanes, the page and the scripts can all use it.

/**
 * What a colony hands its mode policy to draw with: uniform in [0, 1) from the colony's own rng, and the temperature the
 * colony draws at (params.sampleTemp). A policy that draws calls it once (`pick`).
 */
export interface Draw {
  (): number;
  readonly temperature: number;
}

/** Options below this probability are left out of a weighted answer (they would almost never be drawn). */
export const MIN_WEIGHT = 0.005;

/**
 * The answer to keep for a choice: `top` (Jev's choice) with the probabilities of the options `allowed`, most likely
 * after it, rounded to three places; `top=1` when every other option is under MIN_WEIGHT (Jev was asked and was certain:
 * `precache.mjs --reweigh` does not ask it again); just `top` when there are no probabilities.
 */
export function weigh(top: string, probabilities: Readonly<Record<string, number>> | null | undefined, allowed: readonly string[]): string {
  if (!probabilities) return top;
  const kept = allowed
    .map((c) => [c, probabilities[c]] as const)
    .filter((e): e is readonly [string, number] => Number.isFinite(e[1]) && e[1]! >= MIN_WEIGHT);
  const total = kept.reduce((a, [, p]) => a + p, 0);
  if (!(total > 0) || !kept.some(([c]) => c === top)) return top;
  const rest = kept.filter(([c]) => c !== top).sort((a, b) => b[1] - a[1]);
  if (rest.length === 0) return `${top}=1`;
  const part = (c: string, p: number) => `${c}=${Number((p / total).toFixed(3))}`;
  return [part(top, kept.find(([c]) => c === top)![1]), ...rest.map(([c, p]) => part(c, p))].join(",");
}

/** Whether an answer carries probabilities (a bare choice does not). */
export function isWeighted(answer: string): boolean {
  return answer.includes("=");
}

/** The choice Jev gave: the answer itself when bare, else its first option. */
export function topOf(answer: string): string {
  const end = answer.search(/[=,]/);
  return end < 0 ? answer : answer.slice(0, end);
}

/** A weighted answer's options and probabilities, in its order; a bare choice is [[choice, 1]]; null when it doesn't parse. */
export function weightsOf(answer: string): [string, number][] | null {
  if (!isWeighted(answer)) return answer ? [[answer, 1]] : null;
  const out: [string, number][] = [];
  for (const part of answer.split(",")) {
    const eq = part.indexOf("=");
    if (eq <= 0) return null;
    const p = Number(part.slice(eq + 1));
    if (!Number.isFinite(p) || p < 0 || p > 1) return null;
    out.push([part.slice(0, eq), p]);
  }
  return out;
}

/** Whether every option of an answer is one the question allows (`ok`), and it parses. */
export function weightedValid(answer: string, ok: (choice: string) => boolean): boolean {
  const w = weightsOf(answer);
  return w !== null && w.length > 0 && w.every(([c]) => ok(c));
}

interface Distribution {
  temperature: number;
  weights: [string, number][];
  total: number;
}

// Many ants draw from the same answers every tick. Keep the last temperature used for each answer.
const DISTRIBUTION_LIMIT = 1024;
const distributions = new Map<string, Distribution>();

function distributionOf(answer: string, temperature: number): Distribution | undefined {
  const cached = distributions.get(answer);
  if (cached?.temperature === temperature) return cached;
  const weights = weightsOf(answer);
  if (!weights || weights.length < 2) return undefined;
  let total = 0;
  for (const entry of weights) {
    if (temperature !== 1) entry[1] = entry[1] ** (1 / temperature);
    total += entry[1];
  }
  if (!cached && distributions.size >= DISTRIBUTION_LIMIT) {
    distributions.delete(distributions.keys().next().value!);
  }
  const distribution = { temperature, weights, total };
  distributions.set(answer, distribution);
  return distribution;
}

/**
 * The option to act on: one drawn by its probability, sharpened or flattened by the temperature (p^(1/T): 1 as Jev gave
 * it, under 1 toward its choice, over 1 toward even; `draw.temperature` unless given), with `draw()` called exactly once.
 * With no `draw`, a bare or certain answer, or temperature 0, Jev's choice and `draw` is never called: a game that never meets a
 * weighted answer draws nothing more than it did (the golden masters).
 */
export function pick(
  answer: string,
  draw?: (() => number) & { readonly temperature?: number },
  temperature = draw?.temperature ?? 1,
): string {
  if (!draw || !isWeighted(answer) || !(temperature > 0)) return topOf(answer);
  const distribution = distributionOf(answer, temperature);
  if (!distribution) return topOf(answer); // a certain answer ("return=1") is not drawn from
  const { weights, total } = distribution;
  let u = draw() * total;
  for (const [choice, weight] of weights) {
    u -= weight;
    if (u < 0) return choice;
  }
  return weights[weights.length - 1]![0];
}

/**
 * What a colony hands a response hook to draw with (ja-m7rr). The hooks are asked every step, not once a situation as the mode
 * is, so a fresh draw each step would flip a fighter between fight and flee step by step, and a carrier with a one-in-ten
 * "put down" would drop its load within a few steps. Instead `draw(salt)` is uniform in [0, 1) for the ant being stepped and
 * `salt` (the hook and its situation's key) and the same on every call while it holds: an ant keeps what it drew for as long as
 * its situation lasts, and draws afresh after `reroll` seconds, as with its mode. `temperature` is the colony's, as for the mode.
 */
export interface AntDraw {
  (salt: string): number;
  readonly temperature: number;
}

/** A uniform in [0, 1) from a string (FNV-1a, then murmur3's finaliser so that near strings land far apart). */
export function unitOf(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** `pick` for a response: drawn with the ant's draw for `salt` (once), or with no draw Jev's choice. */
export function pickFor(answer: string, draw: AntDraw | undefined, salt: string): string {
  if (!draw) return topOf(answer);
  return pick(answer, () => draw(salt), draw.temperature);
}
