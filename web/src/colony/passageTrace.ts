// An opt-in local mark left by ordinary underground cell crossings.
import { cellKey } from "./grid.ts";

export const BACKFILL_TRACE_SECONDS = 12;
export type BackfillTraffic = "quiet" | "recent";

export interface PassageTrace {
  cells: Map<number, number>;
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

export function prunePassages(trace: PassageTrace, now: number, lifetime: number): void {
  if (now < trace.nextPrune) return;
  for (const [key, at] of trace.cells) if (now - at > lifetime) trace.cells.delete(key);
  trace.nextPrune = now + 1;
}
