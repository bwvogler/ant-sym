import { useEffect, useRef, useSyncExternalStore } from "react";
import type { Game } from "../colony/index.ts";
import { cues, listed, loadAll, loadSeen, newlyOpen, saveAll, saveSeen, UNLOCK } from "./codex.ts";
import { guideFor } from "./guide.ts";
import { pushToast } from "./toasts.ts";
import type { ColonyStats } from "./useColony.ts";

// The Codex on the page (PRD §69.4): what this browser has seen, a store any surface reads (the guide, the rail's badge),
// and the watch that opens entries as the game shows their cues. Kept across games: it is the player's notebook.

const storage = (): Storage | null => {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
};

interface CodexState {
  /** entries seen in this browser */
  seen: ReadonlySet<string>;
  /** entries opened since the guide was last looked at (the rail's badge) */
  fresh: readonly string[];
  /** the player's "show every entry" */
  all: boolean;
}

let state: CodexState = { seen: loadSeen(storage), fresh: [], all: loadAll(storage) };
const listeners = new Set<() => void>();
function set(s: CodexState): void {
  state = s;
  for (const fn of listeners) fn();
}
const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => void listeners.delete(fn);
};
const snapshot = () => state;

export function useCodex(): CodexState {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

/** The guide was looked at: nothing is new any more. */
export const markViewed = (): void => {
  if (state.fresh.length) set({ ...state, fresh: [] });
};
export const setShowAll = (all: boolean): void => {
  saveAll(storage, all);
  set({ ...state, all });
};
/** Start the notebook afresh: every entry but the starting ones is locked again. */
export const forgetSeen = (): void => {
  saveSeen(storage, new Set());
  set({ ...state, seen: new Set(), fresh: [] });
};

/** How often the watch reads the game, in milliseconds of the page's time. */
const EVERY_MS = 500;

/**
 * Watch the game for the Codex's cues: an entry opens the first time its cue shows, with a notice (the starting ones open
 * quietly). Only the entries the game's species sees (guideFor).
 */
export function useCodexWatch(game: Game, onFrame: (fn: () => void) => () => void, stats: ColonyStats | null): void {
  // The numbers as last reported, read by the frame (not a dependency: the watch stays subscribed as they change).
  const now = useRef(stats);
  useEffect(() => {
    now.current = stats;
  }, [stats]);
  useEffect(() => {
    let last = -Infinity;
    const ids = guideFor((c) => game.player.ph.has(c), game.params.species.id).map((e) => e.id);
    const titles = new Map(guideFor(() => true).map((e) => [e.id, e.title]));
    return onFrame(() => {
      const t = performance.now();
      if (t - last < EVERY_MS) return;
      last = t;
      const st = now.current;
      const g = {
        deaths: st ? st.sides.reduce((n, s) => n + s.losses, 0) : 0,
        unityGap: st?.unity.gap ?? 1,
        mutations: st?.evolution?.mutations ?? 0,
      };
      const open = newlyOpen(ids, state.seen, cues(game.colonies, g));
      if (!open.length) return;
      const seen = new Set([...state.seen, ...open]);
      saveSeen(storage, seen);
      const told = open.filter((id) => (UNLOCK[id]?.cue ?? "start") !== "start");
      set({ ...state, seen, fresh: [...state.fresh, ...told] });
      // One notice for what opened together (one cue often opens several entries).
      if (told.length) pushToast(`New in the field guide: ${listed(told.map((id) => titles.get(id) ?? id))}. Learn has it.`, "good");
    });
  }, [game, onFrame]);
}
