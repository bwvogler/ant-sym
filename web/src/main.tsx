import { setTrailOptimizations } from "./colony/index.ts";
import { trailVariantFromUrl } from "./ui/playbackOptions.ts";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import ColonyApp from "./ColonyApp.tsx";
import ErrorBoundary from "./ui/ErrorBoundary.tsx";
import { applyTheme, getTheme } from "./ui/theme.ts";

applyTheme(getTheme());

const root = document.getElementById("root")!;
const query = new URLSearchParams(location.search);
const preview = query.get("worker-preview");
const worker = query.get("worker");
if (query.get("benchmark") === "trail") {
  void import("./experiments/TrailBenchmarkPage.tsx").then(({ default: TrailBenchmarkPage }) =>
    createRoot(root).render(
      <ErrorBoundary>
        <TrailBenchmarkPage />
      </ErrorBoundary>,
    ),
  );
} else if (preview === "main" || preview === "worker") {
  void import("./experiments/workerPreview.ts").then(({ mountWorkerPreview }) => mountWorkerPreview(root, preview));
} else if (worker === "0" || worker === "1") {
  void import("./experiments/MapTrialPage.tsx").then(({ default: MapTrialPage }) =>
    createRoot(root).render(
      <ErrorBoundary>
        <MapTrialPage workerMode={worker === "1"} />
      </ErrorBoundary>,
    ),
  );
} else {
  setTrailOptimizations(trailVariantFromUrl() === "optimized");
  createRoot(root).render(
    <StrictMode>
      <ErrorBoundary>
        <ColonyApp />
      </ErrorBoundary>
    </StrictMode>,
  );
}
