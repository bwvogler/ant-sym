import { test } from "node:test";
import assert from "node:assert/strict";
import { Colony, HOLE_SIGHT } from "../colony.ts";
import { Game } from "../game.ts";
import { CELL, cellOf, centreX, centreY, nx, ny } from "../hex.ts";
import { AIR, digCell, generateSideWorld, groundRow, isSky, mulberry32, OPEN, reachable, rockAt, SIDE_WORLD, SOIL, type WorldMap } from "../world.ts";

// The side view (MR 13): a cross-section with sky, a walkway along the ground line, nests dug below it.

const SMALL = { size: { w: 256, h: 160 }, nestGap: 120, surface: 40 };

/** The walkway cell of column x: the open sky cell just above the ground, or −1. */
function walkway(map: WorldMap, x: number): number {
  for (let y = 0; y < map.size.h; y++) if (isSky(map, x, y) && rockAt(map, x, y) === OPEN) return y;
  return -1;
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
    const seen = new Set<number>();
    const todo: [number, number][] = [[0, walkway(map, 0)]];
    seen.add(todo[0]![1] * map.size.w);
    let east = false;
    while (todo.length) {
      const [x, y] = todo.pop()!;
      if (x === map.size.w - 1) east = true;
      for (let d = 0; d < 6; d++) {
        const ax = nx(x, y, d);
        const ay = ny(y, d);
        const k = ay * map.size.w + ax;
        if (seen.has(k) || !isSky(map, ax, ay) || rockAt(map, ax, ay) !== OPEN) continue;
        seen.add(k);
        todo.push([ax, ay]);
      }
    }
    assert.ok(east, `seed ${seed}: the walkway runs edge to edge`);
  }
});

test("each nest: its entrance an open hole in the ground line with the walkway beside it, a shaft down to its chamber, and food on the ground and below it, none in the air", () => {
  for (const seed of [1, 2, 3, 4, 6, 7]) {
    const map = seed <= 3 ? generateSideWorld(seed, SMALL) : generateSideWorld(seed); // 4, 6, 7 at full size: entrances once generated in the air
    assert.equal(map.nests.length, 2);
    for (const n of map.nests) {
      assert.ok(n.entrance, "an entrance");
      cellOf(n.entrance!.x, n.entrance!.y);
      const ex = CELL[0] as number;
      const ey = CELL[1] as number;
      assert.ok(!isSky(map, ex, ey) && rockAt(map, ex, ey) === OPEN, `seed ${seed}: the hole is open ground`);
      let beside = false;
      for (let d = 0; d < 6; d++) beside ||= isSky(map, nx(ex, ey, d), ny(ey, d)) && rockAt(map, nx(ex, ey, d), ny(ey, d)) === OPEN;
      assert.ok(beside, `seed ${seed}: the walkway beside it`);
      assert.ok(n.y > n.entrance!.y + 8, "the chamber is well below the ground line");
      const walk = reachable(map, n.x, n.y, "open");
      cellOf(n.entrance.x, n.entrance.y);
      assert.equal(walk[(CELL[1] as number) * map.size.w + (CELL[0] as number)], 1, "the chamber is joined to its entrance on foot");
    }
    const dig = reachable(map, map.nest.x, map.nest.y, "diggable");
    let onGround = 0;
    let below = 0;
    for (let y = 0; y < map.size.h; y++)
      for (let x = 0; x < map.size.w; x++) {
        if (!map.food.get(x, y)) continue;
        assert.notEqual(rockAt(map, x, y), AIR, "no food in the air");
        assert.equal(dig[y * map.size.w + x], 1, "all food reachable, walking or digging");
        if (isSky(map, x, y)) onGround++;
        else below++;
      }
    assert.ok(onGround > 0 && below > 0, `seed ${seed}: food on the ground (${onGround} cells) and below it (${below})`);
  }
});

test("the walkway follows the ground: dig the soil from under a walkway cell and, with no ground left beside it, it is sky", () => {
  const map = generateSideWorld(4, SMALL);
  // A flat stretch away from the nests: find a column whose walkway sits on soil.
  let x = 10;
  while (walkway(map, x) < 0 || Math.abs(walkway(map, x) - walkway(map, x + 1)) > 0 || Math.abs(walkway(map, x) - walkway(map, x - 1)) > 0) x++;
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
  const ex = CELL[0] as number;
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
    assert.ok(isSky(map, CELL[0] as number, CELL[1] as number), "dropped out on the ground (MR 15: carried out along it, not dropped at the hole)");
  }
});

test("foraging in the side view: carriers on the ground make for where they believe the hole is, never away from it (no shuttling past it), and soil is conserved", () => {
  const map = generateSideWorld(4, { nestCount: 1 });
  const g = new Game(map, { antCount: 400 }, mulberry32(11));
  const c = g.player;
  const e = c.nest.entrance!;
  const lastD = new Float32Array(c.n).fill(-1);
  const lastSearch = new Float32Array(c.n);
  let samples = 0;
  let away = 0;
  for (let k = 0; k < 30 * 200; k++) {
    g.tick(1 / 30);
    if (k % 60 === 0) {
      // Every 2 s: a carrier on the ground should be nearer (along the ground) than 2 s ago to where it believes the hole
      // is: its drifting vector's estimate and its search offset (nest slice 1), or the hole itself once in sight.
      for (let i = 0; i < c.n; i++) {
        c.antCell(i);
        const onGround = c.alive[i] && c.carrying[i] && isSky(map, CELL[0] as number, CELL[1] as number);
        const near = Math.hypot(c.x[i]! - e.x, c.y[i]! - e.y) < HOLE_SIGHT;
        const believed = near ? e.x : e.x + c.driftSurf[i]! * c.odoSurf[i]! + c.search[i]!;
        const d = Math.abs(c.x[i]! - believed);
        if (onGround && lastD[i]! >= 0 && c.search[i] === lastSearch[i]) {
          samples++;
          if (d > lastD[i]! + 2) away++;
        }
        lastD[i] = onGround ? d : -1;
        lastSearch[i] = c.search[i]!;
      }
      assert.equal(c.soilDug, c.soilOut + c.soilFilled + c.carriedPellets().dug + c.soilLost, "dug = mound + filled + carried + lost");
    }
  }
  assert.ok(c.stored > 40, `food home: ${c.stored}`);
  assert.ok(samples > 50, `${samples} samples of carriers on the ground`);
  assert.ok(away <= samples * 0.03, `${away} of ${samples} times a carrier on the ground had moved away from where it believed the hole was (they used to shuttle past it)`);
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
