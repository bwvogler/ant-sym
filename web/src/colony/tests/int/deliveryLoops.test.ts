// Reduced from seed 1's generated-nest royal5 trace (ja-g7nz.3.3.2).
// Static cues and centre-to-centre steps isolate route scoring from locomotion.
import { test } from "node:test";
import assert from "node:assert/strict";
import { Game, gameRng } from "../../game.ts";
import { CURTAIN } from "../../colony.ts";
import { ageDelivery, chooseDelivery, deliveryAttempt } from "../../deliveryAction.ts";
import { walkTunnel } from "../../tunnel.ts";
import { OPEN, ROCK, setRock } from "../../world.ts";
import { RETURN } from "../../vocab.ts";
import { responses } from "../../responses.ts";
import { stanceStep } from "../../stance.ts";
import { AntStep } from "../../step.ts";
import { smallOne } from "../builders.ts";
import { put } from "../hexmaps.ts";

function loop() {
  const g = new Game(smallOne(7), { antCount: 1, rival: false }, gameRng(1), {
    colony: { deliveryLane: 1, deliveryReconsider: 1 },
  });
  const c = g.player;
  c.bind(CURTAIN);
  c.layer[0] = CURTAIN;
  c.under[0] = 1;
  c.goalKind[0] = 0;
  c.carrying[0] = 1;
  c.mode[0] = RETURN;
  for (let y = 62; y <= 68; y++) for (let x = -30; x <= -23; x++) setRock(c.map, x, y, ROCK);
  // A -> B -> C -> A. An open exit from A has a weaker cue than B.
  for (const [x, y, cue] of [
    [-27, 65, 16],
    [-26, 65, 11],
    [-26, 66, 10],
    [-27, 64, 10.6],
  ]) {
    setRock(c.map, x, y, OPEN);
    c.ph.fields.royal.set(x, y, cue);
  }
  put(c, 0, -27, 65);
  chooseDelivery(c, 0, "to royal");
  c.gx[0] = -27;
  c.gy[0] = 65;
  c.gdir[0] = 4;
  c.foodTo = () => {
    throw Error("unseen chamber target");
  };
  return c;
}

function steps(c: ReturnType<typeof loop>) {
  const visited = new Set<string>();
  for (let k = 0; k < 12; k++) {
    ageDelivery(c, 0, 0.5);
    walkTunnel(c, 0, RETURN, 0.01);
    visited.add(`${c.gx[0]},${c.gy[0]}`);
    put(c, 0, c.gx[0], c.gy[0]);
  }
  return visited;
}

test("positive cues in a loop do not suppress effort or the policy's release", () => {
  const c = loop();
  steps(c);
  assert.equal(deliveryAttempt(c, 0), "long");
  assert.equal(c.carrying[0], 1);
  const x = c.gx[0],
    y = c.gy[0];
  const before = c.map.food.get(x, y);
  c.responses = responses({ carry: (t) => (t.deliveryAttempt === "long" ? "put down" : "take") });
  const s = new AntStep();
  s.p = c.params;
  s.dt = 1 / 30;
  s.rng = () => 0.5;
  stanceStep(c, 0, s);
  assert.equal(c.carrying[0], 0);
  assert.equal(c.deliveryRole[0], 0);
  assert.equal(c.map.food.get(x, y), before + 1, "release preserves food on the ground");
  assert.equal(c.stored, 0, "release is not a successful delivery");
});

test(
  "a carrier can leave a three-cell cue cycle through its open exit",
  {
    todo: "ja-g7nz.3.3.2: local delivery still cycles; do not promote until recovery is designed and measured",
  },
  () => {
    const visited = steps(loop());
    assert.ok(visited.has("-27,64"), `never reached the open exit; visited ${[...visited].join("; ")}`);
  },
);
