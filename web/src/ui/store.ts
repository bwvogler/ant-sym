import { useRef, useSyncExternalStore } from "react";

// The page's one store pattern (ja-fnd.6.1.1, docs/refactor.md S5.1): a value any surface reads, a set that tells whoever is listening,
// and a React hook over useSyncExternalStore. The Lab's, the Codex's and the lens's stores each wrote the same listeners set, subscribe and
// hook by hand; they are this now. It is for the page's own state, which outlives a game. The game's own readings (the stats, the frame
// count) stay in session.ts, a context over the game's loop: that is per game, and rate-gated.

/** Whether two values are the same one (what a store or a selector keeps its last value for). */
export type Equal<T> = (a: T, b: T) => boolean;

export interface StoreOptions<T> {
  /**
   * A set to a value this calls equal to the one held changes nothing and tells nobody. Without it every set tells (the Lab's store wants
   * that: a "?" pressed again sets an equal target, and its section must open again).
   */
  equal?: Equal<T>;
  /** What a render with no browser shows (default: the value held). */
  server?: T;
}

export interface Store<T> {
  get(): T;
  set(next: T): void;
  update(change: (now: T) => T): void;
  subscribe(fn: () => void): () => void;
  /** Back to the starting value, and tell the listeners (for a test: a module's store outlives one test). */
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

/** The store's value, drawn again when it is set. */
export function useStore<T>(store: Store<T>, opts?: Pick<StoreOptions<T>, "server">): T {
  return useSyncExternalStore(store.subscribe, store.get, opts && "server" in opts ? () => opts.server as T : store.get);
}

/**
 * What `select` makes of a store's value, kept while neither the value, the selector nor (by `eq`) the result changed: the memo
 * useSyncExternalStore needs of a snapshot, as plain TypeScript so it is tested without React.
 */
export class Selection<S, T> {
  #seen: { source: S; select: (s: S) => T; value: T } | null = null;

  read(source: S, select: (s: S) => T, eq: Equal<T> = Object.is): T {
    const seen = this.#seen;
    if (seen && seen.source === source && seen.select === select) return seen.value;
    const next = select(source);
    const value = seen && eq(seen.value, next) ? seen.value : next;
    this.#seen = { source, select, value };
    return value;
  }
}

/** A slice of a store's value: the component draws again when `eq` (Object.is by default) says the slice changed, not on every set. */
export function useStoreSelector<S, T>(store: Store<S>, select: (s: S) => T, eq?: Equal<T>): T {
  const memo = useRef<Selection<S, T> | null>(null);
  const sel = (memo.current ??= new Selection<S, T>());
  const read = () => sel.read(store.get(), select, eq);
  return useSyncExternalStore(store.subscribe, read, read);
}
