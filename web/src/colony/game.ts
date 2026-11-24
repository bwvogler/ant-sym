import { snapshotAttackCue } from "./attackCue.ts";
import { centreX, centreY, R } from "./hex.ts";
import { around, CountGrid, resolveFights, occupancy, DEFAULT_FIGHT, type FightParams } from "./battle.ts";
import { cellKey as colonyCell, Colony, localPolicy, PLANE, type ColonyParams, type Layer } from "./colony.ts";
import { type Policy, SITUATION_SCHEMA } from "./vocab.ts";
import { generateCurtain, growWorld, mainGround, type OneWorld, type WorldLine } from "./oneWorld.ts";
import { isFed, LARVA, PUPA } from "./brood.ts";
import { DEFAULT_MENU, Fungus, INFECTED, menuFor, type FungusParams } from "./fungus.ts";
import { type BandsSave, driftAim, Recognition, type RecognitionParams } from "./recognition.ts";
import type { Responses } from "./responses.ts";
import { GENERIC_ANT, speciesFollows, type Species } from "./species.ts";
import { clampCol, clampRow, hash01, hash4, mulberry32, qualityLike, rockAt, type Nest, type Rng, type WorldMap } from "./world.ts";
import { type Line, lineSalt, lineSeed, nearestValidIn, type Reserved, type WildSite } from "./lines.ts";
import { cellAt, type Cell, type End, makeTransect, outward, type Transect } from "./transect.ts";
import { cellKey, cellOf, CELL, hexDistance, keyX, keyY } from "./hex.ts";
import { decode, encode, fillLike } from "./save.ts";
import { ALATE_RESERVE, type Flight } from "./royal.ts";
import { seeHoles } from "./layers.ts";
import { DEFAULT_SLEEP, SleepRule, type SleepParams, type SleepState } from "./sleep.ts";
import { stepCrayons, type CrayonLine } from "./builder.ts";
import { aphidOdour, stepAphids, updateAphidOdour, type AphidClump } from "./aphids.ts";
import { CHUNK, CHUNK_BITS, chunkKey, chunkOf, local } from "./chunks.ts";
import { dropClean, isEndless, loadEndless, saveEndless, type EndlessMap } from "./endlessMap.ts";

export { CURTAIN, PLANE } from "./colony.ts";

/** Whether `m` is one world (oneWorld.ts: the plane, the curtain and the line), not a single map. */
export function isOneWorld(m: WorldMap | OneWorld): m is OneWorld {
  return "plane" in m && "curtain" in m && "line" in m;
}

// The game, pure: a list of colonies (ColonySpec; two by default) on one map, sharing its food.
// The player is none of them: the player is the fungus (fungus.ts). The page calls the first two
// by colour, Ink and Amber. Each tick: the colonies move (each seeing the other's
// ants through an enemy grid), then fights are resolved, then — every few
// seconds — it looks for a living rival (whether the colonies may raid, and
// whom). A colony with no ants and too little food for one more is beaten.
// The fungus (the player, fungus.ts) spans every colony, like fights do: after
// fights, load spreads by contact across colonies and is groomed off within them.
// Who fights whom is recognition (recognition.ts): strangers by odour, not by
// colony. When the two nests come to smell alike and nobody has died fighting
// for a minute, the colonies are unified: the fungus's goal.

export interface GameParams {
  /** seconds between looks for a living rival (whether the colonies may raid, and whom) */
  rivalEvery: number;
  fight: FightParams;
  fungus: Partial<FungusParams>;
  recognition: Partial<RecognitionParams>;
  /**
   * Food regrows (the fungus game, ja-lo8.5, owner's choice in PRD §50.5): the food piles the world began with on the
   * ground (the side view's walkway; every pile on a top-down map) grow back toward their first size, a unit at a time,
   * at their deficit ÷ this many seconds each. 0: never (the lab, the goldens and the assays).
   */
  regrow: number;
  /**
   * An alate that flies (ja-lo8.9) founds her colony at once, at the default landing site (Game.landing): the lab, the
   * assays and the tests. The page sets it off: it pauses, shows the queen's pen, and calls found() or lose() itself.
   */
  autoFound: boolean;
  /** The species of every colony in the game (species.ts, docs/species.md): its parameters and local responses. One per game. */
  species: Species;
}

export const DEFAULT_GAME: GameParams = {
  rivalEvery: 5,
  fight: DEFAULT_FIGHT,
  fungus: {},
  recognition: {},
  regrow: 0,
  autoFound: true,
  species: GENERIC_ANT,
};

/**
 * Bump when what a save holds changes: an older save is refused, not misread. 5: one-world saves and the grids (U4b);
 * 6: the gate at the top of the shaft (ja-web: each ant's pass, the carriers down the hole, the raid counters); 7: each
 * searching ant's point in its loops (ja-lp4.11); 8: each ant's remembered food spot (ja-lp4.15); 9: each ant's stored places and retrace state (ja-lp4.16); 10: the species' id (ja-fnd.5.3.3); 11: one wide cellKey for every packed cell (E1.3, ja-qpv.1.3); 12: mass flow's loads, patch sources and hole links, and each tip's idle rounds (ja-tgw9; a 11 save would load with flow on and no patch to feed); 13: the broodOdour channel's field and settings (ja-k4k.15.2; a 12 save has no settings for it and threw on its first tick: review of #192, B1); 14: the rival check's clock is `nextRivalCheck`, and the strategist's fields are gone (S2.3b: a 13 save would load with no clock and never refresh `raidable`); 15: the params no longer carry the pair's three fields, the first colony's count, the rival flag and the rival's count (S4, docs/game-colonies.md: the colonies a game starts with are a list, never saved; a 14 save would bring the three back into `params`); older saves are not read (owner, 2026-11-10: nobody plays the game yet).
 */
export const SAVE_VERSION = 15;

/** The game's parameters as a save holds them: the species is code (functions), so it is left out. */
function withoutSpecies(p: GameParams): Omit<GameParams, "species"> {
  const { species: _code, ...rest } = p;
  return rest;
}

/** Columns from her mother's hole a flown queen lands by default (Game.landing), and at most (the pen's radius). */
export const FLIGHT = { land: 48, radius: 96 };
/**
 * One world (U4a, docs/nest-spacing.md §4): how far a flown queen flies from her mother's hole on the plane (world
 * units), in a direction drawn from the game's stream. 1 U, the gap between mature nests.
 */
export const FLIGHT_2D = 140;
/**
 * One world: how far nearestValid may move a founding to where the founding rule allows it (the founding radius, owner,
 * 2026-11-08, ja-lp4.10): her walk after landing. None within it: the founding fails, and a flown queen is lost.
 */
export const FOUND_RADIUS = 140;
/** Why a founding on the line fails (one world, docs/one-world.md §3): what the game says when a flight is lost for it. */
export const NO_ROOM = "no room beyond the line's ends within her flight";
/**
 * Food in a founding queen's chamber at the most (ja-lo8.9): her body's reserve, for herself and her first brood
 * (claustral founding). A flight founds on her own body (Flight.food), fattened in the nest up to this.
 */
export const FOUNDING_RESERVE = ALATE_RESERVE;
/** Colonies on a map at the most: an alate that flies once there are this many is lost (most founding queens fail). */
export const MAX_COLONIES = 6;

/** A colony added mid-game (Game.addColony): where, how many ants, its odour. */
export interface Founding {
  x: number;
  y: number;
  antCount: number;
  odour: number;
  maxAnts?: number;
  /** a daughter (ja-lo8.9): her mother's colony index; she founds alone on `reserve` food (and carries `fungus`, below) */
  mother?: number;
  reserve?: number;
  /**
   * The fungus the founding queen carries, if any (ja-lo8.9 passes it: she picks it up on her way out). A queen carrying
   * the evolving fungus brings what the landing brought the first colony: it takes root by her new hole (ja-lo8.12), so a
   * colony the world starts with has nothing a founded one can't get.
   */
  fungus?: { load: number; strain: number };
  /**
   * A wild colony woken from its site (Game.wakeSite): the site's lattice cell. A save founds it again from this, so the game knows the site has woken
   * and no longer reserves it.
   */
  wild?: { rx: number; ry: number };
  /**
   * The stream the colony is built from, when it must not depend on the game's: a wild colony's, from its site's hash. Not saved. The colony takes the
   * game's own stream once it is built.
   */
  rng?: () => number;
  /**
   * The nest as dug (Game.addColony records it). A save founds from it rather than digging again: a second dig would
   * draw from the restored game's random stream and could put the shaft elsewhere (PR #42 review, B1).
   */
  nest?: Nest;
  /**
   * One world (U4b): where the founding went, nearestValid's hole on the plane and the end of the line it grew (Game.addColony
   * records it; x and y stay the landing point). A save's re-founding grows the line there again (oneWorld.ts growWorld).
   */
  spot?: {
    end: End;
    cell: Cell;
    /** the line it grew (absent: the first, the only one until the endless world) */
    line?: number;
    /** it began a line of its own along this heading (radians): `line` is that line, made by the founding (Game.addLine) */
    newLine?: { heading: number };
  };
}

/** A saved game (Game.save): JSON. */
export interface GameSave {
  version: number;
  /** the id of the species the game was played with (Species.id): a game built for another is refused (Game.load) */
  species: string;
  time: number;
  landed: unknown;
  regrown: number;
  /** per colony: its queen has been reached (Game.revealed) */
  revealed: boolean[];
  /** colonies added mid-game (Game.addColony), in order */
  founded?: Founding[];
  /** alates flown and not yet founded or lost (Game.flights) */
  flights?: Flight[];
  /** the builder's crayon lines still fading (Game.crayons, builder.ts) */
  crayons?: CrayonLine[];
  /** the builder's aphid clumps still living (Game.aphids, aphids.ts) */
  aphids?: AphidClump[];
  params: unknown;
  map: unknown;
  colonies: Record<string, unknown>[];
  /** each colony's raid target, as a colony index (−1: none) */
  raids: number[];
  fungus: Record<string, unknown>;
  recognition: Record<string, unknown>;
  /**
   * The occupancy grids per layer and colony, and each layer's recognition bands, as the last tick built them (U4b).
   * They were built before that tick's fights and the next tick's steps read them, the ants killed since included: a load
   * that built them again from the living would diverge from a save on a tick with a fight death.
   */
  grids: { counts: number[][][]; bands: BandsSave[] };
  /**
   * One world (U4b): its seed, the line as saved (its holes, V₀'s column and the margin: a check, since load grows the
   * line again from `founded`), and the curtain as dug (its nests aside: the world digs them). `map` is the plane.
   */
  world: {
    seed: number;
    line: { holes: Cell[]; s0: number; margin: number };
    curtain: unknown;
    /** the lines after the first (docs/endless-world.md §8): absent in a game of one line */
    more?: { line: { holes: Cell[]; s0: number; margin: number }; curtain: unknown }[];
  };
  private: {
    fightDeaths: number;
    lastFightDeath: number;
    metBy?: number[];
    haveMet?: boolean;
    nextRivalCheck: number;
    regrowClock: number;
    rng: number | null;
    regrowRng: number | null;
    /** the colonies asleep, by index (Game.freeze); absent when none is */
    frozen?: number[];
    /** the awake rule (Game.enableSleep): its parameters and memory; absent when the game has none */
    sleep?: { params: SleepParams; state: SleepState; next: number };
  };
}

/** Eviction (`Game.evict`): chunks kept round anything awake (ants, the fungus's body, stepped scent), round an awake hole, and chunks dropped a tick. */
const EVICT_NEAR = 3;
const EVICT_HOLE = 5;
const EVICT_PER_TICK = 2;
/** How near two ants must be to be in contact for the awake rule, in steps between hex cells (a few steps of sensing). */
const CONTACT_RANGE = 4;

/** The game's regrowth (GameParams.regrow): a pile eaten bare is half back in about 20 minutes. */
export const GAME_REGROW = 1800;

/**
 * The fungus's game: unified (one colony: the goal), fallen (a colony is gone: the fungus has lost hosts it
 * could have unified, and there is no one left to unify it with), or playing. A colony's win over the other
 * is no win for the fungus.
 */
export type Outcome = "playing" | "unified" | "fallen";

/**
 * One colony the game starts with (docs/game-colonies.md): how many ants, which of the world's start nests, its nest odour, its
 * own params, and how it plays. Runtime only, never saved: a game is rebuilt from its settings (`Game.load` pours state into a
 * game built afresh). The colonies are built in list order, so the random stream is the list's.
 */
export interface ColonySpec {
  /** 0 is buildable */
  antCount: number;
  /** which of its line's curtain's start nests (default: the next one of that line's, in the order of the list) */
  nest?: number;
  /** which line of the world its hole is on (default: the first: a world of one line, the only one until the endless world) */
  line?: number;
  /** its nest odour (default: 0 for one colony, else k / (N - 1): 0 and 1 for two) */
  odour?: number;
  /** its colony params over the species', and over `nest` and `odour` */
  colony?: Partial<ColonyParams>;
  policy?: Policy;
  responses?: Responses;
}

/**
 * The colonies a game starts with when none are named: a pair of 800, as the page's default game is. A world with one start nest
 * builds the first only (a founding makes any more).
 */
export const DEFAULT_COLONIES: readonly ColonySpec[] = [{ antCount: 800 }, { antCount: 800 }];

/**
 * The game's random numbers for a seed: one scheme for the page, the experiments and the side-view scripts, so a
 * number measured offline reproduces on the page with the same seed. `generation` is the page's Restart count.
 */
export function gameRng(seed: number, generation = 0): () => number {
  return mulberry32(seed * 7919 + generation);
}

/** How far the fungus has come toward one colony (docs/fungus-policy.md §1). */
export interface Unity {
  /** distance between the two nests' odours: 1 at the start, under the tolerance when they smell alike */
  gap: number;
  /** fight deaths over about the last minute (a count fading over 60 s) */
  deathsPerMinute: number;
  /** seconds since the last fight death */
  quiet: number;
  /** share of living ants, both colonies, within the tolerance of the other nest's odour */
  mixing: number;
  /**
   * allied contact (ja-i0f): each colony's share of living ants with an ant of another colony in its cell or the six
   * around whose nest it smells like, averaged over about the last minute; the least of the standing colonies' (every
   * one must have met someone). Whether the colonies have met as allies at all.
   */
  met: number;
  /** the nests smell alike (gap within the tolerance): all unity still needs is the meeting and the quiet */
  alike: boolean;
  /** 0..1: how far the nests have come to smell alike, × how long it has been quiet (a minute is whole), × how far they have met (MET is whole) */
  score: number;
  /** the nests smell alike, every colony has met (met ≥ MET, held since unless a fight or drift broke it), and nobody has died fighting for a minute */
  unified: boolean;
}

/** Spores a sporulating host's corpse puts on the midden cell. */
const MIDDEN_SPORES = 3;

/** Seconds without a fight death that unity asks for. */
export const QUIET = 60;

/**
 * The allied contact unity asks for (Unity.met, ja-i0f): this share of living ants, on average over about the last
 * minute, touching ants of another colony whose nest they smell like. Without it a quiet minute between colonies that
 * never met (underground, PRD §22) read as peace. Set by measurement, PRD §53: Garden in both clears it on the open map
 * (3 % at 300 s); the side view's colonies barely touch (≤ 0.34 % in 10 min), a map one world retires (PRD §51). In one
 * world contact is counted per layer, the plane and the curtain (ja-lp4.3).
 */
export const MET = 0.01;

/** The fungus's landing (Game.land) and a queen's founding: this far past the hole (cells, along the ground), a flower of a hex and its six neighbours (radius 1; it was 2, PRD §85), spores over it. */
export const LANDING = { offset: 3, radius: 1, spores: 3 };

/** The app's old spore brush, per paint event (removed, ja-260): radius in cells, spores laid per cell, load dosed into each ant under it. Scripts replay it. */
export const BRUSH = { radius: 3, spores: 2, dose: 0.15 } as const;

/**
 * The colony c would raid, of any number: the nearest (hole to hole, or nest to nest on a top-down map) that is not
 * beaten and does not smell like kin (nest odours more than `tolerance` apart); null if there is none.
 */
export function nearestRival(c: Colony, colonies: readonly Colony[], tolerance: number): Colony | null {
  const at = holeOf(c);
  let target: Colony | null = null;
  let best = Infinity;
  for (const o of colonies) {
    if (o === c || Game.beaten(o) || Math.abs(o.nestOdour - c.nestOdour) <= tolerance) continue;
    const e = holeOf(o);
    const d = Math.hypot(e.x - at.x, e.y - at.y);
    if (d < best) {
      best = d;
      target = o;
    }
  }
  return target;
}

/** Colony c's hole: its entrance in the side view, its nest top-down, and in one world its hole on the plane (layer 0's nest). */
function holeOf(c: Colony): { x: number; y: number } {
  const n = (c.layers[0] as Layer).nest;
  return n.entrance ?? n;
}

/**
 * The index among the plane's nests of the one over curtain nest `nest` of line `wl`: the plane cell at the column of the nest's hole (the same
 * reading as seeHoles'), matched to the plane's nests. Never assumed from the order of the colonies: a line holds the colonies that began on it.
 */
function planeNestOver(plane: WorldMap, wl: WorldLine, nest: number): number {
  const n = wl.curtain.nests[nest];
  if (!n) throw new Error(`the curtain has no nest ${nest}`);
  const e = n.entrance ?? n;
  cellOf(e.x, e.y);
  if (!cellAt(wl.line, CELL[0]!)) throw new Error(`the line has no column ${CELL[0]}`);
  const px = CELL[0]!;
  const py = CELL[1]!;
  const i = plane.nests.findIndex((m) => {
    cellOf(m.x, m.y);
    return CELL[0] === px && CELL[1] === py;
  });
  if (i < 0) throw new Error(`no plane nest over cell ${px},${py}, the hole of curtain nest ${nest}`);
  return i;
}

export class Game {
  /** the plane, the surface (its food piles regrow there, and the fungus lands there) */
  readonly map: WorldMap;
  /** the world: the plane, the curtain under it and the line through the holes (oneWorld.ts) */
  readonly world: OneWorld;
  /**
   * The maps the game is played on, each a layer (ja-lp4.3): the plane (PLANE) and the curtain (CURTAIN). Each layer has
   * its own occupancy grids and recognition: ants meet, fight and pass the fungus on only where they are.
   */
  readonly layers: WorldMap[];
  readonly colonies: Colony[];
  /** the player: spores on the ground and load in the ants of every colony */
  readonly fungus: Fungus;
  /** who is a stranger to whom, by odour: the enemy view every ant and every fight reads (layer 0's; it also steps every colony's odours) */
  readonly recognition: Recognition;
  /** each layer's recognition, built from the ants on it: `recognition` is layer 0's */
  #recs: Recognition[];
  /** the recognition parameters every layer's Recognition is made from (a line that begins mid-game makes one more) */
  #recognition: Partial<RecognitionParams>;
  params: GameParams;
  time = 0;
  /** each layer's occupancy, per colony: [layer][colony] */
  #grids: CountGrid[][];
  /** fight deaths, fading over ~60 s, and when the last one was */
  #fightDeaths = 0;
  #lastFightDeath = 0;
  /** each colony's allied contact, fading over ~60 s (Unity.met is the least of the standing colonies') */
  #metBy: number[] = [];
  /**
   * Unity's latch (review of #56, R2): set once unity holds whole (the nests alike, a quiet minute, every standing colony
   * met: Unity.met ≥ MET), and cleared only by a fight death or the nests drifting apart. Kin forage at home, so contact can fade after
   * the colonies are one; without the latch the outcome would flap and toast each time it came back.
   */
  #haveMet = false;
  /**
   * colony 0's start count: a founder's cap is 1.5 times the larger of it and her own (addColony). From the specs the game was built
   * with, not the saved `params` (a load pours state into a game built afresh, so the two agree for every caller).
   */
  #firstAnts = 0;
  #nextRivalCheck = 0;
  #rng: () => number;
  /** the ground's food piles as the world began (cellKey, units), for regrowth; null when food does not regrow */
  #piles: { cells: Float64Array; full: Float32Array } | null = null;
  /** the chunks of an endless plane whose piles are in `#piles` */
  #pileChunks = new Set<number>();
  /** regrowth's own random numbers: the game's stream is never drawn from for it */
  #regrowRng: Rng | null = null;
  #regrowClock = 0;
  /** food units that have grown back (map.foodTotal grows by it too) */
  regrown = 0;
  /** The builder's crayon lines (builder.ts, ja-kjj8): each kept topped up as it fades; none unless a child drew one. */
  crayons: CrayonLine[] = [];
  /** The builder's aphid clumps (aphids.ts, ja-nzkg.2): each makes honeydew as it grows and crashes; none unless a child put one down. */
  aphids: AphidClump[] = [];
  /** The clumps' odour in the air (aphids.ts, ja-nzkg.3), shared by the colonies; rebuilt each tick from the clumps and the map, not saved. */
  readonly aphidOdour = aphidOdour();
  /**
   * Per colony: the fungus has been in its queen (ja-lo8.7), so its doctrine is open to the player from then on (PRD
   * §50: colony policy is hidden until the fungus infects a queen). Never closes again.
   */
  revealed: boolean[] = [];

  /**
   * A game on one world (docs/one-world.md §2): the plane (layer PLANE) and the curtain (CURTAIN). Every colony's home is
   * the curtain, its nest, queen and brood, where every ant starts; it forages on the plane, and its ants cross between
   * the two at the holes.
   */
  constructor(
    world: OneWorld,
    params: Partial<GameParams> = {},
    rng: () => number = Math.random,
    specs: readonly ColonySpec[] = DEFAULT_COLONIES.slice(0, Math.max(1, world.curtain.nests.length)),
  ) {
    const map = world.plane;
    // The colonies' home map: the curtain, where their nests are.
    this.world = world;
    this.map = map;
    // The game's layers: the plane, then each line's curtain (layer 1 + the line's index).
    this.layers = [world.plane, ...world.lines.map((l) => l.curtain)];
    this.params = { ...DEFAULT_GAME, ...params };
    this.#rng = rng;
    // Fights are judged by the recognition's tolerance: a species' own (the invasive garden ant's one supercolony: ja-e668.3) unless the game
    // names one. Every colony of a game is its species, so the game takes it from there.
    const tol = this.params.species.params.tolerance;
    const recognition = { ...(tol !== undefined ? { tolerance: tol } : {}), ...params.recognition };
    this.#recognition = recognition;
    this.recognition = new Recognition(recognition);
    // Every layer's recognition (one world's curtain too) takes the same tolerance.
    this.#recs = this.layers.map((_, l) => (l === 0 ? this.recognition : new Recognition(recognition)));
    const tolerance = this.recognition.params.tolerance;
    // Each colony starts at its own odour, as far apart as odours go (0 and 1 for two).
    if (specs.length === 0) throw new Error("a game starts with at least one colony");
    // Each colony's line, and its start nest on that line's curtain: the next of the line's, in the order of the list.
    const onLine: number[] = [];
    const slot = specs.map((spec) => {
      const li = spec.line ?? 0;
      if (!world.lines[li]) throw new Error(`a colony is on line ${li}, and the world has ${world.lines.length}`);
      return (onLine[li] = (onLine[li] ?? 0) + 1) - 1;
    });
    onLine.forEach((n, li) => {
      const have = (world.lines[li] as WorldLine).curtain.nests.length;
      if (n > have) throw new Error(`${n} colonies on line ${li}, and it has ${have} start nests (a founding makes any more)`);
    });
    this.#firstAnts = specs[0]!.antCount;
    this.colonies = specs.map((spec, k) => {
      const li = spec.line ?? 0;
      const wl = world.lines[li] as WorldLine;
      const nestIdx = spec.nest ?? slot[k]!;
      const c = new Colony(
        wl.curtain,
        {
          antCount: spec.antCount,
          nest: nestIdx,
          odour: spec.odour ?? (specs.length > 1 ? k / (specs.length - 1) : 0),
          tolerance,
          ...this.#speciesParams(),
          ...spec.colony,
        },
        rng,
        spec.policy ?? this.params.species.policy ?? localPolicy,
        { plane: world.plane, line: wl.line, layer: 1 + li, lineIndex: li, planeNest: planeNestOver(world.plane, wl, nestIdx) },
      );
      c.responses = spec.responses ?? this.params.species.responses;
      this.#ownSituation(c);
      return c;
    });
    this.#grids = this.layers.map(() => this.colonies.map(() => new CountGrid()));
    // Spores on both maps (the plane, layer 0, holds the fungus's public `map` and `spores`).
    this.fungus = new Fungus(this.layers, this.params.fungus);
    // A species whose finders invite starts with rouse on its menu (owner, review of #202 D2).
    if (this.#speciesParams().invitePace ?? 0) this.fungus.menu = menuFor(DEFAULT_MENU, true);
    // A plane tip that comes to a hole crosses down it (ja-2bw.14).
    this.fungus.crossAt = (x, y) => this.#holeAt(x, y);
    // The midden's corpses, for a hypha that reaches one (ja-2bw.7): every colony's, on the plane, where they are buried.
    this.fungus.corpseAt = (layer, x, y) => {
      if (layer !== PLANE) return 0;
      let n = 0;
      for (const c of this.colonies) n += c.midden.get(colonyCell(x, y)) ?? 0;
      return n;
    };
    this.#wire();
    this.#refresh();
    if (this.params.regrow > 0) this.#notePiles();
    // A plane with no edge: a founding far from every hole starts a line of its own, and the wild sites near what is awake are listed (PRD §66 E6.0.3).
    if (isEndless(map)) {
      this.newLines = true;
      this.feedSites();
    }
  }

  /** A colony asks its mode policy about the species' own situation, when its mode words have a schema of their own (ja-fnd.5.10). */
  #ownSituation(c: Colony): void {
    const sp = this.params.species;
    const schema = sp.lanes.mode?.schema;
    if (!schema) return;
    // Its policy sees only its schema's fields (owner, review of #122 D1), so a species that leaves generic fields out brings its own local rule.
    const kept = new Set(schema.fields.map((f) => String(f.name)));
    const dropped = SITUATION_SCHEMA.fields.map((f) => String(f.name)).filter((n) => !kept.has(n));
    if (dropped.length && !sp.policy)
      throw new Error(
        `species "${sp.id}": its situation leaves out ${dropped.join(", ")}, so it needs a local rule of its own (Species.policy)`,
      );
    c.setSituation({ schema, sense: sp.sense });
  }

  /** The species' colony parameters, with whether it follows trails derived from its mode words (ja-fnd.5.9); its own params can still set it. */
  #speciesParams(): Partial<ColonyParams> {
    const sp = this.params.species;
    return { follows: speciesFollows(sp), ...sp.params };
  }

  /** Wire every colony to the game: its grids, burials, enemies, the other nests, its raids. Again whenever a colony is added. */
  #wire(): void {
    this.colonies.forEach((c, k) => {
      // The line as it stands (it grows with every founding), before the holes are read off it.
      c.line = (this.world.lines[c.lineIndex] as WorldLine).line;
      seeHoles(c);
      this.layers.forEach((m, l) => {
        if (m.hasSoil && c.layers[l]) c.wire(l, { friends: (this.#grids[l] as CountGrid[])[k] as CountGrid });
      });
      // Undertakers put the dead on the midden: a host of a strain that sporulates (Bloom) puts spores on the ground there;
      // other strains die with their host (nest slices 7–8).
      // On the layer it is buried on: the midden is on the plane (U3c).
      c.onBury = (d, layer = 0) => {
        if (d.load >= INFECTED && this.fungus.strains[d.strain]?.sporulates)
          this.fungus.paint([], centreX(d.x, d.y), centreY(d.y), 0.6, MIDDEN_SPORES, 0, d.strain, layer);
        // With hyphae, a host that died of the evolving fungus is a new start on the midden (ja-2bw.7).
        if (d.load >= INFECTED && d.strain === this.fungus.evolution?.strain) this.fungus.colonise(layer, d.x, d.y, d.heading);
      };
      // A host that dies of the evolving fungus on the plane, outside, is a new start where it lies (owner,
      // 2026-11-12): no corpse is kept there, and none carried in, so the fungus grows out of it at once.
      c.onDie = (i, layer, x, y) => {
        if (layer === PLANE && c.load[i]! >= INFECTED && c.strain[i] === this.fungus.evolution?.strain)
          this.fungus.colonise(PLANE, x, y, c.heading[i]);
      };
      if (this.colonies.length > 1) {
        this.layers.forEach((_, l) => {
          if (!c.layers[l]) return; // a curtain of another line: this colony is not on it
          c.wire(l, {
            enemies: this.#recs[l] as Recognition,
            nestmates: (this.#grids[l] as CountGrid[])[k] as CountGrid,
            others: this.colonies.filter((o) => o !== c && o.layers[l]).map((o) => (o.layers[l] as Layer).nest),
          });
        });
        this.#aimRaids(k);
      }
    });
  }

  /** The colonies asleep, by index (freeze, docs/endless-world.md §6): not stepped, not met, not read by the fungus. Empty in every game that freezes nothing. */
  #frozen = new Set<number>();

  /**
   * Put colony k to sleep (E4.1): its ants, its scent on every layer and its curtain stop where they are. Its ants leave the occupancy grids and the
   * fights, the recognition and the fungus's reading of ants; a curtain whose colonies are all asleep is not stepped by the fungus (its spores do not
   * fade, its hyphae do not grow). Nothing here decides when: that is the awake rule (E4.2). The camera never freezes anything.
   */
  freeze(k: number): void {
    if (!this.colonies[k]) throw new Error(`freeze: no colony ${k}`);
    this.#frozen.add(k);
    this.#syncFrozen();
    this.#refresh(); // the occupancy and the recognition bands are rebuilt without it now, not at the end of the next tick
    this.#aimAll(); // and the awake raid no one who sleeps
  }

  /** Wake colony k: it steps again from exactly where it stopped. */
  thaw(k: number): void {
    this.#frozen.delete(k);
    this.#syncFrozen();
    this.#refresh(); // its first tick must read grids and bands that count it (else its crowd, one tick, is another colony's)
    this.#aimAll();
  }

  /** Whether colony k is asleep. */
  isFrozen(k: number): boolean {
    return this.#frozen.has(k);
  }

  /** The wild sites that have woken, by "rx,ry": the colony each became (Game.wakeSite). */
  #wild = new Map<string, number>();

  /**
   * Wake a wild site (docs/endless-world.md §4, E4.3): its colony is generated, once, from the site and the world's seed only (never the game's
   * stream: the same site woken in two games is the same colony), on a line of its own along the site's heading. It starts at the size a start colony
   * reaches by about six minutes (measured, scripts/mature-colony.mjs: its cap, 1.5 times the start, with no brood left and its nest dug out); `ants`
   * overrides it (the owner's size, ja-dv98). Its odour is a hash of the site. Waking a site twice gives the colony already woken.
   */
  wakeSite(site: WildSite, opts: { ants?: number } = {}): number {
    const key = `${site.rx},${site.ry}`;
    const woken = this.#wild.get(key);
    if (woken !== undefined) return woken;
    const seed = this.world.seed;
    cellOf(site.x, site.y); // sets CELL: the site's hole cell
    const cell = { x: CELL[0] as number, y: CELL[1] as number };
    const cap = this.params.species.params.maxAnts ?? Math.round(1.5 * this.#firstAnts);
    return this.addColony({
      x: site.x,
      y: site.y,
      antCount: opts.ants ?? cap,
      maxAnts: Math.max(cap, opts.ants ?? 0),
      odour: hash01(seed, 101, site.rx, site.ry),
      wild: { rx: site.rx, ry: site.ry },
      rng: mulberry32(hash4(seed, 102, site.rx, site.ry)),
      spot: { end: "end", cell, line: this.world.lines.length, newLine: { heading: site.heading } },
    });
  }

  /** The awake rule (E4.2), when the game has one: it decides each `every` seconds who sleeps. Off in every game that does not turn it on (the bounded game). */
  #sleep: SleepRule | null = null;
  /** The next time the rule is asked (saved with the rule, so a load asks when the saved game would have). */
  #sleepNext = 0;

  /**
   * Turn the awake rule on (docs/endless-world.md §6): from now on, every `every` seconds the game reads who the fungus is near and who has met whom, asks
   * `SleepRule`, and freezes and thaws what it says. Colonies already asleep stay so until the rule wakes them. The bounded game never calls this.
   */
  enableSleep(params: Partial<SleepParams> = {}): void {
    this.#sleep = new SleepRule(this.colonies.length, params, this.time);
    this.#sleepNext = this.time;
  }

  /** The awake rule, for the page's and the assays' readings (`over`, `params`); null when the game has none. */
  get sleepRule(): SleepRule | null {
    return this.#sleep;
  }

  /**
   * The facts the rule reads, from the game as it stands: where the awake fungus is (its body on the plane, in an awake curtain, and in the ants
   * that carry it), and which awake ants are in sensing range of each other (E4.2, docs/endless-world.md §6). Reads only; each is a world-space
   * test, never the camera.
   */
  #sleepFacts(rule: SleepRule): {
    near: boolean[];
    entered: boolean[];
    holds: boolean[];
    contact: (a: number, b: number) => boolean;
  } {
    const { distance, nestGround } = rule.params;
    const n = this.colonies.length;
    const holes = this.colonies.map((c) => (c.layers[PLANE] as Layer).nest);
    // The plane is never frozen: its body is awake wherever it lies. A curtain's body is awake only while its colonies are.
    const near = this.fungus.bodyNear(PLANE, holes, distance);
    const entered = Array<boolean>(n).fill(false);
    const holds = Array<boolean>(n).fill(false);
    this.colonies.forEach((c, j) => {
      const asleep = this.#frozen.has(j);
      if (c.home !== PLANE && !asleep && this.fungus.bodyOn(c.home)) near[j] = true;
      for (let i = 0; i < c.n; i++) {
        if (!c.alive[i] || (c.load[i] as number) <= 0) continue;
        if (asleep) {
          holds[j] = true;
          continue;
        }
        if (c.layer[i] !== PLANE) continue;
        const x = c.x[i] as number;
        const y = c.y[i] as number;
        for (let k = 0; k < n; k++) {
          const d = Math.hypot(holes[k]!.x - x, holes[k]!.y - y);
          if (d <= distance) near[k] = true;
          if (k !== j && d <= nestGround) entered[k] = true;
        }
      }
      if (asleep && c.home !== PLANE && this.fungus.frozenLayers.has(c.home) && this.fungus.bodyOn(c.home)) holds[j] = true;
    });
    // Contact: an ant of a within CONTACT_RANGE of an ant of b, on any layer, by b's occupancy of the last tick (awake pairs only are asked).
    const contact = (a: number, b: number): boolean => {
      const ca = this.colonies[a] as Colony;
      for (let i = 0; i < ca.n; i++) {
        if (!ca.alive[i]) continue;
        const l = ca.layer[i] as number;
        const grid = (this.#grids[l] as CountGrid[] | undefined)?.[b];
        if (!grid) continue;
        // the ant's hex cell the way occupancy finds it, and b's ants within CONTACT_RANGE steps of it
        const map = this.layers[l] as WorldMap;
        ca.antCell(i);
        if (around(grid, map, clampCol(map, CELL[0]), clampRow(map, CELL[1]), CONTACT_RANGE) > 0) return true;
      }
      return false;
    };
    return { near, entered, holds, contact };
  }

  /**
   * On an endless plane, keep `sites` equal to the wild sites near what is awake (docs/endless-world.md §4, §6; PRD §66 E6.0.3): those in a box of 2 W round
   * every awake colony's hole (a flight lands within 2 U, and the fungus wakes within W) and in the squares of side W, a square each way round, that hold the
   * fungus's body on the plane; sites that have woken are colonies now and are not listed, and a site far from every awake colony and from the body is dropped
   * (it is reserved again when something awake comes near). Pure in what it reads, and the plane's own cache of sites (never the map's chunks: no chunk is
   * generated for it), so it is cheap to run once a second. A bounded game has no sites to feed: nothing happens.
   */
  feedSites(): void {
    const map = this.map;
    if (!isEndless(map)) return;
    const W = this.#sleep?.params.distance ?? DEFAULT_SLEEP.distance;
    const boxes: [number, number, number, number][] = [];
    this.colonies.forEach((c, k) => {
      if (this.#frozen.has(k)) return;
      const h = (c.layers[PLANE] as Layer).nest;
      boxes.push([h.x - 2 * W, h.y - 2 * W, h.x + 2 * W, h.y + 2 * W]);
    });
    for (const [bx, by] of this.fungus.bodyBuckets(PLANE, W)) boxes.push([(bx - 1) * W, (by - 1) * W, (bx + 2) * W, (by + 2) * W]);
    const want = new Map<string, WildSite>();
    for (const b of boxes)
      for (const s of map.plane.sitesIn(b[0], b[1], b[2], b[3])) {
        const key = `${s.rx},${s.ry}`;
        if (!this.#wild.has(key) && !want.has(key)) want.set(key, s);
      }
    this.sites = [...want.values()].sort((a, b) => a.ry - b.ry || a.rx - b.rx);
  }

  /** Whether an endless plane's chunks are made ahead of need (`#prefetchStep`); off, every chunk is made on its first read. Same game either way: tests and the bench turn it off to compare. */
  prefetch = true;
  /** The chunks to make ahead of need, as [cx, cy] pairs in the order to make them, and the next time to plan them again (a pure cache: never saved). */
  #prefetchQueue: [number, number][] = [];
  #prefetchHead = 0;
  #prefetchNext = 0;
  /** The chunks the fungus's body covers, replanned every few seconds (the body grows slowly and reading it costs a pass over its cells). */
  #bodyChunks: [number, number][] = [];
  #bodyNext = 0;

  /**
   * On an endless plane, make the chunks an awake ant, hole, trail or the fungus's body is about to read before they are read (PRD §66 E6.0.4, `ja-qpv.9.1`): a
   * chunk with food patches costs ~70 ms to generate, a tick over 50 ms if a layer read makes it. Once a second the chunks one ring round every occupied chunk
   * (awake ants on the plane, awake holes, the body, scent) are queued; each tick does one step of one of them (the patches of one neighbour, a ~10-80 ms
   * flood, or the chunk itself), so no tick pays for two. An ant walks ~7 cells a second and a chunk is 64, so a ring of one is more than a second's reach; a
   * chunk read before its turn (a flight landing far off, a load, a site woken) is still made on the read, as before: this changes WHEN a chunk is made, never
   * what it holds (generation is pure in (seed, chunk); `EndlessMap.prefetch` touches no layer, total or hook), and sleeping colonies read nothing so ask
   * for nothing. It runs on its own once-a-second cadence, with the awake rule on or not.
   */
  #chunkStep(map: EndlessMap): void {
    if (!this.prefetch && !this.evict) return;
    if (this.time >= this.#prefetchNext) {
      this.#prefetchNext = this.time + 1;
      const occ = this.#occupied();
      if (this.prefetch) this.#planPrefetch(occ);
      if (this.evict) {
        this.#planEvict(map, occ);
        this.#trimScratch();
      }
    }
    if (this.evict) this.#evictStep(map);
    if (!this.prefetch) return;
    while (this.#prefetchHead < this.#prefetchQueue.length) {
      const [cx, cy] = this.#prefetchQueue[this.#prefetchHead] as [number, number];
      if (map.prefetch(cx, cy)) return; // a step of this chunk's work; the next tick takes the next
      this.#prefetchHead++;
    }
  }

  /**
   * The chunks something awake occupies, once a second: `list` the chunks of awake ants on the plane, awake holes, the fungus's body and scent; `scented` the
   * scent's; `holes` the awake holes'. The prefetch rings and the eviction margins are laid round them.
   */
  #occupied(): { list: [number, number][]; scented: [number, number][]; holes: [number, number][] } {
    const centres = new Set<number>();
    const list: [number, number][] = [];
    const holes: [number, number][] = [];
    const add = (cx: number, cy: number): void => {
      const k = chunkKey(cx, cy);
      if (centres.has(k)) return;
      centres.add(k);
      list.push([cx, cy]);
    };
    // Scent: a step of the trails reads the rock of every chunk with scent and its neighbours, and wakes a neighbour the scent spreads into (whose own
    // neighbours it then reads): ring 1 round a scented chunk first, ring 2 after the rest (found: 80 of the ~125 misses of a 300 s game were the trails').
    const scented: [number, number][] = [];
    const seenScent = new Set<number>();
    const scent = (cx: number, cy: number): void => {
      const k = chunkKey(cx, cy);
      if (seenScent.has(k)) return;
      seenScent.add(k);
      scented.push([cx, cy]);
      add(cx, cy);
    };
    this.colonies.forEach((c, k) => {
      if (this.#frozen.has(k)) return;
      const h = (c.layers[PLANE] as Layer).nest;
      cellOf(h.x, h.y);
      add(CELL[0]! >> CHUNK_BITS, CELL[1]! >> CHUNK_BITS);
      holes.push([CELL[0]! >> CHUNK_BITS, CELL[1]! >> CHUNK_BITS]);
      for (let i = 0; i < c.n; i++) {
        if (!c.alive[i] || c.layer[i] !== PLANE) continue;
        cellOf(c.x[i] as number, c.y[i] as number);
        add(CELL[0]! >> CHUNK_BITS, CELL[1]! >> CHUNK_BITS);
      }
      for (const ph of [(c.layers[PLANE] as Layer).ph, c.foreign, c.raidMarks]) if (ph && ph.map === this.map) ph.eachAwakeChunk(scent);
    });
    if (this.time >= this.#bodyNext) {
      this.#bodyNext = this.time + 5;
      this.#bodyChunks = [];
      // a bucket of CHUNK world units: its columns are chunk columns, its rows span chunk rows of CHUNK * R units
      for (const [bx, by] of this.fungus.bodyBuckets(PLANE, CHUNK))
        for (let cy = Math.floor(by / R); cy <= Math.floor((by + 1) / R); cy++) this.#bodyChunks.push([bx, cy]);
    }
    for (const [cx, cy] of this.#bodyChunks) add(cx, cy);
    return { list, scented, holes };
  }

  #planPrefetch({ list, scented }: { list: [number, number][]; scented: [number, number][] }): void {
    const queue: [number, number][] = [];
    const queued = new Set<number>();
    const ring = (cx: number, cy: number, r: number): void => {
      for (let j = -r; j <= r; j++)
        for (let i = -r; i <= r; i++) {
          if (r > 1 && Math.max(Math.abs(i), Math.abs(j)) < r) continue; // ring 2 is the shell only: the inner rings were queued
          const k = chunkKey(cx + i, cy + j);
          if (queued.has(k)) continue;
          queued.add(k);
          queue.push([cx + i, cy + j]);
        }
    };
    for (const [cx, cy] of list) ring(cx, cy, 1);
    for (const [cx, cy] of scented) ring(cx, cy, 2);
    this.#prefetchQueue = queue;
    this.#prefetchHead = 0;
  }

  /**
   * Whether an endless plane's far ground is freed (`#evictStep`; PRD §66 E4.4b, `ja-hacj`): a chunk nothing awake is near and nothing changed is dropped
   * (`dropClean`) and made again, identical, if read. Same game either way, which a test holds; off, every chunk read is kept. A bounded game has no such
   * ground: nothing happens.
   */
  evict = true;
  /** Chunks (as keys) to try dropping, planned once a second, and the next one to take */
  #evictQueue: number[] = [];
  #evictHead = 0;
  /** Chunks `dropClean` refused: a change is a delta, so they stay and are not asked again (a cache: a load clears it) */
  #evictKept = new Set<number>();

  /**
   * Chunks of the map still held that nothing awake is near: not within EVICT_NEAR chunks of an awake ant, the fungus's body, or scent that is stepped (the
   * prefetch rings and a trail's reads are inside that), nor within EVICT_HOLE of an awake hole (a smell's window, W, reaches that far). A frozen colony holds none
   * of them: the ground it sleeps on is made again when it wakes.
   */
  #planEvict(map: EndlessMap, { list, holes }: { list: [number, number][]; holes: [number, number][] }): void {
    const near = new Set<number>();
    const mark = (cx: number, cy: number, m: number): void => {
      for (let j = -m; j <= m; j++) for (let i = -m; i <= m; i++) near.add(chunkKey(cx + i, cy + j));
    };
    for (const [cx, cy] of list) mark(cx, cy, EVICT_NEAR);
    for (const [cx, cy] of holes) mark(cx, cy, EVICT_HOLE);
    const held = new Set<number>();
    const note = (cx: number, cy: number): void => void held.add(chunkKey(cx, cy));
    for (const l of [map.rock, map.food, map.quality, map.digHeading, map.filledAt, map.dugAt]) l.forEach(note);
    const queue: number[] = [];
    for (const k of held) if (!near.has(k) && !this.#evictKept.has(k)) queue.push(k);
    this.#evictQueue = queue;
    this.#evictHead = 0;
  }

  /** Drop a few of the planned chunks (each costs the plane's chunk made again, to compare): the pile cells of those freed leave the regrowth's list. */
  #evictStep(map: EndlessMap): void {
    const freed = new Set<number>();
    for (let n = 0; n < EVICT_PER_TICK && this.#evictHead < this.#evictQueue.length; n++) {
      const k = this.#evictQueue[this.#evictHead++] as number;
      const [cx, cy] = chunkOf(k);
      if (dropClean(map, cx, cy)) freed.add(k);
      else this.#evictKept.add(k);
    }
    if (freed.size) this.#dropPiles(freed);
  }

  /** The pile cells of chunks freed: they were at their first size (a clean chunk), so regrowth skipped them; a chunk made again notes them again (`EndlessMap.regenHooks`). */
  #dropPiles(freed: ReadonlySet<number>): void {
    const piles = this.#piles;
    for (const k of freed) this.#pileChunks.delete(k);
    if (!piles || !piles.cells.length) return;
    const keep: number[] = [];
    for (let i = 0; i < piles.cells.length; i++) {
      const c = piles.cells[i] as number;
      if (!freed.has(chunkKey(keyX(c) >> CHUNK_BITS, keyY(c) >> CHUNK_BITS))) keep.push(i);
    }
    if (keep.length === piles.cells.length) return;
    this.#piles = {
      cells: Float64Array.from(keep, (i) => piles.cells[i] as number),
      full: Float32Array.from(keep, (i) => piles.full[i] as number),
    };
  }

  /** The grids the game and its colonies rebuild every tick free the chunks they hold nothing in: they would keep every chunk anything has walked over. */
  #trimScratch(): void {
    for (const gs of this.#grids) for (const g of gs) g.trim();
    for (const r of this.#recs) r.trim();
    for (const c of this.colonies) c.trimScratch();
    this.fungus.trimScratch();
  }

  /** Ask the awake rule and apply its verdict. */
  #decideSleep(): void {
    const rule = this.#sleep as SleepRule;
    this.#sleepNext = this.time + rule.params.every;
    this.feedSites();
    const facts = this.#sleepFacts(rule);
    const v = rule.step({ time: this.time, asleep: this.colonies.map((_, k) => this.#frozen.has(k)), ...facts });
    for (const k of v.freeze) this.freeze(k);
    for (const k of v.thaw) this.thaw(k);
    this.#wakeSites(rule);
  }

  /**
   * The sites that wake now (docs/endless-world.md §6, E4.3b): one the awake fungus's body has come within W of, or an awake host has entered the nest
   * ground of. A host merely foraging past within W wakes nothing, and nothing but the fungus wakes a site (no ant wakes another, so waking cannot
   * chain). Only sites that carry their lattice cell (`rx`, `ry`) can wake. The woken colony joins the rule awake; the cap, next decision, freezes
   * the lowest-ranked if it is over.
   */
  #wakeSites(rule: SleepRule): void {
    const sites = this.sites.filter((s): s is WildSite => s.rx !== undefined && s.ry !== undefined);
    if (!sites.length) return;
    const { distance, nestGround } = rule.params;
    const woke = this.fungus.bodyNear(PLANE, sites, distance);
    this.colonies.forEach((c, j) => {
      if (this.#frozen.has(j)) return;
      for (let i = 0; i < c.n; i++) {
        if (!c.alive[i] || (c.load[i] as number) <= 0 || c.layer[i] !== PLANE) continue;
        const x = c.x[i] as number;
        const y = c.y[i] as number;
        sites.forEach((s, k) => {
          if (!woke[k] && Math.hypot(s.x - x, s.y - y) <= nestGround) woke[k] = true;
        });
      }
    });
    sites.forEach((s, k) => {
      if (woke[k]) this.wakeSite(s);
    });
  }

  /** The colonies awake, in order: the whole list when none sleeps (the same array, so nothing is copied). */
  #awake(): Colony[] {
    return this.#frozen.size ? this.colonies.filter((_, k) => !this.#frozen.has(k)) : this.colonies;
  }

  /** A per-colony list (a layer's grids) without the sleeping colonies' entries, aligned with `#awake()`. */
  #awakeOf(perColony: CountGrid[]): CountGrid[] {
    return this.#frozen.size ? perColony.filter((_, k) => !this.#frozen.has(k)) : perColony;
  }

  /** The fungus leaves alone a curtain whose colonies are all asleep: the plane is shared, and never is. */
  #syncFrozen(): void {
    const layers = new Set<number>();
    this.layers.forEach((_, l) => {
      if (l === PLANE) return;
      const on = this.colonies.flatMap((c, k) => (c.home === l ? [k] : []));
      if (on.length > 0 && on.every((k) => this.#frozen.has(k))) layers.add(l);
    });
    this.fungus.frozenLayers = layers;
    // The hosts among the sleepers stay counted (their ants do not change while they sleep), so the fungus keeps stepping and wakes them in step.
    let hosts = 0;
    for (const k of this.#frozen) {
      const c = this.colonies[k];
      if (c) for (let i = 0; i < c.n; i++) if (c.alive[i] && (c.load[i] as number) > 0) hosts++;
    }
    this.fungus.hostsAsleep = hosts;
  }

  /** Colonies added mid-game (addColony), in order: a save re-founds them before it restores. */
  founded: Founding[] = [];

  /**
   * Whether a founding far from every hole starts a line of its own (the founding rule's rule 1, lines.ts): off in the bounded game, where a
   * line only grows at its ends; the endless world turns it on (E6).
   */
  newLines = false;
  /** The wild sites' reserved lines, which no founding may come within a unit of or grow across (lines.ts): none in the bounded game. */
  sites: Reserved[] = [];

  /** How every colony's ants draw their mode from Jev's probabilities (the Lab, ja-nan3): set by setChoice, given to colonies founded later too. */
  #choice: Partial<Pick<ColonyParams, "sampleTemp" | "reroll" | "steerLane">> = {};

  /**
   * How every colony's ants draw their mode from Jev's probabilities (ja-nan3): `sampleTemp` and `reroll`
   * (ColonyParams), now on every colony and on every colony founded after. A lab setting, not saved with the game.
   */
  setChoice(choice: Partial<Pick<ColonyParams, "sampleTemp" | "reroll" | "steerLane">>): void {
    this.#choice = { ...choice };
    for (const c of this.colonies) Object.assign(c.params, this.#choice);
  }

  /** Alates that have flown (ja-lo8.9) and wait for the page to found or lose them (GameParams.autoFound off). */
  flights: Flight[] = [];

  /** The last flight whose queen was lost, and why ("no room beyond the line's ends within her flight"): what the page says. */
  lastLoss: { flight: Flight; reason: string } | null = null;

  /**
   * Where a queen flown from colony `mother` lands by default (U4a): FLIGHT_2D from its hole on the plane, in a direction
   * drawn from the game's stream; addColony then moves her to the nearest spot the founding rule allows within
   * FOUND_RADIUS, or she is lost. Null if the colony has no hole.
   */
  landing(mother: number): { x: number; y: number } | null {
    const m = this.colonies[mother];
    const h = m?.holeCells[m.params.nest];
    if (!h) return null;
    const a = this.#rng() * 2 * Math.PI;
    return { x: centreX(h.px, h.py) + FLIGHT_2D * Math.cos(a), y: centreY(h.py) + FLIGHT_2D * Math.sin(a) };
  }

  /**
   * Found flight f's colony with its queen landed at (x, y) (default: landing()): a daughter of its mother (addColony
   * with `mother`). Returns the new colony's index, or −1 when she is lost: no room, MAX_COLONIES already, or f is not
   * a pending flight (already founded or lost: PR #47 review, S2).
   */
  found(f: Flight, at: { x: number; y: number } | null = this.landing(f.mother)): number {
    if (!this.flights.includes(f)) return -1;
    this.#dropFlight(f);
    const mother = this.colonies[f.mother];
    if (!at || !mother || this.colonies.length >= MAX_COLONIES) {
      this.#lost(f, this.colonies.length >= MAX_COLONIES ? `${MAX_COLONIES} colonies already` : "no room to land within her flight");
      return -1;
    }
    // No room for her hole after all (nowhere the founding rule allows within FOUND_RADIUS): she is lost, and the game says why.
    const s = this.settleAt(at);
    if (s.ok === false) {
      this.#lost(f, s.reason);
      return -1;
    }
    // Her reserve is her body (Flight.food), moved into her colony's larder: no food is made or lost (PR #47 review, S1).
    return this.addColony({
      x: at.x,
      y: at.y,
      antCount: 0,
      odour: mother.nestOdour,
      mother: f.mother,
      reserve: f.food,
      spot: { cell: s.cell, end: s.end, line: s.line, ...(s.newLine ? { newLine: s.newLine } : {}) },
      ...(f.load > 0 ? { fungus: { load: f.load, strain: f.strain } } : {}),
    });
  }

  /**
   * Where a founding at plane point p (world units) puts its hole, without founding it: the cell nearest p
   * within FOUND_RADIUS where the founding rule allows a hole (transect.ts nearestValid; rule 4's open ground is the
   * plane's main open ground, oneWorld.ts mainGround: never a pocket sealed off by rock, D1 of #62), with the end of the
   * line it grows; or why not (NO_ROOM). addColony founds where this says, and the queen's pen previews it (U5.2), so the
   * two can't disagree. Pure: it changes nothing. `ground` is mainGround(world), worked out afresh by default (~14 ms on
   * the default plane); a caller asking many times (the pen, under the pointer) passes one it keeps while the line is the
   * same.
   */
  settleAt(
    p: { x: number; y: number },
    ground?: (x: number, y: number) => boolean,
  ): { ok: true; cell: Cell; end: End; line: number; newLine?: { heading: number } } | { ok: false; reason: string } {
    cellOf(p.x, p.y);
    // The founding rule over the world's lines (lines.ts). With new lines off (`newLines`, the bounded game), a game of one line grows its ends exactly as
    // transect.ts nearestValid says. A landing that starts a line gets the index that line will have, `end: "end"` (it has one hole) and its heading,
    // which is drawn from the seed and the landing cell, never from the game's stream.
    const lines: Line[] = this.world.lines.map((l) => ({ transect: l.line, salt: l.salt }));
    const seed = this.world.seed;
    const s = nearestValidIn(
      lines,
      this.sites,
      { x: CELL[0], y: CELL[1] },
      FOUND_RADIUS,
      ground ?? mainGround(this.world),
      (c) => hash01(seed, 100, c.x, c.y) * Math.PI,
      { newLines: this.newLines },
    );
    if (!s) return { ok: false, reason: NO_ROOM };
    return s.founding.kind === "grow"
      ? { ok: true, cell: s.cell, end: s.founding.end, line: s.founding.line }
      : { ok: true, cell: s.cell, end: "end", line: this.world.lines.length, newLine: { heading: s.founding.heading } };
  }

  /**
   * A line that begins mid-game: one hole at plane `cell`, its margins along `heading`, its curtain dug from the line's own seed (the hole's nest is
   * the curtain's first and only), its nest on the plane, and the game's layers in step: the layer, every colony's occupancy on it, its recognition and
   * the fungus's spores and hyphae. Returns the line's index. The colony that lives there is made by addColony.
   */
  #addLine(cell: Cell, heading: number): number {
    const world = this.world;
    const salt = lineSalt(world.seed, cell, false);
    const line = makeTransect([cell], { heading });
    const curtain = generateCurtain(lineSeed(world.seed, salt), line);
    world.lines.push({ line, curtain, salt });
    world.plane.nests.push({ x: centreX(cell.x, cell.y), y: centreY(cell.y), r: 3 });
    this.layers.push(curtain);
    this.#grids.push(this.colonies.map(() => new CountGrid()));
    this.#recs.push(new Recognition(this.#recognition));
    this.fungus.addLayer(curtain);
    return world.lines.length - 1;
  }

  /** Colony k and every colony descended from it (its daughters, theirs, …), by index: k first. */
  lineage(k: number): number[] {
    const own = this.colonies.length - this.founded.length;
    const out = [k];
    this.founded.forEach((f, j) => {
      if (f.mother !== undefined && out.includes(f.mother)) out.push(own + j);
    });
    return out;
  }

  /** Flight f's queen is lost (she dies after the flight, as most do). A flight no longer pending is left as it is. */
  lose(f: Flight): void {
    if (!this.flights.includes(f)) return;
    this.#dropFlight(f);
    this.#lost(f, "lost after her flight");
  }

  /** A lost queen's body leaves the world with her: booked to her mother colony's `eaten`, as food that left its economy. Why is kept (lastLoss). */
  #lost(f: Flight, reason: string): void {
    (this.colonies[f.mother] ?? (this.colonies[0] as Colony)).eaten += f.food;
    this.lastLoss = { flight: f, reason };
  }

  /**
   * Food held in new queens' bodies (ja-lo8.9): alates still in their nests, and flights waiting to found. Out of every
   * larder, not yet eaten: the food books (map + jaws + larders + brood + 4 a birth + eaten) count it too.
   */
  royalFood(): number {
    let s = 0;
    for (const c of this.colonies) for (const a of c.alates) s += a.food;
    for (const f of this.flights) s += f.food;
    return s;
  }

  #dropFlight(f: Flight): void {
    const k = this.flights.indexOf(f);
    if (k >= 0) this.flights.splice(k, 1);
  }

  /**
   * A new colony mid-game (ja-lo8.8; a daughter queen's, ja-lo8.9; U4a, docs/one-world.md §3). (x, y) is a point on the
   * plane: the hole goes at the nearest cell within FOUND_RADIUS where the founding rule allows one (transect.ts
   * nearestValid; on the plane's main open ground, oneWorld.ts mainGround), the world grows there (oneWorld.ts growWorld:
   * the line, the curtain, the nest on both layers), and the colony lives in the curtain with its plane above; none there
   * throws an error saying "no room" (NO_ROOM). It starts with `antCount` workers in the curtain, as every colony's do, and
   * its queen, at odour `odour` (a daughter: her mother's, so the two are kin until they drift). Every colony is wired
   * again: the line, the other nests, raids (kin are not raided), grids. Returns its index.
   */
  addColony(f: Founding): number {
    const k = this.colonies.length;
    const world = this.world;
    let spot: Founding["spot"];
    // A save's re-founding (f.nest) grows the line where the founding went (f.spot), as it was then: no search again.
    if (f.nest && !f.spot) throw new Error("addColony: a save's founding needs its spot");
    if (f.nest || f.spot) {
      // A save's re-founding, or a spot settleAt already gave (found, tryFoundBeyond). The scratch cell is set as settleAt's own first
      // step sets it; nothing reads CELL before writing it, so where settleAt's search would have left it doesn't matter.
      cellOf(f.x, f.y);
      spot = f.spot;
    } else {
      // Where she settles: the same reading the queen's pen previews (settleAt), so the two can't disagree.
      const s = this.settleAt(f);
      if (s.ok === false) throw new Error(`addColony: ${s.reason}`);
      spot = { cell: s.cell, end: s.end, line: s.line, ...(s.newLine ? { newLine: s.newLine } : {}) };
    }
    if (!spot) throw new Error(`addColony: ${NO_ROOM}`);
    if (spot.newLine) {
      // An explicit spot (one settleAt gave and was held across another founding, or made by hand) is checked again: it must still begin the next line,
      // and no line may already have a hole at its cell.
      if (spot.line !== undefined && spot.line !== world.lines.length)
        throw new Error(`addColony: the spot begins line ${spot.line}, and the world's next line is ${world.lines.length}`);
      if (world.lines.some((l) => l.line.holes.some((h) => h.x === spot!.cell.x && h.y === spot!.cell.y)))
        throw new Error(`addColony: a line already has a hole at ${spot.cell.x},${spot.cell.y}`);
    }
    // A landing that begins a line makes the line (its curtain's first nest is the colony's); else the line it grows.
    const li = spot.newLine ? this.#addLine(spot.cell, spot.newLine.heading) : (spot.line ?? 0);
    const wl = world.lines[li] as WorldLine;
    // `at` is the colony's index among its curtain's nests (its line's); its index among the plane's is `k`.
    const at = spot.newLine ? 0 : growWorld(world, spot.end, spot.cell, li);
    // A save's nest is the one dug then (growWorld digs the same one: from the stream keyed by its hole).
    if (f.nest) wl.curtain.nests[at] = { ...f.nest, ...(f.nest.entrance ? { entrance: { ...f.nest.entrance } } : {}) };
    const nest = wl.curtain.nests[at] as Nest;
    const c = new Colony(
      wl.curtain,
      {
        ...this.#speciesParams(),
        antCount: f.antCount,
        maxAnts: f.maxAnts ?? this.params.species.params.maxAnts ?? Math.round(1.5 * Math.max(f.antCount, this.#firstAnts)),
        nest: at,
        odour: f.odour,
        tolerance: this.recognition.params.tolerance,
        ...this.#choice,
      },
      f.rng ?? this.#rng,
      this.params.species.policy ?? localPolicy,
      { plane: world.plane, line: wl.line, layer: 1 + li, lineIndex: li, planeNest: planeNestOver(world.plane, wl, at) },
    );
    if (f.rng) c.rng = this.#rng;
    c.responses = this.params.species.responses;
    this.#ownSituation(c);
    if (f.mother !== undefined && c.queen && !f.nest) {
      // A daughter (ja-lo8.9): her queen founds alone on her reserve, at her mother's odour, which drifts away from it
      // from now on (ja-lo8.9.1); what the fungus put in her is given below (Founding.fungus). (Not when a save founds
      // her again: what she has then is poured back over her, and her chamber isn't there yet.)
      c.founding = true;
      c.incipient = true;
      c.feed(f.reserve ?? FOUNDING_RESERVE);
      c.odourAim = driftAim(f.odour, this.recognition.params.tolerance);
    }
    this.colonies.push(c);
    for (const g of this.#grids) g.push(new CountGrid());
    this.#sleep?.addColony(this.time);
    if (f.wild) {
      this.#wild.set(`${f.wild.rx},${f.wild.ry}`, k);
      this.sites = this.sites.filter((s) => !(s.x === f.x && s.y === f.y)); // it is a real line now, not a reserved one
    }
    const { rng: _rng, ...saved } = f; // the construction stream is not part of the founding
    this.founded.push({
      ...saved,
      spot: {
        end: spot.end,
        cell: { x: spot.cell.x, y: spot.cell.y },
        ...(li ? { line: li } : {}),
        ...(spot.newLine ? { newLine: { heading: spot.newLine.heading } } : {}),
      },
      nest: { ...nest, ...(nest.entrance ? { entrance: { ...nest.entrance } } : {}) },
    });
    this.#wire();
    this.#refresh();
    this.#syncFrozen();
    this.feedSites(); // a new hole reserves the sites round it, with the awake rule on or not (a bounded game: nothing)
    const q = c.queen;
    if (f.fungus && f.fungus.load > 0 && q) {
      q.load = Math.min(1, f.fungus.load);
      q.strain = f.fungus.strain;
      this.fungus.hosts++;
      if (this.fungus.evolution?.strain === f.fungus.strain) {
        const at = this.#byHole(c);
        this.fungus.root(at.x, at.y, LANDING.radius, 0, at.toward);
      }
    }
    return k;
  }

  /**
   * The lab's founding (U4a; the page reaches it from U5): a colony of `antCount` ants at the first
   * colony's odour (kin), founded FLIGHT_2D past the line's `end` hole, straight on along its end segment, moved by
   * addColony to the nearest spot the founding rule allows. Returns its index, or why there is none (NO_ROOM) with the
   * game left as it was: a typed result the lab shows (ja-fnd.6.2), where foundBeyond throws.
   */
  tryFoundBeyond(end: End, antCount = 30): { ok: true; k: number } | { ok: false; reason: string } {
    const holes = this.world.line.holes;
    const v = end === "start" ? holes[0]! : holes[holes.length - 1]!;
    const [ux, uy] = outward(holes, end);
    const at = { x: centreX(v.x, v.y) + FLIGHT_2D * ux, y: centreY(v.y) + FLIGHT_2D * uy };
    const s = this.settleAt(at);
    if (s.ok === false) return s;
    return {
      ok: true,
      k: this.addColony({
        ...at,
        antCount,
        odour: (this.colonies[0] as Colony).nestOdour,
        spot: { cell: s.cell, end: s.end, line: s.line, ...(s.newLine ? { newLine: s.newLine } : {}) },
      }),
    };
  }

  /** tryFoundBeyond, throwing ("addColony: " and the reason) where there is no room: for scripts and tests that expect a colony. */
  foundBeyond(end: End, antCount = 30): number {
    const r = this.tryFoundBeyond(end, antCount);
    if (r.ok === false) throw new Error(`addColony: ${r.reason}`);
    return r.k;
  }

  /** The plane's food piles now (as the world began): the cells with food. */
  #notePiles(): void {
    if (isEndless(this.map)) {
      // No whole-map scan on a plane with no edge: the piles are noted chunk by chunk as the food is generated (PRD §66 E6.0.2), kept in key
      // order (the order the bounded scan finds them in), so which cells regrow does not depend on the order chunks were first made.
      const map = this.map;
      this.#piles = { cells: new Float64Array(0), full: new Float32Array(0) };
      this.#regrowRng = mulberry32(map.seed * 92821 + 17);
      map.foodHooks.push((cx, cy, f) => this.#notePileChunk(cx, cy, f));
      map.regenHooks.push((cx, cy, f) => this.#notePileChunk(cx, cy, f)); // a chunk freed (#evictStep) and made again
      map.food.forEach((cx, cy, a) => this.#notePileChunk(cx, cy, a));
      return;
    }
    const { w, h } = this.map.size;
    const { x0 } = this.map;
    const cells: number[] = [];
    const full: number[] = [];
    for (let y = 0; y < h; y++)
      for (let x = x0; x < x0 + w; x++) {
        const v = this.map.food.get(x, y);
        if (v > 0) {
          cells.push(cellKey(x, y));
          full.push(v);
        }
      }
    this.#piles = { cells: Float64Array.from(cells), full: Float32Array.from(full) };
    this.#regrowRng = mulberry32(this.map.seed * 92821 + 17);
  }

  /** An endless plane's chunk (cx, cy) made, holding food `f`: its pile cells join the regrowth's list, which stays in key order. */
  #notePileChunk(cx: number, cy: number, f: ArrayLike<number>): void {
    const piles = this.#piles;
    if (!piles || this.#pileChunks.has(chunkKey(cx, cy))) return; // a chunk is noted once, however often it is generated again (a load counts them again)
    this.#pileChunks.add(chunkKey(cx, cy));
    const add: number[] = [];
    const addFull: number[] = [];
    for (let ly = 0; ly < CHUNK; ly++)
      for (let lx = 0; lx < CHUNK; lx++) {
        const v = f[local(lx, ly)]!;
        if (v > 0) {
          add.push(cellKey((cx << CHUNK_BITS) + lx, (cy << CHUNK_BITS) + ly));
          addFull.push(v);
        }
      }
    if (!add.length) return;
    const n = piles.cells.length;
    const cells = new Float64Array(n + add.length);
    const full = new Float32Array(n + add.length);
    let a = 0;
    let b = 0;
    for (let o = 0; o < cells.length; o++) {
      if (b >= add.length || (a < n && piles.cells[a]! < add[b]!)) {
        cells[o] = piles.cells[a]!;
        full[o] = piles.full[a++]!;
      } else {
        cells[o] = add[b]!;
        full[o] = addFull[b++]!;
      }
    }
    this.#piles = { cells, full };
  }

  /**
   * With the awake rule on, the pile cells (by index) food regrows in (docs/endless-world.md §6, E4.4): those within W of an awake colony's hole or of
   * the awake fungus's body; elsewhere it waits, with no catch-up owed. Null (every pile) when the game has no rule, so the bounded game regrows as ever.
   * Only the piles short of their size and not built over are looked at: a full pile has nothing to grow.
   */
  #awakeGround(piles: { cells: Float64Array; full: Float32Array }): Set<number> | null {
    if (!this.#sleep) return null;
    const { distance } = this.#sleep.params;
    const holes = this.colonies.flatMap((c, k) => (this.#frozen.has(k) ? [] : [(c.layers[PLANE] as Layer).nest]));
    const short: number[] = [];
    const where: { x: number; y: number }[] = [];
    for (let k = 0; k < piles.cells.length; k++) {
      const x = keyX(piles.cells[k] as number);
      const y = keyY(piles.cells[k] as number);
      if (piles.full[k]! - this.map.food.get(x, y) < 1 || rockAt(this.map, x, y)) continue; // full, or built over: #regrow skips it too
      short.push(k);
      where.push({ x: centreX(x, y), y: centreY(y) });
    }
    const out = new Set<number>();
    const far: number[] = [];
    short.forEach((k, i) => {
      const p = where[i] as { x: number; y: number };
      if (holes.some((h) => Math.hypot(h.x - p.x, h.y - p.y) <= distance)) out.add(k);
      else far.push(i);
    });
    if (far.length) {
      const near = this.fungus.bodyNear(
        PLANE,
        far.map((i) => where[i] as { x: number; y: number }),
        distance,
      );
      far.forEach((i, j) => {
        if (near[j]) out.add(short[i] as number);
      });
    }
    return out;
  }

  /** Once a second: each pile cell short of its first size grows a unit back with chance deficit ÷ regrow. */
  #regrow(dt: number): void {
    const piles = this.#piles;
    if (!piles) return;
    this.#regrowClock += dt;
    if (this.#regrowClock < 1) return;
    const owed = this.#regrowClock;
    this.#regrowClock = 0;
    const rate = owed / this.params.regrow;
    const awake = this.#awakeGround(piles);
    for (let k = 0; k < piles.cells.length; k++) {
      const c = piles.cells[k];
      const x = keyX(c);
      const y = keyY(c);
      const v = this.map.food.get(x, y);
      const short = piles.full[k] - v;
      if (short < 1 || rockAt(this.map, x, y)) continue; // full, or built over (a mound)
      if (awake && !awake.has(k)) continue; // far from everything awake: it waits (E4.4)
      if (this.#regrowRng!() < short * rate) {
        this.map.food.set(x, y, v + 1);
        this.map.foodLeft += 1;
        this.map.foodTotal += 1;
        this.regrown += 1;
      }
    }
  }

  /**
   * Point colony k's raids at the nearest colony that is still its rival (not beaten, not kin by odour), of however many
   * there are; none left, the last target stays (its stance is forage then). In the side view raiders go in at that
   * nest's hole, then down to its chamber, and shy from its midden.
   */
  #aimRaids(k: number): void {
    const c = this.colonies[k] as Colony;
    const target = nearestRival(c, this.#awake(), this.recognition.params.tolerance); // a sleeper has no defenders to raid and no ants to meet
    if (target) this.#aimAt(c, target);
  }

  /** Colony c's raids, and the rival trail its bent ants read, at colony `target`: on each layer, its nest and scent there. */
  #aimAt(c: Colony, target: Colony): void {
    this.layers.forEach((_, l) => {
      if (!c.layers[l] || !target.layers[l]) return; // only where both colonies are: the plane, and a curtain they share
      const { nest: other, ph } = target.layers[l] as Layer;
      c.wire(l, {
        raidTarget: other.entrance ? { x: other.entrance.x, y: other.entrance.y, r: 1.5 } : other, // side view: in at their hole
        raidNest: other.entrance ? other : null, // and then down to their chamber
        raidMarks: ph,
        // Only ants whose perception the fungus has bent read it (Colony.foreignFood): the colony they'd raid, the nearest rival.
        foreign: ph,
      });
    });
  }

  /** Food left on the map, every layer's (the plane's and the curtain's buried food), as each colony counts it. */
  get foodLeft(): number {
    return this.world.lines.reduce((s, l) => s + l.curtain.foodLeft, this.world.plane.foodLeft);
  }

  /** Occupancy per colony, and every ant by odour band, on each layer: built from the ants, never by scanning the map. */
  #refresh(): void {
    const awake = this.#awake();
    this.#grids.forEach((grids, l) => {
      // A colony asleep has no ants anyone can meet: its occupancy is empty.
      this.colonies.forEach((c, k) => (this.#frozen.has(k) ? (grids[k] as CountGrid).reset() : occupancy(c, grids[k] as CountGrid, l)));
      if (this.colonies.length > 1) (this.#recs[l] as Recognition).build(awake, l);
    });
  }

  /** How far the fungus has come toward one colony. With no rival there is nothing to unify. */
  unity(): Unity {
    const deathsPerMinute = this.#fightDeaths;
    const quiet = this.time - this.#lastFightDeath;
    // Every colony still standing (ja-lo8.8: any number of them); with two, as it always was.
    const live = this.colonies.length > 2 ? this.colonies.filter((c) => !Game.beaten(c)) : this.colonies;
    const met = this.#metNow(live);
    if (live.length < 2) return { gap: 0, deathsPerMinute, quiet, mixing: 0, met, alike: false, score: 0, unified: false };
    const tol = this.recognition.params.tolerance;
    // The widest gap between any two nests' odours: one colony when even that is within tolerance.
    let gap = 0;
    for (let a = 0; a < live.length; a++)
      for (let b = a + 1; b < live.length; b++)
        gap = Math.max(gap, Math.abs((live[a] as Colony).nestOdour - (live[b] as Colony).nestOdour));
    // Mixing: each colony's ants within tolerance of another colony's nest odour (with two: the other one).
    let near = 0;
    let living = 0;
    for (const c of live)
      for (let i = 0; i < c.n; i++) {
        if (!c.alive[i]) continue;
        living++;
        const o = c.odour[i];
        if (live.some((other) => other !== c && Math.abs(o - other.nestOdour) <= tol)) near++;
      }
    // With a tolerance of 1 (one supercolony) every gap is within it: recognition is whole.
    const recognition = tol >= 1 ? 1 : Math.min(1, Math.max(0, (1 - gap) / (1 - tol)));
    const unified = gap <= tol && quiet >= QUIET && (met >= MET || this.#haveMet) && live.every((c) => !Game.beaten(c));
    return {
      gap,
      deathsPerMinute,
      quiet,
      mixing: living ? near / living : 0,
      met,
      alike: gap <= tol,
      score: recognition * Math.min(1, quiet / QUIET) * (this.#haveMet ? 1 : Math.min(1, met / MET)),
      unified,
    };
  }

  /** Unity.met: the least allied contact among `live` colonies (each must have met someone; review of #56, R3). */
  #metNow(live: readonly Colony[]): number {
    if (live.length < 2) return 0;
    // A colony with no ants has nobody to meet with: a queen founding alone (ja-lo8.9), or one whose workers have all
    // died while she lives. Unity waits on the colonies that can meet (PR #47 review, N8).
    const meeting = live.filter((c) => c.population > 0);
    if (meeting.length < 2) return 0;
    let m = Infinity;
    for (const c of meeting) m = Math.min(m, this.#metBy[this.colonies.indexOf(c)] ?? 0);
    return m;
  }

  /**
   * Allied contact this tick (Unity.met, ja-i0f), per colony: the share of its living ants with an ant of another
   * standing colony in reach (its cell and the six around, from this tick's occupancy grids) whose nest odour its own
   * is within tolerance of: a meeting, not strangers. Each folded into a ~60 s fading average. Odour against the other
   * nest, as Unity.mixing reads it, not ant against ant as fights do (battle.ts): unity also needs the gap within
   * tolerance and a quiet minute, which mask the difference. Ants killed in this tick's fights are still on the grids
   * (as for grooming), a tick's worth in a minute's average. Reads only: no ant's state or random stream moves.
   */
  #meet(dt: number): void {
    const live: number[] = [];
    this.colonies.forEach((c, k) => {
      if (!Game.beaten(c) && !this.#frozen.has(k)) live.push(k);
    });
    const keep = Math.exp(-dt / QUIET);
    const tol = this.recognition.params.tolerance;
    // Each ant meets the ants on its own layer: its grids and map.
    let l = 0;
    let map = this.layers[0] as WorldMap;
    let gap = 0;
    for (let a = 0; a < live.length; a++)
      for (let b = a + 1; b < live.length; b++)
        gap = Math.max(gap, Math.abs((this.colonies[live[a]] as Colony).nestOdour - (this.colonies[live[b]] as Colony).nestOdour));
    this.colonies.forEach((c, k) => {
      // A sleeper's contact is held, not decayed: unity() still counts it, and it wakes where it stopped. So is an awake colony's while nobody awake
      // is left to meet (its partner sleeps), or unity().met would fall as its own memory decays toward a share of 0.
      if (this.#frozen.has(k) || (this.#frozen.size > 0 && live.length < 2)) return;
      let share = 0;
      if (live.length >= 2 && live.includes(k)) {
        let living = 0;
        let allied = 0;
        for (let i = 0; i < c.n; i++) {
          if (!c.alive[i]) continue;
          living++;
          const o = c.odour[i];
          // Its cell, once an ally is in question (a column can be negative: one world's curtain).
          let placed = false;
          let cx = 0;
          let cy = 0;
          for (const d of live) {
            if (d === k) continue;
            if (Math.abs(o - (this.colonies[d] as Colony).nestOdour) > tol) continue;
            if (!placed) {
              placed = true;
              c.antCell(i);
              l = c.layer[i];
              map = this.layers[l] as WorldMap;
              cx = clampCol(map, CELL[0]);
              cy = clampRow(map, CELL[1]);
            }
            if (around((this.#grids[l] as CountGrid[])[d] as CountGrid, map, cx, cy, 1) > 0) {
              allied++;
              break;
            }
          }
        }
        share = living ? allied / living : 0;
      }
      this.#metBy[k] = (this.#metBy[k] ?? 0) * keep + share * (1 - keep);
    });
    if (live.length < 2 || gap > tol) this.#haveMet = false;
    // Armed only when unity holds whole (the quiet too): contact from before a fight does not re-arm it while the quiet is owed.
    else if (this.time - this.#lastFightDeath >= QUIET && this.#metNow(live.map((k) => this.colonies[k] as Colony)) >= MET)
      this.#haveMet = true;
  }

  tick(dt: number): void {
    this.time += dt;
    if (this.crayons.length) stepCrayons(this, dt);
    if (this.aphids.length || this.aphidOdour.dist) {
      stepAphids(this, dt);
      const layer = PLANE;
      const range = Math.max(0, ...this.colonies.map((c) => c.params.aphidPlume));
      updateAphidOdour(this.aphidOdour, this.aphids, layer, this.layers[layer]!, range);
      this.aphidOdour.clumps = this.aphids;
      for (const c of this.colonies) c.aphidOdour = this.aphidOdour;
    }
    // The colonies asleep (freeze) are not stepped: their ants, scent and curtains stand as they were; no one meets them. With none asleep this is the whole list.
    const awake = this.#awake();
    const attackCue = this.params.fight.intent && this.params.fight.counterattack ? snapshotAttackCue(awake) : undefined;
    for (const c of awake) c.tick(dt, attackCue);
    // Alates that flew this tick (ja-lo8.9): founded at once with autoFound, else held for the page's pen.
    this.colonies.forEach((c, k) => {
      if (!c.flown.length) return;
      for (const a of c.flown) {
        const f: Flight = { mother: k, x: a.x, y: a.y, load: a.load, strain: a.strain, at: this.time, food: a.food };
        this.flights.push(f);
        if (this.params.autoFound) this.found(f);
      }
      c.flown.length = 0;
    });
    const fungal = this.fungus.due(dt);
    // Occupancy is needed every tick with a rival (fights, recognition), underground (crowded digging, backfill), or when the fungus steps.
    if (this.colonies.length > 1 || fungal || this.layers.some((m) => m.hasSoil)) this.#refresh();
    this.#fightDeaths *= Math.exp(-dt / QUIET);
    if (this.colonies.length > 1) {
      // Fights on each layer, among the ants there.
      let died = 0;
      this.#grids.forEach((grids, l) => {
        died += resolveFights(awake, this.#awakeOf(grids), dt, this.#rng, this.params.fight, this.#recs[l] as Recognition, l).reduce(
          (x, y) => x + y,
          0,
        );
      });
      if (died > 0) {
        this.#fightDeaths += died;
        this.#lastFightDeath = this.time;
        this.#haveMet = false;
      }
      // Odours: the gestalt at each nest, and blending where the fungus runs it.
      this.recognition.advance(awake, dt);
      // Whether the colonies meet as allies (unity, ja-i0f): read after odours move, from this tick's occupancy.
      this.#meet(dt);
    }
    // After fights: the dead neither pass load on nor groom (the occupancy grids still count them as groomers for this one step).
    // The fungus steps every few ticks (fungus.ts advance); when it is idle its clock does not run.
    // The midden's spores (nest slices 7–8) are laid as each corpse is buried: see onBury in the constructor.
    if (this.#piles) this.#regrow(dt);
    this.colonies.forEach((c, k) => {
      if (!this.revealed[k] && c.queen && c.queen.load >= INFECTED) this.revealed[k] = true;
    });
    if (this.fungus.active) {
      const recs = this.colonies.length > 1 ? this.#recs : null;
      this.fungus.advanceLayers(awake, this.#frozen.size ? this.#grids.map((gs) => this.#awakeOf(gs)) : this.#grids, dt, recs);
    }
    if (this.#sleep && this.time >= this.#sleepNext) this.#decideSleep();
    if (isEndless(this.map)) this.#chunkStep(this.map);
    if (this.time >= this.#nextRivalCheck) {
      this.#nextRivalCheck = this.time + this.params.rivalEvery;
      this.#aimAll();
    }
  }

  /**
   * Who each colony raids, and whether it has anyone to (the rival check, every `rivalEvery` s, and again when a colony sleeps or wakes): a colony
   * asleep is no rival, so a raid never walks to its empty nest.
   */
  #aimAll(): void {
    this.colonies.forEach((c, k) => {
      if (this.#frozen.has(k)) return;
      // With no living rival there is nothing to defend against or raid: forage, and ask nobody.
      // (Solo, "raid" turned explorers into fighters with no target, and the colony stopped foraging.)
      // A colony whose nest smells like ours is no rival either: kin are not raided (after unification,
      // raiders swarmed the other nest with nobody there to fight).
      const tol = this.recognition.params.tolerance;
      if (!this.colonies.some((o, j) => j !== k && !this.#frozen.has(j) && !Game.beaten(o) && Math.abs(o.nestOdour - c.nestOdour) > tol)) {
        c.raidable = false;
        return;
      }
      c.raidable = true;
      // Raids go to the nearest colony still a rival (one may have fallen, or come to smell like kin).
      this.#aimRaids(k);
    });
  }

  /** Where the fungus landed (Game.land), or null before it has: the fungus game's start (ja-lo8.5). */
  landed: { colony: number; x: number; y: number; at: number } | null = null;

  /**
   * The fungus game's start (ja-lo8.5): the player's fungus falls as a few spores on the ground just outside colony k's
   * hole, where its ants walk out and back. No ant is dosed directly: the first hosts are ants that walk through it.
   * The top-down maps have no hole: it falls at the nest's rim. Lands once; returns where.
   */
  land(
    k: number,
    strain: number,
    { spores = LANDING.spores, evolve = false }: { spores?: number; evolve?: boolean } = {},
  ): { x: number; y: number } {
    if (this.landed) return this.landed;
    const { x, y, toward } = this.#byHole(this.colonies[k] ?? (this.colonies[0] as Colony));
    // The game's fungus starts weak and evolves (ja-lo8.12); a lab or test landing keeps the strain as listed.
    if (evolve) this.fungus.evolve(strain);
    this.fungus.paint(this.#awake(), x, y, LANDING.radius, spores, 0, strain);
    this.fungus.root(x, y, LANDING.radius, 0, toward);
    this.landed = { colony: k, x, y, at: this.time };
    return this.landed;
  }

  /**
   * Where the fungus falls or roots by colony c (ja-2bw.14, owner 2026-11-12): on the plane, the same distance from the
   * hole (the disc's rim and LANDING.offset) but on its inner side, along the line toward the neighbouring hole: the
   * line's margin past an end hole is re-aimed when a colony founds beyond it, the stretch between holes is not. `toward`
   * is the hole, which the patch's first tip heads for (its hyphae reach the curtain by growing down the hole:
   * Fungus.crossAt). A line of one hole has no neighbour: just past the hole's rim, toward nothing.
   */
  #byHole(c: Colony): { x: number; y: number; toward: { x: number; y: number } | null } {
    const nest = (c.layers[PLANE] as Layer).nest;
    const holes = (this.world.lines[c.lineIndex] as WorldLine).line.holes.map((h) => ({ x: centreX(h.x, h.y), y: centreY(h.y) }));
    let i = 0;
    for (let j = 1; j < holes.length; j++)
      if (Math.hypot(holes[j]!.x - nest.x, holes[j]!.y - nest.y) < Math.hypot(holes[i]!.x - nest.x, holes[i]!.y - nest.y)) i = j;
    const other = holes[i + 1] ?? holes[i - 1];
    if (other) {
      const dx = other.x - nest.x;
      const dy = other.y - nest.y;
      const len = Math.hypot(dx, dy) || 1;
      const reach = nest.r + LANDING.offset;
      return { x: nest.x + (dx / len) * reach, y: nest.y + (dy / len) * reach, toward: { x: nest.x, y: nest.y } };
    }
    const e = nest.entrance ?? { x: nest.x + nest.r, y: nest.y };
    return { x: e.x + LANDING.offset, y: e.y - (nest.entrance ? 0.5 : 0), toward: null };
  }

  /** One world: the curtain entrance of the hole whose mouth plane cell (x, y) is in (a colony's plane disc's centre), or null (Fungus.crossAt). */
  #holeAt(x: number, y: number): { x: number; y: number; layer: number } | null {
    for (const c of this.colonies) {
      const plane = c.layers[PLANE] as Layer | undefined;
      const down = (c.layers[c.home] as Layer | undefined)?.nest.entrance;
      if (!plane || !down) continue;
      cellOf(plane.nest.x, plane.nest.y);
      // The hole's mouth: its disc (the colony's ground round the hole on the plane), where the ground runs down into the
      // shaft. A tip set off toward the hole passes within a cell or two of it, not through it.
      if (hexDistance(x, y, CELL[0], CELL[1]) <= Math.round(plane.nest.r)) return { x: down.x, y: down.y, layer: c.home };
    }
    return null;
  }

  /**
   * Spores on the ground within `radius` of (x, y), and a dose of load into every ant there, of any colony: the old
   * spore brush (BRUSH), for tests and scripts. The app has no brush (ja-260): every game lands an evolving fungus, and
   * a free stroke would skip its progression. In one world on map `layer` (PLANE, the default, or CURTAIN), dosing only
   * the ants on it.
   */
  paintSpores(x: number, y: number, radius: number, spores: number, dose: number, strain: number, layer = 0): void {
    this.fungus.paint(this.#awake(), x, y, radius, spores, dose, strain, layer); // a sleeper's ants are not dosed: they stand as they were
  }

  /**
   * Beaten: no ants left and too little food in the larder for one more. In the side view (nest slice 4) ants come
   * only from brood: no workers and no pupa or fully fed larva left (eggs and hungry larvae need nurses), whatever the queen or the larder.
   */
  static beaten(c: Colony): boolean {
    if (c.queen)
      return (
        !(c.founding && c.queen.alive) &&
        c.population === 0 &&
        !c.brood.items.some((b) => b.stage === PUPA || (b.stage === LARVA && isFed(b)))
      );
    return c.population === 0 && c.larder < c.params.foodPerAnt;
  }

  /**
   * The first of the world's own colonies that is beaten, by index, or −1. A colony founded mid-game (addColony) can
   * fall without ending the game (PR #42 review: a 30-ant colony from the lab ended it).
   */
  fallen(): number {
    const own = this.colonies.length - this.founded.length;
    return this.colonies.findIndex((c, k) => k < own && Game.beaten(c));
  }

  outcome(): Outcome {
    if (this.fallen() >= 0) return "fallen";
    // One colony is the world's own colonies made one (daughters count once there are two: they must be held too); a
    // solo world with a kin daughter is not a unification (ja-lo8.9).
    return this.colonies.length - this.founded.length > 1 && this.unity().unified ? "unified" : "playing";
  }

  // ——— saving (save.ts, ja-lo8.6) ———

  /**
   * The whole game as JSON: the map as dug and eaten, every colony, the fungus, recognition, the game's clocks and its
   * random streams. `load` puts it back into a game built afresh from the same world and settings (the page's
   * ui/saves.ts keeps the seed, view and settings beside it).
   */
  save(): GameSave {
    // A map without its nests: the world (or a re-founding) makes them.
    const bare = (m: WorldMap) => Object.fromEntries(Object.entries(m).filter(([k]) => k !== "nests" && k !== "nest"));
    const map = bare(this.map);
    const world = this.world;
    return {
      version: SAVE_VERSION,
      species: this.params.species.id,
      time: this.time,
      landed: encode(this.landed),
      regrown: this.regrown,
      revealed: [...this.revealed],
      founded: this.founded.map((f) => JSON.parse(JSON.stringify(f)) as Founding),
      flights: this.flights.map((f) => ({ ...f })),
      crayons: this.crayons.map((l) => ({ ...l, cells: [...l.cells] })),
      ...(this.aphids.length ? { aphids: this.aphids.map((a) => ({ ...a, cells: [...a.cells] })) } : {}),
      // The species is code (functions), not data: the save leaves it out (docs/species.md step 3 saves its id) and a load keeps the game's own.
      params: encode(withoutSpecies(this.params)),
      // An endless plane saves the seed and what changed, never the plane (endlessMap.ts saveEndless).
      map: isEndless(this.map) ? saveEndless(this.map) : encode(map),
      colonies: this.colonies.map((c) => c.saveState()),
      raids: this.colonies.map((c) => this.colonies.findIndex((o) => o.ph === c.raidMarks)),
      fungus: this.fungus.saveState(),
      recognition: this.recognition.saveState(),
      grids: { counts: this.#grids.map((gs) => gs.map((g) => g.saveState())), bands: this.#recs.map((r) => r.saveBands()) },
      world: {
        seed: world.seed,
        line: { holes: world.line.holes.map((c) => ({ x: c.x, y: c.y })), s0: world.line.sHole[0], margin: world.line.margin },
        curtain: encode(bare(world.curtain)),
        // The lines after the first, each as the first is (holes, V₀'s column, margin, and its curtain as dug): a game of one line saves exactly as it always has.
        ...(world.lines.length > 1
          ? {
              more: world.lines.slice(1).map((l) => ({
                line: { holes: l.line.holes.map((c) => ({ x: c.x, y: c.y })), s0: l.line.sHole[0]!, margin: l.line.margin },
                curtain: encode(bare(l.curtain)),
              })),
            }
          : {}),
      },
      private: {
        fightDeaths: this.#fightDeaths,
        lastFightDeath: this.#lastFightDeath,
        metBy: [...this.#metBy],
        haveMet: this.#haveMet,
        nextRivalCheck: this.#nextRivalCheck,
        regrowClock: this.#regrowClock,
        rng: (this.#rng as Partial<Rng>).state ?? null,
        regrowRng: this.#regrowRng?.state ?? null,
        // Only when a colony sleeps: a game that freezes nothing saves as it always has.
        ...(this.#frozen.size ? { frozen: [...this.#frozen].sort((a, b) => a - b) } : {}),
        ...(this.#sleep ? { sleep: { params: this.#sleep.params, state: this.#sleep.saveState(), next: this.#sleepNext } } : {}),
      },
    };
  }

  /**
   * A save back into this game, built afresh from the same world and settings (Game.save; U4b): built from the same
   * seed and generateOneWorld options; the foundings grow the line again where they went, then the plane and
   * the curtain as dug are poured over it.
   */
  load(saved: GameSave): void {
    if (saved.version !== SAVE_VERSION) throw new Error(`save: version ${saved.version}, this game reads ${SAVE_VERSION}`);
    if (saved.species !== this.params.species.id)
      throw new Error(`save: a save of species "${saved.species}", and this game plays "${this.params.species.id}"`);
    const world = this.world;
    const sw = saved.world;
    if (!sw) throw new Error("save: a save of a game on one map, and this game is one world");
    // An endless plane has no size to match: its save is the seed and what changed (a bounded save of another size is still refused, and so is one of the other kind).
    const endless = isEndless(this.map);
    const savedEndless = (saved.map as { endless?: unknown }).endless === true;
    if (endless !== savedEndless)
      throw new Error(
        `save: a save of ${savedEndless ? "an endless" : "a bounded"} plane, and this game's is ${endless ? "endless" : "bounded"}`,
      );
    const size = (saved.map as { size?: { w: number; h: number } }).size;
    if (sw.seed !== world.seed || (!endless && (size?.w !== this.map.size.w || size?.h !== this.map.size.h)))
      throw new Error(
        `save: another world (seed ${sw.seed}, plane ${size?.w} × ${size?.h}; this game's: seed ${world.seed}, ${this.map.size.w} × ${this.map.size.h})`,
      );
    // What the replay of the foundings would make, checked before it starts (ja-baxa): a save of more lines or colonies than this game can grow to is refused
    // with this game as it was. (A refusal after the replay, below, a line whose holes were moved, still leaves the foundings made: a failed load of that kind
    // voids the game, and the page drops it. The shape checks below the replay are now reachable only if the replay makes other lines or colonies than the
    // save's foundings say, which the checks above rule out.)
    const founded = saved.founded ?? [];
    const willHave = world.lines.length + founded.filter((f) => f.spot?.newLine).length;
    if (willHave !== 1 + (sw.more ?? []).length)
      throw new Error(`save: ${1 + (sw.more ?? []).length} lines, this game's world has ${willHave}`);
    if (saved.colonies.length !== this.colonies.length + founded.length)
      throw new Error(`save: ${saved.colonies.length} colonies, this game has ${this.colonies.length + founded.length}`);
    // The grids and bands are a layer each (the plane, and one curtain a line) of one grid a colony: their shape is known before the replay, so a save whose
    // grids are another game's is refused with this game as it was.
    const sg = saved.grids;
    if (
      sg.counts.length !== 1 + willHave ||
      sg.bands.length !== 1 + willHave ||
      sg.counts.some((gs) => gs.length !== saved.colonies.length)
    )
      throw new Error("save: its grids are another game's");
    // Colonies founded mid-game first, as they were: then everything (the map as dug among it) is poured back over them.
    for (const f of founded) this.addColony(f);
    // The line grown again must be the one saved: else the curtain poured below would lie under another line.
    const line = world.line;
    const sameLine = (t: Transect, sl: { holes: Cell[]; s0: number; margin: number }): boolean =>
      t.holes.length === sl.holes.length &&
      t.holes.every((c, k) => c.x === sl.holes[k]?.x && c.y === sl.holes[k]?.y) &&
      t.sHole[0] === sl.s0 &&
      t.margin === sl.margin;
    if (!sameLine(line, sw.line)) throw new Error("save: another world's line");
    // The lines a founding began are made again by the foundings above (a line that began is a spot with `newLine`); they must be the ones saved.
    const more = sw.more ?? [];
    if (world.lines.length !== 1 + more.length)
      throw new Error(`save: ${1 + more.length} lines, this game's world has ${world.lines.length}`);
    more.forEach((m, k) => {
      if (!sameLine((world.lines[k + 1] as WorldLine).line, m.line)) throw new Error(`save: another world's line ${k + 1}`);
    });
    if (saved.colonies.length !== this.colonies.length)
      throw new Error(`save: ${saved.colonies.length} colonies, this game has ${this.colonies.length}`);
    this.time = saved.time;
    this.landed = decode(saved.landed) as Game["landed"];
    this.regrown = saved.regrown;
    this.revealed = [...(saved.revealed ?? [])];
    this.flights = (saved.flights ?? []).map((f) => ({ ...f }));
    this.crayons = (saved.crayons ?? []).map((l) => ({ ...l, cells: [...l.cells] }));
    this.aphids = (saved.aphids ?? []).map((a) => ({ ...a, cells: [...a.cells] }));
    this.params = { ...(decode(saved.params) as GameParams), species: this.params.species };
    if (isEndless(this.map)) loadEndless(this.map, saved.map as Record<string, unknown>);
    else {
      qualityLike(this.map, saved.map);
      fillLike(this.map, saved.map);
    }
    qualityLike(world.curtain, sw.curtain);
    fillLike(world.curtain, sw.curtain);
    more.forEach((m, k) => {
      const curtain = (world.lines[k + 1] as WorldLine).curtain;
      qualityLike(curtain, m.curtain);
      fillLike(curtain, m.curtain);
    });
    this.colonies.forEach((c, k) => c.loadState(saved.colonies[k] as Record<string, unknown>));
    this.colonies.forEach((c, k) => {
      const t = this.colonies[saved.raids[k] ?? -1];
      if (t) this.#aimAt(c, t);
    });
    this.fungus.loadState(saved.fungus);
    this.recognition.loadState(saved.recognition);
    const p = saved.private;
    this.#fightDeaths = p.fightDeaths;
    this.#lastFightDeath = p.lastFightDeath;
    // Saves before ja-i0f carry no contact: the colonies must meet again (MET over the fading minute) before they can be one.
    this.#metBy = [...(p.metBy ?? [])];
    this.#haveMet = p.haveMet ?? false;
    this.#nextRivalCheck = p.nextRivalCheck;
    this.#regrowClock = p.regrowClock;
    if (p.rng !== null && "state" in this.#rng) (this.#rng as Rng).state = p.rng;
    if (p.regrowRng !== null && this.#regrowRng) this.#regrowRng.state = p.regrowRng;
    this.#frozen = new Set(p.frozen ?? []);
    this.#syncFrozen();
    this.#sleep = null;
    if (p.sleep) {
      this.#sleep = new SleepRule(0, p.sleep.params);
      this.#sleep.loadState(p.sleep.state);
    }
    this.#sleepNext = p.sleep?.next ?? 0;
    // The grids and bands as the save's last tick built them (GameSave.grids), never built again from the living.
    const grids = saved.grids;
    if (
      grids.counts.length !== this.layers.length ||
      grids.bands.length !== this.layers.length ||
      grids.counts.some((gs) => gs.length !== this.colonies.length)
    )
      throw new Error("save: its grids are another game's");
    this.#grids.forEach((gs, l) => gs.forEach((g, k) => g.loadState((grids.counts[l] as number[][])[k] as number[])));
    this.#recs.forEach((r, l) => r.loadBands(grids.bands[l] as BandsSave));
    this.feedSites(); // the sites near what is awake now (not saved: the plane lists them)
  }
}
