import { test } from "node:test";
import assert from "node:assert/strict";
import { avoid, climb, Colony, decode, DIG_FACE, diggable, encodeSituation, FOLLOW_GIVE_UP, GLANCE_X, handOnWall, localPolicy, narrow, NO_FACE, SITUATIONS, soilFace, squeezes, START_FACE, startable, trailLevel, tunnelEnd, turnToward, WALL_LOST, wallSide, type Situation } from "../colony.ts";
import { foodAt, generateWorld, mulberry32, OPEN, OPEN_WORLD, ROCK, rockAt, setRock, SOIL, worldFromArrays, type WorldMap } from "../world.ts";

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
  const map = generateWorld(1, OPEN_WORLD);
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

test("homing goes round a wall between the ant and its nest by touch (wall-following), where a straight line would push into it", () => {
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
});

/** The wall test's field: 60×30, the nest on the left, a wall from the top to y = 24 at x = 30. */
function walled(): { map: WorldMap; nest: { x: number; y: number; r: number } } {
  const size = { w: 60, h: 30 };
  const rock = new Uint8Array(size.w * size.h);
  for (let y = 0; y < 25; y++) rock[y * size.w + 30] = 1;
  const nest = { x: 8, y: 6, r: 2 };
  return { map: worldFromArrays(size, [nest], { rock }), nest };
}

test("a detour left over from foraging doesn't switch homing off: sent home, the ant goes round the wall", () => {
  const { map, nest } = walled();
  for (let seed = 1; seed <= 8; seed++) {
    const c = new Colony(map, { antCount: 1, maxAnts: 1, deposit: 0 }, mulberry32(seed), () => "return");
    c.x[0] = 31.5;
    c.y[0] = 6;
    c.heading[0] = Math.PI;
    c.mode[0] = 0; // exploring, just after a run of bumps against the wall
    c.detour[0] = 3;
    c.bumps[0] = 4;
    let home = false;
    for (let k = 0; k < 30 * 40 && !home; k++) {
      c.tick(1 / 30);
      home = Math.hypot((c.x[0] as number) - nest.x, (c.y[0] as number) - nest.y) < nest.r;
    }
    assert.ok(home, `seed ${seed}: home within 40 s, ending at (${(c.x[0] as number).toFixed(1)}, ${(c.y[0] as number).toFixed(1)})`);
  }
});

test("picking up food starts the trip home afresh: no detour or bumps carried over", () => {
  const c = new Colony(corridor(), { antCount: 1, maxAnts: 1, deposit: 0 }, mulberry32(3), () => "explore");
  c.x[0] = 14.5;
  c.y[0] = 6.5;
  c.detour[0] = 5;
  c.bumps[0] = 4;
  c.tick(1 / 30);
  assert.equal(c.carrying[0], 1);
  assert.equal(c.detour[0], 0);
  assert.equal(c.bumps[0], 0);
});

test("a wall-following ant that touches no rock lets go of the wall and walks home, instead of circling", () => {
  const { map, nest } = walled();
  const c = new Colony(map, { antCount: 1, maxAnts: 1, deposit: 0 }, mulberry32(4), () => "return");
  c.x[0] = 45; // open ground, right of the wall
  c.y[0] = 27;
  c.heading[0] = 0;
  c.mode[0] = 2;
  c.wall[0] = 1; // as if alarm had pushed it off the rock it was following
  c.mx[0] = 45; // its line home runs from (45, 5): far off it, so only losing the wall can free it
  c.my[0] = 5;
  c.hitDist[0] = 1000;
  const d0 = Math.hypot(45 - nest.x, 27 - nest.y);
  for (let k = 0; k < Math.ceil((WALL_LOST + 0.5) * 30); k++) c.tick(1 / 30);
  assert.equal(c.wall[0], 0, "let go of the wall");
  for (let k = 0; k < 3 * 30; k++) c.tick(1 / 30);
  assert.ok(Math.hypot((c.x[0] as number) - nest.x, (c.y[0] as number) - nest.y) < d0 - 5, "and walked toward home");
});

test("back on a wall it lost touch with, the give-up clock runs on: let-go and re-bump can't loop forever", () => {
  const { map } = walled();
  for (const lost of [false, true]) {
    const c = new Colony(map, { antCount: 1, maxAnts: 1, deposit: 0 }, mulberry32(2), () => "return");
    c.x[0] = 29.9;
    c.y[0] = 10;
    c.heading[0] = 0; // into the wall
    c.mode[0] = 2;
    c.mx[0] = 29.9;
    c.my[0] = 10;
    c.followT[0] = 100;
    c.untouched[0] = lost ? WALL_LOST + 0.1 : 0;
    c.tick(1 / 30);
    assert.equal(c.wall[0] !== 0, true, "took up the wall");
    assert.equal((c.followT[0] as number) >= 100, lost, lost ? "lost it: the clock ran on" : "a new wall: the clock restarts");
  }
});

test("giving up on a wall on a blocked step wanders: it doesn't start a new wall at once", () => {
  const { map } = walled();
  const c = new Colony(map, { antCount: 1, maxAnts: 1, deposit: 0 }, mulberry32(2), () => "return");
  c.x[0] = 29.9;
  c.y[0] = 10;
  c.heading[0] = 0; // into the wall
  c.mode[0] = 2;
  c.wall[0] = 1;
  c.followT[0] = FOLLOW_GIVE_UP - 0.001;
  c.hitDist[0] = 0;
  c.tick(1 / 30);
  assert.equal(c.wall[0], 0);
  assert.ok((c.detour[0] as number) > 0, "wandering");
});

test("decode is encode's inverse over every situation; lastQuestion is what the ant was asked", () => {
  for (let code = 0; code < SITUATIONS; code++) assert.equal(encodeSituation(decode(code)), code);
  const map = corridor(0);
  const asked: Situation[] = [];
  const c = new Colony(map, { antCount: 1, wander: 0, deposit: 0 }, mulberry32(3), (s) => {
    asked.push(s);
    return "follow";
  });
  assert.equal(c.lastQuestion(0), null, "not asked yet");
  c.tick(1 / 30);
  assert.deepEqual(c.lastQuestion(0), asked.at(-1), "the situation the policy saw");
  assert.equal(c.mode[0], 1, "and the answer it gave is the ant's mode");
});

test("ants can't slip diagonally between two rock cells into a pocket it can't get out of", () => {
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

test("homing climbs out of a cup whose floor faces the nest: follows the wall out of the mouth and round", () => {
  // A cup opening east (floor x = 30, y 5–25; arms y = 5 and y = 25, x 30–45); the nest is west of
  // it and the ant inside, so the home vector points straight into the floor.
  const size = { w: 70, h: 30 };
  const rock = new Uint8Array(size.w * size.h);
  for (let y = 5; y <= 25; y++) rock[y * size.w + 30] = 1;
  for (let x = 30; x <= 45; x++) for (const y of [5, 25]) rock[y * size.w + x] = 1;
  const nest = { x: 8, y: 15, r: 2 };
  const map = worldFromArrays(size, [nest], { rock });
  for (const seed of [1, 2, 3, 4, 5]) {
    const c = new Colony(map, { antCount: 1, maxAnts: 1, deposit: 0 }, mulberry32(seed), () => "return");
    c.x[0] = 40;
    c.y[0] = 15;
    c.heading[0] = Math.PI;
    c.mode[0] = 2;
    let home = false;
    for (let k = 0; k < 30 * 60 && !home; k++) {
      c.tick(1 / 30);
      home = Math.hypot((c.x[0] as number) - nest.x, (c.y[0] as number) - nest.y) < nest.r;
    }
    assert.ok(home, `seed ${seed}: out of the cup and home within 60 s, ending at (${(c.x[0] as number).toFixed(1)}, ${(c.y[0] as number).toFixed(1)})`);
  }
});

test("wallSide: turn toward the open side, so the wall stays on the other", () => {
  const coin = () => 0.9;
  assert.equal(wallSide(true, false, coin), -1, "left blocked: turn right, wall on the left");
  assert.equal(wallSide(false, true, coin), 1, "right blocked: turn left, wall on the right");
  assert.ok([-1, 1].includes(wallSide(false, false, coin)));
  assert.ok([-1, 1].includes(wallSide(true, true, () => 0.1)));
});

/** Solid soil (or rock, `end`) all round a one-cell tunnel along y = 6 from x = 2 to x = 20, the nest on its west end. */
function tunnel(end: typeof SOIL | typeof ROCK = SOIL): WorldMap {
  const size = { w: 30, h: 12 };
  const rock = new Uint8Array(size.w * size.h).fill(SOIL);
  for (let x = 2; x <= 20; x++) rock[6 * size.w + x] = OPEN;
  for (let y = 5; y <= 7; y++) for (let x = 2; x <= 4; x++) rock[y * size.w + x] = OPEN; // the nest's little chamber
  for (let y = 0; y < size.h; y++) for (let x = 21; x < size.w; x++) rock[y * size.w + x] = end;
  return worldFromArrays(size, [{ x: 3.5, y: 6.5, r: 1.5 }], { rock });
}

test("digging: an explorer walks the tunnel to its end, digs the soil there, carries the pellet home and drops it on the mound", () => {
  const map = tunnel();
  const c = new Colony(map, { antCount: 1, maxAnts: 1, deposit: 0 }, mulberry32(3), () => "explore");
  c.x[0] = 10.5;
  c.y[0] = 6.5;
  c.heading[0] = 0;
  let carried = false;
  for (let k = 0; k < 30 * 30 && c.soilOut === 0; k++) {
    c.tick(1 / 30);
    if (c.pellet[0]) carried = true;
  }
  assert.ok(carried, "it took a pellet");
  assert.equal(rockAt(map, 21, 6), OPEN, "the tunnel's end is dug one cell on");
  assert.ok(c.soilDug >= 1 && c.soilOut >= 1, `dug ${c.soilDug}, dropped ${c.soilOut}`);
  assert.equal(map.dug, c.soilDug, "the map counts the same cells");
  assert.equal(c.pellet[0], 0, "the pellet is down");
  c.tick(1 / 30);
  assert.equal(c.mode[0], 0, "and it explores again");
  for (let y = 0; y < 12; y++) for (let x = 5; x <= 20; x++) if (y !== 6) assert.equal(rockAt(map, x, y), SOIL, "the tunnel's walls are never dug: it only grows at its end");
});

test("digging: rock is never dug (a tunnel meeting it turns aside), and a carrier (of food or a pellet) never digs", () => {
  const map = tunnel(ROCK);
  const c = new Colony(map, { antCount: 1, maxAnts: 1, deposit: 0 }, mulberry32(4), () => "explore");
  c.x[0] = 18.5;
  c.y[0] = 6.5;
  c.heading[0] = 0;
  for (let k = 0; k < 30 * 30; k++) c.tick(1 / 30);
  for (let y = 0; y < 12; y++) for (let x = 21; x < 30; x++) assert.equal(rockAt(map, x, y), ROCK, `rock at (${x}, ${y}) stays`);
  assert.ok(c.soilDug > 0 && (rockAt(map, 20, 5) === OPEN || rockAt(map, 20, 7) === OPEN), "the tunnel forked aside at the rock");
  for (const load of ["carrying", "pellet"] as const) {
    const soil = tunnel();
    const d = new Colony(soil, { antCount: 1, maxAnts: 1, deposit: 0 }, mulberry32(5), () => "explore");
    d.x[0] = 20.3;
    d.y[0] = 6.5;
    d.heading[0] = 0;
    d[load][0] = 1;
    for (let k = 0; k < 30; k++) d.tick(1 / 30);
    assert.equal(d.soilDug, 0, `a ${load} ant at the face doesn't dig`);
    assert.equal(rockAt(soil, 21, 6), SOIL);
    assert.equal(d.mode[0], 2, "it goes home");
    assert.ok((d.x[0] as number) < 16, "back down the tunnel");
  }
});

test("a dying pellet carrier loses its pellet (no food appears); a dying food carrier drops its food", () => {
  const c = new Colony(tunnel(), { antCount: 2, maxAnts: 2 }, mulberry32(6));
  c.pellet[0] = 1;
  c.kill(0);
  assert.equal(c.pellet[0], 0);
  assert.equal(c.map.foodLeft, 0, "no food appears");
  c.x[1] = 10.5;
  c.y[1] = 6.5;
  c.carrying[1] = 1;
  c.kill(1);
  assert.equal(foodAt(c.map, 10, 6), 1, "the food lies where it died");
});

test("homing round soil starts with the wall at its hand: no circling a 2×2 of open ground (review of MR 7)", () => {
  // The review's case (seed 1, colony 0, t ≈ 122 s), cell for cell round the ant (A): heading ≈ 125°,
  // mostly south, its step clips the soil to its WEST. Facing was taken from the heading, so the wall
  // wasn't at its hand and it turned hand-ward every cell, round and round four cells for 60+ s.
  const pattern = ["sssssss", ".ss.sss", "ss.....", "sssA...", "ss.....", "ss.....", "sss...."];
  const size = { w: 40, h: 40 };
  const rock = new Uint8Array(size.w * size.h);
  for (let y = 0; y < size.h; y++)
    for (let x = 0; x < size.w; x++) {
      const px = x - 20;
      const py = y - 20;
      const inPattern = px >= 0 && px < 7 && py >= 0 && py < 7;
      const ch = inPattern ? pattern[py]![px]! : px < 0 && py >= 0 && py < 7 ? "s" : "."; // the soil runs on west; round it, open ground
      rock[y * size.w + x] = ch === "s" ? SOIL : OPEN;
    }
  const nest = { x: 2.5, y: 5.5, r: 1.5 }; // where the real nest was from A: 21 west, 18 north
  const map = worldFromArrays(size, [nest], { rock });
  for (let seed = 1; seed <= 6; seed++) {
    const c = new Colony(map, { antCount: 1, maxAnts: 1, deposit: 0 }, mulberry32(seed), () => "return");
    c.x[0] = 23.05;
    c.y[0] = 23.77;
    c.heading[0] = 2.18;
    c.mode[0] = 2;
    let home = false;
    for (let t = 0; t < 30 * 60 && !home; t++) {
      c.tick(1 / 30);
      home = Math.hypot((c.x[0] as number) - nest.x, (c.y[0] as number) - nest.y) < nest.r;
    }
    assert.ok(home, `seed ${seed}: round the soil and home within 60 s, ended at (${(c.x[0] as number).toFixed(1)}, ${(c.y[0] as number).toFixed(1)})`);
  }
});

test("a homing ant in a tunnel takes the branch with the home scent", () => {
  // A T: the ant comes down a tunnel from the north to a crossing tunnel; the nest's chamber is far east, scent laid only to the east.
  const size = { w: 40, h: 14 };
  const rock = new Uint8Array(size.w * size.h).fill(SOIL);
  for (let x = 2; x <= 36; x++) rock[8 * size.w + x] = OPEN;
  for (let y = 1; y < 8; y++) rock[y * size.w + 20] = OPEN;
  for (let y = 6; y <= 10; y++) for (let x = 34; x <= 38; x++) rock[y * size.w + x] = OPEN;
  const nest = { x: 36.5, y: 8.5, r: 1.5 };
  const map = worldFromArrays(size, [nest], { rock });
  const c = new Colony(map, { antCount: 1, maxAnts: 1, deposit: 0 }, mulberry32(8), () => "return");
  for (let x = 21; x <= 33; x++) c.ph.deposit("home", x + 0.5, 8.5, 3 + (x - 21));
  // Put it at the top of the north tunnel, heading south, with its home vector pointing west (it doesn't know better).
  c.x[0] = 20.5;
  c.y[0] = 2.5;
  c.heading[0] = Math.PI / 2;
  c.mode[0] = 2;
  let minX = 99;
  for (let t = 0; t < 30 * 4; t++) {
    c.tick(1 / 30);
    if ((c.y[0] as number) > 8) minX = Math.min(minX, c.x[0] as number);
  }
  assert.ok(minX > 19.9, `it never turned west at the junction (min x ${minX.toFixed(1)})`);
  assert.ok((c.x[0] as number) > 24, `it went east along the scent, at x ${(c.x[0] as number).toFixed(1)}`);
});

test("a wall-follower handed to a tunnel with home scent walks the tunnel, even with its nest straight through soil (review of #8)", () => {
  // The review's freeze (seed 1, rival ant #91): an E–W tunnel with home scent either side, the nest due
  // south through soil. Handed over, it turned to its home vector, bumped the soil, started a new wall
  // (give-up clock at 0) and was handed over again, every tick, for 300+ s.
  const size = { w: 40, h: 30 };
  const rock = new Uint8Array(size.w * size.h).fill(SOIL);
  for (let x = 5; x <= 35; x++) rock[10 * size.w + x] = OPEN;
  for (let y = 11; y <= 25; y++) rock[y * size.w + 35] = OPEN; // the way round to the nest
  for (let y = 24; y <= 27; y++) for (let x = 18; x <= 35; x++) rock[y * size.w + x] = OPEN;
  const nest = { x: 20.5, y: 25.5, r: 1.5 };
  const map = worldFromArrays(size, [nest], { rock });
  const c = new Colony(map, { antCount: 1, maxAnts: 1, deposit: 0 }, mulberry32(3), () => "return");
  for (let x = 5; x <= 35; x++) c.ph.deposit("home", x + 0.5, 10.5, 2 + x / 10);
  c.x[0] = 20.2; // near the cell's south edge, as in the review: a step south crosses into the soil
  c.y[0] = 10.88;
  c.heading[0] = Math.PI / 2;
  c.mode[0] = 2;
  c.wall[0] = -1;
  c.byCell[0] = 1;
  c.followT[0] = 1;
  c.hitDist[0] = 0; // not nearer than where it met the wall: no leaving by its line home
  c.mx[0] = 5.5;
  c.my[0] = 10.5;
  for (let t = 0; t < 30 * 2; t++) c.tick(1 / 30);
  assert.ok(Math.abs((c.x[0] as number) - 20.5) > 3, `it walks the tunnel, at (${(c.x[0] as number).toFixed(2)}, ${(c.y[0] as number).toFixed(2)})`);
});

test("a step that rounds (float32) onto a soil cell's edge is blocked: the ant never stands inside soil (review of #8)", () => {
  // Open ground above y = 10, soil below; the nest due south, so a homing ant heads straight at the soil.
  const size = { w: 12, h: 40 };
  const rock = new Uint8Array(size.w * size.h);
  for (let y = 10; y < 30; y++) for (let x = 0; x < size.w; x++) rock[y * size.w + x] = SOIL;
  const map = worldFromArrays(size, [{ x: 5.5, y: 34.5, r: 1.5 }], { rock });
  const c = new Colony(map, { antCount: 1, maxAnts: 1, deposit: 0, wander: 0 }, mulberry32(1), () => "return");
  const dy = 1 * c.params.speed * (1 / 30);
  // A float32 y whose step lands just short of 10 in float64, and on 10.0 once stored.
  let y = Math.fround(10 - dy);
  const f32 = new Float32Array(1);
  for (let k = 0; k < 64 && !(y + dy < 10 && Math.fround(y + dy) === 10); k++) {
    f32[0] = y;
    const u = new Uint32Array(f32.buffer);
    u[0] = (u[0] as number) + 1; // the next float32 up
    y = f32[0] as number;
  }
  assert.ok(y + dy < 10 && Math.fround(y + dy) === 10, "found the rounding case");
  c.x[0] = 5.5;
  c.y[0] = y;
  c.heading[0] = Math.PI / 2;
  c.mode[0] = 2;
  c.tick(1 / 30);
  assert.equal(rockAt(map, Math.floor(c.x[0] as number), Math.floor(c.y[0] as number)), OPEN, `at (${c.x[0]}, ${c.y[0]})`);
});

test("a homing ant led round a ring of tunnels by home scent gets out and home (review of #8)", () => {
  // A one-cell ring (x 20–26, y 14–20) with strong home scent all round, and a tunnel north from (23, 14)
  // to the nest's chamber with fainter scent: by scent alone the ant takes the ring at the junction for ever.
  const size = { w: 40, h: 26 };
  const rock = new Uint8Array(size.w * size.h).fill(SOIL);
  const open = (x: number, y: number) => (rock[y * size.w + x] = OPEN);
  for (let x = 20; x <= 26; x++) {
    open(x, 14);
    open(x, 20);
  }
  for (let y = 14; y <= 20; y++) {
    open(20, y);
    open(26, y);
  }
  for (let y = 5; y < 14; y++) open(23, y);
  for (let y = 2; y <= 4; y++) for (let x = 22; x <= 24; x++) open(x, y);
  const nest = { x: 23.5, y: 3.5, r: 1.5 };
  const map = worldFromArrays(size, [nest], { rock });
  for (let seed = 1; seed <= 3; seed++) {
    const c = new Colony(map, { antCount: 1, maxAnts: 1, deposit: 0 }, mulberry32(seed), () => "return");
    const lay = (x: number, y: number, v: number) => c.ph.deposit("home", x + 0.5, y + 0.5, v);
    for (let x = 20; x <= 26; x++) {
      lay(x, 14, 40);
      lay(x, 20, 40);
    }
    for (let y = 15; y < 20; y++) {
      lay(20, y, 40);
      lay(26, y, 40);
    }
    for (let y = 5; y < 14; y++) lay(23, y, 4);
    c.x[0] = 20.5;
    c.y[0] = 17.5;
    c.heading[0] = -Math.PI / 2; // north, up the ring's west side
    c.mode[0] = 2;
    let home = false;
    for (let t = 0; t < 30 * 90 && !home; t++) {
      c.tick(1 / 30);
      home = Math.hypot((c.x[0] as number) - nest.x, (c.y[0] as number) - nest.y) < nest.r;
    }
    assert.ok(home, `seed ${seed}: out of the ring and home within 90 s, at (${(c.x[0] as number).toFixed(1)}, ${(c.y[0] as number).toFixed(1)})`);
  }
});

test("tunnel shape rules: only a tunnel's end (or a wall with open ground behind) digs; new tunnels keep their distance; narrow cells are tunnels", () => {
  // Rows: soil, a tunnel from x = 0 to 4, soil; a chamber below from y = 4.
  const size = { w: 12, h: 8 };
  const rock = new Uint8Array(size.w * size.h).fill(SOIL);
  for (let x = 0; x <= 4; x++) rock[2 * size.w + x] = OPEN;
  for (let y = 4; y < 8; y++) for (let x = 0; x < 12; x++) rock[y * size.w + x] = OPEN;
  const m = worldFromArrays(size, [{ x: 1, y: 6, r: 1 }], { rock });
  assert.ok(tunnelEnd(m, 5, 2), "the cell past the tunnel's end");
  assert.ok(!tunnelEnd(m, 2, 1), "a tunnel's side wall");
  assert.ok(!tunnelEnd(m, 8, 3), "a chamber's flat wall");
  assert.ok(diggable(m, 2, 3, 1), "the wall between tunnel and chamber, open beyond: breaks through");
  assert.ok(startable(m, 9, 3, 3), "a new tunnel north out of the chamber, well away from the old one");
  assert.ok(!startable(m, 5, 3, 3), "too close beside the old tunnel's end");
  assert.ok(narrow(m, 2, 2) && narrow(m, 4, 2), "tunnel cells (the end too)");
  assert.ok(!narrow(m, 6, 5), "a chamber's cell");
  assert.equal(soilFace(m, 4.5, 2.5, 5.1, 2.5, 0), DIG_FACE, "meeting the tunnel's end head-on");
  assert.equal(soilFace(m, 4.5, 2.5, 5.05, 2.2, -0.8), GLANCE_X, "at a slant: slide");
  assert.equal(soilFace(m, 9.5, 4.5, 9.5, 3.9, -Math.PI / 2), START_FACE, "a chamber's wall head-on: maybe a new tunnel");
  assert.equal(soilFace(m, 9.5, 4.5, 9.5, 4.3, -Math.PI / 2), NO_FACE, "not leaving the cell");
});

test("handOnWall: toward the wall side first, then ahead, then away, then back", () => {
  const size = { w: 5, h: 5 };
  const rock = new Uint8Array(25).fill(ROCK);
  for (const [x, y] of [[2, 2], [3, 2], [2, 1], [1, 2]]) rock[y * 5 + x] = OPEN; // a T: east, north and west of (2, 2)
  const m = worldFromArrays(size, [{ x: 2.5, y: 2.5, r: 0.5 }], { rock });
  assert.equal(handOnWall(m, 2, 2, 0, 1), 0, "facing east, wall on the right (south is rock): ahead");
  assert.equal(handOnWall(m, 2, 2, 0, -1), 3, "facing east, left hand: turn north");
  assert.equal(handOnWall(m, 2, 2, 1, 1), 2, "facing south (rock): right hand turns west");
  rock.fill(ROCK);
  rock[2 * 5 + 2] = OPEN;
  rock[2 * 5 + 1] = OPEN;
  const end = worldFromArrays(size, [{ x: 1.5, y: 2.5, r: 0.5 }], { rock });
  assert.equal(handOnWall(end, 2, 2, 0, 1), 2, "a dead end: back");
});
