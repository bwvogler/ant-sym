import { after, test } from "node:test";
import assert from "node:assert/strict";
import { BACKFILL, Colony, SWELL } from "../colony.ts";
import { Game } from "../game.ts";
import { CELL, cellOf } from "../hex.ts";
import { generateSideWorld, groundTop, heapMound, isSky, mulberry32, OPEN, reachable, rockAt, SOIL } from "../world.ts";

// The mound above ground (MR 14): pellets brought out become loose soil heaped as a sandpile round the hole.

const SMALL = { size: { w: 256, h: 160 }, surface: 60, relief: 0, nestCount: 1 };

test("a sandpile round the hole: slopes of at most a row per column (≈41°), a funnel crater with the hole open, the walkway riding on top, food lifted", () => {
  const map = generateSideWorld(1, SMALL);
  cellOf(map.nest.entrance!.x, map.nest.entrance!.y);
  const ex = CELL[0] as number;
  const ey = CELL[1] as number;
  const top0 = Array.from({ length: map.size.w }, (_, x) => groundTop(map, x));
  // Food on the walkway three columns out: it ends up on top of the mound, not buried.
  const fy = groundTop(map, ex + 3) - 1;
  map.food.set(ex + 3, fy, 5);
  const rng = mulberry32(2);
  let placed = 0;
  for (let k = 0; k < 900; k++) if (heapMound(map, ex, rng() < 0.5 ? -1 : 1, Math.floor(rng() * 3))) placed++;
  assert.equal(placed, 900);
  let loose = 0;
  for (let y = 0; y < map.size.h; y++)
    for (let x = 0; x < map.size.w; x++)
      if (map.loose!.get(x, y)) {
        loose++;
        assert.equal(rockAt(map, x, y), SOIL, "loose soil is soil");
        assert.ok(!isSky(map, x, y), "and ground, not sky");
      }
  assert.equal(loose, 900);
  const hole = groundTop(map, ex);
  for (let x = ex - 60; x < ex + 60; x++) {
    const h = top0[x]! - groundTop(map, x); // how high the mound stands in column x
    assert.ok(h >= 0);
    if (x !== ex) assert.ok(hole - groundTop(map, x) <= Math.abs(x - ex) - 1 || h === 0, `column ${x}: inside the funnel's slope`);
    if (top0[x] === top0[x + 1] && x !== ex && x + 1 !== ex) assert.ok(Math.abs(groundTop(map, x) - groundTop(map, x + 1)) <= 1, `columns ${x}–${x + 1}: at most a row apart`);
    const y = groundTop(map, x) - 1;
    assert.equal(rockAt(map, x, y), OPEN, `column ${x}: a walkway cell on top`);
  }
  assert.equal(groundTop(map, ex), top0[ex], "the hole's column is never heaped");
  assert.equal(rockAt(map, ex, ey), OPEN, "the entrance stays open");
  assert.ok(Math.max(...Array.from({ length: 40 }, (_, k) => top0[ex - 20 + k]! - groundTop(map, ex - 20 + k))) > 10, "a mound you can see: over ten rows high");
  let food = 0;
  for (let y = 0; y < map.size.h; y++) for (let x = 0; x < map.size.w; x++) food += map.food.get(x, y) > 0 && isSky(map, x, y) && x === ex + 3 ? map.food.get(x, y) : 0;
  assert.equal(food, 5, "the food on the walkway was lifted on top, not buried");
});

test("in a game: soil is carried out and dropped along the ground, loose soil is spread and taken down to backfill, every pellet is accounted for, nobody is buried, the way in stays open", () => {
  const map = generateSideWorld(2, { size: { w: 320, h: 200 }, nestCount: 1 });
  const g = new Game(map, { antCount: 300 }, mulberry32(7));
  const c = g.player;
  const solidT = new Float32Array(c.n);
  let maxSolid = 0;
  for (let k = 0; k < 30 * 200; k++) {
    g.tick(1 / 30);
    // Nobody is buried: an ant in a cell spoil was heaped on climbs out at once.
    for (let i = 0; i < c.n; i++) {
      if (!c.alive[i]) continue;
      c.antCell(i);
      solidT[i] = rockAt(map, CELL[0] as number, CELL[1] as number) === OPEN ? 0 : solidT[i]! + 1 / 30;
      maxSolid = Math.max(maxSolid, solidT[i]!);
    }
    if (k % 300 === 0) {
      let loose = 0;
      for (let y = 0; y < map.size.h; y++) for (let x = 0; x < map.size.w; x++) loose += map.loose!.get(x, y) && rockAt(map, x, y) === SOIL ? 1 : 0;
      const carried = c.carriedPellets();
      assert.equal(loose, c.moundCells, "the mound on the map is the colony's count");
      assert.equal(c.soilDug, c.soilOut + c.soilFilled + carried.dug + c.soilLost, "dug = brought out + filled + carried + lost");
      assert.equal(c.loosePicked, c.looseDropped + c.looseFilled + carried.loose + c.looseLost, "loose picked up = dropped again + filled + carried + lost");
      assert.equal(c.moundCells, Math.floor(c.soilOut * SWELL + 1e-9) - c.moundLost - c.loosePicked + c.looseDropped, "the mound = soil brought out × SWELL, less what was taken off it, plus what was put back");
    }
  }
  assert.ok(c.soilOut > 50, `${c.soilOut} pellets brought out`);
  assert.equal(c.moundLost, 0);
  assert.ok(c.looseDropped > 0 && c.looseFilled > 0, `loose soil spread (${c.looseDropped}) and taken down to backfill (${c.looseFilled})`);
  assert.ok(maxSolid < 0.5, `longest any ant stood in solid ground: ${maxSolid.toFixed(2)} s`);
  const walk = reachable(map, c.nest.x, c.nest.y, "open");
  let toSky = false;
  for (let y = 0; y < map.size.h && !toSky; y++) for (let x = 0; x < map.size.w && !toSky; x++) toSky = walk[y * map.size.w + x] === 1 && isSky(map, x, y);
  assert.ok(toSky, "the chamber still reaches the ground line");
});

test("a pellet is carried out along the ground and dropped where the carrier stands, not by the hole", () => {
  // No scent in this one-ant world (deposit 0): every branch would look unused, so no detours to fill them.
  const saved = BACKFILL.enterStale;
  BACKFILL.enterStale = 0;
  after(() => {
    BACKFILL.enterStale = saved;
  });
  const map = generateSideWorld(1, { ...SMALL });
  const c = new Colony(map, { antCount: 1, maxAnts: 1, deposit: 0 }, mulberry32(9), () => "return");
  cellOf(map.nest.entrance!.x, map.nest.entrance!.y);
  const ex = CELL[0] as number;
  const drops: { at: number; cells: number[] }[] = [];
  for (let trip = 0; trip < 12; trip++) {
    c.x[0] = map.nest.x;
    c.y[0] = map.nest.y;
    c.pellet[0] = 1;
    c.mode[0] = 2;
    c.soilDug++; // as if it dug it
    const before = new Set<number>();
    for (let y = 0; y < map.size.h; y++) for (let x = 0; x < map.size.w; x++) if (map.loose!.get(x, y)) before.add(y * map.size.w + x);
    let at = -1;
    for (let t = 0; t < 30 * 60 && c.pellet[0] === 1; t++) {
      c.tick(1 / 30);
      c.antCell(0);
      at = CELL[0] as number;
    }
    assert.equal(c.pellet[0], 0, `trip ${trip}: dropped`);
    const cells: number[] = [];
    for (let y = 0; y < map.size.h; y++) for (let x = 0; x < map.size.w; x++) if (map.loose!.get(x, y) && !before.has(y * map.size.w + x)) cells.push(x);
    drops.push({ at, cells });
  }
  for (const d of drops) for (const x of d.cells) assert.ok(Math.abs(x - d.at) <= 4, `heaped in column ${x}, dropped at ${d.at}: where it stood (and slid a little)`);
  assert.ok(drops.some((d) => Math.abs(d.at - ex) >= 4), "carried away from the hole");
});

test("one colony's mound never buries another's hole: every hole keeps its funnel, however far the spoil spreads", () => {
  const map = generateSideWorld(3, { size: { w: 320, h: 160 }, surface: 70, relief: 0, nestCount: 2, nestGap: 110 });
  const holes = map.nests.map((n) => {
    cellOf(n.entrance!.x, n.entrance!.y);
    return CELL[0] as number;
  });
  const [a, b] = holes as [number, number];
  cellOf(map.nests[1]!.entrance!.x, map.nests[1]!.entrance!.y);
  const by = CELL[1] as number;
  const topB = groundTop(map, b);
  const rng = mulberry32(4);
  for (let k = 0; k < 4000; k++) heapMound(map, a, b > a ? 1 : -1, Math.floor(rng() * 150), holes);
  assert.equal(groundTop(map, b), topB, "the other hole's column is never heaped");
  assert.equal(rockAt(map, b, by), OPEN, "its hole is open");
  for (const d of [1, 2]) assert.ok(groundTop(map, b) - groundTop(map, b + d) < d && groundTop(map, b) - groundTop(map, b - d) < d, `its funnel holds ${d} out`);
  const walk = reachable(map, map.nests[1]!.x, map.nests[1]!.y, "open");
  let toSky = false;
  for (let y = 0; y < map.size.h && !toSky; y++) for (let x = 0; x < map.size.w && !toSky; x++) toSky = walk[y * map.size.w + x] === 1 && isSky(map, x, y);
  assert.ok(toSky, "its chamber still reaches the ground line");
});
