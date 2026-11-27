import assert from "node:assert/strict";
import { test } from "node:test";
import { createBacktrackEscape } from "../../web/src/colony/backtrackEscape.ts";
import { OPEN, SOIL, worldFromArrays } from "../../web/src/colony/world.ts";

function fixture(openExit = true, steer = true, onNoExit) {
  const map = worldFromArrays({ w: 20, h: 18 }, [{ x: 3, y: 3, r: 1 }]);
  for (let y = 5; y < 12; y++) for (let x = 6; x < 15; x++) map.rock.set(x, y, SOIL);
  for (const [x, y] of [
    [9, 8],
    [10, 8],
    ...(openExit
      ? [
          [11, 8],
          [10, 7],
        ]
      : []),
  ])
    map.rock.set(x, y, OPEN);
  const colony = { map, onPlane: false, cur: 0, home: 0, time: 0, age: [2], carrying: [1], pellet: [0], broodHeld: [0] };
  const escape = createBacktrackEscape(colony, steer, onNoExit);
  function across(from, to) {
    colony.time += 0.25;
    escape.moved(0, from, 8, to, 8);
  }
  return { colony, escape, across };
}

test("only repeated reversals trigger an alternate direction ranked by local cue", () => {
  const { escape, across } = fixture();
  across(9, 10);
  across(10, 9);
  assert.equal(
    escape.choose(0, 9, 8, 0, () => 1),
    0,
  );
  across(9, 10);
  assert.equal(
    escape.choose(0, 10, 8, 0, () => 1),
    0,
    "a planned exit already leaves the loop",
  );
  assert.equal(
    escape.choose(0, 10, 8, 3, (_x, y) => (y === 7 ? 5 : 1)),
    5,
  );
  assert.equal(
    escape.choose(0, 10, 8, 3, () => 1),
    3,
    "the escape is a single attempt",
  );
  assert.deepEqual(escape.checkpoint(), { tries: 1, noExit: 0, withExit: 1 });
});

test("a single-exit tunnel and expired or unloaded histories use ordinary movement", () => {
  for (const scenario of ["no exit", "expired", "unloaded"]) {
    const { colony, escape, across } = fixture(scenario !== "no exit");
    across(9, 10);
    across(10, 9);
    across(9, 10);
    if (scenario === "expired") colony.time += 3;
    if (scenario === "unloaded") colony.carrying[0] = 0;
    assert.equal(
      escape.choose(0, 10, 8, 3, () => 1),
      3,
    );
    assert.deepEqual(escape.checkpoint(), { tries: 0, noExit: Number(scenario === "no exit"), withExit: 0 });
  }
});

test("the diagnostic observes an exact cell without steering the baseline", () => {
  const seen = [];
  const open = fixture(true, false);
  const closed = fixture(false, false, (...event) => seen.push(event));
  for (const { escape, across } of [open, closed]) {
    across(9, 10);
    across(10, 9);
    across(9, 10);
    assert.equal(
      escape.choose(0, 10, 8, 3, () => 1),
      3,
    );
  }
  assert.deepEqual(open.escape.checkpoint(), { tries: 0, noExit: 0, withExit: 1 });
  assert.deepEqual(seen, [[0, 10, 8, 9, 8, 1]]);
});
