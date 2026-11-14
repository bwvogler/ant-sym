// Offline, no key: the economy test's hour-long game (web/src/colony/tests/slow/economy.test.ts hour(): the tests' small
// side map, 256 × 160, ground 40 rows down, 0.3 of the map's food, one colony of 110, seeded world × 7919 + nudge) run
// on many worlds and nudges, with colony params overridden. Written for ja-rvli and ja-097s (2026-11-14): the test checks
// two games; this runs sixteen (worlds 1-4 × nudges 0-3) and shows the spread, including collapses the test can't see.
//
// Summary (default): one line per game and a last line over all of them.
//   stranded  the most larvae at once unfed for over two minutes while the chambers hold enough food for them (as the
//             test counts it: sampled each minute from 300 s), and when (at)
//   pop / births / hungry   workers alive at 3,600 s, births, workers dead of hunger
//   larder    food lying in the colony's chambers at 3,600 s
// Games run in parallel, one worker thread each, up to the machine's cores less one (about 70 s a game).
//
// Trace (`trace W:N`): one game, a line every `every` seconds: workers alive, how many are old (band 2), out on the
// ground, mean energy, hungry (energy below 0.4), mean felt need, larvae and those waiting, the larder, deaths of hunger,
// starved brood, and each chamber's food/brood by role; then where each worker that died of hunger was when it died
// (out, tunnel, or its chamber's role).
//
// Usage (arguments in this order, each optional; any may also be written name=value, e.g. root=../other):
//   node scripts/lab/hour-probe.mjs [games] [params] [root]
//   node scripts/lab/hour-probe.mjs trace [game] [params] [every] [root]
//   games: worlds × nudges as ranges or lists (default 1-4x0-3; 3x1, 1,3x0-1). game: W:N (default 3:1). params: JSON
//   given to the colony's params (default {}; e.g. '{"owedBeg":0.3}'). every: seconds between trace lines (default
//   300). root: the checkout to measure (default this script's; its web/src/colony is imported, so the same probe
//   measures before and after a change; give the other checkout its own `npm --prefix web ci`).
//   A game that fails (an older root missing an export, say) is named on stderr and counted on the last line, and the
//   run exits 1.
//
// Measured with it (ja-097s): before #201 (64d4b62) peaks 0 0 3 6 0 0 1 2 5 19 6 2 11 9 2 4, nobody starved; after
// (74a3d82) 0 0 0 0 0 0 9 1 0 83 0 2 5 9 2 4, world 3 nudge 1 collapsing (26 starved, population 41, 246 food stored).
import { availableParallelism } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Worker, isMainThread, parentPort, workerData } from "node:worker_threads";

const HERE = fileURLToPath(import.meta.url);
const list = (s) =>
  s.split(",").flatMap((p) => {
    const [a, b = a] = p.split("-").map(Number);
    return Array.from({ length: b - a + 1 }, (_, k) => a + k);
  });

/** Arguments by position, in `names`' order, unless written name=value. */
function named(args, names) {
  const out = {};
  let k = 0;
  for (const arg of args) {
    const m = /^([a-z]+)=(.*)$/s.exec(arg);
    if (m && names.includes(m[1])) out[m[1]] = m[2];
    else out[names[k++]] = arg;
  }
  return out;
}

/** Load the colony modules from a checkout's root. */
async function colony(root) {
  const at = (f) => pathToFileURL(resolve(root, "web/src/colony", f)).href;
  const [{ Game }, { generateSideWorld, mulberry32 }, brood, hex] = await Promise.all(
    [at("game.ts"), at("world.ts"), at("brood.ts"), at("hex.ts")].map((u) => import(u)),
  );
  return { Game, generateSideWorld, mulberry32, LARVA: brood.LARVA, LARVA_FOOD: brood.LARVA_FOOD, isFed: brood.isFed, CELL: hex.CELL };
}

/** economy.test's hour() setup: the game, before any tick. */
function setup(m, w, nudge, params) {
  const map = m.generateSideWorld(w, { size: { w: 256, h: 160 }, nestGap: 120, surface: 40, nestCount: 1 });
  let total = 0;
  for (let y = 0; y < map.size.h; y++)
    for (let x = 0; x < map.size.w; x++) {
      const v = map.food.get(x, y) * 0.3;
      map.food.set(x, y, v);
      total += v;
    }
  map.foodTotal = map.foodLeft = total;
  // Through the constructor, so what the colony reads while it is built (maxAnts, antCount, channels…) takes them too.
  return new m.Game(map, { antCount: 110, rival: false }, m.mulberry32(w * 7919 + nudge), { colony: params });
}

/** Larvae unfed over two minutes, as economy.test counts them. */
const waitingOf = (m, c) => c.brood.items.filter((b) => b.stage === m.LARVA && b.t > 120 && !m.isFed(b)).length;

async function oneGame({ root, w, nudge, params }) {
  const m = await colony(root);
  const g = setup(m, w, nudge, params);
  const c = g.player;
  let stranded = 0;
  let at = 0;
  for (let k = 1; k <= 30 * 3600; k++) {
    g.tick(1 / 30);
    if (k % (30 * 60) || k < 30 * 300) continue;
    const waiting = waitingOf(m, c);
    if (c.larder >= waiting * m.LARVA_FOOD && waiting > stranded) {
      stranded = waiting;
      at = Math.round(g.time);
    }
  }
  return { w, nudge, stranded, at, pop: c.population, births: c.births, hungry: c.diedHungry, larder: Math.round(c.larder) };
}

async function trace(root, w, nudge, params, every) {
  const m = await colony(root);
  const g = setup(m, w, nudge, params);
  const c = g.player;
  const chs = c.map.chambers;
  const placeOf = (i) => {
    c.antCell(i);
    const id = chs.at(m.CELL[0], m.CELL[1]);
    return !c.under[i] ? "out" : id >= 0 ? chs.list[id].role : "tunnel";
  };
  const died = {};
  const last = new Array(c.n);
  const lastE = new Float32Array(c.n);
  for (let k = 1; k <= 30 * 3600; k++) {
    for (let i = 0; i < c.n; i++)
      if (c.alive[i]) {
        last[i] = placeOf(i);
        lastE[i] = c.energy[i];
      }
    const before = c.diedHungry;
    const alive = Uint8Array.from(c.alive);
    g.tick(1 / 30);
    if (c.diedHungry > before)
      for (let i = 0; i < c.n; i++) if (alive[i] && !c.alive[i] && lastE[i] < 0.05) died[last[i]] = (died[last[i]] ?? 0) + 1;
    if (k % (30 * every)) continue;
    const larvae = c.brood.items.filter((b) => b.stage === m.LARVA).length;
    const rooms = {};
    for (const r of chs.list)
      if (r.colony === c.params.nest) rooms[r.role] = (rooms[r.role] ? rooms[r.role] + "+" : "") + `${r.food.toFixed(0)}/${r.brood}`;
    let n = 0;
    let e = 0;
    let need = 0;
    let out = 0;
    let hungry = 0;
    let old = 0;
    for (let i = 0; i < c.n; i++) {
      if (!c.alive[i]) continue;
      n++;
      e += c.energy[i];
      need += c.need[i];
      if (!c.under[i]) out++;
      if (c.energy[i] < 0.4) hungry++;
      if (c.band(i) === 2) old++;
    }
    const roles = Object.entries(rooms)
      .map(([k, v]) => `${k}:${v}`)
      .join(" ");
    console.log(
      `${Math.round(g.time)}s pop ${n} old ${old} out ${out} E ${(e / n).toFixed(2)} hungry ${hungry} need ${(need / n).toFixed(3)} larvae ${larvae} waiting ${waitingOf(m, c)} larder ${c.larder.toFixed(0)} diedHungry ${c.diedHungry} starvedBrood ${c.broodStarved} | ${roles}`,
    );
  }
  console.log(`died of hunger, where: ${JSON.stringify(died)}`);
}

if (!isMainThread) {
  parentPort.postMessage(await oneGame(workerData));
} else {
  const argv = process.argv.slice(2);
  const tracing = argv[0] === "trace";
  const a = named(tracing ? argv.slice(1) : argv, tracing ? ["game", "params", "every", "root"] : ["games", "params", "root"]);
  const root = resolve(a.root ?? dirname(dirname(dirname(HERE))));
  const params = JSON.parse(a.params ?? "{}");
  if (tracing) {
    const [w, nudge] = (a.game ?? "3:1").split(":").map(Number);
    await trace(root, w, nudge, params, Number(a.every ?? 300));
  } else {
    const [ws, ns = "0"] = (a.games ?? "1-4x0-3").split("x");
    const jobs = list(ws).flatMap((w) => list(ns).map((nudge) => ({ root, w, nudge, params })));
    const width = Math.max(1, Math.min(jobs.length, availableParallelism() - 1));
    const rows = [];
    const failed = [];
    let next = 0;
    await new Promise((done) => {
      let running = 0;
      const launch = () => {
        if (next >= jobs.length) return running === 0 && done();
        const job = jobs[next++];
        running++;
        const worker = new Worker(HERE, { workerData: job });
        worker.on("message", (r) => {
          rows.push(r);
          console.log(JSON.stringify(r));
        });
        worker.on("error", (e) => {
          failed.push(job);
          console.error(`world ${job.w} nudge ${job.nudge} failed:`, e);
        });
        worker.on("exit", () => {
          running--;
          launch();
        });
      };
      for (let k = 0; k < width; k++) launch();
    });
    rows.sort((x, y) => x.w - y.w || x.nudge - y.nudge);
    const max = rows.length ? Math.max(...rows.map((r) => r.stranded)) : "-";
    const lowest = rows.length ? Math.min(...rows.map((r) => r.pop)) : "-";
    console.log(
      `peaks (world-major): ${rows.map((r) => r.stranded).join(" ")} | over 8: ${rows.filter((r) => r.stranded > 8).length} | max ${max} | starved ${rows.reduce((s, r) => s + r.hungry, 0)} | lowest pop ${lowest}${failed.length ? ` | failed ${failed.length} of ${jobs.length}` : ""}`,
    );
    if (failed.length) process.exitCode = 1;
  }
}
