// Experimental food destinations are roles sensed through floor marks, never addresses.
import type { Colony } from "./colony.ts";
import type { Carry } from "./responses.ts";
import { NO_CELL } from "./grid.ts";

export const DELIVERY_ROLES = ["royal", "brood", "store", "reception"] as const;
export type DeliveryRole = (typeof DELIVERY_ROLES)[number];
// Small persisted outcome codes; inspection reads these without consulting policy/RNG.
export const DELIVERY_TRAVEL = 1;
export const DELIVERY_SEARCH = 2;
export const DELIVERY_KEEP = 3;
export const DELIVERY_DONE = 4;
export const DELIVERY_RELEASED = 5;
export const DELIVERY_UNAVAILABLE = 6;

export function requestedDelivery(c: Colony, i: number): DeliveryRole | null {
  return c.params.deliveryLane > 0 && c.carrying[i] === 1 ? (DELIVERY_ROLES[c.deliveryRole[i] - 1] ?? null) : null;
}

/** Surface travel and foreign tunnels still lead to the familiar entrance first. */
export function localDelivery(c: Colony, i: number): boolean {
  return requestedDelivery(c, i) !== null && !c.onPlane && c.goalKind[i] === 0;
}

/** Apply an answer, not a new policy call. `take` keeps a chosen goal until release. */
export function chooseDelivery(c: Colony, i: number, answer: Carry): void {
  if (c.params.deliveryLane <= 0 || !c.carrying[i]) {
    c.deliveryRole[i] = 0;
    return;
  }
  const role = DELIVERY_ROLES.findIndex((r) => answer === `to ${r}`);
  if (role < 0) return;
  if (!c.queen || !c.ph.has(DELIVERY_ROLES[role])) {
    c.deliveryState[i] = DELIVERY_UNAVAILABLE;
    return;
  }
  if (c.deliveryRole[i] === role + 1) return;
  c.deliveryRole[i] = role + 1;
  c.deliveryState[i] = DELIVERY_TRAVEL;
  if (c.porter[i] && c.portTo[i] >= 0) {
    const old = c.portTo[i];
    c.enRouteTo.set(old, Math.max(0, (c.enRouteTo.get(old) ?? 1) - 1));
    c.portTo[i] = -1;
  }
  c.gx[i] = NO_CELL;
  c.wall[i] = 0;
  c.mx[i] = NaN;
  c.stallT[i] = 0;
}

export function endDelivery(c: Colony, i: number, state: number): void {
  if (c.deliveryRole[i]) {
    c.deliveryRole[i] = 0;
    c.deliveryState[i] = state;
  }
}

/** Inspection only: reading it neither chooses a destination nor advances the ant. */
export function deliveryExplanation(c: Colony, i: number): string {
  const role = requestedDelivery(c, i);
  if (role) {
    const reason =
      c.deliveryState[i] === DELIVERY_KEEP
        ? "at the chosen place; policy keeps food"
        : c.deliveryState[i] === DELIVERY_SEARCH
          ? "no destination cue; searching with food"
          : "following local floor cues after returning to its entrance";
    return `Food to ${role}: ${reason}.`;
  }
  if (!c.carrying[i] && c.deliveryState[i] === DELIVERY_DONE) return "Last delivery: food deposited at a recognised destination.";
  if (!c.carrying[i] && c.deliveryState[i] === DELIVERY_RELEASED)
    return "Last delivery interrupted: food released and destination cleared.";
  if (c.deliveryState[i] === DELIVERY_UNAVAILABLE) return "Requested destination unavailable to this ant; retaining its current route.";
  return "Food follows the default home route; the carry and drop responses decide whether to keep or release it.";
}
