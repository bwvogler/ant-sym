// The long games of evolution.test.ts (split out so no file nears the 60 s per-file limit on CI, ja-6mj); the quick tests are in evolution.test.ts.
import { test } from "node:test";
import assert from "node:assert/strict";
import { STRAINS } from "../../fungus.ts";
import { Game } from "../../game.ts";
import { mulberry32 } from "../../world.ts";
import { smallOne } from "../builders.ts";

// The fungus's body and evolution (ja-lo8.12): reach holds levels where they take effect and nowhere else, mutations
// come with growth, the mycelium pays for its spores, a founded colony can get what the first colony got, and the
// minimum dose is a rate.

const GARDEN = STRAINS.findIndex((s) => s.id === "garden");

test("the queen's larger grooming cap is the evolving game's: a lab or test game's queen is groomed as before (PR #43 review, S1)", () => {
  const queenAt = (queenGroomers: number, evolve: boolean, seconds = 45) => {
    const g = new Game(smallOne(1), { fungus: { queenGroomers } }, mulberry32(7919), [{ antCount: 300 }, { antCount: 300 }]);
    g.land(0, GARDEN, { evolve });
    if (evolve) {
      // Garden as listed, so the fungus reaches her in a short run.
      g.fungus.strains[GARDEN]!.transmission = 0.3;
      g.fungus.strains[GARDEN]!.decay = 0;
    }
    for (let k = 0; k < 30 * seconds; k++) g.tick(1 / 30);
    return g.colonies[0]!.queen!.load;
  };
  assert.equal(queenAt(8, false), queenAt(4, false), "not evolving: the cap is not read");
  // The seven-cell landing (PRD §85) takes the fungus about a minute to reach her: 120 s, where the caps part (0.543 vs 0.501).
  const four = queenAt(4, true, 120);
  const eight = queenAt(8, true, 120);
  assert.ok(four > 0 && eight !== four, `evolving: the cap is read (${four.toFixed(3)} vs ${eight.toFixed(3)})`);
});
