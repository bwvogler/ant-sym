import { test } from "node:test";
import assert from "node:assert/strict";
import { Game } from "../../game.ts";
import { generateSideWorld, mulberry32 } from "../../world.ts";

// Whole-game guards of the side view, too slow for `npm test`'s 60 s per file: `npm run test:slow`.

test("whole games: hardly a forager holds its food over 120 s (seeds 4 and 6, 600 + 600 ants, 600 s; #16's guard, restored)", { timeout: 900_000 }, () => {
  // #16 dropped "at most 1 ant carrying food for over a minute", the guard that would have caught #17's pit and #20's
  // lost carriers (a vector off by more than the search's 80 cells: on the ground at the map's edge, or searching for good).
  // Measured (PRD §40): foragers holding food over 120 s, the most at any 10-s sample from 120 s, per colony, by 600 s.
  //   Before these fixes (nest 9 at 99eed4b): seed 4: 4 / 0, seed 6: 0 / 3; seeds 1, 2, 3, 5: 2, 0, 1, 2 at most.
  //   After: seed 4: 1 / 1, seed 6: 0 / 1; at most 2 in any colony of seeds 1–6 (seed 2: 0 / 2).
  // Lost carriers pile up late (before: none over 2 until 510 s) and only with 600 ants a colony, hence the size and
  // length: about 3 minutes. The seeds were chosen to separate before from after: of seeds 1–6, the only two where the
  // base passes the bound. (On nest 9 before #14's backfill fixes, af964b1, the base had 3–13 by 450–600 s on seeds 2–5;
  // with the backfill fixes, fewer held food that long.) Porters (food moved between chambers, nest slice 5) are not
  // counted: their long trips are an open item (PRD §40).
  let worst = 0;
  const peaks: string[] = [];
  for (const seed of [4, 6]) {
    const g = new Game(generateSideWorld(seed), { antCount: 600, rivalAnts: 600 }, mulberry32(seed * 7919));
    const peak = g.colonies.map(() => 0);
    for (let k = 1; k <= 30 * 600; k++) {
      g.tick(1 / 30);
      if (k % 300 !== 0 || k < 30 * 120) continue;
      g.colonies.forEach((c, ci) => {
        let held = 0;
        for (let i = 0; i < c.n; i++) if (c.alive[i] && c.carrying[i] && !c.porting(i) && c.since[i]! > 120) held++;
        peak[ci] = Math.max(peak[ci]!, held);
      });
    }
    peaks.push(`seed ${seed}: ${peak.join(" / ")}`);
    worst = Math.max(worst, ...peak);
  }
  assert.ok(worst <= 2, `foragers holding food over 120 s, most at any 10-s sample per colony: ${peaks.join("; ")}`);
});

test.todo("whole games: hardly a porter holds its food over 120 s either (ja-3po: resting foragers jam the nest; review of #36: seeds 1-6, 20 at the end on MR 3.1 against 1 on main)");
