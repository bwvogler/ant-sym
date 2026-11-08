import { test } from "node:test";
import assert from "node:assert/strict";
import { CELL, cellOf } from "../hex.ts";
import { colOf, CRUST, CURTAIN_DEPTH, generateCurtain, generateOneWorld, refreshStrip, sOf, STRIP, type OneWorld } from "../oneWorld.ts";
import { cellAt, grow, nearestValid } from "../transect.ts";
import { AIR, flat, openCell, OPEN, reachable, ROCK, rockAt, type WorldMap } from "../world.ts";

const SEEDS = [1, 2, 3, 4, 5, 6];
const worlds = new Map<number, OneWorld>();
const world = (seed: number): OneWorld => {
  let w = worlds.get(seed);
  if (!w) worlds.set(seed, (w = generateOneWorld(seed)));
  return w;
};
const cellIndex = (m: WorldMap, x: number, y: number) => y * m.size.w + x;

test("the line runs through the plane's nests in order, and the curtain spans it, margins and all", () => {
  for (const seed of SEEDS) {
    const { plane, curtain, line } = world(seed);
    assert.equal(line.holes.length, plane.nests.length);
    plane.nests.forEach((n, k) => {
      cellOf(n.x, n.y);
      assert.deepEqual(line.holes[k], { x: CELL[0], y: CELL[1] }, `seed ${seed}: hole ${k} is nest ${k}'s cell`);
    });
    assert.equal(curtain.size.w, line.sMax - line.sMin + 1);
    assert.equal(curtain.size.h, CRUST + CURTAIN_DEPTH);
    assert.equal(sOf(line, colOf(line, 17)), 17);
    // Past the line's margins is rock, on every row (one-world §3: rock beyond).
    for (let y = 0; y < curtain.size.h; y += 7) {
      assert.equal(rockAt(curtain, -1, y), ROCK);
      assert.equal(rockAt(curtain, curtain.size.w, y), ROCK);
    }
  }
});

test("each hole is open on both layers, and its shaft leads on foot to the royal chamber (U2's guard)", () => {
  for (const seed of SEEDS) {
    const { plane, curtain, line } = world(seed);
    line.sHole.forEach((s, k) => {
      assert.ok(cellAt(line, s));
      assert.deepEqual([CELL[0], CELL[1]], [line.holes[k]!.x, line.holes[k]!.y], `seed ${seed}: the plane cell over hole ${k}'s column is the hole`);
      assert.equal(rockAt(plane, CELL[0]!, CELL[1]!), OPEN, `seed ${seed}: hole ${k} open on the plane`);
      const col = colOf(line, s);
      assert.equal(rockAt(curtain, col, CRUST), OPEN, `seed ${seed}: hole ${k} open in the curtain's crust`);
      const nest = curtain.nests[k]!;
      cellOf(nest.entrance!.x, nest.entrance!.y);
      assert.deepEqual([CELL[0], CELL[1]], [col, CRUST], `seed ${seed}: nest ${k}'s entrance is its hole`);
      const walk = reachable(curtain, nest.entrance!.x, nest.entrance!.y, "open");
      cellOf(nest.x, nest.y);
      assert.equal(walk[cellIndex(curtain, CELL[0]!, CELL[1]!)], 1, `seed ${seed}: nest ${k}'s chamber is a walk from its hole`);
      assert.ok(CELL[1]! >= CRUST + 10, `seed ${seed}: the chamber is well below the crust`);
    });
    assert.equal(curtain.chambers!.list.filter((c) => c.role === "royal").length, curtain.nests.length, `seed ${seed}: a royal chamber per nest`);
  }
});

test("the ground strip lies under P(s): every column shows the plane cell over it, with sky above (U2's guard)", () => {
  for (const seed of SEEDS) {
    const { plane, curtain, line } = world(seed);
    for (let s = line.sMin; s <= line.sMax; s++) {
      const col = colOf(line, s);
      cellAt(line, s);
      const [px, py] = [CELL[0]!, CELL[1]!];
      const open = rockAt(plane, px, py) === OPEN;
      assert.equal(curtain.rock.get(col, STRIP), open ? OPEN : ROCK, `seed ${seed}: column ${s}'s strip is P(s)'s ground`);
      assert.equal(curtain.food.get(col, STRIP), open ? plane.food.get(px, py) : 0, `seed ${seed}: column ${s}'s strip has P(s)'s food`);
      assert.equal(curtain.sky!.get(col, STRIP), 1);
      for (let y = 0; y < STRIP; y++) {
        assert.equal(curtain.rock.get(col, y), AIR, `seed ${seed}: sky above column ${s}`);
        assert.equal(curtain.sky!.get(col, y), 1);
      }
    }
  }
});

test("the crust is solid except at the holes: the only way between the layers (one-world §2)", () => {
  for (const seed of SEEDS) {
    const { curtain, line } = world(seed);
    const holes = new Set(line.sHole.map((s) => colOf(line, s)));
    for (let col = 0; col < curtain.size.w; col++) {
      if (holes.has(col)) continue;
      assert.notEqual(curtain.rock.get(col, CRUST), OPEN, `seed ${seed}: crust open at column ${sOf(line, col)}`);
      assert.equal(curtain.sky!.get(col, CRUST), 0);
    }
  }
});

test("buried food lies below the crust, reachable from the first nest; the strip's food is the plane's, not counted", () => {
  for (const seed of SEEDS) {
    const { curtain } = world(seed);
    const reach = reachable(curtain, curtain.nest.x, curtain.nest.y, "diggable");
    let total = 0;
    for (let y = CRUST; y < curtain.size.h; y++)
      for (let x = 0; x < curtain.size.w; x++) {
        const v = curtain.food.get(x, y);
        if (!v) continue;
        assert.ok(y >= CRUST + 4, `seed ${seed}: food at (${x}, ${y}) is in a pocket, deep enough`);
        assert.equal(reach[cellIndex(curtain, x, y)], 1, `seed ${seed}: food at (${x}, ${y}) is reachable`);
        total += v;
      }
    assert.equal(curtain.foodTotal, total);
    assert.ok(total > 1000, `seed ${seed}: ${total} food buried`);
  }
});

test("the curtain's ground keeps its place when the line grows at V₀: stones and cavities go by s, not by storage column", () => {
  for (const seed of [1, 2, 3]) {
    const { plane, curtain, line } = world(seed);
    const v0 = line.holes[0]!;
    const f = nearestValid(line, { x: v0.x - 60, y: v0.y + 40 }, 140, openCell(plane));
    assert.ok(f && f.end === "start", `seed ${seed}: a founding beyond Ink`);
    const grown = grow(line, f.end, f.cell);
    const after = generateCurtain(seed, plane, grown);
    assert.ok(colOf(grown, 0) > colOf(line, 0), "storage moved: growing at V₀ lowers sMin");
    // Compare every shared column away from the new hole (its shaft, chamber and the pockets it pushes aside).
    const sNew = grown.sHole[0]!;
    let compared = 0;
    for (let s = Math.max(line.sMin, grown.sMin); s <= Math.min(line.sMax, grown.sMax); s++) {
      if (Math.abs(s - sNew) < 64 + 40) continue;
      for (let y = CRUST; y < curtain.size.h; y++) {
        assert.equal(after.rock.get(colOf(grown, s), y), curtain.rock.get(colOf(line, s), y), `seed ${seed}: column ${s}, row ${y}`);
        compared++;
      }
    }
    assert.ok(compared > 100 * CURTAIN_DEPTH, `seed ${seed}: ${compared} cells compared`);
  }
});

test("refreshStrip copies the plane again: food taken on the plane leaves the strip", () => {
  const { plane, curtain, line } = generateOneWorld(1);
  let hit = -1;
  for (let s = line.sMin; s <= line.sMax && hit < 0; s++) {
    cellAt(line, s);
    if (plane.food.get(CELL[0]!, CELL[1]!) > 0) hit = s;
  }
  if (hit < 0) return; // no food under this line: nothing to show
  cellAt(line, hit);
  plane.food.set(CELL[0]!, CELL[1]!, 0);
  assert.ok(curtain.food.get(colOf(line, hit), STRIP) > 0);
  refreshStrip(curtain, plane, line);
  assert.equal(curtain.food.get(colOf(line, hit), STRIP), 0);
});

test("one nest makes a line of one hole; more than two is founding's job (U4)", () => {
  const solo = generateOneWorld(2, { plane: { nestCount: 1 } });
  assert.equal(solo.line.holes.length, 1);
  assert.equal(solo.curtain.nests.length, 1);
  assert.throws(() => generateOneWorld(2, { plane: { nestCount: 3 } }), /founding/);
});

test("golden: generateOneWorld is pinned (the line, and the curtain's terrain, sky, food and nests, for three seeds)", () => {
  const fnv = (str: string) => {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h;
  };
  // Any change to generateOneWorld, generateWorld under it, the line or the curtain's rules shows here, and must be meant.
  const want: Record<number, number[]> = {
    1: [1842500005, 993339350, 811853696, 2398851589, 4279881073, 10296],
    2: [1969913797, 4077823617, 2937589818, 4279595470, 1334540775, 8232],
    3: [2052465902, 1883093818, 2937589818, 1384646397, 2374244746, 7896],
  };
  const got: Record<number, number[]> = {};
  for (const seed of [1, 2, 3]) {
    const { curtain: m, line } = world(seed);
    const rock = Array.from(flat(m, m.rock, (n) => new Uint8Array(n))).join("");
    const sky = Array.from(flat(m, m.sky!, (n) => new Uint8Array(n))).join("");
    const food = Array.from(flat(m, m.food, (n) => new Float32Array(n))).join(",");
    got[seed] = [fnv(JSON.stringify(line.holes)), fnv(rock), fnv(sky), fnv(food), fnv(JSON.stringify(m.nests)), m.foodTotal];
  }
  if (process.env.GOLDEN_WRITE) console.log(JSON.stringify(got));
  assert.deepEqual(got, want);
});
