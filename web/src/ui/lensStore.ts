import type { Followed } from "./follow.ts";
import { createStore, useStore } from "./store.ts";

// Where the lens looks (PRD §69.3): one small store, so the map reports the pointer straight to the lens's layer and the
// page doesn't re-render on every mouse move (review of #196, N3).

/** A point of the map under the pointer, for the lens: where on screen, where in the world, and the ant there. */
export interface FieldProbe {
  /** the pointer, in the page's (client) pixels */
  sx: number;
  sy: number;
  /** the layer shown (PLANE or CURTAIN) and the world point */
  lv: number;
  x: number;
  y: number;
  ant: Followed | null;
  /** a click: the card stays until closed */
  pinned: boolean;
}

/**
 * What the lens holds: the card pinned by the last click, and the point the pointer is over now. Kept apart, so a card
 * pinned on one view waits there while the lens goes on following the pointer on the other (review of #196, S6).
 */
export interface LensState {
  pinned: FieldProbe | null;
  hover: FieldProbe | null;
}

/** The lens after the map reports `p`: a click pins its card (replacing any); a hover, or the pointer leaving (null), moves the hover. */
export function nextLens(s: LensState, p: FieldProbe | null): LensState {
  return p?.pinned ? { pinned: p, hover: s.hover } : { pinned: s.pinned, hover: p };
}

/** The card for view `lv`: the card pinned there, else the pointer's there, else none. */
export function shownOn(s: LensState, lv: number): FieldProbe | null {
  return s.pinned?.lv === lv ? s.pinned : s.hover?.lv === lv ? s.hover : null;
}

const EMPTY: LensState = { pinned: null, hover: null };
// A set that keeps both cards as they were tells nobody (the pointer leaving twice, an unpin with none pinned).
const store = createStore<LensState>(EMPTY, { equal: (a, b) => a.pinned === b.pinned && a.hover === b.hover });

/** The map's report of the pointer (ColonyField's onProbe). */
export const offerProbe = (p: FieldProbe | null): void => store.update((s) => nextLens(s, p));
/** Close the pinned card (its ×, Escape): the lens goes back to the pointer. */
export const unpin = (): void => store.update((s) => ({ pinned: null, hover: s.hover }));
/** Close everything: the lens turned off or on, a command run, the Lab opened. */
export const clearProbe = (): void => store.set(EMPTY);
export const lensNow = (): LensState => store.get();

export function useLens(): LensState {
  return useStore(store);
}
