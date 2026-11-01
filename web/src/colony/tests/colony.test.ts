import { test } from "node:test";
import assert from "node:assert/strict";
import { avoid, climb, Colony, decode, DIG_FACE, diggable, encodeSituation, GLANCE_X, handOnWall, localPolicy, narrow, NO_FACE, SITUATIONS, soilFace, squeezes, START_FACE, startable, trailLevel, tunnelEnd, turnToward, wallSide, type Situation } from "../colony.ts";
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

test("a dying pellet carrier loses its pellet; food dropped as before", () => {
  const c = new Colony(tunnel(), { antCount: 1, maxAnts: 1 }, mulberry32(6));
  c.pellet[0] = 1;
  c.kill(0);
  assert.equal(c.pellet[0], 0);
  assert.equal(c.map.foodLeft, 0, "no food appears");
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
