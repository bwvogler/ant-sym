import { test } from "node:test";
import assert from "node:assert/strict";
import { CURTAIN, Game, gameRng, PLANE, generateOneWorld, STRAINS } from "../../../colony/index.ts";
import { nextCrossing, REHEARSE_DT } from "../../rehearse.ts";

// The e2e guard's rehearsal: the ant a copy of the game says comes up next does, on that very tick, when the game itself
// is stepped the same way; the game is untouched by the rehearsal.

const SEED = 4;
const build = (): Game => new Game(generateOneWorld(SEED), { antCount: 60, rivalAnts: 60, regrow: 0, autoFound: false }, gameRng(SEED));

for (const below of [60, 600])
  test(`the ant a rehearsal finds comes up on the tick it said, in the game stepped the same way (${below} steps below first)`, () => {
    const game = build();
    game.land(
      0,
      STRAINS.findIndex((s) => s.id === "garden"),
      { evolve: true },
    );
    for (let t = 0; t < 20 * 30; t++) game.tick(REHEARSE_DT); // the ants out, and some back
    const time = game.time;
    // `below` steps in the curtain at the least before it comes up: the guard follows it from below that long.
    const c = nextCrossing(game, build(), 60, below);
    assert.ok(c, "no ant came up within 60 s");
    assert.ok(c.ticks >= below);
    assert.equal(game.time, time, "the rehearsal ticked the game");
    const col = game.colonies[c.k]!;
    for (let t = 1; t < c.ticks; t++) {
      game.tick(REHEARSE_DT);
      if (t >= c.ticks - below) assert.equal(col.layer[c.i], CURTAIN, `not below on tick ${t}, before the ${c.ticks} rehearsed`);
    }
    game.tick(REHEARSE_DT);
    assert.equal(col.layer[c.i], PLANE, `still below on tick ${c.ticks}`);
    assert.equal(col.gen[c.i], c.gen);
  });
