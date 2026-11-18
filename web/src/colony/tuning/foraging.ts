// Foraging and activation: rest, the colony's intake, contacts with returning foragers, leaving, waiting at the gate, how far food is sensed. Part of the colony's tuning constants (docs/refactor.md S3.5, ja-fnd.4.5),
// re-exported by ../tuning.ts; moved verbatim from it, comments and values unchanged.

// Zoning by age (nest slice 6): see band, mayGoOut, digs.
/** Seconds an ant rests at home in "return" before it is asked afresh as an explorer (ja-qnx). */
export const REST = 10;

/** half-life (s) of an ant's count of contacts with nestmates bringing food (behaviour MR 5: a rise is felt within seconds, gone in a minute or so) */
export const MET_HALF = 20;

/** "many" returns: this many times the colony's leaveGate */
export const RETURNS_MANY = 4;

/** leave answered "now": the rate per second a waiting forager goes out (one left 3–8 s after a rise in contacts: Pinter-Wollman et al. 2013) */
export const LEAVE_NOW = 1;

/** leave answered "soon" */
export const LEAVE_SOON = 0.2;

/**
 * One world (ja-web): the gate is the top of the ant's own shaft, cells within this many steps of its hole along its
 * tunnels. An outgoing forager is held there, milling, until it is asked out (`leave`) or has a pass.
 */
export const WAIT_STEPS = 3;

/** mill's scratch: the ways open from a cell (no allocation per step) */
export const MILL_WAYS = new Int8Array(6);

/**
 * How many steps through open ground food at a sensor's tip may be from the ant and still be sensed: the sensor's reach
 * (sensorDistance, 3) and two more, so food round a tunnel's bend or a chamber's corner is sensed as before. Fixed, not
 * derived: a sensorDistance swept past SENSE_STEPS would put every tip out of reach, so raise this with it (and inReach's
 * window, which is sized from it).
 */
export const SENSE_STEPS = 5;
