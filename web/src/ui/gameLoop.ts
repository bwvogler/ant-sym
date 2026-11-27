import { withEngineProfile } from "../colony/engineProfile.ts";
import { pageProfile } from "./pageProfile.ts";
import type { Game, Journal } from "../colony/index.ts";
import { FixedStepClock, MAX_STEP } from "./fixedStepClock.ts";
import type { SimTasks } from "./simTasks.ts";
import { decisionsOf, statsOf, type ColonyStats } from "./stats.ts";

// The game's animation loop as a plain class (ja-fnd.6.1, docs/refactor.md S5.1): it steps the game each frame, takes the stats every
// 150 ms and counts frames a second, and tells whoever subscribed. Before, it was one effect in useColony that tore itself down and
// restarted on every pause and speed change; now playing and speed are set on the loop, which goes on. No React in here: the frame
// source is injected, so the tests drive it by hand and the page gives it requestAnimationFrame.

export { MAX_STEP };
/** Longest wall time one frame counts: a tab that was hidden doesn't leap ahead. */
const MAX_FRAME = 0.05;
/** Stop catching up after this much simulation work so input and rendering get a turn. */
const SIM_BUDGET_MS = 12;
/** How often the stats are taken, in ms. */
const STATS_EVERY = 150;

/** Where frames come from: the page's requestAnimationFrame and clock, or a test's. */
export interface FrameEnv {
  now(): number;
  request(cb: (t: number) => void): number;
  cancel(id: number): void;
}

export const BROWSER_ENV: FrameEnv = {
  now: () => performance.now(),
  request: (cb) => requestAnimationFrame(cb),
  cancel: (id) => cancelAnimationFrame(id),
};

export interface LoopOptions {
  playing: boolean;
  speed: number;
  /** a new queen has flown (ja-lo8.9): the game waits for the page to found her, so the page pauses play */
  onFlight(): void;
  /** called after every frame (the renderer, the sight map, the history), in order of subscription; the page shares one set across games */
  frame?: Set<() => void>;
  env?: FrameEnv;
  /** When supplied, simulation steps run in their own tasks and frames only present the game. */
  simTasks?: SimTasks;
  /** the loop of the game before, when the page builds a new game: its stats and frame count stay on show until this one's first frame (as they did when they were React state) */
  carry?: GameLoop;
}

export class GameLoop {
  readonly game: Game;
  #journal: Journal | null;
  #env: FrameEnv;
  #onFlight: () => void;
  #frame: Set<() => void>;
  #playing: boolean;
  #speed: number;
  #simTasks: SimTasks | undefined;
  #simClock: FixedStepClock | undefined;
  #cancelSim: (() => void) | undefined;
  #visible = true;
  #raf = 0;
  #running = false;
  #stats: ColonyStats | null = null;
  #fps = 0;
  #subs = new Set<() => void>();
  #steps = new Set<() => void>();
  #last = 0;
  #lastStats = 0;
  #frames = 0;
  #fpsAt = 0;
  #rateAt = { t: 0, decisions: 0 };
  #rate = 0;
  #paceAt = { wall: 0, sim: 0 };
  #pace = 0;

  constructor(game: Game, journal: Journal | null, o: LoopOptions) {
    this.game = game;
    this.#journal = journal;
    this.#env = o.env ?? BROWSER_ENV;
    this.#onFlight = o.onFlight;
    this.#frame = o.frame ?? new Set();
    this.#playing = o.playing;
    this.#speed = o.speed;
    this.#simTasks = o.simTasks;
    if (o.simTasks) this.#simClock = new FixedStepClock(o.speed);
    if (o.carry) {
      this.#stats = o.carry.stats();
      this.#fps = o.carry.fps();
    }
  }

  /** Called after every sim step (not every frame); returns the way to stop. What the page keeps up with the sim, such as the fog's sight, goes here. */
  onStep = (fn: () => void): (() => void) => {
    this.#steps.add(fn);
    return () => void this.#steps.delete(fn);
  };

  /** One sim step of `dt`: the game ticks, the step subscribers run, the journal sees it. Every way the page steps the game goes through here, so nothing keeping up with the sim misses one. */
  advance(dt: number): void {
    const profile = pageProfile?.getSnapshot().running ? pageProfile : null;
    const start = profile ? this.#env.now() : 0;
    if (profile) withEngineProfile(profile.engine, () => this.game.tick(dt));
    else this.game.tick(dt);
    const afterEngine = profile ? this.#env.now() : 0;
    for (const fn of this.#steps) fn();
    this.#journal?.observe(this.game);
    if (profile) {
      profile.engine.endTick(afterEngine - start);
      profile.tick(dt, afterEngine - start, this.#env.now() - afterEngine);
    }
  }

  /** The latest stats (null until the first is taken). */
  stats = (): ColonyStats | null => this.#stats;
  /** Frames drawn in the last second. */
  fps = (): number => this.#fps;
  /** Called when the stats or the frame count change; returns the way to stop (useSyncExternalStore's subscribe). */
  subscribe = (fn: () => void): (() => void) => {
    this.#subs.add(fn);
    return () => void this.#subs.delete(fn);
  };

  /**
   * Play or pause, and the speed: the loop goes on. The measures over a window (the pace, the choices a second, the frame count) start
   * over and the stats follow on the next frame, as they did when each change restarted the loop.
   */
  set(playing: boolean, speed: number): void {
    if (playing === this.#playing && speed === this.#speed) return;
    this.#playing = playing;
    this.#speed = speed;
    this.#restartWindows(this.#env.now());
    this.#resetSim();
  }

  /** Hidden wall time is discarded by the independent clock. */
  setVisible(visible: boolean): void {
    if (visible === this.#visible) return;
    this.#visible = visible;
    this.#resetSim();
  }

  start(): void {
    if (this.#running) return;
    this.#running = true;
    const t = this.#env.now();
    this.#last = t;
    this.#restartWindows(t);
    this.#raf = this.#env.request(this.#loop);
    this.#resetSim();
  }

  stop(): void {
    if (!this.#running) return;
    this.#running = false;
    this.#env.cancel(this.#raf);
    this.#resetSim();
  }

  #canRunSim(): boolean {
    return this.#running && this.#playing && this.#visible && this.#speed > 0;
  }

  #resetSim(): void {
    const clock = this.#simClock;
    if (!clock) return;
    this.#cancelSim?.();
    this.#cancelSim = undefined;
    clock.speed = this.#speed;
    clock.reset(this.#env.now());
    if (this.#canRunSim()) this.#cancelSim = this.#simTasks?.((MAX_STEP * 1000) / clock.speed, this.#pumpSim);
  }

  #pumpSim = (): void => {
    this.#cancelSim = undefined;
    const clock = this.#simClock;
    if (!clock || !this.#canRunSim()) return;
    const delay = clock.pump(
      this.#env.now(),
      () => {
        this.advance(MAX_STEP);
        this.#pauseForFlight();
        return this.#canRunSim() && !this.#cancelSim;
      },
      () => this.#env.now(),
    );
    if (this.#canRunSim() && !this.#cancelSim) this.#cancelSim = this.#simTasks?.(delay, this.#pumpSim);
  };

  /** A new queen has flown: the game waits for the page to found her. */
  #pauseForFlight(): boolean {
    if (!this.game.flights.length) return false;
    this.#onFlight();
    this.#playing = false;
    this.#lastStats = 0;
    return true;
  }

  /** Every measure over a window starts now: the pace begins at the speed asked (0 paused), the rate at 0, the frame count at 0. */
  #restartWindows(wall: number): void {
    this.#lastStats = 0;
    this.#frames = 0;
    this.#fpsAt = wall;
    this.#rateAt = { t: this.game.time, decisions: decisionsOf(this.game) };
    this.#rate = 0;
    this.#paceAt = { wall, sim: this.game.time };
    this.#pace = this.#playing ? this.#speed : 0;
  }

  #notify(): void {
    for (const fn of this.#subs) fn();
  }

  #loop = (t: number): void => {
    const game = this.game;
    // Clamped both ways: a first frame stamped before `last` would step the sim backwards (negative trail).
    const dt = Math.max(0, Math.min(MAX_FRAME, (t - this.#last) / 1000));
    this.#last = t;
    if (this.#playing && !this.#simClock) {
      const total = dt * this.#speed;
      const steps = Math.max(1, Math.ceil(total / MAX_STEP));
      const deadline = this.#env.now() + SIM_BUDGET_MS;
      for (let k = 0; k < steps; k++) {
        // Always make progress. Drop overdue steps so slow frames do not build up a backlog.
        if (k > 0 && this.#env.now() >= deadline) break;
        this.advance(total / steps);
        if (this.#pauseForFlight()) break;
      }
    }
    if (t - this.#paceAt.wall >= 1000) {
      this.#pace = ((game.time - this.#paceAt.sim) * 1000) / (t - this.#paceAt.wall);
      this.#paceAt = { wall: t, sim: game.time };
    }
    if (game.time - this.#rateAt.t >= 1) {
      this.#rate = (decisionsOf(game) - this.#rateAt.decisions) / (game.time - this.#rateAt.t);
      this.#rateAt = { t: game.time, decisions: decisionsOf(game) };
    }
    let changed = false;
    if (t - this.#lastStats > STATS_EVERY) {
      this.#stats = statsOf(game, this.#rate, this.#pace);
      this.#lastStats = t;
      changed = true;
    }
    this.#frames++;
    if (t - this.#fpsAt > 1000) {
      this.#fps = this.#frames;
      this.#frames = 0;
      this.#fpsAt = t;
      changed = true;
    }
    if (changed) this.#notify();
    for (const fn of this.#frame) fn();
    if (pageProfile?.getSnapshot().running) pageProfile.frame(t, this.#env.now());
    if (this.#running) this.#raf = this.#env.request(this.#loop);
  };
}
