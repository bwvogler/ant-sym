// The mode lane's situation as an index (docs/refactor.md S3.3): the colony's encoding of what an ant senses, over SITUATION_SCHEMA.

import { HOMES, SITUATION_SCHEMA, TRAILS, type Home, type Situation, type Trail } from "./vocab.ts";

/** Every situation a mode choice can be asked in (vocab.ts SITUATION_SCHEMA): 3,888. */
export const SITUATIONS = SITUATION_SCHEMA.size;

/** A situation from its index in SITUATIONS: the inverse of encode. */
export const decodeSituation = (code: number): Situation => SITUATION_SCHEMA.decode(code);

export const encodeSituation = (s: Situation): number => SITUATION_SCHEMA.encode(s);

// The schema's steps, for the per-ant hot path below (the same numbers encode adds up, without building a situation).
export const [MODE_STRIDE, TIRED_STRIDE, FOOD_STRIDE, HOME_STRIDE, ALARM_STRIDE, ENEMY_STRIDE, STANCE_STRIDE] =
  SITUATION_SCHEMA.strides as [number, number, number, number, number, number, number];

/** encode's code from a situation's parts: mode, enemy and stance as their indices. encode(m, …) = encode(0, …) + m × MODE_STRIDE. */
export function packSituation(mode: number, tired: boolean, food: Trail, home: Home, alarm: Trail, enemy: number, stance: number): number {
  return (
    mode * MODE_STRIDE +
    (tired ? TIRED_STRIDE : 0) +
    TRAILS.indexOf(food) * FOOD_STRIDE +
    HOMES.indexOf(home) * HOME_STRIDE +
    TRAILS.indexOf(alarm) * ALARM_STRIDE +
    enemy * ENEMY_STRIDE +
    stance * STANCE_STRIDE
  );
}
