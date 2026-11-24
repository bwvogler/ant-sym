import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { saveEndless } from "../../endlessMap.ts";
import { generateEndlessWorld, type EndlessWorld } from "../../endlessWorld.ts";
import { Game, gameRng, GAME_REGROW } from "../../game.ts";
import { STRAINS } from "../../fungus.ts";
import { DT } from "../builders.ts";

// No chunk is made on a miss inside the tick once the game has warmed up (PRD §66 E6.0.4, `ja-qpv.9.1`), and when a chunk was made changes nothing the game does.

const SEED = 3;
const hash = (v: unknown) => createHash("sha1").update(JSON.stringify(v)).digest("hex");
const make = (prefetch: boolean) => {
  const world = generateEndlessWorld(SEED) as EndlessWorld;
  const g = new Game(world, { regrow: GAME_REGROW, autoFound: false }, gameRng(SEED), [{ antCount: 40 }, { antCount: 40 }]);
  g.prefetch = prefetch;
  g.enableSleep();
  g.land(
    0,
    STRAINS.findIndex((s) => s.id === "garden"),
    { evolve: true },
  );
  return { g, world };
};

test("after 5 s no tick makes a chunk on a miss, in 60 simulated seconds on the endless plane", () => {
  const { g, world } = make(true);
  const warm = Math.round(5 / DT);
  let missed = 0;
  for (let k = 0; k < Math.round(60 / DT); k++) {
    const before = world.plane.gen.misses;
    g.tick(DT);
    if (k >= warm) missed += world.plane.gen.misses - before;
  }
  assert.equal(missed, 0, `${missed} chunks made inside the ticks after the warm-up`);
  assert.ok(world.plane.gen.prefetched > 50, `${world.plane.gen.prefetched} chunks prefetched`);
});

test("the same game with the prefetch on and off holds equal colonies, chunks and totals after 30 s: when a chunk was made is not behaviour", () => {
  const on = make(true);
  const off = make(false);
  for (let k = 0; k < Math.round(30 / DT); k++) {
    on.g.tick(DT);
    off.g.tick(DT);
  }
  assert.ok(off.world.plane.gen.misses > on.world.plane.gen.misses, "the prefetch took misses off the ticks");
  assert.equal(hash(on.g.colonies.map((c) => c.saveState())), hash(off.g.colonies.map((c) => c.saveState())));
  assert.equal(hash(saveEndless(on.world.plane)), hash(saveEndless(off.world.plane)));
  assert.equal(hash(on.g.fungus.saveState()), hash(off.g.fungus.saveState()));
});
