import { test } from "node:test";
import assert from "node:assert/strict";
import { PickupDwell } from "./pickup-dwell.mjs";
test("duplicate offers do not inflate elapsed ticks; adjacent cells count movement", () => {
  const p = new PickupDwell();
  p.observe("a", 0, "0:1,1", 0, 0, false);
  p.observe("a", 0, "0:1,1", 0, 0, false);
  p.endTick(0);
  p.observe("a", 1, "0:2,1", 1, 0, false);
  p.endTick(1);
  p.endTick(2, () => "off-food");
  const s = p.finish();
  assert.equal(s.episodes, 1);
  assert.equal(s.longest[0].offers, 3);
  assert.equal(s.longest[0].ticks, 2);
  assert.equal(s.longest[0].uniqueCells, 2);
  assert.equal(s.longest[0].path, 1);
  assert.equal(s.sameCellSeconds.max, 1 / 30);
  assert.deepEqual(s.ends, { "off-food": 1 });
});
test("within-cell motion is distinct from crossing a cell; run end is censored", () => {
  const p = new PickupDwell();
  for (let t = 0; t < 30; t++) {
    p.observe("a", t, "0:1,1", t / 100, 0, false);
    p.endTick(t);
  }
  const s = p.finish();
  assert.equal(s.observedSeconds.max, 1);
  assert.equal(s.sameCellSeconds.max, 1);
  assert.equal(s.multiCellEpisodes, 0);
  assert.ok(s.longest[0].path > 0);
  assert.equal(s.completedSeconds.n, 0);
  assert.deepEqual(s.ends, { "observation-end": 1 });
});
test("a no-offer tick splits an episode; a reused slot is a new ant", () => {
  const p = new PickupDwell();
  p.observe("c:0:1", 0, "a", 0, 0, false);
  p.endTick(0);
  p.endTick(1);
  p.observe("c:0:1", 2, "a", 0, 0, false);
  p.endTick(2);
  p.endTick(3, () => "dead-or-replaced");
  p.observe("c:0:2", 4, "a", 0, 0, true);
  p.endTick(4);
  const s = p.finish();
  assert.equal(s.ants, 2);
  assert.equal(s.episodes, 3);
  assert.equal(s.observedSeconds.max, 1 / 30);
});
test("a layer transition is not counted as physical movement", () => {
  const p = new PickupDwell();
  p.observe("a", 0, "0:1,1", 0, 0, false);
  p.endTick(0);
  p.observe("a", 1, "1:1,1", 100, 100, false);
  p.endTick(1);
  const s = p.finish();
  assert.equal(s.episodes, 2);
  assert.equal(s.movingEpisodes, 0);
  assert.deepEqual(s.ends, { "layer-change": 1, "observation-end": 1 });
});
