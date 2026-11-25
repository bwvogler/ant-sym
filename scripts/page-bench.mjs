// Offline, no key: how the game the PAGE builds runs (PRD §66 E6 switch, `ja-qpv.5.1`). `buildGame` with the page's settings (600 ants a colony, a rival, the
// generic ant, Garden landed by the colony the seed chose, the local rule), the tick timed alone (no canvas, no React, no Jev), the world the page plays by
// default (endless: the awake rule on, cap by colony size, flight 280) or the bounded one. It reports the tick's median, 90th percentile and slowest, the ticks over
// 50 ms, the colonies and how many were awake at the end, the chunks held and the heap after a full collection, and a save's size (JSON, and gzipped).
//
// Usage: node --expose-gc scripts/page-bench.mjs [seconds=600] [seed=1] [ants=600] [--world endless|bounded] [--colonies N] [--no-save]
//
// --colonies N (endless): before the first tick wake the listed wild sites nearest the start, one after another, until the game holds N colonies, so the cap has
// colonies to rank (offline nothing wakes after the start, `ja-pnd9`: the page's default game holds 2 colonies for 10 minutes). As awake-bench.mjs --colonies.
//
// A tick here is a tick if it were all of a frame: the page's frame adds the canvas. One seed, one run: about ±7 % run to run on a quiet machine (PRD §66
// E4.5). The heap is the V8 heap plus the typed arrays' buffers (where the colonies' and the chunks' numbers live), read after `gc()` when the process has `--expose-gc` (else as it stands, and says so). The first 5 s are a warm-up.
import { gzipSync } from "node:zlib";
import { buildGame, GAME_STRAIN, landingOf } from "../web/src/ui/useColony.ts";
import { helpAndExit } from "./lib/usage.mjs";
helpAndExit(import.meta.url);

const wi = process.argv.indexOf("--world");
const world = wi >= 0 ? process.argv[wi + 1] : "endless";
if (world !== "endless" && world !== "bounded") throw new Error(`--world is endless or bounded, not "${world}"`);
const [seconds = 600, seed = 1, ants = 600] = process.argv
  .slice(2)
  .filter((a, i, all) => !a.startsWith("--") && all[i - 1] !== "--world" && all[i - 1] !== "--colonies")
  .map(Number);
const DT = 1 / 30;

const t0 = performance.now();
const game = buildGame({ species: "generic", seed, antCount: ants, rival: true, generation: 0, world });
const built = performance.now() - t0;
game.land(landingOf(game), GAME_STRAIN, { evolve: true });
const ci = process.argv.indexOf("--colonies");
if (ci >= 0) {
  const want = Number(process.argv[ci + 1]);
  const near = (/** @type {{ x: number; y: number }} */ s) =>
    Math.min(...game.colonies.map((c) => Math.hypot(s.x - c.layers[0].nest.x, s.y - c.layers[0].nest.y)));
  while (game.colonies.length < want) {
    game.feedSites();
    const next = game.sites.filter((s) => s.rx !== undefined).sort((a, b) => near(a) - near(b))[0];
    if (!next || next.rx === undefined || next.ry === undefined)
      throw new Error(`page-bench: only ${game.colonies.length} colonies can be woken near the start`);
    game.wakeSite({ ...next, rx: next.rx, ry: next.ry });
  }
}
const plane = /** @type {any} */ (game.world.plane);
const heap = () => {
  const gc = /** @type {any} */ (globalThis).gc;
  if (gc) gc();
  const m = process.memoryUsage();
  return (m.heapUsed + m.arrayBuffers) / 1048576;
};
const heap0 = heap();

const warm = Math.round(5 / DT);
const ms = [];
let missed = 0;
const steps = Math.round(seconds / DT);
for (let k = 0; k < steps; k++) {
  const before = plane.gen?.misses ?? 0;
  const a = performance.now();
  game.tick(DT);
  const took = performance.now() - a;
  if (k >= warm) {
    ms.push(took);
    missed += (plane.gen?.misses ?? 0) - before;
  }
}
const over = ms.filter((t) => t > 50).length;
const sorted = [...ms].sort((a, b) => a - b);
const q = (p) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))].toFixed(2);
const awake = game.colonies.filter((_, i) => !game.isFrozen(i)).length;
const chunks = world === "endless" ? `${plane.rock.count} rock, ${plane.food.count} food` : `${plane.rock.count} rock`;
const heap1 = heap();
const gced = Boolean(/** @type {any} */ (globalThis).gc);
console.log(
  `seed ${seed} ${world}: built in ${built.toFixed(0)} ms; ${game.colonies.length} colonies (${awake} awake, cap ${game.sleepRule?.params.cap ?? "none"}), ${ants} ants each, ${seconds} s: ` +
    `tick median ${q(0.5)} ms, p90 ${q(0.9)} ms, max ${sorted[sorted.length - 1].toFixed(1)} ms, ${over} of ${ms.length} ticks over 50 ms; ` +
    `${missed} chunks made on a miss in the ticks; chunks held ${chunks}; heap + buffers ${heap0.toFixed(0)} MB at the start, ${heap1.toFixed(0)} MB at the end${gced ? " (after gc)" : " (no gc: run with --expose-gc)"}`,
);
if (!process.argv.includes("--no-save")) {
  const a = performance.now();
  const json = JSON.stringify(game.save());
  const took = performance.now() - a;
  const gz = gzipSync(json).length;
  console.log(
    `  a save: ${(json.length / 1048576).toFixed(1)} MB as JSON (${(gz / 1048576).toFixed(1)} MB gzipped), made in ${took.toFixed(0)} ms`,
  );
}
