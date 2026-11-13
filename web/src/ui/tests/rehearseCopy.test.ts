import { test } from "node:test";
import assert from "node:assert/strict";
import { copyOf } from "../rehearse.ts";
import { buildGame } from "../useColony.ts";

// The rehearsal's copy plays by the game's own policies (ui/rehearse.ts copyOf): the colonies' modes and strategists and the fungus's levels and
// growth, so what it shows is what the page would do.

test("the game's copy takes every bound policy of the game: colonies' mode and stance, the fungus's levels and its growth", () => {
  const settings = { species: "generic", seed: 3, antCount: 20, rival: true, generation: 0 };
  const game = buildGame(settings);
  const mode = () => "explore" as const;
  const stance = () => "forage" as const;
  const levels = () => "default";
  const growth = () => null;
  game.colonies.forEach((c) => (c.bindPolicy("mode", mode), c.bindPolicy("stance", stance)));
  game.fungus.bindPolicy("fungus", levels);
  game.fungus.bindPolicy("growth", growth);
  const copy = copyOf(game, buildGame(settings));
  copy.colonies.forEach((c) => {
    assert.equal(c.policy, mode);
    assert.equal(c.stancePolicy, stance);
  });
  assert.equal(copy.fungus.policy, levels);
  assert.equal(copy.fungus.growthPolicy, growth, "the hypha tips too");
});
