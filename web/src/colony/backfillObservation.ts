import type { Colony } from "./colony.ts";

/** Optional instrumentation for eligible placement decisions. Normal play attaches no observer. */
export const backfillObservers = new WeakMap<
  Colony,
  (cell: number, ant: number, floor: boolean, recent: boolean, outcome: "kept" | "filled") => void
>();

/** Hears the result of a branch-entry opportunity after the ordinary scent and chance checks. */
export const branchEntryObservers = new WeakMap<Colony, (ant: number, outcome: "entered" | "skipped", corridorRecent: boolean) => void>();
