// The page's one way to keep a value in the browser (ja-fnd.6.1.2, docs/refactor.md S5.1). Storage may be missing, blocked (reading the
// `localStorage` property itself can throw) or full: a value then lives for this page only and nothing breaks. Every key-value store that
// outlives a page (the theme, the sound, the notice level, the Codex's notebook, the passphrase) reads and writes through `persisted`, so the
// guard is written once (the answers cache takes only `browserStorage`; saved games are in IndexedDB). Key names stay as each store chose them.

/** What a key's store must have; the browser's localStorage does, and a test's stand-in. */
export type KeyStore = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/** The browser's localStorage, or null where there is none or the browser refuses it. */
export function browserStorage(): KeyStore | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

export interface PersistedOptions {
  /** Where to keep it (a getter, so a blocked storage is met when it is read); the browser's by default. */
  store?: () => KeyStore | null;
  /** Also keep the last value set in this page, for what the storage cannot hold (blocked, or another tab emptied it): get falls back to it. */
  memory?: boolean;
}

/** One key's string value: null for none. */
export interface Persisted {
  get(): string | null;
  /** Keep a value, or null to forget it. Never throws. */
  set(value: string | null): void;
}

export function persisted(key: string, opts: PersistedOptions = {}): Persisted {
  const store = opts.store ?? browserStorage;
  let memory: string | null = null;
  return {
    get() {
      let v: string | null = null;
      try {
        v = store()?.getItem(key) ?? null;
      } catch {
        // blocked: as none
      }
      return opts.memory ? (v ?? memory) : v;
    },
    set(value) {
      memory = value;
      try {
        if (value === null) store()?.removeItem(key);
        else store()?.setItem(key, value);
      } catch {
        // blocked or full: it holds for this page only (with `memory`), else not at all
      }
    },
  };
}
