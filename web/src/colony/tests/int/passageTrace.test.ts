import assert from "node:assert/strict";
import { test } from "node:test";
import { backfill } from "../../dig.ts";
import { Game, gameRng } from "../../game.ts";
import { packResponseRequest, responseKey } from "../../colonyBrain.ts";
import { newPassageTrace, prunePassages, recentPassage, rememberPassage } from "../../passageTrace.ts";
import { touch } from "../../sense.ts";
import { OPEN, ROCK, SOIL, rockAt, setRock } from "../../world.ts";
import { smallOne } from "../builders.ts";
import { put } from "../hexmaps.ts";

function game(enabled = true) {
  return new Game(smallOne(7), {}, gameRng(7), [{ antCount: 12, ...(enabled ? { colony: { backfillTraceSeconds: 12 } } : {}) }]);
}

test("ordinary underground movement leaves a saveable opt-in trace that ages locally", () => {
  const off = game(false);
  const on = game();
  for (let i = 0; i < 120; i++) {
    off.tick(1 / 30);
    on.tick(1 / 30);
  }
  assert.ok(!Object.hasOwn(off.colonies[0]!, "passageTrace"));
  const c = on.colonies[0]!;
  assert.ok(c.passageTrace!.cells.size > 0);
  const restored = game();
  restored.load(JSON.parse(JSON.stringify(on.save())));
  assert.deepEqual(restored.colonies[0]!.passageTrace, c.passageTrace);
  for (let i = 0; i < 90; i++) {
    on.tick(1 / 30);
    restored.tick(1 / 30);
  }
  assert.deepEqual(restored.save(), on.save());

  const trace = newPassageTrace();
  rememberPassage(trace, 4, 6, 5);
  assert.ok(recentPassage(trace, 4, 6, 17, 12));
  assert.ok(!recentPassage(trace, 5, 6, 17, 12));
  assert.ok(!recentPassage(trace, 4, 6, 17.1, 12));
  prunePassages(trace, 18, 12);
  assert.equal(trace.cells.size, 0);
});

test("backfill uses the soil drop decision and keeps its cache and payload separate", () => {
  const c = game().colonies[0]!;
  const { map, passageTrace } = c;
  const x = c.entranceCol + 19;
  const y = c.entranceRow + 7;
  for (let row = y - 2; row <= y + 2; row++) {
    for (let col = x - 2; col <= x + 2; col++) setRock(map, col, row, ROCK);
  }
  setRock(map, x, y, OPEN);
  setRock(map, x + 1, y, OPEN);
  put(c, 0, x, y);
  c.pellet[0] = 1;
  c.time = 30;
  c.ph.fields.home.set(x, y, 1);
  rememberPassage(passageTrace!, x + 1, y, 25);
  assert.equal(backfill(c, 0, x, y), false);
  assert.equal(passageTrace!.recentKept, 1);
  assert.equal(rockAt(map, x + 1, y), OPEN);

  const base = { ...touch(c, 0, false, undefined, "soil") };
  const recent = { ...base, backfillTraffic: "recent" as const };
  const quiet = { ...recent, backfillTraffic: "quiet" as const };
  assert.notEqual(responseKey("drop", recent), responseKey("drop", quiet));
  assert.notEqual(responseKey("drop", recent), responseKey("drop", base));
  assert.equal(responseKey("carry", recent), responseKey("carry", base));
  const request = packResponseRequest("drop", [{ id: "s0", situation: recent }], "Keep busy passages open");
  assert.doesNotMatch(JSON.stringify(packResponseRequest("carry", [{ id: "s0", situation: recent }], "")), /backfillTraffic/);
  assert.match(JSON.stringify(request), /"backfillTraffic":"recent"/);

  c.gainMarks[0] = 0;
  assert.equal(backfill(c, 0, x, y), true, "loss of the perceived mark allows the local drop");
  assert.equal(rockAt(map, x + 1, y), SOIL);
  assert.equal(passageTrace!.cells.size, 0);
});

test("floor repair uses the ordinary drop question even when the cell has a fresh trace", () => {
  const c = game().colonies[0]!;
  c.params.backfillFloorRepair = true;
  const { map, passageTrace } = c;
  const cx = c.entranceCol + 19;
  const cy = c.entranceRow + 7;
  const tx = cx + 1;
  for (let row = cy - 2; row <= cy + 2; row++) {
    for (let col = cx - 2; col <= cx + 3; col++) setRock(map, col, row, ROCK);
  }
  const floorRoomX = tx + (cy & 1) - 1;
  setRock(map, cx, cy, OPEN);
  setRock(map, tx, cy, OPEN);
  setRock(map, floorRoomX, cy - 1, OPEN);
  const room = map.chambers!.add(c.params.nest, cy - 1, "brood");
  map.chambers!.claim(room.id, floorRoomX, cy - 1, (x, y) => rockAt(map, x, y) === OPEN);
  put(c, 0, cx, cy);
  c.pellet[0] = 1;
  c.time = 30;
  c.ph.fields.home.set(cx, cy, 1);
  rememberPassage(passageTrace!, tx, cy, 25);
  assert.equal(backfill(c, 0, cx, cy), true);
  assert.equal(rockAt(map, tx, cy), SOIL);
  assert.equal(passageTrace!.recentFilled, 1);
});
