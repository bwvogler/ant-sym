import type { GameSave } from "../colony/game.ts";
import type { DoctrineChoice } from "./useColonyJev.ts";
import type { Ground } from "./useColony.ts";

// Saved games (the fungus game, ja-lo8.6): a game is long (queen births are rare: PRD §49), so it is kept between
// sittings. A record is the game's own save (Game.save) plus what the page needs to build the same game again (its
// world seed, view and settings) and the player's state (the fungus's aim, menu and rule; each colony's doctrine).
// Slot 0 is the autosave (every AUTOSAVE_MS and when the tab is hidden); slots 1 and 2 are the player's. Kept in
// IndexedDB (localStorage is too small for a map); the store is injectable, so node --test covers the records.

/** What builds the same game again: useColony's game is made from these (and its Restart count). */
export interface GameSettings {
  seed: number;
  ground: Ground;
  antCount: number;
  rival: boolean;
  generation: number;
}

/** The player's side of the game: the fungus's policy, and the colonies' doctrines as they stand. */
export interface PlayerState {
  aim: DoctrineChoice;
  doctrines: DoctrineChoice[];
  menu: string[];
  hide: boolean;
  cull: boolean;
}

export interface SaveRecord {
  slot: number;
  /** Date.now() when saved */
  savedAt: number;
  /** sim seconds into the game, for the list */
  simTime: number;
  /** the goal it was at, for the list */
  chapter: string;
  settings: GameSettings;
  player: PlayerState;
  game: GameSave;
}

/** The autosave's slot; the player's are 1..SLOTS − 1. */
export const AUTOSAVE = 0;
export const SLOTS = 3;
export const AUTOSAVE_MS = 60_000;

export interface SaveStore {
  put(r: SaveRecord): Promise<void>;
  get(slot: number): Promise<SaveRecord | null>;
  /** Every slot that holds a save, newest first. */
  list(): Promise<SaveRecord[]>;
  remove(slot: number): Promise<void>;
}

/** A store in memory: tests, and the fallback where IndexedDB is unavailable (private windows). */
export function memorySaves(): SaveStore {
  const m = new Map<number, SaveRecord>();
  return {
    put: async (r) => void m.set(r.slot, structuredClone(r)),
    get: async (slot) => (m.has(slot) ? structuredClone(m.get(slot)!) : null),
    list: async () => [...m.values()].sort((a, b) => b.savedAt - a.savedAt).map((r) => structuredClone(r)),
    remove: async (slot) => void m.delete(slot),
  };
}

const DB = "jev-ants-saves";
const STORE = "slots";

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

/** The browser's store: IndexedDB, one object per slot. Falls back to memory where IndexedDB can't be opened. */
export function browserSaves(): SaveStore {
  if (typeof indexedDB === "undefined") return memorySaves();
  let db: Promise<IDBDatabase> | null = null;
  const open = () =>
    (db ??= new Promise((resolve, reject) => {
      const r = indexedDB.open(DB, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: "slot" });
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    }));
  const store = async (mode: IDBTransactionMode) => (await open()).transaction(STORE, mode).objectStore(STORE);
  return {
    put: async (r) => void (await req((await store("readwrite")).put(r))),
    get: async (slot) => ((await req((await store("readonly")).get(slot))) as SaveRecord | undefined) ?? null,
    list: async () => ((await req((await store("readonly")).getAll())) as SaveRecord[]).sort((a, b) => b.savedAt - a.savedAt),
    remove: async (slot) => void (await req((await store("readwrite")).delete(slot))),
  };
}

/** A record for slot `slot`, now. */
export function record(slot: number, settings: GameSettings, player: PlayerState, game: GameSave, chapter: string): SaveRecord {
  return { slot, savedAt: Date.now(), simTime: game.time, chapter, settings: { ...settings }, player: structuredClone(player), game };
}

/** "12 min of sim, 3 h ago" style, for a slot's line. */
export function describe(r: SaveRecord, now = Date.now()): string {
  const ago = Math.max(0, now - r.savedAt) / 1000;
  const when = ago < 90 ? "just now" : ago < 5400 ? `${Math.round(ago / 60)} min ago` : ago < 129600 ? `${Math.round(ago / 3600)} h ago` : `${Math.round(ago / 86400)} days ago`;
  const sim = r.simTime < 3600 ? `${Math.floor(r.simTime / 60)} min` : `${(r.simTime / 3600).toFixed(1)} h`;
  return `${r.slot === AUTOSAVE ? "Autosave" : `Slot ${r.slot}`} · world ${r.settings.seed} · ${sim} in · ${when}`;
}
