// Live, real spend (hard budget): ask Jev every situation of the browser's lanes under each preset doctrine, and ship
// the answers with the page (the fungus game, ja-lo8.3). The page starts with them in its caches, so a first game
// plays Jev's answers from its first second, and the Pages build, which has no server, plays them too.
//
// Lanes: `mode` (every ant situation, colony.SITUATIONS, 3,888) and `stance` (every strategist view, 324), packed with
// the browser's own packers (colonyBrain.packModeRequest, packStanceRequest) and keyed with its own keys
// (situationKey, stanceKey), under its own contexts (policyContext, stanceContext), per preset doctrine. And `fungus`
// (ja-lo8.4): the fungal situations a recorded side-view game meets (Garden painted on both royal chambers, Lockpick at
// both holes, 300 s; not all 648), asked with every non-lethal lever, per preset aim (fungusBrain.AIMS), side view.
//
// Writes web/public/precache/<lane>-<doctrine>.json ([key, answer] pairs, cacheStore's format) and index.json (each
// bundle's lane, doctrine, context and size, and the brain versions). tests/precache.test.ts fails when a bundle's
// context no longer matches the code's (a legend, question or version change): run this again then.
//
// JEV_API_KEY comes from the environment and is never printed.
//
// Usage: node scripts/precache.mjs [--lanes mode,stance] [--doctrines forage,cautious,warlike] [--budget 0.35]
//        [--in-flight 4] [--dry]
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { DEFAULT_JEV_MODEL, USD_PER_INPUT_TOKEN } from "../web/shared/jev.ts";
import { JevClient } from "../web/server/jev.ts";
import { decode, SITUATIONS, STANCES } from "../web/src/colony/colony.ts";
import { AIMS, FUNGUS_BATCH, FUNGUS_BRAIN_VERSION, fungalKey, fungusContext, packFungusRequest, readLevels } from "../web/src/colony/fungusBrain.ts";
import { encodeFungal, decodeFungal } from "../web/src/colony/fungalPolicy.ts";
import { askedLevers, DEFAULT_MENU, STRAINS } from "../web/src/colony/fungus.ts";
import { Game } from "../web/src/colony/game.ts";
import { centreX, centreY } from "../web/src/colony/hex.ts";
import { generateSideWorld, mulberry32 } from "../web/src/colony/world.ts";
import {
  COLONY_BRAIN_VERSION,
  DOCTRINES,
  estimateTokens,
  packModeRequest,
  packStanceRequest,
  policyContext,
  readMode,
  readStance,
  situationKey,
  STANCE_BRAIN_VERSION,
  stanceContext,
  stanceKey,
} from "../web/src/colony/colonyBrain.ts";

const BATCH = 100;
const OUT = new URL("../web/public/precache/", import.meta.url);

const args = process.argv.slice(2);
const opts = { lanes: "mode,stance,fungus", doctrines: DOCTRINES.map((d) => d.id).join(","), budget: 0.35, inFlight: 4, dry: false };
for (let k = 0; k < args.length; k++) {
  const a = args[k];
  if (a === "--lanes") opts.lanes = args[++k];
  else if (a === "--doctrines") opts.doctrines = args[++k];
  else if (a === "--budget") opts.budget = Number(args[++k]);
  else if (a === "--in-flight") opts.inFlight = Math.max(1, Number(args[++k]));
  else if (a === "--dry") opts.dry = true;
  else throw new Error(`unknown argument ${a}`);
}
const KEY = process.env.JEV_API_KEY;
if (!opts.dry && !KEY) throw new Error("JEV_API_KEY is not set (or use --dry for an estimate)");

/** Every strategist view: the fields of colony.StanceSituation, every value. */
function stanceSituations() {
  const out = [];
  for (const stance of STANCES)
    for (const ants of ["few", "some", "many"])
      for (const losses of ["none", "some", "heavy"])
        for (const enemyNearNest of [false, true])
          for (const intake of ["none", "some", "plenty"]) for (const larder of ["low", "full"]) out.push({ stance, ants, losses, enemyNearNest, intake, larder });
  return out;
}

/** The levers the page asks in the side view for a host in situation s: every non-lethal one that means something in it (Fungus.askedFor under the default menu, with a nest). */
const fungusAsked = (s) => askedLevers(new Set(DEFAULT_MENU), s.task === "queen");

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

const LANES = {
  mode: {
    situations: () => Array.from({ length: SITUATIONS }, (_, c) => decode(c)),
    key: situationKey,
    pack: (items, words) => packModeRequest(items, words),
    read: (answers, id) => readMode(answers, id),
    context: policyContext,
    id: "s",
  },
  stance: {
    situations: stanceSituations,
    key: stanceKey,
    pack: (items, words) => packStanceRequest(items, words),
    read: (answers, id) => readStance(answers, id),
    context: stanceContext,
    id: "c",
  },
  fungus: {
    situations: fungalSituations,
    key: (s) => fungalKey(s, fungusAsked(s)),
    pack: (items, words) => packFungusRequest(items.map((it) => ({ ...it, asked: fungusAsked(it.situation) })), words),
    read: (answers, id, situation) => readLevels(answers, id, fungusAsked(situation)),
    context: (words) => fungusContext(words, "side"),
    id: "h",
    batch: FUNGUS_BATCH,
    words: AIMS,
  },
};

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
index.versions = { colony: COLONY_BRAIN_VERSION, stance: STANCE_BRAIN_VERSION, fungus: FUNGUS_BRAIN_VERSION };

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
    const have = new Map(existsSync(fileUrl) && index.bundles.some((b) => b.file === file && b.context === context) ? JSON.parse(readFileSync(fileUrl, "utf8")) : []);
    bundles.set(file, { lane, [L.words ? "aim" : "doctrine"]: d.id, context, file, answers: have });
    const todo = all.filter((s) => !have.has(L.key(s)));
    const batch = L.batch ?? BATCH;
    for (let k = 0; k < todo.length; k += batch) {
      const items = todo.slice(k, k + batch).map((situation, n) => ({ id: `${L.id}${n}`, key: L.key(situation), situation }));
      const req = L.pack(items, d.text);
      estimate += estimateTokens(req);
      jobs.push({ lane, file, items, req });
    }
  }
}
console.log(`${jobs.length} requests, ≈ ${Math.round(estimate).toLocaleString()} tokens ≈ $${(estimate * USD_PER_INPUT_TOKEN).toFixed(4)} (budget $${opts.budget.toFixed(2)})`);
if (opts.dry) process.exit(0);

const client = new JevClient({ apiKey: KEY });
let spent = 0;
let failed = 0;
let next = 0;
function save() {
  index.bundles = index.bundles.filter((b) => !bundles.has(b.file));
  for (const b of bundles.values()) {
    writeFileSync(new URL(b.file, OUT), JSON.stringify([...b.answers].sort(([a], [c]) => (a < c ? -1 : a > c ? 1 : 0))));
    index.bundles.push({ lane: b.lane, ...(b.aim ? { aim: b.aim } : { doctrine: b.doctrine }), context: b.context, file: b.file, answers: b.answers.size });
  }
  index.bundles.sort((a, b) => (a.file < b.file ? -1 : 1));
  writeFileSync(indexUrl, `${JSON.stringify(index, null, 2)}\n`);
}
async function worker() {
  for (;;) {
    const job = jobs[next++];
    if (!job) return;
    const est = estimateTokens(job.req) * USD_PER_INPUT_TOKEN;
    if ((spent + est) > opts.budget) {
      console.log(`budget: stopping before ${job.file} (${job.items.length} situations)`);
      next = jobs.length;
      return;
    }
    try {
      const r = await client.ask({ model: DEFAULT_JEV_MODEL, ...job.req });
      spent += r.inputTokens * USD_PER_INPUT_TOKEN;
      if (r.status !== 200 || !r.body?.answers) throw new Error(`Jev ${r.status}`);
      const b = bundles.get(job.file);
      let got = 0;
      for (const it of job.items) {
        const a = LANES[job.lane].read(r.body.answers, it.id, it.situation);
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
