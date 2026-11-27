import { setTrailOptimizations } from "../colony/index.ts";
import { MAX_STEP } from "../ui/fixedStepClock.ts";
import { buildTrialGame } from "./workerTrial.ts";

export const TRAIL_BENCH_SEED = 17;
export const TRAIL_BENCH_ANTS = 600;
export const TRAIL_BENCH_PAIRS = 6;
const CHECKPOINT_TICKS = 180;
const SAMPLE_TICKS = 90;

type Variant = "baseline" | "optimized";
type Pair = Record<Variant, number>;

export interface TrailBenchmarkResult {
  baselineMs: number;
  optimizedMs: number;
  medianGain: number;
  minGain: number;
  maxGain: number;
  optimizedWins: number;
  pairs: Pair[];
}

export type TrailBenchmarkMessage =
  { type: "progress"; pairs: number } | { type: "result"; result: TrailBenchmarkResult } | { type: "error"; message: string };

function median(values: number[]): number {
  values.sort((a, b) => a - b);
  const middle = Math.floor(values.length / 2);
  return values.length % 2 ? values[middle]! : (values[middle - 1]! + values[middle]!) / 2;
}

export function summarizeTrailPairs(pairs: Pair[]): TrailBenchmarkResult {
  const gains = pairs.map(({ baseline, optimized }) => baseline / optimized - 1);
  return {
    baselineMs: median(pairs.map((p) => p.baseline)),
    optimizedMs: median(pairs.map((p) => p.optimized)),
    medianGain: median(gains),
    minGain: Math.min(...gains),
    maxGain: Math.max(...gains),
    optimizedWins: gains.filter((gain) => gain > 0).length,
    pairs,
  };
}

/** Replay the same simulation segment in both variants. Worker time is engine-only. */
export async function runTrailBenchmark(progress: (pairs: number) => void): Promise<TrailBenchmarkResult> {
  setTrailOptimizations(true);
  const game = await buildTrialGame(TRAIL_BENCH_SEED, TRAIL_BENCH_ANTS, true);
  const advance = (ticks: number) => {
    for (let i = 0; i < ticks; i++) game.tick(MAX_STEP);
  };
  advance(CHECKPOINT_TICKS);
  const checkpoint = game.save();
  const restore = (variant: Variant) => {
    setTrailOptimizations(variant === "optimized");
    game.load(checkpoint);
  };

  // Warm both code paths and verify that the same replay ends at the same state.
  restore("baseline");
  advance(SAMPLE_TICKS);
  const expected = JSON.stringify(game.save());
  restore("optimized");
  advance(SAMPLE_TICKS);
  if (JSON.stringify(game.save()) !== expected) throw new Error("The two variants produced different game states.");

  const measure = (variant: Variant) => {
    restore(variant);
    const start = performance.now();
    advance(SAMPLE_TICKS);
    return (performance.now() - start) / SAMPLE_TICKS;
  };

  const pairs: Pair[] = [];
  for (let i = 0; i < TRAIL_BENCH_PAIRS; i++) {
    if (i % 2 === 0) {
      const baseline = measure("baseline");
      pairs.push({ baseline, optimized: measure("optimized") });
    } else {
      const optimized = measure("optimized");
      pairs.push({ baseline: measure("baseline"), optimized });
    }
    progress(pairs.length);
  }
  return summarizeTrailPairs(pairs);
}
