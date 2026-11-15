import { test } from "node:test";
import assert from "node:assert/strict";
import { CURTAIN } from "../../colony.ts";
import { Game } from "../../game.ts";
import { centreX, centreY } from "../../hex.ts";
import { responses } from "../../responses.ts";
import { mulberry32 } from "../../world.ts";
import { smallOne } from "../builders.ts";

// The crowd an ant waiting at home feels is a running average (CROWD_HALF), not the instant headcount: tick copies the
// gate's crowdKeep into the step record for arrive, and nothing else noticed when that copy was dropped (review of #154, S1).
// In one world the waiting is at the hold at the top of each shaft, where crowdKeep also runs (S2.3c: until then on a
// hand-made top-down field, where ants waited at the nest).

test("the crowd a waiting ant feels at the top of its shaft builds up over CROWD_HALF, not at once", () => {
  const g = new Game(smallOne(), { antCount: 20, rivalAnts: 1 }, mulberry32(16), {
    policy: () => "explore",
    responses: responses({ leave: () => "wait" }),
    colony: { scoutRate: 0, crowdAt: 6 },
  });
  const c = g.player;
  const col = c.layers[CURTAIN]!.entranceCol;
  const row = c.layers[CURTAIN]!.entranceRow + 1;
  for (let i = 0; i < 20; i++) {
    c.layer[i] = CURTAIN;
    c.under[i] = 1;
    c.x[i] = centreX(col, row);
    c.y[i] = centreY(row);
  }
  // The first tick's headcount is the grid from before they were set down; the second counts them (19 nestmates round each).
  g.tick(1 / 30);
  g.tick(1 / 30);
  assert.ok(c.gateHeld > 0, `held at the gate: ${c.gateHeld}`);
  const felt = Math.max(...Array.from(c.crowd.subarray(0, 20)));
  assert.ok(felt > 0 && felt < 1, `two ticks in, a held ant feels ${felt.toFixed(3)}, not the 19 round it`);
});
