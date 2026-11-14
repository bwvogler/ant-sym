import { parentPort, workerData } from "node:worker_threads";
import { game1, runAssay } from "../../experiment.ts";

// One G1 game in a worker thread, for oneWorldG1.test.ts: posts back the held-food figures of one seed.
const { seed } = workerData as { seed: number };
const m = runAssay(game1, seed).metrics;
parentPort?.postMessage({
  seed,
  you: m["you.maxHeld"] ?? 0,
  rival: m["rival.maxHeld"] ?? 0,
  worst: m.maxHeld ?? 0,
});
