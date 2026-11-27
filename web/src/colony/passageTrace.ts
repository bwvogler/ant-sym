// An opt-in local mark left by ordinary underground cell crossings.
import { cellKey } from "./grid.ts";

export const BACKFILL_TRACE_SECONDS = 12;
export type BackfillTraffic = "quiet" | "recent";

export interface PassageTrace {
  cells: Map<number, number>;
  porterCrossings?: Map<number, { at: number; level: number }>;
  nextPrune: number;
  checks: number;
  recentKept: number;
  recentFilled: number;
}

export function newPassageTrace(): PassageTrace {
  return { cells: new Map(), nextPrune: 0, checks: 0, recentKept: 0, recentFilled: 0 };
}

export function rememberPassage(trace: PassageTrace, x: number, y: number, now: number): void {
  trace.cells.set(cellKey(x, y), now);
}

export function recentPassage(trace: PassageTrace, x: number, y: number, now: number, lifetime: number): boolean {
  return now - (trace.cells.get(cellKey(x, y)) ?? -Infinity) <= lifetime;
}

const PORTER_FLOW_DECAY = 2;

export function rememberPorterCrossing(trace: PassageTrace, x: number, y: number, now: number): void {
  const crossings = (trace.porterCrossings ??= new Map());
  const key = cellKey(x, y);
  const last = crossings.get(key);
  const level = last ? last.level * Math.exp(-(now - last.at) / PORTER_FLOW_DECAY) : 0;
  crossings.set(key, { at: now, level: Math.min(24, level + 1) });
}

export function porterPassage(trace: PassageTrace, x: number, y: number, now: number): "light" | "heavy" {
  const last = trace.porterCrossings?.get(cellKey(x, y));
  return last && last.level * Math.exp(-(now - last.at) / PORTER_FLOW_DECAY) >= 6 ? "heavy" : "light";
}

export function prunePassages(trace: PassageTrace, now: number, lifetime: number): void {
  if (now < trace.nextPrune) return;
  for (const [key, at] of trace.cells) if (now - at > lifetime) trace.cells.delete(key);
  if (trace.porterCrossings) for (const [key, { at }] of trace.porterCrossings) if (now - at > 8) trace.porterCrossings.delete(key);
  trace.nextPrune = now + 1;
}
