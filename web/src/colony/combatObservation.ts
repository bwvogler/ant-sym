import type { Colony } from "./colony.ts";
import type { ContactAction } from "./contactAction.ts";
import type { Touch } from "./responses.ts";

/** Optional headless instrumentation. Observers never participate in policy or combat. */
export interface CombatObserver {
  contact(action: ContactAction, ant: number, sensed: Readonly<Touch>): void;
  exposure(pressure: number, allies: number, killed: boolean, ant: number): void;
}

export const combatObservers = new WeakMap<Colony, CombatObserver>();
