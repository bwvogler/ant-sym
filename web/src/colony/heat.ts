// Heat (ja-rf5.5, docs/desert-ant.md §4): the desert ant's own pressure. The ground's heat follows a day (cool at dawn, hottest at noon); an ant's
// body heat moves toward the ground's out on the plane and toward the nest's inside it. The ant senses its own heat (the sense table's "own body"
// row, as hunger and fatigue), and its policy chooses to come back (desertAnt.ts `hot`); past its critical heat it dies, a body rule like hunger.
// Every number is design or a labelled borrowing: the papers give windows and critical points, not rates (desert-ant.md §4).

import type { ColonyParams } from "./params.ts";

/** The ground's heat on the plane at game time t (°C): `heatDawn` at t = 0 and every heatDay after, `heatNoon` half a day on. */
export function groundHeat(p: ColonyParams, t: number): number {
  return p.heatDawn + ((p.heatNoon - p.heatDawn) * (1 - Math.cos((2 * Math.PI * t) / p.heatDay))) / 2;
}

/**
 * Ant body heat after dt seconds where the surroundings are at `around` °C, both as degrees above the nest's (`heatNest`): it moves toward
 * them with time constant heatTau (Newton's cooling). Out of the open and back in the nest, it falls back the same way.
 */
export function bodyHeatAfter(p: ColonyParams, body: number, around: number, dt: number): number {
  return around + (body - around) * Math.exp(-dt / p.heatTau);
}

/** Whether an ant that `was` hot, with a body `body` °C above the nest's, feels hot now: from heatFelt until it is back below heatCool. */
export function feelsHot(p: ColonyParams, body: number, was: boolean): boolean {
  const t = p.heatNest + body;
  return was ? t >= p.heatCool : t >= p.heatFelt;
}

/** Whether a body `body` °C above the nest's is past the critical heat. */
export function pastCritical(p: ColonyParams, body: number): boolean {
  return p.heatNest + body >= p.heatDeath;
}
