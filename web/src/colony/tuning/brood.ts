// The queen and brood: laying, development, feeding (by nurses and from crops), and task reversion to nursing. Part of the colony's tuning constants (docs/refactor.md S3.5, ja-fnd.4.5),
// re-exported by ../tuning.ts; moved verbatim from it, comments and values unchanged.

import { LIFESPAN, MIDDLE } from "../params.ts";

/**
 * Task reversion (ja-7r7x, docs/task-reversion.md): seconds over which an ant's sense of meeting young nestmates
 * (`youngMet`, the share of recent time a young one was within a cell of it) settles. Design: no paper measures how
 * long an old ant goes without meeting young before it reverts (in ants "within 24 h"; in fire ants within minutes).
 */
export const YOUNG_TAU = 60;
/** An old ant at home reverts to nursing while its `youngMet` is below this (design). */
export const REVERT_BELOW = 0.05;
/**
 * ...and only while its `broodMet` (the share of recent time, YOUNG_TAU, a brood item was within BROOD_SMELL cells of it) is at
 * least this: foragers revert when "exposed to brood in absence of younger workers" (Symonowicz et al. 2015). A colony
 * with no brood (one at its cap lays none) has no reverting ants (design threshold; review of #217, D1).
 */
export const BROOD_MET_MIN = 0.05;
/**
 * How far (cells) an old ant at home senses brood for broodMet: brood odour a little way, not only touch (owner,
 * 2026-11-15, review of #217, D2: at one cell the old ants away from the brood never met it). Design: Temnothorax
 * workers respond to larval cuticle extracts (Kohlmeier et al. 2018), but no paper read gives a range. It reads a disc of cells
 * whatever lies between, so brood behind solid soil counts too (odour through soil; for ja-7r7x.4 to check).
 */
export const BROOD_SMELL = 4;

/**
 * Larval feeding by mouth (ja-638i, docs/larval-feeding.md): food an ant takes into its crop a second from a stocked
 * store or reception within reach (design).
 */
export const CROP_FILL = 0.5;
/** Food a second at most that passes mouth to mouth from a fuller crop to a needier nestmate (design). */
export const CROP_PASS = 0.2;
/** Food a second a nurse feeds a larva from its crop at full strength (a larva begging hard); less as it begs less (design). */
export const CROP_FEED = 0.25;
/** The strength a larva still owed its growth food draws feeding at, when it is not yet hungry enough to beg (design). */
export const CROP_OWED = 0.3;

// The queen and brood (nest slice 4): see nestLife, nurse. Food per worker is EGG_FOOD + LARVA_FOOD = foodPerAnt (4).
/** Food in an egg, and fed to a larva before it pupates. */
export const EGG_FOOD = 1;

/** Seconds as an egg; at least this long as a larva (and fed); as a pupa. */
export const T_EGG = 15;

export const T_LARVA = 20;

export const T_PUPA = 20;

/** At most one egg this often (seconds), while there is food and room. */
export const LAY_INTERVAL = 0.5;

/** The fungus's crown (nest slice 8): the chance a second that a host by the queen, or by a brood item, kills it, at full load (× its load). */
export const CROWN_RATE = 0.05;

/** Food a larva takes per second with two nurses or more by it. */
export const FEED_RATE = 0.5;

/** Food the royal chamber is kept stocked with for the queen (a few eggs' worth, and the larvae lying with her). */
export const QUEEN_STOCK = 8;

/** Chance per second an idle ant in the royal chamber picks up an egg near it to take to a brood chamber. */
export const PICK_BROOD = 0.5;

/** Seconds a nurse holds brood before it puts it down wherever it is; a porter, its food, in whichever of its chambers it is by. */
export const HOLD_MAX = 30;
/**
 * Cells a brood chamber needs before nurses put brood there (ja-xu6.2), as RECEPTION_MIN for food: one or two cells
 * wide, just begun, it is a bulge in a tunnel that porters and nurses rarely stand in or beside. On main, 13 of the 14
 * economy-test seeds that stranded larvae had them in brood chambers of one or two cells (world 1 seed 11: 40).
 */
export const BROOD_MIN = 4;

/**
 * A nanitic's age at eclosion (ja-lo8.10): the first workers a queen founding alone rears (brood.ts `nanitic`) eclose
 * old, so they forage from the start; with nobody bringing food in, the queen's colony grows no further until they do.
 * In incipient Pogonomyrmex rugosus colonies nanitics take on outside work, pushed out as later nanitics eclose into
 * brood care (escholarship.org/content/qt37w2d1mh). That they forage at once, and so live shorter, is the game's own.
 */
/** The generic ant's nanitic age: the colony reads `middleShare × lifespan` of its own params (a species' differ); kept as the default and for the founding test. */
export const NANITIC_AGE = MIDDLE * LIFESPAN;

/** The queen's royal mark per second; her death rate per stranger at her side. */
export const QUEEN_MARK = 10;

export const QUEEN_FIGHT = 1;
