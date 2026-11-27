import { EngineProfile } from "../colony/index.ts";
import { profileFromUrl } from "./playbackOptions.ts";

const DURATION_MS = 10_000;

type Scene = { seed: number; view: string; requestedSpeed: number; startingAntsPerColony: number; clock: string };
type Stats = { count: number; meanMs: number; p95Ms: number } | null;

interface Report extends Scene {
  wallSeconds: number;
  simulatedSeconds: number;
  pace: number;
  tick: Stats;
  afterTick: Stats;
  mapDraw: Stats;
  frameGap: Stats;
  engine: ReturnType<EngineProfile["report"]>;
}

type Status = Readonly<{ running: boolean; report: Report | null }>;

function summarize(values: number[]): Stats {
  if (!values.length) return null;
  const count = values.length;
  const meanMs = values.reduce((sum, v) => sum + v, 0) / count;
  const p95Ms = values.sort((a, b) => a - b)[Math.ceil(0.95 * count) - 1]!;
  return { count, meanMs, p95Ms };
}

/** One short capture of the real game. Recorders do no timing work outside a capture. */
export class PageProfile {
  engine = new EngineProfile();
  private status: Status = { running: false, report: null };
  private readonly listeners = new Set<() => void>();
  private scene: Scene | null = null;
  private startAt = 0;
  private lastFrame: number | null = null;
  private elapsedSim = 0;
  private ticks: number[] = [];
  private afterTicks: number[] = [];
  private draws: number[] = [];
  private gaps: number[] = [];

  getSnapshot = (): Status => this.status;
  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => void this.listeners.delete(fn);
  };

  private publish(status: Status): void {
    this.status = status;
    for (const fn of this.listeners) fn();
  }

  start(scene: Scene, now: number): void {
    this.engine = new EngineProfile();
    this.scene = scene;
    this.startAt = now;
    this.lastFrame = null;
    this.elapsedSim = 0;
    this.ticks = [];
    this.afterTicks = [];
    this.draws = [];
    this.gaps = [];
    this.publish({ running: true, report: null });
  }

  cancel(): void {
    if (!this.status.running) return;
    this.scene = null;
    this.publish({ running: false, report: null });
  }

  tick(dt: number, engineMs: number, afterMs: number): void {
    this.elapsedSim += dt;
    this.ticks.push(engineMs);
    this.afterTicks.push(afterMs);
  }

  draw(ms: number): void {
    this.draws.push(ms);
  }

  frame(stamp: number, now: number): void {
    if (!this.scene) return;
    if (this.lastFrame !== null) this.gaps.push(stamp - this.lastFrame);
    this.lastFrame = stamp;
    const wallMs = now - this.startAt;
    if (wallMs < DURATION_MS) return;
    const wallSeconds = wallMs / 1000;
    const report = {
      ...this.scene,
      wallSeconds,
      simulatedSeconds: this.elapsedSim,
      pace: this.elapsedSim / wallSeconds,
      tick: summarize(this.ticks),
      afterTick: summarize(this.afterTicks),
      mapDraw: summarize(this.draws),
      frameGap: summarize(this.gaps),
      engine: this.engine.report(),
    };
    this.scene = null;
    this.publish({ running: false, report });
  }
}

export const pageProfile = profileFromUrl() ? new PageProfile() : null;
