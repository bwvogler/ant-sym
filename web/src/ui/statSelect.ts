import type { GameLoop } from "./gameLoop.ts";
import type { ColonyStats } from "./stats.ts";

// A slice of the stats, for a component that needs one thing (ja-fnd.6.1, docs/refactor.md S5.1): the loop takes new stats about seven
// times a second, and a component that selects `flights > 0` or the clock should draw again when that changes, not on every tick. The
// logic is plain TypeScript so it is tested without React; session.ts's useStats puts it behind useSyncExternalStore.

/** Whether two selected values are the same one (what a component keeps its last render for). */
export type Equal<T> = (a: T, b: T) => boolean;

/** What `select` makes of the stats the loop holds, kept while neither the stats, the selector nor (by `eq`) the result changed. */
export class StatSelection<T> {
  readonly #loop: Pick<GameLoop, "stats" | "subscribe">;
  #seen: { stats: ColonyStats | null; select: (s: ColonyStats | null) => T; value: T } | null = null;

  constructor(loop: Pick<GameLoop, "stats" | "subscribe">) {
    this.#loop = loop;
  }

  subscribe = (fn: () => void): (() => void) => this.#loop.subscribe(fn);

  /** The selected value now. The same value (by `eq`) comes back as long as it is unchanged, which useSyncExternalStore needs of a snapshot. */
  read(select: (s: ColonyStats | null) => T, eq: Equal<T> = Object.is): T {
    const stats = this.#loop.stats();
    const seen = this.#seen;
    if (seen && seen.stats === stats && seen.select === select) return seen.value;
    const next = select(stats);
    const value = seen && eq(seen.value, next) ? seen.value : next;
    this.#seen = { stats, select, value };
    return value;
  }
}

/**
 * A gate that lets a stats tick through at most once every `everyMs` (of `now`'s clock): the first always, then not again until the time
 * has passed. A component that draws afresh on a schedule (an ant's card, the nest tab) takes its pace from the loop's ticks through one.
 */
export function tickGate(everyMs: number, now: () => number): () => boolean {
  let last = -Infinity;
  return () => {
    const t = now();
    if (t - last < everyMs) return false;
    last = t;
    return true;
  };
}

/** Whether two lists hold the same items in order (Object.is). */
export const sameList = <T>(a: readonly T[], b: readonly T[]): boolean => a.length === b.length && a.every((x, i) => Object.is(x, b[i]));

/** Whether two records hold the same keys with the same values (Object.is). */
export function sameRecord<T>(a: Readonly<Record<string, T>> | null, b: Readonly<Record<string, T>> | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  const ka = Object.keys(a);
  return ka.length === Object.keys(b).length && ka.every((k) => k in b && Object.is(a[k], b[k]));
}

// Selectors the page uses more than once, as module-level functions so a component's selector doesn't change between renders.

/** All of the stats (a leaf that shows many of them draws on every tick, which is what it asks for). */
export const wholeStats = (s: ColonyStats | null): ColonyStats | null => s;
/** The sim clock, in seconds (0 before the first stats). */
export const simTime = (s: ColonyStats | null): number => s?.time ?? 0;
/** Whether a new queen is in the air (the game waits for the page to found her). */
export const flightInAir = (s: ColonyStats | null): boolean => !!s && s.flights > 0;
/** Where the game stands: "playing", "unified" or "fallen". */
export const outcomeOf = (s: ColonyStats | null): ColonyStats["outcome"] => s?.outcome ?? "playing";
/** The chapter the player is in (undefined before the first stats). */
export const chapterNameOf = (s: ColonyStats | null): ColonyStats["chapter"]["chapter"] | undefined => s?.chapter.chapter;
/** The fungus's body and evolution (null before it lands). */
export const evolutionOf = (s: ColonyStats | null): ColonyStats["evolution"] => s?.evolution ?? null;
/** Situations any colony has been asked in (null before the first stats). */
export const situationsSeenOf = (s: ColonyStats | null): number | null => (s ? s.situationsSeen : null);
/** The sim seconds a wall second the machine really manages, when it falls short of the speed asked (below 85% of it) while playing; else null. */
export const slowPace = (s: ColonyStats | null, playing: boolean, speed: number): number | null =>
  s && playing && s.pace > 0 && s.pace < speed * 0.85 ? s.pace : null;
