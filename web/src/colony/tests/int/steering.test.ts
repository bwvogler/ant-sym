import { test } from "node:test";
import assert from "node:assert/strict";
import { Game, gameRng } from "../../game.ts";
import { localPolicy, localSteer } from "../../colony.ts";
import { generateOneWorld } from "../../oneWorld.ts";
import { PLANE } from "../../vocab.ts";
import {
  decodeSteering,
  encodeSteering,
  MODES,
  NEUTRAL_STEERING,
  STEER_NEUTRAL,
  STEER_WEIGHTS,
  type Mode,
  type Steering,
  type SteerWeight,
} from "../../vocab.ts";

// Steering weights' plumbing (staging, ja-ykmu.2; docs/steering.md): with every weight neutral the game steers as it did, bit for
// bit; each weight off neutral bends the steering of empty-jawed ants exploring or following on one world's plane.

test("a steering packs into one number and back; neutral is every weight at 0", () => {
  assert.equal(STEER_NEUTRAL, encodeSteering(NEUTRAL_STEERING));
  assert.deepEqual(decodeSteering(STEER_NEUTRAL), NEUTRAL_STEERING);
  const s: Steering = { search: 1, memory: -1, trail: 0, home: 1, vector: -1, nestmates: 0 };
  assert.deepEqual(decodeSteering(encodeSteering(s)), s);
  assert.deepEqual(localSteer({} as never), NEUTRAL_STEERING);
});

/** A small one world; `out` ants of the player set down on the plane round its hole, in `mode`, with a remembered spot 12 east. */
function world(steerLane: number, mode: Mode = "explore", siteFidelity = 0) {
  const g = new Game(generateOneWorld(7, { plane: { size: { w: 160, h: 100 } } }), { antCount: 40, rivalAnts: 10 }, gameRng(7), {
    colony: { steerLane, siteFidelity },
  });
  const c = g.player;
  const hole = g.world!.plane.nests[c.params.nest]!;
  for (let i = 0; i < 30; i++) {
    c.putAnt(i, PLANE, hole.x + 3 * Math.cos(i), hole.y + 3 * Math.sin(i));
    c.mode[i] = MODES.indexOf(mode);
    c.heading[i] = i;
    c.foodX[i] = 12;
    c.foodY[i] = 0;
  }
  return g;
}

const trace = (g: Game, seconds: number): string => {
  const c = g.player;
  for (let k = 0; k < seconds * 30; k++) g.tick(1 / 30);
  return Array.from({ length: c.n }, (_, i) => `${c.x[i]},${c.y[i]},${c.heading[i]}`).join(";");
};

test("steering on with every answer neutral steers exactly as steering off, and is asked only for explorers and followers", () => {
  const off = trace(world(0), 4);
  const g = world(1);
  const asked: Mode[] = [];
  g.player.bindPolicy("steer", (s) => (asked.push(s.mode), NEUTRAL_STEERING));
  assert.equal(trace(g, 4), off, "neutral weights: the same game, bit for bit");
  assert.ok(asked.length > 0, "the steer policy was asked");
  assert.ok(
    asked.every((m) => m === "explore" || m === "follow"),
    "only for ants it sends exploring or following",
  );
});

test("each weight off neutral bends the steering", () => {
  const bend = (w: SteerWeight, level: -1 | 1, mode: Mode = "explore", siteFidelity = 0) => {
    const g = world(1, mode, siteFidelity);
    // Every ant keeps the mode it was set down in, so the weight is what differs.
    g.player.bindPolicy("mode", (s) => (s.mode === "return" || s.mode === "fight" ? localPolicy(s) : s.mode));
    g.player.bindPolicy("steer", () => ({ ...NEUTRAL_STEERING, [w]: level }));
    for (let i = 0; i < 30; i++) g.player.steerCode[i] = encodeSteering({ ...NEUTRAL_STEERING, [w]: level });
    return trace(g, 4);
  };
  const base = (mode: Mode, siteFidelity = 0) => {
    const g = world(1, mode, siteFidelity);
    g.player.bindPolicy("mode", (s) => (s.mode === "return" || s.mode === "fight" ? localPolicy(s) : s.mode));
    return trace(g, 4);
  };
  const explore = base("explore");
  for (const w of STEER_WEIGHTS) {
    if (w === "trail") continue;
    assert.notEqual(bend(w, 1), explore, `${w} +1 changes how explorers steer`);
    // Memory −1 only drops what site fidelity would do with the last find: measured with it on.
    if (w === "memory")
      assert.notEqual(bend(w, -1, "explore", 1), base("explore", 1), "memory −1 changes how explorers steer (site fidelity on)");
    else assert.notEqual(bend(w, -1), explore, `${w} −1 changes how explorers steer`);
  }
  // The trail weight scales a follower's turn up the food trail: followers on the plane round the hole, where outgoing ants lay none,
  // so the food trail is laid by hand.
  const follow = (w: -1 | 0 | 1) => {
    const g = world(1, "follow");
    g.player.bindPolicy("mode", (s) => (s.mode === "return" || s.mode === "fight" ? localPolicy(s) : s.mode));
    const L = g.player.layers[PLANE]!;
    const hole = g.world!.plane.nests[g.player.params.nest]!;
    for (let dx = -8; dx <= 8; dx++) L.ph.deposit("food", hole.x + dx, hole.y + dx / 2, 3);
    if (w !== 0) g.player.bindPolicy("steer", () => ({ ...NEUTRAL_STEERING, trail: w }));
    for (let i = 0; i < 30; i++) g.player.steerCode[i] = encodeSteering({ ...NEUTRAL_STEERING, trail: w });
    return trace(g, 4);
  };
  assert.notEqual(follow(-1), follow(0), "trail −1 changes how followers steer");
  assert.notEqual(follow(1), follow(0), "trail +1 changes how followers steer");
});
