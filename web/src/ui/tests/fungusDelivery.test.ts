import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CELL,
  cellOf,
  CountGrid,
  CURTAIN,
  decodeFungal,
  dropFood,
  digCell,
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

function deliveryWithAim(aim: string, hook: "carry" | "trail" = "carry", fork = false) {
  const words = hook === "carry" ? doctrine : "Lay a food trail in recognized chambers and leave no trail in tunnels.";
  const game = new Game(generateOneWorld(1, { plane: { size: { w: 120, h: 80 } } }), {}, mulberry32(3), [
    { antCount: hook === "trail" ? 2 : 1 },
  ]);
  const colony = game.colonies[0]!;
  const fungus = game.fungus;
  const queen = colony.queen!;
  const map = game.world!.curtain;
  if (fork) {
    cellOf(queen.x, queen.y);
    const [qx, qy] = CELL;
    for (let y = qy - 4; y <= qy + 9; y++) {
      for (let x = qx - 5; x <= qx + 9; x++) digCell(map, x, y);
    }
  }
  colony.putAnt(0, CURTAIN, queen.x, queen.y);
  colony.mode[0] = MODES.indexOf("return");
  colony.carrying[0] = 1;
  colony.params.deliveryLane = 1;
  if (hook === "trail") {
    colony.putAnt(1, PLANE, 20, 20);
    // Keep the cue above the decision threshold on the receiver’s first tick.
    colony.params.deposit = 100;
    colony.params.sensorDistance = fork ? 3 : 0.25;
  }
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
    const trailAdded = trail.get(x, y) - trailBefore;
    const choice = cachedActionTrace(colony, 0).find((action) => action.hook === hook)?.choice;
    let receiver;
    if (hook === "trail") {
      colony.putAnt(1, CURTAIN, queen.x - colony.params.sensorDistance, queen.y);
      colony.mode[1] = MODES.indexOf("explore");
      colony.heading[1] = fork ? colony.params.sensorAngle : 0;
      colony.reconsider();
      assert.equal(colony.load[1], 0);
      game.tick(DT);
      const question = colony.lastQuestion(1);
      const mode = MODES[colony.mode[1]];
      // Give only the receiver access to the same nearby food after its first decision.
      colony.putAnt(0, PLANE, 20, 20);
      const storedBeforePickup = colony.stored;
      let firstSource: "cue side" | "other" | undefined;
      if (fork) {
        const patchA = [queen.x + 4.5, queen.y + 2.6] as const;
        const patchB = [queen.x + 2.2, queen.y + 5.2] as const;
        const addSource = ([sx, sy]: readonly [number, number]) => {
          dropFood(map, sx, sy, 1);
          cellOf(sx, sy);
          return [...CELL] as [number, number];
        };
        const [ax, ay] = addSource(patchA);
        const [bx, by] = addSource(patchB);
        const a = map.food.get(ax, ay);
        const b = map.food.get(bx, by);
        for (let tick = 0; tick < 300; tick++) {
          game.tick(DT);
          if (map.food.get(ax, ay) < a) {
            firstSource = "cue side";
            break;
          }
          if (map.food.get(bx, by) < b) {
            firstSource = "other";
            break;
          }
        }
      } else {
        dropFood(map, queen.x + 1, queen.y, 1);
      }
      for (let tick = 0; tick < 60 && colony.stored === storedBeforePickup; tick++) game.tick(DT);
      receiver = { question, mode, firstSource, load: colony.load[1], delivered: colony.stored - storedBeforePickup };
    }
    return {
      receiver,
      input: colony.fungal[0],
      hostLoad: colony.load[0],
      perceived: sensed.deliveryPlace,
      place: sensed.place,
      trailAdded,
      choice,
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
  assert.equal(clear.receiver?.question?.foodTrail, "strong");
  assert.equal(damp.receiver?.question?.foodTrail, "none");
  assert.equal(clear.receiver?.mode, "follow");
  assert.equal(damp.receiver?.mode, "explore");
  assert.equal(clear.receiver?.load, 0);
  assert.equal(damp.receiver?.load, 0);
  assert.equal(clear.receiver?.delivered, 1);
  assert.equal(damp.receiver?.delivered, 1);
});

test("a fungus-influenced trail changes which food source an uninfected worker collects", () => {
  const clear = deliveryWithAim(clearAim, "trail", true);
  const damp = deliveryWithAim(dampAim, "trail", true);
  assert.equal(clear.receiver?.mode, "follow");
  assert.equal(damp.receiver?.mode, "explore");
  assert.equal(clear.receiver?.firstSource, "cue side");
  assert.equal(damp.receiver?.firstSource, "other");
  assert.equal(clear.receiver?.delivered, 1);
  assert.equal(damp.receiver?.delivered, 1);
  assert.equal(clear.receiver?.load, 0);
  assert.equal(damp.receiver?.load, 0);
});
