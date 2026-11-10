import { test } from "node:test";
import assert from "node:assert/strict";
import { game1, runAssay } from "../../experiment.ts";

// Whole-game guards of one world (docs/one-world.md U6a), beside slow/side.test.ts: `npm run test:slow`.

// G1 (experiment.ts game1): generateOneWorld(seed), 600 + 600 ants, 600 s, gameRng, the side view's held-food bound (A7):
// no colony with more than 2 foragers holding food over 120 s at any 10-s sample, counted on both layers.
// Measured (U6a, `npm run exp -- --one game1 --seeds 1-10`): one world fails it on every seed. The most per colony, by
// seed (you / rival): 1: 12 / 15, 2: 10 / 16, 3: 11 / 32, 4: 18 / 4, 5: 13 / 6, 6: 11 / 20, 7: 12 / 22, 8: 16 / 10,
// 9: 13 / 7, 10: 44 / 10. Every one of them is on the plane (maxHeldPlane equals maxHeld): carriers lost on the surface on
// their way home, not stuck in the tunnels; porters hold theirs over 120 s on 2 of 20 colonies (at most 4). The bound is
// not loosened without the owner: this stays a todo, on the two seeds whose worst colony held fewest (5 and 9, 13 each),
// until homing on the plane brings them under it. Each seed runs about 3–5 minutes.
test.todo("G1, one world: hardly a forager holds its food over 120 s (seeds 5 and 9, 600 + 600 ants, 600 s; measured 13 and 13 at worst, bound 2)", { timeout: 1_800_000 }, () => {
  const held: string[] = [];
  let worst = 0;
  for (const seed of [5, 9]) {
    const m = runAssay(game1, seed).metrics;
    held.push(`seed ${seed}: ${m["you.maxHeld"]} / ${m["rival.maxHeld"]} (on the plane ${m["you.maxHeldPlane"]} / ${m["rival.maxHeldPlane"]})`);
    worst = Math.max(worst, m.maxHeld as number);
  }
  assert.ok(worst <= 2, `foragers holding food over 120 s, most at any 10-s sample per colony: ${held.join("; ")}`);
});
