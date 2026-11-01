import { resolveFights, occupancy, DEFAULT_FIGHT, type FightParams } from "./battle.ts";
import { Colony, localPolicy, localStance, type ColonyParams, type Policy, type StancePolicy } from "./colony.ts";
import type { WorldMap } from "./world.ts";

// The game, pure: the player's colony and (optionally) a rival on one map,
// sharing its food. Each tick: the colonies move (each seeing the other's
// ants through an enemy grid), then fights are resolved, then — every few
// seconds — each colony's strategist picks its stance from a coarse view of
// itself. A colony with no ants and too little food for one more is beaten.

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
}

export const DEFAULT_GAME: GameParams = { antCount: 800, rival: true, rivalAnts: 800, strategyEvery: 5, nestWatch: 12, fight: DEFAULT_FIGHT };

export type Outcome = "playing" | "won" | "lost";

export class Game {
  readonly map: WorldMap;
  readonly colonies: Colony[];
  params: GameParams;
  time = 0;
  /** stance choices made by strategists */
  strategyChoices = 0;
  #grids: Uint16Array[];
  #enemy: Uint16Array[];
  #nextStrategy = 0;
  #rng: () => number;

  constructor(map: WorldMap, params: Partial<GameParams> = {}, rng: () => number = Math.random, player: { policy?: Policy; stance?: StancePolicy; colony?: Partial<ColonyParams> } = {}) {
    this.map = map;
    this.params = { ...DEFAULT_GAME, ...params };
    this.#rng = rng;
    const mine = new Colony(map, { antCount: this.params.antCount, nest: 0, ...player.colony }, rng, player.policy ?? localPolicy, player.stance ?? localStance);
    this.colonies = [mine];
    if (this.params.rival && map.nests.length > 1) this.colonies.push(new Colony(map, { antCount: this.params.rivalAnts, nest: 1 }, rng));
    const cells = map.size.w * map.size.h;
    this.#grids = this.colonies.map(() => new Uint16Array(cells));
    this.#enemy = this.colonies.map(() => new Uint16Array(cells));
    this.colonies.forEach((c, k) => {
      if (this.colonies.length > 1) {
        c.enemies = this.#enemy[k] as Uint16Array;
        c.raidTarget = this.colonies[1 - k]!.nest;
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

  /** Occupancy per colony, and for each colony the sum of everyone else's. */
  #refresh(): void {
    this.colonies.forEach((c, k) => occupancy(c, this.#grids[k] as Uint16Array));
    this.colonies.forEach((_, k) => {
      const e = this.#enemy[k] as Uint16Array;
      e.fill(0);
      this.#grids.forEach((g, j) => {
        if (j === k) return;
        for (let i = 0; i < e.length; i++) e[i] = (e[i] as number) + (g[i] as number);
      });
    });
  }

  /** Enemies within `nestWatch` cells of colony k's nest. */
  enemiesNearNest(k: number): number {
    const c = this.colonies[k] as Colony;
    const e = this.#enemy[k] as Uint16Array;
    const { w, h } = this.map.size;
    const r = this.params.nestWatch;
    let s = 0;
    for (let y = Math.max(0, Math.floor(c.nest.y - r)); y <= Math.min(h - 1, Math.floor(c.nest.y + r)); y++)
      for (let x = Math.max(0, Math.floor(c.nest.x - r)); x <= Math.min(w - 1, Math.floor(c.nest.x + r)); x++) s += e[y * w + x] as number;
    return s;
  }

  tick(dt: number): void {
    this.time += dt;
    for (const c of this.colonies) c.tick(dt);
    if (this.colonies.length > 1) {
      this.#refresh();
      resolveFights(this.colonies, this.#grids, dt, this.#rng, this.params.fight);
    }
    if (this.time >= this.#nextStrategy) {
      this.#nextStrategy = this.time + this.params.strategyEvery;
      this.colonies.forEach((c, k) => {
        // With no living rival there is nothing to defend against or raid: forage, and ask nobody.
        // (Solo, "raid" turned explorers into fighters with no target, and the colony stopped foraging.)
        if (!this.colonies.some((o, j) => j !== k && !Game.beaten(o))) {
          c.stance = "forage";
          return;
        }
        // A stance is part of every ant's situation: a change re-asks the ants by itself.
        c.stance = c.stancePolicy(c.stanceSituation(this.enemiesNearNest(k) > 0));
        this.strategyChoices++;
      });
    }
  }

  /** Beaten: no ants left and too little food in the larder for one more. */
  static beaten(c: Colony): boolean {
    return c.population === 0 && c.larder < c.params.foodPerAnt;
  }

  outcome(): Outcome {
    if (Game.beaten(this.player)) return "lost";
    const r = this.rival;
    return r && Game.beaten(r) ? "won" : "playing";
  }
}
