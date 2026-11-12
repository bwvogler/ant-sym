// Live, real spend (hard budget): ask Jev every situation of the browser's lanes under each preset doctrine, and ship
// the answers with the page (the fungus game, ja-lo8.3). The page starts with them in its caches, so a first game
// plays Jev's answers from its first second, and the Pages build, which has no server, plays them too.
//
// Lanes: `mode` (every ant situation, colony.SITUATIONS, 3,888) and `stance` (every strategist view, 324), packed with
// the browser's own packers (packModeRequest, packStanceRequest) and keyed with its own keys (situationKey, stanceKey), under its own
// contexts (policyContext, stanceContext), per preset doctrine: each reached through the lane registry (colony/lanes.ts), which holds them. And `fungus`
// (ja-lo8.4): the fungal situations a recorded side-view game meets (Garden painted on both royal chambers, Lockpick at
// both holes, 300 s; not all 648), asked with every non-lethal lever, per preset aim (fungusBrain.AIMS), side view. And
// `growth` (ja-2bw.5): every hyphal tip's situation (24), per preset aim, under the same aims. It is not in the default
// `--lanes` (a plain re-run asks nothing new for it); after a GROWTH_BRAIN_VERSION bump, re-ship it with `--lanes growth`
// (≈ $0.0009 for the three aims): colony-live.mjs doesn't run this lane, so `--import` can't ship it for free.
//
// Writes web/public/precache/<lane>-<doctrine>.json ([key, answer] pairs, cacheStore's format) and index.json (each
// bundle's lane, doctrine, context and size, and the brain versions). tests/precache.test.ts fails when a bundle's
// context no longer matches the code's (a legend, question or version change): run this again then.
//
// JEV_API_KEY comes from the environment and is never printed.
//
// --import: no spend. Ship the answers a live test already got (scripts/colony-live.mjs caches, e.g.
// experiments/caches/mr52-top-*.json) instead of asking every situation: each file's mode and stance answers go into
// the bundle for its doctrine when they were asked under the context the code asks under now; any other file is
// refused. The page plays the local rule where nothing ships (a preset's words are never asked: PR #42 review S6).
// This is the default way to re-ship after a colony legend or version change: the PR's live check has the answers.
//
// Usage: node scripts/precache.mjs [--lanes mode,stance] [--doctrines forage,cautious,warlike] [--budget 0.35]
//        [--in-flight 4] [--dry]
//        node scripts/precache.mjs --import <cache.json> [<cache.json> ...]
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { DEFAULT_JEV_MODEL, USD_PER_INPUT_TOKEN } from "../web/shared/jev.ts";
import { JevClient } from "../web/server/jev.ts";
import {
  LANE_LIST,
  FUNGUS_BRAIN_VERSION,
  encodeFungal,
  decodeFungal,
  DEFAULT_MENU,
  STRAINS,
  Game,
  centreX,
  centreY,
  generateSideWorld,
  mulberry32,
  COLONY_BRAIN_VERSION,
  DOCTRINES,
  estimateTokens,
  STANCE_BRAIN_VERSION,
  GROWTH_BRAIN_VERSION,
} from "../web/src/colony/index.ts";
import { helpAndExit } from "./lib/usage.mjs";
helpAndExit(import.meta.url);

const BATCH = 100;
const OUT = new URL("../web/public/precache/", import.meta.url);

const args = process.argv.slice(2);
const opts = {
  lanes: "mode,stance,fungus",
  doctrines: DOCTRINES.map((d) => d.id).join(","),
  budget: 0.35,
  inFlight: 4,
  dry: false,
  import: [],
};
for (let k = 0; k < args.length; k++) {
  const a = args[k];
  if (a === "--lanes") opts.lanes = args[++k];
  else if (a === "--doctrines") opts.doctrines = args[++k];
  else if (a === "--budget") opts.budget = Number(args[++k]);
  else if (a === "--in-flight") opts.inFlight = Math.max(1, Number(args[++k]));
  else if (a === "--dry") opts.dry = true;
  else if (a === "--import") while (args[k + 1] && !args[k + 1].startsWith("--")) opts.import.push(args[++k]);
  else throw new Error(`unknown argument ${a}`);
}
const KEY = process.env.JEV_API_KEY;
if (!opts.dry && !opts.import.length && !KEY) throw new Error("JEV_API_KEY is not set (or use --dry for an estimate, or --import)");

/** The menu the page asks the fungus under: every non-lethal lever (Fungus.askedFor under the default menu, with a nest in the side view). */
const MENU = new Set(DEFAULT_MENU);

/** The fungal situations a side-view game meets: Garden on both royal chambers and Lockpick at both holes, 300 s. */
function fungalSituations() {
  const map = generateSideWorld(1);
  const g = new Game(map, { antCount: 600, rivalAnts: 600 }, mulberry32(7919));
  const met = new Set();
  g.fungus.policy = (s) => (met.add(encodeFungal(s)), "default");
  const strain = (id) => STRAINS.findIndex((x) => x.id === id);
  for (let t = 0, painted = false; t < 300; t += 1 / 30) {
    g.tick(1 / 30);
    if (painted || g.time < 30) continue;
    painted = true;
    for (const c of g.colonies) {
      const royal = map.chambers.list.find((k) => k.colony === c.params.nest && k.role === "royal");
      g.paintSpores(centreX(Math.round((royal.x0 + royal.x1) / 2), royal.floorRow), centreY(royal.floorRow), 3, 2, 0.3, strain("garden"));
      g.paintSpores(c.nest.entrance.x, c.nest.entrance.y, 3, 2, 0.3, strain("lockpick"));
    }
  }
  return [...met].sort((a, b) => a - b).map(decodeFungal);
}

// One row a lane, from the lane registry (colony/lanes.ts): the situations it is asked in (the fungus's are the ones a recorded game meets),
// its key, packing, reading and context (the fungus's in the side view, the one the shipped answers are for), the id its items carry, its
// request size, and whether it asks under a doctrine or an aim (and which presets).
const LANES = Object.fromEntries(
  LANE_LIST.map((l) => [
    l.name,
    {
      situations: l.all ?? fungalSituations,
      key: (s) => l.key(s, MENU),
      pack: (items, words) => l.pack(items, words),
      read: (answers, id, situation) => l.read(answers, id, situation, l.key(situation, MENU)),
      context: (words) => l.contextOf(words, l.variants.includes("side") ? "side" : undefined),
      id: l.kind.idPrefix,
      batch: l.batch ?? BATCH,
      field: l.wordsField,
      words: l.wordsField === "aim" ? l.presets : undefined,
    },
  ]),
);

const lanes = opts.lanes.split(",").map((l) => {
  if (!LANES[l]) throw new Error(`unknown lane ${l}`);
  return l;
});
const doctrines = opts.doctrines.split(",").map((id) => {
  const d = DOCTRINES.find((x) => x.id === id);
  if (!d) throw new Error(`unknown doctrine ${id}`);
  return d;
});

mkdirSync(OUT, { recursive: true });
const indexUrl = new URL("index.json", OUT);
const index = existsSync(indexUrl) ? JSON.parse(readFileSync(indexUrl, "utf8")) : { bundles: [] };
index.versions = { colony: COLONY_BRAIN_VERSION, stance: STANCE_BRAIN_VERSION, fungus: FUNGUS_BRAIN_VERSION, growth: GROWTH_BRAIN_VERSION };

// The jobs: one request per 100 situations, per lane and doctrine; what each bundle holds already is not asked again.
const jobs = [];
const bundles = new Map();
let estimate = 0;
for (const lane of lanes) {
  const L = LANES[lane];
  const all = L.situations();
  for (const d of L.words ?? doctrines) {
    const context = L.context(d.text);
    const file = `${lane}-${d.id}.json`;
    const fileUrl = new URL(file, OUT);
    const have = new Map(
      existsSync(fileUrl) && index.bundles.some((b) => b.file === file && b.context === context)
        ? JSON.parse(readFileSync(fileUrl, "utf8"))
        : [],
    );
    bundles.set(file, { lane, [L.field]: d.id, context, file, answers: have });
    const todo = all.filter((s) => !have.has(L.key(s)));
    const batch = L.batch;
    for (let k = 0; k < todo.length; k += batch) {
      const items = todo.slice(k, k + batch).map((situation, n) => ({ id: `${L.id}${n}`, key: L.key(situation), situation }));
      const req = L.pack(items, d.text);
      estimate += estimateTokens(req);
      jobs.push({ lane, file, items, req });
    }
  }
}
if (opts.import.length) {
  // Answers a live test got, under the context the code asks under now: shipped as they are, nothing asked.
  for (const path of opts.import) {
    const c = JSON.parse(readFileSync(path, "utf8"));
    const d = DOCTRINES.find((x) => x.text === c.doctrine?.text);
    if (!d) throw new Error(`${path}: its doctrine is not a preset's`);
    for (const [lane, field] of [
      ["mode", "modes"],
      ["stance", "stances"],
    ]) {
      if (!lanes.includes(lane)) continue;
      const b = bundles.get(`${lane}-${d.id}.json`);
      if (!b) continue;
      if (c.contexts?.[lane] !== b.context)
        throw new Error(`${path}: its ${lane} answers were asked under ${c.contexts?.[lane]}, the code asks under ${b.context}`);
      let got = 0;
      for (const [key, a] of Object.entries(c[field] ?? {}))
        if (!b.answers.has(key)) {
          b.answers.set(key, a);
          got++;
        }
      console.log(`${path} → ${b.file}: +${got}`);
    }
  }
  save();
  for (const b of bundles.values()) console.log(`  ${b.file}: ${b.answers.size} answers`);
  process.exit(0);
}
console.log(
  `${jobs.length} requests, ≈ ${Math.round(estimate).toLocaleString()} tokens ≈ $${(estimate * USD_PER_INPUT_TOKEN).toFixed(4)} (budget $${opts.budget.toFixed(2)})`,
);
if (opts.dry) process.exit(0);

const client = new JevClient({ apiKey: KEY });
let spent = 0;
let failed = 0;
let next = 0;
function save() {
  index.bundles = index.bundles.filter((b) => !bundles.has(b.file));
  for (const b of bundles.values()) {
    writeFileSync(new URL(b.file, OUT), JSON.stringify([...b.answers].sort(([a], [c]) => (a < c ? -1 : a > c ? 1 : 0))));
    index.bundles.push({
      lane: b.lane,
      ...(b.aim ? { aim: b.aim } : { doctrine: b.doctrine }),
      context: b.context,
      file: b.file,
      answers: b.answers.size,
    });
  }
  index.bundles.sort((a, b) => (a.file < b.file ? -1 : 1));
  writeFileSync(indexUrl, `${JSON.stringify(index, null, 2)}\n`);
}
async function worker() {
  for (;;) {
    const job = jobs[next++];
    if (!job) return;
    const est = estimateTokens(job.req) * USD_PER_INPUT_TOKEN;
    if (spent + est > opts.budget) {
      console.log(`budget: stopping before ${job.file} (${job.items.length} situations)`);
      next = jobs.length;
      return;
    }
    try {
      const r = await client.ask({ model: DEFAULT_JEV_MODEL, ...job.req });
      spent += r.inputTokens * USD_PER_INPUT_TOKEN;
      const body = /** @type {any} */ (r.body);
      if (r.status !== 200 || !body?.answers) throw new Error(`Jev ${r.status}`);
      const b = bundles.get(job.file);
      let got = 0;
      for (const it of job.items) {
        const a = LANES[job.lane].read(body.answers, it.id, it.situation);
        if (a) {
          b.answers.set(it.key, a);
          got++;
        }
      }
      process.stdout.write(`${job.file}: +${got} · $${spent.toFixed(4)}\n`);
    } catch (e) {
      failed++;
      console.log(`${job.file}: failed (${String(e).slice(0, 120)}); run again to fill it in`);
    }
  }
}
await Promise.all(Array.from({ length: opts.inFlight }, worker));
save();
console.log(`done: $${spent.toFixed(4)} spent, ${failed} failed requests`);
for (const b of bundles.values()) console.log(`  ${b.file}: ${b.answers.size} answers`);
