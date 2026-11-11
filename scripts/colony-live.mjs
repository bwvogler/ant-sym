// Live, real spend (hard budget): ask Jev the colony's questions for every
// situation an offline game meets, and compare its answers with the local
// rule. One headless game (experiment.runGame: the page's side view by
// default, --top for the top-down map; the local rule and local responses,
// alarm painted about every 20 s) collects the distinct situations of each
// lane: ant modes, stances, and the get/carry/drop/trail responses
// (colonyBrain.RESPONSE_HOOKS, keyed by colonyBrain.responseKey). Then, per
// doctrine, each lane's situations are packed with the real packers and sent
// through the server's JevClient (pooled connection, per-attempt timeout,
// retry-after), a request at a time, until the budget would be passed.
//
// Reports, per lane and doctrine: real usage.input_tokens per question
// against colonyBrain.estimateTokens, how often Jev agrees with the local
// rule, and where they part. Saves Jev's answers as one cache per doctrine
// (experiments/out/jev-cache-<doctrine>.json, with the brain versions it was
// asked under), which `npm run exp -- <assays> --policy cache:<file>` replays
// offline, free, over every seed.
//
// A replay meets situations the first game didn't (Jev's answers steer the
// colony elsewhere), and those fall back to the local rule. `--from <cache>`
// is the second round: replay that cache in the same game, collect only the
// situations it lacks, ask those under its doctrine, and add them to it.
//
// JEV_API_KEY comes from the environment and is never printed.
//
// Usage: node scripts/colony-live.mjs <all|mode|stance|get,carry,drop,trail> [--budget 0.10] [--seconds 300]
//        [--seed 1] [--ants 600] [--top] [--doctrines forage,cautious,warlike] [--from <cache>] [--dry]
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { DEFAULT_JEV_MODEL, USD_PER_INPUT_TOKEN } from "../web/shared/jev.ts";
import { JevClient } from "../web/server/jev.ts";
import { localPolicy, localStance } from "../web/src/colony/colony.ts";
import {
  cacheContexts,
  COLONY_BRAIN_VERSION,
  DOCTRINES,
  estimateTokens,
  packModeRequest,
  packResponseRequest,
  packStanceRequest,
  readMode,
  readResponse,
  readStance,
  RESPONSE_BRAIN_VERSION,
  RESPONSE_HOOKS,
  responseKey,
  situationKey,
  STANCE_BRAIN_VERSION,
  stanceKey,
} from "../web/src/colony/colonyBrain.ts";
import { runGame } from "../web/src/colony/experiment.ts";
import { localResponses, responses } from "../web/src/colony/responses.ts";
import { generateSideWorld, generateWorld, mulberry32, OPEN_WORLD, worldExtent } from "../web/src/colony/world.ts";

const BATCH = 100;
const DT = 1 / 30;
const VERSIONS = { colony: COLONY_BRAIN_VERSION, stance: STANCE_BRAIN_VERSION, response: RESPONSE_BRAIN_VERSION };

const args = process.argv.slice(2);
const opts = { lanes: "all", budget: 0.1, seconds: 300, seed: 1, ants: 600, top: false, doctrines: "forage,cautious,warlike", from: null, dry: false };
const given = new Set(); // the game options given on the command line (a second round takes the rest from its cache)
for (let k = 0; k < args.length; k++) {
  const a = args[k];
  if (a === "--budget") opts.budget = Number(args[++k]);
  else if (a === "--seconds") {
    opts.seconds = Number(args[++k]);
    given.add("seconds");
  }
  else if (a === "--seed") {
    opts.seed = Number(args[++k]);
    given.add("seed");
  }
  else if (a === "--ants") {
    opts.ants = Number(args[++k]);
    given.add("ants");
  }
  else if (a === "--top") {
    opts.top = true;
    given.add("top");
  }
  else if (a === "--doctrines") opts.doctrines = args[++k];
  else if (a === "--from") opts.from = args[++k];
  else if (a === "--dry") opts.dry = true;
  else if (!a.startsWith("--")) opts.lanes = a;
  else throw new Error(`unknown option ${a}`);
}
const KEY = process.env.JEV_API_KEY;
if (!KEY && !opts.dry) {
  console.error("JEV_API_KEY not set (or pass --dry to see what would be asked)");
  process.exit(1);
}
if (!(opts.budget > 0 && opts.budget <= 1)) throw new Error("--budget must be in (0, 1] dollars");

// The lanes: how to key, pack, read and answer locally.
const LANES = {
  mode: { key: situationKey, pack: packModeRequest, read: readMode, local: localPolicy },
  stance: { key: stanceKey, pack: packStanceRequest, read: readStance, local: localStance },
  ...Object.fromEntries(RESPONSE_HOOKS.map((h) => [h, { key: (t) => responseKey(h, t), pack: (items, d) => packResponseRequest(h, items, d), read: (ans, id) => readResponse(h, ans, id), local: localResponses[h] }])),
};
const chosen = opts.lanes === "all" ? Object.keys(LANES) : opts.lanes.split(",");
for (const l of chosen) if (!LANES[l]) throw new Error(`no lane ${l} (have ${Object.keys(LANES).join(", ")})`);

// A second round extends one cache under its own doctrine; a first round asks every doctrine named.
const base = opts.from ? JSON.parse(readFileSync(opts.from, "utf8")) : null;
if (base && JSON.stringify(base.version) !== JSON.stringify(VERSIONS)) {
  console.error(`${opts.from} was asked under brain versions ${JSON.stringify(base.version)}; the code is at ${JSON.stringify(VERSIONS)}. Ask afresh.`);
  process.exit(1);
}
// Versions are bumped by hand; the contexts also catch a legend or question edited without a bump.
if (base && JSON.stringify(base.contexts) !== JSON.stringify(cacheContexts(base.doctrine?.text ?? ""))) {
  console.error(`${opts.from} was asked under other questions or another doctrine than the code's (cache contexts differ). Ask afresh.`);
  process.exit(1);
}
// A second round replays the cache's own game unless told otherwise.
if (base) {
  if (!given.has("seed")) opts.seed = base.seed ?? opts.seed;
  if (!given.has("ants")) opts.ants = base.ants ?? opts.ants;
  if (!given.has("seconds")) opts.seconds = base.seconds ?? opts.seconds;
}
const doctrines = base
  ? [base.doctrine]
  : opts.doctrines.split(",").map((id) => {
      const d = DOCTRINES.find((x) => x.id === id);
      if (!d) throw new Error(`no doctrine ${id} (have ${DOCTRINES.map((x) => x.id).join(", ")})`);
      return d;
    });
const view = base?.view ?? (opts.top ? "top" : "side");

// 1. Offline: the distinct situations of each lane from one game: on the local rule, or (--from) on the cache,
// collecting only the situations it has no answer for.
const met = Object.fromEntries(Object.keys(LANES).map((l) => [l, new Map()]));
const note = (lane, s) => {
  const k = LANES[lane].key(s);
  if (!met[lane].has(k)) met[lane].set(k, { ...s }); // a copy: responses share one Touch object
};
const answered = (lane, s) => {
  if (!base) return undefined;
  const table = lane === "mode" ? base.modes : lane === "stance" ? base.stances : base.responses?.[lane];
  return table?.[LANES[lane].key(s)];
};
const brain = (lane) => (s) => {
  const a = answered(lane, s);
  if (a !== undefined) return a;
  note(lane, s);
  return LANES[lane].local(s);
};
const map = view === "top" ? generateWorld(opts.seed, OPEN_WORLD) : generateSideWorld(opts.seed);
const extent = worldExtent(map);
const paint = mulberry32(opts.seed + 99);
/** @type {import("../web/src/colony/experiment.ts").Event[]} */
const events = [];
for (let t = 0; t < opts.seconds; t += DT) if (paint() < DT / 20) events.push({ at: t, kind: "paint", channel: "alarm", x: paint() * extent.w, y: paint() * extent.h, r: 3, amount: 12 });
const { game } = runGame({
  seed: opts.seed,
  map,
  game: { antCount: opts.ants, rivalAnts: opts.ants },
  sides: { policy: brain("mode"), stance: brain("stance"), responses: responses(Object.fromEntries(RESPONSE_HOOKS.map((h) => [h, brain(h)]))) },
  seconds: opts.seconds,
  events,
});
console.log(
  `offline (${view} view): seed ${opts.seed}, ${opts.ants} + ${opts.ants} ants, ${opts.seconds} s${base ? `, replaying ${opts.from}` : ""} · food home ${game.colonies.map((c) => c.stored).join(" / ")} · ${base ? "situations the cache lacks" : "situations met"}: ${chosen.map((l) => `${l} ${met[l].size}`).join(", ")}`,
);

// 2. Live, per doctrine and lane, within the budget.
const client = opts.dry ? null : new JevClient({ apiKey: KEY });
async function ask(req) {
  const r = await client.ask({ model: DEFAULT_JEV_MODEL, ...req });
  const body = /** @type {any} */ (r.body);
  if (r.status !== 200 || !body?.answers) throw new Error(`Jev ${r.status} after ${r.attempts} attempt(s): ${JSON.stringify(r.body).slice(0, 300)}`);
  return { answers: body.answers, inputTokens: r.inputTokens };
}

let spentTokens = 0;
const report = [];
const caches = Object.fromEntries(
  doctrines.map((d) => [d.id, base ? structuredClone(base) : { version: VERSIONS, contexts: cacheContexts(d.text), view, seed: opts.seed, ants: opts.ants, seconds: opts.seconds, doctrine: d, modes: {}, stances: {}, responses: {} }]),
);
let stopped = false;
let failure = null;
try {
  outer: for (const d of doctrines) {
    for (const lane of chosen) {
      const L = LANES[lane];
      const items = [...met[lane].entries()];
      const row = { doctrine: d.id, lane, asked: 0, answered: 0, agree: 0, estTokens: 0, realTokens: 0, requests: 0, disagreements: [] };
      report.push(row);
      for (let b = 0; b < items.length; b += BATCH) {
        const chunk = items.slice(b, b + BATCH);
        const req = L.pack(
          chunk.map(([, s], n) => ({ id: `s${n}`, situation: s })),
          d.text,
        );
        const est = estimateTokens(req);
        // Never start a request that could pass the budget: allow 50 % over the estimate.
        if ((spentTokens + est * 1.5) * USD_PER_INPUT_TOKEN > opts.budget) {
          console.log(`budget: stopping before ${d.id}/${lane} batch ${b / BATCH + 1} (spent ≈ $${(spentTokens * USD_PER_INPUT_TOKEN).toFixed(4)})`);
          stopped = true;
          break outer;
        }
        row.estTokens += est;
        row.asked += chunk.length;
        row.requests++;
        if (opts.dry) continue;
        let reply;
        try {
          reply = await ask(req);
        } catch (e) {
          // Keep what was paid for: stop here, and still write the answers so far.
          failure = e;
          stopped = true;
          console.error(`stopping: ${d.id}/${lane} batch ${b / BATCH + 1} failed: ${e.message}`);
          break outer;
        }
        const { answers, inputTokens } = reply;
        spentTokens += inputTokens;
        row.realTokens += inputTokens;
        chunk.forEach(([k, s], n) => {
          const a = L.read(answers, `s${n}`);
          if (a === null) return;
          row.answered++;
          const local = L.local(s);
          if (a === local) row.agree++;
          else row.disagreements.push({ situation: k, jev: a, local });
          const c = caches[d.id];
          if (lane === "mode") c.modes[k] = a;
          else if (lane === "stance") c.stances[k] = a;
          else (c.responses[lane] ??= {})[k] = a;
        });
      }
      const pct = (a, b) => (b ? `${Math.round((100 * a) / b)} %` : "–");
      console.log(
        `${d.id.padEnd(9)} ${lane.padEnd(7)} ${String(row.asked).padStart(4)} asked · ${row.requests} req · est ${Math.round(row.estTokens / Math.max(1, row.asked))} tok/q` +
          (opts.dry ? "" : ` · real ${Math.round(row.realTokens / Math.max(1, row.asked))} tok/q (×${(row.realTokens / Math.max(1, row.estTokens)).toFixed(2)}) · agrees with local ${pct(row.agree, row.answered)} of ${row.answered}`),
      );
    }
  }
} finally {
  client?.destroy();
}

const tokens = opts.dry ? report.reduce((a, r) => a + r.estTokens, 0) : spentTokens;
console.log(`\n${opts.dry ? "would spend" : "spent"} ≈ ${tokens.toLocaleString()} input tokens ≈ $${(tokens * USD_PER_INPUT_TOKEN).toFixed(4)} of a $${opts.budget} budget${failure ? " (stopped by a failed request: partial caches written)" : stopped ? " (stopped at the budget)" : ""}`);
if (opts.dry) process.exit(0);

// Where Jev and the local rule part ways, per doctrine and lane (a few examples each).
for (const r of report) {
  if (!r.disagreements.length) continue;
  console.log(`\n${r.doctrine} / ${r.lane}: ${r.disagreements.length} disagreements, e.g.`);
  const byPair = new Map();
  for (const x of r.disagreements) {
    const k = `${x.local} → ${x.jev}`;
    byPair.set(k, [...(byPair.get(k) ?? []), x.situation]);
  }
  for (const [pair, sits] of [...byPair.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, 4)) console.log(`  local ${pair}: ${sits.length}× (${sits.slice(0, 2).join("  ;  ")})`);
}

const dir = new URL("../experiments/out/", import.meta.url).pathname;
mkdirSync(dir, { recursive: true });
const files = doctrines.map((d) => (base ? opts.from : `${dir}jev-cache-${d.id}.json`));
doctrines.forEach((d, k) => writeFileSync(files[k], JSON.stringify(caches[d.id], null, 1)));
writeFileSync(`${dir}jev-live-report${base ? "-round2" : ""}.json`, JSON.stringify({ when: new Date().toISOString(), opts, spentTokens, usd: spentTokens * USD_PER_INPUT_TOKEN, failure: failure?.message ?? null, report }, null, 1));
console.log(`\ncaches: ${files.join(", ")} · report in experiments/out/`);
if (failure) process.exitCode = 1;
