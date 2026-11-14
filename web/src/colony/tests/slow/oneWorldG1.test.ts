import { test } from "node:test";
import assert from "node:assert/strict";
import { availableParallelism } from "node:os";
import { Worker } from "node:worker_threads";

// G1 (experiment.ts game1): generateOneWorld(seed), 600 + 600 ants, 600 s, gameRng, the side view's held-food bound (A7):
// no colony with more than 2 foragers holding food over 120 s at any 10-s sample, counted on both layers. The bound of 2 is
// not loosened (owner, 2026-11-11).
//
// Judged on a share of seeds, not on three fixed ones (ja-ysco, owner 2026-11-14; PRD §59). A seed's figure is the worst of
// ~60 samples over two colonies in one game, so it swings with any change to one world's play: on seed 4, routeStep 4 gave
// 2, 3 or 7 as routeSee moved, and #153 then #180 each took seed 4 over the bound with no change to route memory. Three
// fixed seeds all pass about one time in five for any setting, so the old guard (seeds 4, 5 and 9) was re-rolled by every
// plane change. The guard now asks that at least WITHIN of seeds 1-10 meet the bound, and that no seed reaches CEILING (a
// carrier jam like main's 33 before route memory).
//
// Each game takes 3-5 minutes; the ten run in worker threads, as many at a time as the machine has cores.
const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const BOUND = 2;
const WITHIN = 4;
const CEILING = 10;

interface Held {
  seed: number;
  you: number;
  rival: number;
  worst: number;
}

function game(seed: number): Promise<Held> {
  return new Promise((resolve, reject) => {
    const w = new Worker(new URL("./oneWorldG1Game.ts", import.meta.url), { workerData: { seed } });
    w.once("message", resolve);
    w.once("error", reject);
    w.once("exit", (code) => code && reject(new Error(`G1 seed ${seed}: worker exited with ${code}`)));
  });
}

async function all(seeds: number[], jobs: number): Promise<Held[]> {
  const out: Held[] = [];
  const queue = [...seeds];
  await Promise.all(
    Array.from({ length: Math.max(1, Math.min(jobs, queue.length)) }, async () => {
      for (let s = queue.shift(); s !== undefined; s = queue.shift()) out.push(await game(s));
    }),
  );
  return out.sort((a, b) => a.seed - b.seed);
}

test(
  `G1, one world: hardly a forager holds its food over 120 s (seeds 1-10, 600 + 600 ants, 600 s; at most ${BOUND} on at least ${WITHIN} seeds, none at ${CEILING} or more)`,
  { timeout: 1_800_000 },
  async () => {
    const held = await all(SEEDS, availableParallelism());
    const within = held.filter((h) => h.worst <= BOUND).length;
    const table = held.map((h) => `seed ${h.seed}: ${h.you} / ${h.rival}`).join("; ");
    assert.ok(within >= WITHIN, `${within} of ${SEEDS.length} seeds within ${BOUND} (need ${WITHIN}): ${table}`);
    const jam = held.filter((h) => h.worst >= CEILING);
    assert.equal(jam.length, 0, `seeds at ${CEILING} or more: ${table}`);
  },
);
