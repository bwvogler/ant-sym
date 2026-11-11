import type { CacheStore } from "./colonyJev.ts";

// Where the colony client's cached answers outlive the page: localStorage, one
// key per context. Pure apart from the storage it is handed, so node --test
// covers it (ja-ue6). Saving merges with what is stored now, so two tabs
// asking under the same context keep each other's answers instead of the last
// writer's replacing the rest. The client checks each answer against its lane
// when it loads them (colonyJev.validAnswer); here only the shape is checked.

export const STORE_PREFIX = "jev-ants:colony-policy:";

type Storage = Pick<globalThis.Storage, "getItem" | "setItem">;

function pairs(raw: string | null): [string, string][] {
  if (!raw) return [];
  const entries = JSON.parse(raw) as unknown;
  return Array.isArray(entries)
    ? entries.filter(
        (e): e is [string, string] => Array.isArray(e) && e.length === 2 && typeof e[0] === "string" && typeof e[1] === "string",
      )
    : [];
}

/** A CacheStore over `storage()` (a getter: reading localStorage itself can throw when storage is blocked). */
export function storageCache(storage: () => Storage | null, prefix = STORE_PREFIX): CacheStore {
  return {
    load(context) {
      try {
        return pairs(storage()?.getItem(prefix + context) ?? null);
      } catch {
        return []; // storage blocked or unreadable: start cold
      }
    },
    save(context, entries) {
      try {
        const s = storage();
        if (!s) return;
        let stored: [string, string][] = [];
        try {
          stored = pairs(s.getItem(prefix + context));
        } catch {
          // unreadable: this tab's answers replace it
        }
        const merged = new Map(stored);
        for (const [k, v] of entries) merged.set(k, v);
        s.setItem(prefix + context, JSON.stringify([...merged]));
      } catch {
        // storage blocked or full: the cache still lives for this page load
      }
    },
  };
}

/** The page's store: the browser's localStorage, when there is one. */
export const browserCache: CacheStore = storageCache(() => (typeof localStorage === "undefined" ? null : localStorage));
