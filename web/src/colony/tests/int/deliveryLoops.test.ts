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

function loopGame(seed = 1) {
  const g = new Game(smallOne(7), { antCount: 1, rival: false }, gameRng(seed), {
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
  return g;
}

function loop(seed = 1) {
  return loopGame(seed).player;
}

function steps(c: ReturnType<typeof loop>, count = 12) {
  const visited = new Set<string>();
  for (let k = 0; k < count; k++) {
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

test("carriers leave a three-cell cue cycle through its open exit across twenty seeds", () => {
  for (let seed = 1; seed <= 20; seed++) {
    const c = loop(seed);
    const visited = steps(c, 60);
    assert.ok(visited.has("-27,64"), `seed ${seed} never reached the open exit`);
    assert.equal(c.carrying[0], 1);
    assert.equal(c.deliveryRole[0], 1, "escape must retain the chosen role");
  }
});

test("weaker local exits remain possible and stronger cues remain preferred", () => {
  const c = loop();
  let weak = 0,
    strong = 0;
  // At A, the exit ahead is slightly weaker in raw scent but much less sharp.
  for (let k = 0; k < 100; k++) {
    put(c, 0, -27, 65);
    c.gx[0] = -27;
    c.gy[0] = 65;
    c.gdir[0] = 4;
    c.rng = () => (k + 0.5) / 100;
    walkTunnel(c, 0, RETURN, 0.01);
    if (c.gy[0] === 64) weak++;
    else strong++;
  }
  assert.ok(weak > 0 && strong > 0, "both locally marked exits must remain possible");
  c.ph.fields.royal.set(-26, 65, 1000);
  let sharper = 0;
  for (let k = 0; k < 100; k++) {
    put(c, 0, -27, 65);
    c.gx[0] = -27;
    c.gy[0] = 65;
    c.gdir[0] = 4;
    c.rng = () => (k + 0.5) / 100;
    walkTunnel(c, 0, RETURN, 0.01);
    if (c.gx[0] === -26) sharper++;
  }
  assert.ok(sharper > strong, "a stronger cue can overcome the turn preference");
});

test("retained movement targets and erased cues do not draw route randomness", () => {
  const c = loop();
  c.rng = () => {
    throw Error("unexpected route draw");
  };
  c.gx[0] = -26;
  c.gy[0] = 65;
  walkTunnel(c, 0, RETURN, 0.01);
  assert.equal(c.gx[0], -26, "finish the current step before choosing again");
  put(c, 0, -26, 65);
  c.gainMarks[0] = 0;
  walkTunnel(c, 0, RETURN, 0.01);
  assert.equal(c.deliveryState[0], 2, "erased cues fall back to local search");
});

test("sampled cue choices continue exactly after a JSON save", () => {
  const a = loopGame(12);
  steps(a.player, 3);
  const b = loopGame(99);
  b.load(JSON.parse(JSON.stringify(a.save())));
  a.player.bind(CURTAIN);
  b.player.bind(CURTAIN);
  assert.deepEqual(steps(a.player, 30), steps(b.player, 30));
  assert.deepEqual(a.save(), b.save());
});

test("a sharp marked bend remains usable when it is the only way forward", () => {
  const c = loop();
  setRock(c.map, -27, 64, ROCK);
  c.rng = () => 0.999;
  walkTunnel(c, 0, RETURN, 0.01);
  assert.equal(c.gx[0], -26);
  assert.equal(c.gy[0], 65);
});
