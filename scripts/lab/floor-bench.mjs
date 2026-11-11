// Offline, no key: the crowded-nest test's games (web/src/colony/tests/int/chambers.test.ts), measured over more of them
// (PRD §40, the F2 fix-up). Each game is a small side world (256 × 160, ground 40 rows down, one colony of 400 ants, every
// ant middle-aged: a digger), run for `seconds`. Reported per game: the founding floor's growth (floor at the end ÷ floor
// at the start), chambers, stacked chambers (with another above them, overlapping columns), whether the gap above grows
// with depth (deeper half vs shallower half), whether any two chambers touch, and every fill counted by a hook on the
// map: floor-ground fills (a cell under a chamber cell, or beside one on its floor row: see Colony #floorGround) and
// other fills, with how many of each were dug out again.
// Games: world (generateSideWorld seed) × game (mulberry32 seed). The default list is the nine the merge agent measured
// (world 2 games 4–8; worlds 1, 3, 4 game 4; world 3 game 5).
//
// Usage: node scripts/lab/floor-bench.mjs [games=2:4,2:5,2:6,2:7,2:8,1:4,3:4,4:4,3:5] [seconds=240] [root=this repo] [backfill tuning, e.g. young:0,hold:0]
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const games = (args[0] ?? "2:4,2:5,2:6,2:7,2:8,1:4,3:4,4:4,3:5").split(",").map((s) => s.split(":").map(Number));
const seconds = Number(args[1] ?? 240);
const root = resolve(args[2] ?? resolve(dirname(fileURLToPath(import.meta.url)), "../.."));
const { Game } = await import(`${root}/web/src/colony/game.ts`);
const C = await import(`${root}/web/src/colony/colony.ts`);
const W = await import(`${root}/web/src/colony/world.ts`);
const { nx, ny } = await import(`${root}/web/src/colony/hex.ts`);
const tuning = args[3] ? Object.fromEntries(args[3].split(",").map((kv) => kv.split(":")).map(([k, v]) => [k, Number(v)])) : {};
const SMALL = { size: { w: 256, h: 160 }, nestGap: 120, surface: 40, nestCount: 1 };
const rows = [];
for (const [world, seed] of games) {
  const map = W.generateSideWorld(world, SMALL);
  const g = new Game(map, { antCount: 400, rival: false, colony: { backfill: { ...C.BACKFILL, ...tuning } } }, W.mulberry32(seed));
  const ch = map.chambers;
  const floor0 = ch.floorOf[0];
  for (let i = 0; i < g.player.n; i++) {
    g.player.age[i] = ((C.YOUNG + C.MIDDLE) / 2) * C.LIFESPAN;
    g.player.lifespan[i] = Infinity;
  }
  const floorGround = (x, y) => {
    if (ch.at(nx(x, y, 4), ny(y, 4)) >= 0 || ch.at(nx(x, y, 5), ny(y, 5)) >= 0) return true;
    for (const d of [0, 3]) {
      const id = ch.at(nx(x, y, d), ny(y, d));
      if (id >= 0 && ch.list[id].floorRow === y) return true;
    }
    return false;
  };
  const fills = new Map();
  const n = { floor: 0, other: 0, floorRedug: 0, otherRedug: 0 };
  const fset = map.filledAt.set.bind(map.filledAt);
  map.filledAt.set = (x, y, v) => {
    if (Number.isFinite(v) && v > 0) {
      const floor = floorGround(x, y);
      fills.set(y * 65536 + x, floor);
      floor ? n.floor++ : n.other++;
    }
    fset(x, y, v);
  };
  const dset = map.dugAt.set.bind(map.dugAt);
  map.dugAt.set = (x, y, v) => {
    const k = y * 65536 + x;
    if (fills.has(k)) {
      fills.get(k) ? n.floorRedug++ : n.otherRedug++;
      fills.delete(k);
    }
    dset(x, y, v);
  };
  for (let k = 0; k < 30 * seconds; k++) g.tick(1 / 30);
  const mine = ch.list.filter((c) => c.colony === 0 && c.cells > 0);
  const gaps = mine
    .map((b) => {
      let gap = Infinity;
      for (const a of mine) if (a.floorRow < b.floorRow && a.x1 >= b.x0 && a.x0 <= b.x1) gap = Math.min(gap, b.floorRow - a.floorRow);
      return { depth: b.floorRow - W.groundTop(map, Math.round((b.x0 + b.x1) / 2)), gap };
    })
    .filter((x) => x.gap < Infinity)
    .sort((p, q) => p.depth - q.depth);
  const half = Math.floor(gaps.length / 2);
  const mean = (xs) => xs.reduce((s, x) => s + x.gap, 0) / xs.length;
  let touch = 0;
  for (let y = 0; y < map.size.h; y++)
    for (let x = 0; x < map.size.w; x++) {
      const a = ch.at(x, y);
      if (a < 0) continue;
      for (let d = 0; d < 6; d++) {
        const b = ch.at(nx(x, y, d), ny(y, d));
        if (b >= 0 && b !== a) touch++;
      }
    }
  const r = { world, seed, growth: ch.floorOf[0] / floor0, chambers: mine.length, stacked: gaps.length, trend: mean(gaps.slice(half)) > mean(gaps.slice(0, half)), touch, ...n, dug: g.player.soilDug };
  rows.push(r);
  console.log(`world ${world} game ${seed}: floor ×${r.growth.toFixed(2)}  chambers ${r.chambers}  stacked ${r.stacked}  trend ${r.trend ? "yes" : "no"}  touching ${touch}  dug ${r.dug}  fills floor ${n.floor} (re-dug ${n.floorRedug}) other ${n.other} (re-dug ${n.otherRedug})`);
}
const g = rows.map((r) => r.growth);
const st = rows.map((r) => r.stacked);
console.log(
  `all ${rows.length}: floor ×${Math.min(...g).toFixed(2)}–${Math.max(...g).toFixed(2)} (mean ${(g.reduce((a, b) => a + b, 0) / g.length).toFixed(2)}); stacked ${Math.min(...st)}–${Math.max(...st)} (mean ${(st.reduce((a, b) => a + b, 0) / st.length).toFixed(1)}, under 3 in ${st.filter((x) => x < 3).length}); trend in ${rows.filter((r) => r.trend).length}; touching in ${rows.filter((r) => r.touch > 0).length}`,
);
