// Offline, no key: how long one colony tick takes. Runs the game headless
// (both colonies on the local rule) on each map size and reports the median
// and 90th-percentile milliseconds per tick after a warm-up, plus the ants
// alive at the end. Ants spread out over the run, so the late ticks (more
// trail laid, more chunks awake) are the honest ones. Each size runs twice:
// underground (soil the ants dig, seen from above) and the open surface; then
// the side view (the app's default: a cross-section) at its own size, one colony and two.
//
// With spores=1, Bloom is painted over both nests at the start: every ant of
// both colonies carries load, the fungus's worst case per tick.
//
// --one runs one world alone instead (generateOneWorld(seed), docs/one-world.md: the plane and the curtain, two colonies),
// and also prints how many ants are on each layer at the end; spores=1 is ignored there. A spot check; U6 measures it in full.
//
// Usage: node scripts/colony-bench.mjs [--one] [ants per colony=1200] [sim seconds=60] [seed=1] [spores=0]
import { CURTAIN, PLANE } from "../web/src/colony/colony.ts";
import { Game } from "../web/src/colony/game.ts";
import { generateOneWorld } from "../web/src/colony/oneWorld.ts";
import { generateSideWorld, generateWorld, mulberry32, OPEN_WORLD, SIDE_WORLD } from "../web/src/colony/world.ts";

const one = process.argv.includes("--one");
const [ants = 1200, seconds = 60, seed = 1, spores = 0] = process.argv
  .slice(2)
  .filter((a) => a !== "--one")
  .map(Number);
const DT = 1 / 30;
const SIZES = [
  { w: 160, h: 100 },
  { w: 512, h: 320 },
];

const RUNS = one ? [[null, "one world, two"]] : [...SIZES.flatMap((s) => [[s, "underground"], [s, "open"]]), [SIDE_WORLD.size, "side, one colony"], [SIDE_WORLD.size, "side, two"]];
for (const [given, ground] of RUNS) {
  const t0 = performance.now();
  const map = ground.startsWith("one") ? generateOneWorld(seed) : ground.startsWith("side") ? generateSideWorld(seed, ground === "side, two" ? {} : { nestCount: 1 }) : generateWorld(seed, ground === "open" ? { ...OPEN_WORLD, size: given } : { size: given });
  const gen = performance.now() - t0;
  const size = given ?? map.plane.size;
  const game = new Game(map, { antCount: ants, rivalAnts: ants }, mulberry32(seed * 31 + 7));
  if (spores && !game.world) for (const c of game.colonies) game.paintSpores(c.nest.x, c.nest.y, c.nest.r + 2, 3, 0.3, 1);
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
  const onLayer = (c, l) => c.layer.filter((v, i) => v === l && c.alive[i]).length;
  const layers = game.world ? `; plane/curtain ${game.colonies.map((c) => `${onLayer(c, PLANE)}/${onLayer(c, CURTAIN)}`).join(" + ")}` : "";
  console.log(`${size.w}×${size.h} ${ground}: generate ${gen.toFixed(0)} ms; tick mean ${mean} ms, median ${q(0.5)} ms, p90 ${q(0.9)} ms over ${seconds} s; ants ${alive}${layers}; stored ${game.colonies.map((c) => c.stored).join(" / ")}; dug ${dug}; awake chunks ${awake}${spores ? `; infected ${game.colonies.map((c) => game.fungus.census(c).infected).join(" + ")}` : ""}`);
}
