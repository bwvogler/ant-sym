import { createContext, useContext, useMemo, useSyncExternalStore } from "react";
import type { GameLoop } from "./gameLoop.ts";
import { type Equal, StatSelection } from "./statSelect.ts";
import type { ColonyStats } from "./stats.ts";

// The page's one game loop, for components below ColonyApp (ja-fnd.6.1, docs/refactor.md S5.1): they read the stats and the frame
// count through these hooks, each its own slice, so the page itself does not draw again every time the stats are taken.

/** The loop of the game on show; ColonyApp provides it. */
export const SessionContext = createContext<GameLoop | null>(null);

export function useLoop(): GameLoop {
  const loop = useContext(SessionContext);
  if (!loop) throw new Error("useLoop: no game on show (ColonyApp provides it)");
  return loop;
}

/**
 * A slice of `loop`'s stats; the component draws again when `eq` (Object.is by default) says it changed. `select` gets null before the
 * first stats. Give it a function that doesn't change between renders where you can; one that does is run again, and its result kept
 * while `eq` holds.
 */
export function useLoopStats<T>(loop: GameLoop, select: (s: ColonyStats | null) => T, eq?: Equal<T>): T {
  const sel = useMemo(() => new StatSelection<T>(loop), [loop]);
  return useSyncExternalStore(sel.subscribe, () => sel.read(select, eq));
}

/** useLoopStats for the game provided by ColonyApp. */
export function useStats<T>(select: (s: ColonyStats | null) => T, eq?: Equal<T>): T {
  return useLoopStats(useLoop(), select, eq);
}

/**
 * State the game keeps outside the stats (a flag a tick sets, the fungus's reach, the clock to the tick): `read` is run again on every
 * stats tick, and the component draws when its result changed by `eq` (Object.is by default). A component that reads `game.…` while it
 * draws, and is no longer drawn at the stats rate, needs this to stay fresh. The result must not be a new object each time unless `eq`
 * compares it.
 */
export function useGameRead<T>(read: () => T, eq?: Equal<T>): T {
  return useStats(() => read(), eq);
}

/** Frames drawn in the last second. */
export function useFps(): number {
  const loop = useLoop();
  return useSyncExternalStore(loop.subscribe, loop.fps);
}
