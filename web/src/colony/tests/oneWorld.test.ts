import { test } from "node:test";
import assert from "node:assert/strict";
import { CELL, cellOf, NE, NW, nx, ny } from "../hex.ts";
import { CRUST, CURTAIN_DEPTH, generateCurtain, generateOneWorld, STRIP, type OneWorld } from "../oneWorld.ts";
import { cellAt, grow, nearestValid } from "../transect.ts";
import { AIR, digCell, fillCell, flat, foundNest, heapMound, inBounds, isSky, mulberry32, openCell, OPEN, reachable, ROCK, rockAt, SOIL, type WorldMap } from "../world.ts";
import { cellKey, keyX, keyY } from "../colony.ts";

const SEEDS = [1, 2, 3, 4, 5, 6];
const worlds = new Map<number, OneWorld>();
const world = (seed: number): OneWorld => {
  let w = worlds.get(seed);
  if (!w) worlds.set(seed, (w = generateOneWorld(seed)));
  return w;
};
const cellIndex = (m: WorldMap, x: number, y: number) => y * m.size.w + x - m.x0;

test("the line runs through the plane's nests in order, and the curtain spans it, margins and all", () => {
  for (const seed of SEEDS) {
    const { plane, curtain, line } = world(seed);
    assert.equal(line.holes.length, plane.nests.length);
    plane.nests.forEach((n, k) => {
      cellOf(n.x, n.y);
      assert.deepEqual(line.holes[k], { x: CELL[0], y: CELL[1] }, `seed ${seed}: hole ${k} is nest ${k}'s cell`);
    });
    // The curtain's column is s itself (its x origin, U4a): it starts at the line's first column and ends at its last, and
    // each hole's column is its s (the hole test below digs at s too).
    assert.equal(curtain.x0, line.sMin);
    assert.ok(curtain.x0 < 0, "the margin before V₀ is negative s");
    assert.equal(curtain.size.w, line.sMax - line.sMin + 1);
    assert.equal(curtain.size.h, CRUST + CURTAIN_DEPTH);
    // Past the line's margins is rock, on every row (one-world §3: rock beyond).
    for (let y = 0; y < curtain.size.h; y += 7) {
      assert.equal(rockAt(curtain, line.sMin - 1, y), ROCK);
      assert.equal(rockAt(curtain, line.sMax + 1, y), ROCK);
    }
  }
});

test("the curtain's x origin: every column s from sMin to sMax is on the map and reads its own ground, none outside (U4a)", () => {
  for (const seed of [1, 2]) {
    const { curtain, line } = world(seed);
    for (let y = CRUST; y < curtain.size.h; y += 5) {
      for (let s = line.sMin; s <= line.sMax; s++) {
        assert.ok(inBounds(curtain, s, y), `seed ${seed}: column ${s} is on the map`);
        assert.equal(rockAt(curtain, s, y), curtain.rock.get(s, y), `seed ${seed}: column ${s}, row ${y} reads its own ground`);
      }
      assert.ok(!inBounds(curtain, line.sMin - 1, y) && !inBounds(curtain, line.sMax + 1, y));
    }
    // The west margin (negative s) is ground like any other: soil and stones, not the rock beyond the map.
    let soil = 0;
    for (let s = line.sMin; s < 0; s++) for (let y = CRUST + 1; y < CRUST + 40; y++) soil += rockAt(curtain, s, y) === SOIL ? 1 : 0;
    assert.ok(soil > 0.5 * -line.sMin * 39, `seed ${seed}: ${soil} soil cells west of V₀`);
  }
});

test("cellKey round-trips negative columns (−32768 … 32767), and keyY is the row for them too", () => {
  for (const [x, y] of [
    [0, 0],
    [5, 7],
    [-1, 0],
    [-1, 1],
    [-64, 41],
    [-32768, 300],
    [32767, 2],
  ] as const) {
    const k = cellKey(x, y);
    assert.deepEqual([keyX(k), keyY(k)], [x, y], `(${x}, ${y})`);
  }
});

test("each hole is open on both layers, and its shaft leads on foot to the royal chamber (U2's guard)", () => {
  for (const seed of SEEDS) {
    const { plane, curtain, line } = world(seed);
    line.sHole.forEach((s, k) => {
      assert.ok(cellAt(line, s));
      assert.deepEqual([CELL[0], CELL[1]], [line.holes[k]!.x, line.holes[k]!.y], `seed ${seed}: the plane cell over hole ${k}'s column is the hole`);
      assert.equal(rockAt(plane, CELL[0]!, CELL[1]!), OPEN, `seed ${seed}: hole ${k} open on the plane`);
      const col = s;
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

test("the ground strip is sky, as the rows above it: the side view draws P(s) there, the curtain stores nothing of the surface (§8 item 6)", () => {
  for (const seed of SEEDS) {
    const { curtain, line } = world(seed);
    assert.equal(curtain.surfaceRows, CRUST);
    for (let s = line.sMin; s <= line.sMax; s++) {
      for (let y = 0; y <= STRIP; y++) {
        assert.equal(curtain.rock.get(s, y), AIR, `seed ${seed}: sky at column ${s}, row ${y}`);
        assert.equal(curtain.sky!.get(s, y), 1);
        assert.equal(curtain.food.get(s, y), 0, `seed ${seed}: no food in the sky at column ${s}, row ${y}: the surface's is the plane's`);
      }
    }
    // The hole is open below the strip, and the strip's cell over it is the hole: P(sHole) is the hole's plane cell.
    line.sHole.forEach((s, k) => {
      assert.equal(rockAt(curtain, s, CRUST), OPEN, `seed ${seed}: hole ${k} open under the strip`);
      cellAt(line, s);
      assert.deepEqual([CELL[0], CELL[1]], [line.holes[k]!.x, line.holes[k]!.y], `seed ${seed}: the strip over hole ${k} is drawn from its plane cell`);
    });
  }
});

test("the crust is solid except at the holes: the only way between the layers (one-world §2)", () => {
  for (const seed of SEEDS) {
    const { curtain, line } = world(seed);
    const holes = new Set(line.sHole);
    for (let col = curtain.x0; col < curtain.x0 + curtain.size.w; col++) {
      if (holes.has(col)) continue;
      assert.notEqual(curtain.rock.get(col, CRUST), OPEN, `seed ${seed}: crust open at column ${col}`);
      assert.equal(curtain.sky!.get(col, CRUST), 0);
      // It touches the strip's sky, so the side view's #crust rule (colony.ts) keeps diggers off it, as on today's ground.
      assert.ok([NW, NE].some((d) => isSky(curtain, nx(col, CRUST, d), ny(CRUST, d))), `seed ${seed}: crust at column ${col} touches the sky`);
    }
  }
});

test("buried food lies below the crust, reachable from some nest; the strip's food is the plane's, not counted", () => {
  for (const seed of SEEDS) {
    const { curtain } = world(seed);
    const reach = new Uint8Array(curtain.size.w * curtain.size.h);
    for (const n of curtain.nests) reachable(curtain, n.x, n.y, "diggable").forEach((v, i) => (reach[i]! |= v));
    let total = 0;
    for (let y = CRUST; y < curtain.size.h; y++)
      for (let x = curtain.x0; x < curtain.x0 + curtain.size.w; x++) {
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

/** Every shared column of two curtains has the same ground, except in the 64-column pocket blocks within reach of `sNew`. */
function sameGround(seed: number, a: OneWorld["curtain"], la: OneWorld["line"], b: OneWorld["curtain"], lb: OneWorld["line"], sNew: number): number {
  // A new nest pushes aside the pockets near it, and with them the rest of their block's draws; its shaft and chamber
  // lie within a few columns of its hole. Pockets keep 16 + radius + 1 ≤ 21 from a nest.
  const lo = Math.floor((sNew - 30) / 64) * 64;
  const hi = (Math.floor((sNew + 30) / 64) + 1) * 64;
  let compared = 0;
  for (let s = Math.max(la.sMin, lb.sMin); s <= Math.min(la.sMax, lb.sMax); s++) {
    if (s >= lo && s < hi) continue;
    for (let y = CRUST; y < a.size.h; y++) {
      assert.equal(b.rock.get(s, y), a.rock.get(s, y), `seed ${seed}: column ${s}, row ${y}`);
      compared++;
    }
  }
  return compared;
}

test("the curtain's ground keeps its place when the line grows, at either end: it goes by s, not by storage column", () => {
  for (const seed of [1, 2, 3]) {
    const { plane, curtain, line } = world(seed);
    const open = openCell(plane);
    const v0 = line.holes[0]!;
    const atStart = nearestValid(line, { x: v0.x - 60, y: v0.y + 40 }, 140, open);
    assert.ok(atStart && atStart.end === "start", `seed ${seed}: a founding beyond Ink`);
    const before = grow(line, "start", atStart.cell);
    // The new colony (2) takes the first hole; Ink (0) and Amber (1) keep their nests and royal chambers.
    const c1 = generateCurtain(seed, before, [2, 0, 1]);
    // Growing at V₀ lowers the first column (x0), and every s keeps its storage column: s itself.
    assert.ok(c1.x0 < curtain.x0, "growing at V₀ lowers the curtain's x0");
    assert.equal(c1.x0, before.sMin);
    assert.ok(sameGround(seed, curtain, line, c1, before, before.sHole[0]!) > 100 * CURTAIN_DEPTH);
    c1.nests.forEach((n, k) => {
      cellOf(n.entrance!.x, n.entrance!.y);
      assert.equal(CELL[0]!, k === 2 ? before.sHole[0] : line.sHole[k], `seed ${seed}: colony ${k}'s nest is at its own hole`);
    });
    assert.equal(c1.nest, c1.nests[0], "the player's nest is still Ink's");
    assert.deepEqual(c1.chambers!.list.filter((c) => c.role === "royal").map((c) => c.colony).sort(), [0, 1, 2]);
    const inkChamber = c1.chambers!.list.find((c) => c.role === "royal" && c.colony === 0)!;
    // Chamber ids go by colony too: each colony's royal chamber keeps its id when the line grows at V₀.
    for (const c of c1.chambers!.list.filter((ch) => ch.role === "royal")) assert.equal(c.id, c.colony, `seed ${seed}: colony ${c.colony}'s royal chamber id`);
    assert.equal(inkChamber.id, curtain.chambers!.list.find((c) => c.role === "royal" && c.colony === 0)!.id);
    cellOf(c1.nests[0]!.x, c1.nests[0]!.y);
    assert.equal(c1.chambers!.cell.get(CELL[0]!, CELL[1]!), inkChamber.id + 1, `seed ${seed}: Ink's chamber is colony 0's`);
    // Then grow at the far end: the ground stays put there too (pockets near the end don't move with sMax).
    const vk = before.holes[before.holes.length - 1]!;
    const atEnd = nearestValid(before, { x: vk.x + 60, y: vk.y - 40 }, 140, open);
    if (!atEnd || atEnd.end !== "end") continue;
    const after = grow(before, "end", atEnd.cell);
    const c2 = generateCurtain(seed, after, [2, 0, 1, 3]);
    assert.ok(sameGround(seed, c1, before, c2, after, after.sHole[after.sHole.length - 1]!) > 100 * CURTAIN_DEPTH);
  }
  assert.throws(() => generateCurtain(1, world(1).line, [0, 0]), /must number/);
});

test("digging below never re-derives the sky and the strip: they are the plane's (the curtain's surfaceRows)", () => {
  for (const seed of [1, 2, 3]) {
    const { line } = world(seed);
    const curtain = generateCurtain(seed, line);
    assert.equal(curtain.surfaceRows, CRUST);
    const snap = () => {
      const out: number[] = [];
      for (let y = 0; y < CRUST; y++) for (let x = curtain.x0; x < curtain.x0 + curtain.size.w; x++) out.push(curtain.rock.get(x, y), curtain.sky!.get(x, y), curtain.food.get(x, y));
      return out;
    };
    const before = snap();
    // A nest founded on the curtain (U4's addColony) away from the holes.
    const at = line.sHole[0]! + 40;
    foundNest(curtain, at, 2, mulberry32(seed));
    assert.equal(curtain.rock.get(at, CRUST), OPEN, "the new hole is dug through the crust");
    // And the crust dug beside a hole: ants never dig it (every crust cell touches the strip's sky, so colony.ts's #crust
    // rule keeps them off, tested below), but a direct dig still leaves the strip alone.
    const h = line.sHole[0]!;
    for (const col of [h - 1, h + 1]) if (curtain.rock.get(col, CRUST) === SOIL) digCell(curtain, col, CRUST);
    // Nothing fills the strip, and no spoil is heaped on it: the mound is the plane's (one-world §4).
    assert.equal(fillCell(curtain, h, STRIP), false);
    assert.equal(heapMound(curtain, h, 1, 0), null);
    assert.equal(heapMound(curtain, h, -1, 0), null);
    assert.deepEqual(snap(), before, `seed ${seed}: the sky and the strip are unchanged`);
  }
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
  // U4a's x origin moved only the nests (the fifth: every curtain position is 64 lower, its column s, not s − sMin).
  // U5.1's strip drawn, not stored, moved only the strip: the rock (sky, not P(s)'s ground) and seed 2's food (none on
  // the strip); the sky, the nests and foodTotal are as they were.
  const want: Record<number, number[]> = {
    1: [1842500005, 164310650, 811853696, 1989952978, 191380210, 9036],
    2: [1969913797, 4855636, 2937589818, 3952031626, 2156429359, 7116],
    3: [2052465902, 3999756657, 2937589818, 4056070497, 2006955693, 7080],
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
