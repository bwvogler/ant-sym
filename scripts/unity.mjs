// Offline, no key, no spend: is unity reachable (PRD §53, ja-i0f; docs/one-world.md U6a)? Garden, the strain whose hosts
// carry its own odour, painted in both colonies at the start, by each royal chamber (in one world on the curtain, where
// the nests are; in the side view by its chamber). Then the game runs as the page plays it (gameRng, regrowth on) and
// this prints, per seed and size: the peak of Unity.met (the least colony's allied contact, a ~60 s fading share of its
// living ants; MET = 0.01 is whole), when the outcome first read "unified", the nests' odour gap and the quiet at the end,
// and where the allied contact happened: sampled each second, ants in allied contact (an ant of another colony whose
// nest odour its own odour is within tolerance of, in its cell or the six around, on its layer: Game.#meet's rule) on the
// plane against the curtain.
//
// Usage: node scripts/unity.mjs [--one] [--seeds 1-3] [--ants 300,600] [--seconds 600] [--jobs N]
//   --one: one world (generateOneWorld(seed)); without it the side view (generateSideWorld(seed)), which never unified
//   (≤ 0.34 % met in 10 min, PRD §53).
import { availableParallelism } from "node:os";
import { isMainThread, parentPort, Worker, workerData } from "node:worker_threads";

if (isMainThread) await main();
else await work();

function range(s) {
  return s.split(",").flatMap((part) => {
    const [a, b] = part.split("-").map(Number);
    return b === undefined ? [a] : Array.from({ length: b - a + 1 }, (_, i) => a + i);
  });
}

async function main() {
  const args = process.argv.slice(2);
  let one = false;
  let seeds = [1, 2, 3];
  let ants = [300, 600];
  let seconds = 600;
  let jobs = availableParallelism();
  for (let k = 0; k < args.length; k++) {
    const a = args[k];
    if (a === "--one") one = true;
    else if (a === "--seeds") seeds = range(args[++k]);
    else if (a === "--ants") ants = args[++k].split(",").map(Number);
    else if (a === "--seconds") seconds = Number(args[++k]);
    else if (a === "--jobs") jobs = Number(args[++k]);
    else {
      console.error(`unknown argument ${a}`);
      process.exit(1);
    }
  }
  const queue = ants.flatMap((n) => seeds.map((seed) => ({ one, seed, ants: n, seconds })));
  const out = [];
  const t0 = performance.now();
  await Promise.all(
    Array.from({ length: Math.max(1, Math.min(jobs, queue.length)) }, async () => {
      for (let job = queue.shift(); job; job = queue.shift()) {
        out.push(
          await new Promise((resolve, reject) => {
            const w = new Worker(new URL(import.meta.url), { workerData: job });
            w.once("message", resolve);
            w.once("error", reject);
          }),
        );
        process.stderr.write(`\r${out.length} runs, ${((performance.now() - t0) / 1000).toFixed(0)} s`);
      }
    }),
  );
  process.stderr.write("\n");
  out.sort((a, b) => a.ants - b.ants || a.seed - b.seed);
  const pct = (v) => `${(100 * v).toFixed(2)} %`;
  console.log(`Unity with Garden in both colonies, ${one ? "one world" : "the side view"}, ${seconds} s (MET = 1 % met is whole)\n`);
  console.log(`| ants | seed | peak met | met at end | unified at | gap at end | quiet at end | ants lost | allied contact${one ? ": plane / curtain" : ""} (ant-s) | wall |`);
  console.log("|---|---|---|---|---|---|---|---|---|---|");
  for (const r of out)
    console.log(
      `| ${r.ants} + ${r.ants} | ${r.seed} | ${pct(r.peakMet)} at ${r.peakAt.toFixed(0)} s | ${pct(r.met)} | ${Number.isNaN(r.unifiedAt) ? "never" : `${r.unifiedAt.toFixed(0)} s`}${r.outcome === "unified" ? "" : ` (ends ${r.outcome})`} | ${r.gap.toFixed(3)} | ${r.quiet.toFixed(0)} s | ${r.deaths} | ${r.plane.toFixed(0)}${one ? ` / ${r.curtain.toFixed(0)}` : ""} | ${r.wall.toFixed(0)} s |`,
    );
  console.error(`${out.length} runs in ${((performance.now() - t0) / 1000).toFixed(0)} s on ${jobs} threads`);
}

async function work() {
  const { one, seed, ants, seconds } = workerData;
  const { CURTAIN } = await import("../web/src/colony/colony.ts");
  const { STRAINS } = await import("../web/src/colony/fungus.ts");
  const { GAME_REGROW, Game, gameRng } = await import("../web/src/colony/game.ts");
  const { CELL, cellOf, discOffsets } = await import("../web/src/colony/hex.ts");
  const { generateOneWorld } = await import("../web/src/colony/oneWorld.ts");
  const { generateSideWorld } = await import("../web/src/colony/world.ts");
  const t0 = performance.now();
  const game = new Game(one ? generateOneWorld(seed) : generateSideWorld(seed), { antCount: ants, rivalAnts: ants, regrow: GAME_REGROW }, gameRng(seed));
  const garden = STRAINS.findIndex((s) => s.id === "garden");
  // By each royal chamber: the colony's nest on its home layer (one world: the curtain).
  for (const c of game.colonies) {
    const nest = one ? c.layers[CURTAIN].nest : c.nest;
    game.paintSpores(nest.x, nest.y, nest.r + 2, 3, 0.3, garden, one ? CURTAIN : 0);
  }
  const DT = 1 / 30;
  const tol = game.recognition.params.tolerance;
  const ring = discOffsets(1);
  const contact = [0, 0];
  let peakMet = 0;
  let peakAt = 0;
  let unifiedAt = NaN;
  let deaths = 0;
  const lost0 = game.colonies.map((c) => c.losses);
  for (let k = 1; k <= Math.round(seconds / DT); k++) {
    game.tick(DT);
    if (k % 30 !== 0) continue;
    const u = game.unity();
    if (u.met > peakMet) {
      peakMet = u.met;
      peakAt = game.time;
    }
    if (Number.isNaN(unifiedAt) && game.outcome() === "unified") unifiedAt = game.time;
    // Allied contact per layer, as Game.#meet counts it: cells occupied per layer and colony, then each ant's ring.
    const occ = game.layers.map(() => game.colonies.map(() => new Map()));
    const layerOf = (c, i) => (game.layers.length > 1 ? c.layer[i] : 0);
    game.colonies.forEach((c, ci) => {
      for (let i = 0; i < c.n; i++) {
        if (!c.alive[i]) continue;
        cellOf(c.x[i], c.y[i]);
        const key = CELL[1] * 65536 + CELL[0];
        const m = occ[layerOf(c, i)][ci];
        m.set(key, (m.get(key) ?? 0) + 1);
      }
    });
    game.colonies.forEach((c, ci) => {
      for (let i = 0; i < c.n; i++) {
        if (!c.alive[i]) continue;
        const l = layerOf(c, i);
        cellOf(c.x[i], c.y[i]);
        const cx = CELL[0];
        const cy = CELL[1];
        const o = ring[cy & 1];
        let met = false;
        game.colonies.forEach((d, di) => {
          if (met || di === ci || Math.abs(c.odour[i] - d.nestOdour) > tol) return;
          for (let j = 0; j < o.length && !met; j += 2) if (occ[l][di].get((cy + o[j + 1]) * 65536 + cx + o[j])) met = true;
        });
        if (met) contact[l] += 1;
      }
    });
  }
  game.colonies.forEach((c, ci) => (deaths += c.losses - lost0[ci]));
  const u = game.unity();
  parentPort.postMessage({ seed, ants, peakMet, peakAt, met: u.met, unifiedAt, outcome: game.outcome(), gap: u.gap, quiet: u.quiet, deaths, plane: contact[0], curtain: contact[1] ?? 0, wall: (performance.now() - t0) / 1000 });
}
