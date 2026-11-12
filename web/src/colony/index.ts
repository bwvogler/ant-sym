// The colony's public surface: what the page, the server and the maintained scripts import (docs/refactor.md S1). Code outside web/src/colony
// imports from here, never from a module file, so a module can move or split (S3) without touching them; ui/tests/colonyIndex.test.ts holds
// that line. experiment.ts (the assay harness) is not in it: scripts and the slow tests import it by name.
export * from "./battle.ts";
export * from "./brood.ts";
export * from "./chambers.ts";
export * from "./chapters.ts";
export * from "./chunks.ts";
export * from "./colony.ts";
export * from "./colonyBrain.ts";
export * from "./evolution.ts";
export * from "./fungalPolicy.ts";
export * from "./fungus.ts";
export * from "./fungusBrain.ts";
export * from "./game.ts";
export * from "./hex.ts";
export * from "./hunger.ts";
export * from "./levers.ts";
export * from "./oneWorld.ts";
export * from "./pheromone.ts";
export * from "./policyCache.ts";
export * from "./recognition.ts";
export * from "./responses.ts";
export * from "./royal.ts";
export * from "./save.ts";
export * from "./schema.ts";
export * from "./transect.ts";
export * from "./vocab.ts";
export * from "./world.ts";
