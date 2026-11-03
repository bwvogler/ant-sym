import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import ColonyApp from "./ColonyApp.tsx";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ColonyApp />
  </StrictMode>,
);
