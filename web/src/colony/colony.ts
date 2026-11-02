import { type Channel, type Mark, MARKS, Pheromones } from "./pheromone.ts";
import { Brood, EGG, LARVA, PUPA, type BroodItem } from "./brood.ts";
import { CHAMBER_HEIGHT, type Role } from "./chambers.ts";
import { TOLERANCE } from "./recognition.ts";
import { CELL, cellOf, centreX, centreY, DIR_ANGLE, dirOf, discOffsets, hexDistance, nx as stepX, ny as stepY, R, SIDE } from "./hex.ts";
import { AIR, blocked, digCell, dropFood, fillCell, groundTop, heapMound, isSky, OPEN, takeLoose, rockAt, setTunnelHeading, SOIL, takeFoodCell, tunnelHeading, type Nest, type WorldMap } from "./world.ts";

// A colony, pure. Ants are structure-of-arrays like the picture sim, with a
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
 * The local rule. An enemy close by: fight it. Tired: go home. Raiding:
 * explorers (and fighters) go raiding, followers keep foraging. Defending:
 * alarm calls fighters. A fight that is over sends the ant home. Otherwise
 * forage: a strong food trail is followed, none means explore, a faint one
 * keeps what the ant was doing (an ant that just dropped its food heads back
 * out along it). Going home tired breaks ant mills: without it, followers
 * circled trails to food that was gone until nobody was left exploring.
 */
export const localPolicy: Policy = (s) => {
  if (s.enemy === "near") return "fight";
  if (s.tired) return "return";
  if (s.stance === "raid" && (s.mode === "explore" || s.mode === "fight")) return "fight";
  if (s.stance === "defend" && s.alarm !== "none") return "fight";
  if (s.mode === "fight") return "return";
  if (s.foodTrail === "strong") return "follow";
  if (s.foodTrail === "none") return "explore";
  return s.mode === "return" ? "follow" : s.mode;
};

/** The strategist's coarse view of its own colony: few values, so a stance can be cached per view too. */
export interface StanceSituation {
  stance: Stance;
  /** living ants against the colony's cap */
  ants: "few" | "some" | "many";
  /** ants lost lately (a 30 s fading count) */
  losses: "none" | "some" | "heavy";
  enemyNearNest: boolean;
  /** share of the map's food still out there */
  foodLeft: "plenty" | "some" | "scarce";
  /** food stored but not yet turned into ants (the colony is at its cap) */
  larder: "low" | "full";
}

export type StancePolicy = (s: StanceSituation) => Stance;

/** The local strategist: defend a nest under attack; raid when food runs out or the colony is full and fed; else forage. */
export const localStance: StancePolicy = (s) => {
  if (s.enemyNearNest && s.losses !== "none") return "defend";
  if (s.foodLeft === "scarce" && s.ants !== "few") return "raid";
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
  /** how hard ants turn away from alarm, as a share of turnRate */
  alarmAvoid: number;
  /** the colony's odour at the start, 0..1 (recognition.ts): the game gives each colony its own */
  odour: number;
  /** odours further apart than this are strangers, as a healthy ant perceives it */
  tolerance: number;
}

export const DEFAULT_COLONY: ColonyParams = { antCount: 800, maxAnts: 1200, foodPerAnt: 4, nest: 0, speed: 7, sensorDistance: 3, sensorAngle: 0.6, turnRate: 6, wander: 4, deposit: 4, depositDecay: 20, patience: 60, alarmAvoid: 1.5, odour: 0, tolerance: TOLERANCE };

/** A food cell seen by a sensor, or the nest seen by a homing ant, beats any trail. */
const SEEN = 100;
/** Cells around an ant it checks for enemies (the hex disc of radius ENEMY_RANGE). */
const ENEMY_RANGE = 2;

export class Colony {
  readonly map: WorldMap;
  readonly ph: Pheromones;
  readonly nest: Nest;
  params: ColonyParams;
  policy: Policy;
  stancePolicy: StancePolicy;
  stance: Stance = "forage";
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
  /** the cell (packed y·65536 + x) where this pellet carrier last looked for space to fill: once a cell is enough */
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
  /** cells walked on that surface (each GROUND_FLIP, the other hand) */
  #groundT: Uint16Array;
  /** the hole x (#holeX) groundMin was measured against */
  #groundRef: Float64Array;
  // Chambers (nest slice 2): the side view's nest is dug, not given.
  /** the face this ant is digging for a chamber (packed y·65536 + x; −1 none), and for which: chamber id + 1, or 0 for a new one */
  #chamberCell: Int32Array;
  #chamberFor: Int16Array;
  /** ants underground last tick (the side view): with the chambers' floor, how crowded the nest is */
  inNest = 0;
  // Floor marks (nest slice 3): the role of the last chamber each ant was in (MARKS index + 1; 0 none), and seconds since.
  #lastRole: Uint8Array;
  #sinceRole: Float32Array;
  /** seconds an ant has rested at home in "return" (see REST) */
  #restT: Float32Array;
  // The queen and brood (nest slice 4; the side view only: elsewhere the larder still becomes ants directly).
  /** the colony's queen, in its royal chamber (null on the top-down maps); a colony whose queen is dead is orphaned */
  queen: { alive: boolean; x: number; y: number } | null = null;
  readonly brood = new Brood();
  /** seconds owed toward the queen's next egg */
  #layT = 0;
  /** each ant's age and lifespan, seconds (the side view: workers die of age, so an orphaned colony dwindles) */
  age: Float32Array;
  lifespan: Float32Array;
  /** 1 while an ant carries brood (a nurse), and the chamber it is taking it to */
  #holdsBrood: Uint8Array;
  #broodTo: Int16Array;
  /** workers that died of age */
  diedOld = 0;
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
  /** the side view: 1 if the pellet carried is loose soil off the mound (moved, not dug: it isn't counted in soilDug) */
  #loosePellet: Uint8Array;
  /** the side view: 1 if that loose pellet is being taken down into the nest to backfill (else it is spread farther out) */
  #fillIntent: Uint8Array;
  /** the side view: loose pellets picked up off the mound, dropped on it again, put into unused space underground, and lost with ants that died */
  loosePicked = 0;
  looseDropped = 0;
  looseFilled = 0;
  looseLost = 0;
  /** the side view: cells of mound heaped so far, or tried (no room at the sky's top): ⌊pellets out × SWELL⌋ once caught up */
  #heaped = 0;
  /** the side view: cells of loose soil heaped on the mound */
  moundCells = 0;
  /** the point the current ant is homing to (see #goal): the m-line runs to it */
  #goalX = 0;
  #goalY = 0;
  /** the side view: where the ant being stepped believes the hole is, across the ground (see #believe, #towardHole) */
  #holeX = 0;
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
  /** seconds since the ant was last at the nest or picked up food */
  since: Float32Array;
  /** seconds left of a detour after bumping into rock, when the pull toward the nest (or the raid) is off */
  detour: Float32Array;
  /** recent bumps, fading over seconds: each bump in a row doubles the next detour */
  bumps: Float32Array;
  /** the nearest a homing ant has been to its goal this trip, and seconds since it last got a cell nearer (a ring of scented tunnels) */
  bestD: Float32Array;
  stallT: Float32Array;
  /** fungal load, 0..1 (fungus.ts): the fungus inside the ant; it never touches the ant's choices directly */
  load: Float32Array;
  /** which strain (an index into the fungus's strains) the load is; meaningful only where load > 0 */
  strain: Uint8Array;
  /** immune priming from grooming visible nestmates, 0..1: scales down every load the ant takes */
  resist: Float32Array;
  /** the intervention the fungus runs in this ant (an index into fungus.ts INTERVENTIONS; 0 = dormant) */
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
  /** the fungal situation (fungalPolicy.ts encodeFungal, without the strain) the fungus last chose for it in; −1 = none */
  fungal: Int16Array;
  /** homing round an obstacle by touch: 0 = not; +1 = keeping the wall on its right, −1 = on its left */
  wall: Int8Array;
  /** straight-line distance home (its own home vector) when it met the wall it is following */
  hitDist: Float32Array;
  /** seconds spent following the current wall */
  followT: Float32Array;
  /** where this homing trip first met rock (NaN until it does): with the nest it fixes the line the ant leaves walls on */
  mx: Float32Array;
  my: Float32Array;
  /** following a wall cell by cell: the way it faces (0 east, 1 south, 2 west, 3 north) and the cell it is walking to (NO_CELL = decide now) */
  gdir: Uint8Array;
  gx: Int32Array;
  gy: Int32Array;
  /** 1 while the wall being followed is followed cell by cell (soil, or a tunnel), 0 by touch (rock in open ground) */
  byCell: Uint8Array;
  /** the situation each ant was last asked about, encoded; −1 = never */
  #asked: Int16Array;
  /** the question behind each ant's current mode: its situation (with the mode it had) when last asked; −1 = never */
  #question: Int16Array;
  /** enemy ants per cell, kept by the game each tick; null when there is no rival */
  enemies: CellCounts | null = null;
  /** this colony's own ants per cell, kept by the game each tick underground; null on its own */
  friends: CellCounts | null = null;
  /** the colony's odour: the nest's gestalt, which ants at the nest relax toward and newborns take */
  nestOdour: number;
  /** the other colony's scent, for ants whose perception reads it (set by the game; null with no rival) */
  foreign: Pheromones | null = null;
  /** where raiders go: the rival's nest */
  raidTarget: Nest | null = null;
  time = 0;
  /** food units brought home */
  stored = 0;
  /** stored food not yet turned into ants */
  larder = 0;
  /** soil cells this colony dug open, and pellets of it dropped on the mound at the nest */
  soilDug = 0;
  soilOut = 0;
  /** pellets dropped into unused dead ends on the way home (backfill), and pellets lost with ants that died carrying them */
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
      for (const n of map.nests ?? [this.nest])
        if (n.entrance) {
          cellOf(n.entrance.x, n.entrance.y);
          this.#holes.push(CELL[0] as number);
        }
    }
    this.policy = policy;
    this.stancePolicy = stancePolicy;
    this.#rng = rng;
    this.ph = new Pheromones(map);
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
    this.#broodTo = new Int16Array(n).fill(-1);
    // The queen lies on the royal chamber's floor (the founding chamber's centre, a little down).
    if (this.#entrance && map.chambers) this.queen = { alive: true, x: this.nest.x, y: this.nest.y + 1 };
    this.#spoilTo = new Float32Array(n).fill(NaN);
    this.#spoilSide = new Int8Array(n);
    this.#spoilT = new Float32Array(n);
    this.#loosePellet = new Uint8Array(n);
    this.#fillIntent = new Uint8Array(n);
    this.#noGain = new Uint8Array(n);
    this.loopX = new Int32Array(n).fill(NO_CELL);
    this.loopY = new Int32Array(n);
    this.hugT = new Float32Array(n);
    this.alive = new Uint8Array(n);
    this.gen = new Uint32Array(n);
    this.since = new Float32Array(n);
    this.detour = new Float32Array(n);
    this.bumps = new Float32Array(n);
    this.bestD = new Float32Array(n).fill(Infinity);
    this.stallT = new Float32Array(n);
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
    this.wall = new Int8Array(n);
    this.hitDist = new Float32Array(n);
    this.followT = new Float32Array(n);
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

  #place(i: number): void {
    const a = this.#rng() * Math.PI * 2;
    const r = this.#rng() * this.nest.r * 0.8;
    this.x[i] = this.nest.x + Math.cos(a) * r;
    this.y[i] = this.nest.y + Math.sin(a) * r;
    this.heading[i] = a;
    this.mode[i] = EXPLORE;
    this.carrying[i] = 0;
    this.pellet[i] = 0;
    this.#staleWalk[i] = 0;
    this.#spoilTo[i] = NaN;
    this.#loosePellet[i] = 0;
    this.#fillIntent[i] = 0;
    this.digT[i] = 0;
    this.digAim[i] = NaN;
    this.hand[i] = this.#rng() < 0.5 ? -1 : 1;
    this.hugT[i] = 0;
    this.since[i] = 0;
    this.detour[i] = 0;
    this.bumps[i] = 0;
    this.bestD[i] = Infinity;
    this.stallT[i] = 0;
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
    this.#groundMin[i] = NaN;
    this.#chamberCell[i] = -1;
    this.#lastRole[i] = 0; // born in the royal chamber: it lays royal once it has been there a tick
    this.#sinceRole[i] = 0;
    this.#restT[i] = 0;
    this.age[i] = 0;
    this.lifespan[i] = this.queen ? LIFESPAN * (0.7 + 0.6 * this.#rng()) : Infinity;
    this.#holdsBrood[i] = 0;
    this.#broodTo[i] = -1;
    this.wall[i] = 0;
    this.mx[i] = NaN;
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
  }

  /**
   * Ant i starts a trip home (it picked up food, or its policy sent it home): a detour or bumps run up exploring would
   * otherwise switch its homing off, and its progress clock starts again (main's review of #8, carried onto hexes).
   */
  #homeAfresh(i: number): void {
    this.search[i] = 0; // a search left over from the last trip home
    this.#groundMin[i] = NaN;
    this.detour[i] = 0;
    this.bumps[i] = 0;
    this.wall[i] = 0;
    this.mx[i] = NaN;
    this.bestD[i] = Infinity;
    this.stallT[i] = 0;
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
    if (this.population + this.brood.size < this.params.maxAnts) return 0;
    let owed = 0;
    for (const b of this.brood.items) if (b.stage !== PUPA) owed += LARVA_FOOD - b.fed;
    return this.larder - owed;
  }

  /** The queen dies (a raider at her side; later, the fungus): the colony is orphaned, it lays no more eggs. */
  killQueen(): void {
    if (this.queen) this.queen.alive = false;
  }

  /** Whether the colony has lost its queen (the side view; the top-down maps have none to lose). */
  get orphaned(): boolean {
    return this.queen !== null && !this.queen.alive;
  }

  /** Ant i dies where it stands; food it carried drops on that cell (a soil pellet is just lost; brood it carried lies there). `lost`: a loss to the strategist (a fight), not old age. */
  kill(i: number, lost = true): void {
    if (!this.alive[i]) return;
    if (this.#holdsBrood[i]) this.#dropBrood(i);
    if (this.carrying[i]) dropFood(this.map, this.x[i] as number, this.y[i] as number, 1);
    if (this.pellet[i]) {
      if (this.#loosePellet[i]) this.looseLost++;
      else this.soilLost++;
    }
    this.#spoilTo[i] = NaN;
    this.#loosePellet[i] = 0;
    this.#fillIntent[i] = 0;
    this.alive[i] = 0;
    this.carrying[i] = 0;
    this.pellet[i] = 0;
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
      if (this.alive[i] && this.pellet[i]) {
        if (this.#loosePellet[i]) loose++;
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
    const left = this.map.foodTotal > 0 ? this.foodLeft / this.map.foodTotal : 0;
    return {
      stance: this.stance,
      ants: pop < 0.4 ? "few" : pop < 0.8 ? "some" : "many",
      losses: this.recentLosses < 1 ? "none" : this.recentLosses < 10 ? "some" : "heavy",
      enemyNearNest,
      foodLeft: left > 0.5 ? "plenty" : left > 0.15 ? "some" : "scarce",
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
    // So is one that has been filled since (backfill), unless it is an explorer's face to dig.
    const fresh =
      this.gx[i] === NO_CELL ||
      hexDistance(this.gx[i] as number, this.gy[i] as number, hx, hy) > 1 ||
      (mode !== EXPLORE && rockAt(map, this.gx[i] as number, this.gy[i] as number) !== OPEN) ||
      rockAt(map, this.gx[i] as number, this.gy[i] as number) === AIR; // sky (the ground under a walkway dug away) is no face to dig
    if (!fresh && Math.hypot(centreX(this.gx[i] as number, this.gy[i] as number) - x, centreY(this.gy[i] as number) - y) > step) return true;
    const hugging = mode === EXPLORE && (this.hugT[i] as number) > 0;
    const packed = hy * 65536 + hx;
    // Homing on the ground line (side view) goes cell by cell to the hole wherever the walkway is, one cell
    // thick or two (on the mound's slopes, where it is no tunnel and steering freely wandered off round them).
    const carryingOut = mode === RETURN && this.pellet[i] === 1 && this.#entrance !== null && !Number.isNaN(this.#spoilTo[i] as number);
    const groundHome = carryingOut || (mode === RETURN && this.#entrance !== null && isSky(map, fresh ? hx : (this.gx[i] as number), fresh ? hy : (this.gy[i] as number)));
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
      if (best < 0) this.#spoilTo[i] = 0; // the map's edge, or nowhere farther: it drops it here
      dir = best < 0 ? handOnWall(map, cx, cy, dir, -(this.hand[i] as number)) : best;
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
      } else if ((this.#groundT[i] = (this.#groundT[i] as number) + 1) % GROUND_FLIP === 0) {
        // The long way round: the other hand, and turned back.
        this.hand[i] = -(this.hand[i] as number);
        dir = (dir + 3) % 6;
      }
      dir = best < 0 ? handOnWall(map, cx, cy, dir, -(this.hand[i] as number)) : best;
    } else if (mode === RETURN || mode === FOLLOW) {
      // The way ahead (not back, unless it's a dead end) with the most scent: home scent, laid by
      // ants walking out, for a homing ant; food scent for a follower. No scent at all: a hand on the wall.
      // Homing with no progress for TUNNEL_STALL seconds: the way that points most nearly home, by its home vector.
      const field = mode === RETURN ? this.ph.fields.home : this.ph.fields.food;
      // Underground in the side view, homing follows the road signs of where it is going (its chamber's mark); the home
      // trail only where there are none.
      const signs = mode === RETURN && this.#entrance && !isSky(map, cx, cy) ? this.ph.fields[this.#destMark(i)] : null;
      const signGain = SIGN_WEIGHT * (this.gainHome[i] as number); // the fungus's home lever bends road signs as it does the home trail
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
    } else {
      const side = this.hand[i] as number;
      const next = handOnWall(map, cx, cy, dir, side);
      const chamberHere = mode === EXPLORE && this.#entrance && this.#mayDig(cx, cy) && this.crowded() ? (map.chambers?.at(cx, cy) ?? -1) : -1;
      // In a chamber still narrow enough to walk like a tunnel (a new one, a cell or two): widen it along its floor.
      const widen = chamberHere >= 0 && this.#rng() < WIDEN ? this.#widenWay(cx, cy, dir) : -1;
      const start = widen < 0 && mode === EXPLORE && this.#entrance && this.#mayDig(cx, cy) && this.crowded() ? this.#newChamberWay(cx, cy) : -1;
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
        if (this.#rng() < FORK) aim += (this.#rng() < 0.5 ? -1 : 1) * (Math.PI / 3);
        let dug = this.#mayDig(cx, cy) ? chooseDig(map, cx, cy, aim, this.#rng()) : -1;
        // Digging is social: the more nestmates round it, the likelier an ant is to dig (and, as the nest
        // grows roomy and they spread out, the less). That is how real colonies stop excavating once
        // they have room (Rasse & Deneubourg 2001); a lone ant at a far tunnel's end still digs now and then.
        if (dug >= 0 && this.friends && this.#rng() > digChance(this.friends, cx, cy)) dug = -1;
        // A roomy nest (the side view's chambers have floor enough) barely digs on (ja-wii: digging stops with room).
        if (dug >= 0 && !this.crowded() && this.#rng() > ROOMY_DIG) dug = -1;
        if (dug < 0 && rockAt(map, stepX(cx, cy, next), stepY(cy, next)) !== OPEN) {
          this.gx[i] = NO_CELL; // walled in on every side (it can't be, having walked in): steer freely
          return false;
        }
        this.digAim[i] = dug >= 0 ? aim : NaN;
        dir = dug < 0 ? next : dug;
      } else {
        dir = next;
        this.digAim[i] = NaN; // walking on, not to a face
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
    const widen = !fresh && here >= 0 && crowded && this.#mayDig(cx, cy) && this.#rng() < WIDEN * (1 + BROOD_PULL * Math.min(brood, 10)) ? this.#widenWay(cx, cy, wallDir) : -1;
    if (widen >= 0) {
      // Widen the chamber along its floor (dug like any face; the cell joins the chamber when it is open: see tick).
      dir = widen;
      this.digAim[i] = DIR_ANGLE[widen] as number;
      this.#aimChamber(i, stepX(cx, cy, widen), stepY(cy, widen), here + 1);
    } else if (!fresh && rockAt(map, wx, wy) === SOIL && this.#rng() < START_HUG && (crowded || this.#rng() < ROOMY_DIG) && this.#mayDig(cx, cy) && startable(map, wx, wy, wallDir)) {
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

  /** Ant i dug its chamber face (x, y): it joins that chamber, or founds one. */
  #chamberDug(i: number, x: number, y: number): void {
    const ch = this.map.chambers!;
    const open = (ax: number, ay: number) => rockAt(this.map, ax, ay) === OPEN;
    let id = (this.#chamberFor[i] as number) - 1;
    if (id < 0) {
      if (!this.#chamberRoom(x, y, y - groundTop(this.map, x))) return; // another was started near it meanwhile: a tunnel stub
      id = ch.add(this.params.nest, y, this.#roleFor(x, y)).id;
    }
    ch.claim(id, x, y, open);
  }

  /** Ant i is going to dig cell (x, y) for a chamber: `forId` = its id + 1, or 0 for a new chamber there. */
  #aimChamber(i: number, x: number, y: number, forId: number): void {
    this.#chamberCell[i] = y * 65536 + x;
    this.#chamberFor[i] = forId;
  }

  /**
   * Backfill: a pellet carrier at tunnel cell (cx, cy) drops its pellet into a neighbouring dead end that
   * nobody uses, filling it back with soil, instead of hauling it all the way out. Leaf-cutting ants put
   * most of their soil back inside this way, refilling unused space (Pielström & Roces); harvester ants
   * very little (≈ 2.5 %, Tschinkel et al. 2015). Unused, to the ant's senses: no food there, no food or
   * home scent (outbound ants lay home scent, so a tip being dug carries it), no ant in it, and not by the nest.
   */
  #backfill(i: number, cx: number, cy: number): boolean {
    const { map } = this;
    const home = this.ph.fields.home;
    const food = this.ph.fields.food;
    for (let d = 0; d < 6; d++) {
      const tx = stepX(cx, cy, d);
      const ty = stepY(cy, d);
      if (rockAt(map, tx, ty) !== OPEN || !stub(map, tx, ty, BACKFILL.maxOpen)) continue;
      if (map.food.get(tx, ty) > 0 || home.get(tx, ty) + food.get(tx, ty) >= this.#staleBelow(cx, cy, tx, ty)) continue;
      this.enemies?.look?.(this.odour[i] as number, -1); // any ant of another colony, stranger or not (a tolerance below 0 counts every band)
      if ((this.friends?.get(tx, ty) ?? 0) > 0 || (this.enemies?.get(tx, ty) ?? 0) > 0) continue;
      if (this.#byANest(tx, ty)) continue;
      if (this.#entrance && (isSky(map, tx, ty) || this.#byAnEntrance(tx, ty))) continue; // the ground line and the holes stay open
      // The grids are a tick old: a nestmate that stepped in earlier this tick isn't in them (and walling it
      // in would bury it). Rare enough (every other test passed) to look at each ant.
      if (this.#occupied(tx, ty)) continue;
      if (!fillCell(map, tx, ty, this.time)) continue;
      // A fresh trip out from here. (Letting its trip clock run on instead, so it lays only faint home scent
      // this deep, was measured worse: it soon tires and walks home empty. Seeds 3, 4, 6–8: 12 % less food home.)
      this.pellet[i] = 0;
      if (this.#loosePellet[i]) this.looseFilled++;
      else this.soilFilled++;
      this.#loosePellet[i] = 0;
      this.#fillIntent[i] = 0;
      this.#spoilTo[i] = NaN;
      this.since[i] = 0;
      this.#staleWalk[i] = 0;
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
    const base = Math.max(FAINT, BACKFILL.staleRatio * here);
    // Never above the scent where it stands: a cell as busy as its own is in use, fresh pellets or not.
    return Math.min(base * (1 + BACKFILL.pelletPull * this.#pelletScent(tx, ty)), Math.max(base, here));
  }

  /** The smell of fresh pellets at cell (x, y): from the freshest fill among it and its neighbours, fading over BACKFILL.pelletTau seconds. */
  #pelletScent(x: number, y: number): number {
    const at = this.map.filledAt;
    let t = at.get(x, y);
    for (let d = 0; d < 6; d++) t = Math.max(t, at.get(stepX(x, y, d), stepY(y, d)));
    return t === -Infinity ? 0 : Math.exp(-(this.time - t) / BACKFILL.pelletTau);
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
    if (s <= BACKFILL.after || s >= BACKFILL.staleSearch) {
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
   * nobody walks) now and then turns into it (BACKFILL.enterStale), to fill its end (see #staleWay). Forks
   * are never tunnel cells on hexes (the branch's mouth sits beside the way on), so this is looked at on
   * arrival, not in #walkTunnel. True if it turned in: its target cell (gx, gy) is the branch's first cell.
   */
  #enterStale(i: number, cx: number, cy: number): boolean {
    const s = this.since[i] as number;
    if (this.#staleWalk[i] || s >= BACKFILL.staleSearch) return false;
    const { map } = this;
    const f = this.ph.fields;
    let way = -1;
    let wayV = Infinity;
    for (let d = 0; d < 6; d++) {
      const tx = stepX(cx, cy, d);
      const ty = stepY(cy, d);
      if (rockAt(map, tx, ty) !== OPEN) continue;
      const v = f.home.get(tx, ty) + f.food.get(tx, ty);
      if (v < wayV) {
        wayV = v;
        way = d;
      }
    }
    if (way < 0) return false;
    const tx = stepX(cx, cy, way);
    const ty = stepY(cy, way);
    if (wayV >= this.#staleBelow(cx, cy, tx, ty) || this.#rng() >= BACKFILL.enterStale) return false;
    this.#staleWalk[i] = 1;
    this.gdir[i] = way;
    this.gx[i] = tx;
    this.gy[i] = ty;
    this.wall[i] = 0;
    return true;
  }

  /**
   * Path integration (the side view): the step from (x0, y0) is added to the odometer it walked it under. Coming up out
   * of the hole starts the surface vector afresh (it points to the hole); in the chamber, the in-nest memory starts
   * afresh. Each fresh start draws that trip's drift.
   */
  #integrate(i: number, x0: number, y0: number, atNest: boolean): void {
    this.antCell(i);
    const under = !isSky(this.map, CELL[0] as number, CELL[1] as number);
    const step = Math.hypot((this.x[i] as number) - x0, (this.y[i] as number) - y0);
    if (!under && this.#under[i]) {
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

  /** The nest ant i homes to now (see tick): the chamber, or in the side view the entrance (pellet carriers, ants on the ground line). */
  #goal(i: number, pellet: boolean): Nest {
    const ent = this.#entrance;
    if (!ent) return this.nest;
    let kind = 1;
    if (!pellet || this.#fillIntent[i]) {
      this.antCell(i);
      kind = isSky(this.map, CELL[0] as number, CELL[1] as number) ? 1 : 0;
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
    b.x = goal.x + off + (this.search[i] as number);
    b.y = goal.y;
    b.r = goal.r;
    return b;
  }

  /** Ant i got to where it believed its goal was and found nothing: it searches, in loops of growing size to either side (Wehner's systematic search). */
  #searchOn(i: number): void {
    const s = this.search[i] as number;
    this.search[i] = s === 0 ? SEARCH_START * (this.#rng() < 0.5 ? -1 : 1) : Math.max(-SEARCH_MAX, Math.min(SEARCH_MAX, -s * SEARCH_GROW));
    this.wall[i] = 0;
    this.mx[i] = NaN;
  }

  /** The situation's home field for ant i: the home trail ahead (sensor readings hl, hf, hr), or, underground in the side view, where it is. */
  #homeField(i: number, hl: number, hf: number, hr: number): Home {
    if (this.#entrance) {
      this.antCell(i);
      const cx = CELL[0] as number;
      const cy = CELL[1] as number;
      if (!isSky(this.map, cx, cy)) return this.#placeAt(cx, cy) ?? "tunnel";
    }
    return trailLevel(Math.max(hl, hf, hr));
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
    return this.#holdsBrood[i] ? "brood" : "royal";
  }

  /** Scratch: the chamber a nurse takes brood to, as a goal (its centre). */
  #broodNest: Nest = { x: 0, y: 0, r: 1.5 };
  #broodGoal(i: number): Nest {
    const c = this.map.chambers?.list[this.#broodTo[i] as number];
    if (!c || c.cells === 0) return this.nest;
    this.#broodNest.x = centreX(Math.round(c.sumX / c.cells), Math.round(c.sumY / c.cells));
    this.#broodNest.y = centreY(Math.round(c.sumY / c.cells));
    return this.#broodNest;
  }

  /**
   * A nurse (nest slice 4): an idle ant in its royal chamber picks up an egg lying near it and takes it to the brood
   * chamber with the least brood; there, it lays it down. Its brood goes where it goes.
   */
  #nurse(i: number, dt: number): void {
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
      if (ch.at(cx, cy) === this.#broodTo[i]) this.#dropBrood(i);
      return;
    }
    if (this.mode[i] !== EXPLORE || this.carrying[i] || this.pellet[i] || this.#placeAt(cx, cy) !== "royal" || this.#rng() > PICK_BROOD * dt) return;
    let to = -1;
    let least = Infinity;
    for (const c of ch.list)
      if (c.colony === this.params.nest && c.role === "brood" && c.cells > 0 && c.brood < least) {
        least = c.brood;
        to = c.id;
      }
    if (to < 0) return; // no brood chamber yet: brood stays with the queen
    for (const b of this.brood.items)
      if (b.held < 0 && b.stage === EGG && hexDistance(b.x, b.y, cx, cy) <= 2) {
        b.held = i;
        if (b.chamber >= 0) ch.list[b.chamber]!.brood--;
        b.chamber = -1;
        this.#holdsBrood[i] = 1;
        this.#broodTo[i] = to;
        this.#homeAfresh(i);
        this.gx[i] = NO_CELL;
        return;
      }
  }

  /** Ant i puts down the brood it holds where it stands (in the chamber it was taking it to, or wherever it died). */
  #dropBrood(i: number): void {
    const ch = this.map.chambers;
    this.antCell(i);
    const cx = CELL[0] as number;
    const cy = CELL[1] as number;
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
      this.ph.depositCell("royal", qx, qy, QUEEN_MARK * dt);
      // Strangers at her side kill her (a raid that reaches the royal chamber).
      const g = this.enemies;
      if (g) {
        g.look?.(this.nestOdour, p.tolerance);
        let strangers = 0;
        const o = discOffsets(1)[qy & 1] as Int16Array;
        for (let k = 0; k < o.length; k += 2) strangers += g.get(qx + (o[k] as number), qy + (o[k + 1] as number));
        if (strangers >= ENEMY && this.#rng() < 1 - Math.exp(-QUEEN_FIGHT * strangers * dt)) q.alive = false;
      }
      this.#layT += dt;
      // She lays only while the larder holds, beyond what the brood already laid will be fed, a whole worker's food:
      // eggs laid into an empty larder starve as larvae.
      let owed = 0;
      for (const b of this.brood.items) if (b.stage !== PUPA) owed += LARVA_FOOD - b.fed;
      while (q.alive && this.#layT >= LAY_INTERVAL) {
        this.#layT -= LAY_INTERVAL;
        if (this.larder < owed + EGG_FOOD + LARVA_FOOD || this.population + this.brood.size >= p.maxAnts) {
          this.#layT = 0;
          break;
        }
        this.larder -= EGG_FOOD;
        owed += LARVA_FOOD;
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
        if (b.held < 0 && b.fed < LARVA_FOOD && this.larder > 0) {
          // Fed by the nurses round it (the colony's own ants within two cells), from the larder.
          const nurses = this.friends ? this.#around(this.friends, b.x, b.y) : 2;
          const take = Math.min(this.larder, LARVA_FOOD - b.fed, FEED_RATE * Math.min(1, nurses / 2) * dt);
          b.fed += take;
          this.larder -= take;
        }
        if (b.fed >= LARVA_FOOD - 1e-9 && b.t >= T_LARVA) {
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

  /** The role a new chamber at (x, y) takes: the colony's first one well above the royal chamber is reception; below it, store; else brood. */
  #roleFor(x: number, y: number): Role {
    const ch = this.map.chambers!;
    const mine = ch.list.filter((c) => c.colony === this.params.nest && c.cells > 0);
    const royal = mine.find((c) => c.role === "royal");
    if (!royal) return "brood";
    if (y < royal.floorRow - RECEPTION_ABOVE && !mine.some((c) => c.role === "reception")) return "reception";
    if (y > royal.floorRow + STORE_BELOW) return "store";
    void x;
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
    if (this.#rng() > Math.exp(-Math.max(0, c.floorRow - groundTop(this.map, cx)) / WIDEN_DEPTH)) return -1;
    for (let k = 0; k < 6; k++) {
      const d = (prefer + (k & 1 ? (k + 1) >> 1 : -(k >> 1)) + 6) % 6; // the preferred way, then alternately either side of it
      const tx = stepX(cx, cy, d);
      const ty = stepY(cy, d);
      if (ty > c.floorRow || ty <= c.floorRow - CHAMBER_HEIGHT) continue;
      if (rockAt(this.map, tx, ty) !== SOIL || this.map.loose?.get(tx, ty) === 1 || this.#crust(tx, ty)) continue;
      if (this.#joinsChamber(tx, ty, id)) continue;
      return d;
    }
    return -1;
  }

  /**
   * An explorer in a tunnel of the side view's nest, crowded: start a new chamber sideways off it, here? Likelier near
   * the top (exp(−depth / CHAMBER_DEPTH)), and only CHAMBER_GAP + depth × CHAMBER_GAP_GROWTH rows from the colony's
   * nearest chamber round it, so they come out top-heavy with the gaps growing with depth (Tschinkel). The way, or −1.
   */
  #newChamberWay(cx: number, cy: number): number {
    const ch = this.map.chambers;
    if (!ch || isSky(this.map, cx, cy) || ch.at(cx, cy) >= 0) return -1;
    const depth = cy - groundTop(this.map, cx);
    if (depth < CHAMBER_MIN_DEPTH || this.#rng() > NEW_CHAMBER * Math.exp(-depth / CHAMBER_DEPTH)) return -1;
    if (!this.#chamberRoom(cx, cy, depth)) return -1;
    const first = this.#rng() < 0.5 ? 0 : 3; // east or west, along the row
    for (const d of [first, 3 - first]) {
      const tx = stepX(cx, cy, d);
      const ty = stepY(cy, d);
      if (rockAt(this.map, tx, ty) === SOIL && this.map.loose?.get(tx, ty) !== 1 && !this.#crust(tx, ty) && !this.#joinsChamber(tx, ty, -1)) return d;
    }
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
    if (this.map.loose?.get(x, y) === 1) return false; // the mound: loose pellets, picked up anywhere (see LOOSE_DIG)
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

  /** Whether ant i is in a cell it hasn't looked round yet (leaves its cell in CELL). */
  #enteredCell(i: number): boolean {
    this.antCell(i);
    const packed = (CELL[1] as number) * 65536 + (CELL[0] as number);
    if (this.#looked[i] === packed) return false;
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
  #towardHole(cx: number, cy: number, alongGround: boolean, below = NaN): number {
    const ent = this.#entrance as Nest;
    const hx = this.#holeX; // where the ant believes the hole is (see #believe)
    const metric = (x: number, y: number) => (alongGround ? Math.abs(x - hx) * 1000 : 0) + Math.hypot(x - hx, y - ent.y);
    let best = -1;
    let bestD = (Number.isNaN(below) ? metric(centreX(cx, cy), centreY(cy)) : below) - 1e-6;
    for (let d = 0; d < 6; d++) {
      const tx = stepX(cx, cy, d);
      const ty = stepY(cy, d);
      if (rockAt(this.map, tx, ty) !== OPEN) continue;
      const m = metric(centreX(tx, ty), centreY(ty));
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
      d = handOnWall(this.map, x, y, d, side);
      x = stepX(x, y, d);
      y = stepY(y, d);
      if (rockAt(this.map, x, y) !== OPEN || !isSky(this.map, x, y)) return Infinity;
      if (this.#holeMetric(x, y) < min - 1e-6) return k;
    }
    return Infinity;
  }

  /** The along-the-ground distance to the hole (see #towardHole) from cell (cx, cy). */
  #holeMetric(cx: number, cy: number): number {
    const x = centreX(cx, cy);
    return Math.abs(x - this.#holeX) * 1000 + Math.hypot(x - this.#holeX, centreY(cy) - (this.#entrance as Nest).y);
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
    const side = (this.#spoilSide[i] || 1) as -1 | 1;
    const heap = (): void => {
      const cell = heapMound(map, this.#entranceCol, side, 0, this.#holes, col) ?? heapMound(map, this.#entranceCol, side === 1 ? -1 : 1, 0, this.#holes, col);
      if (!cell) {
        this.moundLost++;
        return;
      }
      this.moundCells++;
      // The trail lying on the walkway cell just buried rides up onto the new one above it, so heaps don't cut trails.
      for (const ch of ["food", "home"] as const) {
        const v = ph.fields[ch].get(cell[0], cell[1]);
        const above = ph.fields[ch].get(cell[0], cell[1] - 1);
        if (v > above) ph.depositCell(ch, cell[0], cell[1] - 1, v - above);
      }
    };
    if (this.#loosePellet[i]) {
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
    this.pellet[i] = 0;
    this.#loosePellet[i] = 0;
    this.#fillIntent[i] = 0;
    this.#spoilTo[i] = NaN;
    this.since[i] = 0;
  }

  /**
   * The side view: an explorer on the ground beside loose soil now and then picks up a pellet of it (it comes up
   * easily). From a steep flank (LOOSE_SPREAD_PICK a cell) it carries it a little farther out and drops it again, so
   * the mound spreads and smooths itself as ants rework their spoil; from anywhere on it (LOOSE_FILL_PICK) it takes
   * it down into the nest to refill unused space, as leaf-cutting ants refill excess space (Pielström & Roces).
   * True if it picked one up.
   */
  #pickLoose(i: number, cx: number, cy: number): boolean {
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
      if (!takeLoose(map, tx, ty)) continue;
      this.#takeUpLoose(i, tx, fill);
      return true;
    }
    return false;
  }

  /** Ant i takes up a loose pellet from column `col` (off the mound's top, or dug from it): down to fill, or spreading it farther out. */
  #takeUpLoose(i: number, col: number, fill = false): void {
    this.pellet[i] = 1;
    this.#loosePellet[i] = 1;
    this.loosePicked++;
    this.moundCells--;
    this.since[i] = 0;
    this.wall[i] = 0;
    this.mx[i] = NaN;
    this.gx[i] = NO_CELL;
    const out = col >= this.#entranceCol ? 1 : -1;
    if (fill) {
      this.#fillIntent[i] = 1;
    } else {
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

  /** The nearest cell holding enemies within ENEMY_RANGE of ant i, as a heading, or null. */
  #enemyHeading(i: number): number | null {
    const g = this.enemies;
    if (!g) return null;
    // Strangers to this ant, as it perceives them: its own odour, its own tolerance.
    g.look?.(this.odour[i] as number, this.tolerance[i] as number);
    const { w, h } = this.map.size;
    this.antCell(i);
    const cx = CELL[0] as number;
    const cy = CELL[1] as number;
    if (!g.any(cx - ENEMY_RANGE - 1, cy - ENEMY_RANGE, cx + ENEMY_RANGE + 1, cy + ENEMY_RANGE)) return null;
    // The hex disc round the ant, nearest cells first: the first cell holding enemies is the nearest.
    const o = discOffsets(ENEMY_RANGE)[cy & 1] as Int16Array;
    for (let k = 0; k < o.length; k += 2) {
      const x = cx + (o[k] as number);
      const y = cy + (o[k + 1] as number);
      if (x < 0 || y < 0 || x >= w || y >= h || g.get(x, y) < ENEMY) continue;
      return Math.atan2(centreY(y) - (this.y[i] as number), centreX(x, y) - (this.x[i] as number));
    }
    return null;
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
      const af = sn[7] as number;
      const ar = sn[8] as number;
      const toEnemy = this.#enemyHeading(i);

      // The mode choice, only when the situation changed since the ant was last asked.
      // A carrying ant goes home: a mechanic, never asked (and asked afresh once it puts the food down).
      // So does one carrying a soil pellet it dug, to drop on the mound.
      const carrying = this.carrying[i] === 1;
      const pellet = this.pellet[i] === 1;
      const nursing = this.#holdsBrood[i] === 1;
      if (!pellet) this.#staleWalk[i] = 0; // a stale walk is part of one trip home with a pellet
      // Where homing heads: the chamber; in the side view, the entrance for a pellet carrier (soil goes up and
      // out) and for any ant on the ground line (path integration home is to the hole, not through the ground).
      const goal = nursing ? this.#broodGoal(i) : this.#goal(i, pellet);
      let nest = goal;
      const x0 = this.x[i] as number;
      const y0 = this.y[i] as number;
      let mode = this.mode[i] as number;
      const prevMode = mode;
      if (carrying || pellet || nursing) {
        mode = RETURN;
        this.mode[i] = RETURN;
        this.#asked[i] = -1;
        this.#question[i] = -1; // going home is not a choice; the next question comes once the food is down
      } else {
        const tired = (this.since[i] as number) > p.patience * (this.clock[i] as number);
        const food = trailLevel(Math.max(fl, ff, fr));
        const home = this.#homeField(i, hl, hf, hr);
        const alarm = trailLevel(Math.max(al, af, ar));
        const enemy = toEnemy === null ? 0 : 1;
        const stance = STANCES.indexOf(this.stance);
        const before = encode(mode, tired, food, home, alarm, enemy, stance);
        if (before !== this.#asked[i]) {
          mode = MODES.indexOf(this.policy({ mode: MODES[mode] as Mode, tired, foodTrail: food, homeTrail: home, alarm, enemy: enemy ? "near" : "none", stance: this.stance }));
          if (mode < 0) mode = tired ? RETURN : EXPLORE; // a policy answering nonsense falls back to the plain rule
          if (mode === RETURN && this.mode[i] !== RETURN) this.#homeAfresh(i);
          this.mode[i] = mode;
          this.#asked[i] = encode(mode, tired, food, home, alarm, enemy, stance);
          this.seen[before] = 1;
          this.#question[i] = before;
          this.decisions++;
        }
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
        // ever), and the tunnel walker picks branches by its home vector for BY_VECTOR seconds; then by scent again.
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
        const side = this.wall[i] as number;
        // Carrying a pellet out to the mound, it doesn't look for space to fill on the way (it has chosen the mound).
        const look = pellet && map.hasSoil && Number.isNaN(this.#spoilTo[i] as number) && (this.since[i] as number) > BACKFILL.after && this.#enteredCell(i);
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
          else {
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
              if (this.#touch(x, y, h, 1)) h -= sd * p.turnRate * dt * 2; // wall ahead: turn away
              else if (!this.#touch(x, y, h + sd * 0.9, 1.2)) h += sd * p.turnRate * dt; // the wall fell away: hug round the corner
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
              const nearer = t > 1 && dist < hit - 0.5 && open2;
              // Or, a few times a trip, after 3 s of following wherever the way home is open: a hand on the wall
              // in a dug-out cavern drifts from speck to speck farther from home, and a speck needn't be walked
              // round. Only a few: a release that makes no progress could leave and meet the same wall for ever.
              const anywhere = t > 3 && (this.#noGain[i] as number) < NO_GAIN && open2;
              const sight = Math.hypot(goal.x - ox, goal.y - oy) < NEST_SIGHT && this.#clearTo(ox, oy, goal.x, goal.y);
              const leave = this.gx[i] !== NO_CELL && (onLine || island || nearer || anywhere || sight);
              // Into a tunnel with home scent: the scent leads from here (counted like a release: it may lead
              // back to this same wall, so after a few that gain nothing, only progress lets it go).
              const scent = !leave && (dist < hit - 0.5 || (this.#noGain[i] as number) < NO_GAIN) && tunnel(map, cx, cy) && this.#homeScentNear(cx, cy);
              if (looped && !leave && !scent && this.byCell[i]) {
                // All the way round this wall (a speck of soil) and nowhere on it nearer home: it can't be the
                // way. Give up on it now (wander a while, then try afresh) rather than after FOLLOW_GIVE_UP.
                this.#giveUp(i);
              } else if (leave || scent) {
                // Progress is kept for the whole trip: the next wall it meets is judged against the nearest it has been.
                if (dist < hit - 0.5) this.#noGain[i] = 0;
                else if (!onLine && !island && !nearer && !sight) this.#noGain[i] = (this.#noGain[i] as number) + 1;
                this.hitDist[i] = Math.min(hit, dist);
              }
              if (leave || scent) {
                // Back on its line home, nearer than where it met this wall, and the way is open; or the nest
                // itself is in plain view; or into a tunnel with home scent to lead it (see #walkTunnel).
                // A tunnel with none (a stub off a chamber) it keeps following the wall through.
                this.wall[i] = 0;
                h = turnToward(h, toNest, p.turnRate * dt * 0.8);
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
      } else if (mode === FOLLOW) {
        if (!digging && this.#walkTunnel(i, FOLLOW, p.speed * dt)) h = this.#towardTarget(i);
        else h += climb(fl, ff, fr, p.turnRate * dt) + noise * p.wander * 0.25;
      } else if (mode === FIGHT) {
        // A calm ant (the fungus's cue) does not charge.
        if (toEnemy !== null) h = turnToward(h, toEnemy, p.turnRate * dt * 2 * (1 - (this.calm[i] as number)));
        else if (Math.max(al, af, ar) >= FAINT) h += climb(al, af, ar, p.turnRate * dt);
        else if (this.stance === "raid" && this.raidTarget && !detouring) {
          const t = this.raidTarget;
          h = turnToward(h, Math.atan2(t.y - (this.y[i] as number), t.x - (this.x[i] as number)), p.turnRate * dt * 0.5) + noise * p.wander * 0.25;
        } else h += noise * p.wander;
      } else if (!digging) {
        const seen = Math.max(fl, ff, fr) >= SEEN;
        // Food in sight, unless soil stands between (it touched soil a moment ago): then keep a hand on the wall.
        if (seen && !((this.hugT[i] as number) > 0)) h += climb(fl, ff, fr, p.turnRate * dt);
        else if (this.#walkTunnel(i, EXPLORE, p.speed * dt)) h = this.#towardTarget(i);
        else h += noise * p.wander;
      }
      // Every mode but fighting shies away from alarm.
      if (mode !== FIGHT && !digging) h += avoid(al, af, ar, p.turnRate * p.alarmAvoid * dt);

      // Lay trail: walking out marks the way home, carrying food marks the way to it; a pellet carrier lays none.
      // The fungus can make it louder or quieter, and have a food carrier leak its food trail into the other colony's
      // field (exact as-is: × 1, nothing leaked).
      if (!pellet) {
        const laid = p.deposit * Math.exp(-(this.since[i] as number) / p.depositDecay) * dt * (this.layGain[i] as number);
        this.antCell(i);
        ph.depositCell(carrying ? "food" : "home", CELL[0] as number, CELL[1] as number, laid);
        const leak = this.crossLay[i] as number;
        if (carrying && leak > 0 && this.foreign) this.foreign.depositCell("food", CELL[0] as number, CELL[1] as number, laid * leak);
      }

      // Move; rock or the edge turns the ant back somewhere random.
      const nx = (this.x[i] as number) + Math.cos(h) * p.speed * dt;
      const ny = (this.y[i] as number) + Math.sin(h) * p.speed * dt;
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
      let face = !landOpen && mode === EXPLORE && !carrying && !pellet ? soilFace(map, this.x[i] as number, this.y[i] as number, nx, ny, h, this.gx[i] as number, this.gy[i] as number) : NO_FACE;
      if (face === START_FACE) face = digging || rng() < START * (this.crowded() ? 1 : ROOMY_DIG) ? DIG_FACE : GLANCE;
      // A roomy nest (ja-wii): a tunnel's end met head-on is dug only now and then; turned along the wall otherwise, so the
      // next tick doesn't simply try again.
      else if (face === DIG_FACE && !digging && Number.isNaN(this.digAim[i] as number) && map.chambers && !this.crowded() && rng() > ROOMY_DIG) face = GLANCE; // (an aimed face passed ROOMY_DIG when it was chosen)
      // A chamber face it aimed at (widening a chamber, or a new one off a tunnel): dug whatever the tunnel rules say.
      if (face !== NO_FACE && this.#chamberCell[i] >= 0 && mode === EXPLORE && !carrying && !pellet) {
        cellOf(nx, ny);
        if (this.#chamberCell[i] === (CELL[1] as number) * 65536 + (CELL[0] as number) && rockAt(map, CELL[0] as number, CELL[1] as number) === SOIL) face = DIG_FACE;
      }
      if (face === DIG_FACE && map.sky) {
        cellOf(nx, ny);
        const looseFace = map.loose?.get(CELL[0] as number, CELL[1] as number) === 1;
        this.antCell(i);
        // Loose soil faced from the ground line is picked up only by the rules of #pickLoose (spreading, backfill), not
        // dug at head-on: explorers chewed the mound and carried it to the hole and out again. From below, it digs quickly.
        if (looseFace ? isSky(map, CELL[0] as number, CELL[1] as number) : !this.#mayDig(CELL[0] as number, CELL[1] as number)) face = GLANCE;
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
          this.digT[i] = DIG_TIME * (1 + rng()) * (map.loose?.get(CELL[0] as number, CELL[1] as number) === 1 ? LOOSE_DIG : 1);
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
          } else if (left <= 0 && map.loose?.get(fx, fy) === 1 && takeLoose(map, fx, fy)) {
            // Loose soil off the mound: a moved pellet, not dug ground. It goes back out like any other (to the hole, then out).
            this.digAim[i] = NaN;
            this.#takeUpLoose(i, fx);
            this.#fillIntent[i] = 0;
            this.#spoilTo[i] = NaN;
            h += Math.PI;
          } else if (left <= 0 && digCell(map, fx, fy)) {
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
            // A fresh trip home: the bumps and detour it ran up exploring the tunnels are behind it.
            this.detour[i] = 0;
            this.bumps[i] = 0;
            h += Math.PI;
          }
        }
      } else if (!landOpen) {
        this.digT[i] = 0;
        if (mode === RETURN && !detouring) {
          // Homing: start (or keep) following this wall by touch instead of turning at random.
          const x = this.x[i] as number;
          const y = this.y[i] as number;
          const wasFollowing = this.wall[i] !== 0;
          if (this.wall[i] === 0) {
            const toNest = Math.atan2(nest.y - y, nest.x - x);
            cellOf(nx, ny);
            const soilWall = rockAt(map, CELL[0] as number, CELL[1] as number) === SOIL;
            const newTrip = Number.isNaN(this.mx[i] as number);
            if (newTrip) this.#noGain[i] = 0;
            if (newTrip || soilWall) {
              // The first rock this trip: remember where, so the line from here to the nest is the way home it
              // keeps returning to. Soil walls re-anchor it at every wall: in dug ground the ant meets speck
              // after speck, and heading home from wherever it left the last one it is rarely back on the
              // first wall's line, so it would circle a speck until it gave up (review of MR 8).
              this.mx[i] = x;
              this.my[i] = y;
            }
            this.wall[i] = wallSide(this.#touch(x, y, toNest - WALL_PROBE, 1.2), this.#touch(x, y, toNest + WALL_PROBE, 1.2), rng);
            // Round soil, the distance to beat is the nearest it has been this trip (re-anchoring the line at
            // every wall must not forget progress, or it could leave a wall and meet it again for ever).
            const d = Math.hypot(nest.x - x, nest.y - y);
            this.hitDist[i] = soilWall && !newTrip ? Math.min(this.hitDist[i] as number, d) : d;
            this.followT[i] = 0;
            // Facing the wall it met, turned away from the side it keeps the wall on; the first cell decides the way on.
            this.gdir[i] = (crossedDir(map, x, y, nx, ny) - (this.wall[i] as number) + 6) % 6;
            this.gx[i] = NO_CELL;
            cellOf(x, y);
            const hx = CELL[0] as number;
            const hy = CELL[1] as number;
            this.byCell[i] = soilWall || tunnel(map, hx, hy) ? 1 : 0;
          }
          if (!this.byCell[i]) h -= (this.wall[i] as number) * (Math.PI / 2); // by touch: turn away from the wall, along it
          else if (wasFollowing) {
            // Following by cell and blocked: it stands right on its cell's edge (a straight line from inside a cell to a
            // neighbour's centre never leaves the two), so the way to the next cell grazes the solid one beside it and
            // every step lands there. A quarter of the way back to its own cell's centre takes it off the edge.
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
      if (!carrying && !pellet && mode !== FIGHT && takeFoodCell(map, CELL[0] as number, CELL[1] as number)) {
        this.carrying[i] = 1;
        this.#homeAfresh(i);
        this.since[i] = 0;
        h += Math.PI;
      } else if (pellet && ent && !Number.isNaN(this.#spoilTo[i] as number)) {
        // Carrying a pellet out along the ground (side view): dropped where it stands once far enough out (or stuck).
        this.#spoilT[i] = (this.#spoilT[i] as number) + dt;
        const col = CELL[0] as number;
        const onGround = isSky(map, col, CELL[1] as number);
        if ((onGround && (this.#spoilSide[i] as number) * (col - this.#entranceCol) >= (this.#spoilTo[i] as number)) || (this.#spoilT[i] as number) > SPOIL_GIVE_UP) this.#dropOut(i, col);
        // Dropped, it doesn't turn back: out on the ground, it is asked afresh (most explore it), so the ground near the
        // nest is searched. Turned straight back in, almost nobody was on the ground to find the food there.
      } else if (pellet && atEntrance && !this.#fillIntent[i]) {
        // Up and out of the hole: it carries the pellet on out along the ground to drop it, farther as the mound grows
        // (MOUND_REACH at most; more of them farther out, √ of a uniform draw), so the mound spreads as a disc, its area
        // tracking the nest's volume (Tschinkel 2015), where you see them drop it.
        const reach = Math.min(MOUND_REACH, 3 + this.#heaped / (2 * MOUND_HEIGHT));
        this.#spoilTo[i] = 2 + reach * Math.sqrt(rng());
        this.#spoilSide[i] = rng() < 0.5 ? -1 : 1;
        this.#spoilT[i] = 0;
        this.#staleWalk[i] = 0;
        this.wall[i] = 0;
        this.mx[i] = NaN;
        this.gx[i] = NO_CELL;
      } else if (pellet && this.#fillIntent[i] && atNest) {
        // A loose pellet taken down to fill unused space, and none found on the way: it carries it back out.
        this.#fillIntent[i] = 0;
        this.wall[i] = 0;
        this.mx[i] = NaN;
      } else if (ent && !carrying && !pellet && mode === EXPLORE && isSky(map, CELL[0] as number, CELL[1] as number) && this.#enteredCell(i) && this.#pickLoose(i, CELL[0] as number, CELL[1] as number)) {
        // Picked up a loose pellet off the mound (see #pickLoose).
      } else if (atNest && !(pellet && ent)) {
        this.wall[i] = 0;
        this.mx[i] = NaN;
        this.bestD[i] = Infinity;
        this.stallT[i] = 0;
        if ((this.since[i] as number) > 0) this.hand[i] = rng() < 0.5 ? -1 : 1; // just in: the next trip out keeps whichever hand on the walls
        if (carrying) {
          this.carrying[i] = 0;
          this.stored++;
          this.larder++;
          h += Math.PI;
        } else if (pellet && !ent) {
          // The soil goes on the mound: real ants dump it round the entrance, which is how mounds grow.
          this.pellet[i] = 0;
          this.soilOut++;
          h += Math.PI;
        }
        this.since[i] = 0;
        // Home and resting in "return" (its policy said so, or a cached answer did: ja-qnx): after REST seconds it is
        // rested, and asked afresh as an explorer. Going home is done once home; nothing else sends a rested ant out.
        if (mode === RETURN && !carrying && !pellet && (this.#restT[i] = (this.#restT[i] as number) + dt) > REST) {
          this.mode[i] = EXPLORE;
          this.#asked[i] = -1;
          this.#restT[i] = 0;
        }
      } else this.since[i] = (this.since[i] as number) + dt;
      if (!atNest) this.#restT[i] = 0;
      if (ent) {
        this.#integrate(i, x0, y0, atNest);
        // Road signs: underground, a strong nest trail where it stands tells it where it is, and its memory's error fades
        // (Heyman et al. 2017; slice 3 gives each chamber its own mark). Outside, the hole's sight and smell do it (#believe).
        // Read on the floor where it stands (a road sign is under its antennae; the sensors ahead are often in soil in a tunnel).
        if (this.#under[i] && (ph.fields.home.get(CELL[0] as number, CELL[1] as number) * (this.gainHome[i] as number) >= STRONG || ph.fields[this.#destMark(i)].get(CELL[0] as number, CELL[1] as number) * (this.gainHome[i] as number) >= STRONG)) this.odoNest[i] = (this.odoNest[i] as number) * Math.exp(-dt / ROAD_SIGN);
        if (this.map.chambers) this.#layMark(i, dt);
        if (this.queen) this.#nurse(i, dt);
      }
      this.heading[i] = h;
    }
    if (this.#entrance) {
      let under = 0;
      for (let k = 0; k < this.n; k++) if (this.alive[k] && this.#under[k]) under++;
      this.inNest = under;
    }
    ph.advance(dt);
    // Growth: in the side view, the queen and brood (#nestLife); elsewhere the larder turns into ants while there is room.
    if (this.queen) this.#nestLife(dt);
    else while (this.larder >= p.foodPerAnt && this.spawn()) this.larder -= p.foodPerAnt;
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

function encode(mode: number, tired: boolean, food: Trail, home: Home, alarm: Trail, enemy: number, stance: number): number {
  return (((((mode * 2 + (tired ? 1 : 0)) * 3 + TRAILS.indexOf(food)) * HOMES.length + HOMES.indexOf(home)) * 3 + TRAILS.indexOf(alarm)) * 2 + enemy) * 3 + stance;
}

/** Seconds of wall-following before giving up on this wall for a while (a big rock mass can take over a minute to walk round). */
export const FOLLOW_GIVE_UP = 120;
/** Seconds of wall-following before trying the other side once (same line home). */
export const FOLLOW_FLIP = 45;
/** Seconds a homing ant may get no nearer its goal before tunnel branches are picked by its home vector, and for how long. */
export const TUNNEL_STALL = 20;
export const BY_VECTOR = 15;
/** How near (cells) an ant must be to its line home to count as back on it: a step is ~0.23 cells, so it can't skip over. */
const M_LINE_WIDTH = 0.6;
/** Releases from a soil wall a trip may make without getting any nearer home, before only progress counts. */
const NO_GAIN = 3;
/** A wall-follower this near the nest, with a clear way to it, sees (or smells) it and leaves the wall. */
const NEST_SIGHT = 8;
/** Path integration's drift (σ, per unit walked): the error is ~10 % of the distance walked (Wehner 2006; docs/nest-and-home.md §1). */
export const PI_DRIFT = 0.1;
/** Within this (world units) across the ground of the hole (and twice it up or down: the crater) an ant sees it and smells the entrance: its vector no longer matters. */
export const HOLE_SIGHT = 6;
/** The search round a believed goal that wasn't there: the first loop's reach (cells), each next one this much wider, to at most SEARCH_MAX. */
const SEARCH_START = 3;
/** Seconds an ant rests at home in "return" before it is asked afresh as an explorer (ja-qnx). */
export const REST = 10;
// The queen and brood (nest slice 4): see #nestLife, #nurse. Food per worker is EGG_FOOD + LARVA_FOOD = foodPerAnt (4).
/** Food in an egg, and fed to a larva before it pupates. */
const EGG_FOOD = 1;
const LARVA_FOOD = 3;
/** Seconds as an egg; at least this long as a larva (and fed); as a pupa. */
export const T_EGG = 15;
export const T_LARVA = 20;
export const T_PUPA = 20;
/** At most one egg this often (seconds), while there is food and room. */
const LAY_INTERVAL = 0.5;
/** Food a larva takes per second with two nurses or more by it. */
const FEED_RATE = 0.5;
/** Chance per second an idle ant in the royal chamber picks up an egg near it to take to a brood chamber. */
const PICK_BROOD = 0.5;
/** A worker's mean lifespan, seconds (each 0.7–1.3× it): an orphaned colony dwindles as its workers age out. */
export const LIFESPAN = 1800;
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
const CHAMBER_MIN_DEPTH = 8;
const CHAMBER_GAP = 4;
const CHAMBER_GAP_GROWTH = 0.15;
const CHAMBER_SPREAD = 10;
/** A roomy nest digs this share as often as before (tunnels at dead ends, starts off walls, head-on). */
export const ROOMY_DIG = 0.15;
/** Cells a homing ant follows the ground's surface round spoil before trying the other hand. */
const GROUND_FLIP = 24;
/** Cells an ant feels ahead along the surface, each way, to choose which hand to follow it with. */
const GROUND_LOOK = 16;
/** Seconds on a strong nest trail for the in-nest memory's error to fall to 1/e. */
const ROAD_SIGN = 2;
const SEARCH_GROW = 1.6;
const SEARCH_MAX = 80;
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
 * be dug, the other; failing both, the diggable way nearest the heading; −1 if none.
 */
export function chooseDig(map: WorldMap, x: number, y: number, aim: number, u: number): number {
  const a = (((aim / (Math.PI / 3)) % 6) + 6) % 6;
  const lo = Math.floor(a) % 6;
  const hi = (lo + 1) % 6;
  const first = u < a - Math.floor(a) ? hi : lo;
  let dug = -1;
  let off = Infinity;
  for (const d of [first, first === lo ? hi : lo, 0, 1, 2, 3, 4, 5]) {
    const tx = stepX(x, y, d);
    const ty = stepY(y, d);
    if (rockAt(map, tx, ty) !== SOIL || !diggable(map, tx, ty, d)) continue;
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


/** The side view: about how high (rows) the spoil disc stands as it spreads: a steep cone halved the food brought home, six rows cost a third. */
const MOUND_HEIGHT = 3;
/** The side view: the farthest (columns) a pellet is carried from the hole; past it the disc grows higher, not wider. */
const MOUND_REACH = 90;
/** The side view: seconds a carrier walks a pellet out before it drops it wherever it is (heaped on top of its column, clear of the crater). */
const SPOIL_GIVE_UP = 15;
/** The side view: an explorer on the ground beside a steep flank of the mound picks a pellet off it to spread, with this chance a cell. */
const LOOSE_SPREAD_PICK = 0.01;
/** The side view: an explorer on the ground beside the mound takes a pellet of it down to backfill, with this chance a cell. */
const LOOSE_FILL_PICK = 0.005;
/** The side view: how much farther out (columns, on average) a loose pellet is spread. */
const LOOSE_SPREAD = 12;
/** The side view: loose soil digs in this share of packed soil's time (it is loose pellets, not soil in place). */
const LOOSE_DIG = 0.25;
/** The side view: how near its entrance (world units) an ant counts as at it, to drop a pellet. */
const ENTRANCE_R = 1.5;
/** The side view: how near its entrance an ant on the ground line may dig (and how much ground round the hole stays unfilled). */
const ENTRANCE_ZONE = 4;

/**
 * Backfill tuning (mutable, for sweeps and tests). A pellet carrier may fill only `after` seconds into its trip
 * home (not the cell it has just dug: the tunnel's live end). A side passage counts as unused when its scent is under
 * staleRatio × the scent where the carrier stands (or FAINT), raised up to (1 + pelletPull)× next to pellets
 * filled in the last pelletTau seconds or so. A carrier takes a stale way at a fork with chance enterStale,
 * until staleSearch seconds into its trip home.
 */
export const BACKFILL = { after: 2.5, staleRatio: 0.5, enterStale: 0.3, staleSearch: 20, pelletTau: 60, pelletPull: 6, maxOpen: 5 };

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
 * tunnels rather than caverns.
 */
export function soilFace(map: WorldMap, x: number, y: number, px: number, py: number, h: number, aimX = NO_CELL, aimY = 0): number {
  cellOf(px, py);
  const tx = CELL[0] as number;
  const ty = CELL[1] as number;
  if (rockAt(map, tx, ty) !== SOIL) return NO_FACE;
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

/** Turn toward the strongest of three sensors, at most `max` radians. */
export function climb(left: number, front: number, right: number, max: number): number {
  if (front >= left && front >= right) return 0;
  return left > right ? -max : max;
}

/** Turn toward the weakest of three alarm sensors, at most `max` radians; nothing when no sensor smells alarm. */
export function avoid(left: number, front: number, right: number, max: number): number {
  if (Math.max(left, front, right) < FAINT) return 0;
  if (front <= left && front <= right) return 0;
  return left < right ? -max : max;
}

/** Turn `h` toward `target` by at most `max` radians, the short way round. */
export function turnToward(h: number, target: number, max: number): number {
  const d = Math.atan2(Math.sin(target - h), Math.cos(target - h));
  return h + Math.max(-max, Math.min(max, d));
}
