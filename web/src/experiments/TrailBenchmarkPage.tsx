import { useEffect, useRef, useState } from "react";
import {
  TRAIL_BENCH_ANTS,
  TRAIL_BENCH_PAIRS,
  TRAIL_BENCH_SEED,
  type TrailBenchmarkMessage,
  type TrailBenchmarkResult,
} from "./trailBenchmark.ts";

const percent = (value: number) => `${value > 0 ? "+" : ""}${(100 * value).toFixed(1)}%`;

export default function TrailBenchmarkPage() {
  const workerRef = useRef<Worker | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [result, setResult] = useState<TrailBenchmarkResult | null>(null);
  const [error, setError] = useState("");

  const stop = () => {
    workerRef.current?.terminate();
    workerRef.current = null;
  };

  useEffect(() => {
    const cancelHiddenRun = () => {
      if (!document.hidden || !workerRef.current) return;
      stop();
      setProgress(null);
      setError("Keep this page visible during the benchmark.");
    };
    document.addEventListener("visibilitychange", cancelHiddenRun);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", cancelHiddenRun);
    };
  }, []);

  const start = () => {
    if (workerRef.current) return;
    setProgress(0);
    setResult(null);
    setError("");
    try {
      const worker = new Worker(new URL("./trailBenchmarkEntry.ts", import.meta.url), { type: "module" });
      workerRef.current = worker;
      worker.onmessage = ({ data }: MessageEvent<TrailBenchmarkMessage>) => {
        if (data.type === "progress") {
          setProgress(data.pairs);
          return;
        }
        stop();
        setProgress(null);
        if (data.type === "result") setResult(data.result);
        else setError(data.message);
      };
      worker.onerror = () => {
        stop();
        setProgress(null);
        setError("The benchmark worker failed.");
      };
    } catch (exception) {
      stop();
      setProgress(null);
      setError(exception instanceof Error ? exception.message : String(exception));
    }
  };

  return (
    <main className="min-h-dvh bg-ground px-5 py-12 text-fg">
      <div className="mx-auto max-w-lg">
        <h1 className="text-2xl font-semibold">Trail benchmark</h1>
        <p className="my-3 text-sm">
          Seed {TRAIL_BENCH_SEED} · {TRAIL_BENCH_ANTS * 2} starting ants · {TRAIL_BENCH_PAIRS} paired replays
        </p>
        <p className="mb-4 text-sm">
          The worker replays the same game segment in both variants. It measures simulation ticks without drawing the map.
        </p>
        <button
          type="button"
          className="rounded border border-line px-3 py-2 disabled:opacity-50"
          onClick={start}
          disabled={progress !== null}
        >
          Run comparison
        </button>
        {progress !== null && (
          <p className="mt-3 text-sm" role="status">
            {progress === 0 ? "Preparing the replay and warming up…" : `${progress} of ${TRAIL_BENCH_PAIRS} pairs complete`}
          </p>
        )}
        {error && (
          <p className="mt-3 text-sm" role="alert">
            {error}
          </p>
        )}
        {result && (
          <section aria-label="Benchmark results" className="mt-5 rounded-md border border-line bg-panel p-4">
            <p className="text-lg font-semibold">Median throughput change {percent(result.medianGain)}</p>
            <p className="my-2 text-sm">
              Pair range {percent(result.minGain)} to {percent(result.maxGain)} · optimized faster in {result.optimizedWins} of{" "}
              {result.pairs.length}
            </p>
            <p className="text-sm">
              Median tick time · baseline {result.baselineMs.toFixed(2)} ms · optimized {result.optimizedMs.toFixed(2)} ms
            </p>
            <p className="mt-2 text-sm">
              {result.minGain <= 0 && result.maxGain >= 0
                ? "The pairs show no consistent winner."
                : "All pairs agree on which variant is faster."}
            </p>
            <details className="mt-3 text-sm">
              <summary>Individual pairs</summary>
              <ol className="list-decimal pl-5">
                {result.pairs.map(({ baseline, optimized }, index) => (
                  <li key={index}>
                    Baseline {baseline.toFixed(2)} ms · optimized {optimized.toFixed(2)} ms
                  </li>
                ))}
              </ol>
            </details>
          </section>
        )}
      </div>
    </main>
  );
}
