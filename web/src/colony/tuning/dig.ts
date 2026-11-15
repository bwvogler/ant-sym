// Digging and the mound: soil faces, spoil carried out, the mound, loose pellets, backfill, the entrance. Part of the colony's tuning constants (docs/refactor.md S3.5, ja-fnd.4.5),
// re-exported by ../tuning.ts; moved verbatim from it, comments and values unchanged.

/**
 * How much more room dug soil takes loose than in place (its swell): sand 10–15 %, loam 20–30 %, clay
 * 30–40 % in earthwork references; the sim's soil is unspecified, so 20 %.
 */
export const SWELL = 1.2;

/** The side view: about how high (rows) the spoil disc stands as it spreads: a steep cone halved the food brought home, six rows cost a third. */
export const MOUND_HEIGHT = 3;

/** The side view: the farthest (columns) a pellet is carried from the hole; past it the disc grows higher, not wider. */
export const MOUND_REACH = 90;

/**
 * One world's plane: a mound cell is a flank to spread from where a cell beside it, farther from the hole, is this many
 * levels lower: at the angle of repose, as the side view's "the next column out a row lower". (heapPlane's slide keeps
 * neighbours within a level, so a flank two levels steep forms only where pellets were taken.)
 */
export const PLANE_STEEP = 1;

/** The side view: seconds a carrier walks a pellet out before it drops it wherever it is (heaped on top of its column, clear of the crater). */
export const SPOIL_GIVE_UP = 15;

/** The side view: an explorer on the ground beside a steep flank of the mound picks a pellet off it to spread, with this chance a cell. */
export const LOOSE_SPREAD_PICK = 0.01;

/**
 * The side view: an explorer on the ground beside the mound takes a pellet of it down to backfill, with this chance a cell.
 * Most such trips find nowhere to fill and carry the pellet back out: 92–97 % at 600 s and 99 % over an hour on the app's
 * map (PRD §41; the review of MR 15 saw 60–90 %), since nothing dug in the last BACKFILL.young is filled and the shaft and chamber smell busy. Kept as
 * the owner asked for it (spoil taken down to backfill); see bead ja-lft.
 */
export const LOOSE_FILL_PICK = 0.005;

/** The side view: how much farther out (columns, on average) a loose pellet is spread. */
export const LOOSE_SPREAD = 12;

/** The side view: how near its entrance (world units) an ant counts as at it, to drop a pellet. */
export const ENTRANCE_R = 1.5;

/** The side view: how near its entrance an ant on the ground line may dig (and how much ground round the hole stays unfilled). */
export const ENTRANCE_ZONE = 4;

/** A lone ant's chance to dig at a tunnel's end; each nestmate within two cells adds 1 / DIG_CROWD. */
export const DIG_ALONE = 0.1;

export const DIG_CROWD = 6;

/** At a dead end, the chance an ant digs 60° to a side instead of on along the tunnel's run: how often tunnels fork. */
export const FORK = 0.15;

/** Seconds an ant takes to dig one cell of soil open, at least (up to twice this, at random). */
export const DIG_TIME = 1;

export const NO_FACE = 0;

export const DIG_FACE = 1;

/** Soil touched at a slant: slide along it, a hand on the wall. */
export const GLANCE = 2;

/** A flat wall (a chamber's, or a tunnel's side) met head-on: where a new tunnel may start, now and then (START). */
export const START_FACE = 4;

/** The chance an explorer meeting a flat wall head-on starts a tunnel into it. */
export const START = 0.05;

/** The chance, per cell of chamber wall an explorer walks along, that it starts a tunnel into the wall there. */
export const START_HUG = 0.1;

/** Seconds an explorer keeps a hand on a chamber's wall after touching soil. */
export const HUG_TIME = 8;
