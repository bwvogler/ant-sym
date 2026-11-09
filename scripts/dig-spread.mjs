// Offline, no key: how far a side-view colony digs sideways from its hole, to size one world's margin (the curtain past
// each end hole: docs/one-world.md §3, "U2 sets the margin from how far the side view's nests dig today"). Runs the
// page's side-view game (600 ants a colony, GAME_REGROW, both colonies on the local rule) and, at each checkpoint,
// takes every cell an ant has dug (dugAt > −∞, below ground). The margin bounds digging outward past an end hole, so
// the figure that sizes it is "outward": cells beyond the outer hole on either side (west of the westmost, east of the
// eastmost), by their column distance from it. "Any" pools every dug cell by its nearest hole, for reference.
//
// The fungus isn't landed (the page lands it when Start is pressed): this is how far healthy colonies dig. Whether an
// infection changes that is for U3's re-measurement on one world.
//
// Usage: node scripts/dig-spread.mjs [seeds=1-3] [seconds=600] [ants=600]
import { CHUNK, CHUNK_BITS } from "../web/src/colony/chunks.ts";
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
  const out = [];
  const west = Math.min(...holes);
  const east = Math.max(...holes);
  map.dugAt.forEach((cx, cy, arr) => {
    for (let i = 0; i < arr.length; i++) {
      if (arr[i] === -Infinity) continue;
      const x = (cx << CHUNK_BITS) + (i & (CHUNK - 1));
      const y = (cy << CHUNK_BITS) + (i >> CHUNK_BITS);
      if (map.sky?.get(x, y) === 1) continue;
      d.push(Math.min(...holes.map((h) => Math.abs(x - h))));
      if (x < west) out.push(west - x);
      else if (x > east) out.push(x - east);
    }
  });
  const stats = (a) => {
    a.sort((x, y) => x - y);
    const q = (p) => (a.length ? a[Math.min(a.length - 1, Math.floor(p * a.length))] : 0);
    return `median ${q(0.5)}, p95 ${q(0.95)}, p99 ${q(0.99)}, max ${a.length ? a[a.length - 1] : 0}`;
  };
  return `${d.length} cells dug; outward past the end holes (${out.length} cells): ${stats(out)}; any, from the nearest hole: ${stats(d)}`;
}

for (let seed = lo; seed <= hi; seed++) {
  const game = new Game(generateSideWorld(seed), { antCount: ants, rivalAnts: ants, regrow: GAME_REGROW }, gameRng(seed));
  // Ticks counted as whole numbers: summing DT as a float drifts, and a checkpoint would land a tick early or late.
  let tick = 0;
  for (const at of checkpoints) {
    for (; tick < Math.round(at / DT); tick++) game.tick(DT);
    console.log(`seed ${seed}, ${at} s: ${spread(game.map)}`);
  }
}
