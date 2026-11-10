import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import ColonyApp from "./ColonyApp.tsx";
import ErrorBoundary from "./ui/ErrorBoundary.tsx";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <ColonyApp />
    </ErrorBoundary>
  </StrictMode>,
);
