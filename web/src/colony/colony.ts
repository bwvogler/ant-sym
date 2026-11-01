import { type Channel, Pheromones } from "./pheromone.ts";
import { blocked, dig, dropFood, OPEN, rockAt, SOIL, takeFood, type Nest, type WorldMap } from "./world.ts";

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
}

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
}

export const DEFAULT_COLONY: ColonyParams = { antCount: 800, maxAnts: 1200, foodPerAnt: 4, nest: 0, speed: 7, sensorDistance: 3, sensorAngle: 0.6, turnRate: 6, wander: 4, deposit: 4, depositDecay: 20, patience: 60, alarmAvoid: 1.5 };

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
  /** carrying a soil pellet it dug, home to the mound */
  pellet: Uint8Array;
  /** seconds of digging left at the soil face ahead; 0 = not digging */
  digT: Float32Array;
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
    this.pellet = new Uint8Array(n);
    this.digT = new Float32Array(n);
    this.hand = new Int8Array(n);
    this.hugT = new Float32Array(n);
    this.alive = new Uint8Array(n);
    this.gen = new Uint32Array(n);
    this.since = new Float32Array(n);
    this.detour = new Float32Array(n);
    this.bumps = new Float32Array(n);
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
    this.digT[i] = 0;
    this.hand[i] = this.#rng() < 0.5 ? -1 : 1;
    this.hugT[i] = 0;
    this.since[i] = 0;
    this.detour[i] = 0;
    this.bumps[i] = 0;
    this.wall[i] = 0;
    this.mx[i] = NaN;
    this.gx[i] = NO_CELL;
    this.byCell[i] = 0;
    this.#asked[i] = -1;
    this.#question[i] = -1;
    this.gen[i] = ((this.gen[i] as number) + 1) >>> 0;
    this.alive[i] = 1;
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

  /** Ant i dies where it stands; food it carried drops on that cell (a soil pellet is just lost). */
  kill(i: number): void {
    if (!this.alive[i]) return;
    if (this.carrying[i]) dropFood(this.map, this.x[i] as number, this.y[i] as number, 1);
    this.alive[i] = 0;
    this.carrying[i] = 0;
    this.pellet[i] = 0;
    this.digT[i] = 0;
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
    if (map.rock.get(cx, cy) !== OPEN) {
      s[slot] = s[slot + 3] = s[slot + 6] = -1;
      return;
    }
    const f = this.ph.fields;
    s[slot] = map.food.get(cx, cy) > 0 ? SEEN : f.food.get(cx, cy);
    const ndx = sx - nest.x;
    const ndy = sy - nest.y;
    s[slot + 3] = ndx * ndx + ndy * ndy < nest.r * nest.r ? SEEN : f.home.get(cx, cy);
    s[slot + 6] = f.alarm.get(cx, cy);
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
    const dx = this.nest.x - ax;
    const dy = this.nest.y - ay;
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
    // A target that isn't this cell or a neighbour is stale (from before a detour, say): decide afresh.
    const fresh = this.gx[i] === NO_CELL || Math.abs((this.gx[i] as number) - Math.floor(x)) + Math.abs((this.gy[i] as number) - Math.floor(y)) > 1;
    if (!fresh && Math.hypot((this.gx[i] as number) + 0.5 - x, (this.gy[i] as number) + 0.5 - y) > step) return true;
    const cx = fresh ? Math.floor(x) : (this.gx[i] as number);
    const cy = fresh ? Math.floor(y) : (this.gy[i] as number);
    if (!tunnel(map, cx, cy)) {
      if (mode === EXPLORE && (this.hugT[i] as number) > 0) return this.#hug(i, cx, cy, fresh);
      this.gx[i] = NO_CELL;
      return false;
    }
    let dir = fresh ? gridDir(this.heading[i] as number) : (this.gdir[i] as number);
    if (mode === RETURN || mode === FOLLOW) {
      // The way ahead (not back, unless it's a dead end) with the most scent: home scent, laid by
      // ants walking out, for a homing ant; food scent for a follower. No scent at all: a hand on the wall.
      const field = mode === RETURN ? this.ph.fields.home : this.ph.fields.food;
      let best = -1;
      let bestV = 0;
      for (const turn of [0, 1, -1]) {
        const d = (dir + turn) & 3;
        const tx = cx + (DX[d] as number);
        const ty = cy + (DY[d] as number);
        if (rockAt(map, tx, ty) !== OPEN) continue;
        const v = field.get(tx, ty);
        if (v > bestV) {
          bestV = v;
          best = d;
        }
      }
      dir = best < 0 ? handOnWall(map, cx, cy, dir, -(this.hand[i] as number)) : best;
    } else {
      const side = this.hand[i] as number;
      const next = handOnWall(map, cx, cy, dir, side);
      if (next === ((dir + 2) & 3) || rockAt(map, cx + (DX[next] as number), cy + (DY[next] as number)) !== OPEN) {
        // A dead end: dig on, ahead or (now and then) to a side, wherever there's soil a tunnel may go through.
        const ways = this.#rng() < FORK ? [dir + side, dir - side, dir] : [dir, dir + side, dir - side];
        let dug = -1;
        for (const w of ways) {
          const d = w & 3;
          const tx = cx + (DX[d] as number);
          const ty = cy + (DY[d] as number);
          if (rockAt(map, tx, ty) === SOIL && diggable(map, tx, ty, d)) {
            dug = d;
            break;
          }
        }
        if (dug < 0 && rockAt(map, cx + (DX[next] as number), cy + (DY[next] as number)) !== OPEN) {
          this.gx[i] = NO_CELL; // walled in on every side (it can't be, having walked in): steer freely
          return false;
        }
        dir = dug < 0 ? next : dug;
      } else dir = next;
    }
    this.gdir[i] = dir;
    this.gx[i] = cx + (DX[dir] as number);
    this.gy[i] = cy + (DY[dir] as number);
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
    const wallDir = (dir + side) & 3;
    const wx = cx + (DX[wallDir] as number);
    const wy = cy + (DY[wallDir] as number);
    if (!fresh && rockAt(map, wx, wy) === SOIL && this.#rng() < START_HUG && startable(map, wx, wy, wallDir)) dir = wallDir;
    else dir = handOnWall(map, cx, cy, dir, side);
    this.gdir[i] = dir;
    this.gx[i] = cx + (DX[dir] as number);
    this.gy[i] = cy + (DY[dir] as number);
    return true;
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
    for (let d = 0; d < 4; d++) {
      const tx = x + (DX[d] as number);
      const ty = y + (DY[d] as number);
      if (rockAt(this.map, tx, ty) === OPEN && home.get(tx, ty) >= FAINT) return true;
    }
    return false;
  }

  /** The heading from ant i to the centre of its target cell. */
  #towardTarget(i: number): number {
    return Math.atan2((this.gy[i] as number) + 0.5 - (this.y[i] as number), (this.gx[i] as number) + 0.5 - (this.x[i] as number));
  }

  /** Touch: is there rock (or the map's edge) `d` cells from ant i's position along `angle`? */
  #touch(x: number, y: number, angle: number, d: number): boolean {
    return blocked(this.map, x + Math.cos(angle) * d, y + Math.sin(angle) * d);
  }

  /** The nearest cell holding enemies within ENEMY_RANGE of ant i, as a heading, or null. */
  #enemyHeading(i: number): number | null {
    const g = this.enemies;
    if (!g) return null;
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
        if (x < 0 || x >= w || !g.get(x, y)) continue;
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
      // So does one carrying a soil pellet it dug, to drop on the mound.
      const carrying = this.carrying[i] === 1;
      const pellet = this.pellet[i] === 1;
      let mode = this.mode[i] as number;
      const prevMode = mode;
      if (carrying || pellet) {
        mode = RETURN;
        this.mode[i] = RETURN;
        this.#asked[i] = -1;
        this.#question[i] = -1; // going home is not a choice; the next question comes once the food is down
      } else {
        const tired = (this.since[i] as number) > p.patience;
        const food = trailLevel(Math.max(fl, ff, fr));
        const home = trailLevel(Math.max(hl, hf, hr));
        const alarm = trailLevel(Math.max(al, af, ar));
        const enemy = toEnemy === null ? 0 : 1;
        const stance = STANCES.indexOf(this.stance);
        const before = encode(mode, tired, food, home, alarm, enemy, stance);
        if (before !== this.#asked[i]) {
          mode = MODES.indexOf(this.policy({ mode: MODES[mode] as Mode, tired, foodTrail: food, homeTrail: home, alarm, enemy: enemy ? "near" : "none", stance: this.stance }));
          if (mode < 0) mode = tired ? RETURN : EXPLORE; // a policy answering nonsense falls back to the plain rule
          this.mode[i] = mode;
          this.#asked[i] = encode(mode, tired, food, home, alarm, enemy, stance);
          this.seen[before] = 1;
          this.#question[i] = before;
          this.decisions++;
        }
      }
      // Steer by mode. An explorer at a soil face keeps its heading while it digs.
      const noise = (rng() - 0.5) * 2 * dt;
      const detouring = (this.detour[i] as number) > 0;
      if (mode !== EXPLORE) this.digT[i] = 0;
      if (mode !== EXPLORE || pellet) this.hugT[i] = 0;
      else this.hugT[i] = Math.max(0, (this.hugT[i] as number) - dt);
      if (mode !== prevMode) this.gx[i] = NO_CELL;
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
        const side = this.wall[i] as number;
        if (side === 0 && !detouring && this.#walkTunnel(i, RETURN, p.speed * dt)) {
          h = this.#towardTarget(i); // in a tunnel: back the way it came (a wall it is already following, it keeps following)
        } else if (side === 0) {
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
            this.gdir[i] = ((this.gdir[i] as number) + 2) & 3;
            this.gx[i] = NO_CELL; // decide afresh from here
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
            // Soil, or a tunnel: cell by cell, a hand on the wall. At each cell's centre, feel right (for
            // a wall on the right), ahead, left, behind, and take the first open way. In a tunnel this
            // walks the tunnel (steering by touch can't, one cell wide); in a tree of tunnels it visits every branch.
            const reached = this.gx[i] === NO_CELL || Math.hypot((this.gx[i] as number) + 0.5 - x, (this.gy[i] as number) + 0.5 - y) <= p.speed * dt;
            if (reached) {
              const cx = this.gx[i] === NO_CELL ? Math.floor(x) : (this.gx[i] as number);
              const cy = this.gx[i] === NO_CELL ? Math.floor(y) : (this.gy[i] as number);
              const dist = Math.hypot(nest.x - cx - 0.5, nest.y - cy - 0.5);
              const ox = cx + 0.5;
              const oy = cy + 0.5;
              const open = !this.#touch(ox, oy, Math.atan2(nest.y - oy, nest.x - ox), 1.5);
              const leave =
                this.gx[i] !== NO_CELL &&
                ((dist < (this.hitDist[i] as number) - 1 && this.#onMLine(i, ox, oy, Math.SQRT1_2) && open) ||
                  // round an island and back where it met it, with the way home open (it met the island turning, not heading home)
                  (t > 2 && cx === Math.floor(this.mx[i] as number) && cy === Math.floor(this.my[i] as number) && open) ||
                  (dist < NEST_SIGHT && this.#clearTo(ox, oy, nest.x, nest.y)));
              if (leave || (tunnel(map, cx, cy) && this.#homeScentNear(cx, cy))) {
                // Back on its line home, nearer than where it met this wall, and the way is open; or the nest
                // itself is in plain view; or into a tunnel with home scent to lead it (see #walkTunnel).
                // A tunnel with none (a stub off a chamber) it keeps following the wall through.
                this.wall[i] = 0;
                h = turnToward(h, toNest, p.turnRate * dt * 0.8);
              } else {
                const d = handOnWall(map, cx, cy, this.gdir[i] as number, this.wall[i] as number);
                this.gdir[i] = d;
                this.gx[i] = cx + (DX[d] as number);
                this.gy[i] = cy + (DY[d] as number);
              }
            }
            if (this.wall[i] !== 0) h = Math.atan2((this.gy[i] as number) + 0.5 - y, (this.gx[i] as number) + 0.5 - x);
          }
        }
      } else if (mode === FOLLOW) {
        if (!digging && this.#walkTunnel(i, FOLLOW, p.speed * dt)) h = this.#towardTarget(i);
        else h += climb(fl, ff, fr, p.turnRate * dt) + noise * p.wander * 0.25;
      } else if (mode === FIGHT) {
        if (toEnemy !== null) h = turnToward(h, toEnemy, p.turnRate * dt * 2);
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
      if (!pellet) {
        const laid = p.deposit * Math.exp(-(this.since[i] as number) / p.depositDecay) * dt;
        ph.deposit(carrying ? "food" : "home", this.x[i] as number, this.y[i] as number, laid);
      }

      // Move; rock or the edge turns the ant back somewhere random.
      const nx = (this.x[i] as number) + Math.cos(h) * p.speed * dt;
      const ny = (this.y[i] as number) + Math.sin(h) * p.speed * dt;
      this.detour[i] = (this.detour[i] as number) - dt;
      this.bumps[i] = Math.max(0, (this.bumps[i] as number) - dt / 4);
      let face = mode === EXPLORE && !carrying && !pellet ? soilFace(map, this.x[i] as number, this.y[i] as number, nx, ny, h, this.gx[i] === Math.floor(nx) && this.gy[i] === Math.floor(ny)) : NO_FACE;
      if (face === START_FACE) face = digging || rng() < START ? DIG_FACE : GLANCE_X;
      if (face !== NO_FACE) {
        // Digging: an explorer that meets soil head-on bites at it for DIG_TIME (1–2 s), then the cell
        // is open and the ant carries the pellet home. Any other touch of soil puts a hand on the wall.
        if (face === GLANCE_X || face === GLANCE_Y) {
          this.digT[i] = 0; // a face that stopped being diggable (a neighbour dug beside it) is left
          this.hugT[i] = HUG_TIME;
          this.gdir[i] = (crossedDir(map, this.x[i] as number, this.y[i] as number, nx, ny) - (this.hand[i] as number)) & 3;
          this.gx[i] = NO_CELL;
        } else if (!digging) this.digT[i] = DIG_TIME * (1 + rng());
        else {
          const left = (this.digT[i] as number) - dt;
          this.digT[i] = Math.max(0, left);
          if (left <= 0 && dig(map, nx, ny)) {
            this.soilDug++;
            this.pellet[i] = 1;
            this.since[i] = 0;
            // A fresh trip home: the bumps and detour it ran up exploring the tunnels are behind it.
            this.detour[i] = 0;
            this.bumps[i] = 0;
            h += Math.PI;
          }
        }
      } else if (blocked(map, nx, ny) || squeezes(map, this.x[i] as number, this.y[i] as number, nx, ny)) {
        this.digT[i] = 0;
        if (mode === RETURN && !detouring) {
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
            this.followT[i] = 0;
            // Facing the wall it met, turned away from the side it keeps the wall on; the first cell decides the way on.
            this.gdir[i] = (crossedDir(map, x, y, nx, ny) - (this.wall[i] as number)) & 3;
            this.gx[i] = NO_CELL;
            this.byCell[i] = rockAt(map, Math.floor(nx), Math.floor(ny)) === SOIL || tunnel(map, Math.floor(x), Math.floor(y)) ? 1 : 0;
          }
          if (!this.byCell[i]) h -= (this.wall[i] as number) * (Math.PI / 2); // by touch: turn away from the wall, along it
        } else {
          h += Math.PI / 2 + rng() * Math.PI;
          // Each bump soon after another doubles the detour: 0.5–1.5 s, then 1–3 s, … up to 8–24 s.
          // Not for a homing ant already on one (after giving up on a wall): in a tunnel it bumps all
          // the time, and topping the detour up would keep it from ever trying for home again.
          this.bumps[i] = Math.min(5, (this.bumps[i] as number) + 1);
          if (mode !== RETURN) this.detour[i] = Math.max(this.detour[i] as number, 0.5 * 2 ** Math.floor(this.bumps[i] as number) * (0.5 + rng()));
        }
      } else {
        this.digT[i] = 0; // the face it was digging opened (another ant dug it), or it turned off it
        this.x[i] = nx;
        this.y[i] = ny;
      }

      // Mechanics: pick up food where there is some (not mid-fight), put it down at the nest; the nest rests a tired ant.
      const ndx = (this.x[i] as number) - nest.x;
      const ndy = (this.y[i] as number) - nest.y;
      const atNest = ndx * ndx + ndy * ndy < nest.r * nest.r;
      if (!carrying && !pellet && mode !== FIGHT && takeFood(map, this.x[i] as number, this.y[i] as number)) {
        this.carrying[i] = 1;
        this.wall[i] = 0;
        this.mx[i] = NaN;
        this.since[i] = 0;
        h += Math.PI;
      } else if (atNest) {
        this.wall[i] = 0;
        this.mx[i] = NaN;
        if ((this.since[i] as number) > 0) this.hand[i] = rng() < 0.5 ? -1 : 1; // just in: the next trip out keeps whichever hand on the walls
        if (carrying) {
          this.carrying[i] = 0;
          this.stored++;
          this.larder++;
          h += Math.PI;
        } else if (pellet) {
          // The soil goes on the mound: real ants dump it round the entrance, which is how mounds grow.
          this.pellet[i] = 0;
          this.soilOut++;
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
/** How near (cells) an ant must be to its line home to count as back on it: a step is ~0.23 cells, so it can't skip over. */
const M_LINE_WIDTH = 0.6;
/** A wall-follower this near the nest, with a clear way to it, sees (or smells) it and leaves the wall. */
const NEST_SIGHT = 8;
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
/** The four ways on the grid, as cell steps: east, south, west, north (angles grow clockwise, y down). */
const DX = [1, 0, -1, 0];
const DY = [0, 1, 0, -1];

/**
 * Whether cell (x, y) is in a tunnel: one cell wide wherever it is, so not part of any 2×2 square of
 * open ground (a chamber's cells all are). Junctions and crossings of tunnels count; a chamber's edge doesn't.
 */
export function narrow(map: WorldMap, x: number, y: number): boolean {
  for (let k = 0; k < 4; k++) {
    const ax = k & 1 ? 1 : -1;
    const ay = k & 2 ? 1 : -1;
    if (rockAt(map, x + ax, y) === OPEN && rockAt(map, x, y + ay) === OPEN && rockAt(map, x + ax, y + ay) === OPEN) return false;
  }
  return true;
}

/** A cell of a dug tunnel: narrow, with soil on at least one of its four sides. (A gap between rocks on the open surface isn't one.) */
export function tunnel(map: WorldMap, x: number, y: number): boolean {
  if (!narrow(map, x, y)) return false;
  for (let d = 0; d < 4; d++) if (rockAt(map, x + (DX[d] as number), y + (DY[d] as number)) === SOIL) return true;
  return false;
}

/**
 * The grid way (0 east, 1 south, 2 west, 3 north) of the solid a step from (x, y) to (nx, ny) ran into:
 * across the cell edge it crossed; crossing a corner, toward whichever of the two side cells is solid.
 */
export function crossedDir(map: WorldMap, x: number, y: number, nx: number, ny: number): number {
  const cx = Math.floor(x);
  const cy = Math.floor(y);
  const dx = Math.floor(nx) - cx;
  const dy = Math.floor(ny) - cy;
  const ex = dx > 0 ? 0 : 2;
  const ey = dy > 0 ? 1 : 3;
  if (dx !== 0 && dy !== 0) return rockAt(map, cx + dx, cy) !== OPEN ? ex : ey;
  if (dx !== 0) return ex;
  if (dy !== 0) return ey;
  return gridDir(Math.atan2(ny - y, nx - x));
}

/** The grid way (0 east, 1 south, 2 west, 3 north) nearest heading h. */
export function gridDir(h: number): number {
  return ((Math.round(h / (Math.PI / 2)) % 4) + 4) & 3;
}

/**
 * The wall-follower's next way from cell (x, y), facing `dir`, keeping the wall on `side` (+1 right,
 * −1 left): the first open one of toward the wall, ahead, away from it, behind. Facing a dead end on
 * all four sides (it can't be: it stands in an open cell it walked into), it stays facing as it was.
 */
export function handOnWall(map: WorldMap, x: number, y: number, dir: number, side: number): number {
  // Turn toward the hand only round a wall that is there: the cell behind on the hand side is solid.
  // In open ground (no wall at hand, and none just behind it) turning hand-ward every cell would circle a 2×2 square.
  const back = (dir + 2) & 3;
  const hs = (dir + side) & 3;
  const lost = rockAt(map, x + (DX[back] as number) + (DX[hs] as number), y + (DY[back] as number) + (DY[hs] as number)) === OPEN;
  for (const turn of lost ? [0, side, -side, 2] : [side, 0, -side, 2]) {
    const d = (dir + turn) & 3;
    if (rockAt(map, x + (DX[d] as number), y + (DY[d] as number)) === OPEN) return d;
  }
  return dir;
}

/** How far the mound of `pellets` dropped soil reaches out from the nest's edge, in cells: it grows with the square root, like a ring of heaped earth. */
export function moundWidth(pellets: number): number {
  return 0.3 * Math.sqrt(pellets);
}

/** At a dead end, the chance an ant digs to a side instead of straight on: how often tunnels fork. */
const FORK = 0.15;

/** Seconds an ant takes to dig one cell of soil open, at least (up to twice this, at random). */
export const DIG_TIME = 1;
/** An ant digs a face it meets within ~30° of head-on; a shallower touch slides it along the wall. */
const HEAD_ON = Math.cos(Math.PI / 6);
export const NO_FACE = 0;
export const DIG_FACE = 1;
export const GLANCE_X = 2;
export const GLANCE_Y = 3;
/** A flat wall (a chamber's, or a tunnel's side) met head-on: where a new tunnel may start, now and then (START). */
export const START_FACE = 4;
/** The chance an explorer meeting a flat wall head-on starts a tunnel into it. */
const START = 0.05;
/** The chance, per cell of chamber wall an explorer walks along, that it starts a tunnel into the wall there. */
const START_HUG = 0.1;
/** Seconds an explorer keeps a hand on a chamber's wall after touching soil. */
const HUG_TIME = 8;

/**
 * What a step from (x, y) to (nx, ny) heading `h` does at soil: NO_FACE (it doesn't land in soil, or
 * crosses a cell corner), DIG_FACE (it meets a tunnel's end head-on, or the cell it is walking to:
 * dig it), START_FACE (it meets a flat wall head-on: a tunnel may start here), or GLANCE_X / GLANCE_Y
 * (it touches the soil at a slant across a vertical / horizontal cell edge: slide along it).
 * Only a tunnel's end is dug (see tunnelEnd), and only when met head-on: that is what makes tunnels
 * rather than caverns. Any other soil the ant slides along, like a tunnel wall.
 */
export function soilFace(map: WorldMap, x: number, y: number, nx: number, ny: number, h: number, aimed = false): number {
  const tx = Math.floor(nx);
  const ty = Math.floor(ny);
  if (rockAt(map, tx, ty) !== SOIL) return NO_FACE;
  const acrossX = tx !== Math.floor(x);
  const acrossY = ty !== Math.floor(y);
  if (acrossX === acrossY) return NO_FACE; // a corner (or no crossing at all): leave it to the solid check
  const headOn = acrossX ? Math.abs(Math.cos(h)) >= HEAD_ON : Math.abs(Math.sin(h)) >= HEAD_ON;
  const d = acrossX ? (nx > x ? 0 : 2) : ny > y ? 1 : 3;
  if ((headOn || aimed) && diggable(map, tx, ty, d)) return DIG_FACE;
  if (aimed && startable(map, tx, ty, d)) return DIG_FACE;
  if (headOn && startable(map, tx, ty, d)) return START_FACE;
  return acrossX ? GLANCE_X : GLANCE_Y;
}

/** Whether soil cell (x, y), entered going `d`, may be dug: a tunnel's end, or a wall with open ground straight beyond it (breaking through). */
export function diggable(map: WorldMap, x: number, y: number, d: number): boolean {
  return tunnelEnd(map, x, y) || rockAt(map, x + (DX[d] as number), y + (DY[d] as number)) === OPEN;
}

/**
 * Whether a new tunnel may start into flat-wall cell (x, y), going `d`: no open ground within two
 * cells to either side of it, in its row or the next. New tunnels keep their distance from other
 * passages, so the ground isn't combed into parallel slots.
 */
export function startable(map: WorldMap, x: number, y: number, d: number): boolean {
  const px = DY[d] as number;
  const py = -(DX[d] as number);
  for (let a = 0; a <= 1; a++)
    for (let b = -2; b <= 2; b++) {
      if (b === 0) continue;
      if (rockAt(map, x + a * (DX[d] as number) + b * px, y + a * (DY[d] as number) + b * py) === OPEN) return false;
    }
  return true;
}

/**
 * Whether soil cell (x, y) is a tunnel's end: at most 2 of its 8 neighbours open. The end of a
 * tunnel (1 open) and the corner beside it (2) are; a tunnel's side wall or a chamber's flat wall
 * (3) is not. So tunnels lengthen and branch but stay one or two cells wide.
 */
export function tunnelEnd(map: WorldMap, x: number, y: number, most = 2): boolean {
  let open = 0;
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && rockAt(map, x + dx, y + dy) === OPEN && ++open > most) return false;
  return true;
}

/**
 * A step that crosses diagonally into the next cell between two solid cells: blocked, like rock.
 * Movement otherwise only checks where the step lands, so ants could slip through a rock corner
 * into pockets the walking-distance map (4-connected) can't reach, and sit there forever.
 */
export function squeezes(map: WorldMap, x: number, y: number, nx: number, ny: number): boolean {
  const cx = Math.floor(x);
  const cy = Math.floor(y);
  const tx = Math.floor(nx);
  const ty = Math.floor(ny);
  return tx !== cx && ty !== cy && rockAt(map, tx, cy) !== OPEN && rockAt(map, cx, ty) !== OPEN;
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
