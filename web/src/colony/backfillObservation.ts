import type { Colony } from "./colony.ts";

/** Optional instrumentation for eligible placement decisions. Normal play attaches no observer. */
export const backfillObservers = new WeakMap<
  Colony,
  (cell: number, ant: number, floor: boolean, recent: boolean, outcome: "kept" | "filled") => void
>();
