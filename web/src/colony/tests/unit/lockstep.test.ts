import { test } from "node:test";
import assert from "node:assert/strict";
import { Game } from "../../game.ts";
import { lockstepProbe } from "../../experiment.ts";
import { generateWorld, mulberry32 } from "../../world.ts";
import { pick } from "../../weighted.ts";
import type { Mode, Policy } from "../../vocab.ts";

// The lockstep probe (staging, ja-0kys): ants that answer a situation alike agree; ants that draw from even odds don't.

const run = (policy: Policy) => {
  const g = new Game(generateWorld(1, { size: { w: 120, h: 80 } }), { antCount: 40, rivalAnts: 10 }, mulberry32(3), {
    colony: { reroll: 1 },
  });
  g.player.bindPolicy("mode", policy);
  const probe = lockstepProbe(1);
  for (let k = 0; k < 12 * 30; k++) {
    g.tick(1 / 30);
    probe.tick(g, 1 / 30);
  }
  return probe.summary(g);
};

test("ants that all take one answer agree fully; ants that draw from even odds agree about half as much", () => {
  const same = run((_s, draw) => pick("explore", draw) as Mode);
  const drawn = run((_s, draw) => pick("explore=0.5,follow=0.5", draw) as Mode);
  assert.equal(same["you.lockAgree"], 1, "one answer: every ant in a situation does the same");
  assert.ok(drawn["you.lockAgree"]! < 0.8, `drawn: ${drawn["you.lockAgree"]}`);
  for (const m of [same, drawn]) {
    assert.ok(m["you.lockSwing"]! >= 0 && m["you.lockSwing"]! <= 1);
    assert.ok(Number.isFinite(m["you.switchesPerS"]));
  }
  assert.ok(drawn["you.switchesPerS"]! > same["you.switchesPerS"]!, "drawing again switches ants");
});
