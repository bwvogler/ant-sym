// The HUD's sun chip (ja-rf5.8): for a species with a day (the desert ant), the sun as its ants see it and the ground's heat now.
import { groundHeat, sunSeen, type ColonyParams } from "../colony/index.ts";

/** What the chip says at game time t: "sun high · 48 °C"; `short` for a phone, "high · 48°". */
export function sunChip(p: ColonyParams, t: number, short = false): string {
  const sun = sunSeen(p, t);
  const heat = groundHeat(p, t).toFixed(0);
  return short ? `${sun} · ${heat}°` : `sun ${sun} · ${heat} °C`;
}
