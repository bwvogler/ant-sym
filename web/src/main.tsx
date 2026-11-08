import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import ColonyApp from "./ColonyApp.tsx";
import ErrorBoundary from "./ui/ErrorBoundary.tsx";
import OneWorldPreview from "./ui/OneWorldPreview.tsx";
import { isOneWorldPreview } from "./ui/oneWorldView.ts";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      {isOneWorldPreview(window.location.search) ? <OneWorldPreview /> : <ColonyApp />}
    </ErrorBoundary>
  </StrictMode>,
);
