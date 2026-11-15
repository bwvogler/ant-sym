// Game time as the page shows it: m:ss, or h:mm:ss past an hour (the HUD's clock, Lab mode's charts).

export function clock(t: number): string {
  const s = Math.floor(t);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

/**
 * Game time to the tick (Lab mode's step control): the clock, then the tick within the second, of 30. Counted in whole
 * ticks, so a time a float hair under a second reads as the next second's tick 0, not as tick 30.
 */
export function clockTicks(t: number): string {
  const n = Math.round(t * 30);
  return `${clock(Math.floor(n / 30))} +${String(n % 30).padStart(2, "0")}/30`;
}
