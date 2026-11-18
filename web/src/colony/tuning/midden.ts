// The midden: corpses carried out, its mark, where it lies. Part of the colony's tuning constants (docs/refactor.md S3.5, ja-fnd.4.5),
// re-exported by ../tuning.ts; moved verbatim from it, comments and values unchanged.

import { MOUND_REACH } from "./dig.ts";

// The midden (nest slice 7): see undertake, dropPlane, middenSmell.
/** Chance per second an idle middle-aged ant underground picks up a corpse within two cells of it. */
export const PICK_CORPSE = 1;

/** The midden lies at least this many cells past the mound's reach. */
const MIDDEN_PAST = 3;

/** Corpses on the ground are taken to the midden from within this many columns of the hole (out to the midden). */
export const MIDDEN_NEAR = 100;

/** Seconds an undertaker walks a corpse out before it puts it down short of the midden (a pellet's 15 s fell short of it on hilly ground). */
export const CORPSE_GIVE_UP = 60;

/** Seconds after death a corpse not on the midden rots away (the dead in the field would otherwise pile up all game). */
export const CORPSE_ROT = 900;

/** Midden mark laid when a corpse is put on the midden; a tenth of it a second while it lies there. Each is spread over
 *  the cell's column and MIDDEN_SPREAD columns either side, tapering (review of #26: one cell at the saturated level). */
export const MIDDEN_MARK = 20;

/** Columns either side of a midden cell its mark is laid over. */
export const MIDDEN_SPREAD = 3;

/** How hard raiders turn away from the rival's midden mark, as a share of turnRate (alarm avoidance is alarmAvoid). */
export const MIDDEN_AVOID = 1.5;

/**
 * A raider on the ground turns back from a cell of the rival's midden with chance 1 − exp(−mark / MIDDEN_SCALE), times
 * MIDDEN_CROWD / (its own colony's ants within two cells, itself included) once they are more than MIDDEN_CROWD: a scout
 * or a handful shies, a raid in force presses on (see middenTurn).
 */
export const MIDDEN_SCALE = 5;

export const MIDDEN_CROWD = 3;

/** The midden lies this many columns from the hole, toward the nearest other colony (see middenSide): just past the mound's largest reach. */
export const MIDDEN_AT = MOUND_REACH + MIDDEN_PAST;

/**
 * One world's plane (U3c): a corpse is put on the midden no nearer home than this by the undertaker's own vector, and off
 * the mound: a ring at the edge of the cleared ground (the owner's stopgap, 2026-11-09, until corpse scent lets undertakers
 * find one pile).
 */
export const MIDDEN_MIN = 8;
