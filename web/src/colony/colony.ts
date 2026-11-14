import { encode as encodeSave, fillLike, loadFields, saveFields } from "./save.ts";
import { type AntArrays, makeAntArrays, NO_KEY } from "./ants.ts";
import { type Channel, type Mark, Pheromones } from "./pheromone.ts";
import { Brood } from "./brood.ts";
export { isFed, LARVA_FOOD } from "./brood.ts";
import { type Chamber, CHAMBER_HEIGHT, type Chambers } from "./chambers.ts";
import { plumeAt, updatePlume } from "./plume.ts";
import { CELL, cellOf, centreX, centreY, DIR_ANGLE, discOffsets, hexDistance, nx as stepX, ny as stepY, R } from "./hex.ts";
import {
  type CellCounts,
  MODES,
  type Mode,
  type Policy,
  type Situation,
  type SpeciesSituation,
  type Stance,
  type StancePolicy,
  type StanceSituation,
  type Trail,
  FIGHT,
  RETURN,
  PLANE,
  CURTAIN,
} from "./vocab.ts";
import type { Draw } from "./weighted.ts";
import type { Schema } from "./schema.ts";
import { DonorGrid, FeltGrid } from "./hunger.ts";
import { type Alate, scentShare, MeanGrid } from "./royal.ts";
import { type Item, localResponses, type Odds, type Responses, type Where, type Touch } from "./responses.ts";
import { blocked, groundTop, isSky, OPEN, takeLoose, rockAt, type Nest, type WorldMap } from "./world.ts";
import { cellAt, type Transect } from "./transect.ts";
import { SITUATIONS, decodeSituation } from "./situation.ts";
import {
  CHAMBER_GAP,
  CHAMBER_GAP_GROWTH,
  CHAMBER_MIN_DEPTH,
  CHAMBER_SPREAD,
  CROWD_HALF,
  EDGE,
  ENTRANCE_R,
  ENTRANCE_ZONE,
  FLOOR_PER_ANT,
  FOES_HALF,
  HOLE_SIGHT,
  INTAKE_NONE,
  INTAKE_PLENTY,
  INTAKE_WINDOW,
  LEAVE_NOW,
  LEAVE_SOON,
  LOOSE_FILL_PICK,
  LOOSE_SPREAD,
  LOOSE_SPREAD_PICK,
  MET_HALF,
  MIDDEN_AT,
  MIDDEN_SPREAD,
  MILL_WAYS,
  M_LINE_WIDTH,
  PI_DRIFT,
  RECEPTION_MIN,
  SEARCH_GROW_2D,
  SEARCH_START,
  THREAT_HALF,
  WAIT_STEPS,
} from "./tuning.ts";
import { NO_CELL, SOIL_DUG, SOIL_FILL, SOIL_LOOSE, cellKey, climb, planeMoundReach } from "./grid.ts";
import { DEFAULT_COLONY, LOOP_AT, channelParams, type ColonyParams } from "./params.ts";
import { middenSmell, nestLife } from "./nestWork.ts";
import { unbury } from "./dig.ts";
import { outDistAt } from "./homing.ts";
import { placeOn, touch } from "./sense.ts";
import { ageWorkers, body, feedHome, killOn, placeNewborn, spawnHome } from "./body.ts";
import { perceive } from "./perceive.ts";
import { stanceStep } from "./stance.ts";
import { decide } from "./decide.ts";
import { steer } from "./steer.ts";
import { moveDig } from "./move.ts";
import { arrive } from "./arrive.ts";
import { AntStep } from "./step.ts";
import { atGate, crossed } from "./crossing.ts";
export { SITUATIONS, decodeSituation, encodeSituation, packSituation } from "./situation.ts";
export {
  BY_VECTOR,
  CHAMBER_MIN_DEPTH,
  CORPSE_ROT,
  CROWD_HALF,
  CROWN_RATE,
  DIG_FACE,
  DIG_TIME,
  FLOOR_PER_ANT,
  FOES_HALF,
  FOLLOW_FLIP,
  FOLLOW_GIVE_UP,
  GLANCE,
  HOLE_SIGHT,
  INTAKE_NONE,
  INTAKE_PLENTY,
  INTAKE_WINDOW,
  LEAVE_NOW,
  LEAVE_SOON,
  MET_HALF,
  MIDDEN_AT,
  MIDDEN_MIN,
  NANITIC_AGE,
  NO_FACE,
  PI_DRIFT,
  REST,
  RETURNS_MANY,
  ROOMY_DIG,
  SENSE_STEPS,
  START_FACE,
  SWELL,
  THREAT_HALF,
  TUNNEL_STALL,
  T_EGG,
  T_LARVA,
  T_PUPA,
  WAIT_RIM,
  WAIT_STEPS,
  WALL_LOST,
} from "./tuning.ts";
export {
  angleDiff,
  avoid,
  besideRefill,
  builtFloor,
  cellKey,
  choose,
  chooseDig,
  climb,
  crossedDir,
  digChance,
  diggable,
  floorGround,
  handOnWall,
  inReach,
  keyX,
  keyY,
  moundRadius,
  narrow,
  planeMoundReach,
  refilled,
  soilFace,
  startable,
  stub,
  tunnel,
  tunnelEnd,
  turnToward,
  walkable,
  wallSide,
} from "./grid.ts";
export { BACKFILL, DEFAULT_COLONY, LIFESPAN, MIDDLE, YOUNG, channelParams, type BackfillTuning, type ColonyParams } from "./params.ts";

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

/** A dead worker in the side view (nest slice 7): the cell it lies in, who carries it (−1 none), when it died, and the fungus in it. */
export interface Corpse {
  x: number;
  y: number;
  held: number;
  died: number;
  load: number;
  strain: number;
  /** the layer it lies on (one world, U3c: carried up onto the plane, or dropped there by a carrier that died); absent, the colony's home */
  layer?: number;
}

export { swapBroodStore } from "./pheromone.ts";

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
  /** her energy, 0..1 (ja-xu6.1): drained with time, refilled from the food in her chamber; at 0 she dies */
  energy: number;
  /** seconds since she last laid with no food in her chamber to lay with (ja-xu6.1): past QUEEN_WAIT she begs */
  unfed: number;
  /** her scent not yet passed on (ja-lo8.9, royal.ts): it builds while no ant touches her, up to SCENT_HELD seconds' worth */
  held: number;
}

/** The local strategist: defend a nest under attack; raid when no food comes in or the colony is full and fed; else forage. */
export const localStance: StancePolicy = (s) => {
  if (s.enemyNearNest && s.losses !== "none") return "defend";
  if (s.intake === "none" && s.ants !== "few") return "raid";
  if (s.larder === "full" && s.ants === "many") return "raid";
  return "forage";
};

/**
 * One map a colony lives on, and what goes with it (one world, docs/one-world.md §2, §4): the map, the colony's scent on
 * it, its nest there and the hole into it (the curtain's; none on the plane or a top-down map), every nest's hole column,
 * the cached way out to the hole (outField), and what the game wires per map: the strangers and nestmates per cell, the
 * other nests, the raid aims and the rival's scent. A colony on one map (every game but one world) has one.
 */
export interface Layer {
  readonly map: WorldMap;
  readonly ph: Pheromones;
  readonly nest: Nest;
  readonly entrance: Nest | null;
  readonly entranceCol: number;
  readonly entranceRow: number;
  holes: number[];
  outDist: Int32Array | null;
  outCells: number[];
  outVersion: number;
  outAt: number;
  enemies: CellCounts | null;
  nestmates: CellCounts | null;
  friends: CellCounts | null;
  foreign: Pheromones | null;
  raidMarks: Pheromones | null;
  raidTarget: Nest | null;
  raidNest: Nest | null;
  others: Nest[];
}

/** What the game wires into a colony per layer (Colony.wire). */
export type Wiring = Partial<
  Pick<Layer, "enemies" | "nestmates" | "friends" | "foreign" | "raidMarks" | "raidTarget" | "raidNest" | "others">
>;

/**
 * The Layer keys that carry state from tick to tick, which a save keeps for every layer but the bound one (whose values
 * are the colony's own fields, saved with them): its scent, the holes it sees and its cached way out. Every other key
 * is built again: the map, nest and entrance by the constructor and the world, the rest wired by the game (Game.wire,
 * aimAt). tests/save.test.ts holds every key to one list or the other.
 *
 * On today's plane only `ph` changes: it has no entrance, so `seeHoles` leaves its `holes` empty and its way out
 * (`outDist` … `outAt`) is never worked out. Those are saved for completeness, and no test reaches them (#63's review, N3).
 */
export const LAYER_STATE = ["ph", "holes", "outDist", "outCells", "outVersion", "outAt"] as const satisfies readonly (keyof Layer)[];

/** A layer's own copy of its state, held while another layer is bound (see Colony.layers). */
type LayerSlots = { -readonly [K in keyof Layer]: Layer[K] };

export { CURTAIN, PLANE } from "./vocab.ts";

/**
 * One nest's hole on both layers (one world): its cell in the curtain (the crust's open cell, under the line) and the
 * plane cell over it, P(s) for that column s. The only way between the layers (one-world §2).
 */
export interface HoleCell {
  col: number;
  row: number;
  px: number;
  py: number;
}

/** Where a layer's view keeps its slots: a key only this module holds. */
const SLOTS = Symbol("slots");

type LayerView = Layer & { readonly [SLOTS]: LayerSlots };

/** One layer's gates for a tick (Colony.tick): whether it gates leaving, raids by trail and each ant's own stance, and their leaks. */
interface Gates {
  gate: boolean;
  /** one world's curtain (ja-web): outgoing foragers are held at the top of their own shaft (the gate) and asked `leave` there */
  hold: boolean;
  /** whether `met` leaks on this layer: where the colony gates leaving (one world: on both layers, so it fades on a trip out too) */
  leak: boolean;
  metLeak: number;
  rgate: boolean;
  foeLeak: number;
  sgate: boolean;
  threatLeak: number;
  crowdKeep: number;
}

/**
 * A layer's gates for a tick of dt, open ground's only (`open`: no hole into the layer). Activation (behaviour MR 5):
 * `met` leaks over MET_HALF. Raids by trail (behaviour MR 5.2): a finder's count of strangers met leaks like `met`. Each
 * ant's own stance (docs/stance.md): its threat leaks like `foes`; a waiting ant feels its home's crowd over CROWD_HALF.
 * One world (`one`, ja-web): nobody waits on the plane, where every returner goes down its hole; activation is the
 * curtain's, at the top of each shaft (`hold`), where the waiting ant feels its crowd too. Raids by trail and each ant's
 * own stance stay the plane's.
 */
function gatesFor(p: ColonyParams, open: boolean, one: boolean, dt: number): Gates {
  const gate = p.leaveGate > 0 && open && !one;
  const hold = p.leaveGate > 0 && one && !open;
  const leak = p.leaveGate > 0 && (open || one);
  const rgate = p.raidGate > 0 && open;
  const sgate = p.stanceGate > 0 && open;
  return {
    gate,
    hold,
    leak,
    metLeak: leak ? Math.exp((-dt * Math.LN2) / MET_HALF) : 1,
    rgate,
    foeLeak: rgate ? Math.exp((-dt * Math.LN2) / FOES_HALF) : 1,
    sgate,
    threatLeak: sgate ? Math.exp((-dt * Math.LN2) / THREAT_HALF) : 1,
    crowdKeep: sgate || hold ? Math.exp((-dt * Math.LN2) / CROWD_HALF) : 1,
  };
}

/** The colony's own state that is not a public field or an ants.ts array, saved by name in `private` (a field added to the colony that carries state between ticks is listed here, or in COLONY_SKIP when it is code or rebuilt on load; tests/soak/save.test.ts holds that). */
export const COLONY_STATE = [
  "cur",
  "ti",
  "alarmAnt",
  "alarmSmelt",
  "oddsNow",
  "t",
  "outDist",
  "outCells",
  "outVersion",
  "outAt",
  "layT",
  "inJaws",
  "belief",
  "entrance",
  "entranceCol",
  "entranceRow",
  "holes",
  "heaped",
  "goalX",
  "goalY",
  "holeX",
  "storedSeen",
  "returning",
  "returned",
  "holeIn",
  "holeSeen",
  "s",
  "chamberNest",
  "goalCells",
  "want",
  "enRouteTo",
  "portViewAt",
] as const;

/** Colony fields a save leaves out: what the game wires (the map, the nest, other colonies' scent and grids, raid aims: Game saves those as indices), the layers (the maps and scents again) and the policies. */
export const COLONY_SKIP: ReadonlySet<string> = new Set([
  ...COLONY_STATE,
  "plumeTurn", // smellsFood's answer, read in the same tick
  "policyDrew", // set and read within one ask (policyDraw)
  "policyDraw", // code: the draw handed to the mode policy
  "rng",
  "own",
  "map",
  "nest",
  "layers",
  "home",
  "line",
  "holeCells",
  "policy",
  "stancePolicy",
  "responses",
  "onBury",
  "onDie",
  "enemies",
  "foreign",
  "friends",
  "nestmates",
  "raidTarget",
  "raidNest",
  "raidMarks",
  "others",
  "felt",
  "donors",
  "scentSum",
  "perceived",
]);

/** The per-ant arrays of ants.ts are the colony's own properties. */
// The arrays are allocated in the constructor (makeAntArrays), which the compiler cannot see: that is the point of the merge.
// eslint-disable-next-line typescript/no-unsafe-declaration-merging
export interface Colony extends AntArrays {}

export class Colony {
  /** the map, the colony's scent and its nest on the layer being stepped; between ticks, the home layer's */
  map: WorldMap;
  ph: Pheromones;
  nest: Nest;
  /**
   * The maps this colony lives on (Layer): one, but in one world two (the plane and the curtain). The bound layer's state
   * (the one being stepped; between ticks, home) lives in the colony's own fields, which every step reads (this.map,
   * this.entrance, this.enemies, …); each other layer's lives in its slots, where bind put it on leaving. Each entry is
   * a view that reads and writes whichever holds the value now, so a field set either way (wire, or `c.enemies = …` as
   * tests do) is never stale on the other: at any moment each value has one copy. On one layer nothing is ever swapped,
   * and the view only reads and writes the colony's own fields.
   */
  readonly layers: Layer[];
  /** the layer the nest is on (the queen, brood and chambers; where ants are born): 0, but the curtain in one world */
  home = 0;
  /** the layer bound now (bind): `home` between ticks */
  cur = 0;
  /** one world's line (transect.ts): the plane cell over each curtain column; null on any other game's one map. The game sets it again when the line grows (Game.addColony) */
  line: Transect | null = null;
  /** one world: every nest's hole on both layers (HoleCell), indexed by colony as the maps' nests are; empty elsewhere */
  holeCells: HoleCell[] = [];
  params: ColonyParams;
  /** what an ant of this colony does in a situation, and what the colony's strategist chooses: read here, set through `bindPolicy` (the lane's answers: the local rule, Jev's cached answers, a test's) */
  readonly policy: Policy;
  readonly stancePolicy: StancePolicy;
  /** the ant's small responses: pick food up, what to do carrying, put it down, which trail and how much, shy from alarm, raise it (responses.ts) */
  responses: Responses = localResponses;
  stance: Stance = "forage";
  /**
   * whether a rival lives, as the game last found (review of #53, S1): where each ant's stance is its own, nobody raids without one. An
   * interim rule until the world grows a new neighbour when none is left (ja-5hm). The game sets it every strategy tick.
   */
  raidable = true;
  /** the situation handed to a response, refilled for each call (touchProbe): a response reads it and does not keep it */
  /** the ant the shared Touch describes */
  ti = 0;
  /** The shared Touch. Its `place` is worked out only when a response reads it: the local ones never do, and working it out for every ant's trail every step cost the side view ~5 % a tick (review of #35). */
  /** the ant whose sensors were last read this tick, and the alarm they smelt (touch() reads it; other ants: none) */
  alarmAnt = -1;
  alarmSmelt: Trail = "none";
  /** the odds the ant whose sensors were last read met, with strangers in reach (else none) */
  oddsNow: Odds = "none";
  t: Touch = Object.defineProperty(
    {
      mode: "explore",
      carrying: "none",
      porter: false,
      digging: false,
      place: "out",
      offered: "none",
      enemy: false,
      stance: "forage",
      quality: "fair",
      alarm: "none",
      odds: "none",
      returns: "none",
      crowd: "few",
    } as Touch,
    "place",
    { get: () => this.place(this.ti), enumerable: true },
  );
  /** capacity: every per-ant array has this length; `alive` says which slots hold an ant */
  readonly n: number;
  /** the side view: steps to this colony's hole through its tunnels, per cell (see outField), the cells it reached, and the ground's version and time it was built at */
  outDist: Int32Array | null = null;
  outCells: number[] = [];
  outVersion = -1;
  outAt = -Infinity;
  /** ants underground last tick (the side view): with the chambers' floor, how crowded the nest is */
  inNest = 0;
  /** ants out on the ground last tick (the side view) */
  outside = 0;
  // The queen and brood (nest slice 4; the side view only: elsewhere the larder still becomes ants directly).
  /** the colony's queen, in its royal chamber (null on the top-down maps); a colony whose queen is dead is orphaned */
  queen: Queen | null = null;
  readonly brood = new Brood();
  /** seconds owed toward the queen's next egg */
  layT = 0;
  /** workers that died of age */
  diedOld = 0;
  /** workers that died of hunger (ja-xu6.1) */
  diedHungry = 0;
  /** larvae that died of hunger */
  broodStarved = 0;
  /** food eaten: by adults and the queen, by larvae for their energy, and the food in larvae that starved (it leaves the economy) */
  eaten = 0;
  /** larvae reared as gynes (ja-lo8.9, royal.ts); gyne larvae culled by nurses who perceived the queen's scent strong */
  gynes = 0;
  gynesCulled = 0;
  /** winged virgin queens in the nest, from gyne pupae: they wait, then walk out to fly (royal.ts) */
  alates: Alate[] = [];
  /** alates that have flown from the hole since the game last took them (Game.tick), and how many have, ever */
  flown: Alate[] = [];
  flights = 0;
  /**
   * A queen founding alone (ja-lo8.9: a daughter colony, Game.found): she feeds her first brood herself, from the reserve
   * in her chamber, until her first worker ecloses. Such a colony isn't beaten while she lives (Game.beaten).
   */
  founding = false;
  /**
   * A young colony (ja-lo8.10): from her founding until the first worker her workers reared (not a nanitic) ecloses, the
   * queen still feeds the brood by her, as her nanitics are out foraging.
   */
  incipient = false;
  /** brood killed by the fungus's crown */
  broodKilled = 0;
  /** porters' trips (food moved between chambers) */
  portTrips = 0;
  /** foragers that found food waiting at reception and carried theirs on to where it was wanted */
  handedOn = 0;
  /** food porters are carrying between chambers: still the colony's (the queen's reserve and the strategist count it) */
  inJaws = 0;
  // The midden (nest slice 7): corpses lie where workers die until an undertaker carries them out to the midden.
  /** the colony's dead not yet on the midden: where each lies (a cell), who carries it (−1 none), when it died, its fungus */
  readonly corpses: Corpse[] = [];
  /** the midden: corpses buried per cell (cellKey), a count rather than a list growing all game (review of #26) */
  readonly midden = new Map<number, number>();
  /** called with each corpse as it is put on the midden (the game: a sporulating strain's spores there), and the layer it lies on (absent: layer 0) */
  onBury: ((k: Corpse, layer?: number) => void) | null = null;
  /**
   * called as ant i dies, with the layer and cell it dies on, before its slot is cleared (its load and strain still
   * read): the game's fungus grows out of a host dead on the plane, where no corpse is kept (ja-2bw.7, owner 2026-11-12)
   */
  onDie: ((i: number, layer: number, x: number, y: number) => void) | null = null;
  /** Whether ant i carries a corpse (drawn as one, not as soil). */
  carriesCorpse(i: number): boolean {
    return this.corpse[i] === 1;
  }
  /** Whether ant i carries food between chambers (a porter), not home from outside (a forager). */
  porting(i: number): boolean {
    return this.porter[i] === 1;
  }
  /** corpses carried to the midden (one world: buried at the hole, on the plane) */
  buried = 0;
  /** one world: ants that climbed out onto the plane, and went down into the curtain */
  crossedUp = 0;
  crossedDown = 0;
  /** one world: food carried down a hole (home), and food carried up one (a carrier lost in a rival's tunnels, climbing out) */
  carriedDown = 0;
  carriedUp = 0;
  /** where this ant believes its goal is, this tick (a scratch: no allocation per ant) */
  belief: Nest = { x: 0, y: 0, r: 0 };
  /** the side view: the entrance as a small nest to head for (null on the top-down maps) */
  entrance: Nest | null = null;
  /** the side view: the entrance's column, where the mound's crater is, and its row (the hole's cell) */
  entranceCol = 0;
  entranceRow = 0;
  /** the side view: every nest's entrance column (no mound buries a hole, the rival's included) */
  holes: number[] = [];
  /** the side view: cells of soil brought out that found no room on the mound (the sky's top on both sides; never seen in play) */
  moundLost = 0;
  /** the side view: loose pellets picked up off the mound, dropped on it again, put into unused space underground, and lost with ants that died */
  loosePicked = 0;
  looseDropped = 0;
  looseFilled = 0;
  /** the side view: loose pellets taken down to backfill, and of them, carried back out having found nowhere to fill */
  looseDown = 0;
  looseBack = 0;
  looseLost = 0;
  /** the side view: cells of mound heaped so far, or tried (no room at the sky's top): ⌊pellets out × SWELL⌋ once caught up */
  heaped = 0;
  /** the point the current ant is homing to (see homeGoal): the m-line runs to it */
  goalX = 0;
  goalY = 0;
  /** the side view: where the ant being stepped believes the hole is, across the ground (see believe, towardHole) */
  holeX = 0;
  /** food stored per second, a running average over INTAKE_WINDOW (behaviour MR 5): what the strategist knows of food */
  intakeRate = 0;
  storedSeen = 0;
  /**
   * Foragers home with food, per cell where each put it down, keyed by cellKey (behaviour MR 5): `returning` fills
   * this tick, `returned` holds last tick's, which the waiting ants round each one meet, once each.
   */
  returning = new Map<number, number>();
  returned = new Map<number, number>();
  /**
   * One world (ja-web): carriers that came down the colony's hole with food this tick, and last tick's, which every ant
   * held at the top of the shaft meets (each carrier walks down past all of them). Not by cell: the returns above are
   * keyed by cell with no layer. A count for the whole hole stands for an encounter only while the gate is the top
   * WAIT_STEPS cells of one shaft; if the gate grows, or a side tunnel opens near the top, key it by cell (PR #68 N3).
   */
  holeIn = 0;
  holeSeen = 0;
  /** one world (ja-web): ants held at the gate at the top of the shaft, last tick */
  gateHeld = 0;
  /** raid scouts sent out (`leave` answered "raid", or a scout on a broadcast raid stance), finders that went home to tell, and ants a raid trail recruited: counters, read by the assays */
  raidScouts = 0;
  finds = 0;
  recruits = 0;
  /** enemy ants per cell, kept by the game each tick; null when there is no rival */
  enemies: CellCounts | null = null;
  /** the colony's odour: the nest's gestalt, which ants at the nest relax toward and newborns take */
  nestOdour: number;
  /** where a daughter colony's nest odour drifts to from her mother's (ja-lo8.9.1, recognition.ts driftAim); NaN: it doesn't drift */
  odourAim = NaN;
  /** another colony's scent, for ants whose perception reads it: the one this colony would raid, its nearest rival (set by the game; null with no rival) */
  foreign: Pheromones | null = null;
  /** what can be felt by touch on each cell this tick (hunger.ts): begging larvae, a hungry queen, need passed on; rebuilt every tick, not saved */
  felt = new FeltGrid();
  /** the best-fed ant on each cell this tick, for food shared by mouth (hunger.ts); rebuilt every tick, not saved */
  donors = new DonorGrid();
  /** what the ants on each cell carry of the queen's scent, for the mean they share by contact (royal.ts); rebuilt every tick, not saved */
  scentSum = new MeanGrid();
  /** the strongest queen's scent perceived on each cell this tick (scent × scentGain): what nurses rear gynes by; rebuilt every tick, not saved */
  perceived = new FeltGrid();
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
  /** the species' own mode-lane situation (ja-fnd.5.10, setSituation), or null: the generic one, encoded by packSituation */
  own: {
    schema: Schema<SpeciesSituation>;
    sense: ((c: Colony, i: number) => Readonly<Record<string, unknown>>) | null;
    modeStride: number;
    /** the values each of its fields may take, by name: a sensed value outside them is refused (it would encode as another situation) */
    allowed: ReadonlyMap<string, readonly unknown[]>;
  } | null = null;
  rng: () => number;
  /** whether the mode policy drew its answer just now (policyDraw): set in the call, read by decide right after it */
  policyDrew = false;
  /**
   * The `draw` decide hands the mode policy (staging, ja-nan3): the colony's own rng, noting that it was used. A policy
   * draws only from an answer with Jev's probabilities (weighted.ts), so a game that never meets one draws as before.
   */
  readonly policyDraw: Draw = Object.defineProperty(
    (): number => {
      this.policyDrew = true;
      return this.rng();
    },
    "temperature",
    { get: () => this.params.sampleTemp },
  ) as Draw;
  /** sensor readings for the ant being stepped: food, home, alarm × left, front, right */
  s = new Float64Array(9);

  /**
   * A colony on `map`. In one world (`world`, docs/one-world.md §2) `map` is the curtain, its home, where its nest, queen
   * and brood are and every ant starts; the plane is its second layer, where it forages (layers: PLANE, CURTAIN).
   */
  constructor(
    map: WorldMap,
    params: Partial<ColonyParams> = {},
    rng: () => number = Math.random,
    policy: Policy = localPolicy,
    stancePolicy: StancePolicy = localStance,
    world: { plane: WorldMap; line: Transect } | null = null,
  ) {
    this.map = map;
    this.params = { ...DEFAULT_COLONY, ...params };
    // Its own copy: a save loads into it, and a sweep changes it, for this colony alone.
    this.params.backfill = { ...this.params.backfill };
    if (params.maxAnts === undefined) this.params.maxAnts = Math.max(this.params.antCount, Math.round(this.params.antCount * 1.5));
    this.nest = map.nests?.[this.params.nest] ?? map.nest;
    if (map.sky && this.nest.entrance) {
      this.entrance = { x: this.nest.entrance.x, y: this.nest.entrance.y, r: ENTRANCE_R };
      cellOf(this.nest.entrance.x, this.nest.entrance.y);
      this.entranceCol = CELL[0];
      this.entranceRow = CELL[1];
    }
    this.policy = policy;
    this.stancePolicy = stancePolicy;
    this.rng = rng;
    // Top-down, the food trail holds up to foodCapTop (behaviour MR 3): under main's cap a busy trail sat at it near the
    // nest, and a follower couldn't tell a strong trail from a weak (unless the colony's params set a cap of their own).
    const chans = channelParams(this.params.channels);
    if (this.entrance === null && this.params.channels.food?.max === undefined) chans.food = { ...chans.food, max: this.params.foodCapTop };
    this.ph = new Pheromones(map, chans, this.params.channelSet);
    const slots = {} as LayerSlots;
    if (world) {
      // One world: home is the curtain, bound now and between ticks.
      this.home = CURTAIN;
      this.cur = CURTAIN;
    }
    this.store(slots);
    if (world) {
      // The plane: its nest is the disc round the hole (no entrance: the hole is the way in, not a nest to dig), and the
      // colony's scent there has the top-down food cap, as on any open ground. Its Pheromones draws no random numbers.
      const top = channelParams(this.params.channels);
      if (this.params.channels.food?.max === undefined) top.food = { ...top.food, max: this.params.foodCapTop };
      const nest = world.plane.nests[this.params.nest];
      if (!nest) throw new Error(`one world: the plane has no nest ${this.params.nest}`);
      const plane: LayerSlots = {
        map: world.plane,
        ph: new Pheromones(world.plane, top, this.params.channelSet),
        nest,
        entrance: null,
        entranceCol: 0,
        entranceRow: 0,
        holes: [],
        outDist: null,
        outCells: [],
        outVersion: -1,
        outAt: -Infinity,
        enemies: null,
        nestmates: null,
        friends: null,
        foreign: null,
        raidMarks: null,
        raidTarget: null,
        raidNest: null,
        others: [],
      };
      this.layers = [Colony.view(this, PLANE, plane), Colony.view(this, CURTAIN, slots)];
      this.line = world.line;
    } else this.layers = [Colony.view(this, 0, slots)];
    this.seeHoles();
    const n = this.params.maxAnts;
    this.n = n;
    Object.assign(this, makeAntArrays(n, this.params));
    // The queen lies on the royal chamber's floor: its bottom row, in the cell nearest the chamber's centre.
    if (this.entrance && map.chambers)
      this.queen = {
        alive: true,
        ...this.royalFloor(map.chambers),
        load: 0,
        strain: 0,
        resist: 0,
        show: 1,
        signal: 1,
        energy: 1,
        unfed: 0,
        held: 0,
      };
    this.nestOdour = this.params.odour;
    // Colonies step their fields on different ticks, so a tick never pays for every colony's at once.
    this.ph.phase((this.params.nest % 2) * 0.5);
    if (world) (this.layers[PLANE] as Layer).ph.phase((this.params.nest % 2) * 0.5);
    for (let k = 0; k < this.params.antCount; k++) placeNewborn(this, k);
    // The founders carry the colony's steady share of the queen's scent (else every nurse perceives none at the start).
    if (this.queen) this.scent.fill(scentShare(this.params.antCount), 0, this.params.antCount);
    // The founding workers are of all ages (from birth to half a lifespan), so they don't all die at once.
    if (this.queen) for (let k = 0; k < this.params.antCount; k++) this.age[k] = this.rng() * 0.5 * this.lifespan[k];
  }

  /** Where the queen lies (world position): the royal chamber's floor row, the cell on it nearest the founding chamber's centre. */
  /**
   * Every nest's hole on the map (side view), whose funnels the colony's mound keeps open (world.heapMound). Again
   * whenever a colony is founded (Game.addColony), so an older colony's mound never buries the new hole (PR #42
   * review, S3).
   */
  seeHoles(): void {
    // One world: each nest's hole on both layers, by colony (the maps' nests are), the plane cell over its column.
    const line = this.line;
    if (line) {
      const curtain = (this.layers[this.home] as Layer).map;
      this.holeCells = curtain.nests.map((n) => {
        const e = n.entrance ?? n;
        cellOf(e.x, e.y);
        const col = CELL[0];
        const row = CELL[1];
        cellAt(line, col); // the curtain's column is the line's s
        return { col, row, px: CELL[0], py: CELL[1] };
      });
    }
    // On every layer with a hole into it (the side view's map; one world's curtain).
    for (const L of this.layers) {
      if (!L.entrance) continue;
      const holes: number[] = [];
      for (const n of L.map.nests ?? [L.nest])
        if (n.entrance) {
          cellOf(n.entrance.x, n.entrance.y);
          holes.push(CELL[0]);
        }
      L.holes = holes;
    }
  }

  /**
   * Layer l as `layers` shows it: each field read from the colony while l is bound, else from l's slots (see `layers`).
   * Static, so the getters reach the colony's private fields without aliasing `this`.
   */
  static view(c: Colony, l: number, s: LayerSlots): LayerView {
    return {
      [SLOTS]: s,
      get map() {
        return c.cur === l ? c.map : s.map;
      },
      get ph() {
        return c.cur === l ? c.ph : s.ph;
      },
      get nest() {
        return c.cur === l ? c.nest : s.nest;
      },
      get entrance() {
        return c.cur === l ? c.entrance : s.entrance;
      },
      get entranceCol() {
        return c.cur === l ? c.entranceCol : s.entranceCol;
      },
      get entranceRow() {
        return c.cur === l ? c.entranceRow : s.entranceRow;
      },
      get holes() {
        return c.cur === l ? c.holes : s.holes;
      },
      set holes(v) {
        if (c.cur === l) c.holes = v;
        else s.holes = v;
      },
      get outDist() {
        return c.cur === l ? c.outDist : s.outDist;
      },
      set outDist(v) {
        if (c.cur === l) c.outDist = v;
        else s.outDist = v;
      },
      get outCells() {
        return c.cur === l ? c.outCells : s.outCells;
      },
      set outCells(v) {
        if (c.cur === l) c.outCells = v;
        else s.outCells = v;
      },
      get outVersion() {
        return c.cur === l ? c.outVersion : s.outVersion;
      },
      set outVersion(v) {
        if (c.cur === l) c.outVersion = v;
        else s.outVersion = v;
      },
      get outAt() {
        return c.cur === l ? c.outAt : s.outAt;
      },
      set outAt(v) {
        if (c.cur === l) c.outAt = v;
        else s.outAt = v;
      },
      get enemies() {
        return c.cur === l ? c.enemies : s.enemies;
      },
      set enemies(v) {
        if (c.cur === l) c.enemies = v;
        else s.enemies = v;
      },
      get nestmates() {
        return c.cur === l ? c.nestmates : s.nestmates;
      },
      set nestmates(v) {
        if (c.cur === l) c.nestmates = v;
        else s.nestmates = v;
      },
      get friends() {
        return c.cur === l ? c.friends : s.friends;
      },
      set friends(v) {
        if (c.cur === l) c.friends = v;
        else s.friends = v;
      },
      get foreign() {
        return c.cur === l ? c.foreign : s.foreign;
      },
      set foreign(v) {
        if (c.cur === l) c.foreign = v;
        else s.foreign = v;
      },
      get raidMarks() {
        return c.cur === l ? c.raidMarks : s.raidMarks;
      },
      set raidMarks(v) {
        if (c.cur === l) c.raidMarks = v;
        else s.raidMarks = v;
      },
      get raidTarget() {
        return c.cur === l ? c.raidTarget : s.raidTarget;
      },
      set raidTarget(v) {
        if (c.cur === l) c.raidTarget = v;
        else s.raidTarget = v;
      },
      get raidNest() {
        return c.cur === l ? c.raidNest : s.raidNest;
      },
      set raidNest(v) {
        if (c.cur === l) c.raidNest = v;
        else s.raidNest = v;
      },
      get others() {
        return c.cur === l ? c.others : s.others;
      },
      set others(v) {
        if (c.cur === l) c.others = v;
        else s.others = v;
      },
    };
  }

  /** The bound layer's state, from the colony's fields into slots `s`. */
  store(s: LayerSlots): void {
    s.map = this.map;
    s.ph = this.ph;
    s.nest = this.nest;
    s.entrance = this.entrance;
    s.entranceCol = this.entranceCol;
    s.entranceRow = this.entranceRow;
    s.holes = this.holes;
    s.outDist = this.outDist;
    s.outCells = this.outCells;
    s.outVersion = this.outVersion;
    s.outAt = this.outAt;
    s.enemies = this.enemies;
    s.nestmates = this.nestmates;
    s.friends = this.friends;
    s.foreign = this.foreign;
    s.raidMarks = this.raidMarks;
    s.raidTarget = this.raidTarget;
    s.raidNest = this.raidNest;
    s.others = this.others;
  }

  /** Slots `s` into the colony's fields: their layer is the bound one now. */
  loadLayer(s: LayerSlots): void {
    this.map = s.map;
    this.ph = s.ph;
    this.nest = s.nest;
    this.entrance = s.entrance;
    this.entranceCol = s.entranceCol;
    this.entranceRow = s.entranceRow;
    this.holes = s.holes;
    this.outDist = s.outDist;
    this.outCells = s.outCells;
    this.outVersion = s.outVersion;
    this.outAt = s.outAt;
    this.enemies = s.enemies;
    this.nestmates = s.nestmates;
    this.friends = s.friends;
    this.foreign = s.foreign;
    this.raidMarks = s.raidMarks;
    this.raidTarget = s.raidTarget;
    this.raidNest = s.raidNest;
    this.others = s.others;
  }

  /**
   * Bind layer l: the colony's fields become l's (its map, scent, nest, hole, cached way out, wiring), the bound layer's
   * put back in its slots first. Every switch on the map's kind then reads the layer of the ant being stepped. A colony on
   * one layer never swaps: it returns at once.
   */
  bind(l: number): void {
    if (this.layers.length === 1 || l === this.cur) return;
    this.store((this.layers[this.cur] as LayerView)[SLOTS]);
    this.cur = l;
    this.loadLayer((this.layers[l] as LayerView)[SLOTS]);
  }

  /** The game's wiring for layer l (Game.wire, aimAt): into the colony's fields while l is bound, else into l's slots. */
  wire(l: number, patch: Wiring): void {
    Object.assign(this.layers[l] as Layer, patch);
  }

  royalFloor(ch: Chambers): { x: number; y: number } {
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

  /** The cell ant i is in, into CELL (cached for its current position). */
  antCell(i: number): void {
    const x = this.x[i];
    const y = this.y[i];
    if (x !== this.cellAtX[i] || y !== this.cellAtY[i]) {
      cellOf(x, y);
      this.cellX[i] = CELL[0];
      this.cellY[i] = CELL[1];
      this.cellAtX[i] = x;
      this.cellAtY[i] = y;
      return;
    }
    CELL[0] = this.cellX[i];
    CELL[1] = this.cellY[i];
  }

  /**
   * Bind a lane's policy to this colony (the one place a policy is set after the constructor: the page's Jev client, the assays and the tests go through it,
   * not a field). "mode": an ant's choice in its situation; "stance": the colony's strategist.
   */
  /**
   * Ask the mode policy about the species' own situation (ja-fnd.5.10): `schema` names the fields its key and its question hold, `sense` adds the
   * fields of its own (it must read, not draw from the game's random stream, so the game plays on as before). Null: the generic situation. The
   * schema keeps the mode field with every mode (the tick reads a situation's mode off its code), and stays small enough for the ants' question codes.
   */
  setSituation(
    own: { schema: Schema<SpeciesSituation>; sense?: (c: Colony, i: number) => Readonly<Record<string, unknown>> } | null,
  ): void {
    if (!own) {
      this.own = null;
      this.seen = new Uint8Array(SITUATIONS);
      return;
    }
    const at = own.schema.fields.findIndex((f) => f.name === "mode");
    const values = at < 0 ? [] : (own.schema.fields[at]!.values as readonly unknown[]);
    if (at < 0 || values.length !== MODES.length || MODES.some((m, k) => values[k] !== m))
      throw new Error("setSituation: a species' schema keeps the mode field, with every mode in order");
    if (own.schema.size > 0x7fff)
      throw new Error(`setSituation: ${own.schema.size} situations; an ant's question code holds at most 32,767`);
    const allowed = new Map(own.schema.fields.map((f) => [String(f.name), f.values as readonly unknown[]] as const));
    this.own = { schema: own.schema, sense: own.sense ?? null, modeStride: own.schema.strides[at]!, allowed };
    this.seen = new Uint8Array(own.schema.size);
  }

  bindPolicy(lane: "mode", fn: Policy): void;
  bindPolicy(lane: "stance", fn: StancePolicy): void;
  bindPolicy(lane: "mode" | "stance", fn: Policy | StancePolicy): void {
    const own = this as { policy: Policy; stancePolicy: StancePolicy };
    if (lane === "mode") own.policy = fn as Policy;
    else own.stancePolicy = fn as StancePolicy;
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
    this.scentGain[i] = 1;
  }

  /** Whether ant i holds brood in its jaws (a nurse carrying an egg, larva or pupa): what the fungus in it senses as `carrying`. */
  holdsBrood(i: number): boolean {
    return this.broodHeld[i] === 1;
  }

  /** What ant i holds, as a response sees it. */
  item(i: number): Item {
    return this.carrying[i] ? "food" : this.pellet[i] ? (this.corpse[i] ? "corpse" : "soil") : this.broodHeld[i] ? "brood" : "none";
  }

  /**
   * Where ant i is, as it can tell (responses.ts: Where). Underground (side view): in one of its own chambers, in its own
   * tunnels, or "out" in a stranger's; on the ground or a top-down map: at its hole (within the nest's radius) or out.
   * Leaves the shared CELL as it found it.
   */
  place(i: number): Where {
    const l = this.layer[i];
    if (l === this.cur) return placeOn(this, i);
    const was = this.cur;
    this.bind(l);
    try {
      return placeOn(this, i);
    } finally {
      this.bind(was);
    }
  }

  /** Whether ant i is tired: past its patience, or not yet fully rested since it was (ja-q47). */
  isTired(i: number): boolean {
    return this.tired[i] === 1 || this.fatigue[i] > this.patience(i);
  }

  /** The fatigue at which ant i tires: the colony's patience, shortened by planePatience on one world's plane (ja-lp4.15). */
  patience(i: number): number {
    return this.line !== null && this.layer[i] === PLANE ? this.params.patience * this.params.planePatience : this.params.patience;
  }

  /** Whether ant i stands in its own nest (not a stranger's), by its cell. Leaves the shared CELL as it found it. */
  ownNestHere(i: number): boolean {
    const keepX = CELL[0];
    const keepY = CELL[1];
    this.antCell(i);
    const own = this.inOwnNest(CELL[0], CELL[1]);
    CELL[0] = keepX;
    CELL[1] = keepY;
    return own;
  }

  /** Living ants. */
  get population(): number {
    let s = 0;
    for (const v of this.alive) s += v;
    return s;
  }

  /** A new ant at the nest, in the first free slot (at world (x, y) if given: where its pupa lay); false when the colony is at its cap. */
  spawn(x?: number, y?: number, age = 0): boolean {
    if (this.cur === this.home) return spawnHome(this, x, y, age);
    const was = this.cur;
    this.bind(this.home);
    try {
      return spawnHome(this, x, y, age);
    } finally {
      this.bind(was);
    }
  }

  /**
   * Food at home that won't become ants (what the strategist reads as a full larder). On the top-down maps the larder
   * becomes ants at once while there is room, so it is all of it. With a queen (the side view) the larder also holds
   * what her brood will be fed, and fills while the colony grows: only food beyond that, at the cap, is spare.
   */
  spare(): number {
    if (!this.queen) return this.larder;
    if (!this.orphaned && this.population + this.brood.size < this.params.maxAnts) return 0; // orphaned, it will never grow: its food is spare
    return this.larder + this.inJaws - this.brood.owed();
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
    const a = this.age[i] / this.params.lifespan;
    return a < this.params.youngShare ? 0 : a < this.params.middleShare ? 1 : 2;
  }

  /** Whether ant i may go out onto the ground: the young never (they nurse); the rest may. */
  mayGoOut(i: number): boolean {
    // The young never; the rest may (the middle-aged dig and carry inside, the old climb out to forage: outbound). A hard
    // limit on the middle-aged (out only while foragers were short) kept a crowd of them at the hole being put back.
    return this.band(i) !== 0;
  }

  /** The other colonies' holes (or nests, on a top-down map), and the raid target if the game set no others. */
  otherHoles(): { x: number; y: number }[] {
    const out: { x: number; y: number }[] = this.others.map((o) => o.entrance ?? o);
    if (this.raidTarget && !out.some((o) => Math.abs(o.x - this.raidTarget!.x) < 1)) out.push(this.raidTarget);
    return out;
  }

  /** Whether cell (cx, cy) is nearer this colony's hole than any other colony's (raiding: still at home, or already at theirs). */
  inOwnNest(cx: number, cy: number): boolean {
    if (!this.entrance) return true;
    const x = centreX(cx, cy);
    const own = Math.abs(x - this.entrance.x);
    // The same holes as otherHoles, without building its array: this runs for every carrier every step (Touch.place).
    let raidListed = !this.raidTarget;
    for (const n of this.others) {
      const o = n.entrance ?? n;
      if (Math.abs(x - o.x) < own) return false;
      if (!raidListed && Math.abs(o.x - this.raidTarget!.x) < 1) raidListed = true;
    }
    return raidListed || Math.abs(x - this.raidTarget!.x) >= own;
  }

  /** The hole of the nearest other colony (the midden faces it), or null alone. */
  neighbour(): { x: number; y: number } | null {
    if (!this.entrance) return null;
    let best: { x: number; y: number } | null = null;
    for (const o of this.otherHoles()) if (!best || Math.abs(o.x - this.entrance.x) < Math.abs(best.x - this.entrance.x)) best = o;
    return best;
  }

  /** Which side of its hole the colony's midden lies: toward its nearest neighbour (a boundary between them), east if alone. */
  middenSide(): -1 | 1 {
    const t = this.neighbour();
    return t && this.entrance && t.x < this.entrance.x ? -1 : 1;
  }

  /** How far out the midden lies: past the mound's largest reach, fixed, so the mound never grows over it (review of
   *  slice 7: placed past the mound's current edge, it was buried as the mound spread, and moved with it). */
  middenAt(): number {
    // Never past 40 % of the way to the nearest neighbour on that side: each midden on its own colony's ground (nests close together).
    const t = this.neighbour();
    return t && this.entrance ? Math.min(MIDDEN_AT, Math.round(0.4 * Math.abs(t.x - this.entrance.x))) : MIDDEN_AT;
  }

  /** The turn up the food plume (smellsFood's answer, radians), read by the caller at once. */
  plumeTurn = 0;
  /** The food plume on the plane (ja-rf5.4, plume.ts PlumeState): built only for a species with foodPlume. */
  plume: Int16Array | null = null;
  plumeEpoch = -1;
  plumeFood = -1;
  /**
   * Whether ant i, heading h, smells food in the air (ja-rf5.4, plume.ts) on any of its three sensors (h − a, h, h + a); if so, the
   * turn of at most `max` toward the strongest is left in plumeTurn. Leaves the shared CELL as it found it.
   */
  smellsFood(i: number, h: number, a: number, max: number): boolean {
    const keepX = CELL[0];
    const keepY = CELL[1];
    const range = this.params.foodPlume;
    const plume = updatePlume(this, this.map, range, this.time);
    const d = this.params.sensorDistance;
    const read = (b: number) => {
      cellOf(this.x[i] + Math.cos(b) * d, this.y[i] + Math.sin(b) * d);
      return plumeAt(plume, this.map, range, CELL[0], CELL[1]);
    };
    const l = read(h - a);
    const f = read(h);
    const r = read(h + a);
    CELL[0] = keepX;
    CELL[1] = keepY;
    if (Math.max(l, f, r) <= 0) return false;
    this.plumeTurn = climb(l, f, r, max);
    return true;
  }

  /** Whether ant i, exploring, is a forager on its way out: the old (in the side view with a queen). */
  outbound(i: number): boolean {
    return this.queen !== null && this.band(i) === 2;
  }

  /** Whether ant i is an inside worker now: underground, carrying nothing, not allowed out (zoned by age). */
  staysIn(i: number): boolean {
    return this.queen !== null && this.under[i] === 1 && !this.carrying[i] && !this.pellet[i] && !this.mayGoOut(i);
  }

  /** Whether ant i digs: in the side view with a queen, the middle-aged (the young nurse, the old forage); elsewhere, any explorer. */
  digs(i: number): boolean {
    return !this.queen || this.band(i) === 1;
  }

  /** Whether the colony has lost its queen (the side view; the top-down maps have none to lose). */
  get orphaned(): boolean {
    return this.queen !== null && !this.queen.alive;
  }

  /** Ant i dies where it stands; food it carried drops on that cell (a soil pellet is just lost; brood it carried lies there). `lost`: a loss to the strategist (a fight), not old age. */
  kill(i: number, lost = true): void {
    const l = this.layer[i];
    if (l === this.cur) return killOn(this, i, lost);
    const was = this.cur;
    this.bind(l);
    try {
      killOn(this, i, lost);
    } finally {
      this.bind(was);
    }
  }

  /** Pellets in jaws now: dug ones (on their way out, or to fill) and loose ones off the mound (side view). */
  carriedPellets(): { dug: number; loose: number } {
    let dug = 0;
    let loose = 0;
    for (let i = 0; i < this.n; i++)
      if (this.alive[i] && this.pellet[i] && !this.corpse[i]) {
        if (this.soil[i] !== SOIL_DUG) loose++;
        else dug++;
      }
    return { dug, loose };
  }

  /** Food left on the map; in one world, on both its layers: the plane's piles and the curtain's buried pockets (the strip's food is the plane's, counted there). */
  get foodLeft(): number {
    if (this.layers.length === 1) return this.map.foodLeft;
    let s = 0;
    for (const L of this.layers) s += L.map.foodLeft;
    return s;
  }

  /** Every ant asks its policy again on its next tick: a new doctrine, or fresh answers from Jev, take effect at once. */
  reconsider(): void {
    this.asked.fill(-1);
  }

  /** The fungus's brush: lay `amount` of a trail on every open cell within `radius` of (x, y), on layer `layer` (home by default). */
  paint(channel: Channel, x: number, y: number, radius: number, amount: number, layer: number = this.home): void {
    if (layer === this.cur) return this.paintOn(channel, x, y, radius, amount);
    const was = this.cur;
    this.bind(layer);
    try {
      this.paintOn(channel, x, y, radius, amount);
    } finally {
      this.bind(was);
    }
  }

  /** paint, with its layer bound. */
  paintOn(channel: Channel, x: number, y: number, radius: number, amount: number): void {
    const { size, x0 } = this.map;
    for (let cy = Math.max(0, Math.floor((y - radius) / R - 1)); cy <= Math.min(size.h - 1, Math.ceil((y + radius) / R)); cy++)
      for (let cx = Math.max(x0, Math.floor(x - radius - 1)); cx <= Math.min(x0 + size.w - 1, Math.ceil(x + radius)); cx++) {
        const px = centreX(cx, cy);
        const py = centreY(cy);
        if (rockAt(this.map, cx, cy) || Math.hypot(px - x, py - y) > radius) continue;
        this.ph.deposit(channel, px, py, amount);
      }
  }

  /** The situation ant i was in when its policy last chose its mode, or null if it never chose (a carrier going home is not asked). */
  lastQuestion(i: number): Situation | null {
    const q = this.question[i];
    return this.alive[i] && q >= 0 ? decodeSituation(q) : null;
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
    for (let i = 0; i < this.n; i++) if (this.alive[i]) c[MODES[this.mode[i]] as Mode]++;
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
      larder: this.spare() >= 2 * this.params.foodPerAnt ? "full" : "low",
    };
  }

  /**
   * Ant i starts a trip home (it picked up food, or its policy sent it home): a detour or a wall left
   * over from foraging would otherwise switch its home vector off, and bumps would keep renewing it.
   */
  homeAfresh(i: number): void {
    this.chamberCell[i] = NO_KEY; // a chamber face it was walking up to is no longer its business (review of slice 2)
    this.search[i] = 0; // a search left over from the last trip home
    this.searchA[i] = 0;
    this.groundMin[i] = NaN;
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
  onMLine(i: number, x: number, y: number, width = M_LINE_WIDTH): boolean {
    const ax = this.mx[i];
    const ay = this.my[i];
    if (Number.isNaN(ax)) return true;
    const dx = this.goalX - ax;
    const dy = this.goalY - ay;
    const len = Math.hypot(dx, dy);
    if (len < 1e-6) return true;
    return Math.abs((x - ax) * dy - (y - ay) * dx) / len < width;
  }

  /** Whether the straight way from (x, y) to (tx, ty) is open, felt every half cell: the nest in plain view (or smell) down a clear passage. */
  clearTo(x: number, y: number, tx: number, ty: number): boolean {
    const steps = Math.ceil(Math.hypot(tx - x, ty - y) * 2);
    for (let k = 1; k < steps; k++) if (blocked(this.map, x + ((tx - x) * k) / steps, y + ((ty - y) * k) / steps)) return false;
    return true;
  }

  /**
   * One world's plane (ja-lp4.11): whether world (x, y), `d` from this colony's hole, is on its own mound: within the
   * mound's reach as dug (the farthest a pellet is carried out now, carryOut's 2 + reach; at least HOLE_SIGHT) and on
   * spoil underfoot, which an ant feels (as an undertaker does, onMiddenRing). The reach keeps it colony-specific: the
   * rival's mound smells of strangers. With the plane bound; CELL is left as it was.
   */
  onOwnMound(x: number, y: number, d: number): boolean {
    if (d >= Math.max(HOLE_SIGHT, 2 + planeMoundReach(this.heaped))) return false;
    const spoil = this.map.spoil;
    if (!spoil) return false;
    const c0 = CELL[0];
    const c1 = CELL[1];
    cellOf(x, y);
    const on = spoil.get(CELL[0], CELL[1]) > 0;
    CELL[0] = c0;
    CELL[1] = c1;
    return on;
  }

  /**
   * One world's plane (ja-lp4.15): ant i has picked up food where it stands. It keeps where it believes that is, relative to its
   * hole: where it stands less where its vector says the hole is (the hole plus odoSurf × (driftSurf, driftSurfY): its home
   * vector, negated). Only its own odometer and drift; no coordinate of the food or the hole's true place. With the plane bound.
   */
  rememberSite(i: number): void {
    const odo = this.odoSurf[i];
    this.foodX[i] = this.x[i] - (this.nest.x + odo * this.driftSurf[i]);
    this.foodY[i] = this.y[i] - (this.nest.y + odo * this.driftSurfY[i]);
  }

  /**
   * One world's plane (ja-lp4.15): the heading an exploring ant i with a remembered spot (foodX, foodY) steers on. Where it
   * believes the spot is: its vector's own hole (the hole plus odoSurf × drift, as believePlane) plus the remembered offset,
   * walked straight; within LOOP_AT of it, it searches round it, U3b's spiral (a point a quarter turn on and SEARCH_GROW_2D
   * further out each time one is reached; the first heads the way it faces). Its search state is the homing ant's
   * (search, searchA), zeroed when it turns for home (homeAfresh) or finds food. Never past the plane's edges.
   */
  siteAim(i: number): number {
    const odo = this.odoSurf[i];
    const x = this.x[i];
    const y = this.y[i];
    const lx = this.map.x0 + EDGE;
    const hx = this.map.x0 + this.map.size.w - EDGE;
    const hy = this.map.size.h * R - EDGE;
    const tx = Math.max(lx, Math.min(hx, this.nest.x + odo * this.driftSurf[i] + this.foodX[i]));
    const ty = Math.max(EDGE, Math.min(hy, this.nest.y + odo * this.driftSurfY[i] + this.foodY[i]));
    let s = this.search[i];
    if (s === 0) {
      if (Math.hypot(tx - x, ty - y) >= LOOP_AT) return Math.atan2(ty - y, tx - x);
      // There, and nothing in sight: round it, the first point ahead of it.
      this.searchA[i] = this.heading[i];
      s = this.search[i] = SEARCH_START;
    }
    let a = this.searchA[i];
    let px = tx + s * Math.cos(a);
    let py = ty + s * Math.sin(a);
    if (Math.hypot(px - x, py - y) < LOOP_AT) {
      a = this.searchA[i] = a + Math.PI / 2;
      const { w, h } = this.map.size;
      s = this.search[i] = Math.min(Math.max(w, h * R), s * SEARCH_GROW_2D);
      // Widened past what its vector's error covers (a quarter turn each point, so it has been all round at the last): the spot is spent.
      if (this.params.siteGive > 0 && s > this.params.siteGive * PI_DRIFT * Math.hypot(this.foodX[i], this.foodY[i])) {
        this.foodX[i] = this.foodY[i] = NaN;
        this.search[i] = 0;
        this.searchA[i] = 0;
        return this.heading[i];
      }
      px = tx + s * Math.cos(a);
      py = ty + s * Math.sin(a);
    }
    return Math.atan2(py - y, px - x);
  }

  /** The role of this colony's chamber at cell (x, y) (a role-less or another colony's chamber reads as tunnel), or null if in none. */
  placeAt(x: number, y: number): Mark | null {
    const ch = this.map.chambers;
    const id = ch ? ch.at(x, y) : -1;
    if (id < 0) return null;
    const c = ch!.list[id]!;
    return c.colony === this.params.nest && c.role !== "none" ? c.role : null;
  }

  /**
   * The chamber ant i, carrying food, takes it to: a porter's chosen one; a forager's, reception once it is a chamber of
   * RECEPTION_MIN cells or more, else the royal chamber. (A reception one or two cells wide, which may never widen, choked
   * colonies: 800–1,900 food piled up in it while the larvae starved, with no idle ant near it to carry it on: review of
   * slice 5, and the F2 fix-up's runs to 3,600 s.)
   */
  foodTo(i: number): number {
    const to = this.portTo[i];
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
  chamberNest: Nest = { x: 0, y: 0, r: 1.5 };
  goalCells = new Map<number, { cells: number; x: number; y: number }>();
  /** Food wanted per chamber, and food on its way to each (porters carrying it there): for port, worked out once a tick. */
  want = new Map<number, number>();
  enRouteTo = new Map<number, number>();
  portViewAt = -1;
  /** Put `n` food at home: in the royal chamber (with a queen: food lies in chambers), else in the larder. */
  feed(n: number): void {
    if (this.cur === this.home) return feedHome(this, n);
    const was = this.cur;
    this.bind(this.home);
    try {
      feedHome(this, n);
    } finally {
      this.bind(was);
    }
  }

  /** Food into (or, negative, out of) chamber `c`: the larder is the food in the colony's chambers. */
  stock(c: { food: number }, d: number): void {
    c.food += d;
    this.larder += d;
  }

  /**
   * One world's plane (U3c): lay `amount` of midden mark on plane cell (x, y), and tapering over MIDDEN_SPREAD cells round
   * it (the side view's taper along the ground, in 2D), on the plane's scent whichever layer is bound. Rock takes none.
   */
  markMiddenPlane(x: number, y: number, amount: number): void {
    const { map, ph } = this.layers[PLANE] as Layer;
    const offs = discOffsets(MIDDEN_SPREAD)[y & 1] as Int16Array;
    for (let k = 0; k < offs.length; k += 2) {
      const tx = x + offs[k];
      const ty = y + offs[k + 1];
      if (rockAt(map, tx, ty) !== OPEN) continue;
      ph.depositCell("midden", tx, ty, (amount * (MIDDEN_SPREAD + 1 - hexDistance(x, y, tx, ty))) / (MIDDEN_SPREAD + 1));
    }
  }

  /** Lay `amount` of midden mark on the ground at column `col`, and tapering over MIDDEN_SPREAD columns either side. */
  markMidden(col: number, amount: number): void {
    if (this.map.surfaceRows !== undefined) return; // one world's curtain: the midden is the plane's (U3c), never its ground strip
    for (let dx = -MIDDEN_SPREAD; dx <= MIDDEN_SPREAD; dx++) {
      const x = col + dx;
      if (x < this.map.x0 || x >= this.map.x0 + this.map.size.w) continue;
      this.ph.depositCell("midden", x, groundTop(this.map, x) - 1, (amount * (MIDDEN_SPREAD + 1 - Math.abs(dx))) / (MIDDEN_SPREAD + 1));
    }
  }

  /**
   * Whether the nest is crowded (the side view, nest slice 2): fewer floor cells in the colony's chambers than
   * FLOOR_PER_ANT for each ant underground. A crowded nest digs (chambers first); a roomy one barely digs at all
   * (Odontomachus keeps ~2 cm² of floor per worker whatever its size; Rasse & Deneubourg's digging that stops with room).
   * The top-down maps have no chambers: always as before.
   */
  crowded(): boolean {
    const ch = this.map.chambers;
    if (!ch || !this.entrance) return true;
    return this.inNest * FLOOR_PER_ANT > (ch.floorOf[this.params.nest] ?? 0);
  }

  /**
   * Whether cell (x, y) may be part of chamber `c` (null: a new one there): within its rows (CHAMBER_HEIGHT up from its
   * floor), at least CHAMBER_MIN_DEPTH below the ground (as dug, not the mound heaped on it: soilTop), and touching no
   * other chamber. Widening once checked only the rows, from the mound's top: a chamber widened to 4 rows under the ground
   * beside the shaft (review of slice 2), where one started 5 rows down had trapped the pellet carriers.
   */
  chamberSpot(c: Chamber | null, x: number, y: number): boolean {
    if (c && (y > c.floorRow || y <= c.floorRow - CHAMBER_HEIGHT)) return false;
    if (y - this.soilTop(x) < CHAMBER_MIN_DEPTH) return false;
    return !this.joinsChamber(x, y, c ? c.id : -1);
  }

  /** The side view: the ground's top in column x as dug, under any mound heaped on it (the first row that is neither sky nor loose soil). */
  soilTop(x: number): number {
    let y = groundTop(this.map, x);
    const loose = this.map.loose;
    if (loose) while (y < this.map.size.h && loose.get(x, y) === 1) y++;
    return y;
  }

  /**
   * Whether digging soil cell (x, y) open for chamber `own` (−1: a new one) would join it to another chamber, this
   * colony's or another's. The tunnel rules' spacing check (startable) is bypassed for chamber faces; opening onto a
   * tunnel is fine (a junction), but two chambers dug into one another lose their roles and their floors run together.
   */
  joinsChamber(x: number, y: number, own: number): boolean {
    const ch = this.map.chambers!;
    for (let d = 0; d < 6; d++) {
      const id = ch.at(stepX(x, y, d), stepY(y, d));
      if (id >= 0 && id !== own) return true;
    }
    return false;
  }

  /** Whether a new chamber may start at row cy near column cx: no chamber (of any colony) within the gap for that depth. */
  chamberRoom(cx: number, cy: number, depth: number): boolean {
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
   * hole is the way in (and every face there is crust: see crust), or explorers would pock the ground with holes.
   */
  mayDig(cx: number, cy: number): boolean {
    return !this.entrance || !isSky(this.map, cx, cy);
  }

  /** Whether ant i is in a cell it hasn't looked round yet this trip (leaves its cell in CELL; the cell it looked from before goes in cameFrom). */
  enteredCell(i: number): boolean {
    this.antCell(i);
    const packed = cellKey(CELL[0], CELL[1]);
    if (this.looked[i] === packed) return false;
    this.cameFrom[i] = this.looked[i];
    this.looked[i] = packed;
    return true;
  }

  /** Ant i carries no pellet (or corpse) any more: the pellet, what it was, and where it was taking it, all at once. A newborn gets the same through the table (ants.ts `reset`): a field added here is marked there too. */
  clearPellet(i: number): void {
    this.pellet[i] = 0;
    this.soil[i] = SOIL_DUG;
    this.corpse[i] = 0;
    this.spoilTo[i] = NaN;
    this.staleWalk[i] = 0;
  }

  /**
   * The side view: an explorer on the ground beside loose soil now and then picks up a pellet of it (it comes up
   * easily). From a steep flank (LOOSE_SPREAD_PICK a cell) it carries it a little farther out and drops it again, so
   * the mound spreads and smooths itself as ants rework their spoil; from anywhere on it (LOOSE_FILL_PICK) it takes
   * it down into the nest to refill unused space, as leaf-cutting ants refill excess space (Pielström & Roces).
   * True if it picked one up.
   */
  pickLoose(i: number, cx: number, cy: number, enemy: boolean): boolean {
    const { map } = this;
    if (!map.loose) return false;
    const u = this.rng();
    if (u >= LOOSE_SPREAD_PICK + LOOSE_FILL_PICK) return false;
    for (let d = 0; d < 6; d++) {
      const tx = stepX(cx, cy, d);
      const ty = stepY(cy, d);
      if (map.loose.get(tx, ty) !== 1 || groundTop(map, tx) !== ty) continue; // only off the top: the mound's surface
      if (this.byAnEntrance(tx, ty)) continue;
      // Spread from a slope standing at its angle of repose (the next column out a row lower): the steep flanks.
      const out = tx >= this.entranceCol ? 1 : -1;
      const steep = groundTop(map, tx + out) - ty >= 1;
      const fill = u < LOOSE_FILL_PICK;
      if (!fill && !steep) continue;
      if (!this.responses.get(touch(this, i, enemy, this.mode[i], "none", "soil"))) return false;
      if (!takeLoose(map, tx, ty)) continue;
      this.takeUpLoose(i, tx, fill);
      return true;
    }
    return false;
  }

  /** Ant i takes up a loose pellet from column `col` (off the mound's top): down to fill, or spreading it farther out. */
  takeUpLoose(i: number, col: number, fill: boolean): void {
    this.pellet[i] = 1;
    this.soil[i] = fill ? SOIL_FILL : SOIL_LOOSE;
    this.loosePicked++;
    this.since[i] = 0;
    this.wall[i] = 0;
    this.mx[i] = NaN;
    this.gx[i] = NO_CELL;
    const out = col >= this.entranceCol ? 1 : -1;
    if (fill) this.looseDown++;
    else {
      this.spoilSide[i] = out;
      this.spoilTo[i] = Math.abs(col - this.entranceCol) + LOOSE_SPREAD * (0.5 + this.rng());
      this.spoilT[i] = 0;
    }
  }

  /** The side view: whether cell (x, y) is within ENTRANCE_ZONE of any nest's entrance (a rival's hole is no space to fill either). */
  byAnEntrance(x: number, y: number): boolean {
    for (const n of this.map.nests ?? [this.nest])
      if (n.entrance && Math.hypot(centreX(x, y) - n.entrance.x, centreY(y) - n.entrance.y) < ENTRANCE_ZONE) return true;
    return false;
  }

  /** A wall-follower not round after FOLLOW_GIVE_UP: wander a good while, then try afresh. */
  giveUp(i: number): void {
    this.wall[i] = 0;
    this.gx[i] = NO_CELL;
    this.mx[i] = NaN;
    this.bumps[i] = 5;
    this.detour[i] = 8 + 16 * this.rng();
  }

  /** The heading from ant i to the centre of its target cell. */
  towardTarget(i: number): number {
    return Math.atan2(centreY(this.gy[i]) - this.y[i], centreX(this.gx[i], this.gy[i]) - this.x[i]);
  }

  /**
   * A rested forager waiting at home with empty jaws: does it go out this step (behaviour MR 5, docs/activation.md)? Its
   * `leave` response says how soon, from the returns it has felt; "wait" still lets a scout go at `scoutRate`.
   */
  leaves(i: number, dt: number, enemy: boolean): boolean {
    const scout = this.params.scoutRate;
    const mode = RETURN;
    // On a raid stance, where the colony recruits by trail, every ant at home is a raider to be: asked in mode fight, so its
    // answer rests on the raid trail and not on food returns (review of #41).
    // (One world, ja-web: at the gate at the top of its shaft too, where the stance is the ant's own.)
    const own = this.entrance === null || this.line !== null;
    const asked = this.params.raidGate > 0 && own && this.stanceOf(i) === "raid" ? FIGHT : mode;
    const answer = this.responses.leave(touch(this, i, enemy, asked, "none"));
    // "raid" goes at raidScout: scouts are few (behaviour MR 5.2), and their trail brings the rest.
    const rate = answer === "now" ? LEAVE_NOW : answer === "soon" ? LEAVE_SOON : answer === "raid" ? this.params.raidScout : scout;
    if (!(this.rng() < 1 - Math.exp(-rate * dt))) return false;
    // "raid" (docs/stance.md): it goes out as a raid scout. Recruited, its stance is raid, and its mode policy is asked afresh as one (it
    // starts exploring: see the callers). Where it can't be recruited (the side view, raidGate
    // 0, or no living rival: N3, S1) "raid" is a wait: it goes at raidScout, a scout like any other.
    if (answer === "raid" && this.params.stanceGate > 0 && this.params.raidGate > 0 && own && this.raidable) {
      this.recruited[i] = 1;
      this.gone[i] = 0;
      this.raidScouts++;
    }
    return true;
  }

  /** Whether each ant's stance is its own, from what it senses (docs/stance.md: open ground, stanceGate on), not the colony's. */
  get ownStances(): boolean {
    return this.params.stanceGate > 0 && this.layers.some((L) => L.entrance === null);
  }

  /** How many living ants act on each stance now (the HUD, where each ant's stance is its own). */
  stanceCounts(): Record<Stance, number> {
    const n: Record<Stance, number> = { forage: 0, defend: 0, raid: 0 };
    for (let i = 0; i < this.n; i++) if (this.alive[i]) n[this.stanceOf(i)]++;
    return n;
  }

  /**
   * The stance ant i acts on (behaviour MR 5.2): the colony's, except that a raid stance is a bias and not an order. An ant that has
   * smelt no raid trail and has not gone out as a scout carries on as a forager, so a raid stance never idles the colony.
   */
  stanceOf(i: number): Stance {
    // Top-down, each ant's own (docs/stance.md): defend while it senses a threat on home ground, raid once recruited, else
    // forage. In one world on both layers (the owner's choice, ja-lp4.3): a raider keeps its stance down a rival's shaft.
    if (this.params.stanceGate > 0 && (this.entrance === null || this.line !== null))
      return this.defending[i] ? "defend" : this.recruited[i] ? "raid" : "forage";
    return this.stance === "raid" && this.recruited[i] === 0 && this.params.raidGate > 0 && this.entrance === null ? "forage" : this.stance;
  }

  /** Whether ant i is within its nest's radius on a top-down map. */
  atNestTop(i: number): boolean {
    const dx = this.x[i] - this.nest.x;
    const dy = this.y[i] - this.nest.y;
    return dx * dx + dy * dy < this.nest.r * this.nest.r;
  }

  /**
   * Ant i, held at the gate, mills among the top cells of its shaft: cell by cell, to an open neighbour at the gate (within
   * WAIT_STEPS of the hole) at random. Sets its target cell (as walkTunnel does); false if no cell there is open.
   */
  mill(i: number, step: number): boolean {
    const map = this.map;
    this.antCell(i);
    const hx = CELL[0];
    const hy = CELL[1];
    const gx = this.gx[i];
    const gy = this.gy[i];
    const fresh = gx === NO_CELL || hexDistance(gx, gy, hx, hy) > 1 || outDistAt(this, gx, gy) < 0 || outDistAt(this, gx, gy) > WAIT_STEPS;
    if (!fresh && Math.hypot(centreX(gx, gy) - this.x[i], centreY(gy) - this.y[i]) > step) return true;
    const cx = fresh ? hx : gx;
    const cy = fresh ? hy : gy;
    const ways = MILL_WAYS;
    let n = 0;
    for (let d = 0; d < 6; d++) {
      const tx = stepX(cx, cy, d);
      const ty = stepY(cy, d);
      const k = outDistAt(this, tx, ty);
      if (k >= 0 && k <= WAIT_STEPS && rockAt(map, tx, ty) === OPEN && !isSky(map, tx, ty)) ways[n++] = d;
    }
    if (n === 0) {
      this.gx[i] = NO_CELL;
      return false;
    }
    const d = ways[Math.floor(this.rng() * n)];
    this.gdir[i] = d;
    this.gx[i] = stepX(cx, cy, d);
    this.gy[i] = stepY(cy, d);
    return true;
  }

  /**
   * Ant i, not to go out, has stepped from (x0, y0) up out of the hole onto the ground: back, and pointed down the shaft
   * (its deepest open neighbour underground), the walker aimed at that cell. Only turning it round left it in the hole,
   * which is no tunnel, steering at random into the sky again and again (review of slice 6: ants pinned there up to
   * 45 s, a tenth to a fifth of their time). Returns its heading, h as it was if there is no way down but back.
   */
  pointDown(i: number, x0: number, y0: number, h: number): number {
    const map = this.map;
    this.x[i] = x0;
    this.y[i] = y0;
    cellOf(x0, y0);
    const bx = CELL[0];
    const by = CELL[1];
    let down = -1;
    let deepest = -Infinity;
    for (let d = 0; d < 6; d++) {
      const tx = stepX(bx, by, d);
      const ty = stepY(by, d);
      if (rockAt(map, tx, ty) === OPEN && !isSky(map, tx, ty) && centreY(ty) > deepest) ((deepest = centreY(ty)), (down = d));
    }
    if (down >= 0) {
      h = DIR_ANGLE[down];
      this.gdir[i] = down;
      this.gx[i] = stepX(bx, by, down);
      this.gy[i] = stepY(by, down);
    } else {
      h += Math.PI;
      this.gx[i] = NO_CELL;
    }
    this.cellAtX[i] = NaN; // its cell is worked out afresh
    return h;
  }

  // ——— one world: crossing at the holes (docs/one-world.md §2, ja-lp4.3) ———

  /**
   * Whether ant i, in `mode`, is going in: carrying food, or homing (the owner's choice: every returner goes down its own
   * hole, as harvester ants do; docs/activation.md). Its own load and mode only. Not one carrying spoil or a corpse out
   * (U3c: on the plane every carrier is returning, and they went straight back down at the hole they came up): only a
   * loose pellet taken home to backfill goes in.
   */
  wantsIn(i: number, mode: number): boolean {
    return this.carrying[i] === 1 || (mode === RETURN && (this.pellet[i] === 0 || this.soil[i] === SOIL_FILL));
  }

  /** Whether ant i is one world's, on the plane, and going in (wantsIn): false at once on any other game. */
  inbound(i: number, mode: number): boolean {
    return this.line !== null && this.cur === PLANE && this.wantsIn(i, mode);
  }

  /** The colony (an index into holeCells) whose hole is plane cell (px, py), or −1. */
  holeAt(px: number, py: number): number {
    const hs = this.holeCells;
    for (let k = 0; k < hs.length; k++) if ((hs[k] as HoleCell).px === px && (hs[k] as HoleCell).py === py) return k;
    return -1;
  }

  /**
   * Put living ant i on layer `layer` at world (x, y), as if it had crossed there (tests: one world's crossings). Out of
   * the nest's layer it is on the surface (`under` 0), on it underground.
   */
  /** crossing.ts atGate, for sense.ts (importing crossing.ts there would close a cycle through homing.ts). */
  atGate(i: number): boolean {
    return atGate(this, i);
  }

  putAnt(i: number, layer: number, x: number, y: number): void {
    this.layer[i] = layer;
    this.x[i] = x;
    this.y[i] = y;
    this.under[i] = layer === this.home && this.entranceOf(layer) ? 1 : 0;
    this.goalKind[i] = 1;
    crossed(this, i);
  }

  /** Whether layer l has a hole into it (the side view's map, one world's curtain). */
  entranceOf(l: number): boolean {
    return (this.layers[l] as Layer).entrance !== null;
  }

  /** Advance by dt seconds: ants decide (when their situation changed), steer, lay trail, move; then the fields evaporate and spread, and stored food becomes ants. */
  tick(dt: number): void {
    const p = this.params;
    const rng = this.rng;
    // The layer being stepped (between ticks, and here, home): rebound below for each ant on another layer.
    let { map, ph } = this;
    let home = this.nest;
    const multi = this.layers.length > 1;
    const a = p.sensorAngle;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    this.time += dt;
    this.recentLosses *= Math.exp(-dt / 30);
    // Intake (behaviour MR 5): food stored per second, averaged over INTAKE_WINDOW.
    const got = this.stored - this.storedSeen;
    this.storedSeen = this.stored;
    this.intakeRate += (got / dt - this.intakeRate) * (1 - Math.exp(-dt / INTAKE_WINDOW));
    // The gates (activation, raids by trail, each ant's own stance) are open ground's, where there is no hole into the
    // layer (gatesFor). A colony on two layers works them out for each layer once a tick, and each ant takes its own's.
    const one = this.line !== null;
    const layerGates = multi ? this.layers.map((L) => gatesFor(p, L.entrance === null, one, dt)) : null;
    let { gate, hold, leak, metLeak, rgate, foeLeak, sgate, threatLeak, crowdKeep } =
      layerGates?.[this.cur] ?? gatesFor(p, this.entrance === null, one, dt);
    // Activation (behaviour MR 5): last tick's returns with food are what the waiting foragers round them meet this tick.
    if (gate || layerGates?.some((g) => g.gate)) {
      const seen = this.returned;
      this.returned = this.returning;
      this.returning = seen;
      seen.clear();
    }
    // One world (ja-web): last tick's carriers down the hole are what the ants held at its top meet this tick.
    if (layerGates?.some((g) => g.hold)) {
      this.holeSeen = this.holeIn;
      this.holeIn = 0;
    }
    let heldNow = 0;
    // Energy and felt hunger (ja-xu6.1): the side view, where there is a queen and brood.
    if (this.queen) body(this, dt);
    const s = new AntStep();
    // What every stage reads and no stage writes: the tick's own values once, and the bound layer's (again at each layer switch).
    s.p = p;
    s.rng = rng;
    s.dt = dt;
    s.a = a;
    s.ca = ca;
    s.sa = sa;
    s.map = map;
    s.ph = ph;
    s.home = home;
    s.gate = gate;
    s.hold = hold;
    s.leak = leak;
    s.metLeak = metLeak;
    s.rgate = rgate;
    s.foeLeak = foeLeak;
    s.sgate = sgate;
    s.threatLeak = threatLeak;
    s.crowdKeep = crowdKeep;
    for (let i = 0; i < this.n; i++) {
      if (!this.alive[i]) continue;
      // An ant on another layer than the one bound: bind its own (a colony on one layer never does).
      if (multi && this.layer[i] !== this.cur) {
        this.bind(this.layer[i]);
        ({ map, ph } = this);
        home = this.nest;
        ({ gate, hold, leak, metLeak, rgate, foeLeak, sgate, threatLeak, crowdKeep } = layerGates![this.cur]!);
        s.map = map;
        s.ph = ph;
        s.home = home;
        s.gate = gate;
        s.hold = hold;
        s.leak = leak;
        s.metLeak = metLeak;
        s.rgate = rgate;
        s.foeLeak = foeLeak;
        s.sgate = sgate;
        s.threatLeak = threatLeak;
        s.crowdKeep = crowdKeep;
      }
      if (map.sky) unbury(this, i);
      perceive(this, i, s);
      let h = s.h;
      const fl = s.fl;
      const ff = s.ff;
      const fr = s.fr;
      const hl = s.hl;
      const hf = s.hf;
      const hr = s.hr;
      const al = s.al;
      const af = s.af;
      const ar = s.ar;
      const toEnemy = s.toEnemy;
      s.heldNow = heldNow;
      s.toEnemy = toEnemy;
      stanceStep(this, i, s);
      heldNow = s.heldNow;
      const held = s.held;
      const carrying = s.carrying;
      const pellet = s.pellet;
      const nursing = s.nursing;
      const outward = s.outward;
      const reporting = s.reporting;
      s.fl = fl;
      s.ff = ff;
      s.fr = fr;
      s.hl = hl;
      s.hf = hf;
      s.hr = hr;
      s.al = al;
      s.af = af;
      s.ar = ar;
      s.toEnemy = toEnemy;
      s.held = held;
      s.carrying = carrying;
      s.pellet = pellet;
      s.nursing = nursing;
      s.reporting = reporting;
      decide(this, i, s);
      const goal = s.goal;
      let nest = s.nest;
      const x0 = s.x0;
      const y0 = s.y0;
      const mode = s.mode;
      const prevMode = s.prevMode;
      const item = s.item;
      const resp = s.resp;
      const waiting = s.waiting;
      let rolled = s.rolled;
      const fleeFrom = s.fleeFrom;
      s.h = h;
      s.fl = fl;
      s.ff = ff;
      s.fr = fr;
      s.hl = hl;
      s.hf = hf;
      s.hr = hr;
      s.al = al;
      s.af = af;
      s.ar = ar;
      s.toEnemy = toEnemy;
      s.held = held;
      s.carrying = carrying;
      s.pellet = pellet;
      s.outward = outward;
      s.reporting = reporting;
      s.goal = goal;
      s.nest = nest;
      s.mode = mode;
      s.prevMode = prevMode;
      s.item = item;
      s.resp = resp;
      s.waiting = waiting;
      s.fleeFrom = fleeFrom;
      steer(this, i, s);
      h = s.h;
      nest = s.nest;
      const digging = s.digging;
      s.h = h;
      s.carrying = carrying;
      s.pellet = pellet;
      s.outward = outward;
      s.nest = nest;
      s.x0 = x0;
      s.y0 = y0;
      s.mode = mode;
      s.digging = digging;
      const moveDigDone = moveDig(this, i, s);
      h = s.h;
      if (moveDigDone) continue;

      s.h = h;
      s.toEnemy = toEnemy;
      s.held = held;
      s.carrying = carrying;
      s.pellet = pellet;
      s.nursing = nursing;
      s.outward = outward;
      s.x0 = x0;
      s.y0 = y0;
      s.mode = mode;
      s.item = item;
      s.resp = resp;
      s.rolled = rolled;
      const arriveDone = arrive(this, i, s);
      h = s.h;
      rolled = s.rolled;
      if (arriveDone) continue;
      this.heading[i] = h;
    }
    this.gateHeld = heldNow;
    // Colony-wide work from here on is the home layer's (the nest, its count of ants in and out, its brood).
    if (multi) this.bind(this.home);
    if (this.entrance) {
      let under = 0;
      let out = 0;
      for (let k = 0; k < this.n; k++) if (this.alive[k]) this.under[k] ? under++ : out++;
      this.inNest = under;
      this.outside = out;
    }
    // Every layer's fields evaporate and spread (on one layer, `ph`'s).
    for (const L of this.layers) L.ph.advance(dt);
    // Growth: in the side view, the queen and brood (nestLife); elsewhere the larder turns into ants while there is room.
    if (this.queen) {
      nestLife(this, dt);
      middenSmell(this, dt);
    } else {
      if (p.mortalWithoutQueen) ageWorkers(this, dt);
      while (this.larder >= p.foodPerAnt && this.spawn()) this.larder -= p.foodPerAnt;
    }
  }

  // ——— saving (save.ts, ja-lo8.6) ———

  /**
   * This colony's state for a save: its public data (not the references the game wires: the map, other colonies'
   * scent, the grids, its policies; its own scent saves itself), and the state COLONY_STATE lists, by name in `private` (not its random stream: the game saves that,
   * shared by every colony). tests/soak/save.test.ts holds the lists to the colony's own properties.
   */
  saveState(): Record<string, unknown> {
    return {
      fields: saveFields(this, COLONY_SKIP),
      // One world (U4b): each layer's own state but the bound one's (null: in `fields` and `private`), by LAYER_STATE.
      ...(this.layers.length > 1
        ? {
            layers: this.layers.map((L, l) => (l === this.cur ? null : Object.fromEntries(LAYER_STATE.map((k) => [k, encodeSave(L[k])])))),
          }
        : {}),
      private: encodeSave(Object.fromEntries(COLONY_STATE.map((k) => [k, (this as unknown as Record<string, unknown>)[k]]))),
    };
  }

  /** A saved state back into this colony (saveState), in place where it can be: a fresh colony of the same world and params. */
  loadState(saved: Record<string, unknown>): void {
    const r = saved.private as Record<string, unknown>;
    // `fields` and the private fields hold the bound layer's scent, map state and way out: the same layer must be bound
    // here (between ticks it is home, so this only fails for another game's colony).
    if ("cur" in r && r.cur !== this.cur) throw new Error(`save: a colony saved with layer ${String(r.cur)} bound, here ${this.cur}`);
    loadFields(this, saved.fields as Record<string, unknown>);
    for (const k of COLONY_STATE) {
      if (k === "cur" || !(k in r)) continue;
      const own = this as unknown as Record<string, unknown>;
      own[k] = fillLike(own[k], r[k]);
    }
    // Every other layer's own state (one world), in place through its view: its slots, since it is not bound.
    const layers = saved.layers as (Record<string, unknown> | null)[] | undefined;
    if (layers) {
      if (layers.length !== this.layers.length)
        throw new Error(`save: a colony saved on ${layers.length} layers, here ${this.layers.length}`);
      layers.forEach((x, l) => {
        if (!x) return;
        const L = this.layers[l] as unknown as Record<string, unknown>;
        // In place where it can be (the scent loads itself; its view has no setter for it), else through the view's setter.
        for (const k of LAYER_STATE)
          if (k in x) {
            const v = fillLike(L[k], x[k]);
            if (v !== L[k]) L[k] = v;
          }
      });
    }
  }
}
