import { test } from "node:test";
import assert from "node:assert/strict";
import { Colony } from "../../colony/colony.ts";
import { mulberry32, worldFromArrays } from "../../colony/world.ts";
import { followedColony } from "../follow.ts";

test("a followed ant is gone when it dies, and stays gone when a newborn takes its slot", () => {
  const map = worldFromArrays({ w: 40, h: 12 }, [{ x: 6, y: 6, r: 2 }]);
  const c = new Colony(map, { antCount: 3, maxAnts: 3, foodPerAnt: 1 }, mulberry32(1), () => "explore");
  const f = { side: "you" as const, i: 1, gen: c.gen[1] as number };
  assert.equal(followedColony(c, null, f), c);
  c.kill(1);
  assert.equal(followedColony(c, null, f), null, "dead");
  c.larder = 1;
  c.tick(1 / 30); // the larder becomes an ant in the free slot: slot 1 again
  assert.equal(c.alive[1], 1, "the slot is refilled");
  assert.equal(followedColony(c, null, f), null, "a newborn in the same slot is a different ant");
  assert.equal(followedColony(c, null, { side: "rival", i: 0, gen: 1 }), null, "no rival, nothing to follow");
});
