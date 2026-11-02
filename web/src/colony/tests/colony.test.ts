import { test } from "node:test";
import { CountGrid } from "../battle.ts";
import assert from "node:assert/strict";
import { avoid, chooseDig, climb, Colony, decode, DIG_FACE, digChance, setTunnelDrift, diggable, encodeSituation, GLANCE, FOLLOW_GIVE_UP, handOnWall, localPolicy, narrow, NO_FACE, SITUATIONS, soilFace, START_FACE, startable, trailLevel, tunnelEnd, turnToward, WALL_LOST, wallSide, type Situation } from "../colony.ts";
import { foodIn, generateWorld, tunnelHeading, mulberry32, OPEN, OPEN_WORLD, ROCK, rockAt, setRock, SOIL, worldFromArrays, type WorldMap } from "../world.ts";
import { at, hexMap, nestAt, put } from "./hexmaps.ts";
import { centreY, nx, ny } from "../hex.ts";

/** A bare 40×12 field: the nest on the left (cell (6, 6)), one food cell straight east of it along row 6 (cell (14, 6)). */
function corridor(food = 3): WorldMap {
  const size = { w: 40, h: 12 };
  const f = new Float32Array(size.w * size.h);
  f[6 * size.w + 14] = food;
  return worldFromArrays(size, [nestAt(6, 6, 2)], { food: f });
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
  put(c, 0, 10, 6);
  c.heading[0] = 0; // east, toward the food 4 cells away
  let picked = false;
  for (let k = 0; k < 30 * 20 && c.stored === 0; k++) {
    c.tick(1 / 30);
    if (c.carrying[0]) picked = true;
  }
  assert.ok(picked, "it picked the food up");
  assert.equal(c.stored, 1, "and brought it home");
  assert.equal(foodIn(map, 14, 6), 2, "one unit left the cell");
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
  put(c, 0, 10, 6);
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
  const p = at(20, 6);
  c.paint("alarm", p.x, p.y, 2, 5);
  assert.equal(c.ph.read("alarm", p.x, p.y), 5);
  assert.equal(c.ph.read("alarm", at(22, 6).x, at(22, 6).y), 0, "the rock cell got nothing");
  assert.equal(c.ph.read("alarm", at(20, 9).x, at(20, 9).y), 0, "outside the radius");
  // An ant walking east, the alarm patch ahead and a little to its left: it veers right (south, +y).
  put(c, 0, 16, 7);
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
  put(c, 0, 14, 6);
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
  put(c, 0, 45, 22); // open ground, right of the wall (and clear of the map edge, which counts as a wall)
  c.heading[0] = 0;
  c.mode[0] = 2;
  c.wall[0] = 1; // as if alarm had pushed it off the rock it was following
  const line = at(45, 5); // its line home runs from here: far off it, so only losing the wall can free it
  c.mx[0] = line.x;
  c.my[0] = line.y;
  c.hitDist[0] = 1000;
  const d0 = Math.hypot((c.x[0] as number) - nest.x, (c.y[0] as number) - nest.y);
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
    c.y[0] = centreY(10);
    c.heading[0] = 0; // into the wall
    c.mode[0] = 2;
    c.mx[0] = 29.9;
    c.my[0] = centreY(10);
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
  c.y[0] = centreY(10);
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

// (MR 7 had a test here that ants can't slip diagonally between two rock cells. Hexagons have no
// such corners: every neighbour shares an edge, see hex.test.ts.)

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
  return worldFromArrays(size, [nestAt(3, 6, 1.5)], { rock });
}

test("digging: an explorer walks the tunnel to its end, digs the soil there, carries the pellet home and drops it on the mound", () => {
  const map = tunnel();
  const c = new Colony(map, { antCount: 1, maxAnts: 1, deposit: 0 }, mulberry32(3), () => "explore");
  put(c, 0, 10, 6);
  c.heading[0] = 0;
  let carried = false;
  for (let k = 0; k < 30 * 30 && c.soilOut === 0; k++) {
    c.tick(1 / 30);
    if (c.pellet[0]) carried = true;
  }
  assert.ok(carried, "it took a pellet");
  // Row 6 is even: the end (20, 6)'s neighbours on, east, north-east and south-east, are (21, 6), (20, 5) and (20, 7).
  assert.ok([[21, 6], [20, 5], [20, 7]].some(([x, y]) => rockAt(map, x!, y!) === OPEN), "the tunnel's end is dug one cell on");
  assert.ok(c.soilDug >= 1 && c.soilOut >= 1, `dug ${c.soilDug}, dropped ${c.soilOut}`);
  assert.equal(map.dug, c.soilDug, "the map counts the same cells");
  assert.equal(c.pellet[0], 0, "the pellet is down");
  c.tick(1 / 30);
  assert.equal(c.mode[0], 0, "and it explores again");
  for (let y = 0; y < 12; y++) for (let x = 5; x <= 19; x++) if (y !== 6) assert.equal(rockAt(map, x, y), SOIL, "the tunnel's walls are never dug: it only grows at its end");
});

test("digging: rock is never dug (a tunnel meeting it turns aside), and a carrier (of food or a pellet) never digs", () => {
  const map = tunnel(ROCK);
  const c = new Colony(map, { antCount: 1, maxAnts: 1, deposit: 0 }, mulberry32(4), () => "explore");
  put(c, 0, 18, 6);
  c.heading[0] = 0;
  for (let k = 0; k < 30 * 30; k++) c.tick(1 / 30);
  for (let y = 0; y < 12; y++) for (let x = 21; x < 30; x++) assert.equal(rockAt(map, x, y), ROCK, `rock at (${x}, ${y}) stays`);
  assert.ok(c.soilDug > 0 && (rockAt(map, 20, 5) === OPEN || rockAt(map, 20, 7) === OPEN), "the tunnel forked aside at the rock");
  for (const load of ["carrying", "pellet"] as const) {
    const soil = tunnel();
    const d = new Colony(soil, { antCount: 1, maxAnts: 1, deposit: 0 }, mulberry32(5), () => "explore");
    put(d, 0, 20, 6);
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
  put(c, 1, 10, 6);
  c.carrying[1] = 1;
  c.kill(1);
  assert.equal(foodIn(c.map, 10, 6), 1, "the food lies where it died");
});

test("homing round soil starts with the wall at its hand and never circles open cells (review of MR 7, on hexes)", () => {
  // Open ground east of a long soil block; the nest is beyond it to the south-west. Ants start against
  // the block's east face at slants (the review's case: mostly south, the step clipping the soil to
  // the west). Facing taken from the heading, or turning hand-ward in open ground, circles a few cells.
  const size = { w: 44, h: 40 };
  const rock = new Uint8Array(size.w * size.h);
  for (let y = 4; y < 30; y++) for (let x = 12; x < 22; x++) rock[y * size.w + x] = SOIL;
  const nest = nestAt(4, 36, 2);
  const map = worldFromArrays(size, [nest], { rock });
  for (let seed = 1; seed <= 8; seed++) {
    const c = new Colony(map, { antCount: 1, maxAnts: 1, deposit: 0 }, mulberry32(seed), () => "return");
    put(c, 0, 22, 8 + seed);
    c.x[0] = (c.x[0] as number) - 0.4; // against the face
    c.heading[0] = seed % 2 ? 2.18 : -2.4;
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
  const nest = nestAt(36, 8, 1.5);
  const map = worldFromArrays(size, [nest], { rock });
  const c = new Colony(map, { antCount: 1, maxAnts: 1, deposit: 0 }, mulberry32(8), () => "return");
  for (let x = 21; x <= 33; x++) c.ph.deposit("home", at(x, 8).x, at(x, 8).y, 3 + (x - 21));
  // Put it at the top of the north tunnel (column 20, zigzagging down the offset rows), heading
  // south, with its home vector pointing west (it doesn't know better).
  put(c, 0, 20, 2);
  c.heading[0] = Math.PI / 2;
  c.mode[0] = 2;
  const junction = at(20, 8);
  let minX = 99;
  for (let t = 0; t < 30 * 4; t++) {
    c.tick(1 / 30);
    if ((c.y[0] as number) > junction.y - 0.2) minX = Math.min(minX, c.x[0] as number);
  }
  assert.ok(minX > junction.x - 0.6, `it never turned west at the junction (min x ${minX.toFixed(1)})`);
  assert.ok((c.x[0] as number) > junction.x + 3, `it went east along the scent, at x ${(c.x[0] as number).toFixed(1)}`);
});

test("a wall-follower handed to a tunnel with home scent walks the tunnel, even with its nest straight through soil (review of #8)", () => {
  // The review's freeze (seed 1, rival ant #91), on hexes: an E–W tunnel with home scent either side, the nest
  // due south through soil. Handed over, it turned to its home vector, bumped the soil, started a new wall
  // (give-up clock at 0) and was handed over again, every tick, for 300+ s.
  const size = { w: 40, h: 30 };
  const rock = new Uint8Array(size.w * size.h).fill(SOIL);
  for (let x = 5; x <= 35; x++) rock[10 * size.w + x] = OPEN;
  for (let y = 11; y <= 25; y++) rock[y * size.w + 35] = OPEN; // the way round to the nest
  for (let y = 24; y <= 27; y++) for (let x = 18; x <= 35; x++) rock[y * size.w + x] = OPEN;
  const map = worldFromArrays(size, [nestAt(20, 25, 1.5)], { rock });
  const c = new Colony(map, { antCount: 1, maxAnts: 1, deposit: 0 }, mulberry32(3), () => "return");
  for (let x = 5; x <= 35; x++) c.ph.depositCell("home", x, 10, 2 + x / 10);
  put(c, 0, 20, 10);
  c.y[0] = (c.y[0] as number) + 0.38; // near the cell's south edge, as in the review: a step south meets the soil
  c.heading[0] = Math.PI / 2;
  c.mode[0] = 2;
  c.wall[0] = -1;
  c.byCell[0] = 1;
  c.followT[0] = 1;
  c.hitDist[0] = 0; // not nearer than where it met the wall: no leaving by its line home
  const start = at(5, 10);
  c.mx[0] = start.x;
  c.my[0] = start.y;
  const x0 = c.x[0] as number;
  for (let t = 0; t < 30 * 2; t++) c.tick(1 / 30);
  assert.ok(Math.abs((c.x[0] as number) - x0) > 3, `it walks the tunnel, at (${(c.x[0] as number).toFixed(2)}, ${(c.y[0] as number).toFixed(2)})`);
});

test("a homing ant led round a ring of tunnels by home scent gets out and home (review of #8)", () => {
  // A one-cell ring (x 20–26, rows 14–20) with strong home scent all round, and a tunnel north from (23, 14)
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
  const nest = nestAt(23, 3, 1.5);
  const map = worldFromArrays(size, [nest], { rock });
  for (let seed = 1; seed <= 3; seed++) {
    const c = new Colony(map, { antCount: 1, maxAnts: 1, deposit: 0 }, mulberry32(seed), () => "return");
    for (let x = 20; x <= 26; x++) {
      c.ph.depositCell("home", x, 14, 40);
      c.ph.depositCell("home", x, 20, 40);
    }
    for (let y = 15; y < 20; y++) {
      c.ph.depositCell("home", 20, y, 40);
      c.ph.depositCell("home", 26, y, 40);
    }
    for (let y = 5; y < 14; y++) c.ph.depositCell("home", 23, y, 4);
    put(c, 0, 20, 17);
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

test("tunnel shape rules on hexes: only a tunnel's end (or a wall with open ground beyond) digs; new tunnels keep their distance; narrow cells are tunnels", () => {
  // A tunnel along row 2 from x = 0 to 4 through soil; a chamber below from row 4.
  const m = hexMap([
    "ssssssssssss",
    "ssssssssssss",
    ".....sssssss",
    "ssssssssssss",
    "............",
    "............",
    "N...........",
    "............",
  ]);
  assert.ok(tunnelEnd(m, 5, 2), "the cell past the tunnel's end: one open neighbour");
  assert.ok(!tunnelEnd(m, 2, 1), "a tunnel's side wall: two open neighbours (row 1 is odd: (2, 2) and (3, 2))");
  assert.ok(!tunnelEnd(m, 8, 3), "a chamber's flat wall");
  assert.ok(diggable(m, 2, 3, 1), "the wall between tunnel and chamber, entered south-east, open beyond: breaks through");
  assert.ok(startable(m, 9, 3, 5), "a new tunnel north-east out of the chamber, well away from the old one");
  assert.ok(!startable(m, 5, 3, 5), "too close beside the old tunnel's end");
  assert.ok(narrow(m, 2, 2) && narrow(m, 4, 2), "tunnel cells (the end too)");
  assert.ok(!narrow(m, 6, 5), "a chamber's cell");
  const a = at(4, 2);
  assert.equal(soilFace(m, a.x, a.y, a.x + 0.6, a.y, 0), DIG_FACE, "meeting the tunnel's end head-on (east)");
  const ne = at(4, 1); // row 2 is even: (4, 2)'s north-east neighbour
  assert.equal(soilFace(m, a.x, a.y, (a.x + ne.x) / 2 + 0.05, (a.y + ne.y) / 2 - 0.05, 0), GLANCE, "heading east but crossing north-east: a slant, slide");
  const c = at(9, 4);
  assert.equal(soilFace(m, c.x, c.y, c.x + 0.3, c.y - 0.55, -Math.PI / 3), START_FACE, "a chamber's wall head-on: maybe a new tunnel");
  assert.equal(soilFace(m, c.x, c.y, c.x + 0.1, c.y - 0.1, -Math.PI / 3), NO_FACE, "not leaving the cell");
});

test("handOnWall on hexes: round from the hand side to the other, back last; straight on when there's no wall at hand", () => {
  // Cell (2, 2), an even row: neighbours E (3, 2), SE (2, 3), SW (1, 3), W (1, 2), NW (1, 1), NE (2, 1).
  const field = (open: [number, number][]) => {
    const rock = new Uint8Array(25).fill(ROCK);
    for (const [x, y] of [[2, 2], ...open]) rock[y! * 5 + x!] = OPEN;
    return worldFromArrays({ w: 5, h: 5 }, [nestAt(2, 2, 0.5)], { rock });
  };
  const corridor = field([[1, 2], [3, 2]]);
  assert.equal(handOnWall(corridor, 2, 2, 0, 1), 0, "a straight tunnel, east: on");
  const t = field([[1, 2], [3, 2], [2, 1]]);
  assert.equal(handOnWall(t, 2, 2, 0, -1), 5, "a branch north-east, left hand: takes it");
  assert.equal(handOnWall(t, 2, 2, 0, 1), 0, "right hand: straight on");
  const end = field([[1, 2]]);
  assert.equal(handOnWall(end, 2, 2, 0, 1), 3, "a dead end: back");
  const open = worldFromArrays({ w: 5, h: 5 }, [nestAt(2, 2, 0.5)]);
  assert.equal(handOnWall(open, 2, 2, 0, 1), 0, "open ground, no wall at hand: straight on (never circling)");
  // Facing west with the left hand on soil (south-west), the way on west open and the sharp turn back
  // south-east open too: on, not the sharp turn (three open cells meeting at a corner spun carriers round, MR 9).
  const corner = field([[1, 2], [3, 2], [2, 3]]);
  assert.equal(handOnWall(corner, 2, 2, 3, -1), 3, "straight on past a corner, not round it");
  const hairpin = field([[3, 2], [2, 3]]);
  assert.equal(handOnWall(hairpin, 2, 2, 3, -1), 1, "the sharp turn when it is the only way but back");
  // Review of #9: a speck at the front hand only (E of the cell, facing NE, right hand), the back hand open.
  // Turning 120° hand-ward there put the speck on the other hand and the follower walked off; it passes it instead.
  const speck = new Uint8Array(25);
  speck[2 * 5 + 3] = SOIL;
  const sm = worldFromArrays({ w: 5, h: 5 }, [nestAt(0, 0, 0.3)], { rock: speck });
  assert.equal(handOnWall(sm, 2, 2, 5, 1), 5, "a speck at the front hand: straight on past it, keeping it on that hand");
});

test("chooseDig dithers between the two ways either side of a heading, in proportion, so a tunnel runs at the heading on average", () => {
  // Solid soil round one open cell (a tunnel's end): every neighbour diggable.
  const rock = new Uint8Array(15 * 15).fill(SOIL);
  rock[7 * 15 + 7] = OPEN;
  const m = worldFromArrays({ w: 15, h: 15 }, [nestAt(7, 7, 0.5)], { rock });
  const aim = Math.PI / 12; // 15°: a quarter of the way from east (0) to south-east (1)
  let se = 0;
  const n = 400;
  for (let k = 0; k < n; k++) {
    const d = chooseDig(m, 7, 7, aim, (k + 0.5) / n);
    assert.ok(d === 0 || d === 1, `only the two ways either side (${d})`);
    if (d === 1) se++;
  }
  assert.ok(Math.abs(se / n - 0.25) < 0.01, `south-east a quarter of the time: ${se / n}`);
  assert.equal(chooseDig(m, 7, 7, 0, 0.99), 0, "on a way exactly: that way");
  // −30° + a hair: just under halfway from north-east (5, at −60°) back to east (0): east about half the time.
  assert.equal(chooseDig(m, 7, 7, -Math.PI / 6 + 1e-6, 0.01), 0, "u low: the far way, east");
  assert.equal(chooseDig(m, 7, 7, -Math.PI / 6 + 1e-6, 0.99), 5, "u high: north-east");
});

test("meander: tunnels from one start wander off in many directions, yet stay one cell wide (and run straight with no drift)", () => {
  /** Dig with one explorer from a small chamber in a soil field for a while; return the dug cells. */
  const dig = (seed: number) => {
    const rock = new Uint8Array(120 * 80).fill(SOIL);
    for (let y = 38; y <= 42; y++) for (let x = 58; x <= 62; x++) rock[y * 120 + x] = OPEN;
    const m = worldFromArrays({ w: 120, h: 80 }, [nestAt(60, 40, 1.5)], { rock });
    const c = new Colony(m, { antCount: 3, maxAnts: 3, deposit: 0, patience: 1e9 }, mulberry32(seed), () => "explore");
    for (let k = 0; k < 30 * 150; k++) c.tick(1 / 30);
    const cells: [number, number][] = [];
    for (let y = 0; y < 80; y++) for (let x = 0; x < 120; x++) if (!Number.isNaN(tunnelHeading(m, x, y))) cells.push([x, y]);
    return { m, cells };
  };
  const angles: number[] = [];
  let narrowCells = 0;
  let total = 0;
  let junctions = 0;
  for (let seed = 1; seed <= 8; seed++) {
    const { m, cells } = dig(seed);
    assert.ok(cells.length > 15, `seed ${seed}: dug ${cells.length} cells`);
    for (const [x, y] of cells) {
      total++;
      if (narrow(m, x, y)) narrowCells++;
      let openNb = 0;
      for (let d = 0; d < 6; d++) if (rockAt(m, nx(x, y, d), ny(y, d)) === OPEN) openNb++;
      if (narrow(m, x, y) && openNb >= 3) junctions++;
    }
    // Every dug cell's heading is the run of its tunnel: their spread over a seed's tunnels.
    for (const [x, y] of cells) angles.push(tunnelHeading(m, x, y));
  }
  // Forks are Ys (two arms 60° either side), so tunnels branch: the review of #9 counted 2 junctions in 8 seeds
  // when a fork was one arm 60° off and the cell straight on could no longer be dug (now ~27; #8 had 21).
  assert.ok(junctions >= 12, `tunnels branch: ${junctions} junctions`);
  assert.ok(narrowCells / total > 0.7, `tunnels stay one cell wide: ${((100 * narrowCells) / total).toFixed(0)} % of dug cells narrow (forks and break-ins aren't)`);
  // Headings well between the six ways (more than 20° off every one): a tunnel's run drifts and keeps
  // drifting, cell after cell, so runs spread round the circle (a third of them would be, spread evenly).
  // Fresh noise on a grid way each cell (σ 11°) would put only ~8 % there: the review of MR 8 caught
  // exactly that (the heading was dropped before the dig).
  const between = angles.filter((a) => Math.abs(((a / (Math.PI / 3)) % 1 + 1) % 1 - 0.5) < 0.5 - 20 / 60).length;
  assert.ok(between / angles.length > 0.2, `${((100 * between) / angles.length).toFixed(0)} % of tunnel runs are well between the six ways`);

  setTunnelDrift(0);
  try {
    const { cells, m } = dig(3);
    const off = cells.map(([x, y]) => {
      const a = tunnelHeading(m, x, y) / (Math.PI / 3);
      return Math.abs(a - Math.round(a)) * 60;
    });
    // Headings are kept in 252 steps (a multiple of 6), so forks land exactly and runs stay on the six ways.
    assert.ok(cells.length > 15 && off.every((o) => o < 2), `no drift: every run is one of the six ways (worst ${Math.max(...off).toFixed(1)}°)`);
  } finally {
    setTunnelDrift(0.2);
  }
});

test("digChance: a lone ant digs now and then; each nestmate within two cells adds to it, up to always", () => {
  const g = new CountGrid();
  g.add(10, 10); // the ant itself
  assert.ok(Math.abs(digChance(g, 10, 10) - 0.1) < 1e-9, "alone: 0.1");
  g.add(11, 10, 3); // three nestmates next to it
  assert.ok(Math.abs(digChance(g, 10, 10) - 0.6) < 1e-9, "three near: 0.1 + 3/6");
  g.add(10, 12, 9); // two rows down: still within two steps
  assert.equal(digChance(g, 10, 10), 1);
  const far = new CountGrid();
  far.add(10, 10);
  far.add(14, 10, 20); // four cells away: not counted
  assert.ok(Math.abs(digChance(far, 10, 10) - 0.1) < 1e-9);
});

test("homing across a dug-out cavern dotted with specks (soil, rock, or both): every carrier gets across, leaving each speck where the way home is open", () => {
  // A cavern 46 × 30 inside soil, with two-cell specks left in a scatter (as digging leaves them round a
  // nest), the nest at its west end; carriers start at the east end. Specks of rock as well as soil (review
  // of #10: a rock speck was followed by touch, out of reach of every cell-by-cell release, for up to 120 s).
  for (const [a, b] of [[SOIL, SOIL], [ROCK, SOIL], [ROCK, ROCK]]) {
  const size = { w: 50, h: 34 };
  const rock = new Uint8Array(size.w * size.h).fill(SOIL);
  for (let y = 2; y < 32; y++) for (let x = 2; x < 48; x++) rock[y * size.w + x] = OPEN;
  for (let y = 4; y < 30; y += 3) for (let x = 8 + (y % 2) * 2; x < 44; x += 4) {
    rock[y * size.w + x] = a as number;
    rock[y * size.w + x + 1] = b as number;
  }
  const nest = nestAt(4, 17, 1.5);
  const map = worldFromArrays(size, [nest], { rock });
  let late = 0;
  for (let seed = 1; seed <= 10; seed++) {
    const c = new Colony(map, { antCount: 1, maxAnts: 1, deposit: 0 }, mulberry32(seed), () => "return");
    put(c, 0, 45, 4 + ((seed * 7) % 26));
    c.heading[0] = Math.PI;
    c.mode[0] = 2;
    c.pellet[0] = 1;
    let t = 0;
    for (; t < 30 * 40; t++) {
      c.tick(1 / 30);
      if (c.pellet[0] === 0) break;
    }
    if (t >= 30 * 15) late++; // 41 world units at 7 a second is under 6 s in a straight line
  }
  // On MR 8's code 7 of these 10 circled one speck for the whole 40 s (the line home was anchored at the
  // trip's first wall, and a hand on the wall drifts from speck to speck farther from home).
  assert.equal(late, 0, `specks ${a}+${b}: ${late} of 10 carriers took over 15 s to cross the cavern`);
  }
});

test("homing out of a closed cavern whose way out is far round the wall: no leave-and-bump livelock (review of MR 9)", () => {
  // A 20 × 12 cavern in soil under the surface, the nest above its left part, the way out at its
  // bottom-right corner (down, right, then up a long tunnel). Releasing from a wall wherever the way
  // home is open, with no memory of progress, had carriers leave a side wall, walk into the ceiling
  // and start again for ever (12 of 12 stuck for 300 s).
  const CW = 20;
  const CH = 12;
  const w = CW + 16;
  const h = CH + 18;
  const g: string[][] = Array.from({ length: h }, () => Array(w).fill("s"));
  for (let y = 0; y < 3; y++) for (let x = 0; x < w; x++) g[y]![x] = ".";
  const x0 = 4;
  const y0 = 8;
  for (let y = y0; y < y0 + CH; y++) for (let x = x0; x < x0 + CW; x++) g[y]![x] = ".";
  const ex = x0 + CW - 1;
  const by = y0 + CH;
  for (let y = by; y < by + 3; y++) g[y]![ex] = ".";
  for (let x = ex; x <= w - 4; x++) g[by + 2]![x] = ".";
  for (let y = 2; y <= by + 2; y++) g[y]![w - 4] = ".";
  g[1]![x0 + 4] = "N";
  const map = hexMap(g.map((r) => r.join("")), { r: 1.2 });
  for (let seed = 1; seed <= 8; seed++) {
    const c = new Colony(map, { antCount: 1, maxAnts: 1, deposit: 0 }, mulberry32(seed), () => "return");
    put(c, 0, x0 + 2 + (seed % (CW - 4)), y0 + 2 + ((seed * 5) % (CH - 4)));
    c.heading[0] = -Math.PI / 2;
    c.mode[0] = 2;
    c.pellet[0] = 1;
    let t = 0;
    for (; t < 30 * 90 && c.pellet[0] === 1; t++) c.tick(1 / 30);
    assert.equal(c.pellet[0], 0, `seed ${seed}: out of the cavern and home within 90 s`);
  }
});
