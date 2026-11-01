import { test } from "node:test";
import assert from "node:assert/strict";
import { avoid, climb, Colony, localPolicy, SITUATIONS, squeezes, trailLevel, turnToward, type Situation } from "../colony.ts";
import { foodAt, generateWorld, mulberry32, setRock, worldFromArrays, type WorldMap } from "../world.ts";

/** A bare 40×12 field: the nest on the left, one food cell straight east of it. */
function corridor(food = 3): WorldMap {
  const size = { w: 40, h: 12 };
  const f = new Float32Array(size.w * size.h);
  f[6 * size.w + 14] = food;
  const nest = { x: 6, y: 6.5, r: 2 };
  return worldFromArrays(size, [nest], { food: f });
}

const sit = (s: Partial<Situation>): Situation => ({ mode: "explore", tired: false, foodTrail: "none", homeTrail: "none", alarm: "none", enemy: "none", stance: "forage", ...s });

test("localPolicy: tired goes home; a strong food trail is followed; none means explore; faint keeps the mode", () => {
  assert.equal(localPolicy(sit({ tired: true, foodTrail: "strong" })), "return");
  assert.equal(localPolicy(sit({ foodTrail: "strong" })), "follow");
  assert.equal(localPolicy(sit({ mode: "follow", foodTrail: "none" })), "explore");
  assert.equal(localPolicy(sit({ mode: "follow", foodTrail: "faint" })), "follow");
  assert.equal(localPolicy(sit({ mode: "explore", foodTrail: "faint" })), "explore");
  assert.equal(localPolicy(sit({ mode: "return", foodTrail: "faint" })), "follow", "just dropped its food: back out along the trail");
});

test("trailLevel, climb, avoid, turnToward", () => {
  assert.equal(avoid(0, 0.01, 0, 0.3), 0, "no alarm smelled: no turn");
  assert.equal(avoid(5, 2, 1, 0.3), 0.3, "alarm on the left: turn right");
  assert.equal(avoid(1, 2, 5, 0.3), -0.3, "alarm on the right: turn left");
  assert.equal(avoid(3, 0, 3, 0.3), 0, "clear ahead: hold course");
  assert.deepEqual([0, 0.05, 0.99, 1, 30].map(trailLevel), ["none", "faint", "faint", "strong", "strong"]);
  assert.equal(climb(1, 2, 1, 0.3), 0, "the front is best: hold course");
  assert.equal(climb(3, 2, 1, 0.3), -0.3);
  assert.equal(climb(1, 2, 3, 0.3), 0.3);
  assert.ok(Math.abs(turnToward(0, 1, 0.25) - 0.25) < 1e-9);
  assert.ok(Math.abs(turnToward(3, -3, 1) - (3 + (2 * Math.PI - 6))) < 1e-9, "the short way round, across ±π");
});

test("an ant walks to food it can see, picks it up, carries it home and puts it down", () => {
  const map = corridor(3);
  const c = new Colony(map, { antCount: 1, wander: 0 }, mulberry32(1));
  c.x[0] = 10;
  c.y[0] = 6.5;
  c.heading[0] = 0; // east, toward the food 4 cells away
  let picked = false;
  for (let k = 0; k < 30 * 20 && c.stored === 0; k++) {
    c.tick(1 / 30);
    if (c.carrying[0]) picked = true;
  }
  assert.ok(picked, "it picked the food up");
  assert.equal(c.stored, 1, "and brought it home");
  assert.equal(foodAt(map, 14, 6), 2, "one unit left the cell");
  assert.equal(map.foodLeft, 2, "the map's running count agrees");
  assert.equal(c.carrying[0], 0);
});

test("the policy is asked only when an ant's situation changes, and its answer is used", () => {
  const map = corridor(0);
  const asked: Situation[] = [];
  const c = new Colony(map, { antCount: 1, wander: 0, deposit: 0 }, mulberry32(2), (s) => {
    asked.push(s);
    return "follow";
  });
  c.x[0] = 20;
  c.y[0] = 6.5;
  c.heading[0] = Math.PI / 2;
  for (let k = 0; k < 30; k++) c.tick(1 / 30);
  assert.equal(asked.length, 1, "nothing changed after the first ask: no second one");
  assert.equal(c.mode[0], 1, "follow");
  assert.equal(c.decisions, 1);
  assert.equal(c.situationsSeen, 1);
  assert.equal(SITUATIONS, 1296);
});

test("a policy answering nonsense falls back to the plain rule instead of breaking the ant", () => {
  const c = new Colony(corridor(0), { antCount: 3 }, mulberry32(3), () => "dance" as never);
  c.tick(1 / 30);
  assert.deepEqual([...c.mode].filter((_, i) => c.alive[i]), [0, 0, 0], "explore");
});

test("the colony forages on the local rule alone: food comes home within a minute", () => {
  const map = generateWorld(1);
  const c = new Colony(map, { antCount: 600 }, mulberry32(101));
  const before = c.foodLeft;
  for (let k = 0; k < 30 * 60; k++) c.tick(1 / 30);
  assert.ok(c.stored > 200, `stored ${c.stored}`);
  assert.equal(Math.round(before - c.foodLeft), c.stored + c.carrying.reduce((a, v) => a + v, 0), "food is neither made nor lost");
  assert.ok(c.ph.total("food") > 0 && c.ph.total("home") > 0, "both trails were laid");
  assert.ok(c.situationsSeen <= SITUATIONS);
});

test("a carrying ant is never asked: it goes home, and is asked afresh once it puts the food down", () => {
  const map = corridor(3);
  const asked: Situation[] = [];
  const c = new Colony(map, { antCount: 1, wander: 0 }, mulberry32(4), (s) => {
    asked.push(s);
    return "explore";
  });
  c.x[0] = 10;
  c.y[0] = 6.5;
  c.heading[0] = 0;
  let askedWhileCarrying = 0;
  for (let k = 0; k < 30 * 20 && c.stored === 0; k++) {
    const before = asked.length;
    const carrying = c.carrying[0] === 1;
    c.tick(1 / 30);
    if (carrying && c.carrying[0] === 1 && asked.length > before) askedWhileCarrying++;
  }
  assert.equal(c.stored, 1);
  assert.equal(askedWhileCarrying, 0);
  const n = asked.length;
  c.tick(1 / 30);
  assert.ok(asked.length > n, "put down: asked again");
});

test("reconsider makes every ant ask again on its next tick", () => {
  let calls = 0;
  const c = new Colony(corridor(0), { antCount: 5, deposit: 0, wander: 0 }, mulberry32(5), () => {
    calls++;
    return "explore";
  });
  c.tick(1 / 30);
  const first = calls;
  c.tick(1 / 30);
  assert.equal(calls, first, "nothing changed: nobody asked");
  c.reconsider();
  c.tick(1 / 30);
  assert.equal(calls, first + 5);
});

test("paint lays trail in a disc, never on rock; alarm turns ants away", () => {
  const map = corridor(0);
  setRock(map, 22, 6, 1);
  const c = new Colony(map, { antCount: 1, wander: 0, deposit: 0 }, mulberry32(6), () => "explore");
  c.paint("alarm", 20.5, 6.5, 2, 5);
  assert.equal(c.ph.read("alarm", 20.5, 6.5), 5);
  assert.equal(c.ph.read("alarm", 22.5, 6.5), 0, "the rock cell got nothing");
  assert.equal(c.ph.read("alarm", 20.5, 9.5), 0, "outside the radius");
  // An ant walking east, the alarm patch ahead and a little to its left: it veers right (south, +y).
  c.x[0] = 16;
  c.y[0] = 7.5;
  c.heading[0] = 0;
  for (let k = 0; k < 10; k++) c.tick(1 / 30);
  assert.ok((c.heading[0] as number) > 0.2, `turned away: heading ${c.heading[0]}`);
});

test("homing goes round a wall between the ant and its nest (the walking-distance map), where a straight line would push into it", () => {
  // A 60×30 field, the nest on the left, a wall from the top to y = 24 at x = 30, the ant on the right.
  const size = { w: 60, h: 30 };
  const rock = new Uint8Array(size.w * size.h);
  for (let y = 0; y < 25; y++) rock[y * size.w + 30] = 1;
  const nest = { x: 8, y: 6, r: 2 };
  const map = worldFromArrays(size, [nest], { rock });
  const c = new Colony(map, { antCount: 1, maxAnts: 1, deposit: 0 }, mulberry32(5), () => "return");
  c.x[0] = 50;
  c.y[0] = 6;
  c.heading[0] = Math.PI; // facing the wall and the nest beyond it
  c.mode[0] = 2;
  let home = false;
  for (let k = 0; k < 30 * 30 && !home; k++) {
    c.tick(1 / 30);
    home = Math.hypot((c.x[0] as number) - nest.x, (c.y[0] as number) - nest.y) < nest.r;
  }
  assert.ok(home, `the ant got home round the wall, ending at (${(c.x[0] as number).toFixed(1)}, ${(c.y[0] as number).toFixed(1)})`);
  assert.equal(c.homeDist.get(8, 6), 0);
  assert.ok(c.homeDist.get(50, 6) > 50, "the walking distance from behind the wall goes round it");
});

test("ants can't slip diagonally between two rock cells into a pocket the walking map can't reach", () => {
  // A 4×4 room (x 20–23, y 3–6) walled all round; it touches the outside only at the diagonal
  // corner between room cell (23, 6) and outside cell (24, 7).
  const size = { w: 40, h: 12 };
  const rock = new Uint8Array(size.w * size.h);
  for (let x = 19; x <= 24; x++) for (const y of [2, 7]) rock[y * size.w + x] = 1;
  for (let y = 2; y <= 7; y++) for (const x of [19, 24]) rock[y * size.w + x] = 1;
  rock[7 * size.w + 24] = 0;
  const map = worldFromArrays(size, [{ x: 5, y: 8, r: 2 }], { rock });
  assert.ok(squeezes(map, 24.2, 7.2, 23.9, 6.9), "the corner crossing itself is blocked");
  assert.ok(!squeezes(map, 30.2, 8.2, 29.9, 7.9), "an open diagonal is not");
  // Ants walking straight at the corner from many angles never get in.
  for (let k = 0; k < 40; k++) {
    const c = new Colony(map, { antCount: 1, maxAnts: 1, deposit: 0, wander: 0 }, mulberry32(k), () => "explore");
    const a = Math.PI * 1.25 + (k / 40 - 0.5) * 0.6; // north-west, give or take
    c.x[0] = 24.5 - Math.cos(a) * 1.2;
    c.y[0] = 7.5 - Math.sin(a) * 1.2;
    c.heading[0] = a;
    for (let t = 0; t < 30; t++) {
      c.tick(1 / 30);
      const x = Math.floor(c.x[0] as number);
      const y = Math.floor(c.y[0] as number);
      assert.ok(!(x >= 20 && x <= 23 && y >= 3 && y <= 6), `ant ${k} got into the room at (${x}, ${y})`);
    }
  }
});
