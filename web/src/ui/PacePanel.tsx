import { useEffect, useRef, useState } from "react";

interface Props {
  variant: "baseline" | "optimized";
  game: { readonly time: number };
  view: string;
  speed: number;
  canStart: boolean;
  onFrame(fn: () => void): () => void;
}

const SAMPLE_MS = 10_000;

export function PacePanel({ variant, game, view, speed, canStart, onFrame }: Props) {
  const unsubscribe = useRef<(() => void) | null>(null);
  const [running, setRunning] = useState(false);
  const [pace, setPace] = useState<number | null>(null);

  useEffect(() => {
    const cancel = () => {
      if (!unsubscribe.current) return;
      unsubscribe.current();
      unsubscribe.current = null;
      setRunning(false);
    };
    const visibility = () => {
      if (document.hidden) cancel();
    };
    document.addEventListener("visibilitychange", visibility);
    return () => {
      document.removeEventListener("visibilitychange", visibility);
      cancel();
    };
  }, [game, view, speed, canStart]);

  return (
    <aside
      aria-label="Pace comparison"
      className="absolute bottom-20 left-3 z-10 flex items-center gap-2 rounded-md bg-panel p-2 text-xs shadow-lg"
    >
      <span>{variant === "baseline" ? "Baseline trails" : "Optimized trails"}</span>
      <button
        type="button"
        disabled={!canStart || running}
        className="rounded border border-line px-2 py-1 disabled:opacity-50"
        onClick={() => {
          setRunning(true);
          setPace(null);
          const started = performance.now();
          const startingTime = game.time;
          const stop = onFrame(() => {
            const elapsed = performance.now() - started;
            if (elapsed < SAMPLE_MS) return;
            stop();
            unsubscribe.current = null;
            setPace(((game.time - startingTime) * 1000) / elapsed);
            setRunning(false);
          });
          unsubscribe.current = stop;
        }}
      >
        {running ? "Measuring…" : "Measure 10 seconds"}
      </button>
      {pace !== null && <output>{pace.toFixed(2)}× actual</output>}
    </aside>
  );
}
