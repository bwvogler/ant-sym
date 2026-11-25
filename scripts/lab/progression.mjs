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
//          [--grant knots,...] [--sun 4] [--flow] [--price 3,1.38] [--split] [--traffic] [--hungry]
//          [--bias count|levels] [--radius 3] [--tropism N] [--no-foci]
// The flower patches are behind the Foci upgrade (fungus.ts fociGate, on by default since 2026-11-25, PRD §92, docs/foci.md): until
// it is kept no flower becomes a patch. The default --order ends knots,foci (arm C, the late order); an --order without them forms no flower (arm E). --no-foci runs the ungated game (flowers as before). --bias, --radius and --tropism set the tips' traffic lean (fungus.ts trafficBias, trafficRadius, trafficTropism, PRD §88, ja-ogph.3): bias count (more ants within --radius cells of a side), levels (the higher level of occupied cells) or off; tropism N (a growing tip leans toward ants on every N-th cell, 0 never). Unset, the fungus's own defaults (count, 3, 4 since 2026-11-23).
// --traffic only reads (the game is the same bit for bit): every 5 s it samples the ants' occupancy round each hypha tip on
// the plane, for docs/hyphal-traffic.md (ja-ogph.2, PRD §88): the share of cells occupied in three distance bands (1, 2-3, 4-6),
// how often the two cells a tip could turn into differ in the ants round them, and the share of hyphae near ant traffic.
// --split reports where the growth that mutations come from was made: the mycelium on the ground, corpses, and hosts (PRD §85 M3).
// --grant gives the named upgrades' first levels at landing, paid with mutations granted for them (ja-2bw.9: a
// worst-case "bought at once" that the order can't force, since a cheaper upgrade is bought while one waits).
// --landing R sets the landing's radius for the first spores and the patch alike (game.ts LANDING.radius, 1 by default: a hex and its six neighbours, 7 cells, PRD §85; 2 is the old landing, 19 cells); --root-radius R only the patch's (the base cells and the first tips), the spores still painted at 2.
// --price base,ratio sets the one price every level costs, round(base · ratio^kept) (evolution.ts PRICE, ja-52ui).
// --hungry: the fungus is hungry (FungusParams.hungry, PRD §93): a cheap spore, a landing reserve, the free pool's higher share.
// --lichen only reads (the game is the same bit for bit; ja-vlla.11.2, docs/lichen.md, PRD §90): every 5 s it counts the plane's rock cells
// beside a hypha cell (the cells an alga film or a wild lichen would sit on, so the chance a hypha meets one), the first time
// a hypha touched rock, and mutations earned a minute in the last three minutes (the light-income runaway gate, L2).
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
// Knots and Foci last (owner 2026-11-25, PRD §92): the flower patches need Foci, so the default arm buys it once the rest has been bought.
const DEFAULT_ORDER =
  "mycelium,infectivity,persistence,infectivity,fruiting,recognition,trails,stealth,senses,mycelium,persistence,evasion,infectivity,recognition,trails,royal,fruiting,evasion,royal,stealth,knots,foci";

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
    hungry: flag("hungry"),
    price: opt("price", null),
    landing: opt("landing", null) === null ? null : Number(opt("landing", null)),
    rootRadius: opt("root-radius", null) === null ? null : Number(opt("root-radius", null)),
    split: flag("split"),
    trace: flag("trace"),
    traffic: flag("traffic"),
    lichen: flag("lichen"),
    ledger: flag("ledger"),
    sporeCost: opt("spore-cost", null),
    earnedShare: opt("earned-share", null),
    freeBudget: opt("free-budget", null),
    bias: opt("bias", null),
    radius: opt("radius", null) === null ? null : Number(opt("radius", null)),
    tropism: opt("tropism", null) === null ? null : Number(opt("tropism", null)),
    noFoci: flag("no-foci"),
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
    `one world${job.hyphae ? ", hyphae" : ""}${job.growth ? " (growth answers)" : ""}${job.flow ? ", mass flow" : ""}${job.bias === null && job.radius === null && job.tropism === null ? "" : `, traffic bias ${job.bias ?? "default"} r ${job.radius ?? "default"} tropism ${job.tropism ?? "default"}`}${job.sun === null ? "" : `, sun ×${job.sun}`}${job.price ? `, price ${job.price}` : ""}${job.landing !== null ? `, landing radius ${job.landing}` : ""}${job.rootRadius !== null ? `, patch radius ${job.rootRadius}` : ""}, aim ${job.aim}, ${job.evolve ? `evolving (${job.buy ? "buys" : "buys nothing"})` : "as listed"}, ${job.strain}, ${job.seconds} s`,
  );
  for (const r of results) {
    console.log(
      `seed ${r.seed}: first host ${fmt(r.first)}, quarter ${fmt(r.quarter)}, half ${fmt(r.half)}, queen ${fmt(r.queen)}, rival's first ${fmt(r.rivalFirst)} · mutations earned ${r.earned} (growth ${r.growth}), kept ${r.spent}, mycelium ${r.mass}, patches ${r.patches} (flowers ${r.flowers}, spread ${r.spread}, mat cells ${r.mat}), first flower ${fmt(r.flowerFirst)} · hyphae ${r.cells} cells, spores on ${r.spores} cells · traffic leans ${r.leans}${r.lichenCells ? ` · lichen ${r.lichenCells} cells, first ${fmt(r.lichenFirst)}` : ""}`,
    );
    if (r.traffic) for (const [name, t] of Object.entries(r.traffic)) if (t) console.log(trafficLine(name, t));
    if (job.split)
      console.log(
        `  growth made: ground ${r.split.ground.toFixed(0)} · corpses ${r.split.corpses.toFixed(0)} · hosts ${r.split.hosts.toFixed(0)}`,
      );
    if (r.bought.length) console.log(`  bought: ${r.bought.join(" · ")}`);
    if (r.trace?.length) console.log(`  trace: ${r.trace.join(" · ")}`);
    if (r.ledger) for (const line of r.ledger) console.log(line);
    if (r.lichen)
      console.log(
        `  lichen probe: rock cells touched ${r.lichen.touched} (of ${r.lichen.edge} rock cells beside open ground), first touch ${fmt(r.lichen.first)}, mutations a minute in the last 3 min ${r.lichen.lateRate.toFixed(1)}`,
      );
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
  const {
    seed,
    seconds,
    aim,
    evolve,
    buy,
    order,
    strain,
    hyphae,
    growth,
    grant,
    sun,
    flow,
    hungry,
    price,
    landing,
    rootRadius,
    split: wantSplit,
    trace,
    traffic: wantTraffic,
    bias,
    radius,
    tropism,
    noFoci,
  } = workerData;
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
      fungus: {
        hyphae,
        flow,
        ...(hungry ? { hungry } : {}),
        ...(sun === null ? {} : { sun }),
        ...(bias === null ? {} : { trafficBias: bias }),
        ...(radius === null ? {} : { trafficRadius: radius }),
        ...(tropism === null ? {} : { trafficTropism: tropism }),
        ...(noFoci ? { fociGate: false } : {}),
      },
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
  if (wantSplit && g.fungus.evolution) {
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
  // --spore-cost C and --free-budget K: lab overrides of BODY.sporeCost (the mass a spore costs) and BODY.freeBudget (the most
  // mass the free term pays out in a game, a stand-in for a start reserve), to test a cheap spore on a small earned income
  // (ja-a2no, docs/energy.md §7). Absent: the game as it is.
  if (workerData.earnedShare !== null) {
    // --earned-share S: the free pool's share of earned mass when hungry (EARNED.share), a lab override (PRD §93).
    const { EARNED } = await import("../../web/src/colony/evolution.ts");
    EARNED.share = Number(workerData.earnedShare);
  }
  if (workerData.sporeCost !== null || workerData.freeBudget !== null) {
    const { BODY } = await import("../../web/src/colony/evolution.ts");
    if (workerData.sporeCost !== null) BODY.sporeCost = Number(workerData.sporeCost);
    if (workerData.freeBudget !== null) BODY.freeBudget = Number(workerData.freeBudget);
  }
  const { MUTATION, pathTo, poolOf } = await import("../../web/src/colony/evolution.ts");
  // A granted level comes with what it needs (the tree, ja-52ui): each is paid for at the price then, from its own pool (PRD §85 M3).
  for (const id of grant) {
    const e = g.fungus.evolution;
    if (!e || e.cost(id) === null) continue;
    for (const x of pathTo(e.save().levels, id)) {
      const made = e.cost(x) / MUTATION;
      e.growth += made;
      if (poolOf(x) === "free") e.ground += made;
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
    spread: 0,
    patches: 0,
    mat: 0,
    cells: 0,
    spores: 0,
    leans: "",
    lichenCells: 0,
    lichenFirst: -1,
    flowerFirst: -1,
    split,
    trace: [],
  };
  let seen = [0, 0];
  const share = (c) => {
    const f = g.fungus.census(c);
    return {
      s: f.living ? f.infected / f.living : 0,
      n: f.infected,
      resist: f.meanResist,
    };
  };
  const probe = wantTraffic ? await trafficProbe(g) : null;
  const lichen = workerData.lichen ? await lichenProbe(g, seconds) : null;
  // --ledger (ja-a2no.2): reads only. The mass made by source and spent by sink, and what the mycelium holds, at these times.
  const marks = [120, 300, 600, seconds].filter((t, i, a) => t <= seconds && a.indexOf(t) === i);
  r.ledger = [];
  const queue = [...order];
  for (let k = 0; g.time < seconds; k++) {
    g.tick(DT);
    if (probe && k % 150 === 0) probe.sample(r.quarter >= 0);
    if (lichen && k % 150 === 0) lichen.sample();
    if (workerData.ledger && marks.length && g.time >= marks[0]) r.ledger.push(ledgerLine(g, marks.shift()));
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
    if (trace && (g.fungus.spread !== seen[0] || g.fungus.flowers !== seen[1])) {
      seen = [g.fungus.spread, g.fungus.flowers];
      r.trace.push(
        `${g.time.toFixed(1)}s spread ${seen[0]} flowers ${seen[1]} base ${g.fungus.patchOn(0).length / 2} hyphae ${g.fungus.hyphaeOn(0)?.parent.size}`,
      );
    }
    if (k % 15) continue;
    const t = Math.round(g.time);
    const [a, b] = g.colonies.map(share);
    if (r.first < 0 && a.n > 0) r.first = t;
    if (r.quarter < 0 && a.s >= 0.25) r.quarter = t;
    if (r.half < 0 && a.s >= 0.5) r.half = t;
    if (r.queen < 0 && g.revealed[0]) r.queen = t;
    // The first closed flower, counting one that extended a patch (docs/foci.md): when the web first made a new base.
    if (r.flowerFirst < 0 && g.fungus.flowers + g.fungus.spread > 0) r.flowerFirst = t;
    if (r.rivalFirst < 0 && b && b.n > 0) r.rivalFirst = t;
    if (k % (30 * 60) === 0 && k > 0) r.minutes.push(`${Math.round(100 * a.s)}/${a.resist.toFixed(2)}`);
  }
  if (workerData.ledger) while (marks.length) r.ledger.push(ledgerLine(g, marks.shift()));
  r.earned = Math.round(g.fungus.evolution?.earned ?? 0);
  r.spent = g.fungus.evolution?.spent ?? 0;
  r.growth = Math.round(g.fungus.evolution?.growth ?? 0);
  r.mass = (g.fungus.evolution?.mass ?? 0).toFixed(1);
  r.flowers = g.fungus.flowers;
  r.spread = g.fungus.spread;
  r.patches = g.fungus.evolution?.patches ?? 0;
  r.mat = g.fungus.hyphaeOn(0)?.mat.size ?? 0;
  // How much mycelium and how many cells with spores the game ended with (ja-kura): every layer's hyphae, and Fungus.sporeCells (a total over layers).
  for (let l = 0; l < g.layers.length; l++) r.cells += g.fungus.hyphaeOn(l)?.parent.size ?? 0;
  r.spores = g.fungus.sporeCells;
  r.leans = `${g.fungus.hyphaeOn(0)?.trafficLeans ?? 0} of ${g.fungus.hyphaeOn(0)?.sideChoices ?? 0} side choices; tropisms ${g.fungus.hyphaeOn(0)?.tropisms ?? 0} of ${g.fungus.hyphaeOn(0)?.tropismChoices ?? 0} grow steps`;
  r.lichenCells = g.fungus.lichenCells().size;
  r.lichenFirst = g.fungus.lichenFirst === null ? -1 : Math.round(g.fungus.lichenFirst);
  if (probe) r.traffic = probe.result();
  if (lichen) r.lichen = lichen.result();
  parentPort.postMessage(r);
}

/** One ledger line (--ledger): where the mass came from and went, and what the mycelium holds now. Reads only. */
function ledgerLine(g, at) {
  const e = g.fungus.evolution;
  const h = g.fungus.hyphaeOn(0);
  const l = e?.ledger ?? {
    free: 0,
    corpse: 0,
    spores: 0,
    cut: 0,
    knot: 0,
  };
  const n = (x) => Math.round(x);
  return `  ledger @${at} s: made free ${n(l.free)} corpse ${n(l.corpse)} · spent spores ${n(l.spores)} cuts ${n(l.cut)} knots ${n(l.knot)} · mass ${n(e?.mass ?? 0)} · hyphae ${h?.length ?? 0} cells, ${h?.tips.length ?? 0} tips`;
}

function fmt(t) {
  return t < 0 ? "never" : `${t} s`;
}

/** The probe's one line per seed (trafficProbe's result). */
function trafficLine(name, t) {
  const pc = (x) => `${(100 * x).toFixed(1)}%`;
  const bands = ["1", "2-3", "4-6"];
  return (
    `  traffic ${name} a quarter: ${t.tipSamples} tip samples over ${t.samples} samples · cells occupied by band ${bands.map((b, i) => `${b} ${pc(t.occupied[i])}`).join(", ")}` +
    ` · tips with none in band ${bands.map((b, i) => `${b} ${pc(t.empty[i])}`).join(", ")}` +
    ` · tips by occupied share of band 2-3, none / to 4% (one cell) / to 10% / more: ${t.levels.map(pc).join(" / ")}` +
    ` · sides differ within r 1 ${pc(t.differ[0])}, 2 ${pc(t.differ[1])}, 3 ${pc(t.differ[2])}` +
    ` · hyphae within r cells of an ant in the last 60 s, r 1 ${pc(t.near[0])}, 2 ${pc(t.near[1])}, 3 ${pc(t.near[2])}`
  );
}

/**
 * The traffic probe (ja-ogph.2): reads the game's ants and the plane's hyphae, changes nothing. `sample()` is called every 5 s
 * of game time; `result()` has the means over the samples taken while the plane had tips.
 */
async function trafficProbe(g) {
  const { CountGrid, occupancy } = await import("../../web/src/colony/battle.ts");
  const { cellKey, keyCell, hexDistance, nx, ny, discOffsets } = await import("../../web/src/colony/hex.ts");
  const { inBounds } = await import("../../web/src/colony/world.ts");
  const grids = g.colonies.map(() => new CountGrid());
  const bounds = g.colonies[0].layers[0].map;
  const inside = (x, y) => inBounds(bounds, x, y);
  const BANDS = [
    [1, 1],
    [2, 3],
    [4, 6],
  ];
  const count = (x, y) => grids.reduce((n, gr) => n + gr.get(x, y), 0);
  const recent = new Map();
  const make = () => ({
    samples: 0,
    tipSamples: 0,
    occ: [0, 0, 0],
    empty: [0, 0, 0],
    levels: [0, 0, 0, 0],
    sides: 0,
    differ: [0, 0, 0],
    near: [0, 0, 0],
    nearN: 0,
  });
  const phases = { before: make(), after: make() };
  let acc = phases.before;
  /** ants within r cells of (x, y), over every colony */
  const within = (x, y, r) => {
    const o = discOffsets(r)[y & 1];
    let n = 0;
    for (let k = 0; k < o.length; k += 2) if (inside(x + o[k], y + o[k + 1])) n += count(x + o[k], y + o[k + 1]);
    return n;
  };
  return {
    /** `after`: a quarter of the colony is infected (the progression's chapter), so the samples go to the second set */
    sample(after = false) {
      acc = after ? phases.after : phases.before;
      const h = g.fungus.hyphaeOn(0);
      if (!h || h.tips.length === 0) return;
      g.colonies.forEach((c, k) => occupancy(c, grids[k], 0));
      for (const gr of grids) {
        const st = gr.saveState();
        for (let k = 0; k < st.length; k += 3) recent.set(cellKey(st[k], st[k + 1]), g.time);
      }
      acc.samples++;
      const o = discOffsets(6);
      for (const t of h.tips) {
        acc.tipSamples++;
        const cells = [0, 0, 0];
        const occ = [0, 0, 0];
        const off = o[t.y & 1];
        for (let k = 0; k < off.length; k += 2) {
          const x = t.x + off[k];
          const y = t.y + off[k + 1];
          const d = hexDistance(t.x, t.y, x, y);
          const b = BANDS.findIndex(([lo, hi]) => d >= lo && d <= hi);
          if (b < 0 || !inside(x, y)) continue;
          cells[b]++;
          if (count(x, y) > 0) occ[b]++;
        }
        for (let b = 0; b < 3; b++) {
          const f = cells[b] ? occ[b] / cells[b] : 0;
          acc.occ[b] += f;
          if (occ[b] === 0) acc.empty[b]++;
          if (b === 1) acc.levels[f === 0 ? 0 : f <= 0.04 ? 1 : f <= 0.1 ? 2 : 3]++;
        }
        const sides = [-1, 1].map((d) => {
          const hd = (((t.heading + d) % 6) + 6) % 6;
          return [nx(t.x, t.y, hd), ny(t.y, hd)];
        });
        if (sides.every(([x, y]) => inside(x, y))) {
          acc.sides++;
          for (let r = 1; r <= 3; r++) if (within(...sides[0], r) !== within(...sides[1], r)) acc.differ[r - 1]++;
        }
      }
      // The share of hyphae within r cells (1, 2, 3) of a cell an ant stood on in the last 60 s.
      let hy = 0;
      const near = [0, 0, 0];
      const o3 = discOffsets(3);
      for (const key of h.parent.keys()) {
        const [x, y] = keyCell(key);
        hy++;
        const off = o3[y & 1];
        let least = 4;
        for (let k = 0; k < off.length; k += 2) {
          const seen = recent.get(cellKey(x + off[k], y + off[k + 1]));
          if (seen !== undefined && g.time - seen <= 60) least = Math.min(least, hexDistance(x, y, x + off[k], y + off[k + 1]));
        }
        for (let r = 1; r <= 3; r++) if (least <= r) near[r - 1]++;
      }
      if (hy) {
        for (let r = 0; r < 3; r++) acc.near[r] += near[r] / hy;
        acc.nearN++;
      }
    },
    result() {
      const one = (acc) => {
        if (acc.samples === 0) return null;
        const n = acc.tipSamples || 1;
        return {
          samples: acc.samples,
          tipSamples: acc.tipSamples,
          occupied: acc.occ.map((v) => v / n),
          empty: acc.empty.map((v) => v / n),
          levels: acc.levels.map((v) => v / n),
          differ: acc.differ.map((v) => v / (acc.sides || 1)),
          near: acc.near.map((v) => v / (acc.nearN || 1)),
        };
      };
      return { before: one(phases.before), after: one(phases.after) };
    },
  };
}

/**
 * The lichen probe (`--lichen`, ja-vlla.11.2): reads only. Which of the plane's rock cells a hypha cell has lain beside (an
 * alga film or a wild lichen would sit on such a cell, docs/lichen.md §1), when the first was, and the mutations earned a
 * minute over the game's last three minutes. It samples every 5 s, so "first touch" has that resolution and a shorter contact is
 * missed. The edge count is rock beside OPEN cells and the touched count rock beside any hypha cell: equal only while hyphae lie
 * on open ground (the plane's topsoil is read as open). `inBounds` holds on this finite plane; on an endless one (ja-vlla.11.10)
 * `touched` could exceed `edge`, so bound it first.
 */
async function lichenProbe(g, seconds) {
  const { rockAt, inBounds, OPEN, ROCK } = await import("../../web/src/colony/world.ts");
  const { keyCell, nx, ny } = await import("../../web/src/colony/hex.ts");
  const map = g.colonies[0].layers[0].map;
  const rock = (x, y) => inBounds(map, x, y) && rockAt(map, x, y) === ROCK;
  let edge = 0;
  for (let y = 0; y < map.size.h; y++)
    for (let x = map.x0; x < map.x0 + map.size.w; x++) {
      if (!rock(x, y)) continue;
      let open = false;
      for (let d = 0; d < 6 && !open; d++) {
        const [ax, ay] = [nx(x, y, d), ny(y, d)];
        open = inBounds(map, ax, ay) && rockAt(map, ax, ay) === OPEN;
      }
      if (open) edge++;
    }
  const touched = new Set();
  let first = -1;
  let lateFrom = null;
  return {
    sample() {
      const h = g.fungus.hyphaeOn(0);
      if (h)
        for (const k of h.parent.keys()) {
          const [x, y] = keyCell(k);
          for (let d = 0; d < 6; d++) {
            const [ax, ay] = [nx(x, y, d), ny(y, d)];
            if (!rock(ax, ay)) continue;
            touched.add(ax * 1e6 + ay);
            if (first < 0) first = Math.round(g.time);
          }
        }
      if (lateFrom === null && g.time >= seconds - 180) lateFrom = [g.time, g.fungus.evolution?.earned ?? 0];
    },
    result() {
      const late = lateFrom ? ((g.fungus.evolution?.earned ?? 0) - lateFrom[1]) / ((g.time - lateFrom[0]) / 60 || 1) : 0;
      return { touched: touched.size, edge, first, lateRate: late };
    },
  };
}
