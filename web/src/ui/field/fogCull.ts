import { OPEN, PLANE, rockAt } from "../../colony/index.ts";
import { type FogState, LIVE, UNKNOWN } from "../fog/knowledge.ts";
import { SNAP } from "../fog/sources.ts";
import type { FieldCtx } from "./ctx.ts";

/** In view, and under the fog only where the place has been sensed at some time: what ground items and the fungus's own marks cull by. */
export function exploredCull(fc: FieldCtx, inView: (wx: number, wy: number) => boolean): (wx: number, wy: number) => boolean {
  const fog = fc.fog;
  if (!fog) return inView;
  return (wx, wy) => inView(wx, wy) && fog.stateAt(fc.lv, wx, wy) !== UNKNOWN;
}

/**
 * What the actors stage (ants, brood, the queen, alates, corpses) culls by: in view, and under the fog, only where an observer senses
 * the place now (docs/fog-of-war.md §5.1: ants are never remembered). Without the fog it is `inView` itself.
 */
export function actorCull(fc: FieldCtx, inView: (wx: number, wy: number) => boolean): (wx: number, wy: number) => boolean {
  const fog = fc.fog;
  if (!fog) return inView;
  return (wx, wy) => inView(wx, wy) && fog.stateAt(fc.lv, wx, wy) === LIVE;
}

/** The fog's colour: the paper pulled a little towards the ink. */
export function fogRgb(theme: FieldCtx["theme"]): [number, number, number] {
  return [0, 1, 2].map((k) => Math.round(theme.paperRgb[k]! + (theme.inkRgb[k]! - theme.paperRgb[k]!) * 0.16)) as [number, number, number];
}
export function setPx(px: Uint8ClampedArray, o: number, rgb: readonly number[], a: number): void {
  px[o] = rgb[0]!;
  px[o + 1] = rgb[1]!;
  px[o + 2] = rgb[2]!;
  px[o + 3] = a;
}
/** A remembered cell: what was painted, mixed towards the fog (clear ground becomes a faint wash of it). */
export function dimPx(px: Uint8ClampedArray, o: number, fogPx: readonly number[]): void {
  if (px[o + 3] === 0) return setPx(px, o, fogPx, 70);
  for (let k = 0; k < 3; k++) px[o + k] = Math.round(px[o + k]! * 0.6 + fogPx[k]! * 0.4);
}

/** The plane cell (qx, qy) as the side view's strip and the minimap read it: the truth without the fog, the last sensed with it (and `state` says which cells were never sensed). */
export function planeGround(k: FieldCtx, qx: number, qy: number): { state: FogState; rock: number; food: number; spoil: number } {
  const plane = k.world.plane;
  const fog = k.fog;
  if (!fog) return { state: LIVE, rock: rockAt(plane, qx, qy), food: plane.food.get(qx, qy), spoil: plane.spoil?.get(qx, qy) ?? 0 };
  const state = fog.state(PLANE, qx, qy);
  if (state === UNKNOWN) return { state, rock: OPEN, food: 0, spoil: 0 };
  return {
    state,
    rock: fog.snapshot(PLANE, SNAP.rock, qx, qy) ?? OPEN,
    food: fog.snapshot(PLANE, SNAP.food, qx, qy) ?? 0,
    spoil: fog.snapshot(PLANE, SNAP.spoil, qx, qy) ?? 0,
  };
}
