import { test } from "node:test";
import assert from "node:assert/strict";
import { isFed, LARVA, LARVA_FOOD } from "../../brood.ts";
import { LIFESPAN } from "../../colony.ts";
import { Game } from "../../game.ts";
import { generateSideWorld, mulberry32 } from "../../world.ts";

// The side view's long-run economy (PRD §41, the F2 fix-up; review of nest slice 4). With a queen, workers die of age and
// only brood replaces them, so a colony lasts only if the food it brings home reaches the larvae. On nest 9 every colony
// died of old age within about an hour: food piled up in a one- or two-cell reception chamber while the larvae starved,
// and a worker lived half an hour.
//
// The full game (768 × 368, 600 ants a colony) takes about 10 minutes to run an hour, too slow for the suite. This is the
// tests' small map (256 × 160) with one colony of 110 ants (165 at most) and 0.3 of the map's food, about the full game's
// food per ant (27,840 for 1,200 founders there; 2,190 for 110 here). It still shows the dynamics: the founders die of
// age within the hour; the colony digs its reception and brood chambers; it brings home all the food it can reach by
// about 2,400 s and lives on its larder after. Measured (`node scripts/economy-bench.mjs 2 3600 110 1 1200 <root> 1 0.3`):
// at 3,600 s this branch has 152 workers (167 born, 125 dead of age); with a lifespan of 1,800 s, 20; with the food flow
// as it was (food to a reception of any size, porters only from reception and stores, no forager handing on), 130, with
// 30 larvae unfed for over two minutes beside 117 food in the nest (none on this branch until the last minute, when the
// larder is down to 33: 2). `scripts/economy-bench.mjs` measures the full game.

test("an hour on: the founders have died of age and been replaced, food reached the larvae, and the colony holds its size", { timeout: 600_000 }, () => {
  const ants = 110;
  const map = generateSideWorld(2, { size: { w: 256, h: 160 }, nestGap: 120, surface: 40, nestCount: 1 });
  let total = 0;
  for (let y = 0; y < map.size.h; y++)
    for (let x = 0; x < map.size.w; x++) {
      const v = map.food.get(x, y) * 0.3;
      map.food.set(x, y, v);
      total += v;
    }
  map.foodTotal = map.foodLeft = total;
  const g = new Game(map, { antCount: ants, rival: false }, mulberry32(2 * 7919));
  const c = g.player;
  // Food idle in the nest while larvae starve: larvae unfed for over two minutes (a larva is fed in about 6 s once food
  // lies by it), while the chambers hold enough to feed them.
  let stranded = 0;
  for (let k = 1; k <= 30 * 3600; k++) {
    g.tick(1 / 30);
    if (k % (30 * 60) || k < 30 * 300) continue;
    const waiting = c.brood.items.filter((b) => b.stage === LARVA && b.t > 120 && !isFed(b)).length;
    if (c.larder >= waiting * LARVA_FOOD) stranded = Math.max(stranded, waiting);
  }
  // The turnover happened inside the hour: most founders (born up to half a lifespan before the start) are dead.
  assert.ok(LIFESPAN <= 3600, `a lifespan within the hour (${LIFESPAN} s)`);
  assert.ok(c.diedOld >= 0.6 * ants, `died of age: ${c.diedOld} of ${ants} founders`);
  assert.ok(c.births >= c.diedOld, `born ${c.births} against ${c.diedOld} dead of age`);
  assert.ok(stranded <= 5, `${stranded} larvae at once waited over two minutes, with food enough for them lying in the nest`);
  assert.ok(c.population >= ants, `alive at 3,600 s: ${c.population} (started with ${ants})`);
});
