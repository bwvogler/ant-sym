import type { Colony } from "./colony.ts";
import type { ContactAction } from "./contactAction.ts";

/** Optional headless instrumentation. Observers never participate in policy or combat. */
export interface CombatObserver {
  contact(action: ContactAction): void;
  exposure(pressure: number, allies: number, killed: boolean): void;
}

export const combatObservers = new WeakMap<Colony, CombatObserver>();
