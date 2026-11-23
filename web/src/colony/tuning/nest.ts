// The nest's chambers and floor marks: porting food to reception and stores, widening, new chambers and their spacing. Part of the colony's tuning constants (docs/refactor.md S3.5, ja-fnd.4.5),
// re-exported by ../tuning.ts; moved verbatim from it, comments and values unchanged.

/** Chance per second an idle ant in reception or a store, with food there, carries a unit on (see port). */
export const PORT_RATE = 3;

/** A forager's food goes to reception only once it is a chamber of this many cells (see foodTo); until then, to the royal chamber. */
export const RECEPTION_MIN = 4;

/**
 * Seconds a forager carries its food before it will put it down in any of its colony's food chambers it stands in, not
 * only the one it takes food to (see port; ja-3ifx). A trip from a pocket by the nest is under a minute when it finds its way.
 */
export const STORE_AFTER = 60;

/** Rows either side of a chamber's mean row searched for its cell nearest that mean (the founding disc is the tallest: 9 rows). */
export const CHAMBER_SCAN = 5;

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

/**
 * Ants in the nest are bodies (docs/nurse-crowding.md, ja-k4k.15.7.1): with `cellCap` on, a step into a cell already at the cap
 * is refused, and the ant waits and turns aside. Between the cap and twice it an ant squeezes in at this rate a second (so no
 * ant waits for ever and a ring of full cells cannot deadlock): `1 - exp(-CELL_SQUEEZE dt)` a tick; at twice the cap never. **Design**: the rate; no
 * measurement was found of how long a nest ant waits at a full cell. Slowing with density was tried and cost throughput.
 */
export const CELL_SQUEEZE = 0.3;
