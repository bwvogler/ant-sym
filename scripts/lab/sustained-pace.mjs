// Run from any directory with Node 24. Each window continues the same full-population game.
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { buildTrialGame } from "../../web/src/experiments/workerTrial.ts";
import { MAX_STEP } from "../../web/src/ui/fixedStepClock.ts";

const seed = Number(process.argv[2] ?? 17);
globalThis.fetch = async (path) => Response.json(JSON.parse(await readFile(new URL("../../web/public/" + path, import.meta.url), "utf8")));
const { game } = await buildTrialGame(seed, 600, true);
for (let window = 0; window < 3; window++) {
  const start = game.time;
  const wall = performance.now();
  for (let tick = 0; tick < 600; tick++) game.tick(MAX_STEP);
  const elapsed = performance.now() - wall;
  console.log(
    JSON.stringify({
      seed,
      start: Math.round(start),
      end: Math.round(game.time),
      meanTickMs: elapsed / 600,
      enginePace: ((game.time - start) * 1000) / elapsed,
      state: createHash("sha256").update(JSON.stringify(game.save())).digest("hex"),
    }),
  );
}
