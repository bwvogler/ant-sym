import { centreX, centreY, R } from "./hex.ts";
import { CountGrid, resolveFights, occupancy, DEFAULT_FIGHT, type FightParams } from "./battle.ts";
import { Colony, localPolicy, localStance, type ColonyParams, type Policy, type StancePolicy } from "./colony.ts";
import { isFed, LARVA, PUPA } from "./brood.ts";
import { Fungus, INFECTED, type FungusParams } from "./fungus.ts";
import { Recognition, type RecognitionParams } from "./recognition.ts";
import type { Responses } from "./responses.ts";
import { isSky, mulberry32, rockAt, type Rng, type WorldMap } from "./world.ts";
import { decode, encode, fillLike } from "./save.ts";

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
   * Food regrows (the fungus game, ja-lo8.5, owner's choice in PRD §49.5): the food piles the world began with on the
   * ground (the side view's walkway; every pile on a top-down map) grow back toward their first size, a unit at a time,
   * at their deficit ÷ this many seconds each. 0: never (the lab, the goldens and the assays).
   */
  regrow: number;
}

export const DEFAULT_GAME: GameParams = { antCount: 800, rival: true, rivalAnts: 800, strategyEvery: 5, nestWatch: 12, fight: DEFAULT_FIGHT, fungus: {}, recognition: {}, regrow: 0 };

/** Bump when what a save holds changes: an older save is refused, not misread. */
export const SAVE_VERSION = 1;

/** A saved game (Game.save): JSON. */
export interface GameSave {
  version: number;
  time: number;
  strategyChoices: number;
  landed: unknown;
  regrown: number;
  params: unknown;
  map: unknown;
  colonies: Record<string, unknown>[];
  /** each colony's raid target, as a colony index (−1: none) */
  raids: number[];
  fungus: Record<string, unknown>;
  recognition: Record<string, unknown>;
  private: { fightDeaths: number; lastFightDeath: number; nextStrategy: number; regrowClock: number; rng: number | null; regrowRng: number | null };
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
  /** 0..1: how far the nests have come to smell alike, × how long it has been quiet (a minute is whole) */
  score: number;
  /** the nests smell alike and nobody has died fighting for a minute */
  unified: boolean;
}

/** Spores a sporulating host's corpse puts on the midden cell. */
const MIDDEN_SPORES = 3;

/** Seconds without a fight death that unity asks for. */
export const QUIET = 60;

/** The fungus's landing (Game.land): this far past the hole (cells, along the ground), spores over this radius. */
export const LANDING = { offset: 3, radius: 2, spores: 3 };

/**
 * The colony c would raid, of any number: the nearest (hole to hole, or nest to nest on a top-down map) that is not
 * beaten and does not smell like kin (nest odours more than `tolerance` apart); null if there is none.
 */
export function nearestRival(c: Colony, colonies: readonly Colony[], tolerance: number): Colony | null {
  const at = c.nest.entrance ?? c.nest;
  let target: Colony | null = null;
  let best = Infinity;
  for (const o of colonies) {
    if (o === c || Game.beaten(o) || Math.abs(o.nestOdour - c.nestOdour) <= tolerance) continue;
    const e = o.nest.entrance ?? o.nest;
    const d = Math.hypot(e.x - at.x, e.y - at.y);
    if (d < best) {
      best = d;
      target = o;
    }
  }
  return target;
}

export class Game {
  readonly map: WorldMap;
  readonly colonies: Colony[];
  /** the player: spores on the ground and load in the ants of every colony */
  readonly fungus: Fungus;
  /** who is a stranger to whom, by odour: the enemy view every ant and every fight reads */
  readonly recognition: Recognition;
  params: GameParams;
  time = 0;
  /** stance choices made by strategists */
  strategyChoices = 0;
  #grids: CountGrid[];
  /** fight deaths, fading over ~60 s, and when the last one was */
  #fightDeaths = 0;
  #lastFightDeath = 0;
  #nextStrategy = 0;
  #rng: () => number;
  /** the ground's food piles as the world began (cell index, units), for regrowth; null when food does not regrow */
  #piles: { cells: Int32Array; full: Float32Array } | null = null;
  /** regrowth's own random numbers: the game's stream is never drawn from for it */
  #regrowRng: Rng | null = null;
  #regrowClock = 0;
  /** food units that have grown back (map.foodTotal grows by it too) */
  regrown = 0;

  constructor(map: WorldMap, params: Partial<GameParams> = {}, rng: () => number = Math.random, player: Sides = {}) {
    this.map = map;
    this.params = { ...DEFAULT_GAME, ...params };
    this.#rng = rng;
    this.recognition = new Recognition(this.params.recognition);
    const tolerance = this.recognition.params.tolerance;
    // Each colony starts at its own odour, as far apart as odours go: 0 and 1.
    const mine = new Colony(map, { antCount: this.params.antCount, nest: 0, odour: 0, tolerance, ...player.colony }, rng, player.policy ?? localPolicy, player.stance ?? localStance);
    if (player.responses) mine.responses = player.responses;
    this.colonies = [mine];
    if (this.params.rival && map.nests.length > 1)
      this.colonies.push(new Colony(map, { antCount: this.params.rivalAnts, odour: 1, tolerance, ...player.rival, nest: 1 }, rng, player.rivalPolicy ?? localPolicy, player.rivalStance ?? localStance));
    if (player.rivalResponses && this.colonies[1]) this.colonies[1].responses = player.rivalResponses;
    this.#grids = this.colonies.map(() => new CountGrid());
    this.fungus = new Fungus(map, this.params.fungus);
    this.colonies.forEach((c, k) => {
      if (map.hasSoil) c.friends = this.#grids[k] as CountGrid;
      // Undertakers put the dead on the midden: a host of a strain that sporulates (Bloom) puts spores on the ground there;
      // other strains die with their host (nest slices 7–8).
      c.onBury = (d) => {
        if (d.load >= INFECTED && this.fungus.strains[d.strain]?.sporulates) this.fungus.paint([], centreX(d.x, d.y), centreY(d.y), 0.6, MIDDEN_SPORES, 0, d.strain);
      };
      if (this.colonies.length > 1) {
        c.enemies = this.recognition;
        c.nestmates = this.#grids[k] as CountGrid;
        c.others = this.colonies.filter((o) => o !== c).map((o) => o.nest);
        this.#aimRaids(k);
      }
    });
    this.#refresh();
    if (this.params.regrow > 0) this.#notePiles();
  }

  /** The ground's food piles now (as the world began): cells with food, on the walkway in the side view, anywhere top-down. */
  #notePiles(): void {
    const { w, h } = this.map.size;
    const cells: number[] = [];
    const full: number[] = [];
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const v = this.map.food.get(x, y);
        if (v > 0 && (!this.map.sky || isSky(this.map, x, y))) {
          cells.push(y * w + x);
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
    const rate = owed / this.params.regrow;
    for (let k = 0; k < piles.cells.length; k++) {
      const c = piles.cells[k] as number;
      const x = c % w;
      const y = (c - x) / w;
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

  /** Colony c's raids, and the rival trail its bent ants read, at colony `target`. */
  #aimAt(c: Colony, target: Colony): void {
    const other = target.nest;
    c.raidTarget = other.entrance ? { x: other.entrance.x, y: other.entrance.y, r: 1.5 } : other; // side view: in at their hole
    c.raidNest = other.entrance ? other : null; // and then down to their chamber
    c.raidMarks = target.ph;
    // Only ants whose perception the fungus has bent read it (Colony.foreignFood): the colony they'd raid, the nearest rival.
    c.foreign = target.ph;
  }

  /** The first colony (Ink on the page). Not the player's: the player is the fungus. */
  get player(): Colony {
    return this.colonies[0] as Colony;
  }

  /** The second colony (Amber on the page), or null solo. */
  get rival(): Colony | null {
    return this.colonies[1] ?? null;
  }

  /** Occupancy per colony, and every ant by odour band: built from the ants, never by scanning the map. */
  #refresh(): void {
    this.colonies.forEach((c, k) => occupancy(c, this.#grids[k] as CountGrid));
    if (this.colonies.length > 1) this.recognition.build(this.colonies);
  }

  /** Strangers (to the nest's odour, at the healthy tolerance) within `nestWatch` (world units) of colony k's nest, and of its entrance in the side view. */
  enemiesNearNest(k: number): number {
    const c = this.colonies[k] as Colony;
    const rec = this.recognition;
    rec.look(c.nestOdour, rec.params.tolerance);
    const { w, h } = this.map.size;
    const r = this.params.nestWatch;
    let s = 0;
    for (let y = Math.max(0, Math.floor((c.nest.y - r) / R - 1)); y <= Math.min(h - 1, Math.ceil((c.nest.y + r) / R)); y++)
      for (let x = Math.max(0, Math.floor(c.nest.x - r - 1)); x <= Math.min(w - 1, Math.ceil(c.nest.x + r)); x++)
        if (Math.hypot(centreX(x, y) - c.nest.x, centreY(y) - c.nest.y) <= r) s += rec.get(x, y);
    // The side view: the entrance too (it is above the chamber, out of that watch), unless the two overlap.
    const en = c.nest.entrance;
    if (en && Math.hypot(en.x - c.nest.x, en.y - c.nest.y) > r)
      for (let y = Math.max(0, Math.floor((en.y - r) / R - 1)); y <= Math.min(h - 1, Math.ceil((en.y + r) / R)); y++)
        for (let x = Math.max(0, Math.floor(en.x - r - 1)); x <= Math.min(w - 1, Math.ceil(en.x + r)); x++)
          if (Math.hypot(centreX(x, y) - en.x, centreY(y) - en.y) <= r && Math.hypot(centreX(x, y) - c.nest.x, centreY(y) - c.nest.y) > r) s += rec.get(x, y);
    return s;
  }

  /** How far the fungus has come toward one colony. With no rival there is nothing to unify. */
  unity(): Unity {
    const deathsPerMinute = this.#fightDeaths;
    const quiet = this.time - this.#lastFightDeath;
    const [a, b] = this.colonies;
    if (!a || !b) return { gap: 0, deathsPerMinute, quiet, mixing: 0, score: 0, unified: false };
    const tol = this.recognition.params.tolerance;
    const gap = Math.abs(a.nestOdour - b.nestOdour);
    let near = 0;
    let living = 0;
    for (const [c, other] of [[a, b], [b, a]] as const)
      for (let i = 0; i < c.n; i++) {
        if (!c.alive[i]) continue;
        living++;
        if (Math.abs((c.odour[i] as number) - other.nestOdour) <= tol) near++;
      }
    const recognition = Math.min(1, Math.max(0, (1 - gap) / (1 - tol)));
    const unified = gap <= tol && quiet >= QUIET && !Game.beaten(a) && !Game.beaten(b);
    return { gap, deathsPerMinute, quiet, mixing: living ? near / living : 0, score: recognition * Math.min(1, quiet / QUIET), unified };
  }

  tick(dt: number): void {
    this.time += dt;
    for (const c of this.colonies) c.tick(dt);
    const fungal = this.fungus.due(dt);
    // Occupancy is needed every tick with a rival (fights, recognition), underground (crowded digging, backfill), or when the fungus steps.
    if (this.colonies.length > 1 || fungal || this.map.hasSoil) this.#refresh();
    this.#fightDeaths *= Math.exp(-dt / QUIET);
    if (this.colonies.length > 1) {
      const died = resolveFights(this.colonies, this.#grids, dt, this.#rng, this.params.fight, this.recognition).reduce((x, y) => x + y, 0);
      if (died > 0) {
        this.#fightDeaths += died;
        this.#lastFightDeath = this.time;
      }
      // Odours: the gestalt at each nest, and blending where the fungus runs it.
      this.recognition.advance(this.colonies, dt);
    }
    // After fights: the dead neither pass load on nor groom (the occupancy grids still count them as groomers for this one step).
    // The fungus steps every few ticks (fungus.ts advance); when it is idle its clock does not run.
    // The midden's spores (nest slices 7–8) are laid as each corpse is buried: see onBury in the constructor.
    if (this.#piles) this.#regrow(dt);
    if (this.fungus.active) this.fungus.advance(this.colonies, this.#grids, dt, this.colonies.length > 1 ? this.recognition : null);
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
          return;
        }
        // Raids go to the nearest colony still a rival (one may have fallen, or come to smell like kin).
        this.#aimRaids(k);
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
  land(k: number, strain: number, spores = LANDING.spores): { x: number; y: number } {
    if (this.landed) return this.landed;
    const c = this.colonies[k] ?? this.player;
    const e = c.nest.entrance ?? { x: c.nest.x + c.nest.r, y: c.nest.y };
    const x = e.x + LANDING.offset;
    const y = e.y - (c.nest.entrance ? 0.5 : 0);
    this.fungus.paint(this.colonies, x, y, LANDING.radius, spores, 0, strain);
    this.landed = { colony: k, x, y, at: this.time };
    return this.landed;
  }

  /** The spore brush: spores on the ground within `radius` of (x, y), and a dose of load into every ant there, of any colony. */
  paintSpores(x: number, y: number, radius: number, spores: number, dose: number, strain: number): void {
    this.fungus.paint(this.colonies, x, y, radius, spores, dose, strain);
  }

  /**
   * Beaten: no ants left and too little food in the larder for one more. In the side view (nest slice 4) ants come
   * only from brood: no workers and no pupa or fully fed larva left (eggs and hungry larvae need nurses), whatever the queen or the larder.
   */
  static beaten(c: Colony): boolean {
    if (c.queen) return c.population === 0 && !c.brood.items.some((b) => b.stage === PUPA || (b.stage === LARVA && isFed(b)));
    return c.population === 0 && c.larder < c.params.foodPerAnt;
  }

  /** The first colony that is beaten, by index, or −1. */
  fallen(): number {
    return this.colonies.findIndex((c) => Game.beaten(c));
  }

  outcome(): Outcome {
    if (this.fallen() >= 0) return "fallen";
    return this.rival && this.unity().unified ? "unified" : "playing";
  }

  // ——— saving (save.ts, ja-lo8.6) ———

  /**
   * The whole game as JSON: the map as dug and eaten, every colony, the fungus, recognition, the game's clocks and its
   * random streams. `load` puts it back into a game built afresh from the same world and settings (the page's
   * ui/saves.ts keeps the seed, view and settings beside it).
   */
  save(): GameSave {
    const map = Object.fromEntries(Object.entries(this.map).filter(([k]) => k !== "nests" && k !== "nest"));
    return {
      version: SAVE_VERSION,
      time: this.time,
      strategyChoices: this.strategyChoices,
      landed: encode(this.landed),
      regrown: this.regrown,
      params: encode(this.params),
      map: encode(map),
      colonies: this.colonies.map((c) => c.saveState()),
      raids: this.colonies.map((c) => this.colonies.findIndex((o) => o.ph === c.raidMarks)),
      fungus: this.fungus.saveState(),
      recognition: this.recognition.saveState(),
      private: { fightDeaths: this.#fightDeaths, lastFightDeath: this.#lastFightDeath, nextStrategy: this.#nextStrategy, regrowClock: this.#regrowClock, rng: (this.#rng as Partial<Rng>).state ?? null, regrowRng: this.#regrowRng?.state ?? null },
    };
  }

  /** A save back into this game, built afresh from the same world and settings (Game.save). */
  load(saved: GameSave): void {
    if (saved.version !== SAVE_VERSION) throw new Error(`save: version ${saved.version}, this game reads ${SAVE_VERSION}`);
    if (saved.colonies.length !== this.colonies.length) throw new Error(`save: ${saved.colonies.length} colonies, this game has ${this.colonies.length}`);
    this.time = saved.time;
    this.strategyChoices = saved.strategyChoices;
    this.landed = decode(saved.landed) as Game["landed"];
    this.regrown = saved.regrown;
    this.params = decode(saved.params) as GameParams;
    fillLike(this.map, saved.map);
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
    this.#nextStrategy = p.nextStrategy;
    this.#regrowClock = p.regrowClock;
    if (p.rng !== null && "state" in this.#rng) (this.#rng as Rng).state = p.rng;
    if (p.regrowRng !== null && this.#regrowRng) this.#regrowRng.state = p.regrowRng;
    this.#refresh();
  }
}
