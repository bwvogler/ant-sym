// Offline: how the fungus game paces (ja-lo8.12, PRD §50.12). The app's setup (one world, 600 + 600 ants, regrowth,
// gameRng(seed)), the landing by colony 0's hole, and the fungus policy from the page's shipped answers under a preset aim
// (web/public/precache/fungus-<aim>.json; a situation not shipped plays the strain's default, as on the page while Jev
// is asked). With --evolve the game's fungus starts weak and chooses upgrades as a player might: the first in the
// order it has the mutations for, as soon as it has them. Reports when each chapter is reached (first host, a quarter of the colony, the
// queen), each purchase, and the colony's infected share and resistance every minute. Seeds run in parallel.
//
// It plays one world as the page does (ui/useColony.ts buildGame: generateOneWorld, no auto-founding); the earlier PRD
// sections (§50.12–14) measured on the side world, which is gone. --hyphae grows the mycelium as
// hyphae (docs/hyphal-growth.md, ja-2bw.2). --growth plays the growth lane's shipped answers for the aim (public/precache/
// growth-<aim>.json, ja-2bw.5); a situation with none plays the tip's own rule, as on the page.
//
// Usage: node scripts/lab/progression.mjs [--seeds 1-3] [--seconds 900] [--aim unite|spread|peace] [--evolve]
//          [--order stealth,infectivity,...] [--strain garden] [--no-buy] [--hyphae] [--growth]
//          [--grant knots,...] [--sun 4] [--flow] [--price 3,1.38] [--split]
// --split reports where the growth that mutations come from was made: the mycelium on the ground, corpses, and hosts (PRD §85 M3).
// --grant gives the named upgrades' first levels at landing, paid with mutations granted for them (ja-2bw.9: a
// worst-case "bought at once" that the order can't force, since a cheaper upgrade is bought while one waits).
// --landing R sets the landing's radius for the first spores and the patch alike (game.ts LANDING.radius, 1 by default: a hex and its six neighbours, 7 cells, PRD §85; 2 is the old landing, 19 cells); --root-radius R only the patch's (the base cells and the first tips), the spores still painted at 2.
// --price base,ratio sets the one price every level costs, round(base · ratio^kept) (evolution.ts PRICE, ja-52ui).
// --sun sets how many times faster spores fade on one world's sunlit plane (FungusParams.sun, ja-6ip); unset, the default.
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
  "mycelium,infectivity,persistence,infectivity,fruiting,recognition,trails,stealth,senses,mycelium,persistence,evasion,infectivity,recognition,trails,royal,fruiting,evasion,royal,stealth";

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
    hyphae: flag("hyphae"),
    growth: flag("growth"),
    grant: opt("grant", "").split(",").filter(Boolean),
    sun: opt("sun", null) === null ? null : Number(opt("sun", null)),
    flow: flag("flow"),
    price: opt("price", null),
    landing: opt("landing", null) === null ? null : Number(opt("landing", null)),
    rootRadius: opt("root-radius", null) === null ? null : Number(opt("root-radius", null)),
    split: flag("split"),
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
      const w = new Worker(fileURLToPath(import.meta.url), {
        workerData: { ...job, seed },
        argv: [],
      });
      w.on("message", (r) => results.push(r));
      w.on("error", (e) => console.error(`seed ${seed}:`, e));
      w.on("exit", () => (running--, launch()));
    };
    for (let k = 0; k < width; k++) launch();
  });
  results.sort((x, y) => x.seed - y.seed);
  console.log(
    `one world${job.hyphae ? ", hyphae" : ""}${job.growth ? " (growth answers)" : ""}${job.flow ? ", mass flow" : ""}${job.sun === null ? "" : `, sun ×${job.sun}`}${job.price ? `, price ${job.price}` : ""}${job.landing !== null ? `, landing radius ${job.landing}` : ""}${job.rootRadius !== null ? `, patch radius ${job.rootRadius}` : ""}, aim ${job.aim}, ${job.evolve ? `evolving (${job.buy ? "buys" : "buys nothing"})` : "as listed"}, ${job.strain}, ${job.seconds} s`,
  );
  for (const r of results) {
    console.log(
      `seed ${r.seed}: first host ${fmt(r.first)}, quarter ${fmt(r.quarter)}, half ${fmt(r.half)}, queen ${fmt(r.queen)}, rival's first ${fmt(r.rivalFirst)} · mutations earned ${r.earned} (growth ${r.growth}), kept ${r.spent}, mycelium ${r.mass}, patches ${r.patches} (flowers ${r.flowers}, mat cells ${r.mat})`,
    );
    if (job.split)
      console.log(
        `  growth made: ground ${r.split.ground.toFixed(0)} · corpses ${r.split.corpses.toFixed(0)} · hosts ${r.split.hosts.toFixed(0)}`,
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
  const { generateOneWorld } = await import("../../web/src/colony/oneWorld.ts");
  const { seed, seconds, aim, evolve, buy, order, strain, hyphae, growth, grant, sun, flow, price, landing, rootRadius } = workerData;
  if (landing !== null) (await import("../../web/src/colony/game.ts")).LANDING.radius = landing;
  if (price) {
    const { PRICE } = await import("../../web/src/colony/evolution.ts");
    [PRICE.base, PRICE.ratio] = price.split(",").map(Number);
  }
  const answers = new Map(JSON.parse(readFileSync(new URL(`../../web/public/precache/fungus-${aim}.json`, import.meta.url), "utf8")));
  const g = new Game(
    generateOneWorld(seed),
    {
      regrow: GAME_REGROW,
      autoFound: false,
      fungus: { hyphae, flow, ...(sun === null ? {} : { sun }) },
    },
    gameRng(seed, 0),
    [{ antCount: 600 }, { antCount: 600 }],
  );
  const menu = g.fungus.menu;
  g.fungus.bindPolicy("fungus", (s) => answers.get(fungalKey(s, askedLevers(menu, s.task === "queen"))) ?? STRAIN_DEFAULT);
  if (growth) {
    const { growthKey } = await import("../../web/src/colony/growthBrain.ts");
    const grows = new Map(JSON.parse(readFileSync(new URL(`../../web/public/precache/growth-${aim}.json`, import.meta.url), "utf8")));
    g.fungus.bindPolicy("growth", (s) => grows.get(growthKey(s)) ?? null);
  }
  if (rootRadius !== null) {
    const root = g.fungus.root.bind(g.fungus);
    g.fungus.root = (x, y, _r, ...rest) => root(x, y, rootRadius, ...rest);
  }
  g.land(
    0,
    STRAINS.findIndex((s) => s.id === strain),
    { evolve },
  );
  // --split: where the growth that mutations come from was made (evolution.ts): the mycelium on the ground (grow), a corpse's
  // substance (feed), and load passed on in hosts (replicate). The three methods are wrapped on this game's evolution only.
  const split = { ground: 0, corpses: 0, hosts: 0 };
  if (job.split && g.fungus.evolution) {
    const e = g.fungus.evolution;
    const wrap = (name, key) => {
      const f = e[name].bind(e);
      e[name] = (...a) => {
        const before = e.growth;
        const out = f(...a);
        split[key] += e.growth - before;
        return out;
      };
    };
    wrap("grow", "ground");
    wrap("feed", "corpses");
    wrap("replicate", "hosts");
  }
  const { MUTATION, pathTo } = await import("../../web/src/colony/evolution.ts");
  // A granted level comes with what it needs (the tree, ja-52ui): each is paid for at the price then.
  for (const id of grant) {
    const e = g.fungus.evolution;
    if (!e || e.cost(id) === null) continue;
    for (const x of pathTo(e.save().levels, id)) {
      e.growth += e.cost(x) / MUTATION;
      g.fungus.upgrade(x);
    }
  }
  const DT = 1 / 30;
  const r = {
    seed,
    first: -1,
    quarter: -1,
    half: -1,
    queen: -1,
    rivalFirst: -1,
    bought: [],
    minutes: [],
    earned: 0,
    spent: 0,
    growth: 0,
    mass: 0,
    flowers: 0,
    patches: 0,
    mat: 0,
    split,
  };
  const share = (c) => {
    const f = g.fungus.census(c);
    return {
      s: f.living ? f.infected / f.living : 0,
      n: f.infected,
      resist: f.meanResist,
    };
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
    if (r.rivalFirst < 0 && b && b.n > 0) r.rivalFirst = t;
    if (k % (30 * 60) === 0 && k > 0) r.minutes.push(`${Math.round(100 * a.s)}/${a.resist.toFixed(2)}`);
  }
  r.earned = Math.round(g.fungus.evolution?.earned ?? 0);
  r.spent = g.fungus.evolution?.spent ?? 0;
  r.growth = Math.round(g.fungus.evolution?.growth ?? 0);
  r.mass = (g.fungus.evolution?.mass ?? 0).toFixed(1);
  r.flowers = g.fungus.flowers;
  r.patches = g.fungus.evolution?.patches ?? 0;
  r.mat = g.fungus.hyphaeOn(0)?.mat.size ?? 0;
  parentPort.postMessage(r);
}

function fmt(t) {
  return t < 0 ? "never" : `${t} s`;
}
