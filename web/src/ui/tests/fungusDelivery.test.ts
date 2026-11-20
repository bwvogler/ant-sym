import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CELL,
  cellOf,
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

function deliveryWithAim(aim: string, hook: "carry" | "trail" = "carry") {
  const words = hook === "carry" ? doctrine : "Lay a food trail in recognized chambers and leave no trail in tunnels.";
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
    jev.setDoctrine(words);
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
      jev.seed(responseContext(hook, words), [
        [responseKey(hook, { ...carry, deliveryPlace: "royal", place: "chamber" }), hook === "carry" ? "to royal=1" : "food=1"],
        [responseKey(hook, { ...carry, deliveryPlace: "none", place: "tunnel" }), hook === "carry" ? "put down=1" : "none=1"],
      ]),
      2,
    );

    jev.setAim(aim);
    fungus.stepLayers([colony], grids, DT);
    colony.bind(CURTAIN);
    const sensed = { ...touch(colony, 0, false) };
    const before = game.world!.curtain.foodLeft;
    cellOf(colony.x[0], colony.y[0]);
    const [x, y] = CELL;
    const trail = colony.ph.fields.food;
    const trailBefore = trail.get(x, y);
    game.tick(DT);
    return {
      input: colony.fungal[0],
      hostLoad: colony.load[0],
      perceived: sensed.deliveryPlace,
      place: sensed.place,
      trailAdded: trail.get(x, y) - trailBefore,
      choice: cachedActionTrace(colony, 0).find((action) => action.hook === hook)?.choice,
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
  const outcome = ({ perceived, choice, stored, loose }: ReturnType<typeof deliveryWithAim>) => ({ perceived, choice, stored, loose });
  assert.deepEqual(outcome(clear), { perceived: "royal", choice: "to royal", stored: 1, loose: 0 });
  assert.deepEqual(outcome(damp), { perceived: "none", choice: "put down", stored: 0, loose: 1 });
});

test("fungus aim changes the cached trail choice and the scent laid with one fixed doctrine", () => {
  const clear = deliveryWithAim(clearAim, "trail");
  const damp = deliveryWithAim(dampAim, "trail");
  assert.equal(clear.input, damp.input);
  assert.equal(clear.hostLoad, damp.hostLoad);
  assert.equal(clear.place, "chamber");
  assert.equal(damp.place, "tunnel");
  assert.equal(clear.choice, "food");
  assert.equal(damp.choice, "none");
  assert.ok(clear.trailAdded > 0);
  assert.equal(damp.trailAdded, 0);
});
