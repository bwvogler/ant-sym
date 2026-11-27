import type { Colony } from "./colony.ts";

/** Optional adjacent-face policy used by the nest assay. The worker still digs and hauls normally. */
export const bypassPolicies = new WeakMap<
  Colony,
  {
    choose: (ant: number, x: number, y: number) => number;
    aimedAt: (ant: number, x: number, y: number) => boolean;
    opened: (ant: number, x: number, y: number) => void;
  }
>();
