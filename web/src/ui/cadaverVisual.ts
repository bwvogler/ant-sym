import { CORPSE_ROT } from "../colony/index.ts";
import type { Corpse } from "../colony/index.ts";

export type DecayStage = 0 | 1 | 2 | 3;
/** Illustrative steps across the existing 15-minute simulation lifetime, never wall-clock time. */
export const DECAY_FRACTIONS = [0, 0.2, 0.5, 0.8] as const;
export function decayStage(now: number, died: number): DecayStage {
  const age = Math.max(0, now - died) / CORPSE_ROT;
  return age >= 0.8 ? 3 : age >= 0.5 ? 2 : age >= 0.2 ? 1 : 0;
}
export interface InspectedCadaver {
  stage: DecayStage;
  fungal: boolean;
}
/** Exact corpse records stay separate from the visual history of surface deaths and midden deposits. */
export function visibleCadavers(
  c: { time: number; home: number; corpses: readonly Corpse[]; remains?: readonly Corpse[] },
  layer: number,
): Corpse[] {
  return [...c.corpses, ...(c.remains ?? [])].filter(
    (d) => d.held < 0 && (layer < 0 || (d.layer ?? c.home) === layer) && c.time - d.died <= CORPSE_ROT,
  );
}
