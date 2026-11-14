import { INFECTED, MODES, type Colony, type Fungus } from "../colony/index.ts";
import { colonyName } from "./names.ts";

// What the map says over each nest and next to the followed ant (PRD §69.2, ja-mvo9.2): pure, so `node --test` covers
// the words; ColonyField draws them. A picture only: no ant senses it.

/** A colony's badge over its hole: its name, how far the fungus is into it, and its queen. */
export interface NestBadge {
  name: string;
  /** the share of its living ants carrying the fungus, or null while none does */
  infected: number | null;
  /** its queen: clean, carrying the fungus, or dead; null for a colony without one */
  queen: "clean" | "infected" | "lost" | null;
}

export function nestBadge(c: Colony, k: number, fungus: Fungus): NestBadge {
  const { infected, living } = fungus.census(c);
  const q = c.queen;
  return {
    name: colonyName(k),
    infected: infected > 0 && living > 0 ? infected / living : null,
    queen: q === null ? null : !q.alive ? "lost" : q.load >= INFECTED ? "infected" : "clean",
  };
}

/** The badge's parts in order, each with what it means (for the canvas: drawn in one pill, coloured by `tone`). */
export function badgeParts(b: NestBadge): { text: string; tone: "ink" | "spore" | "warn" | "dim" }[] {
  const parts: { text: string; tone: "ink" | "spore" | "warn" | "dim" }[] = [{ text: b.name, tone: "ink" }];
  if (b.infected !== null) parts.push({ text: `${Math.max(1, Math.round(100 * b.infected))}%`, tone: "spore" });
  if (b.queen === "infected") parts.push({ text: "♛", tone: "spore" });
  else if (b.queen === "clean") parts.push({ text: "♛", tone: "dim" });
  else if (b.queen === "lost") parts.push({ text: "no queen", tone: "warn" });
  return parts;
}

/** The followed ant's tag: its number and what it is doing. */
export function antTag(c: Colony, i: number): string {
  return `#${i} · ${MODES[c.mode[i]] ?? "?"}`;
}
