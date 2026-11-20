import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CountGrid,
  CURTAIN,
  decodeFungal,
  encodeLevels,
  fungalKey,
  fungusContext,
  Game,
  GENERIC_ANT,
  generateOneWorld,
  MODES,
  mulberry32,
  occupancy,
  PLANE,
  responseContext,
  responseKey,
  STRAINS,
  touch,
} from "../../colony/index.ts";
import { cachedActionTrace, ColonyJev } from "../colonyJev.ts";

const DT = 1 / 30;
const doctrine = "Carry food to a recognized royal chamber. Release food if the chamber mark is missing.";
const clearAim = "Preserve the host's sense of chamber floor marks.";
const dampAim = "Dampen the host's sense of chamber floor marks.";

function deliveryWithAim(aim: string) {
  const game = new Game(generateOneWorld(1, { plane: { size: { w: 120, h: 80 } } }), { antCount: 1, rival: false }, mulberry32(3));
  const colony = game.player;
  const fungus = game.fungus;
  const queen = colony.queen!;
  colony.putAnt(0, CURTAIN, queen.x, queen.y);
  colony.mode[0] = MODES.indexOf("return");
  colony.carrying[0] = 1;
  colony.params.deliveryLane = 1;
  fungus.menu = ["marks"];
  const strain = STRAINS.findIndex((s) => s.id === "garden");
  fungus.paint([colony], queen.x, queen.y, 1, 0, 1, strain, CURTAIN);
  const grids = [[occupancy(colony, new CountGrid(), PLANE)], [occupancy(colony, new CountGrid(), CURTAIN)]];
  fungus.stepLayers([colony], grids, DT);
  const situation = decodeFungal(colony.fungal[0]);
  assert.equal(situation.carrying, "food");

  const jev = new ColonyJev();
  try {
    jev.setDoctrine(doctrine);
    jev.attachColonies([colony], GENERIC_ANT, true);
    jev.attachFungus(fungus);
    const asked = fungus.askedFor(situation);
    assert.deepEqual(asked, ["marks"]);
    const key = fungalKey(situation, asked);
    assert.equal(jev.seed(fungusContext(clearAim), [[key, encodeLevels({}, asked)]]), 1);
    assert.equal(jev.seed(fungusContext(dampAim), [[key, encodeLevels({ marks: 0 }, asked)]]), 1);
    colony.bind(CURTAIN);
    const carry = { ...touch(colony, 0, false) };
    assert.equal(
      jev.seed(responseContext("carry", doctrine), [
        [responseKey("carry", { ...carry, deliveryPlace: "royal", place: "chamber" }), "to royal=1"],
        [responseKey("carry", { ...carry, deliveryPlace: "none", place: "tunnel" }), "put down=1"],
      ]),
      2,
    );

    jev.setAim(aim);
    fungus.stepLayers([colony], grids, DT);
    colony.bind(CURTAIN);
    const sensed = { ...touch(colony, 0, false) };
    const before = game.world!.curtain.foodLeft;
    game.tick(DT);
    return {
      input: colony.fungal[0],
      hostLoad: colony.load[0],
      perceived: sensed.deliveryPlace,
      choice: cachedActionTrace(colony, 0).find((action) => action.hook === "carry")?.choice,
      stored: colony.stored,
      loose: game.world!.curtain.foodLeft - before,
    };
  } finally {
    jev.dispose();
  }
}

test("fungus aim changes a carrier's floor cue, cached action and food outcome with one fixed doctrine", () => {
  const clear = deliveryWithAim(clearAim);
  const damp = deliveryWithAim(dampAim);
  assert.equal(clear.input, damp.input);
  assert.equal(clear.hostLoad, damp.hostLoad);
  assert.ok(clear.hostLoad > 0.8);
  const { input, hostLoad, ...clearOutcome } = clear;
  const { input: _input, hostLoad: _load, ...dampOutcome } = damp;
  assert.deepEqual(clearOutcome, { perceived: "royal", choice: "to royal", stored: 1, loose: 0 });
  assert.deepEqual(dampOutcome, { perceived: "none", choice: "put down", stored: 0, loose: 1 });
});
