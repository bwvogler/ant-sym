// The colony's tuning constants: moved out of colony.ts as they were, in their old order, values and comments unchanged. A first, flat step toward tuning by domain (docs/refactor.md S3.5).

import { LIFESPAN, MIDDLE } from "./params.ts";

/** Seconds of wall-following before giving up on this wall for a while (a big rock mass can take over a minute to walk round). */
export const FOLLOW_GIVE_UP = 120;

/** Seconds of wall-following before trying the other side once (same line home). */
export const FOLLOW_FLIP = 45;

/** Seconds a wall-following ant may touch no rock before it lets go of the wall (the hug would circle in the open). */
export const WALL_LOST = 1.5;

/** Seconds a homing ant may get no nearer its goal before tunnel branches are picked by its home vector, and for how long. */
export const TUNNEL_STALL = 20;

export const BY_VECTOR = 15;

/** How near (cells) an ant must be to its line home to count as back on it: a step is ~0.23 cells, so it can't skip over. */
export const M_LINE_WIDTH = 0.6;

/** Releases from a soil wall a trip may make without getting any nearer home, before only progress counts. */
export const NO_GAIN = 3;

/** Nearer home than its best by this much (world units) counts as progress: it resets the no-gain count. */
export const GAIN = 0.5;

/** A wall-follower this near the nest, with a clear way to it, sees (or smells) it and leaves the wall. */
export const NEST_SIGHT = 8;

/** Path integration's drift (σ, per unit walked): the error is ~10 % of the distance walked (Wehner 2006; docs/nest-and-home.md §1). */
export const PI_DRIFT = 0.1;

/** One world's plane: each part (x, y) of the 2D drift, so its length's RMS is PI_DRIFT (U3b). */
export const PI_DRIFT_2D = PI_DRIFT / Math.SQRT2;

/** Within this (world units) across the ground of the hole (and twice it up or down: the crater) an ant sees it and smells the entrance: its vector no longer matters. */
export const HOLE_SIGHT = 6;

/** The search round a believed goal that wasn't there: the first loop's reach (cells), each next one SEARCH_GROW times wider, to at most the map's width. */
export const SEARCH_START = 3;

/** One world's plane: seconds a homing ant may get no nearer its belief before it searches on, wherever it is (see tick: it unblocks beliefs in rock, and fires far from the belief too). */
export const SEARCH_STALL = 3;

// Zoning by age (nest slice 6): see band, mayGoOut, digs.
/** Seconds an ant rests at home in "return" before it is asked afresh as an explorer (ja-qnx). */
export const REST = 10;

/** seconds over which the colony averages its intake (behaviour MR 5) */
export const INTAKE_WINDOW = 60;

/** food stored per ant per second below which the strategist reads "no intake" (behaviour MR 5; tuned, PRD §48) */
export const INTAKE_NONE = 0.0005;

/** and above which "plenty" */
export const INTAKE_PLENTY = 0.01;

/** half-life (s) of an ant's count of contacts with nestmates bringing food (behaviour MR 5: a rise is felt within seconds, gone in a minute or so) */
export const MET_HALF = 20;

/** half-life (s) of a scout's count of seconds in contact with strangers (behaviour MR 5.2) */
export const FOES_HALF = 20;

/** half-life (s) of an ant's threat (docs/stance.md: the fading internal state behind a defender's threshold) */
export const THREAT_HALF = 20;

/** half-life (s) over which a waiting ant feels how crowded home is (docs/stance.md) */
export const CROWD_HALF = 5;

/** "many" returns: this many times the colony's leaveGate */
export const RETURNS_MANY = 4;

/** leave answered "now": the rate per second a waiting forager goes out (one left 3–8 s after a rise in contacts: Pinter-Wollman et al. 2013) */
export const LEAVE_NOW = 1;

/** leave answered "soon" */
export const LEAVE_SOON = 0.2;

/** how far out a waiting forager mills, as a share of the nest's radius (behaviour MR 5) */
export const WAIT_RIM = 0.9;

/**
 * One world (ja-web): the gate is the top of the ant's own shaft, cells within this many steps of its hole along its
 * tunnels. An outgoing forager is held there, milling, until it is asked out (`leave`) or has a pass.
 */
export const WAIT_STEPS = 3;

/** #mill's scratch: the ways open from a cell (no allocation per step) */
export const MILL_WAYS = new Int8Array(6);

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

// The midden (nest slice 7): see #undertake, #dropOut, #middenSmell.
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
 * or a handful shies, a raid in force presses on (see #middenTurn).
 */
export const MIDDEN_SCALE = 5;

export const MIDDEN_CROWD = 3;

/** Chance per second an idle ant in reception or a store, with food there, carries a unit on (see port). */
export const PORT_RATE = 3;

/** Food the royal chamber is kept stocked with for the queen (a few eggs' worth, and the larvae lying with her). */
export const QUEEN_STOCK = 8;

/** Chance per second an idle ant in the royal chamber picks up an egg near it to take to a brood chamber. */
export const PICK_BROOD = 0.5;

/** Seconds a nurse holds brood before it puts it down wherever it is; a porter, its food, in whichever of its chambers it is by. */
export const HOLD_MAX = 30;

/** A forager's food goes to reception only once it is a chamber of this many cells (see #foodTo); until then, to the royal chamber. */
export const RECEPTION_MIN = 4;

/**
 * Seconds a forager carries its food before it will put it down in any of its colony's food chambers it stands in, not
 * only the one it takes food to (see port; ja-3ifx). A trip from a pocket by the nest is under a minute when it finds its way.
 */
export const STORE_AFTER = 60;

/** Rows either side of a chamber's mean row searched for its cell nearest that mean (the founding disc is the tallest: 9 rows). */
export const CHAMBER_SCAN = 5;

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

// Floor marks (nest slice 3): see layMark, destMark, roleFor.
/** Marks are laid at the colony's trail deposit per second just out of a chamber, falling to 1/e after MARK_DECAY seconds away from it. */
export const MARK_DECAY = 30;

/** How much more a homing ant in a tunnel goes by its destination's mark than by the home trail. */
export const SIGN_WEIGHT = 4;

/** A new chamber this many rows above the royal one may be the reception (the colony's first); this many below, a store. */
export const RECEPTION_ABOVE = 4;

export const STORE_BELOW = 2;

// Chambers (nest slice 2): see crowded(), widenWay, newChamberWay.
/** Floor cells a nest keeps per ant underground: below it the nest is crowded and digs (Odontomachus ~2 cm² per worker, at the sim's scale). */
export const FLOOR_PER_ANT = 0.1;

/** Chance an explorer touching its crowded chamber's wall widens it there; brood lying in it makes it likelier (× 1 + BROOD_PULL per brood, up to 10). */
export const WIDEN = 0.3;

export const BROOD_PULL = 0.2;

/** Widening falls off with a chamber's depth (rows) as exp(−depth / WIDEN_DEPTH). */
export const WIDEN_DEPTH = 30;

/** Chance per tunnel cell (at the surface; × exp(−depth / CHAMBER_DEPTH)) that a crowded explorer starts a new chamber there. */
export const NEW_CHAMBER = 0.04;

export const CHAMBER_DEPTH = 40;

/** No chamber within the top rows (the crust and mound), and none within CHAMBER_GAP + depth × CHAMBER_GAP_GROWTH rows (and CHAMBER_SPREAD columns) of another. */
export const CHAMBER_MIN_DEPTH = 8;

export const CHAMBER_GAP = 4;

export const CHAMBER_GAP_GROWTH = 0.15;

export const CHAMBER_SPREAD = 10;

/** A roomy nest digs this share as often as before (tunnels at dead ends, starts off walls, head-on). */
export const ROOMY_DIG = 0.15;

/** Cells a homing ant follows the ground's surface round spoil before trying the other hand (then twice as far each time: see flipDue). */
export const GROUND_FLIP = 24;

/** Seconds between rebuilds of the way-out field (outField) while the ground keeps changing; a cell dug since steps straight toward the hole meanwhile. */
export const OUT_FIELD_EVERY = 0.5;

/** Cells an ant feels ahead along the surface, each way, to choose which hand to follow it with. */
export const GROUND_LOOK = 16;

/** Seconds on a strong nest trail for the in-nest memory's error to fall to 1/e. */
export const ROAD_SIGN = 2;

export const SEARCH_GROW = 1.6;

/** One world's plane: the search's reach grows SEARCH_GROW times a loop, a full turn of four points a quarter turn apart. */
export const SEARCH_GROW_2D = Math.sqrt(Math.sqrt(SEARCH_GROW));

/** A believed hole is never nearer the map's side than this (world units): the walkway's end columns' centres are within 1 of it, so an ant there counts as at its belief. */
export const EDGE = 0.75;

/** The two touch probes that pick which side to keep a newly met wall on: this far either side of the home vector. */
export const WALL_PROBE = Math.PI / 3;

/**
 * How many steps through open ground food at a sensor's tip may be from the ant and still be sensed: the sensor's reach
 * (sensorDistance, 3) and two more, so food round a tunnel's bend or a chamber's corner is sensed as before. Fixed, not
 * derived: a sensorDistance swept past SENSE_STEPS would put every tip out of reach, so raise this with it (and inReach's
 * window, which is sized from it).
 */
export const SENSE_STEPS = 5;

/**
 * How much more room dug soil takes loose than in place (its swell): sand 10–15 %, loam 20–30 %, clay
 * 30–40 % in earthwork references; the sim's soil is unspecified, so 20 %.
 */
export const SWELL = 1.2;

/** The side view: about how high (rows) the spoil disc stands as it spreads: a steep cone halved the food brought home, six rows cost a third. */
export const MOUND_HEIGHT = 3;

/** The side view: the farthest (columns) a pellet is carried from the hole; past it the disc grows higher, not wider. */
export const MOUND_REACH = 90;

/** The midden lies this many columns from the hole, toward the nearest other colony (see middenSide): just past the mound's largest reach. */
export const MIDDEN_AT = MOUND_REACH + MIDDEN_PAST;

/**
 * One world's plane (U3c): a corpse is put on the midden no nearer home than this by the undertaker's own vector, and off
 * the mound: a ring at the edge of the cleared ground (the owner's stopgap, 2026-11-09, until corpse scent lets undertakers
 * find one pile).
 */
export const MIDDEN_MIN = 8;

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
