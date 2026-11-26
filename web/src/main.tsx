import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import ColonyApp from "./ColonyApp.tsx";
import ErrorBoundary from "./ui/ErrorBoundary.tsx";
import { applyTheme, getTheme } from "./ui/theme.ts";

applyTheme(getTheme());

const root = document.getElementById("root")!;
const preview = new URLSearchParams(location.search).get("worker-preview");
if (preview === "main" || preview === "worker") {
  void import("./experiments/workerPreview.ts").then(({ mountWorkerPreview }) => mountWorkerPreview(root, preview));
} else {
  createRoot(root).render(
    <StrictMode>
      <ErrorBoundary>
        <ColonyApp />
      </ErrorBoundary>
    </StrictMode>,
  );
}
