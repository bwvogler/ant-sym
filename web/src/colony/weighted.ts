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
 * after it, rounded to three places; just `top` when there are no probabilities or every other option is under MIN_WEIGHT.
 */
export function weigh(top: string, probabilities: Readonly<Record<string, number>> | null | undefined, allowed: readonly string[]): string {
  if (!probabilities) return top;
  const kept = allowed
    .map((c) => [c, probabilities[c]] as const)
    .filter((e): e is readonly [string, number] => Number.isFinite(e[1]) && e[1]! >= MIN_WEIGHT);
  const total = kept.reduce((a, [, p]) => a + p, 0);
  if (!(total > 0) || !kept.some(([c]) => c === top)) return top;
  const rest = kept.filter(([c]) => c !== top).sort((a, b) => b[1] - a[1]);
  if (rest.length === 0) return top;
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

/**
 * The option to act on: one drawn by its probability, sharpened or flattened by the temperature (p^(1/T): 1 as Jev gave
 * it, under 1 toward its choice, over 1 toward even; `draw.temperature` unless given), with `draw()` called exactly once.
 * With no `draw`, a bare answer, or temperature 0, Jev's choice and `draw` is never called: a game that never meets a
 * weighted answer draws nothing more than it did (the golden masters).
 */
export function pick(
  answer: string,
  draw?: (() => number) & { readonly temperature?: number },
  temperature = draw?.temperature ?? 1,
): string {
  if (!draw || !isWeighted(answer) || !(temperature > 0)) return topOf(answer);
  const w = weightsOf(answer);
  if (!w) return topOf(answer);
  const scaled = temperature === 1 ? w.map(([, p]) => p) : w.map(([, p]) => p ** (1 / temperature));
  const total = scaled.reduce((a, b) => a + b, 0);
  let u = draw() * total;
  for (let k = 0; k < w.length; k++) {
    u -= scaled[k]!;
    if (u < 0) return w[k]![0];
  }
  return w[w.length - 1]![0];
}
