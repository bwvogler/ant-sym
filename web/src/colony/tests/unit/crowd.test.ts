import { test } from "node:test";
import assert from "node:assert/strict";
import { Game } from "../../game.ts";
import { responses } from "../../responses.ts";
import { mulberry32, worldFromArrays, type WorldMap } from "../../world.ts";
import { nestAt, put } from "../hexmaps.ts";

// The crowd an ant waiting at home feels is a running average (CROWD_HALF), not the instant headcount: tick copies the
// gate's crowdKeep into the step record for arrive, and nothing else noticed when that copy was dropped (review of #154, S1).

function arena(): WorldMap {
  return worldFromArrays({ w: 40, h: 12 }, [nestAt(4, 6, 2), nestAt(36, 6, 2)]);
}

test("the crowd a waiting ant feels builds up over CROWD_HALF, not at once", () => {
  const g = new Game(arena(), { antCount: 20, rivalAnts: 1 }, mulberry32(16), {
    policy: () => "return",
    responses: responses({ leave: () => "wait" }),
    colony: { scoutRate: 0, crowdAt: 6 },
  });
  const c = g.player;
  for (let i = 0; i < 20; i++) put(c, i, 4, 6);
  g.tick(1 / 30);
  assert.ok(c.crowd[0]! > 0 && c.crowd[0]! < 1, `one tick in: ${c.crowd[0]!.toFixed(3)}`);
});
