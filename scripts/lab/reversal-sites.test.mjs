import assert from "node:assert/strict";
import { test } from "node:test";
import { OPEN, SOIL, worldFromArrays } from "../../web/src/colony/world.ts";
import { observeReversalSites } from "./reversal-sites.mjs";

test("hotspots distinguish workers that recur together and faces leading to other open ground", () => {
  const map = worldFromArrays({ w: 20, h: 18 }, [{ x: 3, y: 3, r: 1 }]);
  for (let y = 5; y < 12; y++) for (let x = 6; x < 15; x++) map.rock.set(x, y, SOIL);
  for (const [x, y] of [
    [9, 8],
    [10, 8],
    [8, 7],
  ])
    map.rock.set(x, y, OPEN);
  const colony = { map, entrance: null, time: 0, params: { backfill: { hold: 100 } } };
  const observer = observeReversalSites(colony);
  observer.record(0, 10, 8, 9, 8, 1);
  colony.time = 10;
  observer.record(0, 10, 8, 9, 8, 2);
  colony.time = 31;
  observer.record(1, 10, 8, 9, 8, 1);
  colony.time = 35;
  observer.record(2, 10, 8, 9, 8, 1);
  const [site] = observer.checkpoint();
  assert.equal(site.events, 4);
  assert.equal(site.workerSlots, 3);
  assert.equal(site.peakSlotsIn20s, 2);
  assert.deepEqual(site.loads, { food: 3, spoilOrCorpse: 1 });
  assert.equal(site.faces.find((f) => f.x === 9 && f.y === 7)?.opens, "other-open-ground");
  assert.equal(site.faces.find((f) => f.x === 9 && f.y === 9)?.opens, "beside-return-edge");
  assert.equal(site.faces.find((f) => f.x === 11 && f.y === 8)?.opens, "pocket");

  map.filledAt.set(9, 7, 34);
  colony.time = 39;
  observer.record(3, 10, 8, 9, 8, 1);
  const [newSite] = observer.checkpoint();
  assert.equal(newSite.peakSlotsIn20s, 3);
  assert.equal(newSite.faces.find((f) => f.x === 9 && f.y === 7)?.events, 4, "recently filled face stays protected");
});
