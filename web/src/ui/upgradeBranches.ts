// How the Mutations drawer groups the upgrades into branches, and when it is wide enough to draw them as a tree (ja-52ui).

import { useSyncExternalStore } from "react";

/** The drawer's branches, in the order drawn: every upgrade is in one (a test pins it). */
export const BRANCHES: readonly { name: string; ids: readonly string[] }[] = [
  { name: "Body", ids: ["infectivity", "persistence", "evasion"] },
  { name: "Mycelium and spores", ids: ["mycelium", "knots", "fruiting", "stalks"] },
  { name: "Reach", ids: ["stealth", "recognition", "trails", "senses", "royal"] },
  { name: "Lethal", ids: ["weapon", "crown"] },
];

const WIDE = "(min-width: 1024px)";
function subscribe(on: () => void): () => void {
  const m = window.matchMedia(WIDE);
  m.addEventListener("change", on);
  return () => m.removeEventListener("change", on);
}
/** Whether the screen is wide enough for the tree (the drawer widens for it). */
export function useWideTree(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(WIDE).matches,
    () => false,
  );
}
