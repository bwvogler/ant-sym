// Offline: how the fungus game paces (ja-lo8.12, PRD §50.12). The app's setup (side world, 600 + 600 ants, regrowth,
// gameRng(seed)), the landing by colony 0's hole, and the fungus policy from the page's shipped answers under a preset aim
// (web/public/precache/fungus-<aim>.json; a situation not shipped plays the strain's default, as on the page while Jev
// is asked). With --evolve the game's fungus starts weak and chooses upgrades as a player might: the first in the
// order it has the mutations for, as soon as it has them. Reports when each chapter is reached (first host, a quarter of the colony, the
// queen), each purchase, and the colony's infected share and resistance every minute. Seeds run in parallel.
//
// --map one plays one world as the page does (ui/useColony.ts buildGame: generateOneWorld, no auto-founding); the
// default, side, is the side world the earlier PRD sections (§50.12–14) measured on. --hyphae grows the mycelium as
// hyphae (docs/hyphal-growth.md, ja-2bw.2). --growth plays the growth lane's shipped answers for the aim (public/precache/
// growth-<aim>.json, ja-2bw.5); a situation with none plays the tip's own rule, as on the page.
//
// Usage: node scripts/lab/progression.mjs [--seeds 1-3] [--seconds 900] [--aim unite|spread|peace] [--evolve]
//          [--order stealth,infectivity,...] [--strain garden] [--no-buy] [--map side|one] [--hyphae] [--growth]
import { readFileSync } from "node:fs";
import { availableParallelism } from "node:os";
import { fileURLToPath } from "node:url";
import { Worker, isMainThread, parentPort, workerData } from "node:worker_threads";

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const k = args.indexOf(`--${name}`);
  return k < 0 ? fallback : args[k + 1];
};
const flag = (name) => args.includes(`--${name}`);
const DEFAULT_ORDER =
  "mycelium,infectivity,persistence,infectivity,fruiting,recognition,trails,stealth,senses,mycelium,persistence,infectivity,evasion,recognition,trails,royal,fruiting,evasion,royal,stealth";

if (isMainThread) {
  const [a, b = a] = opt("seeds", "1-3").split("-").map(Number);
  const seeds = Array.from({ length: b - a + 1 }, (_, k) => a + k);
  const job = {
    seconds: Number(opt("seconds", 900)),
    aim: opt("aim", "unite"),
    evolve: flag("evolve"),
    buy: !flag("no-buy"),
    order: opt("order", DEFAULT_ORDER).split(","),
    strain: opt("strain", "garden"),
    map: opt("map", "side"),
    hyphae: flag("hyphae"),
    growth: flag("growth"),
  };
  const width = Math.min(seeds.length, Math.max(1, availableParallelism() - 1));
  const results = [];
  let next = 0;
  await new Promise((done) => {
    let running = 0;
    const launch = () => {
      if (next >= seeds.length) return running === 0 && done();
      const seed = seeds[next++];
      running++;
      const w = new Worker(fileURLToPath(import.meta.url), { workerData: { ...job, seed }, argv: [] });
      w.on("message", (r) => results.push(r));
      w.on("error", (e) => console.error(`seed ${seed}:`, e));
      w.on("exit", () => (running--, launch()));
    };
    for (let k = 0; k < width; k++) launch();
  });
  results.sort((x, y) => x.seed - y.seed);
  console.log(
    `${job.map === "one" ? "one world" : "side world"}${job.hyphae ? ", hyphae" : ""}${job.growth ? " (growth answers)" : ""}, aim ${job.aim}, ${job.evolve ? `evolving (${job.buy ? "buys" : "buys nothing"})` : "as listed"}, ${job.strain}, ${job.seconds} s`,
  );
  for (const r of results) {
    console.log(
      `seed ${r.seed}: first host ${fmt(r.first)}, quarter ${fmt(r.quarter)}, half ${fmt(r.half)}, queen ${fmt(r.queen)}, rival's first ${fmt(r.rival)} · mutations earned ${r.earned} (growth ${r.growth}), kept ${r.spent}, mycelium ${r.mass}`,
    );
    if (r.bought.length) console.log(`  bought: ${r.bought.join(" · ")}`);
    console.log(`  per minute (share%/resist): ${r.minutes.join("  ")}`);
  }
  const worst = (k) => (results.some((r) => r[k] < 0) ? "never (some seed)" : `${Math.max(...results.map((r) => r[k]))} s`);
  console.log(`worst seed: quarter ${worst("quarter")}, queen ${worst("queen")}`);
} else {
  const { Game, GAME_REGROW, gameRng } = await import("../../web/src/colony/game.ts");
  const { INFECTED, STRAINS, askedLevers } = await import("../../web/src/colony/fungus.ts");
  const { fungalKey } = await import("../../web/src/colony/fungusBrain.ts");
  const { STRAIN_DEFAULT } = await import("../../web/src/colony/fungalPolicy.ts");
  const { generateSideWorld } = await import("../../web/src/colony/world.ts");
  const { generateOneWorld } = await import("../../web/src/colony/oneWorld.ts");
  const { seed, seconds, aim, evolve, buy, order, strain, map, hyphae, growth } = workerData;
  const answers = new Map(JSON.parse(readFileSync(new URL(`../../web/public/precache/fungus-${aim}.json`, import.meta.url), "utf8")));
  const g =
    map === "one"
      ? new Game(
          generateOneWorld(seed),
          { antCount: 600, rivalAnts: 600, rival: true, regrow: GAME_REGROW, autoFound: false, fungus: { hyphae } },
          gameRng(seed, 0),
        )
      : new Game(generateSideWorld(seed), { antCount: 600, rivalAnts: 600, rival: true, regrow: GAME_REGROW }, gameRng(seed, 0));
  const menu = g.fungus.menu;
  g.fungus.bindPolicy("fungus", (s) => answers.get(fungalKey(s, askedLevers(menu, s.task === "queen"))) ?? STRAIN_DEFAULT);
  if (growth) {
    const { growthKey } = await import("../../web/src/colony/growthBrain.ts");
    const grows = new Map(JSON.parse(readFileSync(new URL(`../../web/public/precache/growth-${aim}.json`, import.meta.url), "utf8")));
    g.fungus.bindPolicy("growth", (s) => grows.get(growthKey(s)) ?? null);
  }
  g.land(
    0,
    STRAINS.findIndex((s) => s.id === strain),
    { evolve },
  );
  const DT = 1 / 30;
  const r = {
    seed,
    first: -1,
    quarter: -1,
    half: -1,
    queen: -1,
    rival: -1,
    bought: [],
    minutes: [],
    earned: 0,
    spent: 0,
    growth: 0,
    mass: 0,
  };
  const share = (c) => {
    const f = g.fungus.census(c);
    return { s: f.living ? f.infected / f.living : 0, n: f.infected, resist: f.meanResist };
  };
  const queue = [...order];
  for (let k = 0; g.time < seconds; k++) {
    g.tick(DT);
    const e = g.fungus.evolution;
    if (e && buy) {
      // The first upgrade in the order it can keep now, as a player would: one it can't yet afford doesn't hold up a cheaper one.
      for (let j = 0; j < queue.length; j++) {
        if (e.cost(queue[j]) === null) queue.splice(j--, 1);
        else if (g.fungus.upgrade(queue[j])) {
          r.bought.push(`${Math.round(g.time)}s ${queue.splice(j, 1)[0]}`);
          break;
        }
      }
    }
    if (k % 15) continue;
    const t = Math.round(g.time);
    const [a, b] = g.colonies.map(share);
    if (r.first < 0 && a.n > 0) r.first = t;
    if (r.quarter < 0 && a.s >= 0.25) r.quarter = t;
    if (r.half < 0 && a.s >= 0.5) r.half = t;
    if (r.queen < 0 && g.revealed[0]) r.queen = t;
    if (r.rival < 0 && b && b.n > 0) r.rival = t;
    if (k % (30 * 60) === 0 && k > 0) r.minutes.push(`${Math.round(100 * a.s)}/${a.resist.toFixed(2)}`);
  }
  r.earned = Math.round(g.fungus.evolution?.earned ?? 0);
  r.spent = g.fungus.evolution?.spent ?? 0;
  r.growth = Math.round(g.fungus.evolution?.growth ?? 0);
  r.mass = (g.fungus.evolution?.mass ?? 0).toFixed(1);
  parentPort.postMessage(r);
}

function fmt(t) {
  return t < 0 ? "never" : `${t} s`;
}
