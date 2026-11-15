import { test } from "node:test";
import assert from "node:assert/strict";
import { isFed, LARVA, LARVA_FOOD } from "../../brood.ts";
import { LIFESPAN } from "../../colony.ts";
import { Game } from "../../game.ts";
import { mulberry32 } from "../../world.ts";
import { smallOne } from "../builders.ts";

// The long-run economy (PRD §41, the F2 fix-up; review of nest slice 4), on one world since S2.3c. With a queen, workers die of age and
// only brood replaces them, so a colony lasts only if the food it brings home reaches the larvae. On nest 9 every colony
// died of old age within about an hour: food piled up in a one- or two-cell reception chamber while the larvae starved,
// and a worker lived half an hour.
//
// The full game takes minutes to run an hour, too slow for the suite. This is a small one world (a 160 × 100 plane over its
// curtain) with one colony of 110 ants (165 at most) and 0.3 of both layers' food (world 2: 853 + 1,732; world 1: 1,598 +
// 2,182). It still shows the dynamics: the founders die of age within the hour, the colony digs its reception and brood
// chambers, and it lives on its larder once the food it can reach is home. The side view's history (nest 9, F2, ja-xu6.1)
// is in PRD §41 and §50.18. ja-xu6's response (old ants feel the brood's hunger and carry food to it) is guarded at unit
// level by unit/hunger.test.ts: in these games nothing begs (review of #248, S3).

/**
 * An hour of a small one world, one colony of 110 on 0.3 of the world's food, both layers (world `w`, the game seeded
 * w × 7919 + nudge). Measured on one world (S2.3c): world 2, 162 workers at 3,600 s (175 born, 123 dead of age), none
 * stranded or starved; world 1 + 1, 163 (172 born, 119 dead of age), the same. About 95 s each.
 */
function hour(w: number, nudge: number) {
  const ants = 110;
  const world = smallOne(w);
  for (const map of [world.plane, world.curtain]) {
    let total = 0;
    for (let y = 0; y < map.size.h; y++)
      for (let x = map.x0; x < map.x0 + map.size.w; x++) {
        const v = map.food.get(x, y) * 0.3;
        map.food.set(x, y, v);
        total += v;
      }
    map.foodTotal = map.foodLeft = total;
  }
  const g = new Game(world, { antCount: ants, rival: false }, mulberry32(w * 7919 + nudge));
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
  return { ants, c, stranded };
}

test(
  "an hour on: the founders have died of age and been replaced, food reached the larvae, and the colony holds its size",
  { timeout: 600_000 },
  () => {
    const { ants, c, stranded } = hour(2, 0);
    // At most 5 again (ja-xu6.2). With energy and hunger (ja-xu6.1) 6 larvae once waited here and the bound was 8; this world
    // now strands 0 with or without BROOD_MIN, so this bound does not test the nurses' brood-chamber rule.
    // The turnover happened inside the hour: most founders (born up to half a lifespan before the start) are dead.
    assert.ok(LIFESPAN <= 3600, `a lifespan within the hour (${LIFESPAN} s)`);
    assert.ok(c.diedOld >= 0.6 * ants, `died of age: ${c.diedOld} of ${ants} founders`);
    assert.ok(c.births >= c.diedOld, `born ${c.births} against ${c.diedOld} dead of age`);
    assert.ok(stranded <= 5, `${stranded} larvae at once waited over two minutes, with food enough for them lying in the nest`);
    assert.ok(c.population >= ants, `alive at 3,600 s: ${c.population} (started with ${ants})`);
    assert.equal(c.diedHungry, 0, "no worker starved");
  },
);

test(
  "a second world's hour (world 1, seeding + 1): the founders replaced, the larvae fed, the size held, none starved",
  { timeout: 600_000 },
  () => {
    // On the side view this world collapsed before ja-xu6 (the old never carried food to the brood); on one world nothing
    // begs here, so it repeats the first test's checks on another world (review of #248, S3, D1).
    const { ants, c, stranded } = hour(1, 1);
    assert.ok(c.births >= c.diedOld, `born ${c.births} against ${c.diedOld} dead of age`);
    assert.ok(stranded <= 5, `${stranded} larvae at once waited over two minutes, with food enough for them lying in the nest`);
    assert.ok(c.population >= ants, `alive at 3,600 s: ${c.population} (started with ${ants})`);
    assert.equal(c.diedHungry, 0, "no worker starved");
  },
);
