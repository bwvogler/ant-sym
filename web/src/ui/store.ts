import { useSyncExternalStore } from "react";

// The page's one store pattern (ja-fnd.6.1.1, docs/refactor.md S5.1): a value any surface reads, a set that tells whoever is listening,
// and a React hook over useSyncExternalStore. The Lab's, the Codex's and the lens's stores each wrote the same listeners set, subscribe and
// hook by hand; they are this now. A selector over a store's value (a slice that draws only when it changes) comes with its first caller;
// session.ts's StatSelection is that for the game's stats. A set tells the listeners as they stood when it began (a listener added or
// removed while it tells waits for the next set). It is for the page's own state, which outlives a game. The game's own readings (the stats, the frame
// count) stay in session.ts, a context over the game's loop: that is per game, and rate-gated.

/** Whether two values are the same one (what a store or a selector keeps its last value for). */
export type Equal<T> = (a: T, b: T) => boolean;

export interface StoreOptions<T> {
  /**
   * A set to a value this calls equal to the one held changes nothing and tells nobody. Without it every set tells (the Lab's store wants
   * that: a "?" pressed again sets an equal target, and its section must open again).
   */
  equal?: Equal<T>;
}

export interface Store<T> {
  get(): T;
  set(next: T): void;
  update(change: (now: T) => T): void;
  subscribe(fn: () => void): () => void;
  /** Back to the starting value, and tell the listeners (nobody, if `equal` calls it the value held; for a test: a module's store outlives one test). */
  reset(): void;
}

export function createStore<T>(initial: T, opts: StoreOptions<T> = {}): Store<T> {
  let current = initial;
  const listeners = new Set<() => void>();
  const set = (next: T): void => {
    if (opts.equal?.(current, next)) return;
    current = next;
    for (const fn of [...listeners]) fn();
  };
  return {
    get: () => current,
    set,
    update: (change) => set(change(current)),
    subscribe(fn) {
      listeners.add(fn);
      return () => void listeners.delete(fn);
    },
    reset: () => set(initial),
  };
}

/** The store's value, drawn again when it is set. `server`: what a render with no browser shows (default: the value held). */
export function useStore<T>(store: Store<T>, server?: T): T {
  return useSyncExternalStore(store.subscribe, store.get, server === undefined ? store.get : () => server);
}
