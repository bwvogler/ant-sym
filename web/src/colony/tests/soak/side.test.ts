import { test } from "node:test";
import assert from "node:assert/strict";
import { Colony, HOLE_SIGHT } from "../../colony.ts";
import { Game } from "../../game.ts";
import { CELL, cellOf, centreX, centreY, hexDistance, NE, NW, nx, ny } from "../../hex.ts";
import {
  AIR,
  digCell,
  fillCell,
  flat,
  generateSideWorld,
  groundRow,
  groundTop,
  isSky,
  mulberry32,
  OPEN,
  reachable,
  rockAt,
  SIDE_WORLD,
  SOIL,
  type WorldMap,
} from "../../world.ts";
import { walkway } from "../builders.ts";

// The side view (MR 13): a cross-section with sky, a walkway along the ground line, nests dug below it.

const SMALL = { size: { w: 256, h: 160 }, nestGap: 120, surface: 40 };

/** Whether the walkway (open sky cells) joins the map's west edge to its east edge, walking only on it. */
function walkwayEdgeToEdge(map: WorldMap): boolean {
  const seen = new Uint8Array(map.size.w * map.size.h);
  const todo: [number, number][] = [[0, walkway(map, 0)]];
  seen[todo[0]![1] * map.size.w] = 1;
  while (todo.length) {
    const [x, y] = todo.pop()!;
    if (x === map.size.w - 1) return true;
    for (let d = 0; d < 6; d++) {
      const ax = nx(x, y, d);
      const ay = ny(y, d);
      const k = ay * map.size.w + ax;
      if (!isSky(map, ax, ay) || rockAt(map, ax, ay) !== OPEN || seen[k]) continue;
      seen[k] = 1;
      todo.push([ax, ay]);
    }
  }
  return false;
}

test("the side world: sky above a ground line, a walkway along it from edge to edge, soil and stones below", () => {
  for (const seed of [1, 2, 3]) {
    const map = generateSideWorld(seed, SMALL);
    assert.ok(map.sky, "a side-view map");
    let air = 0;
    let soil = 0;
    for (let x = 0; x < map.size.w; x++) {
      const y = walkway(map, x);
      assert.ok(y >= 0, `seed ${seed}: column ${x} has a walkway cell`);
      for (let yy = 0; yy < y; yy++) assert.equal(rockAt(map, x, yy), AIR, "only sky above the walkway");
      for (let yy = 0; yy < map.size.h; yy++) {
        const t = rockAt(map, x, yy);
        if (t === AIR) air++;
        if (t === SOIL) soil++;
      }
    }
    assert.ok(air > 0 && soil > air, `seed ${seed}: mostly ground (${soil} soil, ${air} sky)`);
    // The walkway is one path: from its west end, walking only on walkway cells reaches its east end.
    assert.ok(walkwayEdgeToEdge(map), `seed ${seed}: the walkway runs edge to edge`);
  }
});

test("at full size too, the walkway runs edge to edge without stepping into a hole (seeds 1–30; review of #15)", () => {
  // Digging the shaft's top cell took the footing from the walkway cell above the hole's rim where the ground stepped
  // down beside it: that cell fell to sky, and the walkway ran on only through the hole, which explorers never step onto
  // (30 of 100 seeds at full size; this test ran at small size on seeds 1–3, where it never happened).
  const broken: number[] = [];
  for (let seed = 1; seed <= 30; seed++) if (!walkwayEdgeToEdge(generateSideWorld(seed))) broken.push(seed);
  assert.deepEqual(broken, [], `seeds whose walkway breaks: ${broken.join(", ")}`);
});

test("each nest: its entrance an open hole in the ground line with the walkway beside it, a shaft down to its chamber, and food on the ground and below it, none in the air", () => {
  for (const seed of [1, 2, 3, 4, 6, 7]) {
    const map = seed <= 3 ? generateSideWorld(seed, SMALL) : generateSideWorld(seed); // 4, 6, 7 at full size: entrances once generated in the air
    assert.equal(map.nests.length, 2);
    for (const n of map.nests) {
      assert.ok(n.entrance, "an entrance");
      cellOf(n.entrance!.x, n.entrance!.y);
      const ex = CELL[0];
      const ey = CELL[1];
      assert.ok(!isSky(map, ex, ey) && rockAt(map, ex, ey) === OPEN, `seed ${seed}: the hole is open ground`);
      let beside = false;
      for (let d = 0; d < 6; d++) beside ||= isSky(map, nx(ex, ey, d), ny(ey, d)) && rockAt(map, nx(ex, ey, d), ny(ey, d)) === OPEN;
      assert.ok(beside, `seed ${seed}: the walkway beside it`);
      assert.ok(n.y > n.entrance!.y + 8, "the chamber is well below the ground line");
      const walk = reachable(map, n.x, n.y, "open");
      cellOf(n.entrance.x, n.entrance.y);
      assert.equal(walk[CELL[1] * map.size.w + CELL[0]], 1, "the chamber is joined to its entrance on foot");
    }
    // Food: the generator drops food it can't reach by digging from the player's chamber, so "all food reachable, walking or
    // digging" (as this test said) couldn't fail. What it doesn't ensure, checked here with a walk of the test's own:
    // every pile on the ground can be walked to from the chamber (up the shaft, along the walkway), and every pocket below
    // lies open, at least 4 rows under the ground line (a pocket's centre is 10 down, and its cells within 4 of that).
    const walk = new Uint8Array(map.size.w * map.size.h);
    cellOf(map.nest.x, map.nest.y);
    const todo: [number, number][] = [[CELL[0], CELL[1]]];
    walk[CELL[1] * map.size.w + CELL[0]] = 1;
    while (todo.length) {
      const [x, y] = todo.pop()!;
      for (let d = 0; d < 6; d++) {
        const ax = nx(x, y, d);
        const ay = ny(y, d);
        if (rockAt(map, ax, ay) !== OPEN || walk[ay * map.size.w + ax]) continue;
        walk[ay * map.size.w + ax] = 1;
        todo.push([ax, ay]);
      }
    }
    let onGround = 0;
    let below = 0;
    for (let y = 0; y < map.size.h; y++)
      for (let x = 0; x < map.size.w; x++) {
        if (!map.food.get(x, y)) continue;
        assert.notEqual(rockAt(map, x, y), AIR, "no food in the air");
        if (isSky(map, x, y)) {
          onGround++;
          assert.equal(walk[y * map.size.w + x], 1, `seed ${seed}: the pile at ${x},${y} can be walked to from the chamber`);
        } else {
          below++;
          assert.equal(rockAt(map, x, y), OPEN, "a pocket is open ground");
          assert.ok(y >= groundTop(map, x) + 4, `seed ${seed}: a pocket cell at ${x},${y} lies 4 rows or more under the ground line`);
        }
      }
    assert.ok(onGround > 0 && below > 0, `seed ${seed}: food on the ground (${onGround} cells) and below it (${below})`);
  }
});

test("the walkway follows the ground: dig the soil from under a walkway cell and, with no ground left beside it, it is sky", () => {
  const map = generateSideWorld(4, SMALL);
  // A flat stretch away from the nests: find a column whose walkway sits on soil.
  let x = 10;
  while (walkway(map, x) < 0 || Math.abs(walkway(map, x) - walkway(map, x + 1)) > 0 || Math.abs(walkway(map, x) - walkway(map, x - 1)) > 0)
    x++;
  const y = walkway(map, x);
  // Dig every ground neighbour of (x, y): it loses its footing.
  for (let d = 0; d < 6; d++) {
    const ax = nx(x, y, d);
    const ay = ny(y, d);
    if (rockAt(map, ax, ay) === SOIL) digCell(map, ax, ay);
  }
  assert.equal(rockAt(map, x, y), AIR, "no ground beside it: sky");
});

test("scent never sits in the air: deposits on sky cells come to nothing", () => {
  const map = generateSideWorld(1, SMALL);
  const c = new Colony(map, { antCount: 1, maxAnts: 1 }, mulberry32(1), () => "explore");
  const x = 20;
  const y = walkway(map, x) - 3;
  assert.equal(rockAt(map, x, y), AIR);
  c.ph.depositCell("home", x, y, 5);
  c.ph.advance(0.5);
  assert.equal(c.ph.fields.home.get(x, y), 0);
});

test("homing in the side view: a carrier on the ground walks to its entrance and down to the chamber; a pellet carrier comes up and drops it at the entrance", () => {
  const map = generateSideWorld(2, { ...SMALL, nestCount: 1 });
  const n = map.nest;
  cellOf(n.entrance!.x, n.entrance!.y);
  const ex = CELL[0];
  // Food carrier, 20 columns along the walkway.
  {
    const c = new Colony(map, { antCount: 1, maxAnts: 1, deposit: 0 }, mulberry32(3), () => "return");
    const sx = ex + 20;
    const sy = walkway(map, sx);
    c.x[0] = centreX(sx, sy);
    c.y[0] = centreY(sy);
    c.carrying[0] = 1;
    c.mode[0] = 2;
    let t = 0;
    for (; t < 30 * 60 && c.stored === 0; t++) c.tick(1 / 30);
    assert.equal(c.stored, 1, `food home in the chamber (${(t / 30).toFixed(0)} s)`);
  }
  // Pellet carrier, in the chamber.
  {
    const c = new Colony(map, { antCount: 1, maxAnts: 1, deposit: 0 }, mulberry32(4), () => "return");
    c.x[0] = n.x;
    c.y[0] = n.y;
    c.pellet[0] = 1;
    c.mode[0] = 2;
    c.soilDug = 1; // as if it dug it
    let t = 0;
    for (; t < 30 * 60 && c.pellet[0] === 1; t++) c.tick(1 / 30);
    assert.equal(c.soilOut, 1, `up the shaft and out (${(t / 30).toFixed(0)} s)`);
    c.tick(1 / 30); // the pellet is heaped where it stands: it climbs on top of it
    c.antCell(0);
    assert.ok(isSky(map, CELL[0], CELL[1]), "dropped out on the ground (MR 15: carried out along it, not dropped at the hole)");
  }
});

test("foraging in the side view: carriers on the ground in sight of the hole make for it, never away (no shuttling past it); farther out rarely away (their vector drifts); soil is conserved", () => {
  const map = generateSideWorld(4, { nestCount: 1 });
  const g = new Game(map, { antCount: 400 }, mulberry32(11));
  const c = g.player;
  const e = c.nest.entrance!;
  const lastD = new Float32Array(c.n).fill(-1);
  let samples = 0;
  let away = 0;
  let nearSamples = 0;
  let nearAway = 0;
  const nearD = new Float32Array(c.n).fill(-1);
  for (let k = 0; k < 30 * 200; k++) {
    g.tick(1 / 30);
    if (k % 10 === 0) {
      // Every 1/3 s: a carrier on the ground in sight of the hole (nest slice 1: its vector no longer matters) gets nearer.
      for (let i = 0; i < c.n; i++) {
        c.antCell(i);
        const d = Math.abs(c.x[i]! - e.x);
        const inSight =
          c.alive[i] && c.carrying[i] && isSky(map, CELL[0], CELL[1]) && d < HOLE_SIGHT && Math.abs(c.y[i]! - e.y) < 2 * HOLE_SIGHT;
        if (inSight && nearD[i]! >= 0) {
          nearSamples++;
          if (d > nearD[i]! + 1) nearAway++;
        }
        nearD[i] = inSight ? d : -1;
      }
    }
    if (k % 60 === 0) {
      // Every 2 s: a carrier on the ground should be nearer the hole (along the ground) than 2 s ago.
      for (let i = 0; i < c.n; i++) {
        c.antCell(i);
        const onGround = c.alive[i] && c.carrying[i] && isSky(map, CELL[0], CELL[1]);
        const d = Math.abs(c.x[i]! - e.x);
        if (onGround && lastD[i]! >= 0) {
          samples++;
          if (d > lastD[i]! + 2) away++;
        }
        lastD[i] = onGround ? d : -1;
      }
      assert.equal(c.soilDug, c.soilOut + c.soilFilled + c.carriedPellets().dug + c.soilLost, "dug = mound + filled + carried + lost");
    }
  }
  assert.ok(c.stored > 40, `food home: ${c.stored}`);
  assert.ok(samples > 50, `${samples} samples of carriers on the ground`);
  // Near the hole (in sight of it, or nearly), never away: carriers used to shuttle past it.
  assert.ok(
    nearSamples > 50 && nearAway <= nearSamples * 0.01,
    `${nearAway} of ${nearSamples} times a carrier in sight of the hole had moved away from it (they used to shuttle past it)`,
  );
  // Anywhere, rarely: a drifted vector (nest slice 1) can put the hole behind a carrier, which walks there first, then
  // searches; going round a heap on the ground can mean a few steps away first. (Measured 7.8 %: three quarters of it
  // drift and search, the rest going round heaps. With an exact vector, before slice 1, it was 0.)
  assert.ok(away <= samples * 0.1, `${away} of ${samples} times a carrier on the ground had moved away from the hole`);
});

test("the ground line's crust stays: explorers walking the surface dig only by their own entrance, and the ground line is never filled", () => {
  const map = generateSideWorld(3, { ...SMALL, nestCount: 1 });
  const g = new Game(map, { antCount: 200 }, mulberry32(5));
  for (let k = 0; k < 30 * 120; k++) g.tick(1 / 30);
  const c = g.player;
  const e = c.nest.entrance!;
  let holes = 0;
  for (let x = 0; x < map.size.w; x++) {
    const y = walkway(map, x);
    if (y < 0) continue;
    // Below the walkway: a dug cell touching it, away from the entrance, would be a new hole.
    for (let d = 1; d <= 2; d++) {
      const ax = nx(x, y, d);
      const ay = ny(y, d);
      if (!isSky(map, ax, ay) && rockAt(map, ax, ay) === OPEN && Math.hypot(centreX(ax, ay) - e.x, centreY(ay) - e.y) > 6) holes++;
    }
  }
  assert.ok(c.soilDug > 50, `they dug (${c.soilDug})`);
  assert.equal(holes, 0, "no holes in the ground line away from the entrance");
  let filledSky = 0;
  for (let y = 0; y < map.size.h; y++) for (let x = 0; x < map.size.w; x++) if (isSky(map, x, y) && rockAt(map, x, y) === SOIL) filledSky++;
  assert.equal(filledSky, 0, "nothing filled above ground");
});

test("the side world's defaults: wide enough that the two entrances are far apart along the ground", () => {
  assert.ok(SIDE_WORLD.size.w >= 2 * SIDE_WORLD.nestGap);
  const map = generateSideWorld(1);
  const [a, b] = map.nests;
  assert.ok(Math.abs(a!.entrance!.x - b!.entrance!.x) > 300, "entrances 300+ apart");
  assert.ok(groundRow(1, SIDE_WORLD, 0) > 40, "room for sky (and the mound) above the ground");
});

test("a carrier homing along the ground passes the rival's hole without going in, and one put down its shaft climbs straight back out (review of #15)", () => {
  // The step into the rival's hole was nearer its own by column; underground, its goal became its own chamber 340 columns
  // away through soil, and on seed 8 it stayed in that shaft for 300 s (since: about 10 s, until a stall turned it).
  const run = (seed: number, put: (c: Colony, rx: number, ry: number) => void, rim = false) => {
    const map = generateSideWorld(seed);
    const r = map.nests[1]!.entrance!;
    cellOf(r.x, r.y);
    const rx = CELL[0];
    const ry = CELL[1];
    // A pellet heaped on the hole's rim on the side toward home (the mound may hold a row there): then the hole itself is
    // the step nearer home by column from the rim's other side.
    if (rim) assert.ok(fillCell(map, nx(rx, ry, NW), ny(ry, NW)) && isSky(map, nx(rx, ry, NE), ny(ry, NE)), "the rim heaped");
    const c = new Colony(map, { antCount: 1, maxAnts: 1, deposit: 0 }, mulberry32(3), () => "return");
    put(c, rx, ry);
    let under = 0;
    let t = 0;
    for (; t < 30 * 120 && c.stored === 0; t++) {
      c.tick(1 / 30);
      c.antCell(0);
      if (!isSky(map, CELL[0], CELL[1]) && Math.abs(c.x[0]! - r.x) < 30) under++;
    }
    return { under: under / 30, home: c.stored === 1 };
  };
  const onGround = (c: Colony, x: number) => {
    const y = walkway(c.map, x);
    c.x[0] = centreX(x, y);
    c.y[0] = centreY(y);
    c.tick(1 / 30); // up on the ground: the surface vector starts (exact: no drift)
    c.driftSurf[0] = 0;
    c.carrying[0] = 1;
    c.mode[0] = 2;
  };
  for (const seed of [8, 3])
    for (const rim of [false, true])
      for (const off of [15, 5, -5]) {
        const a = run(seed, (c, rx) => onGround(c, rx + off), rim);
        assert.ok(
          a.home && a.under === 0,
          `seed ${seed}${rim ? ", rim heaped" : ""}, ${off} from the rival's hole: home (${a.home}), ${a.under.toFixed(1)} s in under the rival's hole`,
        );
      }
  for (const seed of [8, 3]) {
    const b = run(seed, (c, rx, ry) => {
      onGround(c, rx + 15);
      // Down the rival's shaft, three cells below its hole.
      let x = rx;
      let y = ry;
      for (let k = 0; k < 3; k++) {
        const d = [1, 2].find((d) => rockAt(c.map, nx(x, y, d), ny(y, d)) === OPEN)!;
        x = nx(x, y, d);
        y = ny(y, d);
      }
      c.x[0] = centreX(x, y);
      c.y[0] = centreY(y);
    });
    assert.ok(b.home && b.under < 2, `seed ${seed}, put down the rival's shaft: home (${b.home}), out in ${b.under.toFixed(1)} s`);
  }
});

test("golden: the side world's generator is pinned (terrain, sky, food and nests of three full-size seeds hashed)", () => {
  // Like world.test.ts's golden test for the top-down maps: any change to generateSideWorld shows here, and must be meant.
  // Re-pinned for the hole's re-grounded rim (PRD §40).
  const fnv = (str: string) => {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h;
  };
  const want: Record<number, number[]> = {
    1: [1383282634, 749433046, 3506000083, 1568863007, 27840],
    2: [3959629610, 2321370461, 976039075, 777330069, 28368],
    3: [473252651, 1739528132, 1285951842, 2141911505, 26380],
  };
  const got: Record<number, number[]> = {};
  for (const seed of [1, 2, 3]) {
    const m = generateSideWorld(seed);
    const rock = Array.from(flat(m, m.rock, (n) => new Uint8Array(n))).join("");
    const sky = Array.from(flat(m, m.sky!, (n) => new Uint8Array(n))).join("");
    const food = Array.from(flat(m, m.food, (n) => new Float32Array(n))).join(",");
    got[seed] = [fnv(rock), fnv(sky), fnv(food), fnv(JSON.stringify(m.nests)), m.foodTotal];
  }
  assert.deepEqual(got, want);
});

test("a homing ant on the walkway cell above the hole, its step to the hole grazing the soil beside it, goes in (review of #17: the freeze above the hole)", () => {
  // Where a frozen ant stood in a game (seed 2, one colony, 400 s): at the bottom corner of the walkway cell above the
  // hole. The straight line to the hole's centre crosses the soil cell beside it, so the step is blocked; on the ground line
  // the wall it starts is dropped next tick, and the rule that nudges a blocked wall-follower off its cell's edge never ran.
  // 3 ants stood there 114–340 s in that game.
  const map = generateSideWorld(2, { nestCount: 1 });
  cellOf(map.nest.entrance!.x, map.nest.entrance!.y);
  const hx = CELL[0];
  const hy = CELL[1];
  const c = new Colony(map, { antCount: 1, maxAnts: 1, deposit: 0 }, mulberry32(3), () => "return");
  c.x[0] = 328.29095458984375; // float32, as stored
  c.y[0] = 58.04733657836914;
  c.mode[0] = 2;
  c.antCell(0);
  const [ax, ay] = [CELL[0], CELL[1]];
  assert.ok(isSky(map, ax, ay) && hexDistance(ax, ay, hx, hy) === 1 && ay === hy - 1, "on the walkway, just above the hole");
  let t = 0;
  for (; t < 30 * 5; t++) {
    c.tick(1 / 30);
    c.antCell(0);
    if (CELL[0] !== ax || CELL[1] !== ay) break;
  }
  assert.ok(t < 30, `off that cell in ${(t / 30).toFixed(2)} s`);
});
