import { CountGrid, resolveFights, occupancy, DEFAULT_FIGHT, type FightParams } from "./battle.ts";
import { Colony, localPolicy, localStance, type ColonyParams, type Policy, type StancePolicy } from "./colony.ts";
import { Fungus, type FungusParams } from "./fungus.ts";
import { Recognition, type RecognitionParams } from "./recognition.ts";
import type { WorldMap } from "./world.ts";

// The game, pure: the player's colony and (optionally) a rival on one map,
// sharing its food. Each tick: the colonies move (each seeing the other's
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
}

export const DEFAULT_GAME: GameParams = { antCount: 800, rival: true, rivalAnts: 800, strategyEvery: 5, nestWatch: 12, fight: DEFAULT_FIGHT, fungus: {}, recognition: {} };

export type Outcome = "playing" | "won" | "lost" | "unified";

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

/** Seconds without a fight death that unity asks for. */
export const QUIET = 60;

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

  constructor(map: WorldMap, params: Partial<GameParams> = {}, rng: () => number = Math.random, player: { policy?: Policy; stance?: StancePolicy; colony?: Partial<ColonyParams> } = {}) {
    this.map = map;
    this.params = { ...DEFAULT_GAME, ...params };
    this.#rng = rng;
    this.recognition = new Recognition(this.params.recognition);
    const tolerance = this.recognition.params.tolerance;
    // Each colony starts at its own odour, as far apart as odours go: 0 and 1.
    const mine = new Colony(map, { antCount: this.params.antCount, nest: 0, odour: 0, tolerance, ...player.colony }, rng, player.policy ?? localPolicy, player.stance ?? localStance);
    this.colonies = [mine];
    if (this.params.rival && map.nests.length > 1) this.colonies.push(new Colony(map, { antCount: this.params.rivalAnts, nest: 1, odour: 1, tolerance }, rng));
    this.#grids = this.colonies.map(() => new CountGrid());
    this.fungus = new Fungus(map, this.params.fungus);
    this.colonies.forEach((c, k) => {
      if (this.colonies.length > 1) {
        c.enemies = this.recognition;
        c.raidTarget = this.colonies[1 - k]!.nest;
        // Only ants whose perception the fungus has bent read it (Colony.foreignFood).
        c.foreign = this.colonies[1 - k]!.ph;
      }
    });
    this.#refresh();
  }

  get player(): Colony {
    return this.colonies[0] as Colony;
  }

  get rival(): Colony | null {
    return this.colonies[1] ?? null;
  }

  /** Occupancy per colony, and every ant by odour band: built from the ants, never by scanning the map. */
  #refresh(): void {
    this.colonies.forEach((c, k) => occupancy(c, this.#grids[k] as CountGrid));
    if (this.colonies.length > 1) this.recognition.build(this.colonies);
  }

  /** Strangers (to the nest's odour, at the healthy tolerance) within `nestWatch` cells of colony k's nest. */
  enemiesNearNest(k: number): number {
    const c = this.colonies[k] as Colony;
    const rec = this.recognition;
    rec.look(c.nestOdour, rec.params.tolerance);
    const { w, h } = this.map.size;
    const r = this.params.nestWatch;
    let s = 0;
    for (let y = Math.max(0, Math.floor(c.nest.y - r)); y <= Math.min(h - 1, Math.floor(c.nest.y + r)); y++)
      for (let x = Math.max(0, Math.floor(c.nest.x - r)); x <= Math.min(w - 1, Math.floor(c.nest.x + r)); x++) s += rec.get(x, y);
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
    if (this.colonies.length > 1 || fungal) this.#refresh();
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
        // A stance is part of every ant's situation: a change re-asks the ants by itself.
        c.stance = c.stancePolicy(c.stanceSituation(this.enemiesNearNest(k) > 0));
        this.strategyChoices++;
      });
    }
  }

  /** The spore brush: spores on the ground within `radius` of (x, y), and a dose of load into every ant there, of any colony. */
  paintSpores(x: number, y: number, radius: number, spores: number, dose: number, strain: number): void {
    this.fungus.paint(this.colonies, x, y, radius, spores, dose, strain);
  }

  /** Beaten: no ants left and too little food in the larder for one more. */
  static beaten(c: Colony): boolean {
    return c.population === 0 && c.larder < c.params.foodPerAnt;
  }

  outcome(): Outcome {
    if (Game.beaten(this.player)) return "lost";
    const r = this.rival;
    if (r && Game.beaten(r)) return "won";
    return r && this.unity().unified ? "unified" : "playing";
  }
}
