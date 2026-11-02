import { test } from "node:test";
import assert from "node:assert/strict";
import { Chambers } from "../chambers.ts";
import { builtFloor, CHAMBER_MIN_DEPTH, Colony, FLOOR_PER_ANT, LIFESPAN, MIDDLE, refilled, ROOMY_DIG, YOUNG } from "../colony.ts";
import { Game } from "../game.ts";
import { nx, ny } from "../hex.ts";
import { digCell, fillCell, generateSideWorld, groundTop, mulberry32, OPEN, rockAt, SOIL, type WorldMap } from "../world.ts";

// Nest slice 2 (docs/nest-and-home.md §3.2): the side view's nest is chambers the ants dig, regulated by floor per worker.

const SMALL = { size: { w: 256, h: 160 }, nestGap: 120, surface: 40, nestCount: 1 };

/** The ground's top in column x as dug: under the mound's loose soil (what a chamber's depth is measured from). */
function soilTop(map: WorldMap, x: number): number {
  let y = groundTop(map, x);
  while (y < map.size.h && map.loose?.get(x, y) === 1) y++;
  return y;
}

/** Every pair of cells of two different chambers that touch, as text (none: ""). */
function touching(map: WorldMap): string {
  const ch = map.chambers!;
  for (let y = 0; y < map.size.h; y++)
    for (let x = 0; x < map.size.w; x++) {
      const a = ch.at(x, y);
      if (a < 0) continue;
      for (let d = 0; d < 6; d++) {
        const b = ch.at(nx(x, y, d), ny(y, d));
        if (b >= 0 && b !== a) return `chambers ${a} (colony ${ch.list[a]!.colony}) and ${b} (colony ${ch.list[b]!.colony}) touch at (${x}, ${y})`;
      }
    }
  return "";
}

/** A chamber cell (not a founding one) less than CHAMBER_MIN_DEPTH rows under the ground as dug, as text (none: ""). */
function shallow(map: WorldMap): string {
  const ch = map.chambers!;
  for (let y = 0; y < map.size.h; y++)
    for (let x = 0; x < map.size.w; x++) {
      const id = ch.at(x, y);
      if (id < 0 || ch.list[id]!.role === "royal") continue;
      if (y - soilTop(map, x) < CHAMBER_MIN_DEPTH) return `chamber ${id}'s cell (${x}, ${y}) is ${y - soilTop(map, x)} rows down`;
    }
  return "";
}

test("chambers: the founding chamber is the colony's royal one with a floor; a floor cell dug out from under stops being floor; a filled cell leaves", () => {
  const map = generateSideWorld(2, SMALL);
  const ch = map.chambers!;
  const c0 = ch.list[0]!;
  assert.equal(c0.colony, 0);
  assert.equal(c0.role, "royal");
  assert.ok(c0.cells > 40 && c0.floor > 0, `${c0.cells} cells, ${c0.floor} floor`);
  assert.ok(c0.y0 < c0.y1 && c0.y1 === c0.floorRow, `rows ${c0.y0}–${c0.y1}, floor row ${c0.floorRow}`);
  assert.equal(ch.floorOf[0], c0.floor);
  // A floor cell: dig the soil under it (south-west), and it is floor no more.
  let fx = -1;
  let fy = -1;
  for (let y = 0; y < map.size.h && fx < 0; y++)
    for (let x = 0; x < map.size.w; x++)
      if (ch.at(x, y) === 0 && rockAt(map, x, y) === OPEN && rockAt(map, x - (1 - (y & 1)), y + 1) === SOIL && rockAt(map, x + (y & 1), y + 1) === SOIL) {
        fx = x;
        fy = y;
        break;
      }
  assert.ok(fx >= 0, "found a floor cell");
  const before = c0.floor;
  // Ground under one side is still ground to stand on; dug out under both, it is floor no more.
  assert.ok(digCell(map, fx - (1 - (fy & 1)), fy + 1));
  assert.equal(c0.floor, before, "one side dug: still floor");
  assert.ok(digCell(map, fx + (fy & 1), fy + 1));
  assert.ok(c0.floor < before, "both dug: not floor (nor, maybe, a neighbour that stood on the same cell)");
  // Filled back, the chamber cell leaves the chamber (backfill never does this; the bookkeeping must still hold).
  const cells = c0.cells;
  assert.ok(fillCell(map, fx, fy));
  assert.equal(ch.at(fx, fy), -1);
  assert.equal(c0.cells, cells - 1);
  assert.equal(new Chambers().at(0, 0), -1);
  // A chamber's span shrinks when an end cell leaves it (review of slice 2: x0 and x1 never shrank).
  const row = c0.floorRow + 6;
  const side = map.chambers!.add(0, row, "store");
  for (let x = 20; x <= 24; x++) {
    digCell(map, x, row);
    map.chambers!.claim(side.id, x, row, (a, b) => rockAt(map, a, b) === OPEN);
  }
  assert.deepEqual([side.x0, side.x1], [20, 24]);
  fillCell(map, 24, row);
  fillCell(map, 20, row);
  assert.deepEqual([side.x0, side.x1, side.cells], [21, 23, 3]);
});

test("soil put back under a chamber cell stays put for good; put back elsewhere, only for BACKFILL.hold (floor fills were dug out again at 2–7× the rate of others)", () => {
  const map = generateSideWorld(2, SMALL);
  const ch = map.chambers!;
  const c0 = ch.list[0]!;
  // A cell under the founding chamber's floor, dug out (a tunnel down) and filled back at 10 s.
  let fx = -1;
  for (let x = c0.x0; x <= c0.x1 && fx < 0; x++) if (ch.at(x, c0.floorRow) === 0 && rockAt(map, nx(x, c0.floorRow, 1), ny(c0.floorRow, 1)) === SOIL) fx = nx(x, c0.floorRow, 1);
  const fy = c0.floorRow + 1;
  assert.ok(fx >= 0, "a cell under the floor");
  const floor = c0.floor;
  assert.ok(digCell(map, fx, fy, 5));
  assert.ok(fillCell(map, fx, fy, 10));
  assert.equal(c0.floor, floor, "the floor is back");
  // A soil cell well away from any chamber, dug and filled back at the same time.
  let ox = -1;
  const oy = 120;
  for (let x = 4; x < 60 && ox < 0; x++) if (rockAt(map, x, oy) === SOIL) ox = x;
  assert.ok(ox >= 0 && Math.abs(ox - c0.x0) > 10, "a soil cell away from the nest");
  digCell(map, ox, oy, 5);
  assert.ok(fillCell(map, ox, oy, 10));
  const later = 10 + 10_000;
  assert.ok(builtFloor(map, fx, fy) && refilled(map, fx, fy, later), "floor put back is never dug");
  assert.ok(!builtFloor(map, ox, oy) && !refilled(map, ox, oy, later), "elsewhere the hold runs out");
  assert.ok(refilled(map, ox, oy, 11), "…but holds for a while");
  digCell(map, fx, fy, later); // a test (or a cave-in) digs it anyway: no longer put back
  assert.ok(!builtFloor(map, fx, fy));
});

test("a crowded nest digs chambers: the founding one widens, new ones start off the tunnels, and floor grows", () => {
  // Three games. Every check holds in each, except the depth trend (last), which must hold in at least 2 of 3: it is one
  // nest's handful of stacked chambers, and fails in about 1 game in 6–9 (1 of 9 on nest 4, worlds 1–4, games 4–8; 0 of 9
  // before #14's backfill guards; about 1 in 6 in earlier measurements, on either side of #17's merge).
  // The depth trend is not an emergent result: it is imposed. A new chamber may start only CHAMBER_GAP + 0.15 × depth rows
  // from another (#chamberRoom), so the gap to the one above grows with depth by rule, as Tschinkel measured in real nests.
  // What this checks is that the rule takes effect in the nest the ants dig (chambers widen after they start, so it could
  // be undone), not that the profile arises of itself (review of slice 2).
  let trends = 0;
  const halves: string[] = [];
  const growth: number[] = [];
  const stacked: number[] = [];
  for (const seed of [4, 5, 6]) {
    const map = generateSideWorld(2, SMALL);
    const g = new Game(map, { antCount: 400, rival: false }, mulberry32(seed));
    const ch = map.chambers!;
    const floor0 = ch.floorOf[0]!;
    // Every ant middle-aged, a digger: this is about how chambers are dug, not who digs (slice 6 zones digging by age).
    for (let i = 0; i < g.player.n; i++) {
      g.player.age[i] = ((YOUNG + MIDDLE) / 2) * LIFESPAN;
      g.player.lifespan[i] = Infinity;
    }
    for (let k = 0; k < 30 * 240; k++) g.tick(1 / 30);
    const mine = ch.list.filter((c) => c.colony === 0 && c.cells > 0);
    assert.ok(mine.length >= 3, `game ${seed}: ${mine.length} chambers`);
    growth.push(ch.floorOf[0]! / floor0);
    // No chamber was dug into another: widening and new chambers don't break into other passages (review of slice 2).
    for (let y = 0; y < map.size.h; y++)
      for (let x = 0; x < map.size.w; x++) {
        const a = ch.at(x, y);
        if (a < 0) continue;
        for (let d = 0; d < 6; d++) {
          const b = ch.at(nx(x, y, d), ny(y, d));
          assert.ok(b < 0 || b === a, `game ${seed}: chambers ${a} and ${b} touch at (${x}, ${y})`);
        }
      }
    // Every chamber cell is open: backfill never fills one.
    for (let y = 0; y < map.size.h; y++) for (let x = 0; x < map.size.w; x++) if (ch.at(x, y) >= 0) assert.equal(rockAt(map, x, y), OPEN, `game ${seed}: chamber cell (${x}, ${y}) filled`);
    // The gap from a chamber to the one above it (in the same stack: overlapping columns) grows with depth: the imposed rule.
    const gaps = mine
      .map((b) => {
        let gap = Infinity;
        for (const a of mine) if (a.floorRow < b.floorRow && a.x1 >= b.x0 && a.x0 <= b.x1) gap = Math.min(gap, b.floorRow - a.floorRow);
        return { depth: b.floorRow - groundTop(map, Math.round((b.x0 + b.x1) / 2)), gap };
      })
      .filter((x) => x.gap < Infinity)
      .sort((p, q) => p.depth - q.depth);
    const half = Math.floor(gaps.length / 2);
    const mean = (xs: { gap: number }[]) => xs.reduce((s, x) => s + x.gap, 0) / xs.length;
    stacked.push(gaps.length);
    if (mean(gaps.slice(half)) > mean(gaps.slice(0, half))) trends++;
    halves.push(`game ${seed}: ${mean(gaps.slice(0, half)).toFixed(1)} vs ${mean(gaps.slice(half)).toFixed(1)}`);
  }
  // #14's backfill guards (young / hold / besideRefill, merged through #17) cut floor growth here. In the F2 fix-up (PRD
  // §41) it came back: with the homing fix-up F1 merged in, pellet carriers get out of the nest sooner, and diggers widen
  // more; soil put back under a chamber cell now stays. At 240 s, all ants middle-aged, worlds 1–4, nine games (world 2
  // games 4–8, worlds 1, 3, 4 game 4, world 3 game 5; `node scripts/floor-bench.mjs`):
  //   nest 6 before #14 (71658ee)   floor ×2.4–3.4, mean 2.96; stacked 3–5, none under 3
  //   nest 9 with #14 (99eed4b)      floor ×1.1–2.4, mean 1.90; stacked 1–8, 3 of 9 under 3
  //   F2, merged with F1 and F3      floor ×2.06–2.94, mean 2.43; stacked 2–8, mean 4.9, 1 of 9 under 3 (world 2 game 4,
  //                                  this test's first game: 2, 4, 5 here)
  // So floor grows at least ×2 in every game again, as before #14. Stacked chambers keep the mean bound over the three
  // games (3.7 on them); at least 3 in every game, as before #14, fails in that one game of nine.
  for (const [k, x] of growth.entries()) assert.ok(x >= 2, `game ${4 + k}: floor growth ×${x.toFixed(2)} (${growth.map((v) => v.toFixed(2)).join(", ")})`);
  const meanStacked = stacked.reduce((a, b) => a + b, 0) / stacked.length;
  assert.ok(meanStacked >= 3, `stacked chambers, mean over three games ${meanStacked.toFixed(1)} (${stacked.join(", ")})`);
  assert.ok(trends >= 2, `the spacing rule shows: gap above, shallower half vs deeper half, deeper wider in ${trends} of 3 games (${halves.join("; ")})`);
});

test("two crowded colonies on several maps: no chamber touches another, of either colony, and none is dug shallower than CHAMBER_MIN_DEPTH under the ground", () => {
  // Review of slice 2: chambers joined on seed 5 with two colonies (a face aimed a while ago, dug after a neighbour grew
  // beside it; a stale aim forcing a dig), and widening dug a chamber 4 rows under the ground beside the shaft, its depth
  // read from the mound's top and only where a chamber starts.
  for (const world of [1, 2]) {
    const map = generateSideWorld(world, { ...SMALL, nestCount: 2 });
    const g = new Game(map, { antCount: 200, rivalAnts: 200 }, mulberry32(world + 10));
    for (const c of g.colonies)
      for (let i = 0; i < c.n; i++) {
        c.age[i] = ((YOUNG + MIDDLE) / 2) * LIFESPAN;
        c.lifespan[i] = Infinity;
      }
    for (let k = 0; k < 30 * 200; k++) {
      g.tick(1 / 30);
      if (k % 600) continue;
      const t = touching(map);
      assert.equal(t, "", `world ${world}, ${(k / 30).toFixed(0)} s: ${t}`);
      const s = shallow(map);
      assert.equal(s, "", `world ${world}, ${(k / 30).toFixed(0)} s: ${s}`);
    }
    assert.ok(map.chambers!.list.filter((c) => c.cells > 0 && c.role !== "royal").length >= 6, `world ${world}: chambers dug`);
  }
});

test("a roomy nest barely digs (ja-wii): the same few ants dig far less when their chambers have floor enough", () => {
  // Summed over four games: 30 ants dig little, so one game's ratio is noisy (over 30 games, 0.32 ± 0.15 before #17 was
  // merged in and 0.40 ± 0.22 after; one game in eight was over 0.5 even before).
  const dug = (chambers: boolean) => {
    let s = 0;
    for (const seed of [6, 7, 8, 9]) {
      const map = generateSideWorld(2, SMALL);
      if (!chambers) map.chambers = undefined; // no chambers: never roomy (as before slice 2)
      const c = new Colony(map, { antCount: 30, maxAnts: 30 }, mulberry32(seed));
      // All middle-aged (diggers, slice 6): this is about how much a nest digs, not who digs.
      for (let i = 0; i < c.n; i++) ((c.age[i] = ((YOUNG + MIDDLE) / 2) * LIFESPAN), (c.lifespan[i] = Infinity));
      for (let k = 0; k < 30 * 120; k++) c.tick(1 / 30);
      s += c.soilDug;
    }
    return s;
  };
  const roomy = dug(true);
  const before = dug(false);
  assert.ok(30 * FLOOR_PER_ANT < 6, "30 ants want less floor than the founding chamber has: roomy");
  assert.ok(roomy < before * 0.5, `roomy ${roomy} vs ${before}`);
  // …but at about ROOMY_DIG, not its square (an aimed face was gated twice: review of slice 2).
  assert.ok(roomy > before * ROOMY_DIG, `roomy ${roomy} vs ${before}: damped too hard`);
});
