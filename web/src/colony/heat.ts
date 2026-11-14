// Heat (ja-rf5.5, docs/desert-ant.md §4): the desert ant's own pressure. The ground's heat follows a day (cool at dawn, hottest at noon); an ant's
// body heat moves toward the ground's out on the plane and toward the nest's inside it. The ant senses its own heat (the sense table's "own body"
// row, as hunger and fatigue), and its policy chooses to come back (desertAnt.ts `hot`); past its critical heat it dies, a body rule like hunger.
// Every number is design or a labelled borrowing: the papers give windows and critical points, not rates (desert-ant.md §4).

import type { Colony } from "./colony.ts";
import type { ColonyParams } from "./params.ts";
import { PLANE } from "./vocab.ts";

/**
 * Where game time t falls in the day, 0 to 1 (a game starts heatStart seconds after sunrise): the sun rises at 0, stands highest at half the daylight
 * (1 − heatNight) / 2, sets at 1 − heatNight, and is down until the next rise.
 */
export function dayPhase(p: ColonyParams, t: number): number {
  const f = (t + p.heatStart) / p.heatDay;
  return f - Math.floor(f);
}

/** Whether the sun is down at game time t: the last heatNight of each day (heatDay 0: no day, never). */
export function sunDown(p: ColonyParams, t: number): boolean {
  return p.heatDay > 0 && dayPhase(p, t) >= 1 - p.heatNight;
}

/** The sun's height at game time t: 0 at sunrise and sunset, 1 at noon (sin² over the daylight); 0 all night. */
export function sunHeight(p: ColonyParams, t: number): number {
  const light = 1 - p.heatNight;
  const f = dayPhase(p, t);
  return f >= light ? 0 : Math.sin((Math.PI * f) / light) ** 2;
}

/** The ground's heat on the plane at game time t (°C): `heatDawn` from sunset to sunrise, `heatNoon` at noon, following the sun's height. */
export function groundHeat(p: ColonyParams, t: number): number {
  return p.heatDawn + (p.heatNoon - p.heatDawn) * sunHeight(p, t);
}

/** Whether the sun stands high at game time t, as an ant that can see the sky sees it (desert-heat.md §2; the threshold is design). */
export function sunHigh(p: ColonyParams, t: number): boolean {
  return p.heatDay > 0 && sunHeight(p, t) >= p.heatSunHigh;
}

/** What an ant that can see the sky sees of the sun at game time t: down (night), high, or low. */
export function sunSeen(p: ColonyParams, t: number): "down" | "high" | "low" {
  return sunDown(p, t) ? "down" : sunHigh(p, t) ? "high" : "low";
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

/**
 * Heat (ja-rf5.5, heat.ts): every ant's body heat moves toward the ground's out on one world's plane (on a map with no plane, anywhere outside
 * its nest's disc) and toward the nest's inside; one past the critical heat dies of it.
 */
export function heatStep(c: Colony, dt: number): void {
  const p = c.params;
  const ground = groundHeat(p, c.time) - p.heatNest;
  const { nest } = c;
  for (let i = 0; i < c.n; i++) {
    if (!c.alive[i]) continue;
    const open = c.line !== null ? c.layer[i] === PLANE : Math.hypot(c.x[i] - nest.x, c.y[i] - nest.y) >= nest.r;
    c.bodyHeat[i] = bodyHeatAfter(p, c.bodyHeat[i], open ? ground : 0, dt);
    c.hot[i] = feelsHot(p, c.bodyHeat[i], c.hot[i] === 1) ? 1 : 0;
    if (pastCritical(p, c.bodyHeat[i])) {
      c.kill(i, false);
      c.diedHot++;
    }
  }
}
