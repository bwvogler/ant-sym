// Offline, no key: how long one colony tick takes. Runs the game headless
// (both colonies on the local rule) on each map size and reports the median
// and 90th-percentile milliseconds per tick after a warm-up, plus the ants
// alive at the end. Ants spread out over the run, so the late ticks (more
// trail laid, more chunks awake) are the honest ones. Each size runs twice:
// underground (the default: soil the ants dig) and the open surface.
//
// Usage: node scripts/colony-bench.mjs [ants per colony=1200] [sim seconds=60] [seed=1]
import { Game } from "../web/src/colony/game.ts";
import { generateWorld, mulberry32, OPEN_WORLD } from "../web/src/colony/world.ts";

const [ants = 1200, seconds = 60, seed = 1] = process.argv.slice(2).map(Number);
const DT = 1 / 30;
const SIZES = [
  { w: 160, h: 100 },
  { w: 512, h: 320 },
];

for (const [size, ground] of SIZES.flatMap((s) => [[s, "underground"], [s, "open"]])) {
  const t0 = performance.now();
  const map = generateWorld(seed, ground === "open" ? { ...OPEN_WORLD, size } : { size });
  const gen = performance.now() - t0;
  const game = new Game(map, { antCount: ants, rivalAnts: ants }, mulberry32(seed * 31 + 7));
  const steps = Math.round(seconds / DT);
  const warm = Math.round(5 / DT);
  const ms = [];
  for (let k = 0; k < steps; k++) {
    const a = performance.now();
    game.tick(DT);
    if (k >= warm) ms.push(performance.now() - a);
  }
  ms.sort((a, b) => a - b);
  const q = (p) => ms[Math.min(ms.length - 1, Math.floor(p * ms.length))].toFixed(2);
  const mean = (ms.reduce((a, b) => a + b, 0) / ms.length).toFixed(2);
  const alive = game.colonies.map((c) => c.population).join(" + ");
  const awake = game.colonies[0].ph.awakeChunks?.() ?? "n/a";
  const dug = game.colonies.map((c) => c.soilDug).join(" / ");
  console.log(`${size.w}×${size.h} ${ground}: generate ${gen.toFixed(0)} ms; tick mean ${mean} ms, median ${q(0.5)} ms, p90 ${q(0.9)} ms over ${seconds} s; ants ${alive}; stored ${game.colonies.map((c) => c.stored).join(" / ")}; dug ${dug}; awake chunks ${awake}`);
}
