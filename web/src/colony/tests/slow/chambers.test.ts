import { test } from "node:test";
import assert from "node:assert/strict";
import { CHAMBER_MIN_DEPTH, LIFESPAN, MIDDLE, YOUNG } from "../../colony.ts";
import { Game } from "../../game.ts";
import { nx, ny } from "../../hex.ts";
import { groundTop, mulberry32, OPEN, rockAt, type WorldMap } from "../../world.ts";
import { CHAMBER_GAP, CHAMBER_GAP_GROWTH } from "../../tuning/nest.ts";
import { smallOne } from "../builders.ts";

// Nest slice 2 (docs/nest-and-home.md §3.2): whole-colony chamber tests, too slow for `npm test`'s 60 s per file
// (`npm run test:slow`). The rest are in ../int/chambers.test.ts. On the curtain of a small one world (S2.3c), whose columns
// run from x0 (negative) to x0 + w; the ground there is the crust under the strip's sky.

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
    for (let x = map.x0; x < map.x0 + map.size.w; x++) {
      const a = ch.at(x, y);
      if (a < 0) continue;
      for (let d = 0; d < 6; d++) {
        const b = ch.at(nx(x, y, d), ny(y, d));
        if (b >= 0 && b !== a)
          return `chambers ${a} (colony ${ch.list[a]!.colony}) and ${b} (colony ${ch.list[b]!.colony}) touch at (${x}, ${y})`;
      }
    }
  return "";
}

/** A chamber cell (not a founding one) less than CHAMBER_MIN_DEPTH rows under the ground as dug, as text (none: ""). */
function shallow(map: WorldMap): string {
  const ch = map.chambers!;
  for (let y = 0; y < map.size.h; y++)
    for (let x = map.x0; x < map.x0 + map.size.w; x++) {
      const id = ch.at(x, y);
      if (id < 0 || ch.list[id]!.role === "royal") continue;
      if (y - soilTop(map, x) < CHAMBER_MIN_DEPTH) return `chamber ${id}'s cell (${x}, ${y}) is ${y - soilTop(map, x)} rows down`;
    }
  return "";
}

/** The three crowded games (seeds 4-6, 240 s, 400 middle-aged ants) played once for the two tests below. */
let crowded: { trends: number; halves: string[]; growth: number[]; stacked: number[] } | undefined;
function crowdedGames() {
  if (crowded) return crowded;
  let trends = 0;
  const halves: string[] = [];
  const growth: number[] = [];
  const stacked: number[] = [];
  for (const seed of [4, 5, 6]) {
    const w = smallOne(2);
    const map = w.curtain;
    const g = new Game(w, { antCount: 400, rival: false }, mulberry32(seed));
    const ch = map.chambers!;
    const floor0 = ch.floorOf[0]!;
    // A filled chamber cell leaves its chamber as it is filled (fillCell releases it), so count the releases (review of #248, S1).
    let released = 0;
    const release = ch.release.bind(ch);
    ch.release = (x, y) => (ch.at(x, y) >= 0 && released++, release(x, y)); // fillCell releases every cell it fills
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
    const t = touching(map);
    assert.equal(t, "", `game ${seed}: ${t}`);
    // Every chamber cell is open: backfill never fills one.
    for (let y = 0; y < map.size.h; y++)
      for (let x = map.x0; x < map.x0 + map.size.w; x++)
        if (ch.at(x, y) >= 0) assert.equal(rockAt(map, x, y), OPEN, `game ${seed}: chamber cell (${x}, ${y}) filled`);
    assert.equal(released, 0, `game ${seed}: ${released} chamber cells filled`);
    // The gap from a chamber to the one above it (in the same stack: overlapping columns) grows with depth: the imposed rule.
    const gaps = mine
      .map((b) => {
        let gap = Infinity;
        for (const a of mine) if (a.floorRow < b.floorRow && a.x1 >= b.x0 && a.x0 <= b.x1) gap = Math.min(gap, b.floorRow - a.floorRow);
        return { depth: b.floorRow - groundTop(map, Math.round((b.x0 + b.x1) / 2)), gap };
      })
      .filter((x) => x.gap < Infinity)
      .sort((p, q) => p.depth - q.depth);
    // Each stacked pair keeps the rule's own minimum, CHAMBER_GAP + CHAMBER_GAP_GROWTH × depth, less a row (depth is read at
    // the chamber's middle column, not where it started): with the growth off, 3-7 pairs a game break it (review of #248, S2).
    const tight = gaps.filter((p) => p.gap < CHAMBER_GAP + CHAMBER_GAP_GROWTH * p.depth - 1);
    assert.equal(tight.length, 0, `game ${seed}: ${tight.length} stacked chambers closer than the spacing rule`);
    const half = Math.floor(gaps.length / 2);
    const mean = (xs: { gap: number }[]) => xs.reduce((s, x) => s + x.gap, 0) / xs.length;
    stacked.push(gaps.length);
    if (mean(gaps.slice(half)) > mean(gaps.slice(0, half))) trends++;
    halves.push(`game ${seed}: ${mean(gaps.slice(0, half)).toFixed(1)} vs ${mean(gaps.slice(half)).toFixed(1)}`);
  }
  return (crowded = { trends, halves, growth, stacked });
}

test("a crowded nest digs chambers: new ones start off the tunnels, stacked, none touching, the spacing rule showing", () => {
  // Three games. Every check holds in each, except the depth trend (last), which must hold in at least 2 of 3: it is one
  // nest's handful of stacked chambers, and fails in about 1 game in 6–9 (1 of 9 on nest 4, worlds 1–4, games 4–8; 0 of 9
  // before #14's backfill guards; about 1 in 6 in earlier measurements, on either side of #17's merge).
  // The depth trend is not an emergent result: it is imposed. A new chamber may start only CHAMBER_GAP + 0.15 × depth rows
  // from another (#chamberRoom), so the gap to the one above grows with depth by rule, as Tschinkel measured in real nests.
  // What this checks is that the rule takes effect in the nest the ants dig (chambers widen after they start, so it could
  // be undone), not that the profile arises of itself (review of slice 2).
  const { trends, halves, stacked } = crowdedGames();
  const meanStacked = stacked.reduce((a, b) => a + b, 0) / stacked.length;
  assert.ok(meanStacked >= 3, `stacked chambers, mean over three games ${meanStacked.toFixed(1)} (${stacked.join(", ")})`);
  assert.ok(
    trends >= 2,
    `the spacing rule shows: gap above, shallower half vs deeper half, deeper wider in ${trends} of 3 games (${halves.join("; ")})`,
  );
});

test(
  "a crowded nest's floor grows: at least ×1.5 in every game and ×2 on average",
  { todo: "ja-rw75: on one world ×2.31, ×1.38, ×1.38 (S2.3c)" },
  () => {
    // The side view's history (PRD §41, §44): before #14's backfill guards floor ×2.4–3.4; with them ×1.1–2.4; F2 ×2.06–2.94;
    // MR 3.1 (tiredness a body state) ×1.19–2.69, mean 2.17, re-baselined by the owner to ×1.5 in every game and ×2 on
    // average, which nest 9's backfill regression (×1.1 in the first game, mean 1.90) still fails. Bead ja-k4k.3: chamber
    // growth from sensed crowding.
    const { growth } = crowdedGames();
    for (const [k, x] of growth.entries())
      assert.ok(x >= 1.5, `game ${4 + k}: floor growth ×${x.toFixed(2)} (${growth.map((v) => v.toFixed(2)).join(", ")})`);
    const meanGrowth = growth.reduce((a, b) => a + b, 0) / growth.length;
    assert.ok(
      meanGrowth >= 2,
      `floor growth, mean over three games ×${meanGrowth.toFixed(2)} (${growth.map((v) => v.toFixed(2)).join(", ")})`,
    );
  },
);

test("two crowded colonies on several maps: no chamber touches another, of either colony, and none is dug shallower than CHAMBER_MIN_DEPTH under the ground", () => {
  // Review of slice 2: chambers joined on seed 5 with two colonies (a face aimed a while ago, dug after a neighbour grew
  // beside it; a stale aim forcing a dig), and widening dug a chamber 4 rows under the ground beside the shaft, its depth
  // read from the mound's top and only where a chamber starts.
  for (const world of [1, 2]) {
    const w = smallOne(world);
    const map = w.curtain;
    const g = new Game(w, { antCount: 200, rivalAnts: 200 }, mulberry32(world + 10));
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
