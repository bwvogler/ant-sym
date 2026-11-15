// Homing: wall-following, path integration's drift, the search round a belief, sight of the hole, following the ground's surface. Part of the colony's tuning constants (docs/refactor.md S3.5, ja-fnd.4.5),
// re-exported by ../tuning.ts; moved verbatim from it, comments and values unchanged.

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
