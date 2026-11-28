// Offline, no key, no spend: is unity reachable (PRD §53, ja-i0f; docs/one-world.md U6a)? Garden, the strain whose hosts
// carry its own odour, painted in both colonies at the start, by each royal chamber (on the curtain, where the nests are).
// Then the game runs as the page plays it (gameRng, regrowth on, no founding by itself) and
// this prints, per seed and size: the peak of Unity.met (the least colony's allied contact, a ~60 s fading share of its
// living ants; MET = 0.01 is whole), when the outcome first read "unified", the nests' odour gap and the quiet at the end,
// and where the allied contact happened: sampled each second, ants in allied contact (an ant of another colony whose
// nest odour its own odour is within tolerance of, in its cell or the six around, on its layer: Game.#meet's rule) on the
// plane against the curtain.
//
// "alike at" is when the nests' odour gap first fell within the tolerance (Unity.alike): the odours' side of unity, which the fungus alone brings
// about and which does not wait on a meeting. --axes N plays a game of N odour axes (default the game's, 4; 1 is the scalar game before S2, PRD §91).
//
// Usage: node scripts/unity.mjs [--seeds 1-3] [--ants 300,600] [--seconds 600] [--jobs N] [--axes N]
//   One world (generateOneWorld(seed)) is the only game (S2.3d); --one is accepted and ignored. The side view this once
//   compared never unified (≤ 0.34 % met in 10 min, PRD §53).
import { availableParallelism } from "node:os";
import { isMainThread, parentPort, Worker, workerData } from "node:worker_threads";
import { helpAndExit } from "./lib/usage.mjs";
helpAndExit(import.meta.url);

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
  let seeds = [1, 2, 3];
  let ants = [300, 600];
  let seconds = 600;
  let jobs = availableParallelism();
  let axes = 0;
  for (let k = 0; k < args.length; k++) {
    const a = args[k];
    if (a === "--one") continue;
    else if (a === "--seeds") seeds = range(args[++k]);
    else if (a === "--ants") ants = args[++k].split(",").map(Number);
    else if (a === "--seconds") seconds = Number(args[++k]);
    else if (a === "--jobs") jobs = Number(args[++k]);
    else if (a === "--axes") axes = Number(args[++k]);
    else {
      console.error(`unknown argument ${a}`);
      process.exit(1);
    }
  }
  const queue = ants.flatMap((n) => seeds.map((seed) => ({ seed, ants: n, seconds, axes })));
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
  console.log(`Unity with Garden in both colonies, one world, ${seconds} s (MET = 1 % met is whole)\n`);
  console.log(
    `| ants | seed | peak met | met at end | alike at | unified at | gap at end | quiet at end | ants lost | allied contact: plane / curtain (ant-s) | wall |`,
  );
  console.log("|---|---|---|---|---|---|---|---|---|---|---|");
  for (const r of out)
    console.log(
      `| ${r.ants} + ${r.ants} | ${r.seed} | ${pct(r.peakMet)} at ${r.peakAt.toFixed(0)} s | ${pct(r.met)} | ${Number.isNaN(r.alikeAt) ? "never" : `${r.alikeAt.toFixed(0)} s`} | ${Number.isNaN(r.unifiedAt) ? "never" : `${r.unifiedAt.toFixed(0)} s`}${r.outcome === "unified" ? "" : ` (ends ${r.outcome})`} | ${r.gap.toFixed(3)} | ${r.quiet.toFixed(0)} s | ${r.deaths} | ${r.plane.toFixed(0)} / ${r.curtain.toFixed(0)} | ${r.wall.toFixed(0)} s |`,
    );
  console.error(`${out.length} runs in ${((performance.now() - t0) / 1000).toFixed(0)} s on ${jobs} threads`);
}

async function work() {
  const { seed, ants, seconds, axes } = workerData;
  const { CURTAIN } = await import("../web/src/colony/index.ts");
  const { STRAINS } = await import("../web/src/colony/index.ts");
  const { GAME_REGROW, Game, gameRng, odourDistance } = await import("../web/src/colony/index.ts");
  const { CELL, cellOf, discOffsets } = await import("../web/src/colony/index.ts");
  const { generateOneWorld } = await import("../web/src/colony/index.ts");
  const t0 = performance.now();
  const game = new Game(
    generateOneWorld(seed),
    { regrow: GAME_REGROW, autoFound: false, ...(axes ? { recognition: { odourAxes: axes } } : {}) },
    gameRng(seed),
    [{ antCount: ants }, { antCount: ants }],
  );
  const garden = STRAINS.findIndex((s) => s.id === "garden");
  // By each royal chamber: the colony's nest on its home layer, the curtain.
  for (const c of game.colonies) {
    const nest = c.layers[CURTAIN].nest;
    game.paintSpores(nest.x, nest.y, nest.r + 2, 3, 0.3, garden, CURTAIN);
  }
  const DT = 1 / 30;
  const tol = game.recognition.params.tolerance;
  const ring = discOffsets(1);
  const contact = [0, 0];
  let peakMet = 0;
  let peakAt = 0;
  let unifiedAt = NaN;
  let alikeAt = NaN;
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
    if (Number.isNaN(alikeAt) && u.alike) alikeAt = game.time;
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
          if (met || di === ci || odourDistance(c.odourAxes, c.odour, i * c.odourAxes, d.nestVec, 0) > tol) return;
          for (let j = 0; j < o.length && !met; j += 2) if (occ[l][di].get((cy + o[j + 1]) * 65536 + cx + o[j])) met = true;
        });
        if (met) contact[l] += 1;
      }
    });
  }
  game.colonies.forEach((c, ci) => (deaths += c.losses - lost0[ci]));
  const u = game.unity();
  parentPort.postMessage({
    seed,
    ants,
    peakMet,
    peakAt,
    met: u.met,
    unifiedAt,
    alikeAt,
    outcome: game.outcome(),
    gap: u.gap,
    quiet: u.quiet,
    deaths,
    plane: contact[0],
    curtain: contact[1] ?? 0,
    wall: (performance.now() - t0) / 1000,
  });
}
