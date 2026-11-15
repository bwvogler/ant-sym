import { useSyncExternalStore } from "react";

// Whether Lab mode is open, and at which tab (PRD §69.7–69.8): one small store, like the Codex's (learn.ts), so a "?"
// anywhere on the page can open the Lab's Policy tab at a section, and the key l, the palette and Settings toggle it.

export type LabTab = "history" | "policy" | "world" | "jev" | "levers" | "numbers" | "journal";

/** A tab, and optionally a section in it to open and scroll to (a policy lane: "mode", "fungus", "sent", "responses"). */
export interface LabTarget {
  tab: LabTab;
  id?: string;
}

let current: LabTarget | null = null;
const listeners = new Set<() => void>();

function set(t: LabTarget | null): void {
  current = t;
  for (const fn of listeners) fn();
}

/** Open the Lab at a tab (a new object each call: a "?" pressed again opens its section again). */
export const openLab = (t: LabTarget = { tab: "history" }): void => set({ ...t });
export const closeLab = (): void => set(null);
export const toggleLab = (): void => (current ? closeLab() : openLab());
export const labTarget = (): LabTarget | null => current;

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}

export function useLab(): LabTarget | null {
  return useSyncExternalStore(subscribe, labTarget, labTarget);
}
