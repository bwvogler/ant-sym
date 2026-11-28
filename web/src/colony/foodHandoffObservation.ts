import type { Colony } from "./colony.ts";

/** Called only for incoming loads and at the first-stage worksite. Assays attach an observer here. */
export const foodHandoffObservers = new WeakMap<Colony, (ant: number, event: "entry" | "ready" | "deposit" | "self-port") => void>();
