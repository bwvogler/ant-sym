import { centreX, centreY, R } from "./hex.ts";
import { around, CountGrid, resolveFights, occupancy, DEFAULT_FIGHT, type FightParams } from "./battle.ts";
import { Colony, CURTAIN, localPolicy, localStance, PLANE, type ColonyParams, type Layer, type Policy, type StancePolicy } from "./colony.ts";
import { growWorld, mainGround, type OneWorld } from "./oneWorld.ts";
import { isFed, LARVA, PUPA } from "./brood.ts";
import { Fungus, INFECTED, type FungusParams } from "./fungus.ts";
import { type BandsSave, driftAim, Recognition, type RecognitionParams } from "./recognition.ts";
import type { Responses } from "./responses.ts";
import { clampCol, foundNest, isSky, mulberry32, rockAt, type Nest, type Rng, type WorldMap } from "./world.ts";
import { type Cell, type End, nearestValid, outward } from "./transect.ts";
import { cellOf, CELL } from "./hex.ts";
import { decode, encode, fillLike } from "./save.ts";
import { ALATE_RESERVE, type Flight } from "./royal.ts";

export { CURTAIN, PLANE } from "./colony.ts";

/** Whether `m` is one world (oneWorld.ts: the plane, the curtain and the line), not a single map. */
export function isOneWorld(m: WorldMap | OneWorld): m is OneWorld {
  return "plane" in m && "curtain" in m && "line" in m;
}

// The game, pure: two colonies (or one, solo) on one map, sharing its food.
// The player is neither: the player is the fungus (fungus.ts). `player` and
// `rival` are the first and second colony, named for history (the stack's
// tests and scripts use them); the page calls them by colour, Ink and Amber. Each tick: the colonies move (each seeing the other's
// ants through an enemy grid), then fights are resolved, then — every few
// seconds — each colony's strategist picks its stance from a coarse view of
// itself. A colony with no ants and too little food for one more is beaten.
// The fungus (the player, fungus.ts) spans every colony, like fights do: after
// fights, load spreads by contact across colonies and is groomed off within them.
// Who fights whom is recognition (recognition.ts): strangers by odour, not by
// colony. When the two nests come to smell alike and nobody has died fighting
// for a minute, the colonies are unified: the fungus's goal.

export interface GameParams {
  antCount: number;
  /** a rival colony at the map's second nest */
  rival: boolean;
  rivalAnts: number;
  /** seconds between strategist choices */
  strategyEvery: number;
  /** cells around a nest where an enemy counts as "near the nest" */
  nestWatch: number;
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
}

export const DEFAULT_GAME: GameParams = { antCount: 800, rival: true, rivalAnts: 800, strategyEvery: 5, nestWatch: 12, fight: DEFAULT_FIGHT, fungus: {}, recognition: {}, regrow: 0, autoFound: true };

/**
 * Bump when what a save holds changes: an older save is refused, not misread, unless SAVE_MIGRATIONS brings it up to
 * this version.
 */
export const SAVE_VERSION = 5;

/**
 * Older saves this game still reads, each brought up to the next version (Game.load; the page's ui/saves.ts lists them
 * as loadable). 4 → 5 (U4b, one-world saves): nothing to change. Version 5's fields are all optional (GameSave.grids,
 * GameSave.world, Founding.spot, a colony's and the fungus's `layers`); a save without `grids` has its occupancy grids
 * and recognition bands built afresh from the ants, as a version-4 game did on load.
 */
const SAVE_MIGRATIONS: Readonly<Record<number, (s: GameSave) => GameSave>> = {
  4: (s) => ({ ...s, version: 5 }),
};

/** Whether this game reads saves of `version`: its own, or one SAVE_MIGRATIONS brings up to it. */
export function readsSaveVersion(version: number | undefined): boolean {
  return version === SAVE_VERSION || (version !== undefined && Object.hasOwn(SAVE_MIGRATIONS, version));
}

/** A save brought up to SAVE_VERSION (SAVE_MIGRATIONS, in order); one this game can't read throws, rather than being misread. */
export function migrateSave(saved: GameSave): GameSave {
  let s = saved;
  while (s.version !== SAVE_VERSION) {
    const up = Object.hasOwn(SAVE_MIGRATIONS, s.version) ? SAVE_MIGRATIONS[s.version] : undefined;
    if (!up) throw new Error(`save: version ${saved.version}, this game reads ${SAVE_VERSION}`);
    s = up(s);
  }
  return s;
}

/**
 * Columns between two holes at the least (side view): a founding nearer an existing hole moves along (Game.addColony).
 * A founding chamber reaches up to 7 columns from its hole (the shaft slants at most about 2.5 over its 14 rows, the
 * chamber's disc 4.5 more), so at 16 two founding chambers never touch: at 8, daughters landing together shared one
 * (ja-lo8.10). A grown nest digs further, and a daughter can still land against its outer chambers.
 */
export const HOLE_GAP = 16;
/** World units between two nests' centres at the least (top-down maps). */
export const NEST_GAP = 12;
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
   * The nest as dug (Game.addColony records it). A save founds from it rather than digging again: a second dig would
   * draw from the restored game's random stream and could put the shaft elsewhere (PR #42 review, B1).
   */
  nest?: Nest;
  /**
   * One world (U4b): where the founding went, nearestValid's hole on the plane and the end of the line it grew (Game.addColony
   * records it; x and y stay the landing point). A save's re-founding grows the line there again (oneWorld.ts growWorld).
   */
  spot?: { end: End; cell: Cell };
}

/** A saved game (Game.save): JSON. */
export interface GameSave {
  version: number;
  time: number;
  strategyChoices: number;
  landed: unknown;
  regrown: number;
  /** per colony: its queen has been reached (Game.revealed) */
  revealed: boolean[];
  /** colonies added mid-game (Game.addColony), in order */
  founded?: Founding[];
  /** alates flown and not yet founded or lost (Game.flights) */
  flights?: Flight[];
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
   * that built them again from the living would diverge from a save on a tick with a fight death. Missing from a save of
   * version 4: those are built afresh, as they were.
   */
  grids?: { counts: number[][][]; bands: BandsSave[] };
  /**
   * One world (U4b): its seed, the line as saved (its holes, V₀'s column and the margin: a check, since load grows the
   * line again from `founded`), and the curtain as dug (its nests aside: the world digs them). `map` is the plane.
   */
  world?: { seed: number; line: { holes: Cell[]; s0: number; margin: number }; curtain: unknown };
  private: { fightDeaths: number; lastFightDeath: number; metBy?: number[]; haveMet?: boolean; nextStrategy: number; regrowClock: number; rng: number | null; regrowRng: number | null };
}

/** The game's regrowth (GameParams.regrow): a pile eaten bare is half back in about 20 minutes. */
export const GAME_REGROW = 1800;

/**
 * The fungus's game: unified (one colony: the goal), fallen (a colony is gone: the fungus has lost hosts it
 * could have unified, and there is no one left to unify it with), or playing. A colony's win over the other
 * is no win for the fungus.
 */
export type Outcome = "playing" | "unified" | "fallen";

/** How each side plays: the first colony's policy, strategist and params, and the same for the second (default: the local rule). */
export interface Sides {
  policy?: Policy;
  stance?: StancePolicy;
  colony?: Partial<ColonyParams>;
  rival?: Partial<ColonyParams>;
  rivalPolicy?: Policy;
  rivalStance?: StancePolicy;
  /** the first colony's responses (responses.ts; default the local ones), and the second's */
  responses?: Responses;
  rivalResponses?: Responses;
}

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

/** The fungus's landing (Game.land): this far past the hole (cells, along the ground), spores over this radius. */
export const LANDING = { offset: 3, radius: 2, spores: 3 };

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

export class Game {
  /** the map: in one world the plane, the surface (its food piles regrow there, and the fungus lands there) */
  readonly map: WorldMap;
  /** one world (oneWorld.ts), or null: a game on one map */
  readonly world: OneWorld | null;
  /**
   * The maps the game is played on, each a layer (one world, ja-lp4.3: the plane and the curtain); every other game has
   * one, its `map`. Each layer has its own occupancy grids and recognition: ants meet, fight and pass the fungus on only
   * where they are.
   */
  readonly layers: WorldMap[];
  readonly colonies: Colony[];
  /** the player: spores on the ground and load in the ants of every colony */
  readonly fungus: Fungus;
  /** who is a stranger to whom, by odour: the enemy view every ant and every fight reads (layer 0's; it also steps every colony's odours) */
  readonly recognition: Recognition;
  /** each layer's recognition, built from the ants on it: `recognition` is layer 0's */
  #recs: Recognition[];
  params: GameParams;
  time = 0;
  /** stance choices made by strategists */
  strategyChoices = 0;
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
  #nextStrategy = 0;
  #rng: () => number;
  /** the ground's food piles as the world began (cell index, units), for regrowth; null when food does not regrow */
  #piles: { cells: Int32Array; full: Float32Array } | null = null;
  /** regrowth's own random numbers: the game's stream is never drawn from for it */
  #regrowRng: Rng | null = null;
  #regrowClock = 0;
  /** food units that have grown back (map.foodTotal grows by it too) */
  regrown = 0;
  /**
   * Per colony: the fungus has been in its queen (ja-lo8.7), so its doctrine is open to the player from then on (PRD
   * §50: colony policy is hidden until the fungus infects a queen). Never closes again.
   */
  revealed: boolean[] = [];

  /**
   * A game on one map, or on one world (docs/one-world.md §2): the plane (layer PLANE) and the curtain (CURTAIN). There
   * every colony's home is the curtain, its nest, queen and brood, where every ant starts; it forages on the plane, and
   * its ants cross between the two at the holes.
   */
  constructor(world: WorldMap | OneWorld, params: Partial<GameParams> = {}, rng: () => number = Math.random, player: Sides = {}) {
    const one = isOneWorld(world) ? world : null;
    const map = one ? one.plane : (world as WorldMap);
    // The colonies' home map: the curtain in one world, where their nests are.
    const home = one ? one.curtain : map;
    const layered = one ? { plane: one.plane, line: one.line } : null;
    this.world = one;
    this.map = map;
    this.layers = one ? [one.plane, one.curtain] : [map];
    this.params = { ...DEFAULT_GAME, ...params };
    this.#rng = rng;
    this.recognition = new Recognition(this.params.recognition);
    this.#recs = this.layers.map((_, l) => (l === 0 ? this.recognition : new Recognition(this.params.recognition)));
    const tolerance = this.recognition.params.tolerance;
    // Each colony starts at its own odour, as far apart as odours go: 0 and 1.
    const mine = new Colony(home, { antCount: this.params.antCount, nest: 0, odour: 0, tolerance, ...player.colony }, rng, player.policy ?? localPolicy, player.stance ?? localStance, layered);
    if (player.responses) mine.responses = player.responses;
    this.colonies = [mine];
    if (this.params.rival && home.nests.length > 1)
      this.colonies.push(new Colony(home, { antCount: this.params.rivalAnts, odour: 1, tolerance, ...player.rival, nest: 1 }, rng, player.rivalPolicy ?? localPolicy, player.rivalStance ?? localStance, layered));
    if (player.rivalResponses && this.colonies[1]) this.colonies[1].responses = player.rivalResponses;
    this.#grids = this.layers.map(() => this.colonies.map(() => new CountGrid()));
    // One world: spores on both maps (the plane, layer 0, holds the fungus's public `map` and `spores`).
    this.fungus = new Fungus(one ? this.layers : map, this.params.fungus);
    this.#wire();
    this.#refresh();
    if (this.params.regrow > 0) this.#notePiles();
  }

  /** Wire every colony to the game: its grids, burials, enemies, the other nests, its raids. Again whenever a colony is added. */
  #wire(): void {
    this.colonies.forEach((c, k) => {
      // One world: the line as it stands (it grows with every founding), before the holes are read off it.
      if (this.world) c.line = this.world.line;
      c.seeHoles();
      this.layers.forEach((m, l) => {
        if (m.hasSoil) c.wire(l, { friends: (this.#grids[l] as CountGrid[])[k] as CountGrid });
      });
      // Undertakers put the dead on the midden: a host of a strain that sporulates (Bloom) puts spores on the ground there;
      // other strains die with their host (nest slices 7–8).
      // On the layer it is buried on: one world's midden is on the plane (U3c).
      c.onBury = (d, layer = 0) => {
        if (d.load >= INFECTED && this.fungus.strains[d.strain]?.sporulates) this.fungus.paint([], centreX(d.x, d.y), centreY(d.y), 0.6, MIDDEN_SPORES, 0, d.strain, layer);
      };
      if (this.colonies.length > 1) {
        this.layers.forEach((_, l) => {
          c.wire(l, {
            enemies: this.#recs[l] as Recognition,
            nestmates: (this.#grids[l] as CountGrid[])[k] as CountGrid,
            others: this.colonies.filter((o) => o !== c).map((o) => (o.layers[l] as Layer).nest),
          });
        });
        this.#aimRaids(k);
      }
    });
  }

  /** Colonies added mid-game (addColony), in order: a save re-founds them before it restores. */
  founded: Founding[] = [];

  /** Alates that have flown (ja-lo8.9) and wait for the page to found or lose them (GameParams.autoFound off). */
  flights: Flight[] = [];

  /** The last flight whose queen was lost, and why (one world's "no room beyond the line's ends within her flight"): what the page says. */
  lastLoss: { flight: Flight; reason: string } | null = null;

  /**
   * Where a queen flown from colony `mother` lands by default: FLIGHT.land columns from its hole, on whichever side
   * has the room (the free column nearest there: addColony keeps HOLE_GAP from every hole), on the ground line; null
   * when the map has no room within FLIGHT.radius, or no sky (top-down maps don't fly queens). In one world (U4a):
   * FLIGHT_2D from its hole on the plane, in a direction drawn from the game's stream; addColony then moves her to the
   * nearest spot the founding rule allows within FOUND_RADIUS, or she is lost.
   */
  landing(mother: number): { x: number; y: number } | null {
    if (this.world) {
      const m = this.colonies[mother];
      const h = m?.holeCells[m.params.nest];
      if (!h) return null;
      const a = this.#rng() * 2 * Math.PI;
      return { x: centreX(h.px, h.py) + FLIGHT_2D * Math.cos(a), y: centreY(h.py) + FLIGHT_2D * Math.sin(a) };
    }
    return this.landingAt(mother, 1, FLIGHT.land) ?? this.landingAt(mother, -1, FLIGHT.land);
  }

  /** The landing site `distance` columns east (side 1) or west (−1) of colony `mother`'s hole: the free column nearest there, within FLIGHT.radius; null if none (or no sky). */
  landingAt(mother: number, side: 1 | -1, distance: number): { x: number; y: number } | null {
    const m = this.colonies[mother];
    const e = m?.nest.entrance;
    if (!m || !e || !this.map.sky) return null;
    cellOf(e.x, e.y);
    const col = CELL[0] as number;
    const row = CELL[1] as number;
    const c = this.#freeColumnOrNull(col + side * distance);
    return c !== null && Math.abs(c - col) <= FLIGHT.radius ? { x: centreX(c, row), y: centreY(row) } : null;
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
    // Her reserve is her body (Flight.food), moved into her colony's larder: no food is made or lost (PR #47 review, S1).
    // No room for her hole after all (side view: landing sites are free columns, so only by a caller's own site; one
    // world: nowhere the founding rule allows within FOUND_RADIUS): she is lost, and the game says why.
    try {
      return this.addColony({ x: at.x, y: at.y, antCount: 0, odour: mother.nestOdour, mother: f.mother, reserve: f.food, ...(f.load > 0 ? { fungus: { load: f.load, strain: f.strain } } : {}) });
    } catch (e) {
      if (!(e instanceof Error && e.message.includes("no room"))) throw e;
      this.#lost(f, e.message.replace(/^addColony: /, ""));
      return -1;
    }
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
    (this.colonies[f.mother] ?? this.player).eaten += f.food;
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

  /** The column nearest `col` clear of every hole, or null when there is none. */
  #freeColumnOrNull(col: number): number | null {
    try {
      return this.#freeColumn(col);
    } catch {
      return null;
    }
  }

  /**
   * A new colony mid-game (ja-lo8.8; a daughter queen's, ja-lo8.9): in the side view a hole dug in the column under x
   * with a shaft and a founding chamber, as the world's own nests are dug (world.foundNest); top-down a nest's disc at
   * (x, y). In one world (U4a, docs/one-world.md §3) (x, y) is a point on the plane: the hole goes at the nearest cell
   * within FOUND_RADIUS where the founding rule allows one (transect.ts nearestValid; on the plane's main open ground,
   * oneWorld.ts mainGround), the world grows there (oneWorld.ts
   * growWorld: the line, the curtain, the nest on both layers), and the colony lives in the curtain with its plane above;
   * none there throws an error saying "no room" (NO_ROOM), as the side view's does. It starts with `antCount` workers
   * (in one world in the curtain, as every colony's do) and, in the side view and one world, its queen, at odour `odour`
   * (a daughter: her mother's, so the two are kin until they drift). Every colony is wired again: the line, the other
   * nests, raids (kin are not raided), grids. Returns its index.
   */
  addColony(f: Founding): number {
    const k = this.colonies.length;
    const world = this.world;
    let at: number;
    let nest: Nest;
    let spot: Founding["spot"];
    if (world) {
      // A save's re-founding (f.nest) grows the line where the founding went (f.spot), as it was then: no search again.
      if (f.nest && !f.spot) throw new Error("addColony: a save's founding needs its spot (one world)");
      cellOf(f.x, f.y);
      // Rule 4's open ground is the plane's main open ground (mainGround): never a pocket sealed off by rock (D1, #62).
      spot = f.nest ? f.spot : (nearestValid(world.line, { x: CELL[0] as number, y: CELL[1] as number }, FOUND_RADIUS, mainGround(world)) ?? undefined);
      if (!spot) throw new Error(`addColony: ${NO_ROOM}`);
      const was = { x0: world.curtain.x0, w: world.curtain.size.w };
      at = growWorld(world, spot.end, spot.cell);
      // The fungus keeps the curtain's spore cells as flat indices: re-keyed to its new columns.
      this.fungus.regrid(CURTAIN, was);
      // A save's nest is the one dug then, as the side view's (growWorld digs the same one: from the stream keyed by its hole).
      if (f.nest) world.curtain.nests[at] = { ...f.nest, ...(f.nest.entrance ? { entrance: { ...f.nest.entrance } } : {}) };
      nest = world.curtain.nests[at] as Nest;
    } else {
      // The new nest's index in map.nests, which holds the world's nests whether or not a colony lives in each (with the
      // rival off, nest 1 is the world's unused second nest): never the colony's index (PR #42 review, B2).
      at = this.map.nests.length;
      if (f.nest) nest = { ...f.nest, ...(f.nest.entrance ? { entrance: { ...f.nest.entrance } } : {}) };
      else if (this.map.sky) {
        cellOf(f.x, f.y);
        nest = foundNest(this.map, this.#freeColumn(CELL[0] as number), at, this.#rng);
      } else nest = { ...this.#freeSpot(f.x, f.y), r: 3 };
      this.map.nests.push(nest);
    }
    const home = world ? world.curtain : this.map;
    const c = new Colony(home, { antCount: f.antCount, maxAnts: f.maxAnts ?? Math.round(1.5 * Math.max(f.antCount, this.params.antCount)), nest: at, odour: f.odour, tolerance: this.recognition.params.tolerance }, this.#rng, localPolicy, localStance, world ? { plane: world.plane, line: world.line } : null);
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
    this.founded.push({ ...f, ...(spot ? { spot: { end: spot.end, cell: { x: spot.cell.x, y: spot.cell.y } } } : {}), nest: { ...nest, ...(nest.entrance ? { entrance: { ...nest.entrance } } : {}) } });
    this.#wire();
    this.#refresh();
    const q = c.queen;
    if (f.fungus && f.fungus.load > 0 && q) {
      q.load = Math.min(1, f.fungus.load);
      q.strain = f.fungus.strain;
      this.fungus.hosts++;
      if (this.fungus.evolution?.strain === f.fungus.strain) {
        const at = this.#byHole(c);
        this.fungus.root(at.x, at.y, LANDING.radius);
      }
    }
    return k;
  }

  /**
   * The lab's founding in one world (U4a; the page reaches it from U5): a colony of `antCount` ants at the first
   * colony's odour (kin), founded FLIGHT_2D past the line's `end` hole, straight on along its end segment, moved by
   * addColony to the nearest spot the founding rule allows. Returns its index; throws "no room" when there is none.
   */
  foundBeyond(end: End, antCount = 30): number {
    const world = this.world;
    if (!world) throw new Error("foundBeyond: one world only (the side view's lab founds between the nests)");
    const holes = world.line.holes;
    const v = end === "start" ? holes[0]! : holes[holes.length - 1]!;
    const [ux, uy] = outward(holes, end);
    return this.addColony({ x: centreX(v.x, v.y) + FLIGHT_2D * ux, y: centreY(v.y) + FLIGHT_2D * uy, antCount, odour: this.player.nestOdour });
  }

  /**
   * The column nearest `col` at least HOLE_GAP columns from every hole (side view): a second founding at the same spot
   * moves along rather than digging into a hole that is already there (PR #42 review, S2).
   */
  #freeColumn(col: number): number {
    const taken = this.map.nests.flatMap((n) => {
      if (!n.entrance) return [];
      cellOf(n.entrance.x, n.entrance.y);
      return [CELL[0] as number];
    });
    const { x0 } = this.map;
    const w = this.map.size.w;
    for (let d = 0; d < w; d++)
      for (const c of d === 0 ? [col] : [col + d, col - d])
        if (c >= x0 + HOLE_GAP && c < x0 + w - HOLE_GAP && taken.every((t) => Math.abs(t - c) >= HOLE_GAP)) return c;
    throw new Error("addColony: no room for another hole");
  }

  /** The spot nearest (x, y) along x at least NEST_GAP from every nest (top-down): as #freeColumn, for nests' discs. */
  #freeSpot(x: number, y: number): { x: number; y: number } {
    const { w } = this.map.size;
    const { x0 } = this.map;
    const clear = (cx: number) => this.map.nests.every((n) => Math.hypot(n.x - cx, n.y - y) >= NEST_GAP);
    for (let d = 0; d < w; d += 1)
      for (const cx of d === 0 ? [x] : [x + d, x - d]) if (cx >= x0 + NEST_GAP && cx <= x0 + w - NEST_GAP && clear(cx)) return { x: cx, y };
    throw new Error("addColony: no room for another nest");
  }

  /** The ground's food piles now (as the world began): cells with food, on the walkway in the side view, anywhere top-down. */
  #notePiles(): void {
    const { w, h } = this.map.size;
    const { x0 } = this.map;
    const cells: number[] = [];
    const full: number[] = [];
    for (let y = 0; y < h; y++)
      for (let x = x0; x < x0 + w; x++) {
        const v = this.map.food.get(x, y);
        if (v > 0 && (!this.map.sky || isSky(this.map, x, y))) {
          cells.push(y * w + x - x0);
          full.push(v);
        }
      }
    this.#piles = { cells: Int32Array.from(cells), full: Float32Array.from(full) };
    this.#regrowRng = mulberry32(this.map.seed * 92821 + 17);
  }

  /** Once a second: each pile cell short of its first size grows a unit back with chance deficit ÷ regrow. */
  #regrow(dt: number): void {
    const piles = this.#piles;
    if (!piles) return;
    this.#regrowClock += dt;
    if (this.#regrowClock < 1) return;
    const owed = this.#regrowClock;
    this.#regrowClock = 0;
    const { w } = this.map.size;
    const { x0 } = this.map;
    const rate = owed / this.params.regrow;
    for (let k = 0; k < piles.cells.length; k++) {
      const c = piles.cells[k] as number;
      const col = c % w;
      const y = (c - col) / w;
      const x = col + x0;
      const v = this.map.food.get(x, y);
      const short = (piles.full[k] as number) - v;
      if (short < 1 || rockAt(this.map, x, y)) continue; // full, or built over (a mound)
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
    const target = nearestRival(c, this.colonies, this.recognition.params.tolerance);
    if (target) this.#aimAt(c, target);
  }

  /** Colony c's raids, and the rival trail its bent ants read, at colony `target`: on each layer, its nest and scent there. */
  #aimAt(c: Colony, target: Colony): void {
    this.layers.forEach((_, l) => {
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

  /** The first colony (Ink on the page). Not the player's: the player is the fungus. */
  get player(): Colony {
    return this.colonies[0] as Colony;
  }

  /** The second colony (Amber on the page), or null solo. */
  get rival(): Colony | null {
    return this.colonies[1] ?? null;
  }

  /** Occupancy per colony, and every ant by odour band, on each layer: built from the ants, never by scanning the map. */
  #refresh(): void {
    const one = this.layers.length === 1;
    this.#grids.forEach((grids, l) => {
      this.colonies.forEach((c, k) => occupancy(c, grids[k] as CountGrid, one ? -1 : l));
      if (this.colonies.length > 1) (this.#recs[l] as Recognition).build(this.colonies, one ? -1 : l);
    });
  }

  /**
   * Strangers (to the nest's odour, at the healthy tolerance) within `nestWatch` (world units) of colony k's nest, and of
   * its entrance in the side view; in one world, on each layer round that layer's nest (the plane's disc, the curtain's
   * chamber and entrance), each layer's recognition counting the ants on it.
   */
  enemiesNearNest(k: number): number {
    const c = this.colonies[k] as Colony;
    let s = 0;
    this.layers.forEach((m, l) => {
      const rec = this.#recs[l] as Recognition;
      const nest = (c.layers[l] as Layer).nest;
      rec.look(c.nestOdour, rec.params.tolerance);
      const { w, h } = m.size;
      const { x0 } = m;
      const r = this.params.nestWatch;
      for (let y = Math.max(0, Math.floor((nest.y - r) / R - 1)); y <= Math.min(h - 1, Math.ceil((nest.y + r) / R)); y++)
        for (let x = Math.max(x0, Math.floor(nest.x - r - 1)); x <= Math.min(x0 + w - 1, Math.ceil(nest.x + r)); x++)
          if (Math.hypot(centreX(x, y) - nest.x, centreY(y) - nest.y) <= r) s += rec.get(x, y);
      // The side view: the entrance too (it is above the chamber, out of that watch), unless the two overlap.
      const en = nest.entrance;
      if (en && Math.hypot(en.x - nest.x, en.y - nest.y) > r)
        for (let y = Math.max(0, Math.floor((en.y - r) / R - 1)); y <= Math.min(h - 1, Math.ceil((en.y + r) / R)); y++)
          for (let x = Math.max(x0, Math.floor(en.x - r - 1)); x <= Math.min(x0 + w - 1, Math.ceil(en.x + r)); x++)
            if (Math.hypot(centreX(x, y) - en.x, centreY(y) - en.y) <= r && Math.hypot(centreX(x, y) - nest.x, centreY(y) - nest.y) > r) s += rec.get(x, y);
    });
    return s;
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
    for (let a = 0; a < live.length; a++) for (let b = a + 1; b < live.length; b++) gap = Math.max(gap, Math.abs((live[a] as Colony).nestOdour - (live[b] as Colony).nestOdour));
    // Mixing: each colony's ants within tolerance of another colony's nest odour (with two: the other one).
    let near = 0;
    let living = 0;
    for (const c of live)
      for (let i = 0; i < c.n; i++) {
        if (!c.alive[i]) continue;
        living++;
        const o = c.odour[i] as number;
        if (live.some((other) => other !== c && Math.abs(o - other.nestOdour) <= tol)) near++;
      }
    const recognition = Math.min(1, Math.max(0, (1 - gap) / (1 - tol)));
    const unified = gap <= tol && quiet >= QUIET && (met >= MET || this.#haveMet) && live.every((c) => !Game.beaten(c));
    return { gap, deathsPerMinute, quiet, mixing: living ? near / living : 0, met, alike: gap <= tol, score: recognition * Math.min(1, quiet / QUIET) * (this.#haveMet ? 1 : Math.min(1, met / MET)), unified };
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
      if (!Game.beaten(c)) live.push(k);
    });
    const keep = Math.exp(-dt / QUIET);
    const tol = this.recognition.params.tolerance;
    const one = this.layers.length === 1;
    // Each ant meets the ants on its own layer: its grids and map.
    let l = 0;
    let map = this.layers[0] as WorldMap;
    let gap = 0;
    for (let a = 0; a < live.length; a++)
      for (let b = a + 1; b < live.length; b++) gap = Math.max(gap, Math.abs((this.colonies[live[a] as number] as Colony).nestOdour - (this.colonies[live[b] as number] as Colony).nestOdour));
    this.colonies.forEach((c, k) => {
      let share = 0;
      if (live.length >= 2 && live.includes(k)) {
        let living = 0;
        let allied = 0;
        for (let i = 0; i < c.n; i++) {
          if (!c.alive[i]) continue;
          living++;
          const o = c.odour[i] as number;
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
              if (!one) {
                l = c.layer[i] as number;
                map = this.layers[l] as WorldMap;
              }
              cx = clampCol(map, CELL[0] as number);
              cy = Math.min(map.size.h - 1, Math.max(0, CELL[1] as number));
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
    else if (this.time - this.#lastFightDeath >= QUIET && this.#metNow(live.map((k) => this.colonies[k] as Colony)) >= MET) this.#haveMet = true;
  }

  tick(dt: number): void {
    this.time += dt;
    for (const c of this.colonies) c.tick(dt);
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
      const one = this.layers.length === 1;
      let died = 0;
      this.#grids.forEach((grids, l) => {
        died += resolveFights(this.colonies, grids, dt, this.#rng, this.params.fight, this.#recs[l] as Recognition, one ? -1 : l).reduce((x, y) => x + y, 0);
      });
      if (died > 0) {
        this.#fightDeaths += died;
        this.#lastFightDeath = this.time;
        this.#haveMet = false;
      }
      // Odours: the gestalt at each nest, and blending where the fungus runs it.
      this.recognition.advance(this.colonies, dt);
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
      if (this.layers.length === 1) this.fungus.advance(this.colonies, this.#grids[0] as CountGrid[], dt, recs ? (recs[0] as Recognition) : null);
      else this.fungus.advanceLayers(this.colonies, this.#grids, dt, recs);
    }
    if (this.time >= this.#nextStrategy) {
      this.#nextStrategy = this.time + this.params.strategyEvery;
      this.colonies.forEach((c, k) => {
        // With no living rival there is nothing to defend against or raid: forage, and ask nobody.
        // (Solo, "raid" turned explorers into fighters with no target, and the colony stopped foraging.)
        // A colony whose nest smells like ours is no rival either: kin are not raided (after unification,
        // raiders swarmed the other nest with nobody there to fight).
        const tol = this.recognition.params.tolerance;
        if (!this.colonies.some((o, j) => j !== k && !Game.beaten(o) && Math.abs(o.nestOdour - c.nestOdour) > tol)) {
          c.stance = "forage";
          c.raidable = false;
          return;
        }
        c.raidable = true;
        // Raids go to the nearest colony still a rival (one may have fallen, or come to smell like kin).
        this.#aimRaids(k);
        // On open ground each ant's stance is its own, from what it senses (docs/stance.md): nobody chooses one for the colony.
        if (c.ownStances) return;
        // A stance is part of every ant's situation: a change re-asks the ants by itself.
        c.stance = c.stancePolicy(c.stanceSituation(this.enemiesNearNest(k) > 0));
        this.strategyChoices++;
      });
    }
  }

  /** Where the fungus landed (Game.land), or null before it has: the fungus game's start (ja-lo8.5). */
  landed: { colony: number; x: number; y: number; at: number } | null = null;

  /**
   * The fungus game's start (ja-lo8.5): the player's fungus falls as a few spores on the ground just outside colony k's
   * hole, where its ants walk out and back. No ant is dosed directly: the first hosts are ants that walk through it.
   * The top-down maps have no hole: it falls at the nest's rim. Lands once; returns where.
   */
  land(k: number, strain: number, { spores = LANDING.spores, evolve = false }: { spores?: number; evolve?: boolean } = {}): { x: number; y: number } {
    if (this.landed) return this.landed;
    const { x, y } = this.#byHole(this.colonies[k] ?? this.player);
    // The game's fungus starts weak and evolves (ja-lo8.12); a lab or test landing keeps the strain as listed.
    if (evolve) this.fungus.evolve(strain);
    this.fungus.paint(this.colonies, x, y, LANDING.radius, spores, 0, strain);
    this.fungus.root(x, y, LANDING.radius);
    this.landed = { colony: k, x, y, at: this.time };
    return this.landed;
  }

  /** Where the fungus falls or roots by colony c: just past its hole along the ground (the top-down maps: its nest's rim). */
  #byHole(c: Colony): { x: number; y: number } {
    // One world: on the plane, by the rim of the disc round its hole (layer 0's nest), as top-down.
    const nest = this.world ? (c.layers[PLANE] as Layer).nest : c.nest;
    const e = nest.entrance ?? { x: nest.x + nest.r, y: nest.y };
    return { x: e.x + LANDING.offset, y: e.y - (nest.entrance ? 0.5 : 0) };
  }

  /**
   * Spores on the ground within `radius` of (x, y), and a dose of load into every ant there, of any colony: the old
   * spore brush (BRUSH), for tests and scripts. The app has no brush (ja-260): every game lands an evolving fungus, and
   * a free stroke would skip its progression.
   */
  paintSpores(x: number, y: number, radius: number, spores: number, dose: number, strain: number): void {
    this.fungus.paint(this.colonies, x, y, radius, spores, dose, strain);
  }

  /**
   * Beaten: no ants left and too little food in the larder for one more. In the side view (nest slice 4) ants come
   * only from brood: no workers and no pupa or fully fed larva left (eggs and hungry larvae need nurses), whatever the queen or the larder.
   */
  static beaten(c: Colony): boolean {
    if (c.queen) return !(c.founding && c.queen.alive) && c.population === 0 && !c.brood.items.some((b) => b.stage === PUPA || (b.stage === LARVA && isFed(b)));
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
      time: this.time,
      strategyChoices: this.strategyChoices,
      landed: encode(this.landed),
      regrown: this.regrown,
      revealed: [...this.revealed],
      founded: this.founded.map((f) => JSON.parse(JSON.stringify(f)) as Founding),
      flights: this.flights.map((f) => ({ ...f })),
      params: encode(this.params),
      map: encode(map),
      colonies: this.colonies.map((c) => c.saveState()),
      raids: this.colonies.map((c) => this.colonies.findIndex((o) => o.ph === c.raidMarks)),
      fungus: this.fungus.saveState(),
      recognition: this.recognition.saveState(),
      grids: { counts: this.#grids.map((gs) => gs.map((g) => g.saveState())), bands: this.#recs.map((r) => r.saveBands()) },
      ...(world ? { world: { seed: world.seed, line: { holes: world.line.holes.map((c) => ({ x: c.x, y: c.y })), s0: world.line.sHole[0] as number, margin: world.line.margin }, curtain: encode(bare(world.curtain)) } } : {}),
      private: { fightDeaths: this.#fightDeaths, lastFightDeath: this.#lastFightDeath, metBy: [...this.#metBy], haveMet: this.#haveMet, nextStrategy: this.#nextStrategy, regrowClock: this.#regrowClock, rng: (this.#rng as Partial<Rng>).state ?? null, regrowRng: this.#regrowRng?.state ?? null },
    };
  }

  /**
   * A save back into this game, built afresh from the same world and settings (Game.save). One world (U4b): built from
   * the same seed and generateOneWorld options; the foundings grow the line again where they went, then the plane and
   * the curtain as dug are poured over it.
   */
  load(save: GameSave): void {
    const saved = migrateSave(save);
    const world = this.world;
    const sw = saved.world;
    if (!!sw !== !!world) throw new Error(sw ? "save: a one-world save, and this game is on one map" : "save: a save of a game on one map, and this game is one world");
    if (world && sw) {
      const size = (saved.map as { size?: { w: number; h: number } }).size;
      if (sw.seed !== world.seed || size?.w !== this.map.size.w || size?.h !== this.map.size.h) throw new Error(`save: another world (seed ${sw.seed}, plane ${size?.w} × ${size?.h}; this game's: seed ${world.seed}, ${this.map.size.w} × ${this.map.size.h})`);
    }
    // Colonies founded mid-game first, as they were: then everything (the map as dug among it) is poured back over them.
    for (const f of saved.founded ?? []) this.addColony(f);
    if (world && sw) {
      // The line grown again must be the one saved: else the curtain poured below would lie under another line.
      const line = world.line;
      const same = line.holes.length === sw.line.holes.length && line.holes.every((c, k) => c.x === sw.line.holes[k]?.x && c.y === sw.line.holes[k]?.y);
      if (!same || line.sHole[0] !== sw.line.s0 || line.margin !== sw.line.margin) throw new Error("save: another world's line");
    }
    if (saved.colonies.length !== this.colonies.length) throw new Error(`save: ${saved.colonies.length} colonies, this game has ${this.colonies.length}`);
    this.time = saved.time;
    this.strategyChoices = saved.strategyChoices;
    this.landed = decode(saved.landed) as Game["landed"];
    this.regrown = saved.regrown;
    this.revealed = [...(saved.revealed ?? [])];
    this.flights = (saved.flights ?? []).map((f) => ({ ...f }));
    this.params = decode(saved.params) as GameParams;
    fillLike(this.map, saved.map);
    if (world && sw) fillLike(world.curtain, sw.curtain);
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
    this.#nextStrategy = p.nextStrategy;
    this.#regrowClock = p.regrowClock;
    if (p.rng !== null && "state" in this.#rng) (this.#rng as Rng).state = p.rng;
    if (p.regrowRng !== null && this.#regrowRng) this.#regrowRng.state = p.regrowRng;
    // The grids and bands as the save's last tick built them (GameSave.grids); a version-4 save builds them afresh.
    const grids = saved.grids;
    if (grids) {
      if (grids.counts.length !== this.layers.length || grids.bands.length !== this.layers.length || grids.counts.some((gs) => gs.length !== this.colonies.length)) throw new Error("save: its grids are another game's");
      this.#grids.forEach((gs, l) => gs.forEach((g, k) => g.loadState((grids.counts[l] as number[][])[k] as number[])));
      this.#recs.forEach((r, l) => r.loadBands(grids.bands[l] as BandsSave));
    } else this.#refresh();
  }
}
