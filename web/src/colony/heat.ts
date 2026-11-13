// Heat (ja-rf5.5, docs/desert-ant.md §4): the desert ant's own pressure. The ground's heat follows a day (cool at dawn, hottest at noon); an ant's
// body heat moves toward the ground's out on the plane and toward the nest's inside it. The ant senses its own heat (the sense table's "own body"
// row, as hunger and fatigue), and its policy chooses to come back (desertAnt.ts `hot`); past its critical heat it dies, a body rule like hunger.
// Every number is design or a labelled borrowing: the papers give windows and critical points, not rates (desert-ant.md §4).

import type { ColonyParams } from "./params.ts";

/** The sun's height at game time t, 0 at dawn (t = 0 and every heatDay after) to 1 at noon (half a day on): the day's one curve. */
export function sunHeight(p: ColonyParams, t: number): number {
  return (1 - Math.cos((2 * Math.PI * t) / p.heatDay)) / 2;
}

/** The ground's heat on the plane at game time t (°C): `heatDawn` at dawn, `heatNoon` at noon, following the sun's height. */
export function groundHeat(p: ColonyParams, t: number): number {
  return p.heatDawn + (p.heatNoon - p.heatDawn) * sunHeight(p, t);
}

/** Whether the sun stands high at game time t, as an ant that can see the sky sees it (desert-heat.md §2; the threshold is design). */
export function sunHigh(p: ColonyParams, t: number): boolean {
  return p.heatDay > 0 && sunHeight(p, t) >= p.heatSunHigh;
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
