import type { KnownColonies } from "./known.ts";
import type { ColonyStats, SideStats } from "../stats.ts";

// What the page's readouts say of the colonies under the fog (docs/fog-of-war.md §4.4, §5.3, ja-1ypq.5; owner, 2026-11-23): only the colonies the fungus knows, their
// numbers live while a host is in them and otherwise as of when the last one left. Pure, so `node --test` covers it; the panels draw it.

/** One colony as a readout shows it. */
export interface KnownSide {
  /** the colony's index (Game.colonies order: its name) */
  k: number;
  /** its numbers; null for a colony known by its hole alone, before any host (the fungus learned the nest is there, not its counts) */
  side: SideStats | null;
  /** whether a host is in it now, so the numbers are the present */
  live: boolean;
  /** the sim time of the numbers */
  asOf: number;
}

/** The colonies a readout lists: every one without the fog (live), only the known ones under it. */
export function knownSides(stats: ColonyStats, known: KnownColonies<SideStats> | null): KnownSide[] {
  if (!known) return stats.sides.map((side, k) => ({ k, side, live: true, asOf: stats.time }));
  return known.list().map((k) => {
    const e = known.get(k)!;
    return { k, side: e.readout, live: e.live, asOf: e.asOf };
  });
}

/** Whether the readouts name colony `k`: always without the fog, once known under it. */
export const isKnown = (known: KnownColonies<SideStats> | null, k: number): boolean => !known || known.get(k) !== null;

/** Whether the fungus knows every colony of the game: what a statement about all of them (one colony, the unity) needs. */
export const knowsAll = (known: KnownColonies<SideStats> | null, n: number): boolean => !known || (n > 0 && known.list().length >= n);

/**
 * The Codex's numbers under the fog: the deaths of the colonies the fungus knows, and the odours' gap only while it knows two or more.
 * Without it, `stats` as it is.
 */
export function knownCodexStats(stats: ColonyStats | null, known: KnownColonies<SideStats> | null): ColonyStats | null {
  if (!stats || !known) return stats;
  const sides = stats.sides.filter((_, k) => known.get(k) !== null);
  return { ...stats, sides, unity: sides.length >= 2 ? stats.unity : { ...stats.unity, gap: 1 } };
}

/**
 * Whether the game's ending is news to the fungus: a colony gone is told only once it is a colony the fungus knows, and "one colony" only once it
 * knows them all. Without the fog always (and "playing" is never an ending).
 */
export function endingKnown(stats: ColonyStats, known: KnownColonies<SideStats> | null): boolean {
  if (stats.outcome === "fallen") return isKnown(known, stats.fallen);
  if (stats.outcome === "unified") return knowsAll(known, stats.sides.length);
  return true;
}

/** The nest tab's line for a colony the fungus knows but has no host in: what it last knew, and when (null: known by its hole alone). */
export function lastKnownText(side: SideStats | null, now: number, at: number): string {
  if (!side) return "The nest is known; no host of yours has been in it, so nothing of what is inside.";
  const queen = side.queen === "alive" ? "alive" : side.queen === "lost" ? "dead (orphaned)" : "—";
  return `${asOf(now, at)}: queen ${queen} · brood ${side.brood.join(" / ")} (eggs / larvae / pupae) · ${side.population} ants`;
}

/** "as of 12 s ago", for numbers no host is in. */
export const asOf = (now: number, at: number): string => `as of ${Math.max(0, Math.round(now - at))} s ago`;
