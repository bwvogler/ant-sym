import { encode as encodeSave, fillLike, loadFields, saveFields } from "./save.ts";
import { type Channel, type ChannelParams, DEFAULT_CHANNELS, type Mark, MARKS, Pheromones } from "./pheromone.ts";
import { Brood, EGG, isFed, LARVA, LARVA_FOOD, owed, PUPA, type BroodItem } from "./brood.ts";
export { isFed, LARVA_FOOD } from "./brood.ts";
import { type Chamber, CHAMBER_HEIGHT, type Chambers, type Role } from "./chambers.ts";
import { CELL, cellOf, centreX, centreY, DIR_ANGLE, dirOf, discOffsets, hexDistance, nx as stepX, ny as stepY, R, SIDE } from "./hex.ts";
import { TOLERANCE } from "./recognition.ts";
import { type Item, localResponses, type Odds, qualityOf, type Responses, type Where, type Touch } from "./responses.ts";
import { AIR, blocked, digCell, dropFood, fillCell, groundTop, heapMound, isSky, markFork, OPEN, openCell, takeLoose, rockAt, setTunnelHeading, SOIL, takeFork, takeFoodCell, qualityAt, tunnelHeading, type Nest, type WorldMap } from "./world.ts";

// A colony, pure. Ants are structure-of-arrays, with a
// fixed capacity and an `alive` flag: ants die in fights and are born from
// stored food. Each ant is in one behaviour mode and steers by that mode
// every frame for free:
//   explore — wander, lay home trail, walk to food it can see
//   follow  — climb the food trail, lay home trail
//   return  — go home: climb the home trail (and its own sense of where the
//             nest is: real ants path-integrate); carrying, lay food trail
//   fight   — go for enemies in sight, else up the colony's alarm trail,
//             else (raiding) toward the rival's nest
// Picking food up, carrying it home and putting it down are mechanics, not
// choices; so is shying away from alarm (unless fighting), and so is digging:
// underground, an explorer at the end of a tunnel digs it on, carries the
// soil home and drops it on the nest's mound. In a tunnel ants walk cell by
// cell with a hand on the wall (explorers) or by the scent at each branch
// (followers, homing ants); in open ground they steer freely as above. Which mode to be
// in is the one choice, asked only when a non-carrying ant's situation
// changes, never every frame. That choice is a `Policy`: the local rule, or
// Jev cached per situation (colonyBrain.ts, ui/colonyJev.ts). Above the
// ants, the colony's stance (forage, defend, raid) is the strategist's
// choice, made every few seconds from a coarse view of the colony (game.ts).

export const MODES = ["explore", "follow", "return", "fight"] as const;
export type Mode = (typeof MODES)[number];
const EXPLORE = 0;
const FOLLOW = 1;
const RETURN = 2;
const FIGHT = 3;

export const STANCES = ["forage", "defend", "raid"] as const;
export type Stance = (typeof STANCES)[number];

export const TRAILS = ["none", "faint", "strong"] as const;
export type Trail = (typeof TRAILS)[number];
/** Sensor readings at or above these are a faint / strong trail. */
export const FAINT = 0.05;
export const STRONG = 1;

export function trailLevel(v: number): Trail {
  return v >= STRONG ? "strong" : v >= FAINT ? "faint" : "none";
}

/**
 * Where an ant is in its nest (nest slice 3): in a tunnel, or in one of its colony's chambers by that chamber's role
 * (the floor's smell tells it, Heyman et al. 2017). The side view's underground; on the ground, and on the top-down
 * maps, the home trail's level stands in its place.
 */
export const PLACES = ["tunnel", ...MARKS] as const;
export type Place = (typeof PLACES)[number];
/** The situation's home field: the home trail ahead (on the ground), or where in the nest the ant is. */
export const HOMES = [...TRAILS, ...PLACES] as const;
export type Home = (typeof HOMES)[number];

/** A dead worker in the side view (nest slice 7): the cell it lies in, who carries it (−1 none), when it died, and the fungus in it. */
export interface Corpse {
  x: number;
  y: number;
  held: number;
  died: number;
  load: number;
  strain: number;
}

/** Brood read as store and store as brood (the fungus's muddle, nest slice 8); any other mark as it is. */
export function swapBroodStore(m: Mark): Mark {
  return m === "brood" ? "store" : m === "store" ? "brood" : m;
}

/** What a mode choice may depend on: few values, so an answer can be cached per situation. Carrying ants are never asked: they go home. */
export interface Situation {
  mode: Mode;
  /** out longer than the colony's patience without finding food */
  tired: boolean;
  foodTrail: Trail;
  /** on the ground: the home trail ahead; inside the nest (side view): where it is, a tunnel or a chamber's role */
  homeTrail: Home;
  alarm: Trail;
  /** an ant of another colony within two cells */
  enemy: "none" | "near";
  /** what the colony as a whole is doing (the strategist's choice) */
  stance: Stance;
}

export type Policy = (s: Situation) => Mode;

/** Counts per cell, read by integer cell coordinates (the game's enemy grid). */
export interface CellCounts {
  get(x: number, y: number): number;
  /** whether any cell in the rectangle x0..x1 × y0..y1 (inclusive) may hold a count: a cheap early out */
  any(x0: number, y0: number, x1: number, y1: number): boolean;
  /** count, from now on, what is a stranger to this odour at this tolerance (recognition.ts); absent: everything counts */
  look?(odour: number, tolerance: number): void;
}

/** A cell holds an enemy an ant reacts to when its (calm-weighted) strangers reach this. */
export const ENEMY = 0.5;

/**
 * The local rule. (An enemy close by is the contact response's to answer, behaviour MR 4: before it, this rule sent
 * every ant with one near to fight.) Tired: go home. Raiding:
 * explorers (and fighters) go raiding, followers keep foraging. Defending:
 * alarm calls fighters. A fight that is over sends the ant home. Otherwise
 * forage: a strong food trail is followed, none means explore, a faint one
 * keeps what the ant was doing (an ant that just dropped its food heads back
 * out along it). Going home tired breaks ant mills: without it, followers
 * circled trails to food that was gone until nobody was left exploring.
 */
export const localPolicy: Policy = (s) => {
  if (s.tired) return "return";
  if (s.stance === "raid" && (s.mode === "explore" || s.mode === "fight")) return "fight";
  if (s.stance === "defend" && s.alarm !== "none") return "fight";
  if (s.mode === "fight") return "return";
  if (s.foodTrail === "strong") return "follow";
  if (s.foodTrail === "none") return "explore";
  return s.mode === "return" ? "follow" : s.mode;
};

/**
 * A colony's queen (nest slice 4): where she lies, and the fungus in her (ja-lo8.7): her attendants infect her by
 * contact as they would any ant, her nestmates groom it off, and what the fungus does in her is her levers: how much
 * of it she shows, and how much of her royal mark she lays.
 */
export interface Queen {
  alive: boolean;
  x: number;
  y: number;
  /** the fungus in her, 0..1, its strain (an index into the fungus's strains), and her resistance */
  load: number;
  strain: number;
  resist: number;
  /** the share of her strain's visibility she shows her groomers (the showing lever) */
  show: number;
  /** her royal mark laid × this (the queen-signal lever) */
  signal: number;
}

/** The strategist's coarse view of its own colony: few values, so a stance can be cached per view too. */
export interface StanceSituation {
  stance: Stance;
  /** living ants against the colony's cap */
  ants: "few" | "some" | "many";
  /** ants lost lately (a 30 s fading count) */
  losses: "none" | "some" | "heavy";
  enemyNearNest: boolean;
  /**
   * food brought home lately, per ant (behaviour MR 5, docs/activation.md: a colony knows its food only as the rate
   * foragers bring it in, never as what is left on the map): none, some or plenty
   */
  intake: "none" | "some" | "plenty";
  /** food stored but not yet turned into ants (the colony is at its cap) */
  larder: "low" | "full";
}

export type StancePolicy = (s: StanceSituation) => Stance;

/** The local strategist: defend a nest under attack; raid when no food comes in or the colony is full and fed; else forage. */
export const localStance: StancePolicy = (s) => {
  if (s.enemyNearNest && s.losses !== "none") return "defend";
  if (s.intake === "none" && s.ants !== "few") return "raid";
  if (s.larder === "full" && s.ants === "many") return "raid";
  return "forage";
};

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
   * out. Top-down maps only. 1 (PRD §48.4: G′ seeds 1–20 lost 5.2 % fewer ants for 2.9 % less food home; A5 passes).
   */
  leaveGate: number;
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
  /** the colony's odour at the start, 0..1 (recognition.ts): the game gives each colony its own */
  odour: number;
  /** odours further apart than this are strangers, as a healthy ant perceives it */
  tolerance: number;
  /** cells round an ant it checks for enemies (the hex disc of this radius) */
  enemyRange: number;
  /** evaporation and spread of the colony's pheromone channels, per channel and field; those left out keep their defaults */
  channels: Partial<Record<Channel, Partial<ChannelParams>>>;
  /**
   * Trips end (ja-qnx): with "explore" or "follow", a fresh forager going home with empty jaws is that once it gets there
   * (the nest on a top-down map; the royal chamber in the side view, the old only), and asked afresh; and any value but
   * "return" also makes an ant that has just put its load down a follower (whatever this says: see the tick). "return"
   * keeps the old behaviour, bit for bit: returning until REST sends it out.
   */
  arrive: "explore" | "follow" | "return";
}

export const DEFAULT_COLONY: ColonyParams = { antCount: 800, maxAnts: 1200, foodPerAnt: 4, nest: 0, speed: 7, sensorDistance: 3, sensorAngle: 0.6, turnRate: 6, wander: 4, deposit: 4, depositDecay: 20, patience: 60, restTime: 30, followChoice: 1, foodTrailTop: 1, foodCapTop: 80, homeTrail: 0.8, homeTrailCone: Math.PI / 2, noEntryAvoid: 0, alarmDraw: 2, alarmAvoid: 1.5, leaveGate: 1, raidGate: 1, raidLay: 1, findAt: 0.3, raidOnward: 1, stanceGate: 1, defendAt: 1, homeGround: 10, crowdAt: 6, raidScout: 1 / 90, scoutRate: 1 / 90, odour: 0, tolerance: TOLERANCE, enemyRange: 2, channels: Object.freeze({}), arrive: "explore" };

/** A food cell seen by a sensor, or the nest seen by a homing ant, beats any trail. */
const SEEN = 100;
/** Food scent under a follower at least this strong, and weaker all round, is a trail's end (behaviour MR 3: "no entry"). */
const NO_ENTRY_TRAIL = 1;
/** ...and every sensor reads under this share of it: the trail drops away ahead and to both sides (not a bend). */
const NO_ENTRY_DROP = 0.5;
/** "No entry" laid per second at a spent trail's end, as a multiple of the colony's deposit. */
const NO_ENTRY_RATE = 4;

/** Every channel's params: the defaults, with `over` merged in per channel and per field. */
export function channelParams(over: Partial<Record<Channel, Partial<ChannelParams>>> = {}): Record<Channel, ChannelParams> {
  const out = { ...DEFAULT_CHANNELS };
  for (const [ch, p] of Object.entries(over) as [Channel, Partial<ChannelParams>][]) out[ch] = { ...DEFAULT_CHANNELS[ch], ...p };
  return out;
}

/** Colony fields a save leaves out: what the game wires (the map, the nest, other colonies' scent and grids, raid aims: Game saves those as indices) and the policies. */
const COLONY_SKIP: ReadonlySet<string> = new Set(["map", "nest", "policy", "stancePolicy", "responses", "onBury", "enemies", "foreign", "friends", "nestmates", "raidTarget", "raidNest", "raidMarks", "others"]);

export class Colony {
  readonly map: WorldMap;
  readonly ph: Pheromones;
  readonly nest: Nest;
  params: ColonyParams;
  policy: Policy;
  stancePolicy: StancePolicy;
  /** the ant's small responses: pick food up, what to do carrying, put it down, which trail and how much, shy from alarm, raise it (responses.ts) */
  responses: Responses = localResponses;
  stance: Stance = "forage";
  /** the situation handed to a response, refilled for each call (#touch): a response reads it and does not keep it */
  /** the ant the shared Touch describes */
  #ti = 0;
  /** The shared Touch. Its `place` is worked out only when a response reads it: the local ones never do, and working it out for every ant's trail every step cost the side view ~5 % a tick (review of #35). */
  /** the ant whose sensors were last read this tick, and the alarm they smelt (touch() reads it; other ants: none) */
  #alarmAnt = -1;
  #alarmSmelt: Trail = "none";
  /** the odds the ant whose sensors were last read met, with strangers in reach (else none) */
  #oddsNow: Odds = "none";
  #t: Touch = Object.defineProperty({ mode: "explore", carrying: "none", porter: false, digging: false, place: "out", offered: "none", enemy: false, stance: "forage", quality: "fair", alarm: "none", odds: "none", returns: "none", crowd: "few" } as Touch, "place", { get: () => this.place(this.#ti), enumerable: true });
  /** capacity: every per-ant array has this length; `alive` says which slots hold an ant */
  readonly n: number;
  x: Float32Array;
  y: Float32Array;
  heading: Float32Array;
  /** index into MODES */
  mode: Uint8Array;
  carrying: Uint8Array;
  /** carrying a soil pellet it dug, home to the mound */
  pellet: Uint8Array;
  /** seconds of digging left at the soil face ahead; 0 = not digging */
  digT: Float32Array;
  /** the heading the cell it is digging should carry on the tunnel at (NaN: none chosen; the face's own direction) */
  digAim: Float32Array;
  /** the cell each ant is in, and the position that was worked out for (a cache: cellOf costs more than a floor, and many steps ask) */
  #cellX: Int32Array;
  #cellY: Int32Array;
  #cellAtX: Float32Array;
  #cellAtY: Float32Array;
  /** a cell where this free-walking ant last found no tunnel (packed y·65536 + x; −1 none): it needn't look again until it moves on */
  #noTunnel: Int32Array;
  /** 1 while a pellet carrier is walking a stale branch to fill its end (see BACKFILL.enterStale) */
  #staleWalk: Uint8Array;
  /** the cell (packed y·65536 + x) where this pellet carrier last looked for space to fill, this trip: once a cell is enough */
  #looked: Int32Array;
  /** the side view: what each homing ant is heading for (0 the chamber, 1 the entrance); a change drops the wall it was following */
  #goalKind: Uint8Array;
  // Path integration in the side view (nest slice 1, docs/nest-and-home.md §3.1). An ant knows where home is only
  // by counting its own steps, and the count drifts: about 10 % of the distance walked (Wehner). Its depth does not
  // drift: gravity tells it how far it has climbed. So it believes its goal lies drift × distance off to one side.
  /** distance walked since the surface vector reset (coming up out of the hole) */
  odoSurf: Float32Array;
  /** distance walked underground since the in-nest memory reset (in the chamber) */
  odoNest: Float32Array;
  /** this trip's drift on the surface and in the nest, per unit walked (Gaussian, σ = PI_DRIFT) */
  driftSurf: Float32Array;
  driftNest: Float32Array;
  /** cells added to the believed goal while searching round it (it got there and found nothing): grows, alternating sides */
  search: Float32Array;
  /** 1 while the ant is underground (the last tick), so coming up out of the hole is seen */
  #under: Uint8Array;
  /** the side view: a homing ant following the ground's surface round spoil to the hole: the nearness (#holeMetric) it must beat to let go; NaN = not following */
  #groundMin: Float64Array;
  /** cells walked on that surface (at each flipDue, the other hand) */
  #groundT: Uint16Array;
  /** the side view: steps to this colony's hole through its tunnels, per cell (see #outField), the cells it reached, and the ground's version and time it was built at */
  #outDist: Int32Array | null = null;
  #outCells: number[] = [];
  #outVersion = -1;
  #outAt = -Infinity;
  /** the hole x (#holeX) groundMin was measured against */
  #groundRef: Float64Array;
  // Chambers (nest slice 2): the side view's nest is dug, not given.
  /** the face this ant is digging for a chamber (packed y·65536 + x; −1 none), and for which: chamber id + 1, or 0 for a new one */
  #chamberCell: Int32Array;
  #chamberFor: Int16Array;
  /** ants underground last tick (the side view): with the chambers' floor, how crowded the nest is */
  inNest = 0;
  /** ants out on the ground last tick (the side view) */
  outside = 0;
  // Floor marks (nest slice 3): the role of the last chamber each ant was in (MARKS index + 1; 0 none), and seconds since.
  #lastRole: Uint8Array;
  #sinceRole: Float32Array;
  /** seconds an ant has rested at home in "return" (see REST) */
  #restT: Float32Array;
  // The queen and brood (nest slice 4; the side view only: elsewhere the larder still becomes ants directly).
  /** the colony's queen, in its royal chamber (null on the top-down maps); a colony whose queen is dead is orphaned */
  queen: Queen | null = null;
  readonly brood = new Brood();
  /** seconds owed toward the queen's next egg */
  #layT = 0;
  /** each ant's age and lifespan, seconds (the side view: workers die of age, so an orphaned colony dwindles) */
  age: Float32Array;
  lifespan: Float32Array;
  /** 1 while an ant carries brood (a nurse), and the chamber it is taking it to */
  #holdsBrood: Uint8Array;
  #broodTo: Int16Array;
  /** seconds a nurse has held its brood, or a porter its food */
  #holdT: Float32Array;
  /** workers that died of age */
  diedOld = 0;
  /** brood killed by the fungus's crown */
  broodKilled = 0;
  // Food flow (nest slice 5; with a queen): food lies in chambers; foragers bring it to reception, porters carry it on.
  /** the chamber an ant carrying food is taking it to (−1: a forager, to reception or the royal chamber), and 1 if it is a porter's move inside the nest */
  #portTo: Int16Array;
  #porter: Uint8Array;
  /** porters' trips (food moved between chambers) */
  portTrips = 0;
  /** foragers that found food waiting at reception and carried theirs on to where it was wanted */
  handedOn = 0;
  /** food porters are carrying between chambers: still the colony's (the queen's reserve and the strategist count it) */
  #inJaws = 0;
  // The midden (nest slice 7): corpses lie where workers die until an undertaker carries them out to the midden.
  /** the colony's dead not yet on the midden: where each lies (a cell), who carries it (−1 none), when it died, its fungus */
  readonly corpses: Corpse[] = [];
  /** the midden: corpses buried per cell (packed y × 65536 + x), a count rather than a list growing all game (review of #26) */
  readonly midden = new Map<number, number>();
  /** called with each corpse as it is put on the midden (the game: a sporulating strain's spores there) */
  onBury: ((k: Corpse) => void) | null = null;
  /** Whether ant i carries a corpse (drawn as one, not as soil). */
  carriesCorpse(i: number): boolean {
    return this.#corpse[i] === 1;
  }
  /** Whether ant i carries food between chambers (a porter), not home from outside (a forager). */
  porting(i: number): boolean {
    return this.#porter[i] === 1;
  }
  /** 1 while an ant carries a corpse (moved like a soil pellet: up and out, along the ground) */
  #corpse: Uint8Array;
  /** 1 while an ant carried a load at its last step (what ends its trip when the load is put down: `arrive`) */
  #loaded: Uint8Array;
  /** the cell (packed y × 65536 + x) where ant i last put a load down, while it still stands there; else −1 */
  #putAt: Int32Array;
  /** corpses carried to the midden */
  buried = 0;
  /** where this ant believes its goal is, this tick (a scratch: no allocation per ant) */
  #belief: Nest = { x: 0, y: 0, r: 0 };
  /** the side view: the entrance as a small nest to head for (null on the top-down maps) */
  #entrance: Nest | null = null;
  /** the side view: the entrance's column, where the mound's crater is, and its row (the hole's cell) */
  #entranceCol = 0;
  #entranceRow = 0;
  /** the side view: every nest's entrance column (no mound buries a hole, the rival's included) */
  #holes: number[] = [];
  /** the side view: cells of soil brought out that found no room on the mound (the sky's top on both sides; never seen in play) */
  moundLost = 0;
  /**
   * The side view: a pellet carrier carrying its pellet out along the ground: it drops it once it is this many
   * columns from the hole (NaN: not carrying one out), on side #spoilSide, having walked #spoilT seconds.
   */
  #spoilTo: Float32Array;
  #spoilSide: Int8Array;
  #spoilT: Float32Array;
  /**
   * What the pellet carried is (with `pellet`; one place for it, review of MR 15: five per-ant arrays each cleared by
   * hand): DUG, soil it dug, to the hole and out, or into unused space on the way; LOOSE, loose soil off the mound (moved,
   * not dug: not in soilDug), out along the ground; FILL, loose soil taken down into the nest to backfill. #clearPellet
   * puts the pellet and all its state down at once.
   */
  #soil: Uint8Array;
  /** the side view: loose pellets picked up off the mound, dropped on it again, put into unused space underground, and lost with ants that died */
  loosePicked = 0;
  looseDropped = 0;
  looseFilled = 0;
  /** the side view: loose pellets taken down to backfill, and of them, carried back out having found nowhere to fill */
  looseDown = 0;
  looseBack = 0;
  looseLost = 0;
  /** the side view: cells of mound heaped so far, or tried (no room at the sky's top): ⌊pellets out × SWELL⌋ once caught up */
  #heaped = 0;
  /** the point the current ant is homing to (see #goal): the m-line runs to it */
  #goalX = 0;
  #goalY = 0;
  /** the side view: where the ant being stepped believes the hole is, across the ground (see #believe, #towardHole) */
  #holeX = 0;
  /** the cell it looked from before that (packed; −1 none): the way it came, which is never a stale branch */
  #cameFrom: Int32Array;
  /** the cell (packed) this ant last dug: its pellet never goes straight back in there */
  #lastDug: Int32Array;
  /** the first cell of the wall being followed by cell: back there, it has been all the way round */
  loopX: Int32Array;
  loopY: Int32Array;
  /** releases from a soil wall this trip that made no progress home (see NO_GAIN) */
  #noGain: Uint8Array;
  /** which hand it keeps on tunnel walls when it walks a tunnel (+1 right, −1 left), chosen afresh each trip out */
  hand: Int8Array;
  /** seconds left of keeping a hand on a chamber's wall, after touching soil; 0 = wandering freely */
  hugT: Float32Array;
  alive: Uint8Array;
  /** bumped every time a slot gets a new ant, so (slot, gen) names one ant even after its slot is reused */
  gen: Uint32Array;
  /** seconds since the ant was last at the nest or picked up food (trail strength, backfill timing; not tiredness) */
  since: Float32Array;
  /** seconds of unsuccessful search, less rest inside the nest: tired above the colony's patience (ja-q47) */
  fatigue: Float32Array;
  /** encounters with nestmates coming home with food, leaking with a half-life of MET_HALF (behaviour MR 5) */
  met: Float32Array;
  /** seconds in contact with strangers, leaking (behaviour MR 5.2): how much of the rival a scout met; more lays a stronger raid trail */
  foes: Float32Array;
  /** 1 while the ant goes home to tell of the strangers it found, laying the raid trail (behaviour MR 5.2) */
  reporting: Uint8Array;
  /** seconds of alarm smelt or strangers in reach, leaking with a half-life of THREAT_HALF: a defender's threshold state (docs/stance.md) */
  threat: Float32Array;
  /** nestmates round a waiting ant at home, felt over CROWD_HALF (docs/stance.md: a crowded colony raids) */
  crowd: Float32Array;
  /**
   * 1 while this ant acts on the colony's raid stance (behaviour MR 5.2): it smelt a scout's raid trail, or went out as a scout.
   * Every other ant carries on as a forager. Cleared when it is home again with no trail under it.
   */
  recruited: Uint8Array;
  /** 1 once a recruited ant has been away from the nest: coming home then ends its raid */
  #gone: Uint8Array;
  /** a raider that has left the raid trail to search on, until it is home (ja-sf1) */
  #pastEnd: Uint8Array;
  /** 1 while the ant is on home ground with its threat past defendAt: its stance is defend (docs/stance.md) */
  #defending: Uint8Array;
  /** food stored per second, a running average over INTAKE_WINDOW (behaviour MR 5): what the strategist knows of food */
  intakeRate = 0;
  #storedSeen = 0;
  /**
   * Foragers home with food, per cell where each put it down, keyed y × 65536 + x (behaviour MR 5): `#returning` fills
   * this tick, `#returned` holds last tick's, which the waiting ants round each one meet, once each.
   */
  #returning = new Map<number, number>();
  #returned = new Map<number, number>();
  /** the quality of the food in its jaws (world.ts: WorldMap.quality), tasted at pickup; read only while it carries food (left as it was after delivery) */
  quality: Float32Array;
  /** 1 from when fatigue passes patience until it has rested to nothing: a tired forager rests fully, not just under the line */
  #tired: Uint8Array;
  /** seconds left of a detour after bumping into rock, when the pull toward the nest (or the raid) is off */
  detour: Float32Array;
  /** recent bumps, fading over seconds: each bump in a row doubles the next detour */
  bumps: Float32Array;
  /** fungal load, 0..1 (fungus.ts): the fungus inside the ant; it never touches the ant's choices directly */
  load: Float32Array;
  /** which strain (an index into the fungus's strains) the load is; meaningful only where load > 0 */
  strain: Uint8Array;
  /** immune priming from grooming visible nestmates, 0..1: scales down every load the ant takes */
  resist: Float32Array;
  /** the preset the fungus runs in this ant (an index into levers.ts PRESETS; 0 = as it is or dormant; CUSTOM = Jev's own mix of levels) */
  expr: Uint8Array;
  // What the ant perceives (docs/fungus-policy.md §2): gains on the scent that is there, 1 = as it is.
  // The fungus writes them (fungus.ts); the ant cannot tell. Its situation and its steering both read
  // the bent sensors, and its own policy still decides. Seen food, the nest and rock are never bent.
  /** food scent × this */
  gainFood: Float32Array;
  /** home scent × this */
  gainHome: Float32Array;
  /** alarm × this */
  gainAlarm: Float32Array;
  /** the other colony's food trail, × this, smelled as food scent (0 = not at all) */
  foreignFood: Float32Array;
  /** the ant's sense of time out: it is tired after patience × this */
  clock: Float32Array;
  // Recognition (recognition.ts): who is a stranger is a matter of odour, not of colony.
  /** the ant's odour, 0..1: a blend of cuticular hydrocarbons; strangers are ants whose odour differs by more than a tolerance */
  odour: Float32Array;
  /** how far apart an odour must be for this ant to perceive a stranger (params.tolerance, widened by the fungus) */
  tolerance: Float32Array;
  /** the calming cue the ant gives off, 0..1 (the fungus's): it counts as (1 − calm) of an enemy, and charges at (1 − calm) of the pace */
  calm: Float32Array;
  /** the fungal share of its odour, 0..MAX_MASK (the fungus's): its odour is its nest's, that share of the way to the fungus's own */
  mask: Float32Array;
  // What the ant gives off (docs/fungus-policy.md §4.C); the fungus writes them, 1 / 0 = as it is.
  /** trail laid × this (C1) */
  layGain: Float32Array;
  /** carrying food, it also lays this share of its food trail into the other colony's food field (C2): it leaks where food is */
  crossLay: Float32Array;
  /** in a fight it lays (1 − this) of the alarm (C3): a quiet fight recruits fewer defenders */
  quiet: Float32Array;
  /** how far (× 0.5) the fungus pushes its odour away from its nest's: past the tolerance, its own colony takes it for a stranger (B6) */
  estrange: Float32Array;
  /** the fungal situation (fungalPolicy.ts encodeFungal) the fungus last chose for it in; −1 = none */
  fungal: Int16Array;
  // What the fungus bends inside the nest (nest slice 8; the fungus writes them, 1 / 0 = as it is).
  /** the nest's floor marks smelled × this: road signs, and the chamber it is in */
  gainMarks: Float32Array;
  /** 0..1: past ½, brood smells like store and store like brood */
  swapMarks: Float32Array;
  /** 0..1: how surely it kills the queen and brood it touches, CROWN_RATE × this a second (lethal, the fungus's crown; its load) */
  regicide: Float32Array;
  /** the share of its strain's visibility it shows its groomers (the fungus's "showing" lever, ja-lo8.4): under 1 it hides the fungus */
  show: Float32Array;
  /** homing round an obstacle by touch: 0 = not; +1 = keeping the wall on its right, −1 = on its left */
  wall: Int8Array;
  /** distance home to beat to leave a wall: where it met the wall, or underground the nearest it has been since its last give-up */
  hitDist: Float32Array;
  /** seconds spent following the current wall */
  followT: Float32Array;
  /** seconds since a wall-following ant last touched rock (ahead, or on its wall side) */
  untouched: Float32Array;
  /** the nearest a homing ant has been to its nest this trip, and seconds since it last got 1 cell nearer */
  bestD: Float32Array;
  stallT: Float32Array;
  /** where this homing trip first met rock, or underground the latest wall it met (NaN until then, and after a give-up): with the nest it fixes the line the ant leaves walls on */
  mx: Float32Array;
  my: Float32Array;
  /** following a wall cell by cell: the way it faces (0 east, 1 south, 2 west, 3 north) and the cell it is walking to (NO_CELL = decide now) */
  gdir: Uint8Array;
  gx: Int32Array;
  gy: Int32Array;
  /** 1 while the wall being followed is followed cell by cell (any wall underground, or a tunnel), 0 by touch (rock on open ground) */
  byCell: Uint8Array;
  /** the situation each ant was last asked about, encoded; −1 = never */
  #asked: Int16Array;
  /** the question behind each ant's current mode: its situation (with the mode it had) when last asked; −1 = never */
  #question: Int16Array;
  /** enemy ants per cell, kept by the game each tick; null when there is no rival */
  enemies: CellCounts | null = null;
  /** the colony's odour: the nest's gestalt, which ants at the nest relax toward and newborns take */
  nestOdour: number;
  /** another colony's scent, for ants whose perception reads it: the one this colony would raid, its nearest rival (set by the game; null with no rival) */
  foreign: Pheromones | null = null;
  /** this colony's own ants per cell, kept by the game each tick underground; null on its own */
  friends: CellCounts | null = null;
  /** this colony's ants per cell (the game's occupancy), for the odds an ant senses by touch on meeting strangers (MR 4) */
  nestmates: CellCounts | null = null;
  /** where raiders go: the nest of the colony raided (in the side view, its hole); set by the game, the nearest rival of any number */
  raidTarget: Nest | null = null;
  /** the side view: the raided colony's chamber, where raiders go once in at its hole (set by the game) */
  raidNest: Nest | null = null;
  /** the raided colony's marks: its midden, which raiders shy from (set by the game with raidTarget) */
  raidMarks: Pheromones | null = null;
  /** every other colony's nest, however many (set by the game): whose ground a column is, and which way the midden faces */
  others: Nest[] = [];
  time = 0;
  /** food units brought home */
  stored = 0;
  /** stored food not yet turned into ants */
  larder = 0;
  /** soil cells this colony dug open, and pellets of it dropped on the mound at the nest */
  soilDug = 0;
  soilOut = 0;
  /** pellets put back into unused space on the way home (backfill), and pellets lost with ants that died carrying them */
  soilFilled = 0;
  soilLost = 0;
  /** ants lost, and a count of recent losses fading over ~30 s */
  losses = 0;
  recentLosses = 0;
  births = 0;
  /** mode choices made by the policy */
  decisions = 0;
  /** which of the SITUATIONS the policy has been asked about: what a cached Jev policy would pay for */
  seen = new Uint8Array(SITUATIONS);
  #rng: () => number;
  /** sensor readings for the ant being stepped: food, home, alarm × left, front, right */
  #s = new Float64Array(9);

  constructor(map: WorldMap, params: Partial<ColonyParams> = {}, rng: () => number = Math.random, policy: Policy = localPolicy, stancePolicy: StancePolicy = localStance) {
    this.map = map;
    this.params = { ...DEFAULT_COLONY, ...params };
    if (params.maxAnts === undefined) this.params.maxAnts = Math.max(this.params.antCount, Math.round(this.params.antCount * 1.5));
    this.nest = map.nests?.[this.params.nest] ?? map.nest;
    if (map.sky && this.nest.entrance) {
      this.#entrance = { x: this.nest.entrance.x, y: this.nest.entrance.y, r: ENTRANCE_R };
      cellOf(this.nest.entrance.x, this.nest.entrance.y);
      this.#entranceCol = CELL[0] as number;
      this.#entranceRow = CELL[1] as number;
      this.seeHoles();
    }
    this.policy = policy;
    this.stancePolicy = stancePolicy;
    this.#rng = rng;
    // Top-down, the food trail holds up to foodCapTop (behaviour MR 3): under main's cap a busy trail sat at it near the
    // nest, and a follower couldn't tell a strong trail from a weak (unless the colony's params set a cap of their own).
    const chans = channelParams(this.params.channels);
    if (this.#entrance === null && this.params.channels.food?.max === undefined) chans.food = { ...chans.food, max: this.params.foodCapTop };
    this.ph = new Pheromones(map, chans);
    const n = this.params.maxAnts;
    this.n = n;
    this.x = new Float32Array(n);
    this.y = new Float32Array(n);
    this.heading = new Float32Array(n);
    this.mode = new Uint8Array(n);
    this.carrying = new Uint8Array(n);
    this.pellet = new Uint8Array(n);
    this.digT = new Float32Array(n);
    this.hand = new Int8Array(n);
    this.digAim = new Float32Array(n).fill(NaN);
    this.#cellX = new Int32Array(n);
    this.#cellY = new Int32Array(n);
    this.#cellAtX = new Float32Array(n).fill(NaN);
    this.#cellAtY = new Float32Array(n).fill(NaN);
    this.#noTunnel = new Int32Array(n).fill(-1);
    this.#staleWalk = new Uint8Array(n);
    this.#looked = new Int32Array(n).fill(-1);
    this.#goalKind = new Uint8Array(n);
    this.odoSurf = new Float32Array(n);
    this.odoNest = new Float32Array(n);
    this.driftSurf = new Float32Array(n);
    this.driftNest = new Float32Array(n);
    this.search = new Float32Array(n);
    this.#under = new Uint8Array(n);
    this.#groundMin = new Float64Array(n).fill(NaN); // float64: compared with the metric itself (float32 rounding let the ant "beat" it on the cell it was set at)
    this.#groundT = new Uint16Array(n);
    this.#groundRef = new Float64Array(n).fill(NaN);
    this.#chamberCell = new Int32Array(n).fill(-1);
    this.#chamberFor = new Int16Array(n);
    this.#lastRole = new Uint8Array(n);
    this.#sinceRole = new Float32Array(n);
    this.#restT = new Float32Array(n);
    this.age = new Float32Array(n);
    this.lifespan = new Float32Array(n).fill(Infinity);
    this.#holdsBrood = new Uint8Array(n);
    this.#holdT = new Float32Array(n);
    this.#broodTo = new Int16Array(n).fill(-1);
    this.#portTo = new Int16Array(n).fill(-1);
    this.#porter = new Uint8Array(n);
    this.#corpse = new Uint8Array(n);
    this.#loaded = new Uint8Array(n);
    this.#putAt = new Int32Array(n).fill(-1);
    // The queen lies on the royal chamber's floor: its bottom row, in the cell nearest the chamber's centre.
    if (this.#entrance && map.chambers) this.queen = { alive: true, ...this.#royalFloor(map.chambers), load: 0, strain: 0, resist: 0, show: 1, signal: 1 };
    this.#spoilTo = new Float32Array(n).fill(NaN);
    this.#spoilSide = new Int8Array(n);
    this.#spoilT = new Float32Array(n);
    this.#soil = new Uint8Array(n);
    this.#cameFrom = new Int32Array(n).fill(-1);
    this.#lastDug = new Int32Array(n).fill(-1);
    this.#noGain = new Uint8Array(n);
    this.loopX = new Int32Array(n).fill(NO_CELL);
    this.loopY = new Int32Array(n);
    this.hugT = new Float32Array(n);
    this.alive = new Uint8Array(n);
    this.gen = new Uint32Array(n);
    this.since = new Float32Array(n);
    this.fatigue = new Float32Array(n);
    this.met = new Float32Array(n);
    this.foes = new Float32Array(n);
    this.threat = new Float32Array(n);
    this.crowd = new Float32Array(n);
    this.reporting = new Uint8Array(n);
    this.recruited = new Uint8Array(n);
    this.#gone = new Uint8Array(n);
    this.#pastEnd = new Uint8Array(n);
    this.#defending = new Uint8Array(n);
    this.quality = new Float32Array(n).fill(1);
    this.#tired = new Uint8Array(n);
    this.detour = new Float32Array(n);
    this.bumps = new Float32Array(n);
    this.load = new Float32Array(n);
    this.strain = new Uint8Array(n);
    this.resist = new Float32Array(n);
    this.expr = new Uint8Array(n);
    this.gainFood = new Float32Array(n).fill(1);
    this.gainHome = new Float32Array(n).fill(1);
    this.gainAlarm = new Float32Array(n).fill(1);
    this.foreignFood = new Float32Array(n);
    this.clock = new Float32Array(n).fill(1);
    this.nestOdour = this.params.odour;
    this.odour = new Float32Array(n).fill(this.params.odour);
    this.tolerance = new Float32Array(n).fill(this.params.tolerance);
    this.calm = new Float32Array(n);
    this.mask = new Float32Array(n);
    this.layGain = new Float32Array(n).fill(1);
    this.crossLay = new Float32Array(n);
    this.quiet = new Float32Array(n);
    this.estrange = new Float32Array(n);
    this.fungal = new Int16Array(n).fill(-1);
    this.gainMarks = new Float32Array(n).fill(1);
    this.swapMarks = new Float32Array(n);
    this.regicide = new Float32Array(n);
    this.show = new Float32Array(n).fill(1);
    this.wall = new Int8Array(n);
    this.hitDist = new Float32Array(n);
    this.followT = new Float32Array(n);
    this.untouched = new Float32Array(n);
    this.bestD = new Float32Array(n).fill(Infinity);
    this.stallT = new Float32Array(n);
    this.mx = new Float32Array(n).fill(NaN);
    this.my = new Float32Array(n).fill(NaN);
    this.gdir = new Uint8Array(n);
    this.gx = new Int32Array(n).fill(NO_CELL);
    this.gy = new Int32Array(n);
    this.byCell = new Uint8Array(n);
    this.#asked = new Int16Array(n).fill(-1);
    this.#question = new Int16Array(n).fill(-1);
    // Colonies step their fields on different ticks, so a tick never pays for every colony's at once.
    this.ph.phase((this.params.nest % 2) * 0.5);
    for (let k = 0; k < this.params.antCount; k++) this.#place(k);
    // The founding workers are of all ages (from birth to half a lifespan), so they don't all die at once.
    if (this.queen) for (let k = 0; k < this.params.antCount; k++) this.age[k] = this.#rng() * 0.5 * (this.lifespan[k] as number);
  }

  /** Where the queen lies (world position): the royal chamber's floor row, the cell on it nearest the founding chamber's centre. */
  /**
   * Every nest's hole on the map (side view), whose funnels the colony's mound keeps open (world.heapMound). Again
   * whenever a colony is founded (Game.addColony), so an older colony's mound never buries the new hole (PR #42
   * review, S3).
   */
  seeHoles(): void {
    if (!this.#entrance) return;
    this.#holes = [];
    for (const n of this.map.nests ?? [this.nest])
      if (n.entrance) {
        cellOf(n.entrance.x, n.entrance.y);
        this.#holes.push(CELL[0] as number);
      }
  }

  #royalFloor(ch: Chambers): { x: number; y: number } {
    const royal = ch.list.find((c) => c.colony === this.params.nest && c.role === "royal");
    if (!royal) return { x: this.nest.x, y: this.nest.y };
    const y = royal.floorRow;
    let best = { x: this.nest.x, y: this.nest.y };
    let bestD = Infinity;
    for (let x = royal.x0; x <= royal.x1; x++) {
      if (ch.at(x, y) !== royal.id) continue;
      const d = Math.abs(centreX(x, y) - this.nest.x);
      if (d < bestD) {
        bestD = d;
        best = { x: centreX(x, y), y: centreY(y) };
      }
    }
    return best;
  }

  #place(i: number): void {
    const a = this.#rng() * Math.PI * 2;
    const r = this.#rng() * this.nest.r * 0.8;
    this.x[i] = this.nest.x + Math.cos(a) * r;
    this.y[i] = this.nest.y + Math.sin(a) * r;
    this.heading[i] = a;
    this.mode[i] = EXPLORE;
    this.carrying[i] = 0;
    this.#clearPellet(i);
    this.#looked[i] = -1;
    this.#cameFrom[i] = -1;
    this.#lastDug[i] = -1;
    this.digT[i] = 0;
    this.digAim[i] = NaN;
    this.hand[i] = this.#rng() < 0.5 ? -1 : 1;
    this.hugT[i] = 0;
    this.since[i] = 0;
    this.fatigue[i] = 0;
    this.met[i] = 0;
    this.foes[i] = 0;
    this.threat[i] = 0;
    this.crowd[i] = 0;
    this.reporting[i] = 0;
    this.recruited[i] = 0;
    this.#gone[i] = 0;
    this.#pastEnd[i] = 0;
    this.#defending[i] = 0;
    this.quality[i] = 1;
    this.#tired[i] = 0;
    this.detour[i] = 0;
    this.bumps[i] = 0;
    // A newborn is clean and unprimed.
    this.load[i] = 0;
    this.strain[i] = 0;
    this.resist[i] = 0;
    this.expr[i] = 0;
    this.fungal[i] = -1;
    this.asIs(i);
    // A newborn smells of its colony as the colony smells now.
    this.odour[i] = this.nestOdour;
    // Born in the chamber: nothing walked, nothing to search for (its drift is drawn when its memory first resets, there).
    this.odoSurf[i] = 0;
    this.odoNest[i] = 0;
    this.driftSurf[i] = 0;
    this.driftNest[i] = 0;
    this.search[i] = 0;
    this.#under[i] = 1;
    this.#goalKind[i] = 0; // born underground: home is the chamber
    this.#groundMin[i] = NaN;
    this.#chamberCell[i] = -1;
    this.#lastRole[i] = 0; // born in the royal chamber: it lays royal once it has been there a tick
    this.#sinceRole[i] = 0;
    this.#restT[i] = 0;
    this.age[i] = 0;
    this.lifespan[i] = this.queen ? LIFESPAN * (0.7 + 0.6 * this.#rng()) : Infinity;
    this.#holdsBrood[i] = 0;
    this.#broodTo[i] = -1;
    this.#holdT[i] = 0;
    this.#portTo[i] = -1;
    this.#porter[i] = 0;
    this.#corpse[i] = 0;
    this.#loaded[i] = 0;
    this.#putAt[i] = -1;
    this.wall[i] = 0;
    this.mx[i] = NaN;
    this.untouched[i] = 0;
    this.bestD[i] = Infinity;
    this.stallT[i] = 0;
    this.gx[i] = NO_CELL;
    this.byCell[i] = 0;
    this.#asked[i] = -1;
    this.#question[i] = -1;
    this.gen[i] = ((this.gen[i] as number) + 1) >>> 0;
    this.alive[i] = 1;
  }

  /** The cell ant i is in, into CELL (cached for its current position). */
  antCell(i: number): void {
    const x = this.x[i] as number;
    const y = this.y[i] as number;
    if (x !== this.#cellAtX[i] || y !== this.#cellAtY[i]) {
      cellOf(x, y);
      this.#cellX[i] = CELL[0] as number;
      this.#cellY[i] = CELL[1] as number;
      this.#cellAtX[i] = x;
      this.#cellAtY[i] = y;
      return;
    }
    CELL[0] = this.#cellX[i] as number;
    CELL[1] = this.#cellY[i] as number;
  }

  /** Ant i as a healthy ant: it perceives the world as it is, gives off no calming cue, and smells of its nest alone (from the next odour step). */
  asIs(i: number): void {
    this.gainFood[i] = 1;
    this.gainHome[i] = 1;
    this.gainAlarm[i] = 1;
    this.foreignFood[i] = 0;
    this.clock[i] = 1;
    this.tolerance[i] = this.params.tolerance;
    this.calm[i] = 0;
    this.mask[i] = 0;
    this.layGain[i] = 1;
    this.crossLay[i] = 0;
    this.quiet[i] = 0;
    this.estrange[i] = 0;
    this.gainMarks[i] = 1;
    this.swapMarks[i] = 0;
    this.regicide[i] = 0;
    this.show[i] = 1;
  }

  /** Whether ant i holds brood in its jaws (a nurse carrying an egg, larva or pupa): what the fungus in it senses as `carrying`. */
  holdsBrood(i: number): boolean {
    return this.#holdsBrood[i] === 1;
  }

  /** What ant i holds, as a response sees it. */
  item(i: number): Item {
    return this.carrying[i] ? "food" : this.pellet[i] ? (this.#corpse[i] ? "corpse" : "soil") : this.#holdsBrood[i] ? "brood" : "none";
  }

  /**
   * Ant i's situation for a response, in the shared Touch object (read it, don't keep it): its mode, load and where it
   * is now. `enemy` comes from the caller (the tick's enemy look, or the fights).
   */
  touch(i: number, enemy: boolean, mode: number = this.mode[i] as number, item: Item = this.item(i), offered: Item = "none"): Touch {
    const t = this.#t;
    t.mode = MODES[mode] as Mode;
    t.carrying = item;
    t.porter = this.#porter[i] === 1;
    t.digging = (this.digT[i] as number) > 0;
    this.#ti = i; // t.place reads ant i's place when asked
    t.offered = offered;
    t.enemy = enemy;
    t.stance = this.#stanceOf(i);
    // Taste (docs/trails.md): the food offered, under the ant; else the food in its jaws.
    if (offered === "food") {
      this.antCell(i);
      t.quality = qualityOf(qualityAt(this.map, CELL[0] as number, CELL[1] as number));
    } else t.quality = item === "food" ? qualityOf(this.quality[i] as number) : "fair";
    t.alarm = i === this.#alarmAnt ? this.#alarmSmelt : "none";
    t.odds = i === this.#alarmAnt ? this.#oddsNow : "none";
    const few = this.params.leaveGate;
    const met = this.met[i] as number;
    t.returns = few <= 0 || met < few ? "none" : met < RETURNS_MANY * few ? "few" : "many";
    t.raid = this.#raidSmelt(i);
    t.crowd = (this.crowd[i] as number) >= this.params.crowdAt ? "many" : "few";
    return t;
  }

  /**
   * Where ant i is, as it can tell (responses.ts: Where). Underground (side view): in one of its own chambers, in its own
   * tunnels, or "out" in a stranger's; on the ground or a top-down map: at its hole (within the nest's radius) or out.
   * Leaves the shared CELL as it found it.
   */
  place(i: number): Where {
    const keepX = CELL[0] as number;
    const keepY = CELL[1] as number;
    let p: Where;
    if (this.#entrance && this.#under[i]) {
      this.antCell(i);
      const cx = CELL[0] as number;
      const cy = CELL[1] as number;
      p = !this.#inOwnNest(cx, cy) ? "out" : this.#perceivedPlace(i, this.#placeAt(cx, cy)) ? "chamber" : "tunnel";
    } else {
      const dx = (this.x[i] as number) - this.nest.x;
      const dy = (this.y[i] as number) - this.nest.y;
      p = dx * dx + dy * dy < this.nest.r * this.nest.r ? "hole" : "out";
    }
    CELL[0] = keepX;
    CELL[1] = keepY;
    return p;
  }

  /** Whether ant i is tired: past the colony's patience, or not yet fully rested since it was (ja-q47). */
  #isTired(i: number): boolean {
    return this.#tired[i] === 1 || (this.fatigue[i] as number) > this.params.patience;
  }

  /** Whether ant i stands in its own nest (not a stranger's), by its cell. Leaves the shared CELL as it found it. */
  #ownNestHere(i: number): boolean {
    const keepX = CELL[0] as number;
    const keepY = CELL[1] as number;
    this.antCell(i);
    const own = this.#inOwnNest(CELL[0] as number, CELL[1] as number);
    CELL[0] = keepX;
    CELL[1] = keepY;
    return own;
  }

  /** Whether ant i, underground, is home: in its royal chamber, where it homes to. Leaves the shared CELL as it found it. */
  #home(i: number): boolean {
    const keepX = CELL[0] as number;
    const keepY = CELL[1] as number;
    this.antCell(i);
    const cx = CELL[0] as number;
    const cy = CELL[1] as number;
    const at = this.#inOwnNest(cx, cy) ? this.#perceivedPlace(i, this.#placeAt(cx, cy)) : null;
    CELL[0] = keepX;
    CELL[1] = keepY;
    return at === "royal";
  }

  /** Living ants. */
  get population(): number {
    let s = 0;
    for (const v of this.alive) s += v;
    return s;
  }

  /** A new ant at the nest, in the first free slot (at world (x, y) if given: where its pupa lay); false when the colony is at its cap. */
  spawn(x?: number, y?: number): boolean {
    const i = this.alive.indexOf(0);
    if (i < 0) return false;
    this.#place(i);
    if (x !== undefined && y !== undefined) {
      this.x[i] = x;
      this.y[i] = y;
    }
    this.births++;
    return true;
  }

  /**
   * Food at home that won't become ants (what the strategist reads as a full larder). On the top-down maps the larder
   * becomes ants at once while there is room, so it is all of it. With a queen (the side view) the larder also holds
   * what her brood will be fed, and fills while the colony grows: only food beyond that, at the cap, is spare.
   */
  #spare(): number {
    if (!this.queen) return this.larder;
    if (!this.orphaned && this.population + this.brood.size < this.params.maxAnts) return 0; // orphaned, it will never grow: its food is spare
    return this.larder + this.#inJaws - this.brood.owed();
  }

  /** The queen dies (a raider at her side; later, the fungus): the colony is orphaned, it lays no more eggs. */
  killQueen(): void {
    if (this.queen) this.queen.alive = false;
  }

  /**
   * Ant i's age band (nest slice 6, Tschinkel's zoning by age): 0 young (nurses, deep with the queen and brood),
   * 1 middle-aged (dig and carry inside), 2 old (forage). Shares of the mean lifespan; on the top-down maps every ant is old.
   */
  band(i: number): 0 | 1 | 2 {
    if (!this.queen) return 2;
    const a = (this.age[i] as number) / LIFESPAN;
    return a < YOUNG ? 0 : a < MIDDLE ? 1 : 2;
  }

  /** Whether ant i may go out onto the ground: the young never (they nurse); the rest may. */
  #mayGoOut(i: number): boolean {
    // The young never; the rest may (the middle-aged dig and carry inside, the old climb out to forage: #outbound). A hard
    // limit on the middle-aged (out only while foragers were short) kept a crowd of them at the hole being put back.
    return this.band(i) !== 0;
  }

  /** The other colonies' holes (or nests, on a top-down map), and the raid target if the game set no others. */
  #otherHoles(): { x: number; y: number }[] {
    const out: { x: number; y: number }[] = this.others.map((o) => o.entrance ?? o);
    if (this.raidTarget && !out.some((o) => Math.abs(o.x - this.raidTarget!.x) < 1)) out.push(this.raidTarget);
    return out;
  }

  /** Whether cell (cx, cy) is nearer this colony's hole than any other colony's (raiding: still at home, or already at theirs). */
  #inOwnNest(cx: number, cy: number): boolean {
    if (!this.#entrance) return true;
    const x = centreX(cx, cy);
    const own = Math.abs(x - this.#entrance.x);
    // The same holes as #otherHoles, without building its array: this runs for every carrier every step (Touch.place).
    let raidListed = !this.raidTarget;
    for (const n of this.others) {
      const o = n.entrance ?? n;
      if (Math.abs(x - o.x) < own) return false;
      if (!raidListed && Math.abs(o.x - this.raidTarget!.x) < 1) raidListed = true;
    }
    return raidListed || Math.abs(x - this.raidTarget!.x) >= own;
  }

  /** The hole of the nearest other colony (the midden faces it), or null alone. */
  #neighbour(): { x: number; y: number } | null {
    if (!this.#entrance) return null;
    let best: { x: number; y: number } | null = null;
    for (const o of this.#otherHoles()) if (!best || Math.abs(o.x - this.#entrance.x) < Math.abs(best.x - this.#entrance.x)) best = o;
    return best;
  }

  /** Which side of its hole the colony's midden lies: toward its nearest neighbour (a boundary between them), east if alone. */
  #middenSide(): -1 | 1 {
    const t = this.#neighbour();
    return t && this.#entrance && t.x < this.#entrance.x ? -1 : 1;
  }

  /** How far out the midden lies: past the mound's largest reach, fixed, so the mound never grows over it (review of
   *  slice 7: placed past the mound's current edge, it was buried as the mound spread, and moved with it). */
  #middenAt(): number {
    // Never past 40 % of the way to the nearest neighbour on that side: each midden on its own colony's ground (nests close together).
    const t = this.#neighbour();
    return t && this.#entrance ? Math.min(MIDDEN_AT, Math.round(0.4 * Math.abs(t.x - this.#entrance.x))) : MIDDEN_AT;
  }

  /** The middle of the midden: its column (side view). */
  #middenCol(): number {
    return this.#entranceCol + this.#middenSide() * this.#middenAt();
  }

  /**
   * The chance a raider about to step onto a cell of the raided colony's midden (mark v there) turns back. A lone scout
   * mostly does; a raid in force presses on (review of #26: one saturated cell turned back 98 % of raiders, so none ever
   * got into the rival's nest): the chance falls with its own colony's ants around it (`friends`, within two cells).
   */
  #middenTurn(v: number, cx: number, cy: number): number {
    const company = this.friends ? this.#around(this.friends, cx, cy) : 1;
    return (1 - Math.exp(-v / MIDDEN_SCALE)) * Math.min(1, MIDDEN_CROWD / company);
  }

  /** Whether ant i, exploring, is a forager on its way out: the old (in the side view with a queen). */
  #outbound(i: number): boolean {
    return this.queen !== null && this.band(i) === 2;
  }

  /** The way ahead (not back) from cell (cx, cy) with the most royal and brood mark (the queen's and the brood's chambers), or −1 if none smells of them. */
  #toBrood(cx: number, cy: number, dir: number): number {
    const royal = this.ph.fields.royal;
    const brood = this.ph.fields.brood;
    let best = -1;
    let bestV = FAINT;
    for (const turn of [0, 1, -1, 2, -2]) {
      const d = (dir + turn + 6) % 6;
      const tx = stepX(cx, cy, d);
      const ty = stepY(cy, d);
      if (rockAt(this.map, tx, ty) !== OPEN || isSky(this.map, tx, ty)) continue;
      const v = royal.get(tx, ty) + brood.get(tx, ty);
      if (v > bestV) ((bestV = v), (best = d));
    }
    return best;
  }

  /**
   * The way from cell (cx, cy) up and out of the nest: one step nearer this colony's hole along the tunnels (#outField), or
   * −1 at the hole. Greedy steps by straight-line distance to the hole (the first cut) parked old foragers at tunnel tips
   * that lay nearer the hole than anything round them, for good: they don't dig (review of #25). A cell the field doesn't
   * reach (dug since it was built, or not joined to the hole) steps straight toward the hole as before.
   */
  #climbOut(cx: number, cy: number): number {
    const f = this.#outField();
    const { w, h } = this.map.size;
    const here = cx >= 0 && cy >= 0 && cx < w && cy < h ? (f[cy * w + cx] as number) : -1;
    if (here === 0) return -1;
    if (here > 0)
      for (const d of UP_FIRST) {
        const tx = stepX(cx, cy, d);
        const ty = stepY(cy, d);
        if (tx >= 0 && ty >= 0 && tx < w && ty < h && f[ty * w + tx] === here - 1 && rockAt(this.map, tx, ty) === OPEN) return d;
      }
    this.#holeX = (this.#entrance as Nest).x;
    return this.#towardHole(cx, cy, false);
  }

  /**
   * The side view: steps from each open cell underground to this colony's hole through the tunnels (−1: not joined to it).
   * Cached for the colony, and rebuilt when the ground has changed (cells dug or filled), at most every OUT_FIELD_EVERY
   * seconds: a breadth-first walk over the nest's own tunnels, a few thousand cells.
   */
  #outField(): Int32Array {
    const map = this.map;
    const version = map.dug + map.filled;
    const have = this.#outDist;
    if (have && (this.#outVersion === version || this.time - this.#outAt < OUT_FIELD_EVERY)) return have;
    const { w, h } = map.size;
    const dist = have ?? new Int32Array(w * h).fill(-1);
    this.#outDist = dist;
    const cells = this.#outCells;
    for (const k of cells) dist[k] = -1;
    cells.length = 0;
    const start = this.#entranceRow * w + this.#entranceCol;
    dist[start] = 0;
    cells.push(start);
    for (let q = 0; q < cells.length; q++) {
      const k = cells[q] as number;
      const x = k % w;
      const y = (k - x) / w;
      const d = (dist[k] as number) + 1;
      for (let dir = 0; dir < 6; dir++) {
        const tx = stepX(x, y, dir);
        const ty = stepY(y, dir);
        if (tx < 0 || ty < 0 || tx >= w || ty >= h) continue;
        const t = ty * w + tx;
        if ((dist[t] as number) >= 0 || rockAt(map, tx, ty) !== OPEN || isSky(map, tx, ty)) continue;
        dist[t] = d;
        cells.push(t);
      }
    }
    this.#outVersion = version;
    this.#outAt = this.time;
    return dist;
  }

  /** The way from cell (cx, cy), underground away from its own nest (in at another's hole), up toward the ground: onto it if it can, else the open neighbour highest up; −1 if none is higher. */
  #upOut(cx: number, cy: number): number {
    let best = -1;
    let bestY = centreY(cy) - 1e-6;
    for (const d of UP_FIRST) {
      const tx = stepX(cx, cy, d);
      const ty = stepY(cy, d);
      if (rockAt(this.map, tx, ty) !== OPEN) continue;
      if (isSky(this.map, tx, ty)) return d;
      if (centreY(ty) < bestY) {
        bestY = centreY(ty);
        best = d;
      }
    }
    return best;
  }

  /** Whether ant i is an inside worker now: underground, carrying nothing, not allowed out (zoned by age). */
  #staysIn(i: number): boolean {
    return this.queen !== null && this.#under[i] === 1 && !this.carrying[i] && !this.pellet[i] && !this.#mayGoOut(i);
  }

  /** Whether ant i digs: in the side view with a queen, the middle-aged (the young nurse, the old forage); elsewhere, any explorer. */
  #digs(i: number): boolean {
    return !this.queen || this.band(i) === 1;
  }

  /** Whether the colony has lost its queen (the side view; the top-down maps have none to lose). */
  get orphaned(): boolean {
    return this.queen !== null && !this.queen.alive;
  }

  /** Ant i dies where it stands; food it carried drops on that cell (a soil pellet is just lost; brood it carried lies there). `lost`: a loss to the strategist (a fight), not old age. */
  kill(i: number, lost = true): void {
    if (!this.alive[i]) return;
    if (this.#holdsBrood[i]) this.#dropBrood(i);
    if (this.carrying[i] && this.#porter[i]) {
      // A porter's food is already home: it stays the colony's, in the chamber it was taking it to (on the floor, a
      // forager would bring it "home" a second time).
      const t = this.map.chambers?.list[this.#portTo[i] as number];
      if (t) this.#stock(t, 1);
      else this.feed(1);
      this.#inJaws -= 1;
      this.carrying[i] = 0;
      this.#porter[i] = 0;
      this.#portTo[i] = -1;
    }
    if (this.carrying[i]) dropFood(this.map, this.x[i] as number, this.y[i] as number, 1, this.quality[i] as number);
    this.antCell(i);
    if (this.#corpse[i]) {
      // The corpse it carried falls where it falls, with it.
      for (const k of this.corpses) if (k.held === i) ((k.held = -1), (k.x = CELL[0] as number), (k.y = CELL[1] as number));
      this.#corpse[i] = 0;
    } else if (this.pellet[i]) {
      if (this.#soil[i] !== SOIL_DUG) this.looseLost++;
      else this.soilLost++;
    }
    // In the side view with a queen, the dead lie where they fall until an undertaker takes them out (slice 7).
    if (this.queen) this.corpses.push({ x: CELL[0] as number, y: CELL[1] as number, held: -1, died: this.time, load: this.load[i] as number, strain: this.strain[i] as number });
    this.#clearPellet(i);
    this.alive[i] = 0;
    this.carrying[i] = 0;
    this.digT[i] = 0;
    if (lost) {
      this.losses++;
      this.recentLosses++;
    }
  }

  /** Pellets in jaws now: dug ones (on their way out, or to fill) and loose ones off the mound (side view). */
  carriedPellets(): { dug: number; loose: number } {
    let dug = 0;
    let loose = 0;
    for (let i = 0; i < this.n; i++)
      if (this.alive[i] && this.pellet[i] && !this.#corpse[i]) {
        if (this.#soil[i] !== SOIL_DUG) loose++;
        else dug++;
      }
    return { dug, loose };
  }

  /** Food left on the map. */
  get foodLeft(): number {
    return this.map.foodLeft;
  }

  /** Every ant asks its policy again on its next tick: a new doctrine, or fresh answers from Jev, take effect at once. */
  reconsider(): void {
    this.#asked.fill(-1);
  }

  /** The fungus's brush: lay `amount` of a trail on every open cell within `radius` of (x, y). */
  paint(channel: Channel, x: number, y: number, radius: number, amount: number): void {
    const { size } = this.map;
    for (let cy = Math.max(0, Math.floor((y - radius) / R - 1)); cy <= Math.min(size.h - 1, Math.ceil((y + radius) / R)); cy++)
      for (let cx = Math.max(0, Math.floor(x - radius - 1)); cx <= Math.min(size.w - 1, Math.ceil(x + radius)); cx++) {
        const px = centreX(cx, cy);
        const py = centreY(cy);
        if (rockAt(this.map, cx, cy) || Math.hypot(px - x, py - y) > radius) continue;
        this.ph.deposit(channel, px, py, amount);
      }
  }

  /** The situation ant i was in when its policy last chose its mode, or null if it never chose (a carrier going home is not asked). */
  lastQuestion(i: number): Situation | null {
    const q = this.#question[i] as number;
    return this.alive[i] && q >= 0 ? decode(q) : null;
  }

  /** Distinct situations the policy has been asked about. */
  get situationsSeen(): number {
    let s = 0;
    for (const v of this.seen) s += v;
    return s;
  }

  /** Living ants in each mode. */
  counts(): Record<Mode, number> {
    const c = { explore: 0, follow: 0, return: 0, fight: 0 };
    for (let i = 0; i < this.n; i++) if (this.alive[i]) c[MODES[this.mode[i] as number] as Mode]++;
    return c;
  }

  /** The strategist's view of this colony. `enemyNearNest` comes from the game, which sees both colonies. */
  stanceSituation(enemyNearNest: boolean): StanceSituation {
    const pop = this.population / this.params.maxAnts;
    const intake = this.intakeRate / Math.max(1, this.population);
    return {
      stance: this.stance,
      ants: pop < 0.4 ? "few" : pop < 0.8 ? "some" : "many",
      losses: this.recentLosses < 1 ? "none" : this.recentLosses < 10 ? "some" : "heavy",
      enemyNearNest,
      // Until it has watched a whole window the colony can't tell: "some".
      intake: this.time < INTAKE_WINDOW ? "some" : intake < INTAKE_NONE ? "none" : intake >= INTAKE_PLENTY ? "plenty" : "some",
      larder: this.#spare() >= 2 * this.params.foodPerAnt ? "full" : "low",
    };
  }

  /**
   * What the sensor in direction (dx, dy) (a unit vector) reads on every channel, into #s[slot] (food), #s[slot + 3] (home) and
   * #s[slot + 6] (alarm): the trail, the edge or rock as −1, and food (or the nest, for home) as SEEN.
   */
  #sense(i: number, dx: number, dy: number, slot: number): void {
    const d = this.params.sensorDistance;
    const sx = (this.x[i] as number) + dx * d;
    const sy = (this.y[i] as number) + dy * d;
    const s = this.#s;
    const { map, nest } = this;
    cellOf(sx, sy);
    const cx = CELL[0] as number;
    const cy = CELL[1] as number;
    if (rockAt(map, cx, cy) !== OPEN) {
      s[slot] = s[slot + 3] = s[slot + 6] = -1;
      return;
    }
    // Scent is read through the ant's perception (gains of 1 and no foreign reading: as it is, exactly).
    const f = this.ph.fields;
    if (map.food.get(cx, cy) > 0) s[slot] = SEEN;
    else {
      const wf = this.foreignFood[i] as number;
      s[slot] = f.food.get(cx, cy) * (this.gainFood[i] as number) + (wf > 0 && this.foreign ? wf * this.foreign.fields.food.get(cx, cy) : 0);
    }
    const ndx = sx - nest.x;
    const ndy = sy - nest.y;
    s[slot + 3] = ndx * ndx + ndy * ndy < nest.r * nest.r ? SEEN : f.home.get(cx, cy) * (this.gainHome[i] as number);
    s[slot + 6] = f.alarm.get(cx, cy) * (this.gainAlarm[i] as number);
  }

  /**
   * Ant i starts a trip home (it picked up food, or its policy sent it home): a detour or a wall left
   * over from foraging would otherwise switch its home vector off, and bumps would keep renewing it.
   */
  #homeAfresh(i: number): void {
    this.#chamberCell[i] = -1; // a chamber face it was walking up to is no longer its business (review of slice 2)
    this.search[i] = 0; // a search left over from the last trip home
    this.#groundMin[i] = NaN;
    this.detour[i] = 0;
    this.bumps[i] = 0;
    this.wall[i] = 0;
    this.mx[i] = NaN;
    this.untouched[i] = 0;
    this.bestD[i] = Infinity;
    this.stallT[i] = 0;
  }

  /**
   * Whether ant i at (x, y) is back on its line home: the line from where this trip first met rock
   * to the nest (Bug2's "m-line"). Leaving walls only there is what guarantees getting round: leaving
   * anywhere nearer settles ants in the deepest bay facing the nest.
   */
  #onMLine(i: number, x: number, y: number, width = M_LINE_WIDTH): boolean {
    const ax = this.mx[i] as number;
    const ay = this.my[i] as number;
    if (Number.isNaN(ax)) return true;
    const dx = this.#goalX - ax;
    const dy = this.#goalY - ay;
    const len = Math.hypot(dx, dy);
    if (len < 1e-6) return true;
    return Math.abs((x - ax) * dy - (y - ay) * dx) / len < width;
  }

  /** Whether the straight way from (x, y) to (tx, ty) is open, felt every half cell: the nest in plain view (or smell) down a clear passage. */
  #clearTo(x: number, y: number, tx: number, ty: number): boolean {
    const steps = Math.ceil(Math.hypot(tx - x, ty - y) * 2);
    for (let k = 1; k < steps; k++) if (blocked(this.map, x + ((tx - x) * k) / steps, y + ((ty - y) * k) / steps)) return false;
    return true;
  }

  /**
   * Walking a tunnel, cell by cell (thigmotaxis: ants keep to walls). True while ant i is in a tunnel
   * (see tunnel) and steering by its target cell (gx, gy); false in open ground, where it steers freely.
   * At each cell's centre it takes the next way: an explorer by
   * its hand on the wall, so it visits every branch in turn, and at a dead end of soil it faces the
   * end (sometimes the side: a fork) to dig it; a follower by the strongest food trail ahead; a
   * homing ant by the other hand, which walks a hand-on-wall walk back the way it came. An explorer
   * that touched soil a moment ago keeps its hand on a chamber's wall too (see #hug).
   */
  #walkTunnel(i: number, mode: number, step: number): boolean {
    const { map } = this;
    const x = this.x[i] as number;
    const y = this.y[i] as number;
    this.antCell(i);
    const hx = CELL[0] as number;
    const hy = CELL[1] as number;
    // A target that isn't this cell or a neighbour is stale (from before a detour, say): decide afresh.
    // So is one that has been filled since (backfill), unless it is an explorer's face to dig: a cell it
    // chose to dig (digAim set), not one it was walking to, and not one put back moments ago (see refilled).
    // Kept, a walkway filled in front of an explorer was dug straight back out (the review of MR 12).
    const fresh =
      this.gx[i] === NO_CELL ||
      hexDistance(this.gx[i] as number, this.gy[i] as number, hx, hy) > 1 ||
      (rockAt(map, this.gx[i] as number, this.gy[i] as number) !== OPEN &&
        (mode !== EXPLORE || Number.isNaN(this.digAim[i] as number) || refilled(map, this.gx[i] as number, this.gy[i] as number, this.time))) ||
      rockAt(map, this.gx[i] as number, this.gy[i] as number) === AIR; // sky (the ground under a walkway dug away) is no face to dig
    if (!fresh && Math.hypot(centreX(this.gx[i] as number, this.gy[i] as number) - x, centreY(this.gy[i] as number) - y) > step) return true;
    const hugging = mode === EXPLORE && (this.hugT[i] as number) > 0;
    const packed = hy * 65536 + hx;
    // Homing on the ground line (side view) goes cell by cell to the hole wherever the walkway is, one cell
    // thick or two (on the mound's slopes, where it is no tunnel and steering freely wandered off round them).
    const carryingOut = mode === RETURN && this.pellet[i] === 1 && this.#entrance !== null && !Number.isNaN(this.#spoilTo[i] as number);
    // Raiding in the side view (slice 7): out of its own nest, along the ground to the rival's hole, cell by cell.
    const raiding = mode === FIGHT && this.#entrance !== null && this.stance === "raid" && this.raidTarget !== null;
    const onSky = isSky(map, fresh ? hx : (this.gx[i] as number), fresh ? hy : (this.gy[i] as number));
    // Homing underground with the hole still its goal: in at another hole than its own (see #goal). It climbs back out.
    const climbing = mode === RETURN && this.#entrance !== null && !onSky && this.#goalKind[i] === 1 && this.pellet[i] === 0;
    const groundHome = carryingOut || climbing || ((mode === RETURN || raiding) && this.#entrance !== null && onSky);
    if (fresh && !hugging && !groundHome && this.#noTunnel[i] === packed) {
      this.gx[i] = NO_CELL; // looked here already: open ground
      return false;
    }
    const cx = fresh ? hx : (this.gx[i] as number);
    const cy = fresh ? hy : (this.gy[i] as number);
    if (!groundHome && !tunnel(map, cx, cy)) {
      if (hugging) return this.#hug(i, cx, cy, fresh);
      this.gx[i] = NO_CELL;
      if (fresh) this.#noTunnel[i] = packed;
      return false;
    }
    this.#noTunnel[i] = -1;
    let dir = fresh ? dirOf(this.heading[i] as number) : (this.gdir[i] as number);
    const ent = this.#entrance;
    if (carryingOut) {
      // Carrying a pellet out (side view): up to the hole if it is still in the shaft, then on along the ground away
      // from it to where it drops it (away from the hole from inside the shaft is down it).
      const inShaft = !isSky(map, cx, cy) && !(cx === this.#entranceCol && cy === this.#entranceRow);
      const best = inShaft ? this.#towardHole(cx, cy, false) : this.#awayFromHole(cx, cy, this.#spoilSide[i] as number);
      if (best < 0) this.#spoilTo[i] = Math.min(0, this.#spoilTo[i] as number); // the map's edge, or nowhere farther: it drops it here (one carried back to the midden walks on: #undertake)
      dir = best < 0 ? handOnWall(map, cx, cy, dir, -(this.hand[i] as number)) : best;
    } else if (raiding) {
      const t = this.raidTarget as Nest;
      let best: number;
      if (isSky(map, cx, cy)) {
        this.#holeX = t.x;
        best = this.#towardHole(cx, cy, true, NaN, t.y);
        // The rival's midden marks its ground (Pogonomyrmex badius): a raider about to step onto it may turn back, the
        // more surely the stronger it smells and the fewer of its own colony are with it (#middenTurn).
        const m = this.raidMarks?.fields.midden;
        if (best >= 0 && m) {
          const v = m.get(stepX(cx, cy, best), stepY(cy, best));
          if (v >= FAINT && this.#rng() < this.#middenTurn(v, cx, cy)) best = rockAt(map, stepX(cx, cy, (dir + 3) % 6), stepY(cy, (dir + 3) % 6)) === OPEN ? (dir + 3) % 6 : -1;
        }
      } else if (this.#inOwnNest(cx, cy) || !this.raidNest) best = this.#climbOut(cx, cy);
      else {
        // In at the rival's hole: down to its chamber (review of slice 7: it climbed back out, to its own hole).
        this.#holeX = this.raidNest.x;
        best = this.#towardHole(cx, cy, false, NaN, this.raidNest.y);
      }
      dir = best < 0 ? handOnWall(map, cx, cy, dir, -(this.hand[i] as number)) : best;
      this.digAim[i] = NaN;
    } else if (climbing) {
      const up = this.#upOut(cx, cy);
      dir = up >= 0 ? up : handOnWall(map, cx, cy, dir, -(this.hand[i] as number));
    } else if (mode === RETURN && ent && isSky(map, cx, cy)) {
      // On the ground line (side view), homing is to the hole: the way nearer it along the ground (home scent lies
      // along the walkway both sides of the hole, so the most-scent rule below walks a carrier past it and on).
      // A surface it was following round toward one hole (believed, or the real one once in sight) says nothing about
      // the other: start afresh if the target changed.
      if (this.#groundRef[i] !== this.#holeX) this.#groundMin[i] = NaN;
      const min = this.#groundMin[i] as number;
      let best = this.#towardHole(cx, cy, true, min);
      if (best >= 0) this.#groundMin[i] = NaN;
      else if (Number.isNaN(min) && this.#holeX !== ent.x && Math.abs(centreX(cx, cy) - this.#holeX) < 1) {
        // At the column where it believed the hole was, and no hole in sight: search to either side, farther each time.
        // (Only there: blocked anywhere else, it goes round the obstacle below, or every blocked step would widen the search.)
        this.#searchOn(i);
        this.#holeX = this.#believe(i, ent).x;
        best = this.#towardHole(cx, cy, true);
      } else if (Number.isNaN(min)) {
        // No open way nearer the hole it heads for (spoil heaped between, a pit beside the mound, a step in the ground):
        // Bug2 on the ground, a hand on the surface until it is somewhere nearer that hole than here. Rocking between
        // the nearest cell and a step away kept whole colonies in such a pit.
        this.#groundMin[i] = this.#holeMetric(cx, cy);
        this.#groundRef[i] = this.#holeX;
        this.#groundT[i] = 0;
        // Which hand: feel ahead along the surface both ways (a gully between two heaps: one side leads over toward the
        // hole, the other along the far heap and away) and take the one that gets nearer than here sooner.
        const m = this.#groundMin[i] as number;
        const ka = this.#groundLook(cx, cy, dir, 1, m);
        const kb = this.#groundLook(cx, cy, dir, -1, m);
        if (ka !== kb) this.hand[i] = ka < kb ? -1 : 1; // handOnWall below takes −hand
      } else if (flipDue((this.#groundT[i] = Math.min(65535, (this.#groundT[i] as number) + 1)))) {
        // The long way round: the other hand, and turned back. Each leg is twice the last (GROUND_FLIP, then 2×, 4×...):
        // with equal legs, the walk back after a flip ended where it started, and flipped there again, for ever (a pit
        // on the mound whose only other way out was back: both hands left it the same way).
        this.hand[i] = -(this.hand[i] as number);
        dir = (dir + 3) % 6;
      }
      dir = best < 0 ? this.#groundHand(cx, cy, dir, -(this.hand[i] as number)) : best;
    } else if (mode === RETURN || mode === FOLLOW) {
      // The way ahead (not back, unless it's a dead end) with the most scent: home scent, laid by
      // ants walking out, for a homing ant; food scent for a follower. No scent at all: a hand on the wall.
      // Homing with no progress for TUNNEL_STALL seconds (scent can lead round a ring of tunnels for
      // ever): the way that points most nearly to its goal instead (the nest, or the entrance), by its home vector.
      const field = mode === RETURN ? this.ph.fields.home : this.ph.fields.food;
      // Underground in the side view, homing follows the road signs of where it is going (its chamber's mark); the home
      // trail only where there are none.
      const signs = mode === RETURN && this.#entrance && !isSky(map, cx, cy) ? this.ph.fields[this.#destMark(i)] : null;
      const signGain = SIGN_WEIGHT * (this.gainHome[i] as number) * (this.gainMarks[i] as number); // the fungus's home and marks levers bend road signs
      const byVector = mode === RETURN && (this.stallT[i] as number) > TUNNEL_STALL;
      const hx = this.#goalX - centreX(cx, cy);
      const hy = this.#goalY - centreY(cy);
      let best = -1;
      let bestV = byVector ? -Infinity : 0;
      for (const turn of [0, 1, -1, 2, -2]) {
        const d = (dir + turn + 6) % 6;
        const tx = stepX(cx, cy, d);
        const ty = stepY(cy, d);
        if (rockAt(map, tx, ty) !== OPEN) continue;
        const v = byVector ? Math.cos(DIR_ANGLE[d] as number) * hx + Math.sin(DIR_ANGLE[d] as number) * hy : (signs ? signs.get(tx, ty) * signGain : 0) + field.get(tx, ty);
        if (v > bestV) {
          bestV = v;
          best = d;
        }
      }
      dir = best < 0 ? handOnWall(map, cx, cy, dir, -(this.hand[i] as number)) : best;
    } else if (mode === EXPLORE && ent && isSky(map, cx, cy)) {
      // On the ground line (side view) an explorer walks on along the ground the way it is going, turning back only
      // at its end. A hand on the wall (searching a tunnel's branches) turned explorers round at every step of the
      // ground and kept them within a few dozen cells of the hole, short of the food lying farther out.
      let best = -1;
      for (const turn of [0, 1, -1, 2, -2]) {
        const d = (dir + turn + 6) % 6;
        const tx = stepX(cx, cy, d);
        const ty = stepY(cy, d);
        if (rockAt(map, tx, ty) === OPEN && isSky(map, tx, ty)) {
          best = d;
          break;
        }
      }
      if (best < 0) best = rockAt(map, stepX(cx, cy, (dir + 3) % 6), stepY(cy, (dir + 3) % 6)) === OPEN ? (dir + 3) % 6 : handOnWall(map, cx, cy, dir, this.hand[i] as number);
      dir = best;
      this.digAim[i] = NaN;
    } else if (mode === EXPLORE && this.queen && this.band(i) === 0 && !isSky(map, cx, cy) && this.#toBrood(cx, cy, dir) >= 0) {
      // A young ant keeps with the queen and brood (slice 6): along their marks, deeper into the nest.
      dir = this.#toBrood(cx, cy, dir);
      this.digAim[i] = NaN;
    } else if (mode === EXPLORE && ent && this.#outbound(i) && !isSky(map, cx, cy) && this.#climbOut(cx, cy) >= 0) {
      // An old forager inside the nest heads up and out (slice 6: foragers leave by the shaft, climbing: gravity).
      dir = this.#climbOut(cx, cy);
      this.digAim[i] = NaN;
    } else {
      const side = this.hand[i] as number;
      let next = handOnWall(map, cx, cy, dir, side);
      // An inside worker at the top of the shaft turns back down rather than step out onto the ground (zoned by age).
      if (this.#staysIn(i) && isSky(map, stepX(cx, cy, next), stepY(cy, next)) && rockAt(map, stepX(cx, cy, (dir + 3) % 6), stepY(cy, (dir + 3) % 6)) === OPEN) next = (dir + 3) % 6;
      // A digger in the side view's nest, crowded: it builds chambers.
      const builds = mode === EXPLORE && this.#entrance !== null && this.#mayDig(cx, cy) && this.#digs(i) && this.crowded();
      const chamberHere = builds ? (map.chambers?.at(cx, cy) ?? -1) : -1;
      // In a chamber still narrow enough to walk like a tunnel (a new one, a cell or two): widen it along its floor.
      const widen = chamberHere >= 0 && this.#rng() < WIDEN ? this.#widenWay(cx, cy, dir) : -1;
      const start = widen < 0 && builds ? this.#newChamberWay(cx, cy) : -1;
      if (widen >= 0) {
        dir = widen;
        this.digAim[i] = DIR_ANGLE[widen] as number;
        this.#aimChamber(i, stepX(cx, cy, widen), stepY(cy, widen), chamberHere + 1);
      } else if (start >= 0) {
        // A new chamber, sideways off this tunnel (see #newChamberWay).
        dir = start;
        this.digAim[i] = DIR_ANGLE[start] as number;
        this.#aimChamber(i, stepX(cx, cy, start), stepY(cy, start), 0);
      } else if (next === (dir + 3) % 6 || rockAt(map, stepX(cx, cy, next), stepY(cy, next)) !== OPEN) {
        // A dead end: dig on. The tunnel carries a heading (the one its end was dug at), which drifts a
        // little each cell: the end cell nearest that heading is dug, so tunnels wander at any angle
        // rather than run straight along the grid. Now and then it forks, 60° to one side.
        const run = tunnelHeading(map, cx, cy);
        let aim = (Number.isNaN(run) ? (DIR_ANGLE[dir] as number) : run) + gauss(this.#rng) * TUNNEL_DRIFT;
        // A fork is a Y: this arm 60° to one side, the other 60° to the other, dug by the next digger to pass.
        let forkSide = 0;
        if (this.#rng() < FORK) {
          forkSide = this.#rng() < 0.5 ? -1 : 1;
          aim += forkSide * (Math.PI / 3);
        }
        // A dead end the colony is filling back (a cell beside it put back moments ago) is left, not dug
        // on: filling a branch from its tip leaves a new dead end, and digging there undid the fill.
        let dug = !this.#mayDig(cx, cy) || !this.#digs(i) || besideRefill(map, cx, cy, this.time) ? -1 : chooseDig(map, cx, cy, aim, this.#rng(), this.time);
        // Digging is social: the more nestmates round it, the likelier an ant is to dig (and, as the nest
        // grows roomy and they spread out, the less). That is how real colonies stop excavating once
        // they have room (Rasse & Deneubourg 2001); a lone ant at a far tunnel's end still digs now and then.
        if (dug >= 0 && this.friends && this.#rng() > digChance(this.friends, cx, cy)) dug = -1;
        // A roomy nest (the side view's chambers have floor enough) barely digs on (ja-wii: digging stops with room).
        if (dug >= 0 && !this.crowded() && this.#rng() > ROOMY_DIG) dug = -1;
        // The other arm two ways round from the way actually dug, on the other side: never next to it, so both
        // stay a tunnel's end (taken from the aim, a dithered dig put the two arms side by side about 1 fork in 8).
        // It carries on at the mirrored heading, drift and all, so its run wanders like any tunnel's.
        if (dug >= 0 && forkSide !== 0) markFork(map, cx, cy, (dug - 2 * forkSide + 12) % 6, aim - forkSide * ((2 * Math.PI) / 3));
        if (dug < 0 && rockAt(map, stepX(cx, cy, next), stepY(cy, next)) !== OPEN) {
          this.gx[i] = NO_CELL; // walled in on every side (it can't be, having walked in): steer freely
          return false;
        }
        this.digAim[i] = dug >= 0 ? aim : NaN;
        dir = dug < 0 ? next : dug;
      } else {
        // Passing a fork's undug arm: dig it (if it is still a tunnel's end), else walk on.
        const fork = takeFork(map, cx, cy);
        let fd = fork ? fork.dir : -1;
        // Social, like any dig, and rare in a roomy nest (ROOMY_DIG, as at a tunnel's end); only a digger's job (slice 6):
        // a passer-by who won't dig now leaves the fork for the next.
        if (fork && (!this.#digs(i) || (this.friends && this.#rng() > digChance(this.friends, cx, cy)) || (!this.crowded() && this.#rng() > ROOMY_DIG))) {
          markFork(map, cx, cy, fork.dir, fork.aim);
          fd = -1;
        }
        if (fork && fd >= 0 && this.#mayDig(cx, cy) && rockAt(map, stepX(cx, cy, fd), stepY(cy, fd)) === SOIL && tunnelEnd(map, stepX(cx, cy, fd), stepY(cy, fd))) {
          dir = fd;
          this.digAim[i] = fork.aim;
        } else {
          dir = next;
          this.digAim[i] = NaN; // walking on, not to a face
        }
      }
    }
    this.gdir[i] = dir;
    this.gx[i] = stepX(cx, cy, dir);
    this.gy[i] = stepY(cy, dir);
    return true;
  }

  /**
   * Keeping a hand on a chamber's wall, cell by cell (it touched soil): so it finds the tunnels
   * leading off the chamber, and now and then (START_HUG a cell) starts one of its own into the wall.
   */
  #hug(i: number, cx: number, cy: number, fresh: boolean): boolean {
    const { map } = this;
    const side = this.hand[i] as number;
    let dir = this.gdir[i] as number;
    const wallDir = (dir + side + 6) % 6; // the wall cell ahead on the hand side
    const wx = stepX(cx, cy, wallDir);
    const wy = stepY(cy, wallDir);
    const crowded = this.crowded();
    const here = map.chambers?.at(cx, cy) ?? -1;
    const brood = here >= 0 ? map.chambers!.list[here]!.brood : 0;
    const widen = !fresh && here >= 0 && crowded && this.#mayDig(cx, cy) && this.#digs(i) && this.#rng() < WIDEN * (1 + BROOD_PULL * Math.min(brood, 10)) ? this.#widenWay(cx, cy, wallDir) : -1;
    if (widen >= 0) {
      // Widen the chamber along its floor (dug like any face; the cell joins the chamber when it is open: see tick).
      dir = widen;
      this.digAim[i] = DIR_ANGLE[widen] as number;
      this.#aimChamber(i, stepX(cx, cy, widen), stepY(cy, widen), here + 1);
    } else if (!fresh && rockAt(map, wx, wy) === SOIL && this.#rng() < START_HUG && (crowded || this.#rng() < ROOMY_DIG) && this.#mayDig(cx, cy) && this.#digs(i) && startable(map, wx, wy, wallDir) && !refilled(map, wx, wy, this.time)) {
      dir = wallDir;
      this.digAim[i] = DIR_ANGLE[wallDir] as number;
    } else {
      dir = handOnWall(map, cx, cy, dir, side);
      this.digAim[i] = NaN;
    }
    this.gdir[i] = dir;
    this.gx[i] = stepX(cx, cy, dir);
    this.gy[i] = stepY(cy, dir);
    return true;
  }

  /**
   * Ant i dug its chamber face (x, y): it joins that chamber, or founds one. The face was chosen a while ago, and chambers
   * round it may have grown since, so it is judged again now it is open (review of slice 2: two chambers joined at 73 s
   * and 352 s on seed 5): if it would join another chamber, lie outside its chamber's rows, or lie too near the ground,
   * it stays a plain tunnel.
   */
  #chamberDug(i: number, x: number, y: number): void {
    const ch = this.map.chambers!;
    let id = (this.#chamberFor[i] as number) - 1;
    if (id < 0) {
      if (!this.#chamberRoom(x, y, y - this.#soilTop(x)) || !this.#chamberSpot(null, x, y)) return; // another was started near it meanwhile: a tunnel stub
      id = ch.add(this.params.nest, y, this.#roleFor(y)).id;
    } else {
      const c = ch.list[id];
      if (!c || c.colony !== this.params.nest || !this.#chamberSpot(c, x, y)) return;
    }
    ch.claim(id, x, y, openCell(this.map));
  }

  /** Ant i is going to dig cell (x, y) for a chamber: `forId` = its id + 1, or 0 for a new chamber there. */
  #aimChamber(i: number, x: number, y: number, forId: number): void {
    this.#chamberCell[i] = y * 65536 + x;
    this.#chamberFor[i] = forId;
  }

  /**
   * Backfill: a pellet carrier at cell (cx, cy) drops its pellet into a neighbouring cell that nobody
   * uses, filling it back with soil, instead of hauling it all the way out. Leaf-cutting ants put most of
   * their soil back inside this way, refilling unused space (Pielström & Roces); harvester ants very
   * little (≈ 2.5 %, Tschinkel et al. 2015). A cell may be filled when:
   * - its open neighbours form one unbroken run (stub with BACKFILL.maxOpen), so no passage is cut;
   * - it smells unused against the path: its home + food scent is under #staleBelow (judged from where
   *   the carrier stands, raised next to fresh pellets);
   * - it holds no food and no ant of either colony, and is not by any nest;
   * - it is not the cell this carrier dug its pellet from (that would undo its own dig), nor any cell dug in the
   *   last BACKFILL.young seconds: fresh digging is where the colony is going (tunnels toward food), not excess
   *   space. Leaf-cutters refill older galleries they no longer use (Pielström & Roces). Except the ground a
   *   chamber's floor stands on (see floorGround): filling a tunnel dug down out of a chamber builds its floor
   *   back, which is construction, not spare soil put away. Put back under a chamber cell, it stays (see builtFloor).
   */
  #backfill(i: number, cx: number, cy: number): boolean {
    const { map } = this;
    const home = this.ph.fields.home;
    const food = this.ph.fields.food;
    for (let d = 0; d < 6; d++) {
      const tx = stepX(cx, cy, d);
      const ty = stepY(cy, d);
      if (ty * 65536 + tx === this.#lastDug[i]) continue; // the cell it just dug: not straight back in
      if (this.time - map.dugAt.get(tx, ty) < backfill.young && !floorGround(map, tx, ty)) continue; // dug lately: the live frontier, not excess
      if (rockAt(map, tx, ty) !== OPEN || !stub(map, tx, ty, backfill.maxOpen)) continue;
      if (map.food.get(tx, ty) > 0 || home.get(tx, ty) + food.get(tx, ty) >= this.#staleBelow(cx, cy, tx, ty)) continue;
      this.enemies?.look?.(this.odour[i] as number, -1); // any ant of another colony, stranger or not (a tolerance below 0 counts every band)
      if ((this.friends?.get(tx, ty) ?? 0) > 0 || (this.enemies?.get(tx, ty) ?? 0) > 0) continue;
      if (this.#byANest(tx, ty)) continue;
      if (this.brood.items.some((b) => b.held < 0 && b.x === tx && b.y === ty)) continue; // brood lies there (a nurse died carrying it)
      if (this.#entrance && (isSky(map, tx, ty) || this.#byAnEntrance(tx, ty))) continue; // the ground line and the holes stay open
      // The grids are a tick old: a nestmate that stepped in earlier this tick isn't in them (and walling it
      // in would bury it). Rare enough (every other test passed) to look at each ant.
      if (this.#occupied(tx, ty)) continue;
      if (!fillCell(map, tx, ty, this.time)) continue;
      // A fresh trip out from here. (Letting its trip clock run on instead, so it lays only faint home scent
      // this deep, was measured worse: it soon tires and walks home empty. Seeds 3, 4, 6–8: 12 % less food home.)
      if (this.#soil[i] !== SOIL_DUG) this.looseFilled++;
      else this.soilFilled++;
      this.#clearPellet(i);
      this.since[i] = 0;
      return true;
    }
    return false;
  }

  /**
   * The scent (home + food) below which cell (tx, ty), seen from the carrier's cell (cx, cy), counts as
   * unused. Scent diffuses into every side passage, so a fixed threshold (FAINT) finds almost nothing
   * unused (0.6 % of dug soil, MR 11); what an ant can tell is that a side passage smells far fainter than
   * the path it is on. Fresh pellets nearby raise it: workers build where building is going on (pellets
   * carry a building pheromone, Khuong et al. 2016; fresh pellets draw more work, Pielström & Roces 2013).
   */
  #staleBelow(cx: number, cy: number, tx: number, ty: number): number {
    const f = this.ph.fields;
    const here = f.home.get(cx, cy) + f.food.get(cx, cy);
    const base = Math.max(FAINT, backfill.staleRatio * here);
    // Never above the scent where it stands: a cell as busy as its own is in use, fresh pellets or not.
    return Math.min(base * (1 + backfill.pelletPull * this.#pelletScent(tx, ty)), Math.max(base, here));
  }

  /** The smell of fresh pellets at cell (x, y): from the freshest fill among it and its neighbours, fading over BACKFILL.pelletTau seconds. */
  #pelletScent(x: number, y: number): number {
    const at = this.map.filledAt;
    let t = at.get(x, y);
    for (let d = 0; d < 6; d++) t = Math.max(t, at.get(stepX(x, y, d), stepY(y, d)));
    return t === -Infinity ? 0 : Math.exp(-(this.time - t) / backfill.pelletTau);
  }

  /**
   * A pellet carrier walking a stale branch (see #enterStale) goes on along it, by the stalest way ahead (never
   * back), to its end, where it fills the last cell (#backfill, on arriving beside it): unused branches are
   * filled back from the tip, a cell per pellet, as leaf-cutting ants refill the excess space they dug
   * (Pielström & Roces). Only early in the trip home (BACKFILL.staleSearch), so a carrier that finds nothing to
   * fill still gets home; at the branch's end with nothing filled (an ant in its last cell, say) it heads home.
   * Decided here, not in #walkTunnel: a branch's first cells touch the tunnel it leaves, so they are no tunnel
   * cells. True while it walks the branch (its target cell is gx, gy).
   */
  #staleStep(i: number, step: number): boolean {
    const s = this.since[i] as number;
    if (s <= backfill.after || s >= backfill.staleSearch) {
      this.#staleWalk[i] = 0;
      return false;
    }
    const { map } = this;
    const x = this.x[i] as number;
    const y = this.y[i] as number;
    this.antCell(i);
    const hx = CELL[0] as number;
    const hy = CELL[1] as number;
    const gx = this.gx[i] as number;
    const gy = this.gy[i] as number;
    const live = gx !== NO_CELL && rockAt(map, gx, gy) === OPEN && hexDistance(gx, gy, hx, hy) <= 1;
    if (live && Math.hypot(centreX(gx, gy) - x, centreY(gy) - y) > step) return true; // on its way to the next cell
    const cx = live ? gx : hx;
    const cy = live ? gy : hy;
    const f = this.ph.fields;
    const ahead = this.gdir[i] as number;
    let way = -1;
    let wayV = Infinity;
    for (const turn of [0, 1, -1, 2, -2]) {
      const d = (ahead + turn + 6) % 6;
      const tx = stepX(cx, cy, d);
      const ty = stepY(cy, d);
      if (rockAt(map, tx, ty) !== OPEN) continue;
      const v = f.home.get(tx, ty) + f.food.get(tx, ty);
      if (v < wayV) {
        wayV = v;
        way = d;
      }
    }
    if (way < 0) {
      this.#staleWalk[i] = 0;
      this.gx[i] = NO_CELL;
      return false;
    }
    this.gdir[i] = way;
    this.gx[i] = stepX(cx, cy, way);
    this.gy[i] = stepY(cy, way);
    return true;
  }

  /**
   * At a cell it has just entered, a pellet carrier that sees a far staler way than where it stands (a branch
   * nobody walks) now and then turns into it (BACKFILL.enterStale), to fill its end (see #staleStep). Forks
   * are never tunnel cells on hexes (the branch's mouth sits beside the way on), so this is looked at on
   * arrival, not in #walkTunnel. True if it turned in: its target cell (gx, gy) is the branch's first cell.
   *
   * Never back the way it came: home scent falls away from the nest along every path, so the cell behind
   * always smells fainter than here, and judged against here alone it passed for a stale branch (40 % of
   * turn-ins were straight reversals, MR 12's review). A branch must smell stale against the way it came
   * too: only then is it a side way nobody walks, not just the path's own far end.
   */
  #enterStale(i: number, cx: number, cy: number): boolean {
    const s = this.since[i] as number;
    if (this.#staleWalk[i] || s >= backfill.staleSearch) return false;
    const { map } = this;
    const f = this.ph.fields;
    // The way it came: the cell it looked from last, if that is beside it; else the way behind its heading.
    const from = this.#cameFrom[i] as number;
    let bx = from & 0xffff;
    let by = from >> 16;
    if (from < 0 || hexDistance(bx, by, cx, cy) !== 1) {
      const back = dirOf((this.heading[i] as number) + Math.PI);
      bx = stepX(cx, cy, back);
      by = stepY(cy, back);
    }
    let way = -1;
    let wayV = Infinity;
    for (let d = 0; d < 6; d++) {
      const tx = stepX(cx, cy, d);
      const ty = stepY(cy, d);
      if ((tx === bx && ty === by) || rockAt(map, tx, ty) !== OPEN) continue;
      const v = f.home.get(tx, ty) + f.food.get(tx, ty);
      if (v < wayV) {
        wayV = v;
        way = d;
      }
    }
    if (way < 0) return false;
    const tx = stepX(cx, cy, way);
    const ty = stepY(cy, way);
    if (wayV >= this.#staleBelow(cx, cy, tx, ty)) return false;
    if (rockAt(map, bx, by) === OPEN && wayV >= this.#staleBelow(bx, by, tx, ty)) return false; // no staler than the path behind
    if (this.#rng() >= backfill.enterStale) return false;
    this.#staleWalk[i] = 1;
    this.gdir[i] = way;
    this.gx[i] = tx;
    this.gy[i] = ty;
    this.wall[i] = 0;
    return true;
  }

  /**
   * Path integration (the side view): the step from (x0, y0) is added to the odometer it walked it under. Coming up out
   * of its own hole starts the surface vector afresh (it points to the hole); in the chamber, the in-nest memory starts
   * afresh. Each fresh start draws that trip's drift.
   */
  #integrate(i: number, x0: number, y0: number, atNest: boolean): void {
    this.antCell(i);
    const under = !isSky(this.map, CELL[0] as number, CELL[1] as number);
    const step = Math.hypot((this.x[i] as number) - x0, (this.y[i] as number) - y0);
    // Only its own hole is where the vector points: up out of another (the rival's, say), its error stands (review of
    // #20: surfacing anywhere made the belief exactly its own hole).
    const ownHole = !under && this.#under[i] === 1 && this.#atOwnHole(x0, y0);
    this.antCell(i); // CELL is the ant's own again (the caller reads it)
    if (ownHole) {
      this.odoSurf[i] = 0;
      this.driftSurf[i] = gauss(this.#rng) * PI_DRIFT;
      this.search[i] = 0;
    } else if (under && !this.#under[i]) this.search[i] = 0;
    this.#under[i] = under ? 1 : 0;
    if (under || this.mode[i] !== RETURN) this.#groundMin[i] = NaN;
    // The error grows with the way out; once the ant heads home it is fixed (the vector it walks home on is the one it
    // brought out; counting the walk home and the search into it moved the believed goal as fast as the ant chased it).
    if (this.mode[i] !== RETURN) {
      if (under) this.odoNest[i] = (this.odoNest[i] as number) + step;
      else this.odoSurf[i] = (this.odoSurf[i] as number) + step;
    }
    if (atNest) {
      this.odoNest[i] = 0;
      this.driftNest[i] = gauss(this.#rng) * PI_DRIFT;
      if (this.#goalKind[i] === 0) this.search[i] = 0;
    }
  }

  /** The side view: whether cell (cx, cy) is in this colony's nest: open ground underground joined to its hole (see #outField). */
  #ownTunnels(cx: number, cy: number): boolean {
    const { w, h } = this.map.size;
    return cx >= 0 && cy >= 0 && cx < w && cy < h && (this.#outField()[cy * w + cx] as number) >= 0;
  }

  /** The side view: whether world point (x, y) is at this colony's hole (its cell, or one beside it). */
  #atOwnHole(x: number, y: number): boolean {
    cellOf(x, y);
    return hexDistance(CELL[0] as number, CELL[1] as number, this.#entranceCol, this.#entranceRow) <= 1;
  }

  /** The nest ant i homes to now (see tick): the chamber, or in the side view the entrance (pellet carriers, ants on the ground line). */
  #goal(i: number, pellet: boolean): Nest {
    const ent = this.#entrance;
    if (!ent) return this.nest;
    let kind = 1;
    if (!pellet || this.#soil[i] === SOIL_FILL) {
      this.antCell(i);
      // Off the ground line it heads for the chamber, but only once in its own nest (in at its own hole, or anywhere in the
      // tunnels joined to it): in at another hole (the rival's), the chamber 340 columns away through soil was no way home
      // (review of #15: a carrier trapped in the rival's shaft for 300 s). There it keeps heading for its hole, and climbs out.
      const cx = CELL[0] as number;
      const cy = CELL[1] as number;
      if (!isSky(this.map, cx, cy)) kind = this.#goalKind[i] === 1 && !this.#ownTunnels(cx, cy) ? 1 : 0;
    }
    if (kind !== this.#goalKind[i]) {
      // A new goal: the wall it was following, and its line home, were for the other one.
      this.#goalKind[i] = kind;
      this.bestD[i] = Infinity; // progress is toward the new goal
      this.stallT[i] = 0;
      this.search[i] = 0;
      this.#groundMin[i] = NaN;
      this.wall[i] = 0;
      this.mx[i] = NaN;
      this.gx[i] = NO_CELL;
    }
    return kind ? ent : this.nest;
  }

  /**
   * Where ant i believes `goal` is (the side view; on the top-down maps, exactly where it is). Its home vector puts the
   * goal drift × distance walked off to one side, plus its search offset; depth is exact (gravity). Local cues snap it to
   * the real goal: the hole within HOLE_SIGHT (seen, and its smell), the chamber in clear view within NEST_SIGHT.
   */
  #believe(i: number, goal: Nest): Nest {
    if (!this.#entrance) return goal;
    const x = this.x[i] as number;
    const y = this.y[i] as number;
    const toHole = goal === this.#entrance;
    // The hole: across the ground, and up out of its crater (the mound's rim stands rows above it; the entrance's smell rises).
    const sees = toHole ? Math.abs(x - goal.x) < HOLE_SIGHT && Math.abs(y - goal.y) < 2 * HOLE_SIGHT : Math.hypot(x - goal.x, y - goal.y) < NEST_SIGHT && this.#clearTo(x, y, goal.x, goal.y);
    if (sees) return goal;
    const under = this.#under[i] === 1;
    const off = under ? (this.driftNest[i] as number) * (this.odoNest[i] as number) : (this.driftSurf[i] as number) * (this.odoSurf[i] as number);
    const b = this.#belief;
    // Never past the ground's ends: a belief off the map left a carrier at the map's edge for good, never reaching the
    // column where it would have searched (review of #20: 473 samples in six games had it off the map). The search is
    // centred on the end it can reach.
    const lo = EDGE;
    const hi = this.map.size.w - EDGE;
    b.x = Math.max(lo, Math.min(hi, Math.max(lo, Math.min(hi, goal.x + off)) + (this.search[i] as number)));
    b.y = goal.y;
    b.r = goal.r;
    return b;
  }

  /**
   * Ant i got to where it believed its goal was and found nothing: it searches, in loops of growing size to either side
   * (Wehner's systematic search). The loops keep widening for as long as it searches (Müller & Wehner 1994: centred on
   * where the vector ran out, they grow without limit in time), up to the whole ground; capped at 80 cells, a carrier
   * whose vector was off by more than about 86 never found its hole (review of #20).
   */
  #searchOn(i: number): void {
    const s = this.search[i] as number;
    const most = this.map.size.w;
    this.search[i] = s === 0 ? SEARCH_START * (this.#rng() < 0.5 ? -1 : 1) : Math.max(-most, Math.min(most, -s * SEARCH_GROW));
    this.wall[i] = 0;
    this.mx[i] = NaN;
    // Progress is judged toward the goal it now believes in.
    this.bestD[i] = Infinity;
    this.stallT[i] = 0;
  }

  /** The situation's home field for ant i: the home trail ahead (sensor readings hl, hf, hr), or, underground in the side view, where it is. */
  #homeField(i: number, hl: number, hf: number, hr: number): Home {
    if (this.#entrance) {
      this.antCell(i);
      const cx = CELL[0] as number;
      const cy = CELL[1] as number;
      if (!isSky(this.map, cx, cy)) return this.#perceivedPlace(i, this.#placeAt(cx, cy)) ?? "tunnel";
    }
    return trailLevel(Math.max(hl, hf, hr));
  }

  /** A chamber's role as ant i smells it (nest slice 8): the fungus can blunt its floor marks (it can't tell) or swap brood and store. */
  #perceivedPlace(i: number, role: Mark | null): Mark | null {
    if (!role) return null;
    if ((this.gainMarks[i] as number) < 0.5) return null;
    return (this.swapMarks[i] as number) >= 0.5 ? swapBroodStore(role) : role;
  }

  /** The role of this colony's chamber at cell (x, y) (a role-less or another colony's chamber reads as tunnel), or null if in none. */
  #placeAt(x: number, y: number): Mark | null {
    const ch = this.map.chambers;
    const id = ch ? ch.at(x, y) : -1;
    if (id < 0) return null;
    const c = ch!.list[id]!;
    return c.colony === this.params.nest && c.role !== "none" ? c.role : null;
  }

  /**
   * Floor marks (nest slice 3): underground, ant i lays the mark of the last chamber it was in, fainter the longer since
   * (as walking out lays home trail), so every tunnel smells of what lies back along it: road signs at each junction.
   */
  #layMark(i: number, dt: number): void {
    this.antCell(i);
    const cx = CELL[0] as number;
    const cy = CELL[1] as number;
    if (isSky(this.map, cx, cy)) {
      this.#lastRole[i] = 0; // out of the nest: the next chamber it enters starts its marks afresh
      return;
    }
    const role = this.#placeAt(cx, cy);
    if (role) {
      this.#lastRole[i] = MARKS.indexOf(role) + 1;
      this.#sinceRole[i] = 0;
    } else this.#sinceRole[i] = (this.#sinceRole[i] as number) + dt;
    const r = this.#lastRole[i] as number;
    if (r === 0) return;
    const laid = this.params.deposit * Math.exp(-(this.#sinceRole[i] as number) / MARK_DECAY) * dt * (this.layGain[i] as number);
    if (laid > 1e-4) this.ph.depositCell(MARKS[r - 1] as Mark, cx, cy, laid);
  }

  /** Where ant i heads when it homes into the nest (the chamber it reads its road signs for): a nurse with brood, a brood chamber; else royal, the queen's (slice 5: carriers to reception). */
  #destMark(i: number): Mark {
    const m = this.#trueDestMark(i);
    // The fungus can swap brood and store (nest slice 8): it follows the other one's signs. A muddled nurse takes brood
    // toward the stores, and a porter takes the larvae's food there: muddle costs a colony births (PRD §39, an intended
    // cost: exempting brood carriers did not bring the births back).
    return (this.swapMarks[i] as number) >= 0.5 ? swapBroodStore(m) : m;
  }

  #trueDestMark(i: number): Mark {
    if (this.#holdsBrood[i]) return "brood";
    if (this.carrying[i] && this.queen) {
      const role = this.map.chambers?.list[this.#foodTo(i)]?.role;
      if (role && role !== "none") return role;
    }
    return "royal";
  }

  /**
   * The chamber ant i, carrying food, takes it to: a porter's chosen one; a forager's, reception once it is a chamber of
   * RECEPTION_MIN cells or more, else the royal chamber. (A reception one or two cells wide, which may never widen, choked
   * colonies: 800–1,900 food piled up in it while the larvae starved, with no idle ant near it to carry it on: review of
   * slice 5, and the F2 fix-up's runs to 3,600 s.)
   */
  #foodTo(i: number): number {
    const to = this.#portTo[i] as number;
    if (to >= 0) return to;
    const ch = this.map.chambers!;
    let royal = -1;
    for (const c of ch.list) {
      if (c.colony !== this.params.nest || c.cells === 0) continue;
      if (c.role === "reception" && c.cells >= RECEPTION_MIN) return c.id;
      if (c.role === "royal") royal = c.id;
    }
    return royal;
  }

  /**
   * Scratch: chamber `id` as a goal, the colony's nest if it has none: the cell of it nearest its centre (cached while it
   * keeps its size). Its mean position alone can lie in the soil, for a chamber widened round a bend or off one end.
   */
  #chamberNest: Nest = { x: 0, y: 0, r: 1.5 };
  #goalCells = new Map<number, { cells: number; x: number; y: number }>();
  #chamberGoal(id: number): Nest {
    const ch = this.map.chambers;
    const c = ch?.list[id];
    if (!ch || !c || c.cells === 0) return this.nest;
    let g = this.#goalCells.get(id);
    if (!g || g.cells !== c.cells) {
      const mx = c.sumX / c.cells;
      const my = c.sumY / c.cells;
      g = { cells: c.cells, x: centreX(Math.round(mx), Math.round(my)), y: centreY(Math.round(my)) };
      let best = Infinity;
      for (let y = Math.floor(my) - CHAMBER_SCAN; y <= Math.ceil(my) + CHAMBER_SCAN; y++)
        for (let x = c.x0; x <= c.x1; x++) {
          if (ch.at(x, y) !== id) continue;
          const d = (x - mx) ** 2 + (y - my) ** 2;
          if (d < best) {
            best = d;
            g.x = centreX(x, y);
            g.y = centreY(y);
          }
        }
      this.#goalCells.set(id, g);
    }
    this.#chamberNest.x = g.x;
    this.#chamberNest.y = g.y;
    return this.#chamberNest;
  }

  /** Food wanted per chamber, and food on its way to each (porters carrying it there): for #port, worked out once a tick. */
  #want = new Map<number, number>();
  #enRouteTo = new Map<number, number>();
  #portViewAt = -1;
  #portView(): void {
    if (this.#portViewAt === this.time) return;
    this.#portViewAt = this.time;
    const want = this.#want;
    const en = this.#enRouteTo;
    want.clear();
    en.clear();
    for (const b of this.brood.items) if (b.held < 0 && b.chamber >= 0 && b.stage !== PUPA && this.map.chambers!.list[b.chamber]!.colony === this.params.nest) want.set(b.chamber, (want.get(b.chamber) ?? 0) + owed(b));
    if (this.queen?.alive) for (const r of this.map.chambers!.list) if (r.colony === this.params.nest && r.role === "royal") want.set(r.id, (want.get(r.id) ?? 0) + QUEEN_STOCK);
    for (let i = 0; i < this.n; i++) {
      const to = this.#portTo[i] as number;
      if (to >= 0 && this.alive[i] && this.carrying[i]) en.set(to, (en.get(to) ?? 0) + 1);
    }
  }

  /** Put `n` food at home: in the royal chamber (with a queen: food lies in chambers), else in the larder. */
  feed(n: number): void {
    const ch = this.map.chambers;
    if (!this.queen || !ch) {
      this.larder += n;
      return;
    }
    // With a queen the larder is the food in the chambers: put anywhere else, the two would drift apart.
    const royal = ch.list.find((c) => c.colony === this.params.nest && c.role === "royal");
    if (!royal) throw new Error(`colony ${this.params.nest} has a queen but no royal chamber`);
    this.#stock(royal, n);
  }

  /** Food into (or, negative, out of) chamber `c`: the larder is the food in the colony's chambers. */
  #stock(c: { food: number }, d: number): void {
    c.food += d;
    this.larder += d;
  }

  /** The chamber (not `from`) that wants food most: its brood's unmet needs, or the queen's stock, less what lies there and what porters are taking there; −1 if none. */
  #wanted(from: number): number {
    const ch = this.map.chambers!;
    this.#portView();
    let to = -1;
    let most = 0;
    for (const [id, w] of this.#want) {
      const d = w - ch.list[id]!.food - (this.#enRouteTo.get(id) ?? 0);
      if (d > most && id !== from) {
        most = d;
        to = id;
      }
    }
    return to;
  }

  /**
   * A porter at cell (cx, cy) not by its target chamber: another of the colony's chambers it is in or beside where it puts
   * its food down instead, or −1. One of the target's role that wants food itself: road signs are by role, so the brood
   * mark leads to the nearest brood chamber, not to the one chosen (a porter circled one 24 columns away that it never
   * reached: seed 2, F1's runs). After HOLD_MAX seconds carrying, any of its chambers, like a nurse with brood; by
   * none then, it takes the food to the royal chamber instead (the nest's heart, where the road signs lead), never
   * down on a tunnel's floor, where a forager would bring it "home" a second time.
   */
  #portInstead(i: number, cx: number, cy: number, target: number, dt: number): number {
    const ch = this.map.chambers!;
    const role = ch.list[target]!.role;
    const late = (this.#holdT[i] = (this.#holdT[i] as number) + dt) > HOLD_MAX;
    for (let d = -1; d < 6; d++) {
      const id = d < 0 ? ch.at(cx, cy) : ch.at(stepX(cx, cy, d), stepY(cy, d));
      if (id < 0 || id === target) continue;
      const c = ch.list[id]!;
      if (c.colony !== this.params.nest) continue;
      if (late) return id;
      if (c.role === role) {
        this.#portView();
        if ((this.#want.get(id) ?? 0) - c.food - (this.#enRouteTo.get(id) ?? 0) > 0) return id;
      }
    }
    if (late && role !== "royal") {
      const royal = ch.list.find((c) => c.colony === this.params.nest && c.role === "royal");
      if (royal) {
        this.#enRouteTo.set(target, (this.#enRouteTo.get(target) ?? 1) - 1);
        this.#enRouteTo.set(royal.id, (this.#enRouteTo.get(royal.id) ?? 0) + 1);
        this.#portTo[i] = royal.id;
        this.#holdT[i] = 0;
        this.#homeAfresh(i);
        this.gx[i] = NO_CELL;
      }
    }
    return -1;
  }

  /** Ant i, carrying food at home, carries it on to chamber `to` as a porter (its food is the colony's, in its jaws). */
  #becomePorter(i: number, to: number): void {
    this.#inJaws += 1;
    this.carrying[i] = 1;
    this.#porter[i] = 1;
    this.#portTo[i] = to;
    this.#holdT[i] = 0;
    this.#enRouteTo.set(to, (this.#enRouteTo.get(to) ?? 0) + 1);
    this.mode[i] = RETURN;
    this.#homeAfresh(i);
    this.gx[i] = NO_CELL;
  }

  /**
   * Food flow inside the nest (slice 5): a carrier in the chamber it takes its food to puts it down there; an idle ant
   * in reception with food there takes some to the chamber that wants it most (brood, or the queen's stock), else down
   * to a store; an idle ant in a store, or in the royal chamber with more than the queen's stock, takes some to where it
   * is wanted. A forager arriving at reception with food already waiting there (the porters aren't keeping up) carries
   * its own on to where it is wanted.
   */
  #port(i: number, dt: number, enemy = false): boolean {
    const ch = this.map.chambers!;
    this.antCell(i);
    const cx = CELL[0] as number;
    const cy = CELL[1] as number;
    let here = ch.at(cx, cy);
    if (this.carrying[i]) {
      const target = this.#foodTo(i);
      if (target < 0) return false; // no chamber to take it to (a colony always has its royal one: can't happen)
      // In its chamber, or beside it (a store a cell or two wide is passed by more often than stood in: review of slice 5).
      if (here !== target) {
        here = -1;
        // (Porters only: a forager put down beside its chamber is an explorer in a tunnel, and dug at its ends.)
        if (this.#porter[i]) {
          for (let d = 0; d < 6 && here < 0; d++) if (ch.at(stepX(cx, cy, d), stepY(cy, d)) === target) here = target;
          if (here < 0) here = this.#portInstead(i, cx, cy, target, dt);
        }
        if (here < 0) return false;
      }
      const c = ch.list[here]!;
      if (!this.#porter[i] && c.role === "reception" && c.food >= 1) {
        // Food waiting here already: the porters aren't keeping up. The forager carries its own on (a seed harvester's
        // foragers drop seeds in the top chambers; with a backlog there, a larva starved below while food piled up).
        const to = this.#wanted(here);
        if (to >= 0) {
          this.stored++;
          this.handedOn++;
          this.#becomePorter(i, to);
          return false;
        }
      }
      if (!this.responses.drop(this.touch(i, enemy, this.mode[i] as number, "food"))) return false;
      this.carrying[i] = 0;
      this.#stock(c, 1);
      if (this.#porter[i]) ((this.portTrips++), (this.#inJaws -= 1));
      else this.stored++;
      this.#portTo[i] = -1;
      this.#porter[i] = 0;
      this.mode[i] = EXPLORE;
      this.#asked[i] = -1;
      this.#question[i] = -1;
      this.since[i] = 0;
      return true; // put down: it turns back (the tick turns it: its heading is written after)
    }
    if (this.mode[i] !== EXPLORE || this.pellet[i] || this.#holdsBrood[i] || this.band(i) === 2 || isSky(this.map, cx, cy) || this.#rng() > PORT_RATE * dt) return false;
    // Food it can reach: in the reception or store it stands in, or one within two cells (a chamber a cell wide is
    // passed by more often than stood in); in the royal chamber, what is beyond the queen's stock (food a forager brought
    // there, with no reception of RECEPTION_MIN cells yet).
    const stocked = (id: number) => {
      const k = id >= 0 ? ch.list[id]! : undefined;
      return k !== undefined && k.colony === this.params.nest && (((k.role === "reception" || k.role === "store") && k.food >= 1) || (k.role === "royal" && k.food >= QUEEN_STOCK + 1));
    };
    if (!stocked(here)) {
      here = -1;
      const o = discOffsets(2)[cy & 1] as Int16Array;
      for (let k = 2; k < o.length && here < 0; k += 2) {
        const id = ch.at(cx + (o[k] as number), cy + (o[k + 1] as number));
        if (stocked(id)) here = id;
      }
      if (here < 0) return false;
    }
    const c = ch.list[here]!;
    // Where food is wanted: each chamber's brood's unmet needs (and the queen's next eggs), less what lies there and
    // what porters are already taking there (worked out once a tick).
    let to = this.#wanted(here);
    // Nothing wanted: reception's food (and the royal chamber's beyond her stock) goes down to a store (the least
    // stocked, counting what porters are already taking there), as harvesters keep their seeds deep. Counted by what
    // lay there alone, a store nobody reached stayed least stocked and drew every porter: 41 at once held food over
    // 120 s, all for one single-cell store (F1's runs, PRD §40).
    if (to < 0 && c.role !== "store") {
      this.#portView();
      let least = Infinity;
      for (const s of ch.list) {
        if (s.colony !== this.params.nest || s.role !== "store" || s.cells === 0) continue;
        const stock = s.food + (this.#enRouteTo.get(s.id) ?? 0);
        if (stock < least) {
          least = stock;
          to = s.id;
        }
      }
    }
    if (to < 0 || to === here) return false;
    this.#stock(c, -1);
    this.#becomePorter(i, to);
    return false;
  }

  /**
   * A nurse (nest slice 4): an idle ant in its royal chamber picks up an egg lying near it and takes it to the brood
   * chamber with the least brood; there, it lays it down. Its brood goes where it goes.
   */
  #nurse(i: number, dt: number, enemy: boolean): void {
    const ch = this.map.chambers!;
    this.antCell(i);
    const cx = CELL[0] as number;
    const cy = CELL[1] as number;
    if (this.#holdsBrood[i]) {
      for (const b of this.brood.items)
        if (b.held === i) {
          b.x = cx;
          b.y = cy;
        }
      // In its chamber, or beside it (a chamber a cell or two wide can be passed by), it puts the brood down there;
      // holding it too long (lost round a ring of tunnels: review of slice 4), wherever it is (a held larva goes unfed).
      const to = this.#broodTo[i] as number;
      if (ch.at(cx, cy) === to) this.#dropBrood(i);
      else {
        for (let d = 0; d < 6; d++) {
          const ax = stepX(cx, cy, d);
          const ay = stepY(cy, d);
          if (ch.at(ax, ay) === to) {
            this.#dropBrood(i, ax, ay);
            return;
          }
        }
        if ((this.#holdT[i] = (this.#holdT[i] as number) + dt) > HOLD_MAX) this.#dropBrood(i);
      }
      return;
    }
    // Zoned by age (slice 6): the young nurse; the middle-aged also take in stray brood; the old forage.
    if (this.mode[i] !== EXPLORE || this.carrying[i] || this.pellet[i] || this.band(i) === 2 || isSky(this.map, cx, cy) || this.#rng() > PICK_BROOD * dt) return;
    const inRoyal = this.#placeAt(cx, cy) === "royal" && this.band(i) === 0;
    let to = -1;
    let least = Infinity;
    let royal = -1;
    for (const c of ch.list) {
      if (c.colony !== this.params.nest || c.cells === 0) continue;
      if (c.role === "brood" && c.brood < least) ((least = c.brood), (to = c.id));
      if (c.role === "royal") royal = c.id;
    }
    // Eggs by the queen go to a brood chamber (with none yet, brood stays with her); brood lying outside any chamber
    // (a nurse put it down on the way, or died carrying it: unfed there) is taken in from anywhere, to the queen if
    // there is no brood chamber (review of slice 5: stray larvae starved for good).
    for (const b of this.brood.items)
      if (b.held < 0 && hexDistance(b.x, b.y, cx, cy) <= 2 && ((inRoyal && b.stage === EGG && to >= 0) || b.chamber < 0)) {
        if (to < 0) to = royal;
        if (to < 0) return;
        if (!this.responses.get(this.touch(i, enemy, this.mode[i] as number, "none", "brood"))) return;
        b.held = i;
        if (b.chamber >= 0) ch.list[b.chamber]!.brood--;
        b.chamber = -1;
        this.#holdsBrood[i] = 1;
        this.#broodTo[i] = to;
        this.#holdT[i] = 0;
        this.#homeAfresh(i);
        this.gx[i] = NO_CELL;
        return;
      }
  }

  /**
   * An undertaker (slice 7): an idle middle-aged ant underground with a corpse lying within two cells picks it up and
   * carries it out like spoil, up the shaft and along the ground, to the midden. `calm`: no enemy is near it.
   */
  #undertake(i: number, dt: number, calm: boolean): void {
    if (this.corpses.length === 0 || this.carrying[i] || this.pellet[i] || this.#holdsBrood[i]) return;
    const mode = this.mode[i] as number;
    // A raiding colony's middle-aged are all fighters (raid stance): one with no enemy near, still in its own nest, buries
    // its dead too (review of #26: a raiding colony buried nothing, and its dead lay in its own chambers).
    if (mode !== EXPLORE && mode !== FOLLOW && !(mode === FIGHT && calm && this.#under[i] && this.band(i) === 1)) return;
    if (this.#rng() > PICK_CORPSE * dt) return;
    this.antCell(i);
    const cx = CELL[0] as number;
    const cy = CELL[1] as number;
    // Inside, the middle-aged do it; on the ground near the hole (fights fall there too), whoever is out.
    const outside = isSky(this.map, cx, cy);
    if (outside ? Math.abs(cx - this.#entranceCol) > MIDDEN_NEAR : this.band(i) !== 1 || (mode === FIGHT && !this.#inOwnNest(cx, cy))) return;
    for (const k of this.corpses)
      if (k.held < 0 && hexDistance(k.x, k.y, cx, cy) <= 2) {
        if (!this.responses.get(this.touch(i, !calm, mode, "none", "corpse"))) return;
        k.held = i;
        this.#clearPellet(i);
        this.#corpse[i] = 1;
        this.pellet[i] = 1;
        if (outside) {
          // Already out: straight along the ground to the midden (it won't come up out of the hole, where that is set).
          // From past the midden, back toward it: carried out from there, it was put down at once where it lay, off the
          // midden, and picked up again (review of #26: one corpse nine times).
          const side = this.#middenSide();
          const past = side * (cx - this.#entranceCol) > this.#middenAt();
          this.#spoilTo[i] = past ? -this.#middenAt() : this.#middenAt();
          this.#spoilSide[i] = past ? -side : side;
          this.#spoilT[i] = 0;
        }
        this.mode[i] = RETURN;
        this.#homeAfresh(i);
        this.gx[i] = NO_CELL;
        return;
      }
  }

  /** The midden keeps smelling of the colony while corpses lie on it (a tenth of MIDDEN_MARK a second each, up to 20 counted). */
  #middenSmell(dt: number): void {
    for (let k = this.corpses.length - 1; k >= 0; k--) {
      const c = this.corpses[k]!;
      if (c.held < 0 && this.time - c.died > CORPSE_ROT) this.corpses.splice(k, 1); // off the midden, it rots (the buried are counted in `midden`)
    }
    for (const k of this.corpses)
      if (k.held >= 0) {
        // Carried: it goes where its undertaker goes.
        this.antCell(k.held);
        k.x = CELL[0] as number;
        k.y = CELL[1] as number;
      }
    let left = 20;
    for (const [key, count] of this.midden) {
      if (left <= 0) break;
      const n = Math.min(left, count);
      left -= n;
      this.#markMidden(key % 65536, MIDDEN_MARK * dt * 0.1 * n);
    }
  }

  /** Lay `amount` of midden mark on the ground at column `col`, and tapering over MIDDEN_SPREAD columns either side. */
  #markMidden(col: number, amount: number): void {
    for (let dx = -MIDDEN_SPREAD; dx <= MIDDEN_SPREAD; dx++) {
      const x = col + dx;
      if (x < 0 || x >= this.map.size.w) continue;
      this.ph.depositCell("midden", x, groundTop(this.map, x) - 1, (amount * (MIDDEN_SPREAD + 1 - Math.abs(dx))) / (MIDDEN_SPREAD + 1));
    }
  }

  /** Ant i puts down the brood it holds where it stands (in the chamber it was taking it to, or wherever it died). */
  #dropBrood(i: number, atX = NaN, atY = NaN): void {
    const ch = this.map.chambers;
    this.antCell(i);
    const cx = Number.isNaN(atX) ? (CELL[0] as number) : atX;
    const cy = Number.isNaN(atY) ? (CELL[1] as number) : atY;
    for (const b of this.brood.items)
      if (b.held === i) {
        b.held = -1;
        b.x = cx;
        b.y = cy;
        b.chamber = ch ? ch.at(cx, cy) : -1;
        if (b.chamber >= 0) ch!.list[b.chamber]!.brood++;
      }
    this.#holdsBrood[i] = 0;
    this.#broodTo[i] = -1;
    this.#holdT[i] = 0;
    this.mode[i] = EXPLORE;
    this.#asked[i] = -1;
    this.#question[i] = -1;
  }

  /**
   * The colony's life cycle, once a tick (the side view): workers age and die; the queen, alive, lays an egg every
   * LAY_INTERVAL while food is in the larder and there is room for more workers; eggs hatch into larvae, nurses near a
   * larva feed it from the larder, a fed larva pupates, and a pupa becomes a worker where it lies.
   */
  #nestLife(dt: number): void {
    const ch = this.map.chambers!;
    const p = this.params;
    for (let i = 0; i < this.n; i++) {
      if (!this.alive[i]) continue;
      if ((this.age[i] = (this.age[i] as number) + dt) > (this.lifespan[i] as number)) {
        this.kill(i, false);
        this.diedOld++;
      }
    }
    const q = this.queen!;
    if (q.alive) {
      cellOf(q.x, q.y);
      const qx = CELL[0] as number;
      const qy = CELL[1] as number;
      // Her pheromone: the royal mark, strongest where she lies, drawing nurses to her.
      // × her signal: the fungus in her can damp it (its queen-signal lever, ja-lo8.7; 1 as she is).
      this.ph.depositCell("royal", qx, qy, QUEEN_MARK * q.signal * dt);
      // Strangers at her side kill her (a raid that reaches the royal chamber).
      const g = this.enemies;
      if (g) {
        g.look?.(this.nestOdour, p.tolerance);
        let strangers = 0;
        const o = discOffsets(1)[qy & 1] as Int16Array;
        for (let k = 0; k < o.length; k += 2) strangers += g.get(qx + (o[k] as number), qy + (o[k + 1] as number));
        if (strangers >= ENEMY && this.#rng() < 1 - Math.exp(-QUEEN_FIGHT * strangers * dt)) q.alive = false;
      }
    }
    // The fungus's crown (nest slice 8, lethal): a host running it kills the queen and the brood it touches, each at
    // CROWN_RATE × its regicide (its load) a second: the spores it passes on as it tends them (at once, spores painted
    // on the royal chamber orphaned the colony in its first second; from a high load only, grooming kept every host
    // below it within seconds and no queen ever died: review of #27).
    for (let i = 0; i < this.n; i++) {
      const r = this.regicide[i] as number;
      if (!this.alive[i] || r <= 0 || !this.#under[i]) continue; // the queen and brood are underground
      const crown = 1 - Math.exp(-CROWN_RATE * r * dt);
      this.antCell(i);
      const hx = CELL[0] as number;
      const hy = CELL[1] as number;
      if (q.alive) {
        cellOf(q.x, q.y);
        if (hexDistance(hx, hy, CELL[0] as number, CELL[1] as number) <= 1 && this.#rng() < crown) q.alive = false;
      }
      for (let k = this.brood.items.length - 1; k >= 0; k--) {
        const b = this.brood.items[k] as BroodItem;
        if (b.held < 0 && hexDistance(hx, hy, b.x, b.y) <= 1 && this.#rng() < crown) {
          if (b.chamber >= 0) ch.list[b.chamber]!.brood--;
          this.brood.items.splice(k, 1);
          this.broodKilled++;
        }
      }
    }
    if (q.alive) {
      cellOf(q.x, q.y);
      const qx = CELL[0] as number;
      const qy = CELL[1] as number;
      this.#layT += dt;
      // She lays only while the larder holds, beyond what the brood already laid will be fed, a whole worker's food:
      // eggs laid into an empty larder starve as larvae.
      let due = this.brood.owed();
      while (q.alive && this.#layT >= LAY_INTERVAL) {
        this.#layT -= LAY_INTERVAL;
        const royalC = ch.list[ch.at(qx, qy)];
        if (this.larder + this.#inJaws < due + EGG_FOOD + LARVA_FOOD || this.population + this.brood.size >= p.maxAnts || !royalC || royalC.food < EGG_FOOD) {
          this.#layT = 0;
          break;
        }
        this.#stock(royalC, -EGG_FOOD); // she eats from what lies in her chamber
        due += LARVA_FOOD;
        const at = ch.at(qx, qy);
        this.brood.add(qx, qy, at);
        if (at >= 0) ch.list[at]!.brood++;
      }
    }
    for (let k = this.brood.items.length - 1; k >= 0; k--) {
      const b = this.brood.items[k] as BroodItem;
      b.t += dt;
      if (b.stage === EGG && b.t >= T_EGG) {
        b.stage = LARVA;
        b.t = 0;
      } else if (b.stage === LARVA) {
        const pantry = b.chamber >= 0 ? ch.list[b.chamber] : undefined;
        if (b.held < 0 && b.fed < LARVA_FOOD && pantry && pantry.food > 0) {
          // Fed by the nurses round it (the colony's own ants within two cells), from the food lying in its chamber.
          const nurses = this.friends ? this.#around(this.friends, b.x, b.y) : 2;
          const take = Math.min(pantry.food, LARVA_FOOD - b.fed, FEED_RATE * Math.min(1, nurses / 2) * dt);
          b.fed += take;
          this.#stock(pantry, -take);
        }
        if (isFed(b) && b.t >= T_LARVA) {
          b.stage = PUPA;
          b.t = 0;
        }
      } else if (b.stage === PUPA && b.t >= T_PUPA && b.held < 0 && this.spawn(centreX(b.x, b.y), centreY(b.y))) {
        if (b.chamber >= 0) ch.list[b.chamber]!.brood--;
        this.brood.items.splice(k, 1);
      }
    }
  }

  /** Ants on a count grid within two cells of (x, y). */
  #around(g: CellCounts, x: number, y: number): number {
    let s = 0;
    const o = discOffsets(2)[y & 1] as Int16Array;
    for (let k = 0; k < o.length; k += 2) s += g.get(x + (o[k] as number), y + (o[k + 1] as number));
    return s;
  }

  /** The role a new chamber with its floor on row y takes (its column plays no part): the colony's first one well above the royal chamber is reception; below it, store; else brood. */
  #roleFor(y: number): Role {
    const ch = this.map.chambers!;
    const mine = ch.list.filter((c) => c.colony === this.params.nest && c.cells > 0);
    const royal = mine.find((c) => c.role === "royal");
    if (!royal) return "brood";
    if (y < royal.floorRow - RECEPTION_ABOVE && !mine.some((c) => c.role === "reception")) return "reception";
    if (y > royal.floorRow + STORE_BELOW) return "store";
    return "brood";
  }

  /**
   * Whether the nest is crowded (the side view, nest slice 2): fewer floor cells in the colony's chambers than
   * FLOOR_PER_ANT for each ant underground. A crowded nest digs (chambers first); a roomy one barely digs at all
   * (Odontomachus keeps ~2 cm² of floor per worker whatever its size; Rasse & Deneubourg's digging that stops with room).
   * The top-down maps have no chambers: always as before.
   */
  crowded(): boolean {
    const ch = this.map.chambers;
    if (!ch || !this.#entrance) return true;
    return this.inNest * FLOOR_PER_ANT > (ch.floorOf[this.params.nest] ?? 0);
  }

  /**
   * An explorer touching a wall of its own colony's chamber, the nest crowded: the wall cell (a neighbour of (cx, cy),
   * the way `prefer` first) that widens the chamber along its floor (within CHAMBER_HEIGHT rows of it), or −1.
   */
  #widenWay(cx: number, cy: number, prefer: number): number {
    const ch = this.map.chambers;
    if (!ch) return -1;
    const id = ch.at(cx, cy);
    if (id < 0) return -1;
    const c = ch.list[id]!;
    if (c.colony !== this.params.nest) return -1;
    // Chambers near the top are widened most (traffic: every forager passes them), so the nest is top-heavy (Tschinkel).
    if (this.#rng() > Math.exp(-Math.max(0, c.floorRow - this.#soilTop(cx)) / WIDEN_DEPTH)) return -1;
    for (let k = 0; k < 6; k++) {
      const d = (prefer + (k & 1 ? (k + 1) >> 1 : -(k >> 1)) + 6) % 6; // the preferred way, then alternately either side of it
      if (this.#chamberFace(stepX(cx, cy, d), stepY(cy, d), c)) return d;
    }
    return -1;
  }

  /**
   * Whether soil cell (x, y) is a face an explorer may dig for chamber `c` (null: a new chamber): soil, not the mound's
   * loose soil nor the crust, not put back lately (refilled: dug at, it glances off), and a place a chamber cell may be (#chamberSpot).
   */
  #chamberFace(x: number, y: number, c: Chamber | null): boolean {
    return rockAt(this.map, x, y) === SOIL && this.map.loose?.get(x, y) !== 1 && !this.#crust(x, y) && !refilled(this.map, x, y, this.time) && this.#chamberSpot(c, x, y);
  }

  /**
   * Whether cell (x, y) may be part of chamber `c` (null: a new one there): within its rows (CHAMBER_HEIGHT up from its
   * floor), at least CHAMBER_MIN_DEPTH below the ground (as dug, not the mound heaped on it: #soilTop), and touching no
   * other chamber. Widening once checked only the rows, from the mound's top: a chamber widened to 4 rows under the ground
   * beside the shaft (review of slice 2), where one started 5 rows down had trapped the pellet carriers.
   */
  #chamberSpot(c: Chamber | null, x: number, y: number): boolean {
    if (c && (y > c.floorRow || y <= c.floorRow - CHAMBER_HEIGHT)) return false;
    if (y - this.#soilTop(x) < CHAMBER_MIN_DEPTH) return false;
    return !this.#joinsChamber(x, y, c ? c.id : -1);
  }

  /** The side view: the ground's top in column x as dug, under any mound heaped on it (the first row that is neither sky nor loose soil). */
  #soilTop(x: number): number {
    let y = groundTop(this.map, x);
    const loose = this.map.loose;
    if (loose) while (y < this.map.size.h && loose.get(x, y) === 1) y++;
    return y;
  }

  /**
   * An explorer in a tunnel of the side view's nest, crowded: start a new chamber sideways off it, here? Likelier near
   * the top (exp(−depth / CHAMBER_DEPTH)), and only CHAMBER_GAP + depth × CHAMBER_GAP_GROWTH rows from the colony's
   * nearest chamber round it, so they come out top-heavy with the gaps growing with depth (Tschinkel). The way, or −1.
   */
  #newChamberWay(cx: number, cy: number): number {
    const ch = this.map.chambers;
    if (!ch || isSky(this.map, cx, cy) || ch.at(cx, cy) >= 0) return -1;
    const depth = cy - this.#soilTop(cx);
    if (depth < CHAMBER_MIN_DEPTH || this.#rng() > NEW_CHAMBER * Math.exp(-depth / CHAMBER_DEPTH)) return -1;
    if (!this.#chamberRoom(cx, cy, depth)) return -1;
    const first = this.#rng() < 0.5 ? 0 : 3; // east or west, along the row
    for (const d of [first, 3 - first]) if (this.#chamberFace(stepX(cx, cy, d), stepY(cy, d), null)) return d;
    return -1;
  }

  /**
   * Whether digging soil cell (x, y) open for chamber `own` (−1: a new one) would join it to another chamber, this
   * colony's or another's. The tunnel rules' spacing check (startable) is bypassed for chamber faces; opening onto a
   * tunnel is fine (a junction), but two chambers dug into one another lose their roles and their floors run together.
   */
  #joinsChamber(x: number, y: number, own: number): boolean {
    const ch = this.map.chambers!;
    for (let d = 0; d < 6; d++) {
      const id = ch.at(stepX(x, y, d), stepY(y, d));
      if (id >= 0 && id !== own) return true;
    }
    return false;
  }

  /** Whether a new chamber may start at row cy near column cx: no chamber (of any colony) within the gap for that depth. */
  #chamberRoom(cx: number, cy: number, depth: number): boolean {
    const ch = this.map.chambers!;
    const gap = CHAMBER_GAP + depth * CHAMBER_GAP_GROWTH;
    for (const c of ch.list) {
      if (c.cells === 0) continue; // any colony's: a chamber is not started inside or against another nest's
      if (Math.abs(c.floorRow - cy) < gap && cx >= c.x0 - CHAMBER_SPREAD && cx <= c.x1 + CHAMBER_SPREAD) return false;
    }
    return true;
  }

  /**
   * Whether an ant at cell (cx, cy) may dig from there: underground, yes; on the ground line (side view), no: the
   * hole is the way in (and every face there is crust: see #crust), or explorers would pock the ground with holes.
   */
  #mayDig(cx: number, cy: number): boolean {
    return !this.#entrance || !isSky(this.map, cx, cy);
  }

  /**
   * The side view: whether soil cell (x, y) is the ground line's crust (it touches the sky). Ants leave it: digging
   * it would undermine the walkway or hole the ground everywhere; the hole they keep is their entrance. Loose soil
   * (the mound) is no crust.
   */
  #crust(x: number, y: number): boolean {
    const ent = this.#entrance;
    if (!ent) return false;
    if (this.map.loose?.get(x, y) === 1) return false; // the mound: loose pellets, never dug (picked up off its top: #pickLoose)
    // Round the hole too: it is their way in already, and digging round it once hollowed the ground under the walkway
    // above the hole, which fell to sky and left the hole with no way out onto the ground.
    for (let d = 0; d < 6; d++) {
      const tx = stepX(x, y, d);
      const ty = stepY(y, d);
      // The ground under the mound is crust too: dug out under a blanket of spoil, the next pellet picked off the
      // top opened a new hole into the tunnels, away from every entrance (agent review of MR 15).
      if (isSky(this.map, tx, ty) || this.map.loose?.get(tx, ty) === 1) return true;
    }
    return false;
  }

  /**
   * The side view: an ant whose cell has become solid (spoil heaped on it, or round it by the other colony) climbs
   * out to an open neighbour, upward first; one left in the sky (the spoil under it picked up) drops to the ground. Six heaps round an ant, three a second by the hole, could otherwise
   * wall it in for good (agent review of MR 14: ants buried for the rest of the run).
   */
  #unbury(i: number): void {
    this.antCell(i);
    const cx = CELL[0] as number;
    const cy = CELL[1] as number;
    if (rockAt(this.map, cx, cy) === OPEN) return;
    for (const d of [4, 5, 3, 0, 2, 1]) {
      const tx = stepX(cx, cy, d);
      const ty = stepY(cy, d);
      if (rockAt(this.map, tx, ty) !== OPEN) continue;
      this.x[i] = centreX(tx, ty);
      this.y[i] = centreY(ty);
      this.gx[i] = NO_CELL;
      this.digT[i] = 0;
      return;
    }
    // Buried deeper (several heaps in one tick), or left in the air (the mound taken from under it): up or down its
    // column to the ground line.
    const top = groundTop(this.map, cx) - 1;
    if (top >= 0 && top !== cy && rockAt(this.map, cx, top) === OPEN) {
      this.x[i] = centreX(cx, top);
      this.y[i] = centreY(top);
      this.gx[i] = NO_CELL;
      this.digT[i] = 0;
    }
  }

  /** Whether ant i is in a cell it hasn't looked round yet this trip (leaves its cell in CELL; the cell it looked from before goes in #cameFrom). */
  #enteredCell(i: number): boolean {
    this.antCell(i);
    const packed = (CELL[1] as number) * 65536 + (CELL[0] as number);
    if (this.#looked[i] === packed) return false;
    this.#cameFrom[i] = this.#looked[i] as number;
    this.#looked[i] = packed;
    return true;
  }

  /** Whether cell (x, y) is within a nest's radius + 2 (any colony's: a rival's chamber is no dead end to fill either). */
  #byANest(x: number, y: number): boolean {
    if ((this.map.chambers?.at(x, y) ?? -1) >= 0) return true; // a chamber is never filled
    for (const n of this.map.nests ?? [this.nest]) if (Math.hypot(centreX(x, y) - n.x, centreY(y) - n.y) < n.r + 2) return true;
    return false;
  }

  /**
   * The side view: the way from cell (cx, cy) to an open neighbour nearer the hole (along the ground: by
   * column, then straight-line distance; else by straight-line distance), or −1 if none is nearer.
   */
  #towardHole(cx: number, cy: number, alongGround: boolean, below = NaN, hy = (this.#entrance as Nest).y): number {
    let best = -1;
    let bestD = (Number.isNaN(below) ? this.#holeMetric(cx, cy, alongGround, hy) : below) - 1e-6;
    for (let d = 0; d < 6; d++) {
      const tx = stepX(cx, cy, d);
      const ty = stepY(cy, d);
      if (rockAt(this.map, tx, ty) !== OPEN) continue;
      // Along the ground, off it only into the hole it heads for: in at another (the rival's, nearer by column on the way
      // past), a carrier was trapped in that shaft (review of #15).
      if (alongGround && !isSky(this.map, tx, ty) && !this.#targetHole(tx, ty, hy)) continue;
      const m = this.#holeMetric(tx, ty, alongGround, hy);
      if (m < bestD) {
        bestD = m;
        best = d;
      }
    }
    return best;
  }

  /** Steps a hand-on-wall walk (`side`) from (cx, cy), facing `dir`, takes on the side view's ground to a cell nearer the hole than `min` (Infinity if not within GROUND_LOOK). */
  #groundLook(cx: number, cy: number, dir: number, side: number, min: number): number {
    let x = cx;
    let y = cy;
    let d = dir;
    for (let k = 1; k <= GROUND_LOOK; k++) {
      d = this.#groundHand(x, y, d, side);
      x = stepX(x, y, d);
      y = stepY(y, d);
      if (rockAt(this.map, x, y) !== OPEN || !isSky(this.map, x, y)) return Infinity;
      if (this.#holeMetric(x, y) < min - 1e-6) return k;
    }
    return Infinity;
  }

  /** The distance to the hole (#holeX, row y `hy`) from cell (cx, cy) that #towardHole steps by: along the ground, by column first, then straight-line distance; else straight-line distance. */
  #holeMetric(cx: number, cy: number, alongGround = true, hy = (this.#entrance as Nest).y): number {
    const x = centreX(cx, cy);
    return (alongGround ? Math.abs(x - this.#holeX) * 1000 : 0) + Math.hypot(x - this.#holeX, centreY(cy) - hy);
  }

  /** Whether cell (x, y) is the hole being headed for (#holeX, row y `hy`): the one cell off the ground line a walk along it may take. */
  #targetHole(x: number, y: number, hy: number): boolean {
    return Math.abs(centreX(x, y) - this.#holeX) < 0.5 && Math.abs(centreY(y) - hy) < 0.5;
  }

  /** handOnWall on the ground line: over the walkway (sky cells) and into the hole it heads for, never into another (see #towardHole). */
  #groundHand(cx: number, cy: number, dir: number, side: number): number {
    const hy = (this.#entrance as Nest).y;
    const ok = (d: number) => {
      const k = ((d % 6) + 6) % 6;
      const tx = stepX(cx, cy, k);
      const ty = stepY(cy, k);
      return rockAt(this.map, tx, ty) === OPEN && (isSky(this.map, tx, ty) || this.#targetHole(tx, ty, hy));
    };
    const lost = ok(dir + side) && ok(dir + 2 * side);
    for (const turn of lost ? [0, -side, -2 * side, side, 2 * side, 3] : [side, 0, -side, -2 * side, 2 * side, 3]) {
      const d = (((dir + turn) % 6) + 6) % 6;
      if (ok(d)) return d;
    }
    return dir;
  }

  /** The side view: the way from cell (cx, cy) to an open neighbour farther from the hole on `side`, on the ground if it can, or −1. */
  #awayFromHole(cx: number, cy: number, side: number): number {
    const ex = (this.#entrance as Nest).x;
    let best = -1;
    let bestV = side * (centreX(cx, cy) - ex) + 1e-6;
    for (let d = 0; d < 6; d++) {
      const tx = stepX(cx, cy, d);
      const ty = stepY(cy, d);
      if (rockAt(this.map, tx, ty) !== OPEN) continue;
      const v = side * (centreX(tx, ty) - ex) + (isSky(this.map, tx, ty) ? 0.25 : 0); // up out of the hole onto the ground first
      if (v > bestV) {
        bestV = v;
        best = d;
      }
    }
    return best;
  }

  /**
   * The side view: drop ant i's pellet on the ground where it stands, in column `col`: heaped there and slid
   * downhill to the angle of repose. A dug pellet is the soil brought out (soilOut), every whole cell of it
   * (× SWELL) heaped; a loose one, moved, is one cell back on the mound.
   */
  #dropOut(i: number, col: number): void {
    const { map, ph } = this;
    if (this.#corpse[i]) {
      // On the midden: the corpse lies on the ground there, and the midden smells of the colony (a boundary: see raids).
      // A carrier that gave up short of it (SPOIL_GIVE_UP) leaves the corpse lying, unmarked, for another to take on.
      const row = groundTop(map, col) - 1;
      const onMidden = Math.abs(col - this.#middenCol()) <= 3;
      for (let n = this.corpses.length - 1; n >= 0; n--) {
        const k = this.corpses[n] as Corpse;
        if (k.held !== i) continue;
        k.held = -1;
        k.x = col;
        k.y = row;
        if (onMidden) {
          this.corpses.splice(n, 1);
          const key = row * 65536 + col;
          this.midden.set(key, (this.midden.get(key) ?? 0) + 1);
          this.#markMidden(col, MIDDEN_MARK);
          this.buried++;
          this.onBury?.(k);
        }
      }
      this.#clearPellet(i);
      return;
    }
    const side = (this.#spoilSide[i] || 1) as -1 | 1;
    const heap = (): void => {
      const cell = heapMound(map, this.#entranceCol, side, 0, this.#holes, col) ?? heapMound(map, this.#entranceCol, side === 1 ? -1 : 1, 0, this.#holes, col);
      if (!cell) {
        this.moundLost++;
        return;
      }
      // The trail lying on the walkway cell just buried rides up onto the new one above it, so heaps don't cut trails.
      for (const ch of ["food", "home"] as const) {
        const v = ph.fields[ch].get(cell[0], cell[1]);
        const above = ph.fields[ch].get(cell[0], cell[1] - 1);
        if (v > above) ph.depositCell(ch, cell[0], cell[1] - 1, v - above);
      }
    };
    if (this.#soil[i] !== SOIL_DUG) {
      this.looseDropped++;
      heap();
    } else {
      this.soilOut++;
      const due = Math.floor(this.soilOut * SWELL + 1e-9); // counted, not summed: 1.2 added five times isn't 6 in floats
      while (this.#heaped < due) {
        this.#heaped++;
        heap();
      }
    }
    this.#clearPellet(i);
    this.since[i] = 0;
  }

  /**
   * Ant i puts its load down where it stands (its carry response said so). Food lies on the ground for anyone to take
   * (a porter's only in one of its chambers, where it is stocked: it was counted home already, and on the floor a
   * forager would bring it home twice); soil and corpses only on the ground (soil heaps there, a corpse lies there, or
   * goes on the midden if that is where it is; underground the walls have no room for them); brood where it is.
   * What it can't put down here it keeps.
   */
  #putDown(i: number): void {
    this.antCell(i);
    const cx = CELL[0] as number;
    const cy = CELL[1] as number;
    if (this.carrying[i]) {
      if (this.#porter[i]) {
        const here = this.map.chambers ? this.map.chambers.at(cx, cy) : -1;
        const c = here >= 0 ? this.map.chambers!.list[here]! : null;
        if (!c || c.colony !== this.params.nest) return;
        this.#stock(c, 1);
        this.portTrips++;
        this.#inJaws -= 1;
        this.#porter[i] = 0;
        this.#portTo[i] = -1;
      } else {
        dropFood(this.map, this.x[i] as number, this.y[i] as number, 1, this.quality[i] as number);
        this.#putAt[i] = cy * 65536 + cx;
      }
      this.carrying[i] = 0;
    } else if (this.pellet[i]) {
      if (!this.#entrance) {
        // Top-down: a pellet is only a count: put down at the nest it is soil out (as the nest branch counts it), elsewhere lost.
        const dx = (this.x[i] as number) - this.nest.x;
        const dy = (this.y[i] as number) - this.nest.y;
        if (dx * dx + dy * dy < this.nest.r * this.nest.r) this.soilOut++;
        else this.soilLost++;
        this.#clearPellet(i);
      } else if (isSky(this.map, cx, cy)) this.#dropOut(i, cx);
      else return;
    } else if (this.#holdsBrood[i]) this.#dropBrood(i);
    this.mx[i] = NaN;
    this.gx[i] = NO_CELL;
  }

  /** Ant i carries no pellet (or corpse) any more: the pellet, what it was, and where it was taking it, all at once. */
  #clearPellet(i: number): void {
    this.pellet[i] = 0;
    this.#soil[i] = SOIL_DUG;
    this.#corpse[i] = 0;
    this.#spoilTo[i] = NaN;
    this.#staleWalk[i] = 0;
  }

  /**
   * The side view: an explorer on the ground beside loose soil now and then picks up a pellet of it (it comes up
   * easily). From a steep flank (LOOSE_SPREAD_PICK a cell) it carries it a little farther out and drops it again, so
   * the mound spreads and smooths itself as ants rework their spoil; from anywhere on it (LOOSE_FILL_PICK) it takes
   * it down into the nest to refill unused space, as leaf-cutting ants refill excess space (Pielström & Roces).
   * True if it picked one up.
   */
  #pickLoose(i: number, cx: number, cy: number, enemy: boolean): boolean {
    const { map } = this;
    if (!map.loose) return false;
    const u = this.#rng();
    if (u >= LOOSE_SPREAD_PICK + LOOSE_FILL_PICK) return false;
    for (let d = 0; d < 6; d++) {
      const tx = stepX(cx, cy, d);
      const ty = stepY(cy, d);
      if (map.loose.get(tx, ty) !== 1 || groundTop(map, tx) !== ty) continue; // only off the top: the mound's surface
      if (this.#byAnEntrance(tx, ty)) continue;
      // Spread from a slope standing at its angle of repose (the next column out a row lower): the steep flanks.
      const out = tx >= this.#entranceCol ? 1 : -1;
      const steep = groundTop(map, tx + out) - ty >= 1;
      const fill = u < LOOSE_FILL_PICK;
      if (!fill && !steep) continue;
      if (!this.responses.get(this.touch(i, enemy, this.mode[i] as number, "none", "soil"))) return false;
      if (!takeLoose(map, tx, ty)) continue;
      this.#takeUpLoose(i, tx, fill);
      return true;
    }
    return false;
  }

  /** Ant i takes up a loose pellet from column `col` (off the mound's top): down to fill, or spreading it farther out. */
  #takeUpLoose(i: number, col: number, fill: boolean): void {
    this.pellet[i] = 1;
    this.#soil[i] = fill ? SOIL_FILL : SOIL_LOOSE;
    this.loosePicked++;
    this.since[i] = 0;
    this.wall[i] = 0;
    this.mx[i] = NaN;
    this.gx[i] = NO_CELL;
    const out = col >= this.#entranceCol ? 1 : -1;
    if (fill) this.looseDown++;
    else {
      this.#spoilSide[i] = out;
      this.#spoilTo[i] = Math.abs(col - this.#entranceCol) + LOOSE_SPREAD * (0.5 + this.#rng());
      this.#spoilT[i] = 0;
    }
  }

  /** The side view: whether cell (x, y) is within ENTRANCE_ZONE of any nest's entrance (a rival's hole is no space to fill either). */
  #byAnEntrance(x: number, y: number): boolean {
    for (const n of this.map.nests ?? [this.nest]) if (n.entrance && Math.hypot(centreX(x, y) - n.entrance.x, centreY(y) - n.entrance.y) < ENTRANCE_ZONE) return true;
    return false;
  }

  /** Whether any of this colony's ants stands in cell (x, y) now. */
  #occupied(x: number, y: number): boolean {
    for (let j = 0; j < this.n; j++) {
      if (!this.alive[j]) continue;
      this.antCell(j);
      if (CELL[0] === x && CELL[1] === y) return true;
    }
    return false;
  }

  /** A wall-follower not round after FOLLOW_GIVE_UP: wander a good while, then try afresh. */
  #giveUp(i: number): void {
    this.wall[i] = 0;
    this.gx[i] = NO_CELL;
    this.mx[i] = NaN;
    this.bumps[i] = 5;
    this.detour[i] = 8 + 16 * this.#rng();
  }

  /** Whether any open neighbour of cell (x, y) holds home scent an ant would notice (FAINT or more). */
  #homeScentNear(x: number, y: number): boolean {
    const home = this.ph.fields.home;
    for (let d = 0; d < 6; d++) {
      const tx = stepX(x, y, d);
      const ty = stepY(y, d);
      if (rockAt(this.map, tx, ty) === OPEN && home.get(tx, ty) >= FAINT) return true;
    }
    return false;
  }

  /** The heading from ant i to the centre of its target cell. */
  #towardTarget(i: number): number {
    return Math.atan2(centreY(this.gy[i] as number) - (this.y[i] as number), centreX(this.gx[i] as number, this.gy[i] as number) - (this.x[i] as number));
  }

  /** Touch: is there rock (or the map's edge) `d` cells from ant i's position along `angle`? */
  #touch(x: number, y: number, angle: number, d: number): boolean {
    return blocked(this.map, x + Math.cos(angle) * d, y + Math.sin(angle) * d);
  }

  /**
   * A rested forager waiting at home with empty jaws: does it go out this step (behaviour MR 5, docs/activation.md)? Its
   * `leave` response says how soon, from the returns it has felt; "wait" still lets a scout go at `scoutRate`.
   */
  #leaves(i: number, dt: number, enemy: boolean): boolean {
    const scout = this.params.scoutRate;
    const mode = RETURN;
    // On a raid stance, where the colony recruits by trail, every ant at home is a raider to be: asked in mode fight, so its
    // answer rests on the raid trail and not on food returns (review of #41).
    const asked = this.params.raidGate > 0 && this.#entrance === null && this.#stanceOf(i) === "raid" ? FIGHT : mode;
    const answer = this.responses.leave(this.touch(i, enemy, asked, "none"));
    // "raid" goes at raidScout: scouts are few (behaviour MR 5.2), and their trail brings the rest.
    const rate = answer === "now" ? LEAVE_NOW : answer === "soon" ? LEAVE_SOON : answer === "raid" ? this.params.raidScout : scout;
    if (!(this.#rng() < 1 - Math.exp(-rate * dt))) return false;
    // "raid" (docs/stance.md): it goes out as a raid scout. Recruited, its stance is raid, and its mode policy is asked afresh as one.
    if (answer === "raid" && this.params.stanceGate > 0 && this.params.raidGate > 0 && this.#entrance === null) {
      this.recruited[i] = 1;
      this.#gone[i] = 0;
    }
    return true;
  }

  /** Whether each ant's stance is its own, from what it senses (docs/stance.md: open ground, stanceGate on), not the colony's. */
  get ownStances(): boolean {
    return this.params.stanceGate > 0 && this.#entrance === null;
  }

  /** How many living ants act on each stance now (the HUD, where each ant's stance is its own). */
  stanceCounts(): Record<Stance, number> {
    const n: Record<Stance, number> = { forage: 0, defend: 0, raid: 0 };
    for (let i = 0; i < this.n; i++) if (this.alive[i]) n[this.#stanceOf(i)]++;
    return n;
  }

  /**
   * The stance ant i acts on (behaviour MR 5.2): the colony's, except that a raid stance is a bias and not an order. An ant that has
   * smelt no raid trail and has not gone out as a scout carries on as a forager, so a raid stance never idles the colony.
   */
  #stanceOf(i: number): Stance {
    // Top-down, each ant's own (docs/stance.md): defend while it senses a threat on home ground, raid once recruited, else forage.
    if (this.params.stanceGate > 0 && this.#entrance === null) return this.#defending[i] ? "defend" : this.recruited[i] ? "raid" : "forage";
    return this.stance === "raid" && this.recruited[i] === 0 && this.params.raidGate > 0 && this.#entrance === null ? "forage" : this.stance;
  }

  /**
   * The raid trail ant i smells, strongest of its cell and its three sensors (behaviour MR 5.2): what recruits it, what it is asked
   * `leave` with, and what keeps it recruited. "strong" where the colony doesn't recruit raiders by trail.
   */
  #raidSmelt(i: number): "none" | "faint" | "strong" {
    if (this.params.raidGate <= 0 || this.#entrance !== null) return "strong";
    if (!this.ph.live("raid")) return "none";
    const x = this.x[i] as number;
    const y = this.y[i] as number;
    const h = this.heading[i] as number;
    const d = this.params.sensorDistance;
    const a = this.params.sensorAngle;
    const ph = this.ph;
    return trailLevel(Math.max(ph.read("raid", x, y), ph.read("raid", x + Math.cos(h - a) * d, y + Math.sin(h - a) * d), ph.read("raid", x + Math.cos(h) * d, y + Math.sin(h) * d), ph.read("raid", x + Math.cos(h + a) * d, y + Math.sin(h + a) * d)));
  }

  /** Whether ant i is within its nest's radius on a top-down map. */
  #atNestTop(i: number): boolean {
    const dx = (this.x[i] as number) - this.nest.x;
    const dy = (this.y[i] as number) - this.nest.y;
    return dx * dx + dy * dy < this.nest.r * this.nest.r;
  }

  /** Nestmates in cell (cx, cy) and the six round it, as the colony's count grid has them (docs/stance.md: crowding). */
  #nestmatesAround(cx: number, cy: number): number {
    const f = this.nestmates;
    if (!f) return 0;
    const { w, h } = this.map.size;
    const o = discOffsets(1)[cy & 1] as Int16Array;
    let s = 0;
    for (let k = 0; k < o.length; k += 2) {
      const x = cx + (o[k] as number);
      const y = cy + (o[k + 1] as number);
      if (x >= 0 && y >= 0 && x < w && y < h) s += f.get(x, y);
    }
    return s;
  }

  /** Last tick's returns with food in cell (cx, cy) and the six round it (behaviour MR 5). */
  #returnsAround(cx: number, cy: number): number {
    const g = this.#returned;
    if (g.size === 0) return 0;
    const o = discOffsets(1)[cy & 1] as Int16Array;
    let s = 0;
    for (let k = 0; k < o.length; k += 2) s += g.get((cy + (o[k + 1] as number)) * 65536 + cx + (o[k] as number)) ?? 0;
    return s;
  }

  /**
   * Nestmates against strangers in ant i's cell and the six round it, as it feels them (behaviour MR 4): outnumbered
   * under two thirds as many, outnumbering over half as many again. Call after #enemyHeading (strangers as it perceives
   * them). Leaves the shared CELL as it found it.
   */
  #odds(i: number): Odds {
    const g = this.enemies;
    const f = this.nestmates;
    if (!g || !f) return "even";
    const keepX = CELL[0] as number;
    const keepY = CELL[1] as number;
    this.antCell(i);
    const cx = CELL[0] as number;
    const cy = CELL[1] as number;
    const { w, h } = this.map.size;
    const o = discOffsets(1)[cy & 1] as Int16Array;
    let mine = 0;
    let them = 0;
    for (let k = 0; k < o.length; k += 2) {
      const x = cx + (o[k] as number);
      const y = cy + (o[k + 1] as number);
      if (x < 0 || y < 0 || x >= w || y >= h) continue;
      mine += f.get(x, y);
      them += g.get(x, y);
    }
    CELL[0] = keepX;
    CELL[1] = keepY;
    mine = Math.max(1, mine);
    return mine > 1.5 * them ? "outnumbering" : mine * 1.5 < them ? "outnumbered" : "even";
  }

  /** The nearest cell holding enemies within enemyRange of ant i, as a heading, or null. */
  #enemyHeading(i: number): number | null {
    const g = this.enemies;
    if (!g) return null;
    // Strangers to this ant, as it perceives them: its own odour, its own tolerance.
    g.look?.(this.odour[i] as number, this.tolerance[i] as number);
    const { w, h } = this.map.size;
    this.antCell(i);
    const cx = CELL[0] as number;
    const cy = CELL[1] as number;
    const ENEMY_RANGE = this.params.enemyRange;
    if (!g.any(cx - ENEMY_RANGE - 1, cy - ENEMY_RANGE, cx + ENEMY_RANGE + 1, cy + ENEMY_RANGE)) return null;
    // The hex disc round the ant: the nearest cell (by distance, not ring order) holding enough strangers to react to.
    const o = discOffsets(ENEMY_RANGE)[cy & 1] as Int16Array;
    const ax = this.x[i] as number;
    const ay = this.y[i] as number;
    let best = Infinity;
    let heading: number | null = null;
    for (let k = 0; k < o.length; k += 2) {
      const x = cx + (o[k] as number);
      const y = cy + (o[k + 1] as number);
      if (x < 0 || y < 0 || x >= w || y >= h || g.get(x, y) < ENEMY) continue;
      const dx = centreX(x, y) - ax;
      const dy = centreY(y) - ay;
      const d = dx * dx + dy * dy;
      // Not through soil: a raider on the ground charged strangers in a tunnel under it, into the soil, for good (review of
      // #26: raiders stuck in the pits by the rival's mound, none in at its hole).
      if (d < best && (!this.map.hasSoil || this.#clearTo(ax, ay, centreX(x, y), centreY(y)))) {
        best = d;
        heading = Math.atan2(dy, dx);
      }
    }
    return heading;
  }

  /** Advance by dt seconds: ants decide (when their situation changed), steer, lay trail, move; then the fields evaporate and spread, and stored food becomes ants. */
  tick(dt: number): void {
    const p = this.params;
    const rng = this.#rng;
    const { map, ph } = this;
    const home = this.nest;
    const a = p.sensorAngle;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    this.time += dt;
    this.recentLosses *= Math.exp(-dt / 30);
    // Intake (behaviour MR 5): food stored per second, averaged over INTAKE_WINDOW.
    const got = this.stored - this.#storedSeen;
    this.#storedSeen = this.stored;
    this.intakeRate += (got / dt - this.intakeRate) * (1 - Math.exp(-dt / INTAKE_WINDOW));
    // Activation (behaviour MR 5): last tick's returns with food are what the waiting foragers round them meet this tick.
    const gate = p.leaveGate > 0 && this.#entrance === null;
    if (gate) {
      const seen = this.#returned;
      this.#returned = this.#returning;
      this.#returning = seen;
      seen.clear();
    }
    const metLeak = gate ? Math.exp((-dt * Math.LN2) / MET_HALF) : 1;
    // Raids by trail (behaviour MR 5.2): a finder's count of strangers met leaks like `met`.
    const rgate = p.raidGate > 0 && this.#entrance === null;
    const foeLeak = rgate ? Math.exp((-dt * Math.LN2) / FOES_HALF) : 1;
    // Each ant's own stance (docs/stance.md): its threat leaks like `foes`; a waiting ant feels its home's crowd over CROWD_HALF.
    const sgate = p.stanceGate > 0 && this.#entrance === null;
    const threatLeak = sgate ? Math.exp((-dt * Math.LN2) / THREAT_HALF) : 1;
    const crowdKeep = sgate ? Math.exp((-dt * Math.LN2) / CROWD_HALF) : 1;
    for (let i = 0; i < this.n; i++) {
      if (!this.alive[i]) continue;
      if (map.sky) this.#unbury(i);
      let h = this.heading[i] as number;
      // Three sensors (left, front, right), each read on every channel at once.
      const sn = this.#s;
      const ch = Math.cos(h);
      const sh = Math.sin(h);
      this.#sense(i, ch * ca + sh * sa, sh * ca - ch * sa, 0); // h − a
      this.#sense(i, ch, sh, 1);
      this.#sense(i, ch * ca - sh * sa, sh * ca + ch * sa, 2); // h + a
      const fl = sn[0] as number;
      const ff = sn[1] as number;
      const fr = sn[2] as number;
      const hl = sn[3] as number;
      const hf = sn[4] as number;
      const hr = sn[5] as number;
      const al = sn[6] as number;
      // What this ant smells of alarm, for its Touch this tick (behaviour MR 4: graded alarm).
      this.#alarmAnt = i;
      this.#alarmSmelt = trailLevel(Math.max(sn[6] as number, sn[7] as number, sn[8] as number));
      const af = sn[7] as number;
      const ar = sn[8] as number;
      const toEnemy = this.#enemyHeading(i);
      this.#oddsNow = toEnemy === null ? "none" : this.#odds(i);
      if (rgate) {
        this.foes[i] = (this.foes[i] as number) * foeLeak + (toEnemy === null ? 0 : dt);
        if (this.reporting[i] === 1 && this.#atNestTop(i)) this.reporting[i] = 0;
      }
      // Defence is the ant's own (docs/stance.md): alarm smelt or strangers in reach raise its threat, which fades; past defendAt,
      // on home ground (within homeGround of its nest by its home vector), it defends. Far out, it forages as before.
      if (sgate) {
        const felt = toEnemy !== null || this.#alarmSmelt !== "none";
        const th = (this.threat[i] as number) * threatLeak + (felt ? dt : 0);
        this.threat[i] = th;
        this.#defending[i] = th >= p.defendAt && Math.hypot((this.x[i] as number) - this.nest.x, (this.y[i] as number) - this.nest.y) <= p.homeGround ? 1 : 0;
      }
      // Raid stance (behaviour MR 5.2): a raid is a bias, not an order. An ant is recruited by smelling a scout's raid trail, or goes out
      // as a scout at raidScout when it is home with empty jaws; the others forage. A recruited ant's raid ends when it comes home
      // with no trail under it: no trail was laid for it, or the trail has faded.
      if (rgate && (sgate || this.stance === "raid")) {
        const homeNow = this.#atNestTop(i);
        if (!homeNow) this.#gone[i] = 1;
        if (this.recruited[i] === 0) {
          if (this.#raidSmelt(i) !== "none") {
            this.recruited[i] = 1;
            this.#gone[i] = 0;
          } else if (!sgate && homeNow && !this.carrying[i] && !this.pellet[i] && !this.#holdsBrood[i] && this.#rng() < 1 - Math.exp(-p.raidScout * dt)) {
            this.recruited[i] = 1;
            this.#gone[i] = 0;
            this.mode[i] = FIGHT; // out it goes
          }
        } else if (homeNow && this.#gone[i] === 1 && this.#raidSmelt(i) === "none") {
          this.recruited[i] = 0;
          this.#gone[i] = 0;
        }
        if (homeNow || this.recruited[i] === 0) this.#pastEnd[i] = 0;
      } else if (this.recruited[i] === 1) {
        this.recruited[i] = 0;
        this.#pastEnd[i] = 0;
      }
      // The carry response (ja-1pm): a load is taken where it belongs, or put down here; put down, the ant is not carrying
      // this step (its trip is over: see `arrive`).
      // (The local carry response always takes, so it isn't asked: building a Touch for every carrier every step cost
      // the side view ~11 % a tick for nothing, review of #35.)
      if (this.responses.carry !== localResponses.carry && (this.carrying[i] || this.pellet[i] || this.#holdsBrood[i]) && this.responses.carry(this.touch(i, toEnemy !== null)) === "put down") this.#putDown(i);

      // The mode choice, only when the situation changed since the ant was last asked.
      // A carrying ant goes home: a mechanic, never asked (and asked afresh once it puts the food down).
      // So does one carrying a soil pellet it dug, to drop on the mound.
      const carrying = this.carrying[i] === 1;
      const pellet = this.pellet[i] === 1;
      const nursing = this.#holdsBrood[i] === 1;
      if (!pellet) this.#staleWalk[i] = 0; // a stale walk is part of one trip home with a pellet
      // A finder (behaviour MR 5.2): a raider outside, its jaws empty, no raid trail under it, that has been in contact with
      // strangers for findAt seconds goes home to tell, laying the raid trail on the way. (A raider on the trail meeting
      // strangers fights them: the trail is where the scout was before.)
      if (rgate && toEnemy !== null && this.reporting[i] === 0 && !carrying && !pellet && !nursing && this.#stanceOf(i) === "raid" && (this.foes[i] as number) >= p.findAt && !this.#atNestTop(i) && this.#raidSmelt(i) === "none") {
        this.reporting[i] = 1;
        this.since[i] = 0;
        this.#homeAfresh(i);
      }
      const reporting = this.reporting[i] === 1;
      // Where homing heads: the chamber; in the side view, the entrance for a pellet carrier (soil goes up and
      // out) and for any ant on the ground line (path integration home is to the hole, not through the ground).
      let goal = this.#goal(i, pellet);
      // A nurse heads for its brood chamber; out on the ground line (lost), for the hole first, like any homing ant.
      if (nursing && goal === this.nest) goal = this.#chamberGoal(this.#broodTo[i] as number);
      // Food flow (slice 5): food goes to a chamber, not to "the nest": underground, a carrier heads for the one it takes
      // its food to (a forager: reception, or the royal chamber until there is one).
      else if (carrying && this.queen && goal === this.nest) goal = this.#chamberGoal(this.#foodTo(i));
      let nest = goal;
      const x0 = this.x[i] as number;
      const y0 = this.y[i] as number;
      let mode = this.mode[i] as number;
      const prevMode = mode;
      const item: Item = carrying ? "food" : pellet ? (this.#corpse[i] ? "corpse" : "soil") : nursing ? "brood" : "none";
      const resp = this.responses;
      let situation0 = -1; // the situation's code with mode 0 (encode), when the mode policy was consulted this step
      let waiting = false;
      let rolled = false; // asked `leave` this step already (behaviour MR 5): one roll a step, at the rate it answers
      if (carrying || pellet || nursing || reporting) {
        // A carrier takes its load where it belongs (the carry response, above, said so): home, not a mode choice; the next
        // question comes once the load is down.
        mode = RETURN;
        this.mode[i] = mode;
        this.#asked[i] = -1;
        this.#question[i] = -1;
        if (!reporting) this.#loaded[i] = 1;
      } else {
        // Its load just put down, wherever that was (spoil on the mound, a corpse on the midden, food in the larder): the
        // carrying trip is over, so it is not returning any more (ja-qnx; `arrive`). It heads back out along its trail: a
        // follower, which a fresh ant is asked as the local rule asked a returner (both follow a trail, explore without
        // one). As an explorer, the middle-aged diggers no longer followed the carriers' scent down to reception, where
        // they port its food on: food piled up there (A8, seeds 5-6: 30-37 % of the nest's food carried on, main 87-100 %).
        if (this.#loaded[i]) {
          this.#loaded[i] = 0;
          if (p.arrive !== "return" && mode === RETURN) {
            mode = FOLLOW;
            this.mode[i] = mode;
          }
        }
        const tired = this.#isTired(i);
        const food = trailLevel(Math.max(fl, ff, fr));
        const home = this.#homeField(i, hl, hf, hr);
        const alarm = trailLevel(Math.max(al, af, ar));
        const enemy = toEnemy === null ? 0 : 1;
        const stance = STANCES.indexOf(this.#stanceOf(i));
        const before = encode(mode, tired, food, home, alarm, enemy, stance);
        situation0 = before - mode * MODE_STRIDE;
        // Waiting at home (behaviour MR 5): where the colony gates leaving, a forager home in "return" is asked `leave`
        // (below), not its mode: the mode policy sends any ant out that smells no food trail, gate or no gate.
        waiting = gate && mode === RETURN && !enemy && this.#atNestTop(i);
        if (before !== this.#asked[i] && !waiting) {
          mode = MODES.indexOf(this.policy({ mode: MODES[mode] as Mode, tired, foodTrail: food, homeTrail: home, alarm, enemy: enemy ? "near" : "none", stance: this.#stanceOf(i) }));
          if (mode < 0) mode = tired ? RETURN : EXPLORE; // a policy answering nonsense falls back to the plain rule
          // Zoned by age: an ant that may not go out is no raider. Sent raiding, a young one climbed to its hole, was put
          // back down the shaft, and climbed again (review of #26: 70–93 of ~110 young raiders parked at the hole). With
          // no enemy near, it explores (with one near, it fights where it is).
          if (mode === FIGHT && !enemy && this.#stanceOf(i) === "raid" && this.queen && !this.#mayGoOut(i)) mode = EXPLORE;
          if (mode === RETURN && this.mode[i] !== RETURN) this.#homeAfresh(i);
          this.mode[i] = mode;
          this.#asked[i] = encode(mode, tired, food, home, alarm, enemy, stance);
          this.seen[before] = 1;
          this.#question[i] = before;
          this.decisions++;
        }
      }
      let fleeFrom: number | null = null;
      // Strangers in reach: the contact response (behaviour MR 4) decides, every step they are, over what the mode policy
      // said. Before it, every ant with an enemy near fought. A fleeing ant runs away from the strangers while they are in
      // reach; once they are gone its mode policy is asked afresh (locally: back to its trail, or exploring).
      if (toEnemy !== null) {
        const answer = resp.contact(this.touch(i, true, mode, item));
        if (answer === "fight" && !reporting) {
          if (mode !== FIGHT && !carrying && !pellet && !nursing) mode = FIGHT;
        } else {
          if (answer === "drop and run" && (carrying || pellet || nursing)) this.#putDown(i);
          if (mode !== RETURN) this.#homeAfresh(i);
          mode = RETURN;
          // A carrier flees by taking its load home: turned straight away from the strangers, on the side view's ground
          // line that was often away from its hole (G seed 5, raid stance: 3–5 carriers held over 120 s between the nests).
          if (!carrying && !pellet && !nursing) fleeFrom = toEnemy;
        }
        this.mode[i] = mode;
        // The situation as answered, with the mode the contact response set: else the mode policy, asked again next step,
        // put the ant back on its trail and contact turned it round again, resetting its homing every other step (review
        // of #38: 6,170 flips in 150 s on G′ seed 1).
        if (situation0 >= 0) this.#asked[i] = situation0 + mode * MODE_STRIDE;
      }
      // Homing steers for where the ant believes the goal is (its drifting home vector), not for the goal itself.
      // A pellet carrier is taking soil up and out: it climbs (gravity), and up the shaft is the hole, so no vector.
      // (Steering it by a drifted one left carriers surfacing off target and dropping spoil in pits beside the hole.)
      if (mode === RETURN && !pellet) nest = this.#believe(i, goal);
      this.#goalX = nest.x;
      this.#goalY = nest.y;
      this.#holeX = goal === this.#entrance ? nest.x : (this.#entrance?.x ?? 0);
      // Steer by mode. An explorer at a soil face keeps its heading while it digs.
      const noise = (rng() - 0.5) * 2 * dt;
      const detouring = (this.detour[i] as number) > 0;
      if (mode !== EXPLORE) this.digT[i] = 0;
      if (mode !== EXPLORE || pellet) this.hugT[i] = 0;
      else this.hugT[i] = Math.max(0, (this.hugT[i] as number) - dt);
      if (mode !== prevMode) {
        this.gx[i] = NO_CELL;
        this.digAim[i] = NaN;
        this.#chamberCell[i] = -1; // a face aimed at as an explorer: stale once it does something else (review of slice 2)
      }
      const digging = (this.digT[i] as number) > 0;
      if (mode !== RETURN) {
        this.wall[i] = 0;
        this.mx[i] = NaN;
      }
      if (mode === RETURN) {
        // Homing uses only what an ant has: its home vector (path integration: real ants count steps
        // against a sky compass), its antennae, and touch. A straight line home walks into the same
        // wall forever (reviews reproduced games where every homing ant of a colony was stuck), so a
        // blocked step starts wall-following by touch (the Bug2 rule, set up where the step is blocked
        // below): keep the wall on one side until the ant is nearer home than where it met the wall
        // and the way home is open.
        const x = this.x[i] as number;
        const y = this.y[i] as number;
        const toNest = Math.atan2(nest.y - y, nest.x - x);
        // Progress: no cell nearer its goal in TUNNEL_STALL seconds (home scent can lead round a ring of tunnels for
        // ever), and the tunnel walker picks branches by its home vector for BY_VECTOR seconds (see #walkTunnel); then by scent again.
        const near = Math.hypot(nest.x - x, nest.y - y);
        if (near < (this.bestD[i] as number) - 1) {
          this.bestD[i] = near;
          this.stallT[i] = 0;
        } else if ((this.stallT[i] = (this.stallT[i] as number) + dt) > TUNNEL_STALL + BY_VECTOR) {
          this.bestD[i] = near;
          this.stallT[i] = 0;
        }
        if (this.#entrance && (this.wall[i] !== 0 || detouring)) {
          // On the ground line it homes cell by cell (see #walkTunnel): no walls to follow, no detour to wander (an
          // explorer's detour, run up bumping round, used to carry on once it had food, and walk it away from the hole).
          this.antCell(i);
          if (isSky(map, CELL[0] as number, CELL[1] as number)) {
            this.wall[i] = 0;
            this.detour[i] = 0;
          }
        }
        // A carrier with food on a top-down map takes the food trail home where it agrees with its home vector (ja-00t,
        // docs/trails.md: foragers combine route cues and pheromone, path integration the fallback): each sensor's trail
        // counts only if its direction is within homeTrailCone of the way home. At a fork the vector can't tell the branches
        // apart (both lie off its line); the trail picks, not the wall a vector-led carrier walks into. Never the trail
        // alone: all-trail carriers milled on their own trail (PRD §45.3).
        let tl = 0;
        let tf = 0;
        let tr = 0;
        if (p.homeTrail > 0 && carrying && this.#entrance === null && !detouring && Math.max(fl, ff, fr) >= FAINT && Math.max(fl, ff, fr) < SEEN) {
          const agrees = (b: number) => Math.cos(b - toNest) >= Math.cos(p.homeTrailCone);
          tl = agrees(h - a) ? fl : 0;
          tf = agrees(h) ? ff : 0;
          tr = agrees(h + a) ? fr : 0;
        }
        let onTrail = Math.max(tl, tf, tr) >= FAINT;
        if (onTrail && this.wall[i] !== 0) {
          // Following a wall: let go only where the trail's way is open. Letting go into rock, it met the same wall again
          // every step and never got round it (G′ seed 4: 59 carriers held over 120 s within 40 cells of home).
          const way = tl >= tf && tl >= tr ? h - a : tr > tf ? h + a : h;
          if (this.#touch(x, y, way, 1.2)) onTrail = false;
          else {
            this.wall[i] = 0; // the trail leads on: let go of the wall
            this.mx[i] = NaN;
          }
        }
        const side = this.wall[i] as number;
        // Carrying a pellet out to the mound, it doesn't look for space to fill on the way (it has chosen the mound).
        const look = pellet && !this.#corpse[i] && map.hasSoil && Number.isNaN(this.#spoilTo[i] as number) && (this.since[i] as number) > backfill.after && this.#enteredCell(i);
        const lx = CELL[0] as number;
        const ly = CELL[1] as number;
        if (look && this.#backfill(i, lx, ly)) {
          // Dropped its pellet into unused space beside it: the trip is done; turned round, it is asked afresh next tick.
          h += Math.PI;
          this.gx[i] = NO_CELL;
          this.wall[i] = 0;
          this.mx[i] = NaN;
        } else if (look && Number.isNaN(this.#spoilTo[i] as number) && this.#enterStale(i, lx, ly)) {
          h = this.#towardTarget(i); // into a stale branch, to fill its end
        } else if (this.#staleWalk[i] && this.#staleStep(i, p.speed * dt)) {
          h = this.#towardTarget(i); // on along it
        } else if (side === 0 && !(detouring && (this.detour[i] as number) > 0) && this.#walkTunnel(i, RETURN, p.speed * dt)) {
          h = this.#towardTarget(i); // in a tunnel: back the way it came (a wall it is already following, it keeps following)
        } else if (side === 0) {
          // Free: the home vector, with the home trail as a hint only (climbing it at full rate let
          // clusters of homing ants circle on their own trail). After giving up on a wall, wander a while.
          if (detouring) h += noise * p.wander;
          else if (onTrail) {
            h += choose(tl, tf, tr, p.turnRate * dt * p.homeTrail, p.followChoice || 1, rng) + noise * p.wander * 0.25;
            h = turnToward(h, toNest, p.turnRate * dt * 0.8 * (1 - p.homeTrail));
          } else {
            // Where it believed home was, and nothing there (the side view's drifting vector): search round it.
            if (nest !== goal && Math.hypot(nest.x - x, nest.y - y) < 1) this.#searchOn(i);
            h += climb(hl, hf, hr, p.turnRate * dt * 0.25) + noise * p.wander * 0.25;
            h = turnToward(h, toNest, p.turnRate * dt * 0.8);
          }
        } else {
          const t0 = this.followT[i] as number;
          const t = t0 + dt;
          this.followT[i] = t;
          if (t0 < FOLLOW_FLIP && t >= FOLLOW_FLIP) {
            // Probably the long way round (a big rock mass, or the map's edge): try the other side, same line home.
            this.wall[i] = -side as -1 | 1;
            this.gdir[i] = ((this.gdir[i] as number) + 3) % 6;
            this.gx[i] = NO_CELL; // decide afresh from here
          }
          if (!this.byCell[i]) {
            // In a tunnel now (the ground round it was filled in, or it followed the wall into one): by cell from
            // here. Steering by touch can't walk a passage one cell wide; it turns on the spot until it gives up.
            this.antCell(i);
            if (tunnel(map, CELL[0] as number, CELL[1] as number)) {
              this.byCell[i] = 1;
              this.gx[i] = NO_CELL;
            }
          }
          if (!this.byCell[i]) {
            // Round rock in open ground: steer by touch.
            if (t0 < FOLLOW_FLIP && t >= FOLLOW_FLIP) h += Math.PI;
            const dist = Math.hypot(nest.x - x, nest.y - y);
            if (dist < (this.hitDist[i] as number) - 1 && this.#onMLine(i, x, y) && !this.#touch(x, y, toNest, 1.5)) {
              this.wall[i] = 0; // back on its line home, nearer than where it met this wall, and the way is open
              h = turnToward(h, toNest, p.turnRate * dt * 0.8);
            } else if (t >= FOLLOW_GIVE_UP) this.#giveUp(i);
            else {
              // Keep the wall on its side (+1 = right: the ant turns left round it; angles grow clockwise, y down).
              const sd = this.wall[i] as number;
              const ahead = this.#touch(x, y, h, 1);
              if (ahead) h -= sd * p.turnRate * dt * 2; // wall ahead: turn away
              else if (!this.#touch(x, y, h + sd * 0.9, 1.2)) h += sd * p.turnRate * dt; // the wall fell away: hug round the corner
              // Touching nothing, ahead or on the wall side (alarm or a thin rock tip threw it off): the hug
              // would only circle in the open. Let go and walk the home vector; the line home is kept.
              if (ahead || this.#touch(x, y, h + sd * (Math.PI / 2), 1.2)) this.untouched[i] = 0;
              else if ((this.untouched[i] = (this.untouched[i] as number) + dt) > WALL_LOST) this.wall[i] = 0;
            }
          } else if (t >= FOLLOW_GIVE_UP) this.#giveUp(i);
          else {
            // Soil, or a tunnel: cell by cell, a hand on the wall. At each cell's centre, feel round from
            // the hand side to the other (six ways), and take the first open one. In a tunnel this
            // walks the tunnel (steering by touch can't, one cell wide); in a tree of tunnels it visits every branch.
            // A target cell filled since (backfill), or no longer beside it (it was pushed off its cell), is decided
            // afresh too: steering for it would pin the ant against the filled ground between.
            this.antCell(i);
            const lost =
              this.gx[i] !== NO_CELL && (rockAt(map, this.gx[i] as number, this.gy[i] as number) !== OPEN || hexDistance(this.gx[i] as number, this.gy[i] as number, CELL[0] as number, CELL[1] as number) > 1);
            const reached = this.gx[i] === NO_CELL || lost || Math.hypot(centreX(this.gx[i] as number, this.gy[i] as number) - x, centreY(this.gy[i] as number) - y) <= p.speed * dt;
            if (reached) {
              cellOf(x, y);
              // A lost target: the next way is felt from the cell it is in (the wall's first cell stays its first).
              const own = this.gx[i] === NO_CELL || lost;
              const cx = own ? (CELL[0] as number) : (this.gx[i] as number);
              const cy = own ? (CELL[1] as number) : (this.gy[i] as number);
              const ox = centreX(cx, cy);
              const oy = centreY(cy);
              const dist = Math.hypot(nest.x - ox, nest.y - oy);
              const open = !this.#touch(ox, oy, Math.atan2(nest.y - oy, nest.x - ox), 1.5);
              if (this.gx[i] === NO_CELL) {
                // The first cell of this wall: coming back to it means it has been all the way round.
                this.loopX[i] = cx;
                this.loopY[i] = cy;
              }
              const looped = t > 2 && this.gx[i] !== NO_CELL && cx === this.loopX[i] && cy === this.loopY[i];
              cellOf(this.mx[i] as number, this.my[i] as number);
              const hit = this.hitDist[i] as number;
              const open2 = open && !this.#touch(ox, oy, Math.atan2(nest.y - oy, nest.x - ox), 2);
              // Back on its line home, nearer than the nearest it has been on this trip, with the way open.
              const onLine = dist < hit - 1 && this.#onMLine(i, ox, oy, SIDE) && open;
              // Round an island and back where it met it, with the way home open (it met it turning, not heading home).
              const island = t > 2 && cx === CELL[0] && cy === CELL[1] && open;
              // In dug ground, the way home open two cells on and some way nearer than its best this trip.
              const nearer = t > 1 && dist < hit - GAIN && open2;
              // Or, a few times a trip, after 3 s of following wherever the way home is open: a hand on the wall
              // in a dug-out cavern drifts from speck to speck farther from home, and a speck needn't be walked
              // round. Only a few: a release that makes no progress could leave and meet the same wall for ever.
              const anywhere = t > 3 && (this.#noGain[i] as number) < NO_GAIN && open2;
              const sight = Math.hypot(goal.x - ox, goal.y - oy) < NEST_SIGHT && this.#clearTo(ox, oy, goal.x, goal.y);
              const leave = this.gx[i] !== NO_CELL && (onLine || island || nearer || anywhere || sight);
              // Into a tunnel with home scent: the scent leads from here (counted like a release: it may lead
              // back to this same wall, so after a few that gain nothing, only progress lets it go).
              const scent = !leave && (dist < hit - GAIN || (this.#noGain[i] as number) < NO_GAIN) && tunnel(map, cx, cy) && this.#homeScentNear(cx, cy);
              if (looped && !leave && !scent && this.byCell[i]) {
                // All the way round this wall (a speck of soil) and nowhere on it nearer home: it can't be the
                // way. Give up on it now (wander a while, then try afresh) rather than after FOLLOW_GIVE_UP.
                this.#giveUp(i);
              } else if (leave || scent) {
                // Progress is kept from wall to wall: the next wall it meets is judged against the nearest it has been
                // (a give-up, which wanders, starts the trip's count afresh). A release that gains nothing counts
                // against the few allowed, an island's too (review of #10: leave, meet the same spot, go round, leave).
                if (dist < hit - GAIN) this.#noGain[i] = 0;
                else if (!onLine && !nearer && !sight) this.#noGain[i] = (this.#noGain[i] as number) + 1;
                this.hitDist[i] = Math.min(hit, dist);
              }
              if (leave) {
                // Back on its line home, nearer than where it met this wall, and the way is open; or the nest
                // itself is in plain view.
                this.wall[i] = 0;
                h = turnToward(h, toNest, p.turnRate * dt * 0.8);
              } else if (scent) {
                // Into a tunnel with home scent to lead it: the tunnel walker takes it on from here (see
                // #walkTunnel). Not the home vector: from a tunnel it can point into soil, and the blocked
                // step would start a new wall at once, every tick, with the give-up clock at zero (review of #8).
                this.wall[i] = 0;
                this.gx[i] = NO_CELL;
                if (this.#walkTunnel(i, RETURN, p.speed * dt)) h = this.#towardTarget(i);
              } else if (this.wall[i] !== 0) {
                const d = handOnWall(map, cx, cy, this.gdir[i] as number, this.wall[i] as number);
                this.gdir[i] = d;
                this.gx[i] = stepX(cx, cy, d);
                this.gy[i] = stepY(cy, d);
              }
            }
            if (this.wall[i] !== 0) h = this.#towardTarget(i);
          }
        }
      } else if (mode === FOLLOW && this.#staysIn(i)) {
        // An inside worker (zoned by age) doesn't follow a food trail: it leads out, where it may not go. It explores.
        if (this.#walkTunnel(i, EXPLORE, p.speed * dt)) h = this.#towardTarget(i);
        else h += noise * p.wander;
      } else if (mode === FOLLOW) {
        if (!digging && this.#walkTunnel(i, FOLLOW, p.speed * dt)) h = this.#towardTarget(i);
        else {
          // "No entry" ahead (behaviour MR 3): the food scent it marks counts for less. Read only where some was laid, and
          // only outside (a top-down map, or the side view's ground), where food trails lead to food.
          const outside = this.#entrance === null || !this.#under[i];
          let gl = fl;
          let gf = ff;
          let gr = fr;
          if (p.noEntryAvoid > 0 && ph.live("noEntry") && outside) {
            const x = this.x[i] as number;
            const y = this.y[i] as number;
            const d = p.sensorDistance;
            const ne = (b: number) => p.noEntryAvoid * Math.max(0, ph.read("noEntry", x + Math.cos(b) * d, y + Math.sin(b) * d));
            if (gl < SEEN) gl = Math.max(0, gl - ne(h - a));
            if (gf < SEEN) gf = Math.max(0, gf - ne(h));
            if (gr < SEEN) gr = Math.max(0, gr - ne(h + a));
          }
          // Which way along the trail: by strength, not just to the strongest sensor (Deneubourg's choice: see choose).
          // Top-down maps only. In the side view's chambers food scent leads to stores and brood, and a chance turn there
          // kept porters from the food (the hour-long economy test: no porter trips, larvae starved); on its ground line,
          // where trails don't fork, it still halved the colony's births (PRD §45.3).
          h += (p.followChoice > 0 && this.#entrance === null ? choose(gl, gf, gr, p.turnRate * dt, p.followChoice, rng) : climb(gl, gf, gr, p.turnRate * dt)) + noise * p.wander * 0.25;
          // The trail ends here, strong, falling away all round, and no food in sight: the patch is spent. Mark it "no entry" (Robinson et al. 2005).
          if (p.noEntryAvoid > 0 && !carrying && outside && Math.max(fl, ff, fr) < SEEN) {
            this.antCell(i);
            const here = ph.fields.food.get(CELL[0] as number, CELL[1] as number);
            // Only walking out, by its home vector (home behind it): walking in, the food trail fades ahead as it should.
            const ox = (this.x[i] as number) - nest.x;
            const oy = (this.y[i] as number) - nest.y;
            const outbound = Math.cos(h) * ox + Math.sin(h) * oy > 0.5 * Math.hypot(ox, oy);
            if (outbound && here >= NO_ENTRY_TRAIL && Math.max(fl, ff, fr) < here * NO_ENTRY_DROP) {
              const lay = resp.noEntry(this.touch(i, toEnemy !== null, mode, item));
              if (lay > 0) {
                this.antCell(i);
                ph.depositCell("noEntry", CELL[0] as number, CELL[1] as number, p.deposit * (this.#entrance === null ? p.foodTrailTop : 1) * lay * dt * NO_ENTRY_RATE);
              }
            }
          }
        }
      } else if (mode === FIGHT) {
        // A calm ant (the fungus's cue) does not charge.
        // A raider in the side view walks on to the raided nest, cell by cell, past the alarm of fights behind it: steering
        // freely up the alarm left raiders in the pits by the rival's mound, 12–13 columns short of its hole (none got in).
        const sideRaid = this.stance === "raid" && this.raidTarget !== null && this.#entrance !== null;
        if (toEnemy !== null) h = turnToward(h, toEnemy, p.turnRate * dt * 2 * (1 - (this.calm[i] as number)));
        else if (Math.max(al, af, ar) >= FAINT && !sideRaid) h += climb(al, af, ar, p.turnRate * dt);
        else if (sideRaid && ((this.detour[i] = 0), this.#walkTunnel(i, FIGHT, p.speed * dt))) h = this.#towardTarget(i);
        else if (this.stance === "raid" && this.raidTarget && this.#entrance && this.#under[i]) {
          // A raider in a chamber (no tunnel: free steering): out of its own nest by its hole, or on into the rival's.
          // Steering straight at the rival's hole through soil left nearly every raider bumping inside its own nest.
          this.antCell(i);
          const own = this.#inOwnNest(CELL[0] as number, CELL[1] as number);
          const aim = own ? this.#entrance : (this.raidNest ?? this.raidTarget);
          h = turnToward(h, Math.atan2(aim.y - (this.y[i] as number), aim.x - (this.x[i] as number)), p.turnRate * dt) + noise * p.wander * 0.25;
        } else if (rgate && this.#stanceOf(i) === "raid" && !detouring) {
          // Raiding by trail (behaviour MR 5.2): up the raid trail where there is one; without one, out and away from the home
          // trail, searching (the scouts). No coordinates: the trail runs where a scout walked, so it goes round rock.
          const x = this.x[i] as number;
          const y = this.y[i] as number;
          const d = p.sensorDistance;
          const rl = Math.max(0, ph.read("raid", x + Math.cos(h - a) * d, y + Math.sin(h - a) * d));
          const rf = Math.max(0, ph.read("raid", x + Math.cos(h) * d, y + Math.sin(h) * d));
          const rr = Math.max(0, ph.read("raid", x + Math.cos(h + a) * d, y + Math.sin(h + a) * d));
          const top = Math.max(rl, rf, rr);
          // Nothing ahead as strong as underfoot, facing along the trail (the front sensor strongest): the raider leaves the trail and
          // searches on (raidOnward) as a scout does (a run out, then a search), until home. Mostly near home, where the trail is weak
          // and patchy (review of #44: a median 0.05–0.19 of the way out); gated on a strong end instead, A11 gained less (1.67, 2.01).
          if (p.raidOnward > 0 && rf >= FAINT && rf === top && this.#pastEnd[i] === 0 && rf < ph.read("raid", x, y)) this.#pastEnd[i] = 1;
          if (top >= FAINT && this.#pastEnd[i] === 0) h += climb(rl, rf, rr, p.turnRate * dt) + noise * p.wander * 0.25;
          else if (this.#pastEnd[i] === 1 && top >= FAINT) h += avoid(hl, hf, hr, p.turnRate * dt * 0.5) + noise * p.wander * 0.25;
          else h += avoid(hl, hf, hr, p.turnRate * dt * 0.5) + noise * p.wander;
        } else if (!rgate && this.stance === "raid" && this.raidTarget && !detouring) {
          // At the rival hole's coordinates: the side view, or raidGate 0 (review of #41: an ant not recruited, put in FIGHT by Jev's
          // mode lane or a contact, walked here on a top-down map).
          const t = this.raidTarget;
          h = turnToward(h, Math.atan2(t.y - (this.y[i] as number), t.x - (this.x[i] as number)), p.turnRate * dt * 0.5) + noise * p.wander * 0.25;
          // The rival's midden marks its ground: raiders shy from it (Pogonomyrmex badius; slice 7).
          const m = this.raidMarks;
          if (m) {
            const x = this.x[i] as number;
            const y = this.y[i] as number;
            const d = p.sensorDistance;
            const read = (a: number) => m.read("midden", x + Math.cos(a) * d, y + Math.sin(a) * d);
            h += avoid(read(h - p.sensorAngle), read(h), read(h + p.sensorAngle), p.turnRate * dt * MIDDEN_AVOID);
          }
        } else h += noise * p.wander;
      } else if (!digging) {
        const seen = Math.max(fl, ff, fr) >= SEEN;
        // Food in sight, unless soil stands between (it touched soil a moment ago): then keep a hand on the wall.
        if (seen && !((this.hugT[i] as number) > 0)) h += climb(fl, ff, fr, p.turnRate * dt);
        else if (this.#walkTunnel(i, EXPLORE, p.speed * dt)) h = this.#towardTarget(i);
        else if (this.queen?.alive && this.band(i) === 0 && this.#under[i]) h = turnToward(h, Math.atan2(this.queen.y - (this.y[i] as number), this.queen.x - (this.x[i] as number)), p.turnRate * dt * 0.3) + noise * p.wander * 0.5;
        else if (this.#entrance && this.#outbound(i) && this.#under[i]) h = turnToward(h, Math.atan2(this.#entrance.y - (this.y[i] as number), this.#entrance.x - (this.x[i] as number)), p.turnRate * dt * 0.5) + noise * p.wander * 0.5;
        else h += noise * p.wander;
      }
      // Fleeing (behaviour MR 4): straight away from the strangers while they are in reach (then it resumes). Homing alone, the
      // fleeing ant often walked along them, or toward them, and died: G′ seed 2, 1,127 of the dead were fleeing.
      if (fleeFrom !== null && (this.#entrance === null || !this.#under[i])) h = turnToward(h, fleeFrom + Math.PI, p.turnRate * dt * 2);
      // Smelling alarm: the alarmGain response says how hard to shy from it (locally: every mode but fighting, unless digging).
      if (Math.max(al, af, ar) >= FAINT) {
        const gain = resp.alarmGain(this.touch(i, toEnemy !== null, mode, item));
        // On the side view's ground line a carrier can't go round alarm, only turn back: it carries on home through it.
        // Shying, carriers turned back from fights at their own hole and held their food (G seeds 4, 8: raids, 3 held).
        const noWayRound = carrying && this.#entrance !== null && !this.#under[i];
        if (gain > 0 && !noWayRound) h += avoid(al, af, ar, p.turnRate * p.alarmAvoid * gain * dt);
        // A faint alarm draws it: top-down only. In the side view the drawn explorers crowded the tunnels and the ground
        // line round the nest's fights (G seeds 1–20: 15/20 against 18/20 without the pull).
        else if (gain < 0 && this.#entrance === null) h += climb(al, af, ar, p.turnRate * p.alarmDraw * -gain * dt);
      }

      // Lay trail: walking out marks the way home, carrying food marks the way to it; a pellet carrier lays none, and
      // nor does a porter (food moved between chambers is no food to recruit to: its trail drew 4–5× as many ants to
      // follow food scent underground, review of slice 5; it lays its chamber's mark like any ant inside, #layMark).
      // The fungus can make it louder or quieter, and have a food carrier leak its food trail into the other colony's
      // field (exact as-is: × 1, nothing leaked).
      // Which trail, and how much, are the trail and trailRate responses.
      const tt = this.touch(i, toEnemy !== null, mode, item);
      const trail = resp.trail(tt);
      if (trail !== "none") {
        const laid = p.deposit * (trail === "food" && this.#entrance === null ? p.foodTrailTop : 1) * resp.trailRate(tt) * Math.exp(-(this.since[i] as number) / p.depositDecay) * dt * (this.layGain[i] as number);
        this.antCell(i);
        ph.depositCell(trail, CELL[0] as number, CELL[1] as number, laid);
        const leak = this.crossLay[i] as number;
        if (carrying && leak > 0 && this.foreign) this.foreign.depositCell("food", CELL[0] as number, CELL[1] as number, laid * leak);
      }

      // A finder lays the raid trail home (behaviour MR 5.2), strongest where it met the strangers, more the more it met.
      if (reporting && rgate) {
        this.antCell(i);
        ph.depositCell("raid", CELL[0] as number, CELL[1] as number, p.deposit * p.raidLay * Math.min(3, 0.5 + (this.foes[i] as number)) * Math.exp(-(this.since[i] as number) / p.depositDecay) * dt);
      }

      // Waiting at home (behaviour MR 5) it stays in, milling as far as the nest's rim, where foragers come home: past
      // WAIT_RIM of the radius it turns back in. Wandering out of the nest, it was asked its mode, and the mode policy
      // sent it out exploring with nothing coming in; kept to half the radius, it never met a carrier, who puts its food
      // down on reaching the rim, so only scouts went out.
      if (waiting) {
        const dx = home.x - (this.x[i] as number);
        const dy = home.y - (this.y[i] as number);
        if (dx * dx + dy * dy > WAIT_RIM * WAIT_RIM * home.r * home.r) h = Math.atan2(dy, dx);
      }
      // Move; rock or the edge turns the ant back somewhere random.
      // Rounded to float32 first, as stored: checked in float64, 192.999996 is open ground, and stored as
      // 193.0 it would land the ant inside the soil cell beyond, where every step is blocked.
      const nx = Math.fround((this.x[i] as number) + Math.cos(h) * p.speed * dt);
      const ny = Math.fround((this.y[i] as number) + Math.sin(h) * p.speed * dt);
      this.detour[i] = (this.detour[i] as number) - dt;
      this.bumps[i] = Math.max(0, (this.bumps[i] as number) - dt / 4);
      // The cell the step lands in: open ground (most steps) moves at once, with no more to check.
      cellOf(Math.fround(nx), Math.fround(ny)); // as stored (Float32), so the cached cell is the stored position's
      const lx = CELL[0] as number;
      const ly = CELL[1] as number;
      let landOpen = rockAt(map, lx, ly) === OPEN;
      if (!landOpen) {
        // A step that stays in the ant's own cell moves even if that cell is solid: a cell filled round an
        // ant (another colony's ant backfilling, its grids a tick old) must not bury it.
        this.antCell(i);
        if (CELL[0] === lx && CELL[1] === ly) landOpen = true;
      }
      let face = !landOpen && mode === EXPLORE && !carrying && !pellet ? soilFace(map, this.x[i] as number, this.y[i] as number, nx, ny, h, this.gx[i] as number, this.gy[i] as number, this.time) : NO_FACE;
      if (face === START_FACE) face = digging || (this.#digs(i) && rng() < START * (this.crowded() ? 1 : ROOMY_DIG)) ? DIG_FACE : GLANCE;
      // Zoned by age (slice 6): only the middle-aged dig; others meeting a face turn along it.
      else if (face === DIG_FACE && !digging && !this.#digs(i)) face = GLANCE;
      // A roomy nest (ja-wii): a tunnel's end met head-on is dug only now and then; turned along the wall otherwise, so the
      // next tick doesn't simply try again.
      else if (face === DIG_FACE && !digging && Number.isNaN(this.digAim[i] as number) && map.chambers && !this.crowded() && rng() > ROOMY_DIG) face = GLANCE; // (an aimed face passed ROOMY_DIG when it was chosen)
      // A chamber face it aimed at (widening a chamber, or a new one off a tunnel): dug whatever the tunnel rules say,
      // but not soil put back moments ago (see refilled: #17's hold on refilled cells).
      if (face !== NO_FACE && this.#chamberCell[i] >= 0 && mode === EXPLORE && !carrying && !pellet) {
        cellOf(nx, ny);
        if (this.#chamberCell[i] === (CELL[1] as number) * 65536 + (CELL[0] as number) && rockAt(map, CELL[0] as number, CELL[1] as number) === SOIL && this.#digs(i) && this.crowded() && !refilled(map, CELL[0] as number, CELL[1] as number, this.time)) face = DIG_FACE;
      }
      if (face === DIG_FACE && map.sky) {
        cellOf(nx, ny);
        const looseFace = map.loose?.get(CELL[0] as number, CELL[1] as number) === 1;
        this.antCell(i);
        // Loose soil is picked up only by the rules of #pickLoose (spreading, backfill), never dug at head-on: explorers on
        // the ground line chewed the mound and carried it to the hole and out again. (From below it can't be met: the ground
        // under the mound is crust, see #crust. Digging it "from below in a quarter of the time" never ran: review of MR 15.)
        if (looseFace || !this.#mayDig(CELL[0] as number, CELL[1] as number)) face = GLANCE;
      }
      if (face !== NO_FACE) {
        // Digging: an explorer that meets soil head-on bites at it for DIG_TIME (1–2 s), then the cell
        // is open and the ant carries the pellet home. Any other touch of soil puts a hand on the wall.
        if (face === GLANCE) {
          this.digT[i] = 0; // a face that stopped being diggable (a neighbour dug beside it) is left
          this.digAim[i] = NaN;
          this.hugT[i] = HUG_TIME;
          // Facing along the wall, the soil it touched ahead on its hand side.
          this.gdir[i] = (crossedDir(map, this.x[i] as number, this.y[i] as number, nx, ny) - (this.hand[i] as number) + 6) % 6;
          this.gx[i] = NO_CELL;
        } else if (!digging) {
          cellOf(nx, ny);
          this.digT[i] = DIG_TIME * (1 + rng());
        }
        else {
          const left = (this.digT[i] as number) - dt;
          this.digT[i] = Math.max(0, left);
          cellOf(nx, ny);
          const fx = CELL[0] as number;
          const fy = CELL[1] as number;
          if (left <= 0 && this.#crust(fx, fy)) {
            // The side view: the ground line's crust is left (see #crust); it turns along it instead.
            this.digT[i] = 0;
            this.digAim[i] = NaN;
            this.hugT[i] = HUG_TIME;
            this.gx[i] = NO_CELL;
          } else if (left <= 0 && digCell(map, fx, fy, this.time)) {
            // A chamber face: the cell joins its chamber (or founds a new one, if there is still room for one there).
            if (this.#chamberCell[i] === fy * 65536 + fx && map.chambers) this.#chamberDug(i, fx, fy);
            this.#chamberCell[i] = -1;
            // The new cell carries the tunnel's run on: the heading chosen at the end, or the way it was dug.
            const aim = this.digAim[i] as number;
            setTunnelHeading(map, fx, fy, Number.isNaN(aim) ? (DIR_ANGLE[crossedDir(map, this.x[i] as number, this.y[i] as number, nx, ny)] as number) + gauss(rng) * TUNNEL_DRIFT : aim);
            this.digAim[i] = NaN;
            this.soilDug++;
            this.pellet[i] = 1;
            this.since[i] = 0;
            this.#lastDug[i] = fy * 65536 + fx;
            this.#looked[i] = -1; // a new trip home: every cell on it is looked round afresh
            this.#cameFrom[i] = -1;
            this.#homeAfresh(i); // a fresh trip home: the bumps and detour it ran up exploring the tunnels are behind it
            h += Math.PI;
          }
        }
      } else if (!landOpen) {
        this.digT[i] = 0;
        // Read afresh: a give-up earlier this tick has just started a wander, and must not start a new wall.
        const wandering = (this.detour[i] as number) > 0;
        if (mode === RETURN && !wandering) {
          // Homing: start (or keep) following this wall by touch instead of turning at random.
          const x = this.x[i] as number;
          const y = this.y[i] as number;
          if (this.wall[i] === 0) {
            const toNest = Math.atan2(nest.y - y, nest.x - x);
            // Underground, every wall (soil, or rock in dug ground) is followed cell by cell, and re-anchors the
            // line home: the review of #10 found carriers circling rock specks in caverns by touch for up to
            // 120 s, out of reach of every release the cell-by-cell follower has. On open ground, rock keeps the
            // touch rule. The cell is the landing cell the step was judged on (lx, ly: float32, as stored).
            const cellWall = map.hasSoil || rockAt(map, lx, ly) === SOIL;
            const newTrip = Number.isNaN(this.mx[i] as number);
            if (newTrip) this.#noGain[i] = 0;
            if (newTrip || cellWall) {
              // The first rock this trip: remember where, so the line from here to the nest is the way home it
              // keeps returning to. Walls underground re-anchor it at every wall: in dug ground the ant meets speck
              // after speck, and heading home from wherever it left the last one it is rarely back on the
              // first wall's line, so it would circle a speck until it gave up (review of MR 8).
              this.mx[i] = x;
              this.my[i] = y;
            }
            this.wall[i] = wallSide(this.#touch(x, y, toNest - WALL_PROBE, 1.2), this.#touch(x, y, toNest + WALL_PROBE, 1.2), rng);
            // Underground, the distance to beat is the nearest it has been this trip (re-anchoring the line at
            // every wall must not forget progress, or it could leave a wall and meet it again for ever).
            const d = Math.hypot(nest.x - x, nest.y - y);
            this.hitDist[i] = cellWall && !newTrip ? Math.min(this.hitDist[i] as number, d) : d;
            // Back on a wall it lost touch with: the clock runs on, or let-go and re-bump would never give up.
            if (!((this.untouched[i] as number) > WALL_LOST)) this.followT[i] = 0;
            this.untouched[i] = 0;
            // Facing the wall it met, turned away from the side it keeps the wall on; the first cell decides the way on.
            this.gdir[i] = (crossedDir(map, x, y, nx, ny) - (this.wall[i] as number) + 6) % 6;
            this.gx[i] = NO_CELL;
            cellOf(x, y);
            const hx = CELL[0] as number;
            const hy = CELL[1] as number;
            this.byCell[i] = cellWall || tunnel(map, hx, hy) ? 1 : 0;
          }
          if (!this.byCell[i]) h -= (this.wall[i] as number) * (Math.PI / 2); // by touch: turn away from the wall, along it
          else {
            // By cell and blocked: it stands right on its cell's edge (a straight line from inside a cell to a neighbour's
            // centre never leaves the two), so the way to the next cell grazes the solid one beside it and every step lands
            // there. A quarter of the way back to its own cell's centre takes it off the edge. Not only when it was already
            // following a wall (the first rule): where the wall is let go of before the next step (every tick
            // on the ground line; a release into scent in a tunnel), the ant was blocked the same way every tick, for good
            // (review of #17: about 20 homing ants frozen in the walkway cell above the hole; 21 at one cell in a tunnel on
            // seed 3 with the fixes of PRD §40, before this).
            this.antCell(i);
            this.x[i] = x + (centreX(CELL[0] as number, CELL[1] as number) - x) * 0.25;
            this.y[i] = y + (centreY(CELL[1] as number) - y) * 0.25;
          }
        } else {
          h += Math.PI / 2 + rng() * Math.PI;
          // Each bump soon after another doubles the detour: 0.5–1.5 s, then 1–3 s, … up to 8–24 s.
          // Not for a homing ant already on one (after giving up on a wall): in a tunnel it bumps all
          // the time, and topping the detour up would keep it from ever trying for home again.
          this.bumps[i] = Math.min(5, (this.bumps[i] as number) + 1);
          if (mode !== RETURN) this.detour[i] = Math.max(this.detour[i] as number, 0.5 * 2 ** Math.floor(this.bumps[i] as number) * (0.5 + rng()));
        }
      } else {
        this.digT[i] = 0; // the face it was digging opened (another ant dug it), or it turned off it (its aim stays: it is walking up to the face)
        this.x[i] = nx;
        this.y[i] = ny;
        this.#cellX[i] = lx;
        this.#cellY[i] = ly;
        this.#cellAtX[i] = this.x[i] as number;
        this.#cellAtY[i] = this.y[i] as number;
      }

      // Mechanics: pick up food where there is some (not mid-fight), put it down at the nest; the nest rests a tired ant.
      const ndx = (this.x[i] as number) - home.x;
      const ndy = (this.y[i] as number) - home.y;
      const atNest = ndx * ndx + ndy * ndy < home.r * home.r;
      const ent = this.#entrance;
      const atEntrance = ent !== null && Math.hypot((this.x[i] as number) - ent.x, (this.y[i] as number) - ent.y) < ent.r;
      this.antCell(i);
      // Activation (behaviour MR 5, docs/activation.md): an empty-jawed ant at home meets each nestmate that comes home
      // with food beside it (its cell and the six round it) once, in a count that leaks away; only successful returns
      // count. Counted as seconds of contact instead, a carrier, which turns round the moment its food is down, was met
      // for a tick: the count stayed under the threshold, and only scouts went out.
      if (gate) {
        let m = (this.met[i] as number) * metLeak;
        if (atNest && !carrying) m += this.#returnsAround(CELL[0] as number, CELL[1] as number);
        this.met[i] = m;
      }
      // How crowded home is (docs/stance.md), felt by a waiting ant: nestmates in its cell and the six round it, but itself.
      if (sgate) {
        const c = this.crowd[i] as number;
        this.crowd[i] = atNest && !carrying ? c * crowdKeep + (this.#nestmatesAround(CELL[0] as number, CELL[1] as number) - 1) * (1 - crowdKeep) : c * crowdKeep;
      }
      // A load just put down here isn't taken straight back up: not until the ant has stepped off the cell.
      const cellKey = (CELL[1] as number) * 65536 + (CELL[0] as number);
      if (this.#putAt[i] !== cellKey) this.#putAt[i] = -1;
      if (!carrying && !pellet && this.#putAt[i] < 0 && map.food.get(CELL[0] as number, CELL[1] as number) > 0 && resp.get(this.touch(i, toEnemy !== null, mode, item, "food")) && takeFoodCell(map, CELL[0] as number, CELL[1] as number)) {
        this.carrying[i] = 1;
        this.quality[i] = qualityAt(map, CELL[0] as number, CELL[1] as number);
        this.#homeAfresh(i);
        this.since[i] = 0;
        this.fatigue[i] = 0; // found food: the search succeeded
        this.#tired[i] = 0;
        h += Math.PI;
      } else if (pellet && ent && !Number.isNaN(this.#spoilTo[i] as number)) {
        // Carrying a pellet out along the ground (side view): dropped where it stands once far enough out (or stuck).
        this.#spoilT[i] = (this.#spoilT[i] as number) + dt;
        const col = CELL[0] as number;
        const onGround = isSky(map, col, CELL[1] as number);
        if ((onGround && (this.#spoilSide[i] as number) * (col - this.#entranceCol) >= (this.#spoilTo[i] as number)) || (this.#spoilT[i] as number) > (this.#corpse[i] ? CORPSE_GIVE_UP : SPOIL_GIVE_UP)) this.#dropOut(i, col);
        // Dropped, it doesn't turn back: out on the ground, it is asked afresh (most explore it), so the ground near the
        // nest is searched. Turned straight back in, almost nobody was on the ground to find the food there.
      } else if (pellet && atEntrance && this.#soil[i] !== SOIL_FILL) {
        // Up and out of the hole: it carries the pellet on out along the ground to drop it, farther as the mound grows
        // (MOUND_REACH at most; more of them farther out, √ of a uniform draw), so the mound spreads as a disc, its area
        // tracking the nest's volume (Tschinkel 2015), where you see them drop it.
        const reach = Math.min(MOUND_REACH, 3 + this.#heaped / (2 * MOUND_HEIGHT));
        if (this.#corpse[i]) {
          // A corpse goes to the midden: one heap just past the mound's edge (harvesters: at the edge of the cleared disc).
          this.#spoilTo[i] = this.#middenAt();
          this.#spoilSide[i] = this.#middenSide();
        } else {
          this.#spoilTo[i] = 2 + reach * Math.sqrt(rng());
          this.#spoilSide[i] = rng() < 0.5 ? -1 : 1;
        }
        this.#spoilT[i] = 0;
        this.#staleWalk[i] = 0;
        this.wall[i] = 0;
        this.mx[i] = NaN;
        this.gx[i] = NO_CELL;
      } else if (pellet && this.#soil[i] === SOIL_FILL && atNest) {
        // A loose pellet taken down to fill unused space, and none found on the way: it carries it back out. Most do (over
        // 90 %: PRD §40), and that is the rule as meant: see LOOSE_FILL_PICK.
        this.#soil[i] = SOIL_LOOSE;
        this.looseBack++;
        this.wall[i] = 0;
        this.mx[i] = NaN;
      } else if (ent && !carrying && !pellet && mode === EXPLORE && isSky(map, CELL[0] as number, CELL[1] as number) && this.#enteredCell(i) && this.#pickLoose(i, CELL[0] as number, CELL[1] as number, toEnemy !== null)) {
        // Picked up a loose pellet off the mound (see #pickLoose).
      } else if (atNest && !(pellet && ent)) {
        this.wall[i] = 0;
        this.mx[i] = NaN;
        this.untouched[i] = 0;
        this.bestD[i] = Infinity;
        this.stallT[i] = 0;
        if ((this.since[i] as number) > 0) this.hand[i] = rng() < 0.5 ? -1 : 1; // just in: the next trip out keeps whichever hand on the walls
        if (carrying && !this.queen && resp.drop(this.touch(i, toEnemy !== null, mode, item))) {
          this.carrying[i] = 0;
          this.stored++;
          this.larder++;
          if (gate) this.#returning.set(cellKey, (this.#returning.get(cellKey) ?? 0) + 1);
          h += Math.PI;
        } else if (pellet && !ent) {
          // The soil goes on the mound: real ants dump it round the entrance, which is how mounds grow.
          this.pellet[i] = 0;
          this.soilOut++;
          h += Math.PI;
        }
        this.since[i] = 0;
        // Home and resting in "return" (its policy said so, or a cached answer did: ja-qnx): after REST seconds it is
        // asked afresh as an explorer, once it is no longer tired (fatigue rests it first: ja-q47).
        if (mode === RETURN && !carrying && !pellet && !this.#isTired(i) && (this.#restT[i] = (this.#restT[i] as number) + dt) > REST && (!gate || ((rolled = true), this.#leaves(i, dt, toEnemy !== null)))) {
          this.mode[i] = EXPLORE;
          this.#asked[i] = -1;
          this.#restT[i] = 0;
        }
      } else this.since[i] = (this.since[i] as number) + dt;
      if (!atNest) this.#restT[i] = 0;
      // Fatigue (ja-q47, docs/tiredness.md): what makes a forager tired is an unsuccessful search, and rest is a stay
      // inside. It grows only while the ant is out with empty jaws, exploring, following or fighting (a raid or a defence
      // tires it too: with fights left out, nothing sent a fighter home, raids never ended and combat losses rose 56-72 %,
      // review of #36), and falls while it is inside its own nest (its hole on the ground or its tunnels and chambers),
      // a full rest taking restTime. Finding food clears it (above). Digging, carrying spoil or nursing
      // neither tire nor rest it. Before, a timer that only the hole reset made every inside worker "tired".
      {
        const inside = atNest || (ent !== null && this.#under[i] === 1 && this.#ownNestHere(i));
        // Both run on the ant's clock (the fungus's lever slows tiring and resting alike), and fatigue stops at twice
        // patience, so an ant kept out (by Jev, say) needs no more than twice restTime to rest (review of #36).
        const m = this.mode[i];
        if (inside) this.fatigue[i] = Math.max(0, (this.fatigue[i] as number) - ((p.patience / p.restTime) * dt) / (this.clock[i] as number));
        else if (!this.carrying[i] && !this.pellet[i] && !this.#holdsBrood[i] && (m === EXPLORE || m === FOLLOW || m === FIGHT)) this.fatigue[i] = Math.min(2 * p.patience, (this.fatigue[i] as number) + dt / (this.clock[i] as number));
        // Tired once past patience, and until fully rested: resting only to just under the line sent foragers out to
        // tire again at once (G: up to 8 held, food home -9 %, in the first sweep).
        if ((this.fatigue[i] as number) > p.patience) this.#tired[i] = 1;
        else if (this.fatigue[i] === 0) this.#tired[i] = 0;
      }
      // Home (ja-qnx): going home is a trip, and it ends there. An ant asked what to do with "return" as its mode keeps
      // returning (Jev answered "return" to every returner, home or not: PRD §42.4), so a fresh one that has got home with
      // empty jaws is no longer returning: it is asked afresh as `arrive` says. In the side view a tired one stays in, as
      // before: nothing underground rests it, so the colony's tired foragers retire inside (resting them sent them out
      // again, and more food than the porters could carry piled up at reception, A8). On a top-down map rest is instant:
      // the nest has just reset `since` above, so every returner there reads fresh and goes out at once (a timer artefact
      // that ja-q47 replaces). Home is the nest on a top-down
      // map. In the side view it is the royal chamber, where a returner homes to, and only for foragers (the old, zoned
      // by age), as measured:
      // - at its hole (passed on the way in, where a returner is asked afresh anyway) the trip's end sent explorers down
      //   the carriers' food scent into the nest, where they jammed carriers (A8);
      // - in any chamber, it left the young off the queen's side (zoning.test);
      // - for the young and middle-aged, who work inside, it sent porters out and the queen starved on 1-2 of 4 worlds in
      //   the hour-long economy run (slow/economy.test).
      if (p.arrive !== "return" && this.mode[i] === RETURN && !carrying && !pellet && !nursing && !this.#isTired(i) && (ent === null ? atNest : this.#under[i] === 1 && this.band(i) === 2 && this.#home(i)) && (!gate || (!rolled && this.#leaves(i, dt, toEnemy !== null)))) {
        this.mode[i] = p.arrive === "follow" ? FOLLOW : EXPLORE;
        this.#asked[i] = -1;
        this.#restT[i] = 0;
      }
      if (ent) {
        // Zoned by age (slice 6): an ant not to go out that has just stepped up out of the hole onto the ground goes
        // back down (carriers aside: soil goes out to the mound; food is on its way in).
        if (this.queen && this.#under[i] && !carrying && !pellet && !this.#mayGoOut(i)) {
          this.antCell(i);
          if (isSky(map, CELL[0] as number, CELL[1] as number)) {
            // Back, and pointed down the shaft (its deepest open neighbour underground), the walker aimed at that cell: only
            // turning it round left it in the hole, which is no tunnel, steering at random into the sky again and again
            // (review of slice 6: ants pinned there up to 45 s, a tenth to a fifth of their time).
            this.x[i] = x0;
            this.y[i] = y0;
            cellOf(x0, y0);
            const bx = CELL[0] as number;
            const by = CELL[1] as number;
            let down = -1;
            let deepest = -Infinity;
            for (let d = 0; d < 6; d++) {
              const tx = stepX(bx, by, d);
              const ty = stepY(by, d);
              if (rockAt(map, tx, ty) === OPEN && !isSky(map, tx, ty) && centreY(ty) > deepest) ((deepest = centreY(ty)), (down = d));
            }
            if (down >= 0) {
              h = DIR_ANGLE[down] as number;
              this.gdir[i] = down;
              this.gx[i] = stepX(bx, by, down);
              this.gy[i] = stepY(by, down);
            } else {
              h += Math.PI;
              this.gx[i] = NO_CELL;
            }
            this.#cellAtX[i] = NaN; // its cell is worked out afresh
          }
        }
        this.#integrate(i, x0, y0, atNest);
        // Road signs: underground, a strong nest trail where it stands tells it where it is, and its memory's error fades
        // (Heyman et al. 2017; slice 3 gives each chamber its own mark). Outside, the hole's sight and smell do it (#believe).
        // Read on the floor where it stands (a road sign is under its antennae; the sensors ahead are often in soil in a tunnel).
        if (this.#under[i] && (ph.fields.home.get(CELL[0] as number, CELL[1] as number) * (this.gainHome[i] as number) >= STRONG || ph.fields[this.#destMark(i)].get(CELL[0] as number, CELL[1] as number) * (this.gainHome[i] as number) * (this.gainMarks[i] as number) >= STRONG)) this.odoNest[i] = (this.odoNest[i] as number) * Math.exp(-dt / ROAD_SIGN);
        if (this.map.chambers) this.#layMark(i, dt);
        if (this.queen) {
          this.#nurse(i, dt, toEnemy !== null);
          if (this.#port(i, dt, toEnemy !== null)) h += Math.PI;
          this.#undertake(i, dt, toEnemy === null);
        }
      }
      this.heading[i] = h;
    }
    if (this.#entrance) {
      let under = 0;
      let out = 0;
      for (let k = 0; k < this.n; k++) if (this.alive[k]) this.#under[k] ? under++ : out++;
      this.inNest = under;
      this.outside = out;
    }
    ph.advance(dt);
    // Growth: in the side view, the queen and brood (#nestLife); elsewhere the larder turns into ants while there is room.
    if (this.queen) {
      this.#nestLife(dt);
      this.#middenSmell(dt);
    }
    else while (this.larder >= p.foodPerAnt && this.spawn()) this.larder -= p.foodPerAnt;
  }

  // ——— saving (save.ts, ja-lo8.6) ———

  /**
   * This colony's state for a save: its public data (not the references the game wires: the map, other colonies'
   * scent, the grids, its policies; its own scent saves itself), and every private field but its random stream (the game saves that,
   * shared by every colony). Generated from the field declarations; tests/save.test.ts fails on any field missed.
   */
  saveState(): Record<string, unknown> {
    return {
      fields: saveFields(this, COLONY_SKIP),
      private: encodeSave({
      ti: this.#ti,
      alarmAnt: this.#alarmAnt,
      alarmSmelt: this.#alarmSmelt,
      oddsNow: this.#oddsNow,
      t: this.#t,
      cellX: this.#cellX,
      cellY: this.#cellY,
      cellAtX: this.#cellAtX,
      cellAtY: this.#cellAtY,
      noTunnel: this.#noTunnel,
      staleWalk: this.#staleWalk,
      looked: this.#looked,
      goalKind: this.#goalKind,
      under: this.#under,
      groundMin: this.#groundMin,
      groundT: this.#groundT,
      outDist: this.#outDist,
      outCells: this.#outCells,
      outVersion: this.#outVersion,
      outAt: this.#outAt,
      groundRef: this.#groundRef,
      chamberCell: this.#chamberCell,
      chamberFor: this.#chamberFor,
      lastRole: this.#lastRole,
      sinceRole: this.#sinceRole,
      restT: this.#restT,
      layT: this.#layT,
      holdsBrood: this.#holdsBrood,
      broodTo: this.#broodTo,
      holdT: this.#holdT,
      portTo: this.#portTo,
      porter: this.#porter,
      inJaws: this.#inJaws,
      corpse: this.#corpse,
      loaded: this.#loaded,
      putAt: this.#putAt,
      belief: this.#belief,
      entrance: this.#entrance,
      entranceCol: this.#entranceCol,
      entranceRow: this.#entranceRow,
      holes: this.#holes,
      spoilTo: this.#spoilTo,
      spoilSide: this.#spoilSide,
      spoilT: this.#spoilT,
      soil: this.#soil,
      heaped: this.#heaped,
      goalX: this.#goalX,
      goalY: this.#goalY,
      holeX: this.#holeX,
      cameFrom: this.#cameFrom,
      lastDug: this.#lastDug,
      noGain: this.#noGain,
      gone: this.#gone,
      pastEnd: this.#pastEnd,
      defending: this.#defending,
      storedSeen: this.#storedSeen,
      returning: this.#returning,
      returned: this.#returned,
      tired: this.#tired,
      asked: this.#asked,
      question: this.#question,
      s: this.#s,
      chamberNest: this.#chamberNest,
      goalCells: this.#goalCells,
      want: this.#want,
      enRouteTo: this.#enRouteTo,
      portViewAt: this.#portViewAt,
      }),
    };
  }

  /** A saved state back into this colony (saveState), in place where it can be: a fresh colony of the same world and params. */
  loadState(saved: Record<string, unknown>): void {
    loadFields(this, saved.fields as Record<string, unknown>);
    const r = saved.private as Record<string, unknown>;
    if ("ti" in r) this.#ti = fillLike(this.#ti, r.ti) as never;
    if ("alarmAnt" in r) this.#alarmAnt = fillLike(this.#alarmAnt, r.alarmAnt) as never;
    if ("alarmSmelt" in r) this.#alarmSmelt = fillLike(this.#alarmSmelt, r.alarmSmelt) as never;
    if ("oddsNow" in r) this.#oddsNow = fillLike(this.#oddsNow, r.oddsNow) as never;
    if ("t" in r) this.#t = fillLike(this.#t, r.t) as never;
    if ("cellX" in r) this.#cellX = fillLike(this.#cellX, r.cellX) as never;
    if ("cellY" in r) this.#cellY = fillLike(this.#cellY, r.cellY) as never;
    if ("cellAtX" in r) this.#cellAtX = fillLike(this.#cellAtX, r.cellAtX) as never;
    if ("cellAtY" in r) this.#cellAtY = fillLike(this.#cellAtY, r.cellAtY) as never;
    if ("noTunnel" in r) this.#noTunnel = fillLike(this.#noTunnel, r.noTunnel) as never;
    if ("staleWalk" in r) this.#staleWalk = fillLike(this.#staleWalk, r.staleWalk) as never;
    if ("looked" in r) this.#looked = fillLike(this.#looked, r.looked) as never;
    if ("goalKind" in r) this.#goalKind = fillLike(this.#goalKind, r.goalKind) as never;
    if ("under" in r) this.#under = fillLike(this.#under, r.under) as never;
    if ("groundMin" in r) this.#groundMin = fillLike(this.#groundMin, r.groundMin) as never;
    if ("groundT" in r) this.#groundT = fillLike(this.#groundT, r.groundT) as never;
    if ("outDist" in r) this.#outDist = fillLike(this.#outDist, r.outDist) as never;
    if ("outCells" in r) this.#outCells = fillLike(this.#outCells, r.outCells) as never;
    if ("outVersion" in r) this.#outVersion = fillLike(this.#outVersion, r.outVersion) as never;
    if ("outAt" in r) this.#outAt = fillLike(this.#outAt, r.outAt) as never;
    if ("groundRef" in r) this.#groundRef = fillLike(this.#groundRef, r.groundRef) as never;
    if ("chamberCell" in r) this.#chamberCell = fillLike(this.#chamberCell, r.chamberCell) as never;
    if ("chamberFor" in r) this.#chamberFor = fillLike(this.#chamberFor, r.chamberFor) as never;
    if ("lastRole" in r) this.#lastRole = fillLike(this.#lastRole, r.lastRole) as never;
    if ("sinceRole" in r) this.#sinceRole = fillLike(this.#sinceRole, r.sinceRole) as never;
    if ("restT" in r) this.#restT = fillLike(this.#restT, r.restT) as never;
    if ("layT" in r) this.#layT = fillLike(this.#layT, r.layT) as never;
    if ("holdsBrood" in r) this.#holdsBrood = fillLike(this.#holdsBrood, r.holdsBrood) as never;
    if ("broodTo" in r) this.#broodTo = fillLike(this.#broodTo, r.broodTo) as never;
    if ("holdT" in r) this.#holdT = fillLike(this.#holdT, r.holdT) as never;
    if ("portTo" in r) this.#portTo = fillLike(this.#portTo, r.portTo) as never;
    if ("porter" in r) this.#porter = fillLike(this.#porter, r.porter) as never;
    if ("inJaws" in r) this.#inJaws = fillLike(this.#inJaws, r.inJaws) as never;
    if ("corpse" in r) this.#corpse = fillLike(this.#corpse, r.corpse) as never;
    if ("loaded" in r) this.#loaded = fillLike(this.#loaded, r.loaded) as never;
    if ("putAt" in r) this.#putAt = fillLike(this.#putAt, r.putAt) as never;
    if ("belief" in r) this.#belief = fillLike(this.#belief, r.belief) as never;
    if ("entrance" in r) this.#entrance = fillLike(this.#entrance, r.entrance) as never;
    if ("entranceCol" in r) this.#entranceCol = fillLike(this.#entranceCol, r.entranceCol) as never;
    if ("entranceRow" in r) this.#entranceRow = fillLike(this.#entranceRow, r.entranceRow) as never;
    if ("holes" in r) this.#holes = fillLike(this.#holes, r.holes) as never;
    if ("spoilTo" in r) this.#spoilTo = fillLike(this.#spoilTo, r.spoilTo) as never;
    if ("spoilSide" in r) this.#spoilSide = fillLike(this.#spoilSide, r.spoilSide) as never;
    if ("spoilT" in r) this.#spoilT = fillLike(this.#spoilT, r.spoilT) as never;
    if ("soil" in r) this.#soil = fillLike(this.#soil, r.soil) as never;
    if ("heaped" in r) this.#heaped = fillLike(this.#heaped, r.heaped) as never;
    if ("goalX" in r) this.#goalX = fillLike(this.#goalX, r.goalX) as never;
    if ("goalY" in r) this.#goalY = fillLike(this.#goalY, r.goalY) as never;
    if ("holeX" in r) this.#holeX = fillLike(this.#holeX, r.holeX) as never;
    if ("cameFrom" in r) this.#cameFrom = fillLike(this.#cameFrom, r.cameFrom) as never;
    if ("lastDug" in r) this.#lastDug = fillLike(this.#lastDug, r.lastDug) as never;
    if ("noGain" in r) this.#noGain = fillLike(this.#noGain, r.noGain) as never;
    if ("gone" in r) this.#gone = fillLike(this.#gone, r.gone) as never;
    if ("pastEnd" in r) this.#pastEnd = fillLike(this.#pastEnd, r.pastEnd) as never;
    if ("defending" in r) this.#defending = fillLike(this.#defending, r.defending) as never;
    if ("storedSeen" in r) this.#storedSeen = fillLike(this.#storedSeen, r.storedSeen) as never;
    if ("returning" in r) this.#returning = fillLike(this.#returning, r.returning) as never;
    if ("returned" in r) this.#returned = fillLike(this.#returned, r.returned) as never;
    if ("tired" in r) this.#tired = fillLike(this.#tired, r.tired) as never;
    if ("asked" in r) this.#asked = fillLike(this.#asked, r.asked) as never;
    if ("question" in r) this.#question = fillLike(this.#question, r.question) as never;
    if ("s" in r) this.#s = fillLike(this.#s, r.s) as never;
    if ("chamberNest" in r) this.#chamberNest = fillLike(this.#chamberNest, r.chamberNest) as never;
    if ("goalCells" in r) this.#goalCells = fillLike(this.#goalCells, r.goalCells) as never;
    if ("want" in r) this.#want = fillLike(this.#want, r.want) as never;
    if ("enRouteTo" in r) this.#enRouteTo = fillLike(this.#enRouteTo, r.enRouteTo) as never;
    if ("portViewAt" in r) this.#portViewAt = fillLike(this.#portViewAt, r.portViewAt) as never;
  }
}

/** Every situation a mode choice can be asked in: mode × tired × food × home × alarm × enemy × stance = 4 × 2 × 3 × 9 × 3 × 2 × 3 = 3,888 (home: 3 trail levels or 6 places in the nest). */
export const SITUATIONS = MODES.length * 2 * TRAILS.length * HOMES.length * TRAILS.length * 2 * STANCES.length;

/** A situation from its index in SITUATIONS: the inverse of encode. */
export function decode(code: number): Situation {
  let c = code;
  const stance = STANCES[c % 3] as Stance;
  c = Math.floor(c / 3);
  const enemy = c % 2 ? "near" : "none";
  c = Math.floor(c / 2);
  const alarm = TRAILS[c % 3] as Trail;
  c = Math.floor(c / 3);
  const homeTrail = HOMES[c % HOMES.length] as Home;
  c = Math.floor(c / HOMES.length);
  const foodTrail = TRAILS[c % 3] as Trail;
  c = Math.floor(c / 3);
  const tired = c % 2 === 1;
  const mode = MODES[Math.floor(c / 2)] as Mode;
  return { mode, tired, foodTrail, homeTrail, alarm, enemy, stance };
}

export function encodeSituation(s: Situation): number {
  return encode(MODES.indexOf(s.mode), s.tired, s.foodTrail, s.homeTrail, s.alarm, s.enemy === "near" ? 1 : 0, STANCES.indexOf(s.stance));
}

/** encode's step per mode: encode(m, …) = encode(0, …) + m × MODE_STRIDE. */
const MODE_STRIDE = 2 * 3 * HOMES.length * 3 * 2 * 3;
function encode(mode: number, tired: boolean, food: Trail, home: Home, alarm: Trail, enemy: number, stance: number): number {
  return (((((mode * 2 + (tired ? 1 : 0)) * 3 + TRAILS.indexOf(food)) * HOMES.length + HOMES.indexOf(home)) * 3 + TRAILS.indexOf(alarm)) * 2 + enemy) * 3 + stance;
}

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
const M_LINE_WIDTH = 0.6;
/** Releases from a soil wall a trip may make without getting any nearer home, before only progress counts. */
const NO_GAIN = 3;
/** Nearer home than its best by this much (world units) counts as progress: it resets the no-gain count. */
const GAIN = 0.5;
/** A wall-follower this near the nest, with a clear way to it, sees (or smells) it and leaves the wall. */
const NEST_SIGHT = 8;
/** Path integration's drift (σ, per unit walked): the error is ~10 % of the distance walked (Wehner 2006; docs/nest-and-home.md §1). */
export const PI_DRIFT = 0.1;
/** Within this (world units) across the ground of the hole (and twice it up or down: the crater) an ant sees it and smells the entrance: its vector no longer matters. */
export const HOLE_SIGHT = 6;
/** The search round a believed goal that wasn't there: the first loop's reach (cells), each next one SEARCH_GROW times wider, to at most the map's width. */
const SEARCH_START = 3;
// Zoning by age (nest slice 6): see band, #mayGoOut, #digs.
/** Age bands, as shares of LIFESPAN: young below YOUNG, middle-aged below MIDDLE, old beyond. */
export const YOUNG = 0.15;
export const MIDDLE = 0.35;
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
// The queen and brood (nest slice 4): see #nestLife, #nurse. Food per worker is EGG_FOOD + LARVA_FOOD = foodPerAnt (4).
/** Food in an egg, and fed to a larva before it pupates. */
const EGG_FOOD = 1;
/** Seconds as an egg; at least this long as a larva (and fed); as a pupa. */
export const T_EGG = 15;
export const T_LARVA = 20;
export const T_PUPA = 20;
/** At most one egg this often (seconds), while there is food and room. */
const LAY_INTERVAL = 0.5;
/** The fungus's crown (nest slice 8): the chance a second that a host by the queen, or by a brood item, kills it, at full load (× its load). */
export const CROWN_RATE = 0.05;
/** Food a larva takes per second with two nurses or more by it. */
const FEED_RATE = 0.5;
// The midden (nest slice 7): see #undertake, #dropOut, #middenSmell.
/** Chance per second an idle middle-aged ant underground picks up a corpse within two cells of it. */
const PICK_CORPSE = 1;
/** The midden lies at least this many cells past the mound's reach. */
const MIDDEN_PAST = 3;
/** Corpses on the ground are taken to the midden from within this many columns of the hole (out to the midden). */
const MIDDEN_NEAR = 100;
/** Seconds an undertaker walks a corpse out before it puts it down short of the midden (a pellet's 15 s fell short of it on hilly ground). */
const CORPSE_GIVE_UP = 60;
/** Seconds after death a corpse not on the midden rots away (the dead in the field would otherwise pile up all game). */
export const CORPSE_ROT = 900;
/** Midden mark laid when a corpse is put on the midden; a tenth of it a second while it lies there. Each is spread over
 *  the cell's column and MIDDEN_SPREAD columns either side, tapering (review of #26: one cell at the saturated level). */
const MIDDEN_MARK = 20;
/** Columns either side of a midden cell its mark is laid over. */
const MIDDEN_SPREAD = 3;
/** How hard raiders turn away from the rival's midden mark, as a share of turnRate (alarm avoidance is alarmAvoid). */
const MIDDEN_AVOID = 1.5;
/**
 * A raider on the ground turns back from a cell of the rival's midden with chance 1 − exp(−mark / MIDDEN_SCALE), times
 * MIDDEN_CROWD / (its own colony's ants within two cells, itself included) once they are more than MIDDEN_CROWD: a scout
 * or a handful shies, a raid in force presses on (see #middenTurn).
 */
const MIDDEN_SCALE = 5;
const MIDDEN_CROWD = 3;
/** Chance per second an idle ant in reception or a store, with food there, carries a unit on (see #port). */
const PORT_RATE = 3;
/** Food the royal chamber is kept stocked with for the queen (a few eggs' worth, and the larvae lying with her). */
const QUEEN_STOCK = 8;
/** Chance per second an idle ant in the royal chamber picks up an egg near it to take to a brood chamber. */
const PICK_BROOD = 0.5;
/** Seconds a nurse holds brood before it puts it down wherever it is; a porter, its food, in whichever of its chambers it is by. */
const HOLD_MAX = 30;
/** A forager's food goes to reception only once it is a chamber of this many cells (see #foodTo); until then, to the royal chamber. */
const RECEPTION_MIN = 4;
/** Rows either side of a chamber's mean row searched for its cell nearest that mean (the founding disc is the tallest: 9 rows). */
const CHAMBER_SCAN = 5;
/** A worker's mean lifespan, seconds (each 0.7–1.3× it): an orphaned colony dwindles as its workers age out. */
export const LIFESPAN = 3600;
/** The queen's royal mark per second; her death rate per stranger at her side. */
const QUEEN_MARK = 10;
const QUEEN_FIGHT = 1;
// Floor marks (nest slice 3): see #layMark, #destMark, #roleFor.
/** Marks are laid at the colony's trail deposit per second just out of a chamber, falling to 1/e after MARK_DECAY seconds away from it. */
const MARK_DECAY = 30;
/** How much more a homing ant in a tunnel goes by its destination's mark than by the home trail. */
const SIGN_WEIGHT = 4;
/** A new chamber this many rows above the royal one may be the reception (the colony's first); this many below, a store. */
const RECEPTION_ABOVE = 4;
const STORE_BELOW = 2;
// Chambers (nest slice 2): see crowded(), #widenWay, #newChamberWay.
/** Floor cells a nest keeps per ant underground: below it the nest is crowded and digs (Odontomachus ~2 cm² per worker, at the sim's scale). */
export const FLOOR_PER_ANT = 0.1;
/** Chance an explorer touching its crowded chamber's wall widens it there; brood lying in it makes it likelier (× 1 + BROOD_PULL per brood, up to 10). */
const WIDEN = 0.3;
const BROOD_PULL = 0.2;
/** Widening falls off with a chamber's depth (rows) as exp(−depth / WIDEN_DEPTH). */
const WIDEN_DEPTH = 30;
/** Chance per tunnel cell (at the surface; × exp(−depth / CHAMBER_DEPTH)) that a crowded explorer starts a new chamber there. */
const NEW_CHAMBER = 0.04;
const CHAMBER_DEPTH = 40;
/** No chamber within the top rows (the crust and mound), and none within CHAMBER_GAP + depth × CHAMBER_GAP_GROWTH rows (and CHAMBER_SPREAD columns) of another. */
export const CHAMBER_MIN_DEPTH = 8;
const CHAMBER_GAP = 4;
const CHAMBER_GAP_GROWTH = 0.15;
const CHAMBER_SPREAD = 10;
/** A roomy nest digs this share as often as before (tunnels at dead ends, starts off walls, head-on). */
export const ROOMY_DIG = 0.15;
/** Cells a homing ant follows the ground's surface round spoil before trying the other hand (then twice as far each time: see flipDue). */
const GROUND_FLIP = 24;
/** Whether, after `t` cells on the ground's surface, the ant turns back with the other hand: at GROUND_FLIP × (1, 3, 7, 15, ...) cells, so each leg is twice the last and passes where the one before began. */
function flipDue(t: number): boolean {
  if (t % GROUND_FLIP !== 0) return false;
  const k = t / GROUND_FLIP + 1;
  return (k & (k - 1)) === 0;
}
/** The ways from a cell, upward ones first (NW, NE), then level, then down: gravity breaks ties when climbing out. */
const UP_FIRST = [4, 5, 0, 3, 1, 2] as const;
/** Seconds between rebuilds of the way-out field (#outField) while the ground keeps changing; a cell dug since steps straight toward the hole meanwhile. */
const OUT_FIELD_EVERY = 0.5;
/** Cells an ant feels ahead along the surface, each way, to choose which hand to follow it with. */
const GROUND_LOOK = 16;
/** Seconds on a strong nest trail for the in-nest memory's error to fall to 1/e. */
const ROAD_SIGN = 2;
const SEARCH_GROW = 1.6;
/** A believed hole is never nearer the map's side than this (world units): the walkway's end columns' centres are within 1 of it, so an ant there counts as at its belief. */
const EDGE = 0.75;
/** The two touch probes that pick which side to keep a newly met wall on: this far either side of the home vector. */
const WALL_PROBE = Math.PI / 3;

/**
 * Which side to keep a newly met wall on, from touch probes left and right of the home vector:
 * turn toward the open side, so the wall stays on the other (+1 = wall on the right). Both open or
 * both blocked: either.
 */
export function wallSide(leftBlocked: boolean, rightBlocked: boolean, rng: () => number): -1 | 1 {
  if (leftBlocked !== rightBlocked) return leftBlocked ? -1 : 1;
  return rng() < 0.5 ? -1 : 1;
}

/** No cell: a wall-follower with this as its target decides its next cell from where it stands. */
const NO_CELL = -0x80000000;
/** What a pellet is (Colony #soil): soil an ant dug; loose soil off the mound going out; loose soil going down to fill. */
const SOIL_DUG = 0;
const SOIL_LOOSE = 1;
const SOIL_FILL = 2;

/** A standard normal draw (Box–Muller). */
function gauss(rng: () => number): number {
  return Math.sqrt(-2 * Math.log(1 - rng())) * Math.cos(2 * Math.PI * rng());
}

/** The signed difference a − b, wrapped into −π..π. */
export function angleDiff(a: number, b: number): number {
  let d = (a - b) % (2 * Math.PI);
  if (d > Math.PI) d -= 2 * Math.PI;
  if (d < -Math.PI) d += 2 * Math.PI;
  return d;
}

/** Whether cell (x, y)'s neighbour the way `d` is open. */
function openAt(map: WorldMap, x: number, y: number, d: number): boolean {
  return rockAt(map, stepX(x, y, ((d % 6) + 6) % 6), stepY(y, ((d % 6) + 6) % 6)) === OPEN;
}

/**
 * Which way to dig on from tunnel cell (x, y) toward heading `aim`: of the two ways either side of
 * it, the far one with probability ∝ how near the heading is to it (`u` uniform in 0..1), so over
 * many cells the tunnel runs at the heading itself, not along one of the six ways. If that cell can't
 * be dug, the other; failing both, the diggable way nearest the heading; −1 if none. A cell filled
 * back less than BACKFILL.hold seconds before `now` is never dug (see refilled).
 */
export function chooseDig(map: WorldMap, x: number, y: number, aim: number, u: number, now = Infinity): number {
  const a = (((aim / (Math.PI / 3)) % 6) + 6) % 6;
  const lo = Math.floor(a) % 6;
  const hi = (lo + 1) % 6;
  const first = u < a - Math.floor(a) ? hi : lo;
  let dug = -1;
  let off = Infinity;
  for (const d of [first, first === lo ? hi : lo, 0, 1, 2, 3, 4, 5]) {
    const tx = stepX(x, y, d);
    const ty = stepY(y, d);
    if (rockAt(map, tx, ty) !== SOIL || !diggable(map, tx, ty, d) || refilled(map, tx, ty, now)) continue;
    if (d === hi || d === lo) return d;
    const o = Math.abs(angleDiff(DIR_ANGLE[d] as number, aim));
    if (o < off) {
      off = o;
      dug = d;
    }
  }
  return dug;
}

/**
 * Whether cell (x, y) is in a tunnel: one cell wide wherever it is, so no two of its neighbours next to
 * each other are both open (three open cells round a corner are a chamber's, the hex grid's 2×2).
 * Junctions and crossings of tunnels count; a chamber's edge doesn't.
 */
export function narrow(map: WorldMap, x: number, y: number): boolean {
  let prev = openAt(map, x, y, 5);
  for (let d = 0; d < 6; d++) {
    const o = openAt(map, x, y, d);
    if (o && prev) return false;
    prev = o;
  }
  return true;
}

/** A cell of a dug tunnel: narrow, with soil on at least one side. (A gap between rocks on the open surface isn't one.) */
export function tunnel(map: WorldMap, x: number, y: number): boolean {
  if (!map.hasSoil || !narrow(map, x, y)) return false;
  for (let d = 0; d < 6; d++) if (rockAt(map, stepX(x, y, d), stepY(y, d)) === SOIL) return true;
  return false;
}

/**
 * The way (0–5) a step from world (x, y) to (px, py) crossed into the next cell: toward the solid it
 * ran into. Not into a neighbour (no crossing): the way nearest the step's own direction.
 */
export function crossedDir(map: WorldMap, x: number, y: number, px: number, py: number): number {
  cellOf(x, y);
  const cx = CELL[0] as number;
  const cy = CELL[1] as number;
  cellOf(px, py);
  const tx = CELL[0] as number;
  const ty = CELL[1] as number;
  for (let d = 0; d < 6; d++) if (stepX(cx, cy, d) === tx && stepY(cy, d) === ty) return d;
  void map;
  return dirOf(Math.atan2(py - y, px - x));
}

/**
 * The wall-follower's next way from cell (x, y), facing `dir`, keeping the wall on `side` (+1 right,
 * −1 left): the first open one going round from the hand side (60°) through straight on to the
 * other side, then the sharp turn hand-ward (120°), back last. It turns hand-ward only round a wall that is there (a solid cell on
 * the hand side): in open ground, turning hand-ward every cell would circle three cells for ever.
 */
export function handOnWall(map: WorldMap, x: number, y: number, dir: number, side: number): number {
  const lost = openAt(map, x, y, dir + side) && openAt(map, x, y, dir + 2 * side);
  // The sharp 120° turn hand-ward comes last but for going back: it always leads into a cell touching
  // the one it came from, so taking it first spins round three open cells that meet at a corner (the
  // stall scan of MR 9 found carriers doing that for over a minute). One-cell tunnels never need it.
  const order = lost ? [0, -side, -2 * side, side, 2 * side, 3] : [side, 0, -side, -2 * side, 2 * side, 3];
  for (const turn of order) {
    const d = (((dir + turn) % 6) + 6) % 6;
    if (openAt(map, x, y, d)) return d;
  }
  return dir;
}

/**
 * How much more room dug soil takes loose than in place (its swell): sand 10–15 %, loam 20–30 %, clay
 * 30–40 % in earthwork references; the sim's soil is unspecified, so 20 %.
 */
export const SWELL = 1.2;

/**
 * The outer radius (world units) of the mound of `pellets` dug cells heaped round a nest of radius
 * `nestR`: excavated soil goes up and out and is dumped round the entrance (Tschinkel 2015), so the
 * mound holds every pellet, loosened by SWELL. Its area is pellets × SWELL × a hex cell's area (√3/2).
 */
export function moundRadius(pellets: number, nestR: number): number {
  return Math.sqrt(nestR * nestR + (Math.max(0, pellets) * SWELL * R) / Math.PI);
}

/**
 * Backfill tuning (frozen; tests and sweeps change it only through tuneBackfill). A pellet carrier may fill only
 * `after` seconds into its trip home, and never the cell it dug. A side passage counts as unused when its scent is
 * under staleRatio × the scent where the carrier stands (or FAINT), raised up to (1 + pelletPull)× next to pellets
 * filled in the last pelletTau seconds or so. A carrier takes a stale way at a fork with chance enterStale, until
 * staleSearch seconds into its trip home. A filled cell is not dug again for `hold` seconds (see refilled), and a cell
 * dug in the last `young` seconds is not filled.
 */
export const BACKFILL = Object.freeze({ after: 2.5, staleRatio: 0.5, enterStale: 0.3, staleSearch: 20, pelletTau: 60, pelletPull: 6, maxOpen: 5, hold: 600, young: 200 } as const);

/** The backfill tuning as a type, each number free to vary (tuneBackfill). */
export type BackfillTuning = { readonly [K in keyof typeof BACKFILL]: number };

/** The tuning in force: BACKFILL, unless a test or sweep has called tuneBackfill. */
let backfill: BackfillTuning = BACKFILL;

/** The side view: about how high (rows) the spoil disc stands as it spreads: a steep cone halved the food brought home, six rows cost a third. */
const MOUND_HEIGHT = 3;
/** The side view: the farthest (columns) a pellet is carried from the hole; past it the disc grows higher, not wider. */
const MOUND_REACH = 90;
/** The midden lies this many columns from the hole, toward the nearest other colony (see #middenSide): just past the mound's largest reach. */
export const MIDDEN_AT = MOUND_REACH + MIDDEN_PAST;
/** The side view: seconds a carrier walks a pellet out before it drops it wherever it is (heaped on top of its column, clear of the crater). */
const SPOIL_GIVE_UP = 15;
/** The side view: an explorer on the ground beside a steep flank of the mound picks a pellet off it to spread, with this chance a cell. */
const LOOSE_SPREAD_PICK = 0.01;
/**
 * The side view: an explorer on the ground beside the mound takes a pellet of it down to backfill, with this chance a cell.
 * Most such trips find nowhere to fill and carry the pellet back out: 92–97 % at 600 s and 99 % over an hour on the app's
 * map (PRD §41; the review of MR 15 saw 60–90 %), since nothing dug in the last BACKFILL.young is filled and the shaft and chamber smell busy. Kept as
 * the owner asked for it (spoil taken down to backfill); see bead ja-lft.
 */
const LOOSE_FILL_PICK = 0.005;
/** The side view: how much farther out (columns, on average) a loose pellet is spread. */
const LOOSE_SPREAD = 12;
/** The side view: how near its entrance (world units) an ant counts as at it, to drop a pellet. */
const ENTRANCE_R = 1.5;
/** The side view: how near its entrance an ant on the ground line may dig (and how much ground round the hole stays unfilled). */
const ENTRANCE_ZONE = 4;

/**
 * Tests and sweeps only: run with some backfill tuning changed (frozen like BACKFILL). Returns the function
 * that puts BACKFILL back; call it in a finally block.
 */
export function tuneBackfill(over: Partial<BackfillTuning>): () => void {
  backfill = Object.freeze({ ...backfill, ...over });
  return () => {
    backfill = BACKFILL;
  };
}

/** A lone ant's chance to dig at a tunnel's end; each nestmate within two cells adds 1 / DIG_CROWD. */
const DIG_ALONE = 0.1;
const DIG_CROWD = 6;

/** The chance an ant at tunnel cell (x, y) digs on, from the nestmates within two cells of it (itself not counted). */
export function digChance(friends: CellCounts, x: number, y: number): number {
  let n = -1;
  const o = discOffsets(2)[y & 1] as Int16Array;
  for (let k = 0; k < o.length; k += 2) n += friends.get(x + (o[k] as number), y + (o[k + 1] as number));
  return Math.min(1, DIG_ALONE + Math.max(0, n) / DIG_CROWD);
}

/** At a dead end, the chance an ant digs 60° to a side instead of on along the tunnel's run: how often tunnels fork. */
const FORK = 0.15;
/** How much a tunnel's run drifts per cell dug (radians, standard deviation): the meander. 0 = tunnels run straight. */
export let TUNNEL_DRIFT = 0.2;
/** Set the drift (tests: 0 for straight tunnels). */
export function setTunnelDrift(v: number): void {
  TUNNEL_DRIFT = v;
}

/** Seconds an ant takes to dig one cell of soil open, at least (up to twice this, at random). */
export const DIG_TIME = 1;
export const NO_FACE = 0;
export const DIG_FACE = 1;
/** Soil touched at a slant: slide along it, a hand on the wall. */
export const GLANCE = 2;
/** A flat wall (a chamber's, or a tunnel's side) met head-on: where a new tunnel may start, now and then (START). */
export const START_FACE = 4;
/** The chance an explorer meeting a flat wall head-on starts a tunnel into it. */
const START = 0.05;
/** The chance, per cell of chamber wall an explorer walks along, that it starts a tunnel into the wall there. */
const START_HUG = 0.1;
/** Seconds an explorer keeps a hand on a chamber's wall after touching soil. */
const HUG_TIME = 8;

/**
 * What a step from world (x, y) to (px, py) heading `h` does at soil: NO_FACE (it doesn't cross into
 * soil), DIG_FACE (it meets a tunnel's end head-on, or the cell it is walking to (aimX, aimY): dig it),
 * START_FACE (it meets a flat wall head-on: a tunnel may start here), or GLANCE (it touches the soil
 * at a slant: slide along it). Head-on is crossing the edge the heading points at: every heading is
 * within 30° of one of the six. Only a tunnel's end is dug (see tunnelEnd): that is what makes
 * tunnels rather than caverns. Soil put back less than BACKFILL.hold seconds before `now` is only
 * ever glanced off (see refilled).
 */
export function soilFace(map: WorldMap, x: number, y: number, px: number, py: number, h: number, aimX = NO_CELL, aimY = 0, now = Infinity): number {
  cellOf(px, py);
  const tx = CELL[0] as number;
  const ty = CELL[1] as number;
  if (rockAt(map, tx, ty) !== SOIL) return NO_FACE;
  if (refilled(map, tx, ty, now)) return GLANCE;
  cellOf(x, y);
  const cx = CELL[0] as number;
  const cy = CELL[1] as number;
  let d = -1;
  for (let k = 0; k < 6; k++) if (stepX(cx, cy, k) === tx && stepY(cy, k) === ty) d = k;
  if (d < 0) return NO_FACE;
  const headOn = dirOf(h) === d;
  const aimed = aimX === tx && aimY === ty;
  if ((headOn || aimed) && diggable(map, tx, ty, d)) return DIG_FACE;
  if (aimed && startable(map, tx, ty, d)) return DIG_FACE;
  if (headOn && startable(map, tx, ty, d)) return START_FACE;
  return GLANCE;
}

/**
 * Whether cell (x, y) was filled back with soil less than BACKFILL.hold seconds before `now` (the
 * default, Infinity: long after any fill). Such soil is left alone: a pellet put back is not dug out
 * again for a good while. Without this, 38–46 % of all digs re-dug filled cells (MR 12's review). Soil put back under
 * a chamber cell (builtFloor) is left for good.
 */
export function refilled(map: WorldMap, x: number, y: number, now = Infinity): boolean {
  return now - map.filledAt.get(x, y) < backfill.hold || builtFloor(map, x, y);
}

/** Whether any neighbour of cell (x, y) was filled back less than BACKFILL.hold seconds before `now` (a branch being filled from its tip; floor built back for good doesn't count). */
export function besideRefill(map: WorldMap, x: number, y: number, now = Infinity): boolean {
  for (let d = 0; d < 6; d++) if (now - map.filledAt.get(stepX(x, y, d), stepY(y, d)) < backfill.hold) return true;
  return false;
}

/**
 * The side view: whether cell (x, y) is ground a chamber's floor stands on: directly under a chamber cell, or beside
 * one on that chamber's floor row (a tunnel dug down, or out at floor level, from a chamber). Open, it takes floor
 * from the chamber; filled back, it gives it back (see Colony #backfill: it may be filled however lately it was dug).
 */
export function floorGround(map: WorldMap, x: number, y: number): boolean {
  const ch = map.chambers;
  if (!ch) return false;
  if (ch.at(stepX(x, y, 4), stepY(y, 4)) >= 0 || ch.at(stepX(x, y, 5), stepY(y, 5)) >= 0) return true;
  for (const d of [0, 3]) {
    const id = ch.at(stepX(x, y, d), stepY(y, d));
    if (id >= 0 && ch.list[id]!.floorRow === y) return true;
  }
  return false;
}

/**
 * Whether soil cell (x, y) was put back (filled, and not dug since) right under a chamber cell: floor the colony built
 * back, which stays for good. Held only for BACKFILL.hold like any fill, floor fills were dug out again at 2–7× the rate
 * of other fills once the hold ran out (35–49 % against 5–17 % over 1,200 s, with #14's guards merged into the nest:
 * PRD §31), and the floor went with them. (Not a cell beside a chamber on its floor row: that is where it widens.)
 */
export function builtFloor(map: WorldMap, x: number, y: number): boolean {
  const ch = map.chambers;
  if (!ch || map.filledAt.get(x, y) === -Infinity) return false;
  return ch.at(stepX(x, y, 4), stepY(y, 4)) >= 0 || ch.at(stepX(x, y, 5), stepY(y, 5)) >= 0;
}

/** Whether soil cell (x, y), entered going `d`, may be dug: a tunnel's end, or a wall with open ground straight beyond it (breaking through). */
export function diggable(map: WorldMap, x: number, y: number, d: number): boolean {
  return tunnelEnd(map, x, y) || openAt(map, x, y, d);
}

/**
 * Whether a new tunnel may start into wall cell (x, y), going `d`: no open ground within two steps
 * of it except on the side it is dug from (the side its own open neighbours are on: the chamber).
 * New tunnels keep their distance from other passages, so the ground isn't combed into parallel slots.
 */
export function startable(map: WorldMap, x: number, y: number, d: number): boolean {
  const fx = centreX(x, y);
  const fy = centreY(y);
  // Which way the chamber lies: toward the face's open neighbours (or back the way it is dug from).
  let nx = 0;
  let ny = 0;
  for (let k = 0; k < 6; k++)
    if (openAt(map, x, y, k)) {
      nx += Math.cos(DIR_ANGLE[k] as number);
      ny += Math.sin(DIR_ANGLE[k] as number);
    }
  if (Math.hypot(nx, ny) < 1e-6) {
    nx = -Math.cos(DIR_ANGLE[d] as number);
    ny = -Math.sin(DIR_ANGLE[d] as number);
  }
  const len = Math.hypot(nx, ny);
  const o = discOffsets(2)[y & 1] as Int16Array;
  for (let k = 2; k < o.length; k += 2) {
    const ax = x + (o[k] as number);
    const ay = y + (o[k + 1] as number);
    if (rockAt(map, ax, ay) !== OPEN) continue;
    if (((centreX(ax, ay) - fx) * nx + (centreY(ay) - fy) * ny) / len > 0.25) continue; // on the chamber's side
    return false;
  }
  return true;
}

/**
 * Whether open cell (x, y) is a stub: a dead end whose open neighbours (one or two) lie next to each
 * other, so filling it can't cut any passage (on offset rows a one-cell stub off a straight tunnel
 * touches two cells of it). With a larger maxOpen, any cell whose open neighbours (up to maxOpen) form one
 * unbroken run: the edge of a chamber, the side of a wide tunnel. Filling such a cell never cuts a passage
 * either (in digital topology, a "simple" cell: the ground stays connected the same way).
 */
export function stub(map: WorldMap, x: number, y: number, maxOpen = 2): boolean {
  let open = 0;
  let runs = 0;
  let prev = openAt(map, x, y, 5);
  for (let d = 0; d < 6; d++) {
    const o = openAt(map, x, y, d);
    if (o) open++;
    if (o && !prev) runs++;
    prev = o;
  }
  if (open === 6) runs = 1;
  return open >= 1 && open <= maxOpen && runs === 1;
}

/**
 * Whether soil cell (x, y) is a tunnel's end: just one of its six neighbours open (`most`). The cell
 * past a tunnel's end is, and so is a fork's first cell beside it; a tunnel's side wall (two open,
 * next to each other) or a chamber's wall is not. So tunnels lengthen and branch but stay one cell
 * wide, turning at most 60° a cell.
 */
export function tunnelEnd(map: WorldMap, x: number, y: number, most = 1): boolean {
  let open = 0;
  for (let d = 0; d < 6; d++) if (openAt(map, x, y, d) && ++open > most) return false;
  return true;
}

/**
 * A follower's turn by Deneubourg's choice function (Deneubourg et al. 1990; Goss et al. 1989; docs/trails.md): left,
 * ahead or right with chances (k + C)², each sensor's scent C. Where two trails part, the stronger takes more than its
 * share of followers, which is what lets a colony settle on one of two sources (A2a) and on the richer (A2b). On one
 * trail the sides read alike and it turns either way, held on by the trail's centre. (`climb`, always to the
 * strongest, sent followers down whichever trail lay ahead of them: behaviour MR 3, PRD §45.)
 */
export function choose(left: number, front: number, right: number, max: number, k: number, rng: () => number): number {
  const wl = (k + left) ** 2;
  const wf = (k + front) ** 2;
  const wr = (k + right) ** 2;
  const u = rng() * (wl + wf + wr);
  return u < wl ? -max : u < wl + wf ? 0 : max;
}

/** Turn toward the strongest of three sensors, at most `max` radians. */
export function climb(left: number, front: number, right: number, max: number): number {
  if (front >= left && front >= right) return 0;
  return left > right ? -max : max;
}

/** Turn toward the weakest of three alarm sensors, at most `max` radians; nothing when no sensor smells alarm. */
export function avoid(left: number, front: number, right: number, max: number): number {
  if (Math.max(left, front, right) < FAINT) return 0;
  // Rock or the map's edge reads −1: never the way out of alarm (ja-dul: it read as the least, and steered ants into walls).
  const l = left < 0 ? Infinity : left;
  const f = front < 0 ? Infinity : front;
  const r = right < 0 ? Infinity : right;
  if (f <= l && f <= r) return 0;
  return l < r ? -max : max;
}

/** Turn `h` toward `target` by at most `max` radians, the short way round. */
export function turnToward(h: number, target: number, max: number): number {
  const d = Math.atan2(Math.sin(target - h), Math.cos(target - h));
  return h + Math.max(-max, Math.min(max, d));
}
