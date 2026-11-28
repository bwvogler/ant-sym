import type { Game } from "../colony/index.ts";

// The odour space's size, for the numbers the page prints about the nests' gap (ja-zg1u.8). The widest two odours can be apart is the space's diameter,
// sqrt(K) for K axes: 1 with one axis (every game before the odour space), 2 at the game's four. Nothing here is hard-coded to 1.

/** How many axes the game's odour has (recognition.ts odourAxes). */
export const axesOf = (game: Game): number => game.recognition.params.odourAxes;

/** The widest two odours can be apart: sqrt(axes). The nests' gap starts here (Game.unity's `recognition` reads the same). */
export const odourSpan = (axes: number): number => Math.sqrt(axes);

const num = (v: number): string => (Number.isInteger(v) ? String(v) : v.toFixed(2));

/** The title of the history chart of the gap: where it starts, and where the colonies smell alike. */
export function gapTitle(axes: number): string {
  return `The odours apart: ${num(odourSpan(axes))} at the start, 0 when they smell alike`;
}
