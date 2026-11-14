import { useSyncExternalStore } from "react";
import type { Followed } from "./follow.ts";

// Where the lens looks (PRD §69.3): one small store, so the map reports the pointer straight to the lens's layer and the
// page doesn't re-render on every mouse move (review of #196, N3).

/** A point of the map under the pointer, for the lens: where on screen, where in the world, and the ant there. */
export interface FieldProbe {
  /** the pointer, in the page's (client) pixels */
  sx: number;
  sy: number;
  /** the layer shown (PLANE or CURTAIN; −1 on a game of one map) and the world point */
  lv: number;
  x: number;
  y: number;
  ant: Followed | null;
  /** a click: the card stays until closed */
  pinned: boolean;
}

/** The point the lens shows next: a click's replaces anything; a hover's replaces anything but a pinned card. */
export function nextProbe(cur: FieldProbe | null, p: FieldProbe | null): FieldProbe | null {
  return cur?.pinned && !p?.pinned ? cur : p;
}

let current: FieldProbe | null = null;
const listeners = new Set<() => void>();

function set(p: FieldProbe | null): void {
  if (p === current) return;
  current = p;
  for (const fn of listeners) fn();
}

/** The map's report of the pointer (ColonyField's onProbe). */
export const offerProbe = (p: FieldProbe | null): void => set(nextProbe(current, p));
/** Close the card, pinned or not. */
export const clearProbe = (): void => set(null);
export const probeNow = (): FieldProbe | null => current;

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}

export function useProbe(): FieldProbe | null {
  return useSyncExternalStore(subscribe, probeNow, probeNow);
}
