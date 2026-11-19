import { touch } from "./sense.ts";
// Experimental motor primitive, PRD §85. Decisions see Touch; execution sees only local contact.
import type { Colony } from "./colony.ts";
import type { AntStep } from "./step.ts";
import type { Touch } from "./responses.ts";
import { EXPLORE, FOLLOW } from "./vocab.ts";
import { turnToward } from "./grid.ts";

export type Departure = "continue" | "pass-by";
export interface DepartureState {
  seconds: number;
  ants: Record<number, { gen: number; layer: number; heading: number; remaining: number }>;
}
/** Explicit opt-in; zero disables and discards any in-progress action. */
export function enableDeparture(c: Colony, seconds: number): void {
  if (!Number.isFinite(seconds) || seconds < 0 || seconds > 2) throw new Error("departure duration must be between 0 and 2 seconds");
  if (seconds === 0) delete c.departure;
  else c.departure = { seconds, ants: {} };
}
export function departureHeading(c: Colony, i: number, s: AntStep, heading: number): number {
  const d = c.departure,
    a = d?.ants[i];
  if (!d || !a) return heading;
  if (
    a.gen !== c.gen[i] ||
    a.layer !== c.cur ||
    !c.alive[i] ||
    s.item !== "none" ||
    (s.mode !== EXPLORE && s.mode !== FOLLOW) ||
    s.toEnemy !== null ||
    s.fleeFrom !== null ||
    s.map.food.get(c.cellX[i], c.cellY[i]) <= 0
  ) {
    delete d.ants[i];
    return heading;
  }
  if (a.remaining <= 0) return heading; // Keep the latch until contact ends; timeout never restarts it.
  a.remaining = Math.max(0, a.remaining - s.dt);
  return turnToward(s.h, a.heading, s.p.turnRate * s.dt);
}
export function refusedFood(c: Colony, i: number, s: AntStep, t: Touch): void {
  const d = c.departure;
  if (
    !d ||
    t.offered !== "food" ||
    t.carrying !== "none" ||
    !s.resp.depart ||
    (s.mode !== EXPLORE && s.mode !== FOLLOW) ||
    s.toEnemy !== null ||
    s.fleeFrom !== null
  )
    return;
  const a = d.ants[i];
  if (a && a.gen === c.gen[i] && a.layer === c.cur) return;
  if (s.resp.depart(t, c.antDraw(i)) !== "pass-by") return;
  d.ants[i] = { gen: c.gen[i], layer: c.cur, heading: s.h, remaining: d.seconds };
}

/** Pickup remains independent; only a refused offer can start departure. */
export function pickupWithDeparture(c: Colony, i: number, s: AntStep): boolean {
  const t = touch(c, i, s.toEnemy !== null, s.mode, s.item, "food");
  const accepted = s.resp.get(t, c.antDraw(i));
  if (!accepted) refusedFood(c, i, s, t);
  else if (c.departure) delete c.departure.ants[i];
  return accepted;
}
