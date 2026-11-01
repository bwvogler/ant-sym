import { useEffect, useState } from "react";
import App from "./App.tsx";
import ColonyApp from "./ColonyApp.tsx";
import type { Page } from "./ui/Nav.tsx";

// Picks the page from the URL hash (#colony, else the picture) and follows it.

const pageOf = (hash: string): Page => (hash === "#colony" ? "colony" : "picture");

export default function Root() {
  const [page, setPage] = useState(() => pageOf(location.hash));
  useEffect(() => {
    const on = () => setPage(pageOf(location.hash));
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return page === "colony" ? <ColonyApp /> : <App />;
}
