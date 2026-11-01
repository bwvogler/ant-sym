import { type Channel, Pheromones } from "./pheromone.ts";
import { blocked, dropFood, rockAt, takeFood, type Nest, type WorldMap } from "./world.ts";

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
// choices; so is shying away from alarm (unless fighting). Which mode to be
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

/** What a mode choice may depend on: few values, so an answer can be cached per situation. Carrying ants are never asked: they go home. */
export interface Situation {
  mode: Mode;
  /** out longer than the colony's patience without finding food */
  tired: boolean;
  foodTrail: Trail;
  homeTrail: Trail;
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
const ENEMY = 0.5;

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

export const DEFAULT_COLONY: ColonyParams = { antCount: 800, maxAnts: 1200, foodPerAnt: 4, nest: 0, speed: 7, sensorDistance: 3, sensorAngle: 0.6, turnRate: 6, wander: 4, deposit: 4, depositDecay: 20, patience: 60, alarmAvoid: 1.5, odour: 0, tolerance: 0.35 };

/** A food cell seen by a sensor, or the nest seen by a homing ant, beats any trail. */
const SEEN = 100;
/** Cells around an ant it checks for enemies (a square of side 2 × ENEMY_RANGE + 1). */
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
  alive: Uint8Array;
  /** bumped every time a slot gets a new ant, so (slot, gen) names one ant even after its slot is reused */
  gen: Uint32Array;
  /** seconds since the ant was last at the nest or picked up food */
  since: Float32Array;
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
  /** homing round an obstacle by touch: 0 = not; +1 = keeping the wall on its right, −1 = on its left */
  wall: Int8Array;
  /** straight-line distance home (its own home vector) when it met the wall it is following */
  hitDist: Float32Array;
  /** seconds spent following the current wall */
  followT: Float32Array;
  /** seconds since a wall-following ant last touched rock (ahead, or on its wall side) */
  untouched: Float32Array;
  /** where this homing trip first met rock (NaN until it does): with the nest it fixes the line the ant leaves walls on */
  mx: Float32Array;
  my: Float32Array;
  /** the situation each ant was last asked about, encoded; −1 = never */
  #asked: Int16Array;
  /** the question behind each ant's current mode: its situation (with the mode it had) when last asked; −1 = never */
  #question: Int16Array;
  /** enemy ants per cell, kept by the game each tick; null when there is no rival */
  enemies: CellCounts | null = null;
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
    this.alive = new Uint8Array(n);
    this.gen = new Uint32Array(n);
    this.since = new Float32Array(n);
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
    this.wall = new Int8Array(n);
    this.hitDist = new Float32Array(n);
    this.followT = new Float32Array(n);
    this.untouched = new Float32Array(n);
    this.mx = new Float32Array(n).fill(NaN);
    this.my = new Float32Array(n).fill(NaN);
    this.#asked = new Int16Array(n).fill(-1);
    this.#question = new Int16Array(n).fill(-1);
    // Colonies step their fields on different ticks, so a tick never pays for every colony's at once.
    this.ph.phase((this.params.nest % 2) * 0.5);
    for (let k = 0; k < this.params.antCount; k++) this.#place(k);
  }

  #place(i: number): void {
    const a = this.#rng() * Math.PI * 2;
    const r = this.#rng() * this.nest.r * 0.8;
    this.x[i] = this.nest.x + Math.cos(a) * r;
    this.y[i] = this.nest.y + Math.sin(a) * r;
    this.heading[i] = a;
    this.mode[i] = EXPLORE;
    this.carrying[i] = 0;
    this.since[i] = 0;
    this.detour[i] = 0;
    this.bumps[i] = 0;
    // A newborn is clean and unprimed.
    this.load[i] = 0;
    this.strain[i] = 0;
    this.resist[i] = 0;
    this.expr[i] = 0;
    this.asIs(i);
    // A newborn smells of its colony as the colony smells now.
    this.odour[i] = this.nestOdour;
    this.wall[i] = 0;
    this.mx[i] = NaN;
    this.untouched[i] = 0;
    this.#asked[i] = -1;
    this.#question[i] = -1;
    this.gen[i] = ((this.gen[i] as number) + 1) >>> 0;
    this.alive[i] = 1;
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
  }

  /** Living ants. */
  get population(): number {
    let s = 0;
    for (const v of this.alive) s += v;
    return s;
  }

  /** A new ant at the nest, in the first free slot; false when the colony is at its cap. */
  spawn(): boolean {
    const i = this.alive.indexOf(0);
    if (i < 0) return false;
    this.#place(i);
    this.births++;
    return true;
  }

  /** Ant i dies where it stands; food it carried drops on that cell. */
  kill(i: number): void {
    if (!this.alive[i]) return;
    if (this.carrying[i]) dropFood(this.map, this.x[i] as number, this.y[i] as number, 1);
    this.alive[i] = 0;
    this.carrying[i] = 0;
    this.losses++;
    this.recentLosses++;
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
    for (let cy = Math.max(0, Math.floor(y - radius)); cy <= Math.min(size.h - 1, Math.floor(y + radius)); cy++)
      for (let cx = Math.max(0, Math.floor(x - radius)); cx <= Math.min(size.w - 1, Math.floor(x + radius)); cx++) {
        if (rockAt(this.map, cx, cy) || Math.hypot(cx + 0.5 - x, cy + 0.5 - y) > radius) continue;
        this.ph.deposit(channel, cx + 0.5, cy + 0.5, amount);
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
      larder: this.larder >= 2 * this.params.foodPerAnt ? "full" : "low",
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
    if (sx < 0 || sy < 0 || sx >= map.size.w || sy >= map.size.h) {
      s[slot] = s[slot + 3] = s[slot + 6] = -1;
      return;
    }
    const cx = Math.floor(sx);
    const cy = Math.floor(sy);
    if (map.rock.get(cx, cy) === 1) {
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
    this.detour[i] = 0;
    this.bumps[i] = 0;
    this.wall[i] = 0;
    this.mx[i] = NaN;
    this.untouched[i] = 0;
  }

  /**
   * Whether ant i at (x, y) is back on its line home: the line from where this trip first met rock
   * to the nest (Bug2's "m-line"). Leaving walls only there is what guarantees getting round: leaving
   * anywhere nearer settles ants in the deepest bay facing the nest.
   */
  #onMLine(i: number, x: number, y: number): boolean {
    const ax = this.mx[i] as number;
    const ay = this.my[i] as number;
    if (Number.isNaN(ax)) return true;
    const dx = this.nest.x - ax;
    const dy = this.nest.y - ay;
    const len = Math.hypot(dx, dy);
    if (len < 1e-6) return true;
    return Math.abs((x - ax) * dy - (y - ay) * dx) / len < M_LINE_WIDTH;
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
    const cx = Math.floor(this.x[i] as number);
    const cy = Math.floor(this.y[i] as number);
    if (!g.any(cx - ENEMY_RANGE, cy - ENEMY_RANGE, cx + ENEMY_RANGE, cy + ENEMY_RANGE)) return null;
    let best = Infinity;
    let heading: number | null = null;
    for (let dy = -ENEMY_RANGE; dy <= ENEMY_RANGE; dy++) {
      const y = cy + dy;
      if (y < 0 || y >= h) continue;
      for (let dx = -ENEMY_RANGE; dx <= ENEMY_RANGE; dx++) {
        const x = cx + dx;
        if (x < 0 || x >= w || g.get(x, y) < ENEMY) continue;
        const d = dx * dx + dy * dy;
        if (d < best) {
          best = d;
          heading = Math.atan2(y + 0.5 - (this.y[i] as number), x + 0.5 - (this.x[i] as number));
        }
      }
    }
    return heading;
  }

  /** Advance by dt seconds: ants decide (when their situation changed), steer, lay trail, move; then the fields evaporate and spread, and stored food becomes ants. */
  tick(dt: number): void {
    const p = this.params;
    const rng = this.#rng;
    const { map, ph, nest } = this;
    const a = p.sensorAngle;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    this.time += dt;
    this.recentLosses *= Math.exp(-dt / 30);
    for (let i = 0; i < this.n; i++) {
      if (!this.alive[i]) continue;
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
      const carrying = this.carrying[i] === 1;
      let mode = this.mode[i] as number;
      if (carrying) {
        mode = RETURN;
        this.mode[i] = RETURN;
        this.#asked[i] = -1;
        this.#question[i] = -1; // going home is not a choice; the next question comes once the food is down
      } else {
        const tired = (this.since[i] as number) > p.patience * (this.clock[i] as number);
        const food = trailLevel(Math.max(fl, ff, fr));
        const home = trailLevel(Math.max(hl, hf, hr));
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
      // Steer by mode.
      const noise = (rng() - 0.5) * 2 * dt;
      const detouring = (this.detour[i] as number) > 0;
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
        const side = this.wall[i] as number;
        if (side === 0) {
          // Free: the home vector, with the home trail as a hint only (climbing it at full rate let
          // clusters of homing ants circle on their own trail). After giving up on a wall, wander a while.
          if (detouring) h += noise * p.wander;
          else {
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
            h += Math.PI;
          }
          const dist = Math.hypot(nest.x - x, nest.y - y);
          if (dist < (this.hitDist[i] as number) - 1 && this.#onMLine(i, x, y) && !this.#touch(x, y, toNest, 1.5)) {
            this.wall[i] = 0; // back on its line home, nearer than where it met this wall, and the way is open
            h = turnToward(h, toNest, p.turnRate * dt * 0.8);
          } else if (t >= FOLLOW_GIVE_UP) {
            // Not round after a long while: wander a good while, then try afresh.
            this.wall[i] = 0;
            this.mx[i] = NaN;
            this.bumps[i] = 5;
            this.detour[i] = 8 + 16 * rng();
          } else {
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
        }
      } else if (mode === FOLLOW) {
        h += climb(fl, ff, fr, p.turnRate * dt) + noise * p.wander * 0.25;
      } else if (mode === FIGHT) {
        // A calm ant (the fungus's cue) does not charge.
        if (toEnemy !== null) h = turnToward(h, toEnemy, p.turnRate * dt * 2 * (1 - (this.calm[i] as number)));
        else if (Math.max(al, af, ar) >= FAINT) h += climb(al, af, ar, p.turnRate * dt);
        else if (this.stance === "raid" && this.raidTarget && !detouring) {
          const t = this.raidTarget;
          h = turnToward(h, Math.atan2(t.y - (this.y[i] as number), t.x - (this.x[i] as number)), p.turnRate * dt * 0.5) + noise * p.wander * 0.25;
        } else h += noise * p.wander;
      } else {
        const seen = Math.max(fl, ff, fr) >= SEEN;
        h += seen ? climb(fl, ff, fr, p.turnRate * dt) : noise * p.wander;
      }
      // Every mode but fighting shies away from alarm.
      if (mode !== FIGHT) h += avoid(al, af, ar, p.turnRate * p.alarmAvoid * dt);

      // Lay trail: walking out marks the way home, carrying food marks the way to it. The fungus can make it louder
      // or quieter, and have a carrier leak its food trail into the other colony's field (exact as-is: × 1, nothing leaked).
      const laid = p.deposit * Math.exp(-(this.since[i] as number) / p.depositDecay) * dt * (this.layGain[i] as number);
      ph.deposit(carrying ? "food" : "home", this.x[i] as number, this.y[i] as number, laid);
      const leak = this.crossLay[i] as number;
      if (carrying && leak > 0 && this.foreign) this.foreign.deposit("food", this.x[i] as number, this.y[i] as number, laid * leak);

      // Move; rock or the edge turns the ant back somewhere random.
      const nx = (this.x[i] as number) + Math.cos(h) * p.speed * dt;
      const ny = (this.y[i] as number) + Math.sin(h) * p.speed * dt;
      this.detour[i] = (this.detour[i] as number) - dt;
      this.bumps[i] = Math.max(0, (this.bumps[i] as number) - dt / 4);
      if (blocked(map, nx, ny) || squeezes(map, this.x[i] as number, this.y[i] as number, nx, ny)) {
        // Read afresh: a give-up earlier this tick has just started a wander, and must not start a new wall.
        const wandering = (this.detour[i] as number) > 0;
        if (mode === RETURN && !wandering) {
          // Homing: start (or keep) following this wall by touch instead of turning at random.
          const x = this.x[i] as number;
          const y = this.y[i] as number;
          if (this.wall[i] === 0) {
            const toNest = Math.atan2(nest.y - y, nest.x - x);
            if (Number.isNaN(this.mx[i] as number)) {
              // The first rock this trip: remember where, so the line from here to the nest is the way home it keeps returning to.
              this.mx[i] = x;
              this.my[i] = y;
            }
            this.wall[i] = wallSide(this.#touch(x, y, toNest - WALL_PROBE, 1.2), this.#touch(x, y, toNest + WALL_PROBE, 1.2), rng);
            this.hitDist[i] = Math.hypot(nest.x - x, nest.y - y);
            // Back on a wall it lost touch with: the clock runs on, or let-go and re-bump would never give up.
            if (!((this.untouched[i] as number) > WALL_LOST)) this.followT[i] = 0;
            this.untouched[i] = 0;
          }
          h -= (this.wall[i] as number) * (Math.PI / 2); // turn away from the wall, along it
        } else if (mode === RETURN) {
          // Homing, wandering after giving up on a wall: turn, but don't make the wander longer.
          h += Math.PI / 2 + rng() * Math.PI;
        } else {
          h += Math.PI / 2 + rng() * Math.PI;
          // Each bump soon after another doubles the detour: 0.5–1.5 s, then 1–3 s, … up to 8–24 s.
          this.bumps[i] = Math.min(5, (this.bumps[i] as number) + 1);
          this.detour[i] = Math.max(this.detour[i] as number, 0.5 * 2 ** Math.floor(this.bumps[i] as number) * (0.5 + rng()));
        }
      } else {
        this.x[i] = nx;
        this.y[i] = ny;
      }

      // Mechanics: pick up food where there is some (not mid-fight), put it down at the nest; the nest rests a tired ant.
      const ndx = (this.x[i] as number) - nest.x;
      const ndy = (this.y[i] as number) - nest.y;
      const atNest = ndx * ndx + ndy * ndy < nest.r * nest.r;
      if (!carrying && mode !== FIGHT && takeFood(map, this.x[i] as number, this.y[i] as number)) {
        this.carrying[i] = 1;
        this.#homeAfresh(i);
        this.since[i] = 0;
        h += Math.PI;
      } else if (atNest) {
        this.wall[i] = 0;
        this.mx[i] = NaN;
        this.untouched[i] = 0;
        if (carrying) {
          this.carrying[i] = 0;
          this.stored++;
          this.larder++;
          h += Math.PI;
        }
        this.since[i] = 0;
      } else this.since[i] = (this.since[i] as number) + dt;
      this.heading[i] = h;
    }
    ph.advance(dt);
    // Growth: the larder turns into ants while there is room.
    while (this.larder >= p.foodPerAnt && this.spawn()) this.larder -= p.foodPerAnt;
  }
}

/** Every situation a mode choice can be asked in: mode × tired × food × home × alarm × enemy × stance = 4 × 2 × 3 × 3 × 3 × 2 × 3 = 1,296. */
export const SITUATIONS = MODES.length * 2 * TRAILS.length ** 3 * 2 * STANCES.length;

/** A situation from its index in SITUATIONS: the inverse of encode. */
export function decode(code: number): Situation {
  let c = code;
  const stance = STANCES[c % 3] as Stance;
  c = Math.floor(c / 3);
  const enemy = c % 2 ? "near" : "none";
  c = Math.floor(c / 2);
  const alarm = TRAILS[c % 3] as Trail;
  c = Math.floor(c / 3);
  const homeTrail = TRAILS[c % 3] as Trail;
  c = Math.floor(c / 3);
  const foodTrail = TRAILS[c % 3] as Trail;
  c = Math.floor(c / 3);
  const tired = c % 2 === 1;
  const mode = MODES[Math.floor(c / 2)] as Mode;
  return { mode, tired, foodTrail, homeTrail, alarm, enemy, stance };
}

export function encodeSituation(s: Situation): number {
  return encode(MODES.indexOf(s.mode), s.tired, s.foodTrail, s.homeTrail, s.alarm, s.enemy === "near" ? 1 : 0, STANCES.indexOf(s.stance));
}

function encode(mode: number, tired: boolean, food: Trail, home: Trail, alarm: Trail, enemy: number, stance: number): number {
  return (((((mode * 2 + (tired ? 1 : 0)) * 3 + TRAILS.indexOf(food)) * 3 + TRAILS.indexOf(home)) * 3 + TRAILS.indexOf(alarm)) * 2 + enemy) * 3 + stance;
}

/** Seconds of wall-following before giving up on this wall for a while (a big rock mass can take over a minute to walk round). */
export const FOLLOW_GIVE_UP = 120;
/** Seconds of wall-following before trying the other side once (same line home). */
export const FOLLOW_FLIP = 45;
/** Seconds a wall-following ant may touch no rock before it lets go of the wall (the hug would circle in the open). */
export const WALL_LOST = 1.5;
/** How near (cells) an ant must be to its line home to count as back on it: a step is ~0.23 cells, so it can't skip over. */
const M_LINE_WIDTH = 0.6;
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

/**
 * A step that crosses diagonally into the next cell between two rock cells: blocked, like rock.
 * Movement otherwise only checks where the step lands, so ants could slip through a rock corner
 * into pockets they can't walk out of (4-connected), and sit there forever.
 */
export function squeezes(map: WorldMap, x: number, y: number, nx: number, ny: number): boolean {
  const cx = Math.floor(x);
  const cy = Math.floor(y);
  const tx = Math.floor(nx);
  const ty = Math.floor(ny);
  return tx !== cx && ty !== cy && rockAt(map, tx, cy) === 1 && rockAt(map, cx, ty) === 1;
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
