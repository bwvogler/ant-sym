import { lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import ColonyApp from "./ColonyApp.tsx";
import ErrorBoundary from "./ui/ErrorBoundary.tsx";
import { isOneWorldPreview } from "./ui/oneWorldView.ts";

// The one-world preview (?world=one) loads only when asked for: the game's page doesn't carry it. (The entry module
// exports nothing and is never hot-swapped, so fast refresh's rule doesn't apply.)
// oxlint-disable-next-line react/only-export-components
const OneWorldPreview = lazy(() => import("./ui/OneWorldPreview.tsx"));

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      {isOneWorldPreview(window.location.search) ? (
        <Suspense fallback={null}>
          <OneWorldPreview />
        </Suspense>
      ) : (
        <ColonyApp />
      )}
    </ErrorBoundary>
  </StrictMode>,
);
