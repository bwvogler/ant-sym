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
  /** Experimental surface retreat speed multiplier for an unladen ant moving away from a sensed threat. */
  withdrawalSpeed?: number;
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
   * How an ant draws its mode from Jev's probabilities (ja-nan3; colony/weighted.ts): p^(1/T), so 1 as Jev
   * gave them, under 1 toward the mode Jev chose (0: always it, as before), over 1 toward even. A policy with no
   * probabilities (the local rule, a bare cached answer) is never drawn from.
   */
  sampleTemp: number;
  /**
   * Seconds after an ant drew its mode before it draws again in the same situation (ja-nan3): without it an ant
   * is asked only when its situation changes, so a draw would hold for as long as nothing round it changed. 0 = never
   * again until the situation changes. Only an ant whose last answer was drawn is re-asked: a game on the local rule is unchanged.
   */
  reroll: number;
  /**
   * How long an ant holds a drawn mode before it draws again: 0, exactly `reroll` seconds; 1, a time drawn from an exponential law
   * with mean `reroll` (a hazard of dt/reroll a tick: some ants change their mind after a second, others hold for a minute, and
   * they fall out of step by themselves). Needs `reroll` > 0.
   */
  rerollLaw: number;
  /**
   * Whether an ant out exploring or following on one world's plane asks the steer policy for its steering weights (
   * ja-ykmu; docs/steering.md): 0, never (every weight neutral: main's steering bit for bit); 1, at each mode decision.
   */
  steerLane: number;
  /** Permit explicit food destination roles from carry responses; 0 preserves legacy routing. */
  deliveryLane: number;
  /** Seconds before carry senses a long local delivery attempt; 0 disables tracking (design). */
  deliveryReconsider: number;
  /** Cumulative seconds of refused unloading at eligible sites before a forager releases food for pickup. Zero disables recovery. */
  dropRefusalLimit: number;
  /** With steerLane: within this (cells) of where it believes its last find is, an ant steers by its `near` weights (design). */
  findNear: number;
  /** With steerLane: how far the `search` weight scales random turning: ÷ this at low (tight), × this at high (wide); 1 = no effect (design). */
  searchSpan: number;
  /**
   * on the plane, the food trail's share of `deposit`: 1. (MR 3 first laid a quarter, to keep the trail under the
   * field's cap; too weak to reach the level at which explorers follow, it left them wandering: review of #37. The cap
   * is raised instead: foodCapPlane.)
   */
  foodTrailPlane: number;
  /** on the plane, the most food trail a cell holds (behaviour MR 3; the other channels and the curtain: MAX_LEVEL 20) */
  foodCapPlane: number;
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
   * out, σ being its own vector's error per axis at the trip it walked (PI_DRIFT/√2 × piSpan: the odometer, or by the
   * distance out with piErrorLaw 1; Merkle & Wehner 2010: the search is wider after a longer trip). 0 = U3b's widening four-point spiral, bit for bit: the default (PRD §56: the loops,
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
   * One world's plane (ja-lp4.20, docs/nest-search.md "Sizing the search to the vector's error", PRD §79.2): U3b's spiral
   * (searchLoops 0) sized by the vector's own error, σ = PI_DRIFT/√2 × piSpan (with piErrorLaw 1, PI_SPAN_GAIN ×
   * √(piErrorAt × distance out)): its first point this many σ out (at least SEARCH_START), each next quarter turn
   * searchScaleStep/4 σ further (an even spiral, not 1.6× a turn). The search is wider after a longer trip, by the distance
   * out (Merkle, Knaden & Wehner 2006; Merkle & Wehner 2010), broader with more uncertainty (Vickerstaff & Merkle 2012); the
   * multiples are design. Not round a stored place (routeEnd): that search is the spiral's. 0 = U3b's spiral, bit for bit;
   * 1 the default (owner, 2026-11-16, with piErrorLaw 1).
   */
  searchScale: number;
  /** One world's plane, with searchScale: σ a full turn of the spiral adds to its reach (design) */
  searchScaleStep: number;
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
   * Food odour in the air (ja-rf5.4, docs/desert-ant.md §3): an outside forager with empty jaws and no food in sight climbs the
   * smell of food within this many cells of it (a gradient through open ground; plume.ts), ahead of its search and of its vector
   * to a remembered spot. 0 = no food odour (the generic ant: main bit for bit).
   */
  foodPlume: number;
  /**
   * Aphid odour in the air (ja-nzkg.3, docs/aphids.md finding 1): an outside ant with empty jaws climbs the smell of a living
   * aphid clump (the builder's) within this many cells of it (aphids.ts, plume.ts). L. niger scouts head toward aphid odour in
   * olfactometers (Verheggen et al. 2012); no field range was measured, so the range is design. 0 = deaf to it (a species
   * that takes no honeydew). With no clump on the map it reads nothing: main bit for bit.
   */
  aphidPlume: number;
  /**
   * Tenders defend (ja-nzkg.4, docs/aphids.md finding 5): an ant touching a living aphid clump (on an aphid cell or beside one) counts
   * as on home ground for the defend stance, so a threat it senses there makes it stand and fight rather than flee, and it calls no one
   * from the nest. L. niger caretakers bit an intruder more often than other ants (90 % against 76 %; Gaber et al. 2024); against
   * rival ants it is design (no study measured colonies fighting over aphids). 0 = no tending defence: main bit for bit.
   */
  tendDefend: number;
  /**
   * Aphids eaten (ja-nzkg.5, docs/aphids.md finding 6): an ant taking honeydew from a living aphid cell takes one of the aphids
   * instead with this chance, home as food (quality 1). Ants eat some aphids: with larvae, colonies left 118 against 147 after 7
   * days (Oliver, Leather & Cook 2012); another study saw none in 10 days (Jossart et al. 2025). The rate is design, and is not
   * tied to the colony's hunger yet (ja-nzkg.7: no sensed cue for it). 0 = never eaten: main bit for bit.
   */
  aphidPrey: number;
  /**
   * Heat (ja-rf5.5, docs/desert-ant.md §4, heat.ts): the length of a day in game seconds, over which the plane's ground heats from heatDawn to
   * heatNoon and back. An ant's body heat moves toward the ground's on the plane and the nest's inside; it senses its own heat (a species' `hot`
   * field) and dies past heatDeath. 0 = no heat (the generic ant: main bit for bit).
   */
  heatDay: number;
  /** the ground's heat at dawn (°C) */
  heatDawn: number;
  /** the ground's heat at noon (°C) */
  heatNoon: number;
  /** the nest's heat underground (°C): a body's heat is kept as degrees above it */
  heatNest: number;
  /** seconds for a body's heat to close 63 % of the way to its surroundings' */
  heatTau: number;
  /** the body heat at which an ant feels hot (°C) */
  heatFelt: number;
  /** once hot, an ant feels hot until its body is back below this (°C): it rests to cool, as a tired ant rests until fully rested */
  heatCool: number;
  /** the sun's height (0 at dawn, 1 at noon) from which an ant that can see the sky sees it stand high (desert-heat.md §2: design) */
  heatSunHigh: number;
  /** the share of each day the sun is down: the night, cool and dark, after the daylight (owner, 2026-11-13) */
  heatNight: number;
  /** seconds after sunrise at which a game starts: the desert ant's nest opens as the sun turns high, so a game opens then */
  heatStart: number;
  /**
   * The invitation (ja-rf5.6, docs/desert-ant.md §1, Razin et al. 2013, full text): the pace (cm/s) of a finder coming down the shaft with food.
   * Each nestmate waiting at the top of the shaft that it passes is pulled toward its pace; an ant's pace relaxes to paceRest, the faster the
   * more crowded the shaft feels, and its own pace is what its `leave` response reads (returns few from paceFew, many from paceMany). 0 = no
   * invitation: the generic ant's encounter count of returns (activation.md), main bit for bit.
   */
  invitePace: number;
  /** a waiting ant's pace at rest (cm/s; C. niger idle ants about 1–2 cm/s, the crossing at about 2: Razin 2013) */
  paceRest: number;
  /** seconds for a pace to fall back by e toward paceRest */
  paceTau: number;
  /** how far one finder passing pulls a waiting ant's pace toward its own (0–1) */
  paceGain: number;
  /** how much each nestmate round a waiting ant speeds its pace's fall back to rest: paceTau / (1 + paceCrowd × crowd) (crowding lowers exits) */
  paceCrowd: number;
  /** the pace from which an ant's leave response reads its returns as few (cm/s) */
  paceFew: number;
  /** the pace from which it reads them as many: the soft threshold for leaving, about 8 cm/s (Razin 2013) */
  paceMany: number;
  /** the critical body heat (°C): past it, the ant dies */
  heatDeath: number;
  /**
   * One world's plane (ja-lp4.16, docs/route-memory.md, PRD §59): a forager keeps its own way out, places stored every
   * `routeStep` cells while it walks out (at most `routeMax`), and a carrier whose home vector fails walks back through
   * them, recognising a place within `routeSee` cells (a stand-in, by design, for a familiar view; Collett et al. 2013;
   * backtracking, Wystrach et al. 2013). 1 = when the vector stalls (no nearer its belief for SEARCH_STALL); 2 = also on
   * reaching its belief with no hole there; 0 = nothing recorded, main bit for bit. Once a trip. Steering only.
   */
  routeMemory: number;
  /**
   * ja-uvhw: 1 = a sensor reads scent (food, home and alarm trails, and the nest in sight) only where its tip can be reached
   * through open ground within SENSE_STEPS (inReach), as food itself is (ja-juiu); out of reach (another tunnel, behind a
   * wall), it reads none. 0 = scent is read at the tip whatever lies between (main before ja-uvhw; kept for ablation).
   */
  scentReach: number;
  /**
   * ja-4rfr: 1 = hunger gets an ant to the stores. Its own hunger (below ADULT_BEG_BELOW) counts as well as what it feels
   * from others; in a chamber, hungry, it steers by the stores' marks its sensors reach, and stays in; hunger ends a tired
   * ant's rest; and an ant in "return" by a store takes food on from it (port), as an explorer does. 0 = only explorers
   * fetch, by felt need, and only in tunnels (main before ja-4rfr): the old sat in the royal chamber, or climbed out,
   * while the colony starved beside a full store.
   */
  restFetch: number;
  /**
   * ja-rvli: how strongly a larva begs while it is still owed the food it grows on (felt by touch, as hunger is; hungry
   * larvae beg by movements nurses feel, Peignier et al. 2019). Without it a larva asked for nothing until hungry, about
   * two minutes after its last meal, and was fed only when ants hungry themselves happened to fetch food by it. 0 = off.
   * 0.3, measured over 16 hour-long games (PRD §70): on its own it left more larvae waiting than off (peaks 54, 29, 27 against
   * at most 19), so it stays off; a fix for ja-rvli needs another cue.
   */
  owedBeg: number;
  /**
   * ja-7r7x (docs/task-reversion.md, PRD §74): the share of old ants that revert to nursing when they meet no young
   * nestmates at home (each by its own draw: individual thresholds). A reverted ant stays in, keeps to the queen and
   * brood as the young do, works inside at the young's threshold and takes no foraging dig; it goes back to foraging
   * once it meets young again. 0 = off; on (1) by default since ja-7r7x.4.
   */
  revert: number;
  /**
   * ja-638i (docs/larval-feeding.md, PRD §75): an ant's crop, in food units. An ant underground that feels some need fills
   * it from a stocked store or reception within reach, passes food mouth to mouth to a needier nestmate, and feeds the
   * larvae it touches that beg or are still owed their growth food, more for a hungrier one. 0 = off, the default: at 0.1
   * (with `revert` 1) no worker starved on assay larvae, but one-world A5 brought home less food (12 of 20 seeds worse) and
   * larvae seed 19 left 47 larvae waiting (PRD §75, review of #236; ja-638i.4). Without reversion 0.1 is worse than off:
   * larvae seeds 26 and 30 fell to 71 and 65 workers.
   */
  cropFeed: number;
  /**
   * ja-16rp (docs/foraging-tunnels.md, PRD §70): seconds of digging (counted while it explores in the nest) an old forager
   * home from a trip with nothing takes before it climbs back out. At tunnels' dead ends and forks (walkTunnel) it digs
   * without the ROOMY_DIG damping and without nestmates by; starting a face or meeting a tunnel's end head-on (move.ts)
   * and hug's start still damp it in a roomy nest. It builds and widens no chambers, and stops when the time is up or it
   * picks up food. 0 = off.
   * Off by the owner's call (2026-11-14): 120 s nearly doubled the buried food taken in an hour (Assay P1, seeds 1-20),
   * but larvae were left waiting beside food in 15 of 16 hour-long games (ja-rvli); on again once larvae are fed.
   */
  forageDig: number;
  /** One world's plane, with routeMemory: cells walked between two stored places. */
  routeStep: number;
  /** One world's plane, with routeMemory: a stored place this close counts as recognised (0: only the next place in order, within LOOP_AT). */
  routeSee: number;
  /** One world's plane, with routeMemory: places an ant stores (when full it keeps every second and doubles its spacing). Read when the colony is built (the arrays' size). */
  routeMax: number;
  /**
   * One world's plane, with routeMemory (ja-lp4.6.3.1, docs/route-memory.md §5): where a retrace joins the stored way out. 0 = at
   * its newest place (back where it picked up). 1 = once its vector has run out near home (it reached its belief, found no hole
   * and is searching there), at the nearest stored place it can see (a clear straight line), else its newest; a stall before
   * that, at or near the pickup, still starts from its newest place. A route is taken up at the stage reached (Freas & Spetch
   * 2024), and a zero-vector ant backtracks only a short way before it searches (Wystrach et al. 2013). 2 = the nearest place in
   * view at every retrace (the first build: A2b lost seeds 9, 23 and 24 of 30). Steering only.
   */
  routeJoin: number;
  /**
   * One world's plane, with routeMemory (ja-lp4.6.3.1, docs/route-memory.md §5): where the search goes once a retrace is over.
   * 0 = round its vector's end, as before the retrace; 1 = afresh (from SEARCH_START) round its first stored place, the
   * familiar place nearest its hole (near the nest, remembered views outweigh a vector run down: Bregy, Sommer & Wehner
   * 2008). Steering only.
   */
  routeEnd: number;
  /** Consecutive stalled retrace targets before resuming ordinary homing. Zero keeps the existing retrace. */
  routeStallLimit: number;
  /**
   * One world's plane, with routeMemory (ja-lp4.6.3.1, docs/route-memory.md §5): 1 = an ant walking out in `fight` mode stores its
   * places too, as an explorer does (a fighter that then finds food had no way out to retrace: G1 seed 3); 0 = only exploring and
   * following. The literature is silent on fighters (design). Steering only.
   */
  routeFight: number;
  /**
   * One world's plane (ja-lp4.19, docs/nest-search.md "How far the vector is off", PRD §79): how the home vector's error grows.
   * 0 = with the path walked (the odometer × the trip's drift: linear, and every step but the walk home adds, fighting
   * too). 1 = with the square root of the distance out (the farthest the ant has been from its hole this trip, straight):
   * a median miss of PI_MISS_AT × √(piErrorAt × that distance) (Merkle, Knaden & Wehner 2006: 25 % at 5 m, 12 % at 20 m;
   * Heinze, Narendra & Cheung 2018: uncertainty grows like √distance; Merkle & Wehner 2010: by distance out, not how winding
   * the path was; the √ itself is design). The same drift draws: the law scales them. Steering, the search's σ and every
   * belief of home read it. 1 the default (owner, 2026-11-16, with searchScale 1).
   */
  piErrorLaw: number;
  /** piErrorLaw 1: the distance out (cells) at which the median miss is PI_MISS_AT of it: 50 cells stand for 5 m (design: the map keeps ratios, docs/ant-communication.md) */
  piErrorAt: number;
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
  /** seconds of threat (alarm smelt, strangers in reach; leaking, THREAT_HALF) that make an ant on home ground defend (docs/stance.md) */
  defendAt: number;
  /** how far from its nest an ant is on home ground: by sight of its hole where it sees it, else by its home vector (world units) */
  homeGround: number;
  /**
   * Brood odour each brood item lying in the nest gives off, a second (ja-k4k.15, docs/brood-odour.md): the young climb it
   * in a chamber (broodClimb). 0: none laid, the channel stays empty.
   */
  broodOdour: number;
  /**
   * A young ant in a chamber climbs brood odour (ja-k4k.15.3, docs/brood-odour.md), turning at turnRate × this; 0: it
   * only searches. (It once turned toward the queen's position: a read no ant can make, removed with ja-k4k.2.1.)
   */
  broodClimb: number;
  /**
   * A young ant climbing the brood odour stops when this many nestmates or more share its cell (ja-k4k.15.6,
   * docs/nurse-crowding.md): it wanders to the next cell instead, so the climb can't heap hundreds on a small brood
   * chamber. Bodies limit it (1 cell ≈ 1 body length); the soft form of a per-cell cap. **Design.** 0: no limit.
   */
  broodCrowd: number;
  /**
   * The most ants of its colony one cell of the nest holds (ja-k4k.15.7.1, docs/nurse-crowding.md): an ant slows as its cell
   * fills (CROWD_SLOW_FLOOR) and a step into a full cell is mostly refused and sidestepped (CELL_REFUSE), read from the
   * contact count `friends`. Bodies limit a cell (1 cell ~ 1 body length, so about 2-3 fit by footprint; the nest is sized for
   * about 10 a floor cell, so a cap needs more floor). **Design.** Nest only: the plane has no count. 0: no limit.
   */
  cellCap: number;
  /**
   * Seconds a forager carrying food in the nest searches for its destination's road signs (the reception chamber's, once it has
   * RECEPTION_MIN cells) before it tries the royal chamber's instead, whose signs run through the whole nest (docs/nurse-crowding.md,
   * PRD §77.7). Without it a carrier whose destination has no signs where it stands wall-follows for ever: on one-world G1 seed 10
   * 16 foragers held food over two minutes. Its own timer only. 0: never (the search runs on).
   */
  deliveryFallback: number;
  /**
   * How a floor mark is laid (nest slice 3, `layMark`). 0: each ant adds to the cell it stands on every tick, up to the field's
   * cap, so a busy tunnel saturates at the cap whatever its distance from the chamber and the mark gives no slope to follow
   * (PRD §77.8: on one-world G1 seed 20 at 400 s, 72 porters stood on a mark of 19.95, the chamber's own level, 39-41 steps of tunnel from
   * the royal chamber). 1: the cell is raised to the ant's own level, the cap fading with the seconds since its last chamber
   * (`markDecay`), and never beyond it, so a mark records how recently a chamber lay behind and a busy tunnel keeps its slope.
   * **Design.** On by default (markMax 1, markDecay 6): the sweep and the other assays are in PRD §77.8; markMax 0 is the old rule. Under 1, `deposit`
   * no longer affects floor marks (it still drives trails and noEntry) and the ant's lay gain (`layGain`, a fungus lever) scales the level it raises a cell to,
   * capped at the field's maximum, so a gain above 1 only reaches further and one below 1 lowers the mark.
   */
  markMax: number;
  /** Seconds away from its chamber over which a floor mark falls to 1/e of what is laid at it (`layMark`). */
  markDecay: number;
  /** nestmates round a waiting ant (its cell and the six round it, felt over CROWD_HALF) that make its home "crowded" */
  crowdAt: number;
  /** the rate per second an idle ant at home that smells a strong raid trail is recruited (less on a faint one): raids grow by degrees (docs/stance.md) */
  raidRecruit: number;
  /**
   * the rate per second an ant at home goes out to look for the rival: answering `leave` "raid" (each ant's own stance,
   * docs/stance.md; a scout: a spontaneous rate, like `scoutRate`; the rest carry on foraging until a scout's trail reaches them)
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
  sampleTemp: 0.5,
  reroll: 10,
  rerollLaw: 0,
  steerLane: 0,
  deliveryLane: 0,
  deliveryReconsider: 0,
  dropRefusalLimit: 2,
  findNear: 8,
  searchSpan: 1.33,
  foodTrailPlane: 1,
  foodCapPlane: 80,
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
  searchScale: 1,
  searchScaleStep: 0.5,
  moundSmell: 1,
  siteFidelity: 0,
  siteGive: 0,
  foodPlume: 0,
  aphidPlume: 8,
  tendDefend: 1,
  aphidPrey: 0.05,
  heatDay: 0,
  heatDawn: 25,
  heatNoon: 52,
  heatNest: 30,
  heatTau: 30,
  heatFelt: 45,
  heatCool: 34,
  heatSunHigh: 0.2,
  heatNight: 1 / 3,
  heatStart: 0,
  invitePace: 0,
  paceRest: 1,
  paceTau: 20,
  paceGain: 0.5,
  paceCrowd: 0.25,
  paceFew: 4,
  paceMany: 8,
  heatDeath: 53.6,
  routeMemory: 1,
  scentReach: 1,
  restFetch: 1,
  forageDig: 0,
  owedBeg: 0,
  revert: 1,
  cropFeed: 0,
  routeStep: 3,
  routeSee: 3,
  routeMax: 64,
  routeJoin: 0,
  routeEnd: 1,
  routeStallLimit: 0,
  routeFight: 0,
  piErrorLaw: 1,
  piErrorAt: 50,
  raidGate: 1,
  raidLay: 1,
  findAt: 0.3,
  raidOnward: 1,
  defendAt: 1,
  homeGround: 10,
  broodOdour: 1,
  broodClimb: 1,
  broodCrowd: 3,
  cellCap: 0,
  deliveryFallback: 60,
  markMax: 1,
  markDecay: 6,
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

/**
 * How hard a follower shies from "no entry" a child painted (builder.ts), while its colony's own noEntryAvoid is 0: the
 * value PRD §45 tested (docs/builder.md "Slice 2"; Robinson et al. 2005: 71 % took the unmarked branch).
 */
export const NO_ENTRY_PAINTED = 4;

/** Every channel's params: the defaults, with `over` merged in per channel and per field. */
export function channelParams(over: Partial<Record<Channel, Partial<ChannelParams>>> = {}): Record<Channel, ChannelParams> {
  const out = { ...DEFAULT_CHANNELS };
  for (const [ch, p] of Object.entries(over) as [Channel, Partial<ChannelParams>][]) out[ch] = { ...DEFAULT_CHANNELS[ch], ...p };
  return out;
}
