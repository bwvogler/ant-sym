import assert from "node:assert/strict";
import { test } from "node:test";
import { nx, ny } from "../../web/src/colony/hex.ts";
import { SOIL, worldFromArrays } from "../../web/src/colony/world.ts";
import { observeNestMilling } from "./nest-milling.mjs";

function fixture() {
  const map = worldFromArrays({ w: 30, h: 18 }, [{ x: 3, y: 3, r: 1 }]);
  map.chambers = {
    list: [
      { colony: 0, role: "reception" },
      { colony: 0, role: "brood" },
    ],
    at: (x, y) => (y !== 3 ? -1 : x === 10 ? 0 : x === 13 ? 1 : -1),
  };
  const colony = {
    layers: [{ map }],
    home: 0,
    params: { nest: 0 },
    entranceCol: 3,
    entranceRow: 3,
    time: 0,
    age: [10],
    digT: [0],
    carrying: [0],
    pellet: [0],
    broodHeld: [0],
    crop: [0],
  };
  const observer = observeNestMilling(colony, 1);
  function step(cell) {
    colony.time++;
    observer.sample(0, ...cell);
  }
  return { map, colony, step, checkpoint: observer.checkpoint };
}

test("two laps count their elapsed time once and identify the enclosed solid cell", () => {
  const { map, colony, step, checkpoint } = fixture();
  const x = 18,
    y = 9;
  map.rock.set(x, y, SOIL);
  const ring = Array.from({ length: 6 }, (_, d) => [nx(x, y, d), ny(y, d)]);
  colony.carrying[0] = 1;
  for (let k = 0; k <= 6; k++) step(ring[k % 6]);
  assert.equal(checkpoint().islandLoopWorkerSeconds, 0);
  for (let k = 7; k <= 13; k++) step(ring[k % 6]);
  const result = checkpoint();
  assert.equal(result.outsideLobbyWorkerSeconds, 14);
  assert.equal(result.islandLoopWorkerSeconds, 13);
  assert.equal(result.loadedLoopWorkerSeconds, 13);
  assert.equal(result.repeatedBacktrackWorkerSeconds, 0);
  assert.deepEqual(result.busiestIslands, [{ x, y, workerSeconds: 13 }]);
});

test("lobby, entrance, digging, and unloaded nursery time stay out of the stalled-motion count", () => {
  const { colony, step, checkpoint } = fixture();
  for (const location of [
    [3, 3],
    [10, 3],
    [13, 3],
  ])
    for (let k = 0; k < 8; k++) step(location);
  colony.digT[0] = 1;
  for (let k = 0; k < 8; k++) step([20, 10]);
  colony.digT[0] = 0;
  colony.pellet[0] = 1;
  for (let k = 0; k < 8; k++) step([20, 10]);
  assert.equal(checkpoint().stationaryWorkerSeconds, 3);
  assert.equal(checkpoint().loadedStationaryWorkerSeconds, 3);
  assert.equal(checkpoint().receptionWorkerSeconds, 8);
  assert.equal(checkpoint().entranceWorkerSeconds, 8);
  assert.equal(checkpoint().outsideLobbyWorkerSeconds, 24);
  for (let k = 0; k <= 4; k++) step([23 + (k % 2), 10]);
  assert.equal(checkpoint().repeatedBacktrackWorkerSeconds, 4);
});
