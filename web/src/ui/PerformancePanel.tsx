import { useEffect, useState, useSyncExternalStore } from "react";
import type { PageProfile } from "./pageProfile.ts";
import { independentClockFromUrl } from "./playbackOptions.ts";

interface Props {
  profile: PageProfile;
  seed: number;
  view: string;
  requestedSpeed: number;
  startingAntsPerColony: number;
  canStart: boolean;
}

export function PerformancePanel({ profile, seed, view, requestedSpeed, startingAntsPerColony, canStart }: Props) {
  const { running, report } = useSyncExternalStore(profile.subscribe, profile.getSnapshot);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    const cancelIfHidden = () => {
      if (document.hidden) profile.cancel();
    };
    document.addEventListener("visibilitychange", cancelIfHidden);
    return () => {
      document.removeEventListener("visibilitychange", cancelIfHidden);
      profile.cancel();
    };
  }, [profile, seed, view, requestedSpeed, canStart]);

  const json = report && JSON.stringify(report, null, 2);
  return (
    <aside
      aria-label="Performance profile"
      className="absolute bottom-20 left-3 z-10 max-w-[calc(100%-1.5rem)] rounded-md bg-panel p-2 text-xs shadow-lg"
    >
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={!canStart || running}
          className="rounded border border-line px-2 py-1 disabled:opacity-50"
          onClick={() => {
            setCopied(false);
            profile.start(
              { seed, view, requestedSpeed, startingAntsPerColony, clock: independentClockFromUrl() ? "independent" : "frame" },
              performance.now(),
            );
          }}
        >
          {running ? "Measuring…" : "Measure 10 seconds"}
        </button>
        {!canStart && !report && <span>Start or resume the game</span>}
        {report && <span data-profile-pace={report.pace}>{report.pace.toFixed(2)}× actual</span>}
      </div>
      {report && json && (
        <details className="mt-1">
          <summary className="cursor-pointer">Performance results</summary>
          <p className="my-1">
            95th percentile · tick {report.tick?.p95Ms.toFixed(1) ?? "—"} ms · after tick {report.afterTick?.p95Ms.toFixed(1) ?? "—"} ms ·
            draw {report.mapDraw?.p95Ms.toFixed(1) ?? "—"} ms · frame gap {report.frameGap?.p95Ms.toFixed(1) ?? "—"} ms
          </p>
          <button
            type="button"
            className="mb-1 rounded border border-line px-2 py-1"
            onClick={() =>
              void navigator.clipboard?.writeText(json).then(
                () => setCopied(true),
                () => setCopied(false),
              )
            }
          >
            {copied ? "Copied" : "Copy results"}
          </button>
          <textarea
            aria-label="Performance results JSON"
            className="block h-20 w-full rounded border border-line p-1 font-mono"
            readOnly
            value={json}
          />
        </details>
      )}
    </aside>
  );
}
