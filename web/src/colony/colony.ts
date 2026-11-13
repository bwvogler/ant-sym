import { encode as encodeSave, fillLike, loadFields, saveFields } from "./save.ts";
import { type AntArrays, antResets, makeAntArrays, NO_KEY } from "./ants.ts";
import { type Channel, type Mark, MARKS, Pheromones, swapBroodStore } from "./pheromone.ts";
import { Brood, LARVA } from "./brood.ts";
export { isFed, LARVA_FOOD } from "./brood.ts";
import { type Chamber, CHAMBER_HEIGHT, type Chambers } from "./chambers.ts";
import { CELL, cellOf, centreX, centreY, DIR_ANGLE, discOffsets, hexDistance, nx as stepX, ny as stepY, R, SIDE } from "./hex.ts";
import {
  type CellCounts,
  ENEMY,
  FAINT,
  MODES,
  type Mode,
  type Policy,
  type Situation,
  type SpeciesSituation,
  type Stance,
  STANCES,
  type StancePolicy,
  type StanceSituation,
  STRONG,
  type Trail,
  trailLevel,
  EXPLORE,
  FIGHT,
  FOLLOW,
  RETURN,
  PLANE,
  CURTAIN,
} from "./vocab.ts";
import type { Schema } from "./schema.ts";
import {
  ADULT_DRAIN,
  ADULT_DRAIN_OUT,
  adultBegOf,
  begOf,
  DonorGrid,
  EAT_BELOW,
  ENERGY_PER_FOOD,
  feel,
  FeltGrid,
  PASS,
  QUEEN_BEG,
  QUEEN_WAIT,
  SHARE_ABOVE,
} from "./hunger.ts";
import { type Alate, SCENT_FADE, SCENT_HELD, SCENT_SHARE, SCENT_SUPPLY, scentShare, MeanGrid } from "./royal.ts";
import { type Item, localResponses, type Odds, qualityOf, type Responses, type Where, type Touch } from "./responses.ts";
import {
  blocked,
  digCell,
  dropFood,
  groundTop,
  inBounds,
  isSky,
  OPEN,
  takeLoose,
  rockAt,
  setTunnelHeading,
  SOIL,
  takeFoodCell,
  qualityAt,
  type Nest,
  type WorldMap,
} from "./world.ts";
import { cellAt, type Transect } from "./transect.ts";
import { MODE_STRIDE, SITUATIONS, decodeSituation, packSituation } from "./situation.ts";
import {
  BY_VECTOR,
  CHAMBER_GAP,
  CHAMBER_GAP_GROWTH,
  CHAMBER_MIN_DEPTH,
  CHAMBER_SPREAD,
  CORPSE_GIVE_UP,
  CROWD_HALF,
  DIG_FACE,
  DIG_TIME,
  EDGE,
  EGG_FOOD,
  ENTRANCE_R,
  ENTRANCE_ZONE,
  FLOOR_PER_ANT,
  FOES_HALF,
  FOLLOW_FLIP,
  FOLLOW_GIVE_UP,
  GAIN,
  GLANCE,
  HOLE_SIGHT,
  HUG_TIME,
  INTAKE_NONE,
  INTAKE_PLENTY,
  INTAKE_WINDOW,
  LEAVE_NOW,
  LEAVE_SOON,
  LOOSE_FILL_PICK,
  LOOSE_SPREAD,
  LOOSE_SPREAD_PICK,
  MARK_DECAY,
  MET_HALF,
  MIDDEN_AT,
  MIDDEN_AVOID,
  MIDDEN_MIN,
  MIDDEN_SPREAD,
  MILL_WAYS,
  MOUND_HEIGHT,
  MOUND_REACH,
  M_LINE_WIDTH,
  NEST_SIGHT,
  NO_FACE,
  NO_GAIN,
  PI_DRIFT,
  PI_DRIFT_2D,
  QUEEN_STOCK,
  RECEPTION_MIN,
  REST,
  RETURNS_MANY,
  ROAD_SIGN,
  ROOMY_DIG,
  SEARCH_GROW_2D,
  SEARCH_STALL,
  SEARCH_START,
  SPOIL_GIVE_UP,
  START,
  START_FACE,
  THREAT_HALF,
  TUNNEL_STALL,
  WAIT_RIM,
  WAIT_STEPS,
  WALL_LOST,
  WALL_PROBE,
} from "./tuning.ts";
import {
  NO_CELL,
  SOIL_DUG,
  SOIL_FILL,
  SOIL_LOOSE,
  avoid,
  cellKey,
  choose,
  climb,
  crossedDir,
  gauss,
  handOnWall,
  inReach,
  planeMoundReach,
  refilled,
  soilFace,
  tunnel,
  turnToward,
  wallSide,
} from "./grid.ts";
import { DEFAULT_COLONY, LOOP_AT, NO_ENTRY_DROP, NO_ENTRY_RATE, NO_ENTRY_TRAIL, SEEN, channelParams, type ColonyParams } from "./params.ts";
import { walkTunnel } from "./tunnel.ts";
import { middenSmell, nestLife, nurse, port, undertake } from "./nestWork.ts";
import { backfill, chamberDug, chamberGoal, crust, dropOut, dropPlane, enterStale, pickPlane, putDown, staleStep, unbury } from "./dig.ts";
import {
  atHome,
  believe,
  homeGoal,
  destMark,
  fromHomePlane,
  homeField,
  homeScentNear,
  integrate,
  outDistAt,
  routeClear,
  routeFail,
  routeRecord,
  searchOn,
} from "./homing.ts";
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

/** The newborn's resets for one colony's parameters (ants.ts antResets), worked out once: a parameter a reset reads (tolerance, routeStep) is read at the first birth, so a colony does not change it afterwards (asIs reads tolerance live). */
const SPAWN_RESETS = new WeakMap<object, [string, number][]>();
const spawnResets = (params: ColonyParams): [string, number][] => {
  let r = SPAWN_RESETS.get(params);
  if (!r) SPAWN_RESETS.set(params, (r = antResets(params)));
  return r;
};

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
    for (let k = 0; k < this.params.antCount; k++) this.placeNewborn(k);
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

  placeNewborn(i: number): void {
    const a = this.rng() * Math.PI * 2;
    const r = this.rng() * this.nest.r * 0.8;
    this.x[i] = this.nest.x + Math.cos(a) * r;
    this.y[i] = this.nest.y + Math.sin(a) * r;
    this.heading[i] = a;
    // Every field the table marks for a newborn goes back to its start (ants.ts `reset`): a newborn is clean, unprimed, nothing walked, nothing carried
    // and born underground, in the nest's own layer.
    const arrays = this as unknown as Record<string, { [i: number]: number }>;
    for (const [name, value] of spawnResets(this.params)) arrays[name]![i] = value;
    this.hand[i] = this.rng() < 0.5 ? -1 : 1;
    // A newborn smells of its colony as the colony smells now.
    this.odour[i] = this.nestOdour;
    this.layer[i] = this.home; // born in the nest, on its layer
    this.lifespan[i] = this.queen || this.params.mortalWithoutQueen ? this.params.lifespan * (0.7 + 0.6 * this.rng()) : Infinity;
    this.gen[i] = (this.gen[i] + 1) >>> 0;
    this.alive[i] = 1;
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
   * Ant i's situation for a response, in the shared Touch object (read it, don't keep it): its mode, load and where it
   * is now. `enemy` comes from the caller (the tick's enemy look, or the fights).
   */
  touch(i: number, enemy: boolean, mode: number = this.mode[i], item: Item = this.item(i), offered: Item = "none"): Touch {
    const l = this.layer[i];
    if (l === this.cur) return this.touchOn(i, enemy, mode, item, offered);
    const was = this.cur;
    this.bind(l);
    try {
      return this.touchOn(i, enemy, mode, item, offered);
    } finally {
      this.bind(was);
    }
  }

  /** touch, with ant i's layer bound. */
  touchOn(i: number, enemy: boolean, mode: number, item: Item, offered: Item): Touch {
    const t = this.t;
    t.mode = MODES[mode] as Mode;
    t.carrying = item;
    t.porter = this.porter[i] === 1;
    t.digging = this.digT[i] > 0;
    this.ti = i; // t.place reads ant i's place when asked
    t.offered = offered;
    t.enemy = enemy;
    t.stance = this.stanceOf(i);
    // Taste (docs/trails.md): the food offered, under the ant; else the food in its jaws.
    if (offered === "food") {
      this.antCell(i);
      t.quality = qualityOf(qualityAt(this.map, CELL[0], CELL[1]));
    } else t.quality = item === "food" ? qualityOf(this.quality[i]) : "fair";
    t.alarm = i === this.alarmAnt ? this.alarmSmelt : "none";
    t.odds = i === this.alarmAnt ? this.oddsNow : "none";
    const few = this.params.leaveGate;
    const met = this.met[i];
    t.returns = few <= 0 || met < few ? "none" : met < RETURNS_MANY * few ? "few" : "many";
    t.raid = this.raidSmelt(i);
    t.crowd = this.crowd[i] >= this.params.crowdAt ? "many" : "few";
    return t;
  }

  /**
   * Where ant i is, as it can tell (responses.ts: Where). Underground (side view): in one of its own chambers, in its own
   * tunnels, or "out" in a stranger's; on the ground or a top-down map: at its hole (within the nest's radius) or out.
   * Leaves the shared CELL as it found it.
   */
  place(i: number): Where {
    const l = this.layer[i];
    if (l === this.cur) return this.placeOn(i);
    const was = this.cur;
    this.bind(l);
    try {
      return this.placeOn(i);
    } finally {
      this.bind(was);
    }
  }

  /** place, with ant i's layer bound. */
  placeOn(i: number): Where {
    const keepX = CELL[0];
    const keepY = CELL[1];
    let p: Where;
    if (this.entrance && this.under[i]) {
      this.antCell(i);
      const cx = CELL[0];
      const cy = CELL[1];
      // (One world, ja-web: at the gate at the top of its shaft it is at its nest's mouth, as on open ground.)
      p = !this.inOwnNest(cx, cy) ? "out" : this.atGate(i) ? "hole" : this.perceivedPlace(i, this.placeAt(cx, cy)) ? "chamber" : "tunnel";
    } else {
      const dx = this.x[i] - this.nest.x;
      const dy = this.y[i] - this.nest.y;
      p = dx * dx + dy * dy < this.nest.r * this.nest.r ? "hole" : "out";
    }
    CELL[0] = keepX;
    CELL[1] = keepY;
    return p;
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
    if (this.cur === this.home) return this.spawnHome(x, y, age);
    const was = this.cur;
    this.bind(this.home);
    try {
      return this.spawnHome(x, y, age);
    } finally {
      this.bind(was);
    }
  }

  /** spawn, with the home layer bound. */
  spawnHome(x: number | undefined, y: number | undefined, age: number): boolean {
    const i = this.alive.indexOf(0);
    if (i < 0) return false;
    this.placeNewborn(i);
    if (x !== undefined && y !== undefined) {
      this.x[i] = x;
      this.y[i] = y;
    }
    if (age > 0) this.age[i] = age;
    this.births++;
    return true;
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
    if (l === this.cur) return this.killOn(i, lost);
    const was = this.cur;
    this.bind(l);
    try {
      this.killOn(i, lost);
    } finally {
      this.bind(was);
    }
  }

  /** kill, with ant i's layer bound. */
  killOn(i: number, lost: boolean): void {
    if (!this.alive[i]) return;
    if (this.broodHeld[i]) this.dropBrood(i);
    if (this.carrying[i] && this.porter[i]) {
      // A porter's food is already home: it stays the colony's, in the chamber it was taking it to (on the floor, a
      // forager would bring it "home" a second time).
      const t = this.map.chambers?.list[this.portTo[i]];
      if (t) this.stock(t, 1);
      else this.feed(1);
      this.inJaws -= 1;
      this.carrying[i] = 0;
      this.porter[i] = 0;
      this.portTo[i] = -1;
    }
    if (this.carrying[i]) dropFood(this.map, this.x[i], this.y[i], 1, this.quality[i]);
    this.antCell(i);
    if (this.onDie) {
      const x = CELL[0];
      const y = CELL[1];
      this.onDie(i, this.layer[i] as number, x, y);
      CELL[0] = x;
      CELL[1] = y;
    }
    if (this.corpse[i]) {
      // The corpse it carried falls where it falls, with it (one world: on the layer it was on; on the plane it lies there and rots).
      for (const k of this.corpses) if (k.held === i) ((k.held = -1), (k.x = CELL[0]), (k.y = CELL[1]), (k.layer = this.layer[i]));
      this.corpse[i] = 0;
    } else if (this.pellet[i]) {
      if (this.soil[i] !== SOIL_DUG) this.looseLost++;
      else this.soilLost++;
    }
    // In the side view with a queen, the dead lie where they fall until an undertaker takes them out (slice 7). One world:
    // only underground, the nest's layer; the dead on the plane leave no corpse, as top-down (U3c: only the corpses
    // undertakers carry up go to the plane's midden).
    if (this.queen && this.layer[i] === this.home)
      this.corpses.push({
        x: CELL[0],
        y: CELL[1],
        held: -1,
        died: this.time,
        load: this.load[i],
        strain: this.strain[i],
        layer: this.home,
      });
    this.clearPellet(i);
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
   * What the sensor in direction (dx, dy) (a unit vector) reads on every channel, into s[slot] (food), s[slot + 3] (home) and
   * s[slot + 6] (alarm): the trail, the edge or rock as −1, and food (or the nest, for home) as SEEN.
   */
  sense(i: number, dx: number, dy: number, slot: number): void {
    const d = this.params.sensorDistance;
    const sx = this.x[i] + dx * d;
    const sy = this.y[i] + dy * d;
    const s = this.s;
    const { map, nest } = this;
    cellOf(sx, sy);
    const cx = CELL[0];
    const cy = CELL[1];
    // One world's curtain: its surface rows (the sky and the ground strip) are the plane's, solid to an ant underground.
    if (rockAt(map, cx, cy) !== OPEN || cy < (map.surfaceRows ?? 0)) {
      s[slot] = s[slot + 3] = s[slot + 6] = -1;
      return;
    }
    // Scent is read through the ant's perception (gains of 1 and no foreign reading: as it is, exactly).
    const f = this.ph.fields;
    // Food is sensed only through open ground: a pocket sealed off by soil is not, however near (ja-juiu, see inReach).
    if (map.food.get(cx, cy) > 0 && inReach(map, this.x[i], this.y[i], sx, sy)) s[slot] = SEEN;
    else {
      const wf = this.foreignFood[i];
      s[slot] = f.food.get(cx, cy) * this.gainFood[i] + (wf > 0 && this.foreign ? wf * this.foreign.fields.food.get(cx, cy) : 0);
    }
    const ndx = sx - nest.x;
    const ndy = sy - nest.y;
    s[slot + 3] = ndx * ndx + ndy * ndy < nest.r * nest.r ? SEEN : f.home.get(cx, cy) * this.gainHome[i];
    s[slot + 6] = f.alarm.get(cx, cy) * this.gainAlarm[i];
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

  /** A chamber's role as ant i smells it (nest slice 8): the fungus can blunt its floor marks (it can't tell) or swap brood and store. */
  perceivedPlace(i: number, role: Mark | null): Mark | null {
    if (!role) return null;
    // A species without this chamber's mark can't smell which chamber it is in: it reads plain tunnel (owner, review of #127 D1).
    if (!this.ph.has(role)) return null;
    if (this.gainMarks[i] < 0.5) return null;
    return this.swapMarks[i] >= 0.5 ? swapBroodStore(role) : role;
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
   * Floor marks (nest slice 3): underground, ant i lays the mark of the last chamber it was in, fainter the longer since
   * (as walking out lays home trail), so every tunnel smells of what lies back along it: road signs at each junction.
   */
  layMark(i: number, dt: number): void {
    this.antCell(i);
    const cx = CELL[0];
    const cy = CELL[1];
    if (isSky(this.map, cx, cy)) {
      this.lastRole[i] = 0; // out of the nest: the next chamber it enters starts its marks afresh
      return;
    }
    const role = this.placeAt(cx, cy);
    if (role) {
      this.lastRole[i] = MARKS.indexOf(role) + 1;
      this.sinceRole[i] = 0;
    } else this.sinceRole[i] = this.sinceRole[i] + dt;
    const r = this.lastRole[i];
    if (r === 0) return;
    const laid = this.params.deposit * Math.exp(-this.sinceRole[i] / MARK_DECAY) * dt * this.layGain[i];
    if (laid > 1e-4) this.ph.depositCell(MARKS[r - 1] as Mark, cx, cy, laid);
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
    if (this.cur === this.home) return this.feedHome(n);
    const was = this.cur;
    this.bind(this.home);
    try {
      this.feedHome(n);
    } finally {
      this.bind(was);
    }
  }

  /** feed, with the home layer bound. */
  feedHome(n: number): void {
    const ch = this.map.chambers;
    if (!this.queen || !ch) {
      this.larder += n;
      return;
    }
    // With a queen the larder is the food in the chambers: put anywhere else, the two would drift apart.
    const royal = ch.list.find((c) => c.colony === this.params.nest && c.role === "royal");
    if (!royal) throw new Error(`colony ${this.params.nest} has a queen but no royal chamber`);
    this.stock(royal, n);
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

  /** Ant i puts down the brood it holds where it stands (in the chamber it was taking it to, or wherever it died). */
  dropBrood(i: number, atX = NaN, atY = NaN): void {
    const ch = this.map.chambers;
    this.antCell(i);
    const cx = Number.isNaN(atX) ? CELL[0] : atX;
    const cy = Number.isNaN(atY) ? CELL[1] : atY;
    for (const b of this.brood.items)
      if (b.held === i) {
        b.held = -1;
        b.x = cx;
        b.y = cy;
        b.chamber = ch ? ch.at(cx, cy) : -1;
        if (b.chamber >= 0) ch!.list[b.chamber]!.brood++;
      }
    this.broodHeld[i] = 0;
    this.broodTo[i] = -1;
    this.holdT[i] = 0;
    this.mode[i] = EXPLORE;
    this.asked[i] = -1;
    this.question[i] = -1;
  }

  /**
   * Energy and felt hunger, once a tick before the ants move (the side view; ja-xu6.1, hunger.ts). Every ant uses energy
   * (twice as fast out on the ground). Once below EAT_BELOW it eats from food lying in its own nest within two cells, not
   * in a brood chamber (that food is the larvae's; nurses there are fed by mouth) nor the queen's stock (a chamber a cell wide is passed by more often than stood in, as for porters), or takes food by mouth from the best-fed
   * nestmate it touches (trophallaxis, above SHARE_ABOVE); at 0 it dies of hunger. Then what can be felt by touch: a
   * begging larva, a hungry adult, a queen who can't lay for want of food, and what each ant felt last tick, passed on at
   * PASS; each ant's need moves toward the strongest it feels within one cell.
   */
  body(dt: number): void {
    const ch = this.map.chambers;
    const { felt, donors, energy, scent, scentSum, perceived } = this;
    felt.reset();
    donors.reset();
    scentSum.reset();
    perceived.reset();
    for (const b of this.brood.items) if (b.stage === LARVA && b.held < 0) felt.put(b.x, b.y, begOf(b.energy));
    const q = this.queen;
    // Her cell, when she lives in a nest: a column can be negative (one world's curtain), so whether there is one is its own flag.
    let queenHere = false;
    let qx = 0;
    let qy = 0;
    let touching = 0; // ants within one cell of the queen: her scent is split among them
    if (q && q.alive && ch) {
      queenHere = true;
      cellOf(q.x, q.y);
      qx = CELL[0];
      qy = CELL[1];
      // She begs once she has gone QUEEN_WAIT without laying for want of food in her chamber (the death spiral's mark),
      // not whenever her chamber is briefly bare (early on she lays two eggs a second: begging then jammed the tunnels
      // with porters, A8 and G, PRD §50.18).
      const royal = ch.list[ch.at(qx, qy)];
      q.unfed = !royal || royal.food < EGG_FOOD ? q.unfed + dt : 0;
      felt.put(qx, qy, QUEEN_BEG * Math.min(1, Math.max(0, (q.unfed - QUEEN_WAIT) / QUEEN_WAIT)));
    }
    for (let i = 0; i < this.n; i++) {
      if (!this.alive[i]) continue;
      this.antCell(i);
      const cx = CELL[0];
      const cy = CELL[1];
      const under = this.under[i] === 1;
      let e = energy[i] - (under ? ADULT_DRAIN : ADULT_DRAIN_OUT) * dt;
      if (e < EAT_BELOW && under && ch) {
        const o = discOffsets(2)[cy & 1] as Int16Array;
        for (let k = 0; k < o.length; k += 2) {
          const c = ch.list[ch.at(cx + o[k], cy + o[k + 1])];
          if (!c || c.colony !== this.params.nest || c.role === "brood") continue; // the brood's food is the larvae's
          // The queen's stock is hers (a crowd resting in her chamber ate it, and she stopped laying): only what is beyond it.
          const spare = c.role === "royal" ? c.food - QUEEN_STOCK : c.food;
          if (spare <= 0) continue;
          const bite = Math.min(spare, (1 - e) / ENERGY_PER_FOOD);
          this.stock(c, -bite);
          this.eaten += bite;
          e += bite * ENERGY_PER_FOOD;
          break;
        }
      }
      if (e <= 0) {
        energy[i] = 0;
        this.kill(i, false);
        this.diedHungry++;
        continue;
      }
      energy[i] = e;
      if (!under) continue;
      scentSum.add(cx, cy, scent[i]);
      if (queenHere && hexDistance(cx, cy, qx, qy) <= 1) touching++;
      felt.put(cx, cy, Math.max(PASS * this.feltLast[i], adultBegOf(e)));
      if (e > SHARE_ABOVE) donors.put(cx, cy, i, energy);
    }
    // The queen's scent (ja-lo8.9, royal.ts): it fades; underground it moves toward the mean the ants within one cell
    // carry, and the ants touching her share her supply, × her signal.
    const fade = Math.exp(-dt / SCENT_FADE);
    const share = 1 - Math.exp(-dt / SCENT_SHARE);
    let supply = 0;
    if (q && q.alive && queenHere) {
      q.held = Math.min(SCENT_SUPPLY * q.signal * SCENT_HELD, q.held + SCENT_SUPPLY * q.signal * dt);
      if (touching > 0) {
        supply = q.held / touching;
        q.held = 0;
      }
    }
    for (let i = 0; i < this.n; i++) {
      if (!this.alive[i]) continue;
      let now = 0;
      let sc = scent[i] * fade;
      if (this.under[i] === 1) {
        this.antCell(i);
        const cx = CELL[0];
        const cy = CELL[1];
        const m = scentSum.mean(cx, cy);
        if (!Number.isNaN(m)) sc += (m - sc) * share;
        if (supply > 0 && hexDistance(cx, cy, qx, qy) <= 1) sc += supply;
        perceived.put(cx, cy, sc * this.scentGain[i]);
        const e = energy[i];
        if (e < EAT_BELOW) {
          // Food by mouth from the best-fed nestmate it touches: half the gap between them, keeping the giver above SHARE_ABOVE.
          const d = donors.near(cx, cy, energy);
          if (d >= 0 && d !== i) {
            const give = Math.min(energy[d] - SHARE_ABOVE, (energy[d] - e) / 2);
            if (give > 0) {
              energy[d] = energy[d] - give;
              energy[i] = e + give;
            }
          }
        }
        now = felt.near(cx, cy);
      }
      scent[i] = sc;
      this.feltLast[i] = now;
      this.need[i] = feel(this.need[i], now, dt);
    }
  }

  /** Workers age and die of it (the colony's life cycle; a colony with no queen runs it only if its species is `mortalWithoutQueen`). */
  ageWorkers(dt: number): void {
    for (let i = 0; i < this.n; i++) {
      if (!this.alive[i]) continue;
      if ((this.age[i] = this.age[i] + dt) > this.lifespan[i]) {
        this.kill(i, false);
        this.diedOld++;
      }
    }
  }

  /** Ants on a count grid within two cells of (x, y). */
  around(g: CellCounts, x: number, y: number): number {
    let s = 0;
    const o = discOffsets(2)[y & 1] as Int16Array;
    for (let k = 0; k < o.length; k += 2) s += g.get(x + o[k], y + o[k + 1]);
    return s;
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

  /**
   * One world's plane (U3c): ant i, with a pellet or corpse just carried up its hole (or a rival's), walks it out on a
   * heading drawn now (a new draw, one world only). Spoil goes the side view's way out, farther as the mound grows; a
   * corpse to the midden, at least MIDDEN_MIN from home by its vector and off the mound.
   */
  carryOut(i: number): void {
    this.spoilA[i] = this.rng() * 2 * Math.PI;
    this.spoilT[i] = 0;
    if (this.corpse[i]) this.spoilTo[i] = MIDDEN_MIN;
    else {
      // The side view's draw (2 + reach × √u: uniform over a disc), with the disc's reach grown so its area tracks the soil
      // brought out at MOUND_HEIGHT levels deep (Tschinkel 2015), as the side view's length does along the ground: grown as
      // the side view's (linearly), the 2D disc thinned to under a pellet a cell.
      this.spoilTo[i] = 2 + planeMoundReach(this.heaped) * Math.sqrt(this.rng());
    }
    this.wall[i] = 0;
    this.mx[i] = NaN;
    this.gx[i] = NO_CELL;
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
      if (!this.responses.get(this.touch(i, enemy, this.mode[i], "none", "soil"))) return false;
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

  /** Touch: is there rock (or the map's edge) `d` cells from ant i's position along `angle`? */
  touchProbe(x: number, y: number, angle: number, d: number): boolean {
    return blocked(this.map, x + Math.cos(angle) * d, y + Math.sin(angle) * d);
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
    const answer = this.responses.leave(this.touch(i, enemy, asked, "none"));
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

  /**
   * The raid trail ant i smells, strongest of its cell and its three sensors (behaviour MR 5.2): what recruits it, what it is asked
   * `leave` with, and what keeps it recruited. "strong" where the colony doesn't recruit raiders by trail.
   */
  raidSmelt(i: number): "none" | "faint" | "strong" {
    if (this.params.raidGate <= 0) return "strong";
    // One world (ja-web): at the gate at the top of its shaft, the plane's trail where it ends, at its hole.
    if (this.entrance !== null) return this.atGate(i) ? trailLevel(this.holeRaid()) : "strong";
    return trailLevel(this.raidLevel(i));
  }

  /** The raid trail's level ant i smells: strongest of its cell and its three sensors (one world's curtain: at its hole, holeRaid). */
  raidLevel(i: number): number {
    if (this.entrance !== null) return this.line !== null ? this.holeRaid() : 0;
    if (!this.ph.live("raid")) return 0;
    const x = this.x[i];
    const y = this.y[i];
    const h = this.heading[i];
    const d = this.params.sensorDistance;
    const a = this.params.sensorAngle;
    const ph = this.ph;
    return Math.max(
      ph.read("raid", x, y),
      ph.read("raid", x + Math.cos(h - a) * d, y + Math.sin(h - a) * d),
      ph.read("raid", x + Math.cos(h) * d, y + Math.sin(h) * d),
      ph.read("raid", x + Math.cos(h + a) * d, y + Math.sin(h + a) * d),
    );
  }

  /** Whether ant i is within its nest's radius on a top-down map. */
  atNestTop(i: number): boolean {
    const dx = this.x[i] - this.nest.x;
    const dy = this.y[i] - this.nest.y;
    return dx * dx + dy * dy < this.nest.r * this.nest.r;
  }

  // ——— one world: the gate at the top of the shaft (ja-web, PRD §48.6) ———

  /**
   * Whether ant i, in the curtain, is held at the gate at the top of its own shaft: an old forager going out (exploring or
   * following, or a recruited raider), its jaws empty, not a finder going home to tell, with no pass (`leaveOk`), at the
   * gate (atGate). Porters, and ants carrying spoil, a corpse or brood, are never held.
   */
  holdsAt(i: number): boolean {
    const m = this.mode[i];
    return (
      this.leaveOk[i] === 0 &&
      (m === EXPLORE || m === FOLLOW || (m === FIGHT && this.recruited[i] === 1)) &&
      !this.carrying[i] &&
      !this.pellet[i] &&
      !this.broodHeld[i] &&
      !this.porter[i] &&
      !this.reporting[i] &&
      this.band(i) === 2 &&
      this.atGate(i)
    );
  }

  /**
   * Whether ant i is at the gate: one world's curtain, within WAIT_STEPS steps of its own hole along its own tunnels (the
   * way-out field, outField), where it senses its place as "hole". Leaves the shared CELL as it found it.
   */
  atGate(i: number): boolean {
    if (this.line === null || this.entrance === null) return false;
    // Deeper than WAIT_STEPS rows below the hole, it can't be (most of the nest: no field read).
    if (this.y[i] > centreY(this.entranceRow + WAIT_STEPS) + R) return false;
    const keepX = CELL[0];
    const keepY = CELL[1];
    this.antCell(i);
    const d = outDistAt(this, CELL[0], CELL[1]);
    CELL[0] = keepX;
    CELL[1] = keepY;
    return d >= 0 && d <= WAIT_STEPS;
  }

  /**
   * The plane's raid trail where it ends at this colony's hole: strongest of the hole's cell and the six round it. What an
   * ant held at the gate smells of it (a finder lays it home to the hole, and recruits at its own entrance: Topoff et al.
   * 1987, docs/raid-recruitment.md).
   */
  holeRaid(): number {
    const L = this.layers[PLANE] as Layer;
    const ph = L.ph;
    if (!ph.live("raid")) return 0;
    const hc = this.holeCells[this.params.nest] as HoleCell;
    const f = ph.fields.raid;
    const o = discOffsets(1)[hc.py & 1] as Int16Array;
    let best = 0;
    for (let k = 0; k < o.length; k += 2) {
      const x = hc.px + o[k];
      const y = hc.py + o[k + 1];
      if (inBounds(L.map, x, y)) best = Math.max(best, f.get(x, y));
    }
    return best;
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

  /** Nestmates in cell (cx, cy) and the six round it, as the colony's count grid has them (docs/stance.md: crowding). */
  nestmatesAround(cx: number, cy: number): number {
    const f = this.nestmates;
    if (!f) return 0;
    const map = this.map;
    const o = discOffsets(1)[cy & 1] as Int16Array;
    let s = 0;
    for (let k = 0; k < o.length; k += 2) {
      const x = cx + o[k];
      const y = cy + o[k + 1];
      if (inBounds(map, x, y)) s += f.get(x, y);
    }
    return s;
  }

  /** Last tick's returns with food in cell (cx, cy) and the six round it (behaviour MR 5). */
  returnsAround(cx: number, cy: number): number {
    const g = this.returned;
    if (g.size === 0) return 0;
    const o = discOffsets(1)[cy & 1] as Int16Array;
    let s = 0;
    for (let k = 0; k < o.length; k += 2) s += g.get(cellKey(cx + o[k], cy + o[k + 1])) ?? 0;
    return s;
  }

  /**
   * Nestmates against strangers in ant i's cell and the six round it, as it feels them (behaviour MR 4): outnumbered
   * under two thirds as many, outnumbering over half as many again. Call after enemyHeading (strangers as it perceives
   * them). Leaves the shared CELL as it found it.
   */
  odds(i: number): Odds {
    const g = this.enemies;
    const f = this.nestmates;
    if (!g || !f) return "even";
    const keepX = CELL[0];
    const keepY = CELL[1];
    this.antCell(i);
    const cx = CELL[0];
    const cy = CELL[1];
    const map = this.map;
    const o = discOffsets(1)[cy & 1] as Int16Array;
    let mine = 0;
    let them = 0;
    for (let k = 0; k < o.length; k += 2) {
      const x = cx + o[k];
      const y = cy + o[k + 1];
      if (!inBounds(map, x, y)) continue;
      mine += f.get(x, y);
      them += g.get(x, y);
    }
    CELL[0] = keepX;
    CELL[1] = keepY;
    mine = Math.max(1, mine);
    return mine > 1.5 * them ? "outnumbering" : mine * 1.5 < them ? "outnumbered" : "even";
  }

  /** The nearest cell holding enemies within enemyRange of ant i, as a heading, or null. */
  enemyHeading(i: number): number | null {
    const g = this.enemies;
    if (!g) return null;
    // Strangers to this ant, as it perceives them: its own odour, its own tolerance.
    g.look?.(this.odour[i], this.tolerance[i]);
    const map = this.map;
    this.antCell(i);
    const cx = CELL[0];
    const cy = CELL[1];
    const ENEMY_RANGE = this.params.enemyRange;
    if (!g.any(cx - ENEMY_RANGE - 1, cy - ENEMY_RANGE, cx + ENEMY_RANGE + 1, cy + ENEMY_RANGE)) return null;
    // The hex disc round the ant: the nearest cell (by distance, not ring order) holding enough strangers to react to.
    const o = discOffsets(ENEMY_RANGE)[cy & 1] as Int16Array;
    const ax = this.x[i];
    const ay = this.y[i];
    let best = Infinity;
    let heading: number | null = null;
    for (let k = 0; k < o.length; k += 2) {
      const x = cx + o[k];
      const y = cy + o[k + 1];
      if (!inBounds(map, x, y) || g.get(x, y) < ENEMY) continue;
      const dx = centreX(x, y) - ax;
      const dy = centreY(y) - ay;
      const d = dx * dx + dy * dy;
      // Not through soil: a raider on the ground charged strangers in a tunnel under it, into the soil, for good (review of
      // #26: raiders stuck in the pits by the rival's mound, none in at its hole).
      if (d < best && (!this.map.hasSoil || this.clearTo(ax, ay, centreX(x, y), centreY(y)))) {
        best = d;
        heading = Math.atan2(dy, dx);
      }
    }
    return heading;
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

  /**
   * Whether ant i, at the top of a shaft, may climb out onto the plane: not with brood in its jaws, not a porter (food
   * moved between chambers stays in), and with spoil or a corpse to put out, or of an age to go out (mayGoOut) and not
   * homing to its chamber (goal: a carrier just in at its hole, or a returner, whose walker turned up the shaft;
   * crossing, each went straight back down: in the spike, up to 68 carriers a colony in 300 s). One lost in another
   * nest's tunnels heads for the hole, and climbs out.
   */
  mayCrossUp(i: number): boolean {
    if (this.broodHeld[i] === 1 || this.porter[i] === 1) return false;
    if (this.pellet[i] === 1) return true;
    // Held at the gate at the top of its own shaft (ja-web): not until it has a pass.
    if (this.params.leaveGate > 0 && this.holdsAt(i)) return false;
    return this.mayGoOut(i) && !(this.mode[i] === RETURN && this.goalKind[i] === 0);
  }

  /** The colony (an index into holeCells) whose hole is plane cell (px, py), or −1. */
  holeAt(px: number, py: number): number {
    const hs = this.holeCells;
    for (let k = 0; k < hs.length; k++) if ((hs[k] as HoleCell).px === px && (hs[k] as HoleCell).py === py) return k;
    return -1;
  }

  /**
   * Ant i climbs out of the hole at curtain cell (cx, cy) (or beside it) onto the plane, at that hole's cell: any hole
   * (lost in a rival's tunnels, it climbs out there; a raider leaves a rival's shaft). Its vector home resets at its own
   * hole only, as integrate's does (its search, as every crossing's: crossed). Spoil and corpses it keeps, to carry out
   * on the plane (U3c, carryOut): a loose pellet taken down to backfill comes back up as spoil to spread (looseBack).
   * Its heading is the caller's to write.
   */
  crossUp(i: number, cx: number, cy: number): void {
    const hs = this.holeCells;
    let k = 0;
    let best = Infinity;
    for (let n = 0; n < hs.length; n++) {
      const d = hexDistance(cx, cy, (hs[n] as HoleCell).col, (hs[n] as HoleCell).row);
      if (d < best) {
        best = d;
        k = n;
      }
    }
    const hc = hs[k] as HoleCell;
    if (this.pellet[i] && this.soil[i] === SOIL_FILL) {
      // Taken down to backfill and found nowhere: back out with it, to spread (as at the chamber: looseBack).
      this.soil[i] = SOIL_LOOSE;
      this.looseBack++;
    } else if (this.carrying[i]) this.carriedUp++;
    this.layer[i] = PLANE;
    this.x[i] = centreX(hc.px, hc.py);
    this.y[i] = centreY(hc.py);
    this.under[i] = 0;
    this.goalKind[i] = 1;
    if (k === this.params.nest) {
      // Up out of its own hole the vector starts afresh, pointing at it, with this trip's drift in 2D (U3b). Up out of a
      // rival's it runs on, its error standing (the side view's rule, integrate; review of #20).
      this.odoSurf[i] = 0;
      this.driftSurf[i] = gauss(this.rng) * PI_DRIFT_2D;
      this.driftSurfY[i] = gauss(this.rng) * PI_DRIFT_2D;
      routeClear(this, i); // a fresh trip out: no places of the last
    }
    this.lastRole[i] = 0; // out of the nest: the next chamber it enters starts its marks afresh
    this.leaveOk[i] = 0; // its pass through the gate is used (ja-web)
    this.crossed(i);
    if (this.pellet[i]) this.carryOut(i);
    this.crossedUp++;
  }

  /**
   * Ant i, on the plane at colony k's hole, goes down it: into the curtain at that hole (the crust's open cell), heading
   * down. With food it is home with it, and the side view's code takes it on to reception and the chambers. Where the
   * colony gates leaving (ja-web), at its own hole: a carrier is a return the ants held at the top of the shaft meet next
   * tick, and has a pass back out (a successful forager never waits, PRD §48); a rested, empty forager's trip ends here,
   * just inside, and it is held at the gate at once (the owner's choice, 2026-11-10: it doesn't go down first).
   */
  crossDown(i: number, k: number): void {
    const hc = this.holeCells[k] as HoleCell;
    const p = this.params;
    const gated = k === p.nest && p.leaveGate > 0;
    if (this.carrying[i]) {
      this.carriedDown++;
      if (gated) {
        this.holeIn++;
        this.leaveOk[i] = 1;
      }
    } else if (gated && p.arrive !== "return" && this.mode[i] === RETURN && !this.pellet[i] && this.band(i) === 2 && !this.isTired(i)) {
      // `p.follows` here is defensive (review of #121, N1): no shipped species sets arrive "follow", and the policy guard turns a follower to explore anyway.
      this.mode[i] = p.arrive === "follow" && p.follows && !this.recruited[i] ? FOLLOW : EXPLORE;
      this.asked[i] = -1;
      this.restT[i] = 0;
    }
    this.reporting[i] = 0; // a finder has told: its trail ends here, at the hole (ja-web)
    this.layer[i] = CURTAIN;
    this.x[i] = centreX(hc.col, hc.row);
    this.y[i] = centreY(hc.row);
    this.heading[i] = Math.PI / 2;
    this.under[i] = 1;
    this.search[i] = 0;
    this.goalKind[i] = 1;
    this.defending[i] = 0;
    this.crossed(i);
    this.crossedDown++;
  }

  /** Ant i has changed layer: what it held of the old map (walls, cells, faces, targets, its cell cache) is dropped, as placeNewborn starts an ant. */
  crossed(i: number): void {
    this.homeAfresh(i);
    this.gx[i] = NO_CELL;
    this.byCell[i] = 0;
    this.digT[i] = 0;
    this.digAim[i] = NaN;
    this.hugT[i] = 0;
    this.loopX[i] = NO_CELL;
    this.followT[i] = 0;
    this.noTunnel[i] = NO_KEY;
    this.looked[i] = NO_KEY;
    this.cameFrom[i] = NO_KEY;
    this.lastDug[i] = NO_KEY;
    this.putAt[i] = NO_KEY;
    this.chamberCell[i] = NO_KEY;
    this.staleWalk[i] = 0;
    this.spoilTo[i] = NaN;
    this.cellAtX[i] = NaN;
    this.groundRef[i] = NaN;
    this.restT[i] = 0;
  }

  /**
   * Put living ant i on layer `layer` at world (x, y), as if it had crossed there (tests: one world's crossings). Out of
   * the nest's layer it is on the surface (`under` 0), on it underground.
   */
  putAnt(i: number, layer: number, x: number, y: number): void {
    this.layer[i] = layer;
    this.x[i] = x;
    this.y[i] = y;
    this.under[i] = layer === this.home && this.entranceOf(layer) ? 1 : 0;
    this.goalKind[i] = 1;
    this.crossed(i);
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
    if (this.queen) this.body(dt);
    for (let i = 0; i < this.n; i++) {
      if (!this.alive[i]) continue;
      // An ant on another layer than the one bound: bind its own (a colony on one layer never does).
      if (multi && this.layer[i] !== this.cur) {
        this.bind(this.layer[i]);
        ({ map, ph } = this);
        home = this.nest;
        ({ gate, hold, leak, metLeak, rgate, foeLeak, sgate, threatLeak, crowdKeep } = layerGates![this.cur]!);
      }
      if (map.sky) unbury(this, i);
      let h = this.heading[i];
      // Three sensors (left, front, right), each read on every channel at once.
      const sn = this.s;
      const ch = Math.cos(h);
      const sh = Math.sin(h);
      this.sense(i, ch * ca + sh * sa, sh * ca - ch * sa, 0); // h − a
      this.sense(i, ch, sh, 1);
      this.sense(i, ch * ca - sh * sa, sh * ca + ch * sa, 2); // h + a
      const fl = sn[0];
      const ff = sn[1];
      const fr = sn[2];
      const hl = sn[3];
      const hf = sn[4];
      const hr = sn[5];
      const al = sn[6];
      // What this ant smells of alarm, for its Touch this tick (behaviour MR 4: graded alarm).
      this.alarmAnt = i;
      this.alarmSmelt = trailLevel(Math.max(sn[6], sn[7], sn[8]));
      const af = sn[7];
      const ar = sn[8];
      const toEnemy = this.enemyHeading(i);
      this.oddsNow = toEnemy === null ? "none" : this.odds(i);
      // One world (ja-web): an outgoing forager at the top of its own shaft, its jaws empty and with no pass, is held at the
      // gate there (holdsAt): it waits as a forager home on open ground does, and is asked `leave` (below). With a
      // stranger near it isn't waiting: it isn't asked, and it fights or flees in the shaft as anywhere; but the gate still
      // bars the way out (mayCrossUp asks holdsAt, which doesn't look for strangers), so it doesn't climb out without a
      // pass. Intended: a stranger at the top of the shaft is met there, not left behind.
      const held = hold && toEnemy === null && this.holdsAt(i);
      if (held) heldNow++;
      if (rgate) {
        this.foes[i] = this.foes[i] * foeLeak + (toEnemy === null ? 0 : dt);
        // (One world, ja-web: a finder lays its trail on to its hole, and is done telling once it goes down it, crossDown:
        // ended at the disc round the hole, the trail never reached the ants held at the top of the shaft.)
        if (this.reporting[i] === 1 && this.line === null && this.atNestTop(i)) this.reporting[i] = 0;
      }
      // Defence is the ant's own (docs/stance.md): alarm smelt or strangers in reach raise its threat, which fades; past defendAt,
      // on home ground (within homeGround of its nest by its home vector), it defends. Far out, it forages as before.
      if (sgate) {
        const felt = toEnemy !== null || this.alarmSmelt !== "none";
        const th = this.threat[i] * threatLeak + (felt ? dt : 0);
        this.threat[i] = th;
        this.defending[i] = th >= p.defendAt && Math.hypot(this.x[i] - this.nest.x, this.y[i] - this.nest.y) <= p.homeGround ? 1 : 0;
      }
      // Raid stance (behaviour MR 5.2): a raid is a bias, not an order. An ant is recruited by smelling a scout's raid trail, or goes out
      // as a scout at raidScout when it is home with empty jaws; the others forage. A recruited ant's raid ends when it comes home
      // with no trail under it: no trail was laid for it, or the trail has faded.
      if (rgate && (sgate || this.stance === "raid")) {
        const homeNow = this.atNestTop(i);
        if (!homeNow) this.gone[i] = 1;
        if (this.recruited[i] === 0) {
          // Where each ant's stance is its own, the trail recruits at home (docs/stance.md; Polyergus scouts recruit the workers at their
          // own nest): an ant out at its work crosses it and carries on. Recruiting anywhere ran away: G′ seed 1, 773 of 899 raiding.
          // And it recruits by degrees: at raidRecruit a second on a strong trail, less on a faint one (thresholds differ between ants,
          // as Pheidole majors answer only intense recruitment). All at once, one scout's trail called the 150-200 ants idle at home,
          // and every raid was a war (G′ seeds 1-4: 880 lost against no raids' 170).
          if (
            this.raidSmelt(i) !== "none" &&
            (!sgate ||
              (this.raidable &&
                homeNow &&
                !this.carrying[i] &&
                this.rng() < 1 - Math.exp(-p.raidRecruit * Math.min(1, this.raidLevel(i) / STRONG) * dt)))
          ) {
            this.recruited[i] = 1;
            this.gone[i] = 0;
            this.recruits++;
          } else if (
            !sgate &&
            homeNow &&
            !this.carrying[i] &&
            !this.pellet[i] &&
            !this.broodHeld[i] &&
            this.rng() < 1 - Math.exp(-p.raidScout * dt)
          ) {
            this.recruited[i] = 1;
            this.gone[i] = 0;
            this.mode[i] = FIGHT; // out it goes
            this.raidScouts++;
          }
        } else if (homeNow && this.gone[i] === 1 && this.raidSmelt(i) === "none") {
          this.recruited[i] = 0;
          this.gone[i] = 0;
        }
        if (homeNow || this.recruited[i] === 0) this.pastEnd[i] = 0;
      } else if (this.recruited[i] === 1 && this.line === null) {
        // (In one world a raider keeps its stance underground: its raid ends at home on the plane.)
        this.recruited[i] = 0;
        this.pastEnd[i] = 0;
      }
      // One world (ja-web): an ant held at the gate smells the plane's raid trail where it ends, at its own hole (raidSmelt:
      // a finder recruits at its own entrance, Topoff et al. 1987), and is recruited by it by degrees, as an idle ant at
      // home on open ground is.
      if (
        held &&
        this.recruited[i] === 0 &&
        p.raidGate > 0 &&
        p.stanceGate > 0 &&
        this.raidable &&
        this.raidSmelt(i) !== "none" &&
        rng() < 1 - Math.exp(-p.raidRecruit * Math.min(1, this.raidLevel(i) / STRONG) * dt)
      ) {
        this.recruited[i] = 1;
        this.gone[i] = 0;
        this.recruits++;
      }
      // The carry response (ja-1pm): a load is taken where it belongs, or put down here; put down, the ant is not carrying
      // this step (its trip is over: see `arrive`).
      // (The local carry response always takes, so it isn't asked: building a Touch for every carrier every step cost
      // the side view ~11 % a tick for nothing, review of #35.)
      if (
        this.responses.carry !== localResponses.carry &&
        (this.carrying[i] || this.pellet[i] || this.broodHeld[i]) &&
        this.responses.carry(this.touch(i, toEnemy !== null)) === "put down"
      )
        putDown(this, i);

      // The mode choice, only when the situation changed since the ant was last asked.
      // A carrying ant goes home: a mechanic, never asked (and asked afresh once it puts the food down).
      // So does one carrying a soil pellet it dug, to drop on the mound.
      const carrying = this.carrying[i] === 1;
      const pellet = this.pellet[i] === 1;
      const nursing = this.broodHeld[i] === 1;
      // One world's plane (U3c): carrying spoil or a corpse out from its hole, by its own vector (carryOut). Spoil or a
      // corpse on the plane is always on its way out (one put there some other way, a test's, sets out now); only a loose
      // pellet taken home to backfill is not.
      if (pellet && this.line !== null && this.cur === PLANE && this.soil[i] !== SOIL_FILL && Number.isNaN(this.spoilTo[i]))
        this.carryOut(i);
      const outward = pellet && this.line !== null && this.cur === PLANE && !Number.isNaN(this.spoilTo[i]);
      if (!pellet) this.staleWalk[i] = 0; // a stale walk is part of one trip home with a pellet
      // A finder (behaviour MR 5.2): a raider outside, its jaws empty, no raid trail under it, that has been in contact with
      // strangers for findAt seconds goes home to tell, laying the raid trail on the way. (A raider on the trail meeting
      // strangers fights them: the trail is where the scout was before.)
      if (
        rgate &&
        toEnemy !== null &&
        this.reporting[i] === 0 &&
        !carrying &&
        !pellet &&
        !nursing &&
        this.stanceOf(i) === "raid" &&
        this.foes[i] >= p.findAt &&
        !this.atNestTop(i) &&
        this.raidSmelt(i) === "none"
      ) {
        this.reporting[i] = 1;
        this.since[i] = 0;
        this.homeAfresh(i);
        this.finds++;
      }
      const reporting = this.reporting[i] === 1;
      // Where homing heads: the chamber; in the side view, the entrance for a pellet carrier (soil goes up and
      // out) and for any ant on the ground line (path integration home is to the hole, not through the ground).
      let goal = homeGoal(this, i, pellet);
      // A nurse heads for its brood chamber; out on the ground line (lost), for the hole first, like any homing ant. Only
      // where there is a hole into the layer: one world's plane has no chambers (its carriers home to the hole: crossDown).
      if (nursing && goal === this.nest && this.entrance) goal = chamberGoal(this, this.broodTo[i]);
      // Food flow (slice 5): food goes to a chamber, not to "the nest": underground, a carrier heads for the one it takes
      // its food to (a forager: reception, or the royal chamber until there is one).
      else if (carrying && this.queen && goal === this.nest && this.entrance) goal = chamberGoal(this, this.foodTo(i));
      let nest = goal;
      const x0 = this.x[i];
      const y0 = this.y[i];
      let mode = this.mode[i];
      const prevMode = mode;
      const item: Item = carrying ? "food" : pellet ? (this.corpse[i] ? "corpse" : "soil") : nursing ? "brood" : "none";
      const resp = this.responses;
      let situation0 = -1; // the situation's code with mode 0 (encode), when the mode policy was consulted this step
      let modeStride = MODE_STRIDE; // the mode field's step in that code: the species' own schema's, when it has one
      let waiting = false;
      let rolled = false; // asked `leave` this step already (behaviour MR 5): one roll a step, at the rate it answers
      if (carrying || pellet || nursing || reporting) {
        // A carrier takes its load where it belongs (the carry response, above, said so): home, not a mode choice; the next
        // question comes once the load is down.
        mode = RETURN;
        this.mode[i] = mode;
        this.asked[i] = -1;
        this.question[i] = -1;
        if (!reporting) this.loaded[i] = 1;
      } else {
        // Its load just put down, wherever that was (spoil on the mound, a corpse on the midden, food in the larder): the
        // carrying trip is over, so it is not returning any more (ja-qnx; `arrive`). It heads back out along its trail: a
        // follower, which a fresh ant is asked as the local rule asked a returner (both follow a trail, explore without
        // one). As an explorer, the middle-aged diggers no longer followed the carriers' scent down to reception, where
        // they port its food on: food piled up there (A8, seeds 5-6: 30-37 % of the nest's food carried on, main 87-100 %).
        if (this.loaded[i]) {
          this.loaded[i] = 0;
          if (p.arrive !== "return" && mode === RETURN) {
            mode = p.follows ? FOLLOW : EXPLORE;
            this.mode[i] = mode;
          }
        }
        const tired = this.isTired(i);
        const food = trailLevel(Math.max(fl, ff, fr));
        const home = homeField(this, i, hl, hf, hr);
        const alarm = trailLevel(Math.max(al, af, ar));
        const enemy = toEnemy === null ? 0 : 1;
        const stance = STANCES.indexOf(this.stanceOf(i));
        // A species' own situation (ja-fnd.5.10): the generic fields and its own, encoded by its schema; the generic ant's stays packSituation.
        const own = this.own;
        let asks: SpeciesSituation | null = null;
        if (own) {
          asks = {
            mode: MODES[mode] as Mode,
            tired,
            foodTrail: food,
            homeTrail: home,
            alarm,
            enemy: enemy ? "near" : "none",
            stance: STANCES[stance] as Stance,
          };
          if (own.sense) {
            const sensed = own.sense(this, i);
            for (const name in sensed) {
              const ok = own.allowed.get(name);
              if (ok && !ok.includes(sensed[name]))
                throw new Error(`sense: "${name}" is ${String(sensed[name])}, not one of its field's values`);
            }
            asks = { ...asks, ...sensed };
          }
          // Its policy is handed only the fields its schema asks (owner, review of #122 D1): an ant chooses only from what its species senses.
          asks = own.schema.state(asks);
          modeStride = own.modeStride;
        }
        const before = own ? own.schema.encode(asks!) : packSituation(mode, tired, food, home, alarm, enemy, stance);
        situation0 = before - mode * modeStride;
        // Waiting at home (behaviour MR 5): where the colony gates leaving, a forager home in "return" is asked `leave`
        // (below), not its mode: the mode policy sends any ant out that smells no food trail, gate or no gate.
        // One world (ja-web): nobody waits on the plane (every returner goes down its hole); an ant held at the gate at the
        // top of its shaft waits, and rolls `leave` once a step, asked as a returning forager (as a raider if recruited).
        // A yes is its pass: it climbs out, and its mode policy is asked afresh next step.
        waiting = held || (gate && mode === RETURN && !enemy && this.atNestTop(i) && !this.inbound(i, mode));
        if (held) {
          rolled = true;
          if (this.leaves(i, dt, false)) {
            this.leaveOk[i] = 1;
            this.asked[i] = -1;
          }
        }
        if (before !== this.asked[i] && !waiting) {
          mode = MODES.indexOf(
            this.policy(
              asks ?? {
                mode: MODES[mode] as Mode,
                tired,
                foodTrail: food,
                homeTrail: home,
                alarm,
                enemy: enemy ? "near" : "none",
                stance: this.stanceOf(i),
              },
            ),
          );
          if (mode < 0) mode = tired ? RETURN : EXPLORE; // a policy answering nonsense falls back to the plain rule
          if (mode === FOLLOW && !p.follows) mode = EXPLORE; // a species with no follow mode can't follow (ja-fnd.5.9)
          // Zoned by age: an ant that may not go out is no raider. Sent raiding, a young one climbed to its hole, was put
          // back down the shaft, and climbed again (review of #26: 70–93 of ~110 young raiders parked at the hole). With
          // no enemy near, it explores (with one near, it fights where it is).
          if (mode === FIGHT && !enemy && this.stanceOf(i) === "raid" && this.queen && !this.mayGoOut(i)) mode = EXPLORE;
          if (mode === RETURN && this.mode[i] !== RETURN) this.homeAfresh(i);
          this.mode[i] = mode;
          this.asked[i] = own ? situation0 + mode * modeStride : packSituation(mode, tired, food, home, alarm, enemy, stance);
          this.seen[before] = 1;
          // The generic code of the situation it was asked in (its mode before the answer), whatever the species asks: the fungus, the journal and the
          // ant card read the generic situation (review of #122, S1, S3).
          this.question[i] = own ? packSituation(MODES.indexOf(asks!.mode), tired, food, home, alarm, enemy, stance) : before;
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
          if (answer === "drop and run" && (carrying || pellet || nursing)) putDown(this, i);
          if (mode !== RETURN) this.homeAfresh(i);
          mode = RETURN;
          // A carrier flees by taking its load home: turned straight away from the strangers, on the side view's ground
          // line that was often away from its hole (G seed 5, raid stance: 3–5 carriers held over 120 s between the nests).
          if (!carrying && !pellet && !nursing) fleeFrom = toEnemy;
        }
        this.mode[i] = mode;
        // The situation as answered, with the mode the contact response set: else the mode policy, asked again next step,
        // put the ant back on its trail and contact turned it round again, resetting its homing every other step (review
        // of #38: 6,170 flips in 150 s on G′ seed 1).
        if (situation0 >= 0) this.asked[i] = situation0 + mode * modeStride;
      }
      // Homing steers for where the ant believes the goal is (its drifting home vector), not for the goal itself.
      // A pellet carrier is taking soil up and out: it climbs (gravity), and up the shaft is the hole, so no vector.
      // (Steering it by a drifted one left carriers surfacing off target and dropping spoil in pits beside the hole.)
      // (On one world's plane a loose pellet taken home to backfill homes by its vector, as any returner there.)
      if (mode === RETURN && (!pellet || (this.line !== null && this.cur === PLANE && this.soil[i] === SOIL_FILL)))
        nest = believe(this, i, goal);
      this.goalX = nest.x;
      this.goalY = nest.y;
      this.holeX = goal === this.entrance ? nest.x : (this.entrance?.x ?? 0);
      // Steer by mode. An explorer at a soil face keeps its heading while it digs.
      const noise = (rng() - 0.5) * 2 * dt;
      const detouring = this.detour[i] > 0;
      if (mode !== EXPLORE) this.digT[i] = 0;
      if (mode !== EXPLORE || pellet) this.hugT[i] = 0;
      else this.hugT[i] = Math.max(0, this.hugT[i] - dt);
      if (mode !== prevMode) {
        this.gx[i] = NO_CELL;
        this.digAim[i] = NaN;
        this.chamberCell[i] = NO_KEY; // a face aimed at as an explorer: stale once it does something else (review of slice 2)
      }
      const digging = this.digT[i] > 0;
      if (mode !== RETURN) {
        this.wall[i] = 0;
        this.mx[i] = NaN;
      }
      if (held && this.leaveOk[i] === 0) {
        // One world (ja-web): held at the gate, it mills among the top cells of its shaft (mill), where the carriers come
        // down past it.
        if (this.mill(i, p.speed * dt)) h = this.towardTarget(i);
        else h += noise * p.wander;
      } else if (outward) {
        // Out on its heading; a bump turned it (below), and while it wanders after one, it wanders.
        if (detouring) h += noise * p.wander;
        else h = turnToward(h, this.spoilA[i], p.turnRate * dt) + noise * p.wander * 0.25;
      } else if (mode === RETURN) {
        // Homing uses only what an ant has: its home vector (path integration: real ants count steps
        // against a sky compass), its antennae, and touch. A straight line home walks into the same
        // wall forever (reviews reproduced games where every homing ant of a colony was stuck), so a
        // blocked step starts wall-following by touch (the Bug2 rule, set up where the step is blocked
        // below): keep the wall on one side until the ant is nearer home than where it met the wall
        // and the way home is open.
        const x = this.x[i];
        const y = this.y[i];
        const toNest = Math.atan2(nest.y - y, nest.x - x);
        // Progress: no cell nearer its goal in TUNNEL_STALL seconds (home scent can lead round a ring of tunnels for
        // ever), and the tunnel walker picks branches by its home vector for BY_VECTOR seconds (see walkTunnel); then by scent again.
        const near = Math.hypot(nest.x - x, nest.y - y);
        if (near < this.bestD[i] - 1) {
          this.bestD[i] = near;
          this.stallT[i] = 0;
        } else if ((this.stallT[i] = this.stallT[i] + dt) > TUNNEL_STALL + BY_VECTOR) {
          this.bestD[i] = near;
          this.stallT[i] = 0;
        }
        // One world's plane (U3b): any returner no nearer where it believes the hole is for SEARCH_STALL seconds searches on as
        // if it had got there. That is what unblocks a belief in rock or walled off (following the wall, one went round the
        // plane's edge), but most firings are away from the belief: on seed 1 (120 s) 596, 81 % more than 10 cells from it,
        // 92 cutting short a walk round rock (review of #60). Narrower versions delivered about the same (seeds 1–3), so
        // it stays a general "search sooner when blocked" rule.
        if (nest !== goal && this.stallT[i] > SEARCH_STALL && this.line !== null && this.cur === PLANE && !routeFail(this, i, true))
          searchOn(this, i, true);
        if (this.entrance && (this.wall[i] !== 0 || detouring)) {
          // On the ground line it homes cell by cell (see walkTunnel): no walls to follow, no detour to wander (an
          // explorer's detour, run up bumping round, used to carry on once it had food, and walk it away from the hole).
          this.antCell(i);
          if (isSky(map, CELL[0], CELL[1])) {
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
        if (
          p.homeTrail > 0 &&
          carrying &&
          this.entrance === null &&
          !detouring &&
          Math.max(fl, ff, fr) >= FAINT &&
          Math.max(fl, ff, fr) < SEEN
        ) {
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
          if (this.touchProbe(x, y, way, 1.2)) onTrail = false;
          else {
            this.wall[i] = 0; // the trail leads on: let go of the wall
            this.mx[i] = NaN;
          }
        }
        const side = this.wall[i];
        // Carrying a pellet out to the mound, it doesn't look for space to fill on the way (it has chosen the mound).
        const look =
          pellet &&
          !this.corpse[i] &&
          map.hasSoil &&
          Number.isNaN(this.spoilTo[i]) &&
          this.since[i] > this.params.backfill.after &&
          this.enteredCell(i);
        const lx = CELL[0];
        const ly = CELL[1];
        if (look && backfill(this, i, lx, ly)) {
          // Dropped its pellet into unused space beside it: the trip is done; turned round, it is asked afresh next tick.
          h += Math.PI;
          this.gx[i] = NO_CELL;
          this.wall[i] = 0;
          this.mx[i] = NaN;
        } else if (look && Number.isNaN(this.spoilTo[i]) && enterStale(this, i, lx, ly)) {
          h = this.towardTarget(i); // into a stale branch, to fill its end
        } else if (this.staleWalk[i] && staleStep(this, i, p.speed * dt)) {
          h = this.towardTarget(i); // on along it
        } else if (side === 0 && !(detouring && this.detour[i] > 0) && walkTunnel(this, i, RETURN, p.speed * dt)) {
          h = this.towardTarget(i); // in a tunnel: back the way it came (a wall it is already following, it keeps following)
        } else if (side === 0) {
          // Free: the home vector, with the home trail as a hint only (climbing it at full rate let
          // clusters of homing ants circle on their own trail). After giving up on a wall, wander a while.
          if (detouring) h += noise * p.wander;
          else if (onTrail) {
            h += choose(tl, tf, tr, p.turnRate * dt * p.homeTrail, p.followChoice || 1, rng) + noise * p.wander * 0.25;
            h = turnToward(h, toNest, p.turnRate * dt * 0.8 * (1 - p.homeTrail));
          } else {
            // Where it believed home was, and nothing there (the side view's drifting vector): search round it.
            // (On one world's plane with loops, within LOOP_AT: at its speed it turns no tighter than ~1.2 cells, and circled
            // a point 1 away until it stalled.)
            if (
              nest !== goal &&
              Math.hypot(nest.x - x, nest.y - y) < (p.searchLoops > 0 && this.line !== null && this.cur === PLANE ? LOOP_AT : 1) &&
              !routeFail(this, i, false)
            )
              searchOn(this, i);
            // On one world's plane, searching (its vector ran out where no hole was) with the home trail under its antennae and
            // its hole not yet in sight (in sight, it steers for the hole itself: review of #60), the trail leads, with the share
            // of its turning a carrier gives a food trail (homeTrail): route cues and scent first, the vector the fallback
            // (docs/trails.md). Led by its loops alone, colonies delivered up to 44 % less food than U3a's in the spike
            // (one-world §4, U3b as built).
            const lead =
              nest !== goal && this.search[i] !== 0 && this.line !== null && this.cur === PLANE && Math.max(hl, hf, hr) >= FAINT
                ? p.homeTrail
                : 0;
            h += climb(hl, hf, hr, p.turnRate * dt * (lead || 0.25)) + noise * p.wander * 0.25;
            h = turnToward(h, toNest, p.turnRate * dt * 0.8 * (1 - lead));
          }
        } else {
          const t0 = this.followT[i];
          const t = t0 + dt;
          this.followT[i] = t;
          if (t0 < FOLLOW_FLIP && t >= FOLLOW_FLIP) {
            // Probably the long way round (a big rock mass, or the map's edge): try the other side, same line home.
            this.wall[i] = -side as -1 | 1;
            this.gdir[i] = (this.gdir[i] + 3) % 6;
            this.gx[i] = NO_CELL; // decide afresh from here
          }
          if (!this.byCell[i]) {
            // In a tunnel now (the ground round it was filled in, or it followed the wall into one): by cell from
            // here. Steering by touch can't walk a passage one cell wide; it turns on the spot until it gives up.
            this.antCell(i);
            if (tunnel(map, CELL[0], CELL[1])) {
              this.byCell[i] = 1;
              this.gx[i] = NO_CELL;
            }
          }
          if (!this.byCell[i]) {
            // Round rock in open ground: steer by touch.
            if (t0 < FOLLOW_FLIP && t >= FOLLOW_FLIP) h += Math.PI;
            const dist = Math.hypot(nest.x - x, nest.y - y);
            if (dist < this.hitDist[i] - 1 && this.onMLine(i, x, y) && !this.touchProbe(x, y, toNest, 1.5)) {
              this.wall[i] = 0; // back on its line home, nearer than where it met this wall, and the way is open
              h = turnToward(h, toNest, p.turnRate * dt * 0.8);
            } else if (t >= FOLLOW_GIVE_UP) this.giveUp(i);
            else {
              // Keep the wall on its side (+1 = right: the ant turns left round it; angles grow clockwise, y down).
              const sd = this.wall[i];
              const ahead = this.touchProbe(x, y, h, 1);
              if (ahead)
                h -= sd * p.turnRate * dt * 2; // wall ahead: turn away
              else if (!this.touchProbe(x, y, h + sd * 0.9, 1.2)) h += sd * p.turnRate * dt; // the wall fell away: hug round the corner
              // Touching nothing, ahead or on the wall side (alarm or a thin rock tip threw it off): the hug
              // would only circle in the open. Let go and walk the home vector; the line home is kept.
              if (ahead || this.touchProbe(x, y, h + sd * (Math.PI / 2), 1.2)) this.untouched[i] = 0;
              else if ((this.untouched[i] = this.untouched[i] + dt) > WALL_LOST) this.wall[i] = 0;
            }
          } else if (t >= FOLLOW_GIVE_UP) this.giveUp(i);
          else {
            // Soil, or a tunnel: cell by cell, a hand on the wall. At each cell's centre, feel round from
            // the hand side to the other (six ways), and take the first open one. In a tunnel this
            // walks the tunnel (steering by touch can't, one cell wide); in a tree of tunnels it visits every branch.
            // A target cell filled since (backfill), or no longer beside it (it was pushed off its cell), is decided
            // afresh too: steering for it would pin the ant against the filled ground between.
            this.antCell(i);
            const lost =
              this.gx[i] !== NO_CELL &&
              (rockAt(map, this.gx[i], this.gy[i]) !== OPEN || hexDistance(this.gx[i], this.gy[i], CELL[0], CELL[1]) > 1);
            const reached =
              this.gx[i] === NO_CELL || lost || Math.hypot(centreX(this.gx[i], this.gy[i]) - x, centreY(this.gy[i]) - y) <= p.speed * dt;
            if (reached) {
              cellOf(x, y);
              // A lost target: the next way is felt from the cell it is in (the wall's first cell stays its first).
              const own = this.gx[i] === NO_CELL || lost;
              const cx = own ? CELL[0] : this.gx[i];
              const cy = own ? CELL[1] : this.gy[i];
              const ox = centreX(cx, cy);
              const oy = centreY(cy);
              const dist = Math.hypot(nest.x - ox, nest.y - oy);
              const open = !this.touchProbe(ox, oy, Math.atan2(nest.y - oy, nest.x - ox), 1.5);
              if (this.gx[i] === NO_CELL) {
                // The first cell of this wall: coming back to it means it has been all the way round.
                this.loopX[i] = cx;
                this.loopY[i] = cy;
              }
              const looped = t > 2 && this.gx[i] !== NO_CELL && cx === this.loopX[i] && cy === this.loopY[i];
              cellOf(this.mx[i], this.my[i]);
              const hit = this.hitDist[i];
              const open2 = open && !this.touchProbe(ox, oy, Math.atan2(nest.y - oy, nest.x - ox), 2);
              // Back on its line home, nearer than the nearest it has been on this trip, with the way open.
              const onLine = dist < hit - 1 && this.onMLine(i, ox, oy, SIDE) && open;
              // Round an island and back where it met it, with the way home open (it met it turning, not heading home).
              const island = t > 2 && cx === CELL[0] && cy === CELL[1] && open;
              // In dug ground, the way home open two cells on and some way nearer than its best this trip.
              const nearer = t > 1 && dist < hit - GAIN && open2;
              // Or, a few times a trip, after 3 s of following wherever the way home is open: a hand on the wall
              // in a dug-out cavern drifts from speck to speck farther from home, and a speck needn't be walked
              // round. Only a few: a release that makes no progress could leave and meet the same wall for ever.
              const anywhere = t > 3 && this.noGain[i] < NO_GAIN && open2;
              const sight = Math.hypot(goal.x - ox, goal.y - oy) < NEST_SIGHT && this.clearTo(ox, oy, goal.x, goal.y);
              const leave = this.gx[i] !== NO_CELL && (onLine || island || nearer || anywhere || sight);
              // Into a tunnel with home scent: the scent leads from here (counted like a release: it may lead
              // back to this same wall, so after a few that gain nothing, only progress lets it go).
              const scent = !leave && (dist < hit - GAIN || this.noGain[i] < NO_GAIN) && tunnel(map, cx, cy) && homeScentNear(this, cx, cy);
              if (looped && !leave && !scent && this.byCell[i]) {
                // All the way round this wall (a speck of soil) and nowhere on it nearer home: it can't be the
                // way. Give up on it now (wander a while, then try afresh) rather than after FOLLOW_GIVE_UP.
                this.giveUp(i);
              } else if (leave || scent) {
                // Progress is kept from wall to wall: the next wall it meets is judged against the nearest it has been
                // (a give-up, which wanders, starts the trip's count afresh). A release that gains nothing counts
                // against the few allowed, an island's too (review of #10: leave, meet the same spot, go round, leave).
                if (dist < hit - GAIN) this.noGain[i] = 0;
                else if (!onLine && !nearer && !sight) this.noGain[i] = this.noGain[i] + 1;
                this.hitDist[i] = Math.min(hit, dist);
              }
              if (leave) {
                // Back on its line home, nearer than where it met this wall, and the way is open; or the nest
                // itself is in plain view.
                this.wall[i] = 0;
                h = turnToward(h, toNest, p.turnRate * dt * 0.8);
              } else if (scent) {
                // Into a tunnel with home scent to lead it: the tunnel walker takes it on from here (see
                // walkTunnel). Not the home vector: from a tunnel it can point into soil, and the blocked
                // step would start a new wall at once, every tick, with the give-up clock at zero (review of #8).
                this.wall[i] = 0;
                this.gx[i] = NO_CELL;
                if (walkTunnel(this, i, RETURN, p.speed * dt)) h = this.towardTarget(i);
              } else if (this.wall[i] !== 0) {
                const d = handOnWall(map, cx, cy, this.gdir[i], this.wall[i]);
                this.gdir[i] = d;
                this.gx[i] = stepX(cx, cy, d);
                this.gy[i] = stepY(cy, d);
              }
            }
            if (this.wall[i] !== 0) h = this.towardTarget(i);
          }
        }
      } else if (mode === FOLLOW && this.staysIn(i)) {
        // An inside worker (zoned by age) doesn't follow a food trail: it leads out, where it may not go. It explores.
        if (walkTunnel(this, i, EXPLORE, p.speed * dt)) h = this.towardTarget(i);
        else h += noise * p.wander;
      } else if (mode === FOLLOW) {
        if (!digging && walkTunnel(this, i, FOLLOW, p.speed * dt)) h = this.towardTarget(i);
        else {
          // "No entry" ahead (behaviour MR 3): the food scent it marks counts for less. Read only where some was laid, and
          // only outside (a top-down map, or the side view's ground), where food trails lead to food.
          const outside = this.entrance === null || !this.under[i];
          let gl = fl;
          let gf = ff;
          let gr = fr;
          if (p.noEntryAvoid > 0 && ph.live("noEntry") && outside) {
            const x = this.x[i];
            const y = this.y[i];
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
          h +=
            (p.followChoice > 0 && this.entrance === null
              ? choose(gl, gf, gr, p.turnRate * dt, p.followChoice, rng)
              : climb(gl, gf, gr, p.turnRate * dt)) +
            noise * p.wander * 0.25;
          // The trail ends here, strong, falling away all round, and no food in sight: the patch is spent. Mark it "no entry" (Robinson et al. 2005).
          if (p.noEntryAvoid > 0 && !carrying && outside && Math.max(fl, ff, fr) < SEEN) {
            this.antCell(i);
            const here = ph.fields.food.get(CELL[0], CELL[1]);
            // Only walking out, by its home vector (home behind it): walking in, the food trail fades ahead as it should.
            const ox = this.x[i] - nest.x;
            const oy = this.y[i] - nest.y;
            const outbound = Math.cos(h) * ox + Math.sin(h) * oy > 0.5 * Math.hypot(ox, oy);
            if (outbound && here >= NO_ENTRY_TRAIL && Math.max(fl, ff, fr) < here * NO_ENTRY_DROP) {
              const lay = resp.noEntry(this.touch(i, toEnemy !== null, mode, item));
              if (lay > 0) {
                this.antCell(i);
                ph.depositCell(
                  "noEntry",
                  CELL[0],
                  CELL[1],
                  p.deposit * (this.entrance === null ? p.foodTrailTop : 1) * lay * dt * NO_ENTRY_RATE,
                );
              }
            }
          }
        }
      } else if (mode === FIGHT) {
        // A calm ant (the fungus's cue) does not charge.
        // A raider in the side view walks on to the raided nest, cell by cell, past the alarm of fights behind it: steering
        // freely up the alarm left raiders in the pits by the rival's mound, 12–13 columns short of its hole (none got in).
        const sideRaid = this.stanceOf(i) === "raid" && this.raidTarget !== null && this.entrance !== null;
        if (toEnemy !== null) h = turnToward(h, toEnemy, p.turnRate * dt * 2 * (1 - this.calm[i]));
        else if (Math.max(al, af, ar) >= FAINT && !sideRaid) h += climb(al, af, ar, p.turnRate * dt);
        else if (sideRaid && ((this.detour[i] = 0), walkTunnel(this, i, FIGHT, p.speed * dt))) h = this.towardTarget(i);
        else if (this.stanceOf(i) === "raid" && this.raidTarget && this.entrance && this.under[i]) {
          // A raider in a chamber (no tunnel: free steering): out of its own nest by its hole, or on into the rival's.
          // Steering straight at the rival's hole through soil left nearly every raider bumping inside its own nest.
          this.antCell(i);
          const own = this.inOwnNest(CELL[0], CELL[1]);
          const aim = own ? this.entrance : (this.raidNest ?? this.raidTarget);
          h = turnToward(h, Math.atan2(aim.y - this.y[i], aim.x - this.x[i]), p.turnRate * dt) + noise * p.wander * 0.25;
        } else if (rgate && this.stanceOf(i) === "raid" && !detouring) {
          // Raiding by trail (behaviour MR 5.2): up the raid trail where there is one; without one, out and away from the home
          // trail, searching (the scouts). No coordinates: the trail runs where a scout walked, so it goes round rock.
          const x = this.x[i];
          const y = this.y[i];
          const d = p.sensorDistance;
          const rl = Math.max(0, ph.read("raid", x + Math.cos(h - a) * d, y + Math.sin(h - a) * d));
          const rf = Math.max(0, ph.read("raid", x + Math.cos(h) * d, y + Math.sin(h) * d));
          const rr = Math.max(0, ph.read("raid", x + Math.cos(h + a) * d, y + Math.sin(h + a) * d));
          const top = Math.max(rl, rf, rr);
          // Nothing ahead as strong as underfoot, facing along the trail (the front sensor strongest): the raider leaves the trail and
          // searches on (raidOnward) as a scout does (a run out, then a search), until home. Mostly near home, where the trail is weak
          // and patchy (review of #44: a median 0.05–0.19 of the way out); gated on a strong end instead, A11 gained less (1.67, 2.01).
          if (p.raidOnward > 0 && rf >= FAINT && rf === top && this.pastEnd[i] === 0 && rf < ph.read("raid", x, y)) this.pastEnd[i] = 1;
          if (top >= FAINT && this.pastEnd[i] === 0) h += climb(rl, rf, rr, p.turnRate * dt) + noise * p.wander * 0.25;
          else if (this.pastEnd[i] === 1 && top >= FAINT) h += avoid(hl, hf, hr, p.turnRate * dt * 0.5) + noise * p.wander * 0.25;
          else h += avoid(hl, hf, hr, p.turnRate * dt * 0.5) + noise * p.wander;
          // One world's plane (U3c): the raided colony's midden marks its ground there too, and raiders shy from it, as the
          // side view's do (Pogonomyrmex badius; slice 7).
          const m = this.raidMarks;
          if (this.line !== null && m?.live("midden")) {
            const read = (b: number) => m.read("midden", x + Math.cos(b) * d, y + Math.sin(b) * d);
            h += avoid(read(h - a), read(h), read(h + a), p.turnRate * dt * MIDDEN_AVOID);
          }
        } else if (!rgate && this.stance === "raid" && this.raidTarget && !detouring) {
          // At the rival hole's coordinates: the side view, or raidGate 0 (review of #41: an ant not recruited, put in FIGHT by Jev's
          // mode lane or a contact, walked here on a top-down map).
          const t = this.raidTarget;
          h = turnToward(h, Math.atan2(t.y - this.y[i], t.x - this.x[i]), p.turnRate * dt * 0.5) + noise * p.wander * 0.25;
          // The rival's midden marks its ground: raiders shy from it (Pogonomyrmex badius; slice 7).
          const m = this.raidMarks;
          if (m) {
            const x = this.x[i];
            const y = this.y[i];
            const d = p.sensorDistance;
            const read = (a: number) => m.read("midden", x + Math.cos(a) * d, y + Math.sin(a) * d);
            h += avoid(read(h - p.sensorAngle), read(h), read(h + p.sensorAngle), p.turnRate * dt * MIDDEN_AVOID);
          }
        } else h += noise * p.wander;
      } else if (!digging) {
        const seen = Math.max(fl, ff, fr) >= SEEN;
        // Food in sight, unless soil stands between (it touched soil a moment ago): then keep a hand on the wall.
        if (seen && !(this.hugT[i] > 0)) h += climb(fl, ff, fr, p.turnRate * dt);
        else if (walkTunnel(this, i, EXPLORE, p.speed * dt)) h = this.towardTarget(i);
        else if (this.queen?.alive && this.band(i) === 0 && this.under[i])
          h = turnToward(h, Math.atan2(this.queen.y - this.y[i], this.queen.x - this.x[i]), p.turnRate * dt * 0.3) + noise * p.wander * 0.5;
        else if (this.entrance && this.outbound(i) && this.under[i])
          h =
            turnToward(h, Math.atan2(this.entrance.y - this.y[i], this.entrance.x - this.x[i]), p.turnRate * dt * 0.5) +
            noise * p.wander * 0.5;
        else if (p.siteFidelity > 0 && this.line !== null && this.cur === PLANE && !Number.isNaN(this.foodX[i]))
          h = turnToward(h, this.siteAim(i), p.turnRate * dt) + noise * p.wander * 0.25;
        else h += noise * p.wander;
      }
      // Fleeing (behaviour MR 4): straight away from the strangers while they are in reach (then it resumes). Homing alone, the
      // fleeing ant often walked along them, or toward them, and died: G′ seed 2, 1,127 of the dead were fleeing.
      if (fleeFrom !== null && (this.entrance === null || !this.under[i])) h = turnToward(h, fleeFrom + Math.PI, p.turnRate * dt * 2);
      // Smelling alarm: the alarmGain response says how hard to shy from it (locally: every mode but fighting, unless digging).
      if (Math.max(al, af, ar) >= FAINT) {
        const gain = resp.alarmGain(this.touch(i, toEnemy !== null, mode, item));
        // On the side view's ground line a carrier can't go round alarm, only turn back: it carries on home through it.
        // Shying, carriers turned back from fights at their own hole and held their food (G seeds 4, 8: raids, 3 held).
        const noWayRound = carrying && this.entrance !== null && !this.under[i];
        if (gain > 0 && !noWayRound) h += avoid(al, af, ar, p.turnRate * p.alarmAvoid * gain * dt);
        // A faint alarm draws it: top-down only. In the side view the drawn explorers crowded the tunnels and the ground
        // line round the nest's fights (G seeds 1–20: 15/20 against 18/20 without the pull).
        else if (gain < 0 && this.entrance === null) h += climb(al, af, ar, p.turnRate * p.alarmDraw * -gain * dt);
      }

      // Lay trail: walking out marks the way home, carrying food marks the way to it; a pellet carrier lays none, and
      // nor does a porter (food moved between chambers is no food to recruit to: its trail drew 4–5× as many ants to
      // follow food scent underground, review of slice 5; it lays its chamber's mark like any ant inside, layMark).
      // The fungus can make it louder or quieter, and have a food carrier leak its food trail into the other colony's
      // field (exact as-is: × 1, nothing leaked).
      // Which trail, and how much, are the trail and trailRate responses.
      const tt = this.touch(i, toEnemy !== null, mode, item);
      const trail = resp.trail(tt);
      if (trail !== "none") {
        const laid =
          p.deposit *
          (trail === "food" && this.entrance === null ? p.foodTrailTop : 1) *
          resp.trailRate(tt) *
          Math.exp(-this.since[i] / p.depositDecay) *
          dt *
          this.layGain[i];
        this.antCell(i);
        ph.depositCell(trail, CELL[0], CELL[1], laid);
        const leak = this.crossLay[i];
        if (carrying && leak > 0 && this.foreign) this.foreign.depositCell("food", CELL[0], CELL[1], laid * leak);
      }

      // A finder lays the raid trail home (behaviour MR 5.2), strongest where it met the strangers, more the more it met.
      if (reporting && rgate) {
        this.antCell(i);
        ph.depositCell(
          "raid",
          CELL[0],
          CELL[1],
          p.deposit * p.raidLay * Math.min(3, 0.5 + this.foes[i]) * Math.exp(-this.since[i] / p.depositDecay) * dt,
        );
      }

      // Waiting at home (behaviour MR 5) it stays in, milling as far as the nest's rim, where foragers come home: past
      // WAIT_RIM of the radius it turns back in. Wandering out of the nest, it was asked its mode, and the mode policy
      // sent it out exploring with nothing coming in; kept to half the radius, it never met a carrier, who puts its food
      // down on reaching the rim, so only scouts went out.
      if (waiting && gate) {
        const dx = home.x - this.x[i];
        const dy = home.y - this.y[i];
        if (dx * dx + dy * dy > WAIT_RIM * WAIT_RIM * home.r * home.r) h = Math.atan2(dy, dx);
      }
      // One world: going in, within the disc round its hole, it makes straight for the hole's cell. Steering for the
      // nest's centre at the turn rate, it circled the hole it was over.
      if (this.inbound(i, mode)) {
        const hc = this.holeCells[p.nest] as HoleCell;
        const dx = centreX(hc.px, hc.py) - this.x[i];
        const dy = centreY(hc.py) - this.y[i];
        if (dx * dx + dy * dy < home.r * home.r) h = Math.atan2(dy, dx);
      }
      // Move; rock or the edge turns the ant back somewhere random.
      // Rounded to float32 first, as stored: checked in float64, 192.999996 is open ground, and stored as
      // 193.0 it would land the ant inside the soil cell beyond, where every step is blocked.
      const nx = Math.fround(this.x[i] + Math.cos(h) * p.speed * dt);
      const ny = Math.fround(this.y[i] + Math.sin(h) * p.speed * dt);
      this.detour[i] = this.detour[i] - dt;
      this.bumps[i] = Math.max(0, this.bumps[i] - dt / 4);
      // The cell the step lands in: open ground (most steps) moves at once, with no more to check.
      cellOf(Math.fround(nx), Math.fround(ny)); // as stored (Float32), so the cached cell is the stored position's
      const lx = CELL[0];
      const ly = CELL[1];
      // One world's curtain: a step up into its surface rows (sky; the side view draws the strip from the plane, it is
      // stored nowhere, one-world §8 item 6) is a crossing, judged below (mayCrossUp), whatever the cell holds.
      const up = map.surfaceRows !== undefined && ly < map.surfaceRows;
      let landOpen = up || rockAt(map, lx, ly) === OPEN;
      if (!landOpen) {
        // A step that stays in the ant's own cell moves even if that cell is solid: a cell filled round an
        // ant (another colony's ant backfilling, its grids a tick old) must not bury it.
        this.antCell(i);
        if (CELL[0] === lx && CELL[1] === ly) landOpen = true;
      }
      let face =
        !landOpen && mode === EXPLORE && !carrying && !pellet
          ? soilFace(map, this.x[i], this.y[i], nx, ny, h, this.gx[i], this.gy[i], this.time, this.params.backfill.hold)
          : NO_FACE;
      if (face === START_FACE) face = digging || (this.digs(i) && rng() < START * (this.crowded() ? 1 : ROOMY_DIG)) ? DIG_FACE : GLANCE;
      // Zoned by age (slice 6): only the middle-aged dig; others meeting a face turn along it.
      else if (face === DIG_FACE && !digging && !this.digs(i)) face = GLANCE;
      // A roomy nest (ja-wii): a tunnel's end met head-on is dug only now and then; turned along the wall otherwise, so the
      // next tick doesn't simply try again.
      else if (face === DIG_FACE && !digging && Number.isNaN(this.digAim[i]) && map.chambers && !this.crowded() && rng() > ROOMY_DIG)
        face = GLANCE; // (an aimed face passed ROOMY_DIG when it was chosen)
      // A chamber face it aimed at (widening a chamber, or a new one off a tunnel): dug whatever the tunnel rules say,
      // but not soil put back moments ago (see refilled: #17's hold on refilled cells).
      if (face !== NO_FACE && this.chamberCell[i] !== NO_KEY && mode === EXPLORE && !carrying && !pellet) {
        cellOf(nx, ny);
        if (
          this.chamberCell[i] === cellKey(CELL[0], CELL[1]) &&
          rockAt(map, CELL[0], CELL[1]) === SOIL &&
          this.digs(i) &&
          this.crowded() &&
          !refilled(map, CELL[0], CELL[1], this.time, this.params.backfill.hold)
        )
          face = DIG_FACE;
      }
      if (face === DIG_FACE && map.sky) {
        cellOf(nx, ny);
        const looseFace = map.loose?.get(CELL[0], CELL[1]) === 1;
        this.antCell(i);
        // Loose soil is picked up only by the rules of pickLoose (spreading, backfill), never dug at head-on: explorers on
        // the ground line chewed the mound and carried it to the hole and out again. (From below it can't be met: the ground
        // under the mound is crust, see crust. Digging it "from below in a quarter of the time" never ran: review of MR 15.)
        if (looseFace || !this.mayDig(CELL[0], CELL[1])) face = GLANCE;
      }
      if (face !== NO_FACE) {
        // Digging: an explorer that meets soil head-on bites at it for DIG_TIME (1–2 s), then the cell
        // is open and the ant carries the pellet home. Any other touch of soil puts a hand on the wall.
        if (face === GLANCE) {
          this.digT[i] = 0; // a face that stopped being diggable (a neighbour dug beside it) is left
          this.digAim[i] = NaN;
          this.hugT[i] = HUG_TIME;
          // Facing along the wall, the soil it touched ahead on its hand side.
          this.gdir[i] = (crossedDir(map, this.x[i], this.y[i], nx, ny) - this.hand[i] + 6) % 6;
          this.gx[i] = NO_CELL;
        } else if (!digging) {
          cellOf(nx, ny);
          this.digT[i] = DIG_TIME * (1 + rng());
        } else {
          const left = this.digT[i] - dt;
          this.digT[i] = Math.max(0, left);
          cellOf(nx, ny);
          const fx = CELL[0];
          const fy = CELL[1];
          if (left <= 0 && crust(this, fx, fy)) {
            // The side view: the ground line's crust is left (see crust); it turns along it instead.
            this.digT[i] = 0;
            this.digAim[i] = NaN;
            this.hugT[i] = HUG_TIME;
            this.gx[i] = NO_CELL;
          } else if (left <= 0 && digCell(map, fx, fy, this.time)) {
            // A chamber face: the cell joins its chamber (or founds a new one, if there is still room for one there).
            if (this.chamberCell[i] === cellKey(fx, fy) && map.chambers) chamberDug(this, i, fx, fy);
            this.chamberCell[i] = NO_KEY;
            // The new cell carries the tunnel's run on: the heading chosen at the end, or the way it was dug.
            const aim = this.digAim[i];
            setTunnelHeading(
              map,
              fx,
              fy,
              Number.isNaN(aim) ? DIR_ANGLE[crossedDir(map, this.x[i], this.y[i], nx, ny)] + gauss(rng) * this.params.tunnelDrift : aim,
            );
            this.digAim[i] = NaN;
            this.soilDug++;
            this.pellet[i] = 1;
            this.since[i] = 0;
            this.lastDug[i] = cellKey(fx, fy);
            this.looked[i] = NO_KEY; // a new trip home: every cell on it is looked round afresh
            this.cameFrom[i] = NO_KEY;
            this.homeAfresh(i); // a fresh trip home: the bumps and detour it ran up exploring the tunnels are behind it
            h += Math.PI;
          }
        }
      } else if (!landOpen) {
        this.digT[i] = 0;
        // Read afresh: a give-up earlier this tick has just started a wander, and must not start a new wall.
        const wandering = this.detour[i] > 0;
        if (mode === RETURN && !wandering && !outward) {
          // Homing: start (or keep) following this wall by touch instead of turning at random.
          const x = this.x[i];
          const y = this.y[i];
          if (this.wall[i] === 0) {
            const toNest = Math.atan2(nest.y - y, nest.x - x);
            // Underground, every wall (soil, or rock in dug ground) is followed cell by cell, and re-anchors the
            // line home: the review of #10 found carriers circling rock specks in caverns by touch for up to
            // 120 s, out of reach of every release the cell-by-cell follower has. On open ground, rock keeps the
            // touch rule. The cell is the landing cell the step was judged on (lx, ly: float32, as stored).
            const cellWall = map.hasSoil || rockAt(map, lx, ly) === SOIL;
            const newTrip = Number.isNaN(this.mx[i]);
            if (newTrip) this.noGain[i] = 0;
            if (newTrip || cellWall) {
              // The first rock this trip: remember where, so the line from here to the nest is the way home it
              // keeps returning to. Walls underground re-anchor it at every wall: in dug ground the ant meets speck
              // after speck, and heading home from wherever it left the last one it is rarely back on the
              // first wall's line, so it would circle a speck until it gave up (review of MR 8).
              this.mx[i] = x;
              this.my[i] = y;
            }
            this.wall[i] = wallSide(this.touchProbe(x, y, toNest - WALL_PROBE, 1.2), this.touchProbe(x, y, toNest + WALL_PROBE, 1.2), rng);
            // Underground, the distance to beat is the nearest it has been this trip (re-anchoring the line at
            // every wall must not forget progress, or it could leave a wall and meet it again for ever).
            const d = Math.hypot(nest.x - x, nest.y - y);
            this.hitDist[i] = cellWall && !newTrip ? Math.min(this.hitDist[i], d) : d;
            // Back on a wall it lost touch with: the clock runs on, or let-go and re-bump would never give up.
            if (!(this.untouched[i] > WALL_LOST)) this.followT[i] = 0;
            this.untouched[i] = 0;
            // Facing the wall it met, turned away from the side it keeps the wall on; the first cell decides the way on.
            this.gdir[i] = (crossedDir(map, x, y, nx, ny) - this.wall[i] + 6) % 6;
            this.gx[i] = NO_CELL;
            cellOf(x, y);
            const hx = CELL[0];
            const hy = CELL[1];
            this.byCell[i] = cellWall || tunnel(map, hx, hy) ? 1 : 0;
          }
          if (!this.byCell[i])
            h -= this.wall[i] * (Math.PI / 2); // by touch: turn away from the wall, along it
          else {
            // By cell and blocked: it stands right on its cell's edge (a straight line from inside a cell to a neighbour's
            // centre never leaves the two), so the way to the next cell grazes the solid one beside it and every step lands
            // there. A quarter of the way back to its own cell's centre takes it off the edge. Not only when it was already
            // following a wall (the first rule): where the wall is let go of before the next step (every tick
            // on the ground line; a release into scent in a tunnel), the ant was blocked the same way every tick, for good
            // (review of #17: about 20 homing ants frozen in the walkway cell above the hole; 21 at one cell in a tunnel on
            // seed 3 with the fixes of PRD §40, before this).
            this.antCell(i);
            this.x[i] = x + (centreX(CELL[0], CELL[1]) - x) * 0.25;
            this.y[i] = y + (centreY(CELL[1]) - y) * 0.25;
          }
        } else {
          h += Math.PI / 2 + rng() * Math.PI;
          // Each bump soon after another doubles the detour: 0.5–1.5 s, then 1–3 s, … up to 8–24 s.
          // Not for a homing ant already on one (after giving up on a wall): in a tunnel it bumps all
          // the time, and topping the detour up would keep it from ever trying for home again.
          this.bumps[i] = Math.min(5, this.bumps[i] + 1);
          if (mode !== RETURN || outward) this.detour[i] = Math.max(this.detour[i], 0.5 * 2 ** Math.floor(this.bumps[i]) * (0.5 + rng()));
          // Carrying out on the plane (U3c): on from here the way it turned, not back into the rock.
          if (outward) this.spoilA[i] = h;
        }
      } else if (up) {
        // One world's curtain: a step up out of a hole (the crust is open nowhere else) is onto the surface, the plane's.
        // Up it goes if it may (mayCrossUp); else it is pointed back down the shaft, as the side view's young are. Either
        // way its step ends here.
        if (this.mayCrossUp(i)) {
          cellOf(x0, y0);
          this.crossUp(i, CELL[0], CELL[1]);
        } else {
          h = this.pointDown(i, x0, y0, h);
          // It has touched the surface, as the side view's young step onto the ground before they are put back: its floor
          // marks start afresh at the next chamber (layMark). Laying on, the young turned back at the hole marked the
          // shaft's top with brood and royal, which drew more young there (toBrood): in the spike up to 13 were held
          // there for minutes.
          this.lastRole[i] = 0;
        }
        this.heading[i] = h;
        continue;
      } else {
        this.digT[i] = 0; // the face it was digging opened (another ant dug it), or it turned off it (its aim stays: it is walking up to the face)
        this.x[i] = nx;
        this.y[i] = ny;
        this.cellX[i] = lx;
        this.cellY[i] = ly;
        this.cellAtX[i] = this.x[i];
        this.cellAtY[i] = this.y[i];
      }

      // Mechanics: pick up food where there is some (not mid-fight), put it down at the nest; the nest rests a tired ant.
      const ndx = this.x[i] - home.x;
      const ndy = this.y[i] - home.y;
      const atNest = ndx * ndx + ndy * ndy < home.r * home.r;
      const ent = this.entrance;
      const atEntrance = ent !== null && Math.hypot(this.x[i] - ent.x, this.y[i] - ent.y) < ent.r;
      this.antCell(i);
      // Activation (behaviour MR 5, docs/activation.md): an empty-jawed ant at home meets each nestmate that comes home
      // with food beside it (its cell and the six round it) once, in a count that leaks away; only successful returns
      // count. Counted as seconds of contact instead, a carrier, which turns round the moment its food is down, was met
      // for a tick: the count stayed under the threshold, and only scouts went out.
      // One world (ja-web): held at the gate, it meets every carrier that came down the hole last tick (holeSeen): each
      // walks down the shaft past all of them. Its count leaks on both layers, so a wait's count fades on its trip out.
      if (leak) {
        let m = this.met[i] * metLeak;
        if (gate ? atNest && !carrying : held) m += gate ? this.returnsAround(CELL[0], CELL[1]) : this.holeSeen;
        this.met[i] = m;
      }
      // How crowded home is (docs/stance.md), felt by a waiting ant: nestmates in its cell and the six round it, but itself.
      // (One world, ja-web: by an ant held at the gate, at the top of its shaft.)
      if (sgate || hold) {
        const c = this.crowd[i];
        this.crowd[i] = (sgate ? atNest && !carrying : held)
          ? c * crowdKeep + (this.nestmatesAround(CELL[0], CELL[1]) - 1) * (1 - crowdKeep)
          : c * crowdKeep;
      }
      // A load just put down here isn't taken straight back up: not until the ant has stepped off the cell.
      const here = cellKey(CELL[0], CELL[1]);
      if (this.putAt[i] !== here) this.putAt[i] = NO_KEY;
      if (
        !carrying &&
        !pellet &&
        this.putAt[i] === NO_KEY &&
        map.food.get(CELL[0], CELL[1]) > 0 &&
        resp.get(this.touch(i, toEnemy !== null, mode, item, "food")) &&
        takeFoodCell(map, CELL[0], CELL[1])
      ) {
        this.carrying[i] = 1;
        this.quality[i] = qualityAt(map, CELL[0], CELL[1]);
        if (p.siteFidelity > 0 && this.line !== null && this.cur === PLANE) this.rememberSite(i);
        this.homeAfresh(i);
        this.since[i] = 0;
        this.fatigue[i] = 0; // found food: the search succeeded
        this.tired[i] = 0;
        h += Math.PI;
      } else if (outward) {
        // One world's plane (U3c): carrying out by its own vector. Spoil is heaped once it believes itself spoilTo from
        // home; a corpse goes on the midden once it is at least that far and off the mound (no spoil underfoot, which it can
        // feel). Either is put down where it stands after its give-up time.
        this.spoilT[i] = this.spoilT[i] + dt;
        const corpse = this.corpse[i] === 1;
        const far = fromHomePlane(this, i) >= this.spoilTo[i] && (!corpse || (map.spoil?.get(CELL[0], CELL[1]) ?? 0) === 0);
        if (far || this.spoilT[i] > (corpse ? CORPSE_GIVE_UP : SPOIL_GIVE_UP)) dropPlane(this, i);
      } else if (pellet && ent && !Number.isNaN(this.spoilTo[i])) {
        // Carrying a pellet out along the ground (side view): dropped where it stands once far enough out (or stuck).
        this.spoilT[i] = this.spoilT[i] + dt;
        const col = CELL[0];
        const onGround = isSky(map, col, CELL[1]);
        if (
          (onGround && this.spoilSide[i] * (col - this.entranceCol) >= this.spoilTo[i]) ||
          this.spoilT[i] > (this.corpse[i] ? CORPSE_GIVE_UP : SPOIL_GIVE_UP)
        )
          dropOut(this, i, col);
        // Dropped, it doesn't turn back: out on the ground, it is asked afresh (most explore it), so the ground near the
        // nest is searched. Turned straight back in, almost nobody was on the ground to find the food there.
      } else if (pellet && atEntrance && this.soil[i] !== SOIL_FILL && this.line !== null) {
        // One world: the spoil (or the dead) goes up the hole onto the plane, where it is put down (crossUp).
        this.crossUp(i, this.entranceCol, this.entranceRow);
        this.heading[i] = h;
        continue;
      } else if (pellet && atEntrance && this.soil[i] !== SOIL_FILL) {
        // Up and out of the hole: it carries the pellet on out along the ground to drop it, farther as the mound grows
        // (MOUND_REACH at most; more of them farther out, √ of a uniform draw), so the mound spreads as a disc, its area
        // tracking the nest's volume (Tschinkel 2015), where you see them drop it.
        const reach = Math.min(MOUND_REACH, 3 + this.heaped / (2 * MOUND_HEIGHT));
        if (this.corpse[i]) {
          // A corpse goes to the midden: one heap just past the mound's edge (harvesters: at the edge of the cleared disc).
          this.spoilTo[i] = this.middenAt();
          this.spoilSide[i] = this.middenSide();
        } else {
          this.spoilTo[i] = 2 + reach * Math.sqrt(rng());
          this.spoilSide[i] = rng() < 0.5 ? -1 : 1;
        }
        this.spoilT[i] = 0;
        this.staleWalk[i] = 0;
        this.wall[i] = 0;
        this.mx[i] = NaN;
        this.gx[i] = NO_CELL;
      } else if (pellet && this.soil[i] === SOIL_FILL && atNest && !(this.line !== null && this.cur === PLANE)) {
        // A loose pellet taken down to fill unused space, and none found on the way: it carries it back out. Most do (over
        // 90 %: PRD §40), and that is the rule as meant: see LOOSE_FILL_PICK.
        this.soil[i] = SOIL_LOOSE;
        this.looseBack++;
        this.wall[i] = 0;
        this.mx[i] = NaN;
      } else if (
        ent &&
        !carrying &&
        !pellet &&
        mode === EXPLORE &&
        isSky(map, CELL[0], CELL[1]) &&
        this.enteredCell(i) &&
        this.pickLoose(i, CELL[0], CELL[1], toEnemy !== null)
      ) {
        // Picked up a loose pellet off the mound (see pickLoose).
      } else if (
        this.line !== null &&
        this.cur === PLANE &&
        !carrying &&
        !pellet &&
        mode === EXPLORE &&
        this.enteredCell(i) &&
        pickPlane(this, i, CELL[0], CELL[1], toEnemy !== null)
      ) {
        // One world's plane: picked up a pellet off the mound (see pickPlane).
      } else if (atNest && !(pellet && ent)) {
        this.wall[i] = 0;
        this.mx[i] = NaN;
        this.untouched[i] = 0;
        this.bestD[i] = Infinity;
        this.stallT[i] = 0;
        if (this.since[i] > 0) this.hand[i] = rng() < 0.5 ? -1 : 1; // just in: the next trip out keeps whichever hand on the walls
        if (carrying && !this.queen && resp.drop(this.touch(i, toEnemy !== null, mode, item))) {
          this.carrying[i] = 0;
          this.stored++;
          this.larder++;
          if (gate) this.returning.set(here, (this.returning.get(here) ?? 0) + 1);
          h += Math.PI;
        } else if (pellet && !ent && this.line === null) {
          // The soil goes on the mound: real ants dump it round the entrance, which is how mounds grow. (One world's plane:
          // spoil is carried out by vector, dropPlane; a pellet going home to backfill goes on down its hole.)
          this.pellet[i] = 0;
          this.soilOut++;
          h += Math.PI;
        }
        this.since[i] = 0;
        // Home and resting in "return" (its policy said so, or a cached answer did: ja-qnx): after REST seconds it is
        // asked afresh as an explorer, once it is no longer tired (fatigue rests it first: ja-q47).
        // (One world's returners on the plane don't rest at the hole: they go in, crossDown.)
        if (
          mode === RETURN &&
          !carrying &&
          !pellet &&
          !this.isTired(i) &&
          !this.inbound(i, mode) &&
          (this.restT[i] = this.restT[i] + dt) > REST &&
          (!gate || ((rolled = true), this.leaves(i, dt, toEnemy !== null)))
        ) {
          this.mode[i] = EXPLORE;
          this.asked[i] = -1;
          this.restT[i] = 0;
        }
      } else this.since[i] = this.since[i] + dt;
      if (!atNest) this.restT[i] = 0;
      // Fatigue (ja-q47, docs/tiredness.md): what makes a forager tired is an unsuccessful search, and rest is a stay
      // inside. It grows only while the ant is out with empty jaws, exploring, following or fighting (a raid or a defence
      // tires it too: with fights left out, nothing sent a fighter home, raids never ended and combat losses rose 56-72 %,
      // review of #36), and falls while it is inside its own nest (its hole on the ground or its tunnels and chambers),
      // a full rest taking restTime. Finding food clears it (above). Digging, carrying spoil or nursing
      // neither tire nor rest it. Before, a timer that only the hole reset made every inside worker "tired".
      {
        const inside = atNest || (ent !== null && this.under[i] === 1 && this.ownNestHere(i));
        // Both run on the ant's clock (the fungus's lever slows tiring and resting alike), and fatigue stops at twice
        // patience, so an ant kept out (by Jev, say) needs no more than twice restTime to rest (review of #36).
        const m = this.mode[i];
        if (inside) this.fatigue[i] = Math.max(0, this.fatigue[i] - ((p.patience / p.restTime) * dt) / this.clock[i]);
        else if (!this.carrying[i] && !this.pellet[i] && !this.broodHeld[i] && (m === EXPLORE || m === FOLLOW || m === FIGHT))
          this.fatigue[i] = Math.min(2 * p.patience, this.fatigue[i] + dt / this.clock[i]);
        // Tired once past patience, and until fully rested: resting only to just under the line sent foragers out to
        // tire again at once (G: up to 8 held, food home -9 %, in the first sweep).
        if (this.fatigue[i] > this.patience(i)) {
          // Tired where it searches round its last find's spot, with nothing found: that spot is spent (ja-lp4.15).
          if (this.tired[i] === 0 && p.siteFidelity > 0 && this.search[i] !== 0 && this.line !== null && this.cur === PLANE)
            this.foodX[i] = this.foodY[i] = NaN;
          this.tired[i] = 1;
        } else if (this.fatigue[i] === 0) this.tired[i] = 0;
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
      // (One world: a returner's trip ends inside, as the side view's does; on the plane it is still going in.)
      if (
        p.arrive !== "return" &&
        this.mode[i] === RETURN &&
        !carrying &&
        !pellet &&
        !nursing &&
        !this.isTired(i) &&
        !this.inbound(i, RETURN) &&
        (ent === null ? atNest : this.under[i] === 1 && this.band(i) === 2 && atHome(this, i)) &&
        (!gate || (!rolled && this.leaves(i, dt, toEnemy !== null)))
      ) {
        // A raid scout starts exploring, not on a food trail (review of #53, N6).
        // `p.follows`: defensive, as at the gated hole (review of #121, N1).
        this.mode[i] = p.arrive === "follow" && p.follows && !this.recruited[i] ? FOLLOW : EXPLORE;
        this.asked[i] = -1;
        this.restT[i] = 0;
      }
      if (ent) {
        // Zoned by age (slice 6): an ant not to go out that has just stepped up out of the hole onto the ground goes
        // back down (carriers aside: soil goes out to the mound; food is on its way in).
        if (this.queen && this.under[i] && !carrying && !pellet && !this.mayGoOut(i)) {
          this.antCell(i);
          if (isSky(map, CELL[0], CELL[1])) h = this.pointDown(i, x0, y0, h);
        }
        integrate(this, i, x0, y0, atNest);
        // Road signs: underground, a strong nest trail where it stands tells it where it is, and its memory's error fades
        // (Heyman et al. 2017; slice 3 gives each chamber its own mark). Outside, the hole's sight and smell do it (believe).
        // Read on the floor where it stands (a road sign is under its antennae; the sensors ahead are often in soil in a tunnel).
        if (
          this.under[i] &&
          (ph.fields.home.get(CELL[0], CELL[1]) * this.gainHome[i] >= STRONG ||
            ph.fields[destMark(this, i)].get(CELL[0], CELL[1]) * this.gainHome[i] * this.gainMarks[i] >= STRONG)
        )
          this.odoNest[i] = this.odoNest[i] * Math.exp(-dt / ROAD_SIGN);
        if (this.map.chambers) this.layMark(i, dt);
        if (this.queen) {
          nurse(this, i, dt, toEnemy !== null);
          if (port(this, i, dt, toEnemy !== null)) h += Math.PI;
          if (this.params.undertakes) undertake(this, i, dt, toEnemy === null);
        }
      }
      // One world: on the plane, at a hole's cell. Its own: in, if it is going in (wantsIn). Another colony's: a raider
      // goes down that shaft (one-world §4). Crossing is where it stands; it reads nothing else.
      if (this.line !== null && this.cur === PLANE) {
        // Path integration on the plane (U3b): it counts its way out, as integrate does on the side view's ground; once it
        // heads home the vector is fixed.
        // Carrying spoil or a corpse out (U3c), it counts too: it is on its way out, and drops by the vector it brought.
        if (this.mode[i] !== RETURN || outward) this.odoSurf[i] = this.odoSurf[i] + Math.hypot(this.x[i] - x0, this.y[i] - y0);
        if (p.routeMemory > 0 && (this.mode[i] === EXPLORE || this.mode[i] === FOLLOW) && !this.carrying[i]) routeRecord(this, i);
        this.antCell(i);
        const k = this.holeAt(CELL[0], CELL[1]);
        if (k >= 0 && (k === p.nest ? this.wantsIn(i, this.mode[i]) : this.mode[i] === FIGHT && this.stanceOf(i) === "raid")) {
          this.crossDown(i, k);
          continue;
        }
      }
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
      if (p.mortalWithoutQueen) this.ageWorkers(dt);
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
