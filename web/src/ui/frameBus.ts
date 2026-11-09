// The frame bus ColonyField draws by (its `onFrame` prop): whoever owns the frames calls `fire` once a frame (the game's
// loop) or when the picture changed (the one-world preview), and every subscribed drawer redraws.
import { useCallback, useRef } from "react";

export interface FrameBus {
  /** Subscribe a drawer; returns its unsubscribe. ColonyField's `onFrame`. */
  onFrame: (fn: () => void) => () => void;
  /** Tell every drawer a frame passed. */
  fire: () => void;
}

/** A frame bus for one page: stable across renders. */
export function useFrameBus(): FrameBus {
  const listeners = useRef(new Set<() => void>());
  const onFrame = useCallback((fn: () => void) => {
    listeners.current.add(fn);
    return () => void listeners.current.delete(fn);
  }, []);
  const fire = useCallback(() => {
    for (const fn of listeners.current) fn();
  }, []);
  return { onFrame, fire };
}
