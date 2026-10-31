import { type Channel, Pheromones } from "./pheromone.ts";
import { blocked, type WorldMap } from "./world.ts";

// The colony, pure. Ants are structure-of-arrays like the picture sim. Each
// ant is in one behaviour mode and steers by that mode every frame for free:
//   explore — wander, lay home trail, walk to food it can see
//   follow  — climb the food trail, lay home trail
//   return  — go home: climb the home trail (and its own sense of where the
//             nest is: real ants path-integrate); carrying, lay food trail
// Picking food up, carrying it home and putting it down are mechanics, not
// choices; so is shying away from alarm. Which mode to be in is the one
// choice, asked only when a non-carrying ant's situation changes (a trail
// appeared or faded, it got tired, it put its food down), never every frame.
// That choice is a `Policy`: the local rule, or Jev cached per situation
// (colonyBrain.ts, ui/colonyJev.ts).

export const MODES = ["explore", "follow", "return"] as const;
export type Mode = (typeof MODES)[number];
const EXPLORE = 0;
const FOLLOW = 1;
const RETURN = 2;

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
}

export type Policy = (s: Situation) => Mode;

/**
 * The local rule. Tired: go home. A strong food trail: follow it. No food
 * trail at all: explore. A faint one keeps what the ant was doing, except an
 * ant that just dropped its food heads back out along it. Alarm is left to
 * steering (every mode shies away from it); a doctrine can make it more.
 * Going home tired breaks ant mills: without it, followers circled trails to
 * food that was gone until the trail faded and nobody was left exploring.
 */
export const localPolicy: Policy = (s) => {
  if (s.tired) return "return";
  if (s.foodTrail === "strong") return "follow";
  if (s.foodTrail === "none") return "explore";
  return s.mode === "return" ? "follow" : s.mode;
};

export interface ColonyParams {
  antCount: number;
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

export const DEFAULT_COLONY: ColonyParams = { antCount: 800, speed: 7, sensorDistance: 3, sensorAngle: 0.6, turnRate: 6, wander: 4, deposit: 4, depositDecay: 20, patience: 60, alarmAvoid: 1.5 };

/** A food cell seen by a sensor, or the nest seen by a homing ant, beats any trail. */
const SEEN = 100;

export class Colony {
  readonly map: WorldMap;
  readonly ph: Pheromones;
  params: ColonyParams;
  policy: Policy;
  readonly n: number;
  x: Float32Array;
  y: Float32Array;
  heading: Float32Array;
  /** index into MODES */
  mode: Uint8Array;
  carrying: Uint8Array;
  /** seconds since the ant was last at the nest or picked up food */
  since: Float32Array;
  /** seconds left of a detour after bumping into rock, when the pull toward the nest is off */
  detour: Float32Array;
  /** the situation each ant was last asked about, encoded; −1 = never */
  #asked: Int16Array;
  time = 0;
  /** food units brought home */
  stored = 0;
  /** mode choices made by the policy */
  decisions = 0;
  /** which of the SITUATIONS the policy has been asked about: what a cached Jev policy would pay for */
  seen = new Uint8Array(SITUATIONS);
  #rng: () => number;

  constructor(map: WorldMap, params: Partial<ColonyParams> = {}, rng: () => number = Math.random, policy: Policy = localPolicy) {
    this.map = map;
    this.params = { ...DEFAULT_COLONY, ...params };
    this.policy = policy;
    this.#rng = rng;
    this.ph = new Pheromones(map.size);
    const n = this.params.antCount;
    this.n = n;
    this.x = new Float32Array(n);
    this.y = new Float32Array(n);
    this.heading = new Float32Array(n);
    this.mode = new Uint8Array(n);
    this.carrying = new Uint8Array(n);
    this.since = new Float32Array(n);
    this.detour = new Float32Array(n);
    this.#asked = new Int16Array(n).fill(-1);
    for (let i = 0; i < n; i++) {
      const a = rng() * Math.PI * 2;
      const r = rng() * map.nest.r * 0.8;
      this.x[i] = map.nest.x + Math.cos(a) * r;
      this.y[i] = map.nest.y + Math.sin(a) * r;
      this.heading[i] = a;
    }
  }

  /** Food left on the map. */
  get foodLeft(): number {
    let s = 0;
    for (const v of this.map.food) s += v;
    return s;
  }

  /** Every ant asks its policy again on its next tick: a new doctrine, or fresh answers from Jev, take effect at once. */
  reconsider(): void {
    this.#asked.fill(-1);
  }

  /** The fungus's brush: lay `amount` of a trail on every open cell within `radius` of (x, y). */
  paint(channel: Channel, x: number, y: number, radius: number, amount: number): void {
    const { size, rock } = this.map;
    for (let cy = Math.max(0, Math.floor(y - radius)); cy <= Math.min(size.h - 1, Math.floor(y + radius)); cy++)
      for (let cx = Math.max(0, Math.floor(x - radius)); cx <= Math.min(size.w - 1, Math.floor(x + radius)); cx++) {
        if (rock[cy * size.w + cx] || Math.hypot(cx + 0.5 - x, cy + 0.5 - y) > radius) continue;
        this.ph.deposit(channel, cx + 0.5, cy + 0.5, amount);
      }
  }

  /** Distinct situations the policy has been asked about. */
  get situationsSeen(): number {
    let s = 0;
    for (const v of this.seen) s += v;
    return s;
  }

  /** Ants in each mode. */
  counts(): Record<Mode, number> {
    const c = { explore: 0, follow: 0, return: 0 };
    for (let i = 0; i < this.n; i++) c[MODES[this.mode[i] as number] as Mode]++;
    return c;
  }

  /** What one sensor reads: the trail, the edge or rock as −1, and food (or the nest, homing) as SEEN. */
  #sense(i: number, angle: number, channel: Channel): number {
    const d = this.params.sensorDistance;
    const sx = (this.x[i] as number) + Math.cos(angle) * d;
    const sy = (this.y[i] as number) + Math.sin(angle) * d;
    if (blocked(this.map, sx, sy)) return -1;
    if (channel === "food" && (this.map.food[Math.floor(sy) * this.map.size.w + Math.floor(sx)] as number) > 0) return SEEN;
    if (channel === "home" && Math.hypot(sx - this.map.nest.x, sy - this.map.nest.y) < this.map.nest.r) return SEEN;
    return this.ph.read(channel, sx, sy);
  }

  /** Advance by dt seconds: ants decide (when their situation changed), steer, lay trail, move; then the fields evaporate and spread. */
  tick(dt: number): void {
    const p = this.params;
    const rng = this.#rng;
    const { map, ph } = this;
    const a = p.sensorAngle;
    this.time += dt;
    for (let i = 0; i < this.n; i++) {
      let h = this.heading[i] as number;
      const fl = this.#sense(i, h - a, "food");
      const ff = this.#sense(i, h, "food");
      const fr = this.#sense(i, h + a, "food");
      const hl = this.#sense(i, h - a, "home");
      const hf = this.#sense(i, h, "home");
      const hr = this.#sense(i, h + a, "home");
      const al = this.#sense(i, h - a, "alarm");
      const af = this.#sense(i, h, "alarm");
      const ar = this.#sense(i, h + a, "alarm");

      // The mode choice, only when the situation changed since the ant was last asked.
      // A carrying ant goes home: a mechanic, never asked (and asked afresh once it puts the food down).
      const carrying = this.carrying[i] === 1;
      let mode = this.mode[i] as number;
      if (carrying) {
        mode = RETURN;
        this.mode[i] = RETURN;
        this.#asked[i] = -1;
      } else {
        const tired = (this.since[i] as number) > p.patience;
        const food = trailLevel(Math.max(fl, ff, fr));
        const home = trailLevel(Math.max(hl, hf, hr));
        const alarm = trailLevel(Math.max(al, af, ar));
        const before = encode(mode, tired, food, home, alarm);
        if (before !== this.#asked[i]) {
          mode = MODES.indexOf(this.policy({ mode: MODES[mode] as Mode, tired, foodTrail: food, homeTrail: home, alarm }));
          if (mode < 0) mode = tired ? RETURN : EXPLORE; // a policy answering nonsense falls back to the plain rule
          this.mode[i] = mode;
          this.#asked[i] = encode(mode, tired, food, home, alarm);
          this.seen[before] = 1;
          this.decisions++;
        }
      }
      const home = trailLevel(Math.max(hl, hf, hr));

      // Steer by mode.
      const noise = (rng() - 0.5) * 2 * dt;
      if (mode === RETURN) {
        h += climb(hl, hf, hr, p.turnRate * dt) + noise * p.wander * 0.25;
        // Path integration: home is that way. Stronger when the home trail is faint; off
        // for a moment after a bump, or a straight line home walks into the same rock forever.
        if ((this.detour[i] as number) <= 0) {
          const toNest = Math.atan2(map.nest.y - (this.y[i] as number), map.nest.x - (this.x[i] as number));
          h = turnToward(h, toNest, p.turnRate * dt * (home === "strong" ? 0.15 : 0.5));
        }
      } else if (mode === FOLLOW) {
        h += climb(fl, ff, fr, p.turnRate * dt) + noise * p.wander * 0.25;
      } else {
        const seen = Math.max(fl, ff, fr) >= SEEN;
        h += seen ? climb(fl, ff, fr, p.turnRate * dt) : noise * p.wander;
      }
      // Every mode shies away from alarm.
      h += avoid(al, af, ar, p.turnRate * p.alarmAvoid * dt);

      // Lay trail: walking out marks the way home, carrying food marks the way to it.
      const laid = p.deposit * Math.exp(-(this.since[i] as number) / p.depositDecay) * dt;
      ph.deposit(carrying ? "food" : "home", this.x[i] as number, this.y[i] as number, laid);

      // Move; rock or the edge turns the ant back somewhere random.
      const nx = (this.x[i] as number) + Math.cos(h) * p.speed * dt;
      const ny = (this.y[i] as number) + Math.sin(h) * p.speed * dt;
      this.detour[i] = (this.detour[i] as number) - dt;
      if (blocked(map, nx, ny)) {
        h += Math.PI / 2 + rng() * Math.PI;
        this.detour[i] = 0.5 + rng();
      } else {
        this.x[i] = nx;
        this.y[i] = ny;
      }

      // Mechanics: pick up food where there is some, put it down at the nest; the nest rests a tired ant.
      const c = Math.floor(this.y[i] as number) * map.size.w + Math.floor(this.x[i] as number);
      const atNest = Math.hypot((this.x[i] as number) - map.nest.x, (this.y[i] as number) - map.nest.y) < map.nest.r;
      if (!carrying && (map.food[c] as number) > 0) {
        map.food[c] = Math.max(0, (map.food[c] as number) - 1);
        this.carrying[i] = 1;
        this.since[i] = 0;
        h += Math.PI;
      } else if (atNest) {
        if (carrying) {
          this.carrying[i] = 0;
          this.stored++;
          h += Math.PI;
        }
        this.since[i] = 0;
      } else this.since[i] = (this.since[i] as number) + dt;
      this.heading[i] = h;
    }
    ph.step(dt, map.rock);
  }
}

/** Every situation a mode choice can be asked in: mode × tired × food × home × alarm = 3 × 2 × 3 × 3 × 3 = 162. */
export const SITUATIONS = MODES.length * 2 * TRAILS.length ** 3;

function encode(mode: number, tired: boolean, food: Trail, home: Trail, alarm: Trail): number {
  return (((mode * 2 + (tired ? 1 : 0)) * 3 + TRAILS.indexOf(food)) * 3 + TRAILS.indexOf(home)) * 3 + TRAILS.indexOf(alarm);
}

/** Turn toward the weakest of three alarm sensors, at most `max` radians; nothing when no sensor smells alarm. */
export function avoid(left: number, front: number, right: number, max: number): number {
  if (Math.max(left, front, right) < FAINT) return 0;
  if (front <= left && front <= right) return 0;
  return left < right ? -max : max;
}

/** Turn toward the strongest of three sensors, at most `max` radians. */
export function climb(left: number, front: number, right: number, max: number): number {
  if (front >= left && front >= right) return 0;
  return left > right ? -max : max;
}

/** Turn `h` toward `target` by at most `max` radians, the short way round. */
export function turnToward(h: number, target: number, max: number): number {
  const d = Math.atan2(Math.sin(target - h), Math.cos(target - h));
  return h + Math.max(-max, Math.min(max, d));
}
