// Offline, no key: how far a side-view colony digs sideways from its hole, to size one world's margin (the curtain past
// each end hole: docs/one-world.md §3, "U2 sets the margin from how far the side view's nests dig today"). Runs the
// page's side-view game (600 ants a colony, GAME_REGROW, both colonies on the local rule) and, at each checkpoint,
// takes every cell an ant has dug (dugAt > −∞, below ground) and its column distance from the nearest hole.
//
// Usage: node scripts/dig-spread.mjs [seeds=1-3] [seconds=600] [ants=600]
import { Game, GAME_REGROW, gameRng } from "../web/src/colony/game.ts";
import { CELL, cellOf } from "../web/src/colony/hex.ts";
import { generateSideWorld } from "../web/src/colony/world.ts";

const [range = "1-3", secs = "600", antArg = "600"] = process.argv.slice(2);
const [lo, hi = lo] = range.split("-").map(Number);
const seconds = Number(secs);
const ants = Number(antArg);
const DT = 1 / 30;
const checkpoints = [150, 300, 600, 1200].filter((s) => s <= seconds);
if (!checkpoints.includes(seconds)) checkpoints.push(seconds);

function spread(map) {
  const holes = map.nests.map((n) => {
    cellOf(n.entrance.x, n.entrance.y);
    return CELL[0];
  });
  const d = [];
  map.dugAt.forEach((cx, cy, arr) => {
    for (let i = 0; i < arr.length; i++) {
      if (arr[i] === -Infinity) continue;
      const x = (cx << 6) + (i & 63);
      const y = (cy << 6) + (i >> 6);
      if (map.sky?.get(x, y) === 1) continue;
      d.push(Math.min(...holes.map((h) => Math.abs(x - h))));
    }
  });
  d.sort((a, b) => a - b);
  const q = (p) => (d.length ? d[Math.min(d.length - 1, Math.floor(p * d.length))] : 0);
  return `${d.length} cells dug; columns from the nearest hole: median ${q(0.5)}, p95 ${q(0.95)}, p99 ${q(0.99)}, max ${d.length ? d[d.length - 1] : 0}`;
}

for (let seed = lo; seed <= hi; seed++) {
  const game = new Game(generateSideWorld(seed), { antCount: ants, rivalAnts: ants, regrow: GAME_REGROW }, gameRng(seed));
  let t = 0;
  for (const at of checkpoints) {
    for (; t < at; t += DT) game.tick(DT);
    console.log(`seed ${seed}, ${at} s: ${spread(game.map)}`);
  }
}
