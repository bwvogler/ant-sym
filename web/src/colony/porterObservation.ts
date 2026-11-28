import type { Colony } from "./colony.ts";

export const porterObservers = new WeakMap<
  Colony,
  {
    start: (ant: number, destination: number) => void;
    deposit: (ant: number, destination: number) => void;
  }
>();
