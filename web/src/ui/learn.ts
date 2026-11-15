import { useSyncExternalStore } from "react";
import { openLab } from "./labStore.ts";

// Where the Learn drawer is open, if anywhere: one small store, so a "?"
// anywhere on the page (the follow card, the panels, a chamber on the field)
// can open it at the right entry without threading callbacks through. The policy is Lab mode's Policy tab now (PRD
// §69.8): a target in "policy" opens the Lab there instead, and closes the Codex, which would cover it.

export type LearnTab = "guide" | "policy" | "nest";

/** A tab ("policy": the Lab's), and optionally an entry in it to scroll to and highlight (a guide id, a policy lane, "chamber-<k>-<id>"). */
export interface LearnTarget {
  tab: LearnTab;
  id?: string;
}

let current: LearnTarget | null = null;
const listeners = new Set<() => void>();

function set(t: LearnTarget | null): void {
  current = t;
  for (const fn of listeners) fn();
}

export const openLearn = (t: LearnTarget): void => {
  if (t.tab === "policy") {
    set(null);
    openLab({ tab: "policy", id: t.id });
  } else set({ ...t });
};
export const closeLearn = (): void => set(null);
export const learnTarget = (): LearnTarget | null => current;

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}

export function useLearn(): LearnTarget | null {
  return useSyncExternalStore(subscribe, learnTarget, learnTarget);
}
