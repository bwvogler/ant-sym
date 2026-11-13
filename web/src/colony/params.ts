// The colony's parameters (a step of docs/refactor.md S3, ja-fnd.4.7): what a species or a game sets for a colony, and the defaults. Moved out of colony.ts as they were.

import { DEFAULT_CHANNELS, type Channel, type ChannelParams } from "./pheromone.ts";
import { TOLERANCE } from "./vocab.ts";

/**
 * Backfill tuning (frozen; tests and sweeps change it only through ColonyParams.backfill, per colony). A pellet carrier may fill only
 * `after` seconds into its trip home, and never the cell it dug. A side passage counts as unused when its scent is
 * under staleRatio × the scent where the carrier stands (or FAINT), raised up to (1 + pelletPull)× next to pellets
 * filled in the last pelletTau seconds or so. A carrier takes a stale way at a fork with chance enterStale, until
 * staleSearch seconds into its trip home. A filled cell is not dug again for `hold` seconds (see refilled), and a cell
 * dug in the last `young` seconds is not filled.
 */
export const BACKFILL = Object.freeze({
  after: 2.5,
  staleRatio: 0.5,
  enterStale: 0.3,
  staleSearch: 20,
  pelletTau: 60,
  pelletPull: 6,
  maxOpen: 5,
  hold: 600,
  young: 200,
} as const);

/** The backfill tuning as a type, each number free to vary (ColonyParams.backfill). */
export type BackfillTuning = { readonly [K in keyof typeof BACKFILL]: number };

/** Age bands, as shares of LIFESPAN: young below YOUNG, middle-aged below MIDDLE, old beyond. */
export const YOUNG = 0.15;

export const MIDDLE = 0.35;

/** A worker's mean lifespan, seconds (each 0.7–1.3× it): an orphaned colony dwindles as its workers age out. */
export const LIFESPAN = 3600;

export interface ColonyParams {
  antCount: number;
  /** most living ants the colony can have; food beyond it waits in the larder */
  maxAnts: number;
  /** stored food per new ant */
  foodPerAnt: number;
  /** which of the map's nests is home */
  nest: number;
  /** cells per second */
  speed: number;
  /** how far ahead the three sensors sit, cells */
  sensorDistance: number;
  /** left and right sensors, radians off the heading */
  sensorAngle: number;
  /** fastest turn, radians per second */
  turnRate: number;
  /** random turning while exploring, radians per second (scale of the noise) */
  wander: number;
  /** pheromone laid per second just after leaving the nest or the food */
  deposit: number;
  /** seconds for that deposit to fall by e: older steps lay less, so a trail rises toward its source */
  depositDecay: number;
  /** seconds out without food before an ant counts as tired */
  patience: number;
  /**
   * One world's plane (ja-lp4.15, docs/forager-trips.md §1): a forager on the plane tires at `patience` × this (the
   * fungus's `clock` still scales it); in the nest, and in the side view and top-down maps, at `patience`. On the plane
   * the home vector's error grows with every cell walked, so a long search ends sooner. 1 = `patience` everywhere.
   */
  planePatience: number;
  /**
   * seconds of rest inside its own nest that take a tired forager's fatigue from `patience` back to nothing (ja-q47,
   * docs/tiredness.md): rest is a stay inside, not a step through the hole
   */
  restTime: number;
  /**
   * a follower's choice of way by trail strength, the constant k of (k + C)² (see choose); 0 = always the strongest
   * sensor (before behaviour MR 3). Small k: strength counts for much; large: choices near even.
   */
  followChoice: number;
  /**
   * on a top-down map, the food trail's share of `deposit`: 1. (MR 3 first laid a quarter, to keep the trail under the
   * field's cap; too weak to reach the level at which explorers follow, it left them wandering: review of #37. The cap
   * is raised instead: foodCapTop.)
   */
  foodTrailTop: number;
  /** on a top-down map, the most food trail a cell holds (behaviour MR 3; the other channels and the side view: MAX_LEVEL 20) */
  foodCapTop: number;
  /**
   * a food carrier's pull toward the food trail on its way home, top-down (ja-00t): the share of its turning given to the
   * trail where the trail agrees with its home vector, the rest to the vector; 0 = the vector alone (before MR 3)
   */
  homeTrail: number;
  /** how far off its home vector (radians) a carrier still takes the food trail home (ja-00t) */
  homeTrailCone: number;
  /**
   * how hard a follower shies from "no entry" (behaviour MR 3): each sensor's food scent counts less by this many times
   * its "no entry" reading; 0 = ignore it, and lay none. Off by default: on the assays it cost A2a more than it gained
   * on A3, which the trail's evaporation and tiredness already clear (PRD §45.4)
   */
  noEntryAvoid: number;
  /** how hard a faint alarm draws an ant whose alarmGain is negative, as a share of turnRate (behaviour MR 4) */
  alarmDraw: number;
  /** how hard ants turn away from alarm, as a share of turnRate */
  alarmAvoid: number;
  /**
   * Activation (behaviour MR 5, docs/activation.md): encounters with nestmates coming home with food, in the ant's
   * leaky count `met`, from which a waiting forager senses returns as "few" (RETURNS_MANY times as many: "many"). A
   * rested forager home with empty jaws is then asked `leave` instead of going straight out. 0 = off: it goes straight
   * out. Top-down maps, and one world, where an outgoing forager is held at the gate at the top of its shaft (ja-web,
   * PRD §48.6). 1 (PRD §48.4: G′ seeds 1–20 lost 5.2 % fewer ants for 2.9 % less food home; A5 passes).
   */
  leaveGate: number;
  /**
   * One world's plane (ja-lp4.11, docs/nest-search.md): a homing ant whose vector ran out where no hole was searches in
   * loops out from that spot and back (Wehner & Srinivasan 1981; Müller & Wehner 1994), the first reaching this many σ
   * out, σ being its own vector's error per axis at the trip it walked (PI_DRIFT/√2 × odoSurf; Merkle & Wehner 2010: the
   * search is wider after a longer trip). 0 = U3b's widening four-point spiral, bit for bit: the default (PRD §56: the loops,
   * tuned to 1.5, won S1 but lost G1 and A1 to the spiral with the mound's smell).
   */
  searchLoops: number;
  /** One world's plane: each next loop reaches this many σ further out than the last (searchLoops) */
  searchGrow: number;
  /** One world's plane: radians between one loop's heading and the next's (the golden angle spreads them evenly round) */
  searchTurn: number;
  /** One world's plane: a loop's width (radians): out at its heading − half of it, across to + half, back to the centre */
  searchPetal: number;
  /**
   * One world's plane, with searchLoops: a homing ant no nearer its search's point for SEARCH_STALL seconds moves on to the
   * loop's next point (1), or starts the next, wider loop (0: U3b's widening on a stall, as loops).
   */
  searchStall: number;
  /**
   * One world's plane (ja-lp4.11, docs/nest-search.md): a searching ant (its vector ran out at no hole) on its own mound
   * smells its colony's hydrocarbons there, strongest at the hole (Sturgis, Greene & Gordon 2011), and walks up them to
   * its hole, as it does in sight of it; only while searching (Buehlmann, Hansson & Knaden 2012). 1 = on; 0 = HOLE_SIGHT only.
   */
  moundSmell: number;
  /**
   * One world's plane (ja-lp4.15, docs/forager-trips.md §3): a forager that picks up food keeps its own vector to the spot
   * (where it believes the food is, relative to its hole: what its home vector said at pickup, drift and all). On its
   * next trip out it walks that vector straight, and searches round the spot when it gets there; a food trail it meets
   * still takes over. It forgets the spot when it tires there without finding food, and replaces it at its next find
   * (Wolf, Wittlinger & Bolek 2012; Cheng, Narendra & Wehner 2006). 1 = on; 0 = no memory of a find (main bit for bit).
   */
  siteFidelity: number;
  /**
   * One world's plane, with siteFidelity (ja-lp4.15): a forager gives up the spot it searches round once the search's reach
   * has widened past this many σ of the vector that led it there (σ = PI_DRIFT × that vector's length: an ant widens its
   * search with its vector's length, Merkle & Wehner 2010), not waiting to tire. 0 = only tiring ends it.
   */
  siteGive: number;
  /**
   * One world's plane (ja-lp4.16, docs/route-memory.md, PRD §59): a forager keeps its own way out, places stored every
   * `routeStep` cells while it walks out (at most `routeMax`), and a carrier whose home vector fails walks back through
   * them, recognising a place within `routeSee` cells (a stand-in, by design, for a familiar view; Collett et al. 2013;
   * backtracking, Wystrach et al. 2013). 1 = when the vector stalls (no nearer its belief for SEARCH_STALL); 2 = also on
   * reaching its belief with no hole there; 0 = nothing recorded, main bit for bit. Once a trip. Steering only.
   */
  routeMemory: number;
  /** One world's plane, with routeMemory: cells walked between two stored places. */
  routeStep: number;
  /** One world's plane, with routeMemory: a stored place this close counts as recognised (0: only the next place in order, within LOOP_AT). */
  routeSee: number;
  /** One world's plane, with routeMemory: places an ant stores (when full it keeps every second and doubles its spacing). Read when the colony is built (the arrays' size). */
  routeMax: number;
  /**
   * Behaviour MR 5.2 (docs/raid-recruitment.md): on a top-down map, raiders are recruited by a trail (1) and not sent at the
   * rival hole's coordinates (0). A scout that meets strangers outside, with nothing in its jaws, goes home laying the
   * `raid` trail; raiders at the nest wait for it (or go as scouts, `scoutRate`), and out, climb it.
   */
  raidGate: number;
  /** the raid trail a finder lays, as a share of `deposit` (more after meeting more strangers) */
  raidLay: number;
  /** seconds of contact with strangers that make a scout a finder */
  findAt: number;
  /**
   * a raider on the raid trail that finds nothing ahead as strong as underfoot leaves it and searches on, out and away from home,
   * as a scout does (1; 0: it keeps climbing, and mills at the trail's end). It happens mostly near home, where the trail is
   * weak and patchy: the trail recruits and points the way, and the search does the rest (ja-sf1, review of #44)
   */
  raidOnward: number;
  /**
   * on a top-down map, each ant's stance is its own, from what it senses (1, docs/stance.md): raid once recruited, defend while
   * it senses a threat on home ground, else forage; and raid scouts go out on the `leave` answer "raid". 0: the colony's
   * strategist chooses one stance for every ant, as on the side view
   */
  stanceGate: number;
  /** seconds of threat (alarm smelt, strangers in reach; leaking, THREAT_HALF) that make an ant on home ground defend (docs/stance.md) */
  defendAt: number;
  /** how far from its nest an ant is on home ground, by its home vector (world units) */
  homeGround: number;
  /** nestmates round a waiting ant (its cell and the six round it, felt over CROWD_HALF) that make its home "crowded" */
  crowdAt: number;
  /** the rate per second an idle ant at home that smells a strong raid trail is recruited (less on a faint one): raids grow by degrees (docs/stance.md) */
  raidRecruit: number;
  /**
   * the rate per second an ant at home goes out to look for the rival: answering `leave` "raid" (each ant's own stance,
   * docs/stance.md), or, where the colony's stance is broadcast, on a raid stance with no raid trail under it (a scout: a
   * spontaneous rate, like `scoutRate`; the rest carry on foraging until a scout's trail reaches them)
   */
  raidScout: number;
  /**
   * a waiting forager whose `leave` answer is "wait" still goes out at this rate per second: a scout (Gordon's patrollers;
   * foragers waited about 3 min with none returning). 1/90: at 1/180 G′'s worst seed fell to 5 ants alive (PRD §48.4)
   */
  scoutRate: number;
  /** a worker's mean lifespan, seconds (each 0.7-1.3x it): the age bands are shares of it. A species with another career sets it (the desert ant's forager lives days, not an hour). */
  lifespan: number;
  /** the age bands as shares of `lifespan`: young (nurses) below `youngShare`, middle-aged (dig and carry inside) below `middleShare`, old (forage) beyond. A colony without a queen has one band: old. */
  youngShare: number;
  middleShare: number;
  /** whether workers age out when there is no queen (a plane colony): the generic ant's do not, a species with a short forager career sets true */
  mortalWithoutQueen: boolean;
  /** whether the colony's middle-aged carry its dead out to the midden (#undertake). A species that does not (the desert ant) sets false, and its dead lie where they fell. */
  undertakes: boolean;
  /**
   * Whether the species has a follow mode (ja-fnd.5.9): the generic ant does. A species whose mode words drop `follow` (the Game derives this
   * from them) never enters FOLLOW: an ant that put its load down heads out exploring, a returner leaves as an explorer, and a policy's
   * `follow` (a stale answer, a rule that offers it) is read as explore. Its action set, not a choice: the policy chooses among the rest.
   */
  follows: boolean;
  /** the colony's odour at the start, 0..1 (recognition.ts): the game gives each colony its own */
  odour: number;
  /** odours further apart than this are strangers, as a healthy ant perceives it */
  tolerance: number;
  /** cells round an ant it checks for enemies (the hex disc of this radius) */
  enemyRange: number;
  /** evaporation and spread of the colony's pheromone channels, per channel and field; those left out keep their defaults */
  channels: Partial<Record<Channel, Partial<ChannelParams>>>;
  /**
   * The channels the species lays and reads (ja-fnd.5.11), or null for every channel (the generic ant). A channel left out is never laid on
   * any layer, so it holds nothing, wakes no chunk, and reads 0 to the colony's sensors and to the fungus's levers on it (inertLevers).
   */
  channelSet: readonly Channel[] | null;
  /**
   * Trips end (ja-qnx): with "explore" or "follow", a fresh forager going home with empty jaws is that once it gets there
   * (the nest on a top-down map; the royal chamber in the side view, the old only), and asked afresh; and any value but
   * "return" also makes an ant that has just put its load down a follower (whatever this says: see the tick). "return"
   * keeps the old behaviour, bit for bit: returning until REST sends it out.
   */
  arrive: "explore" | "follow" | "return";
  /** the backfill tuning (BACKFILL): a test or sweep changes it for the colonies it builds, not for the process */
  backfill: BackfillTuning;
  /** how much a tunnel's run drifts per cell dug (radians, standard deviation): the meander. 0 = tunnels run straight. */
  tunnelDrift: number;
}

/** One world's plane, with loops (searchLoops): within this (world units) of a loop's point, the ant is there and goes on to the next. */
export const LOOP_AT = 2;

/** π(3 − √5), ~137.5°: successive turns by it never line up, so loops headed so spread evenly round their centre (searchTurn). */
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

export const DEFAULT_COLONY: ColonyParams = {
  antCount: 800,
  maxAnts: 1200,
  foodPerAnt: 4,
  nest: 0,
  speed: 7,
  sensorDistance: 3,
  sensorAngle: 0.6,
  turnRate: 6,
  wander: 4,
  deposit: 4,
  depositDecay: 20,
  patience: 60,
  planePatience: 1,
  restTime: 30,
  followChoice: 1,
  foodTrailTop: 1,
  foodCapTop: 80,
  homeTrail: 0.8,
  homeTrailCone: Math.PI / 2,
  noEntryAvoid: 0,
  alarmDraw: 2,
  alarmAvoid: 1.5,
  leaveGate: 1,
  searchLoops: 0,
  searchGrow: 0.125,
  searchTurn: GOLDEN_ANGLE,
  searchPetal: Math.PI / 3,
  searchStall: 1,
  moundSmell: 1,
  siteFidelity: 0,
  siteGive: 0,
  routeMemory: 0,
  routeStep: 8,
  routeSee: 5,
  routeMax: 64,
  raidGate: 1,
  raidLay: 1,
  findAt: 0.3,
  raidOnward: 1,
  stanceGate: 1,
  defendAt: 1,
  homeGround: 10,
  crowdAt: 40,
  raidRecruit: 0.1,
  raidScout: 1 / 90,
  scoutRate: 1 / 90,
  undertakes: true,
  follows: true,
  lifespan: LIFESPAN,
  youngShare: YOUNG,
  middleShare: MIDDLE,
  mortalWithoutQueen: false,
  odour: 0,
  tolerance: TOLERANCE,
  enemyRange: 2,
  channels: Object.freeze({}),
  channelSet: null,
  arrive: "explore",
  backfill: BACKFILL,
  tunnelDrift: 0.2,
};

/** A food cell seen by a sensor, or the nest seen by a homing ant, beats any trail. */
export const SEEN = 100;

/** Food scent under a follower at least this strong, and weaker all round, is a trail's end (behaviour MR 3: "no entry"). */
export const NO_ENTRY_TRAIL = 1;

/** ...and every sensor reads under this share of it: the trail drops away ahead and to both sides (not a bend). */
export const NO_ENTRY_DROP = 0.5;

/** "No entry" laid per second at a spent trail's end, as a multiple of the colony's deposit. */
export const NO_ENTRY_RATE = 4;

/** Every channel's params: the defaults, with `over` merged in per channel and per field. */
export function channelParams(over: Partial<Record<Channel, Partial<ChannelParams>>> = {}): Record<Channel, ChannelParams> {
  const out = { ...DEFAULT_CHANNELS };
  for (const [ch, p] of Object.entries(over) as [Channel, Partial<ChannelParams>][]) out[ch] = { ...DEFAULT_CHANNELS[ch], ...p };
  return out;
}
