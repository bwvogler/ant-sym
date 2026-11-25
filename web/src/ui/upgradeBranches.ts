// How the Mutations drawer groups the upgrades into branches, and when it is wide enough to draw them as a tree (ja-52ui).

import { useSyncExternalStore } from "react";
import { upgrade, UPGRADES } from "../colony/index.ts";

/** The drawer's branches, in the order drawn: every upgrade is in one (a test pins it). */
export const BRANCHES: readonly { name: string; ids: readonly string[] }[] = [
  { name: "Body", ids: ["infectivity", "persistence", "evasion"] },
  { name: "Mycelium and spores", ids: ["mycelium", "lichen", "knots", "foci", "fruiting", "stalks"] },
  { name: "Reach", ids: ["stealth", "recognition", "trails", "senses", "royal"] },
  { name: "Lethal", ids: ["weapon", "crown"] },
];

/**
 * The tier of level `level` (1 or more) of upgrade `id` in the drawn tree (owner 2026-11-16: tiers left to right): 0 for a
 * level nothing comes before, else one more than the deepest level it follows, which is the level before it in its own
 * upgrade and what it needs.
 */
export function tierOf(id: string, level: number): number {
  const before: [string, number][] = (upgrade(id).needs[level - 1] ?? []).map((n) => [n.id, n.level]);
  if (level > 1) before.push([id, level - 1]);
  return before.length ? 1 + Math.max(...before.map(([i, l]) => tierOf(i, l))) : 0;
}

/** How many columns the tree has: the deepest tier, counted from one. */
export const TIER_COUNT = 1 + Math.max(...UPGRADES.flatMap((u) => u.steps.slice(1).map((_, k) => tierOf(u.id, k + 1))));

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
