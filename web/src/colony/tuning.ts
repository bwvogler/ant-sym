// The colony's tuning constants, by domain (docs/refactor.md S3.5, ja-fnd.4.5): each file under tuning/ holds one domain's. This file
// re-exports them all, so a module imports its constants from here as before.

export * from "./tuning/homing.ts";
export * from "./tuning/foraging.ts";
export * from "./tuning/stance.ts";
export * from "./tuning/brood.ts";
export * from "./tuning/midden.ts";
export * from "./tuning/nest.ts";
export * from "./tuning/dig.ts";
