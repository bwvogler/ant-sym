// Live, real spend (hard budget): ask Jev the colony's questions for every
// situation an offline run meets, and compare its answers with the local
// rule. One run of the game headless (experiment.runGame: the local rule and
// local responses, alarm painted now and then) collects the distinct
// situations of each lane: ant modes, stances, and each response hook
// (colonyBrain.RESPONSE_HOOKS, keyed by responses.touchKey). Then,
// per doctrine, each lane's situations are packed with the real packers and
// sent to Jev, a request at a time, until the budget would be passed.
//
// Reports, per lane and doctrine: real usage.input_tokens per question
// against colonyBrain.estimateTokens, how often Jev agrees with the local
// rule, and where they disagree. Saves Jev's answers as one cache file per
// doctrine (experiments/out/jev-cache-<doctrine>.json), which
// `npm run exp -- all --policy cache:<file>` replays offline over every
// seed and assay for free.
//
// JEV_API_KEY comes from the environment and is never printed.
//
// Usage: node scripts/colony-live.mjs <all|mode|stance|get,carry,drop,trail> [--budget 0.10] [--seconds 300] [--seed 1]
//        [--ants 600] [--doctrines forage,cautious,warlike] [--dry]
import { mkdirSync, writeFileSync } from "node:fs";
import { localPolicy, localStance } from "../web/src/colony/colony.ts";
import {
  COLONY_BRAIN_VERSION,
  DOCTRINES,
  estimateTokens,
  packModeRequest,
  packResponseRequest,
  packStanceRequest,
  readMode,
  readResponse,
  readStance,
  RESPONSE_HOOKS,
  situationKey,
  stanceKey,
} from "../web/src/colony/colonyBrain.ts";
import { runGame } from "../web/src/colony/experiment.ts";
import { localResponses, responses, touchKey } from "../web/src/colony/responses.ts";
import { generateWorld, mulberry32 } from "../web/src/colony/world.ts";

const URL_ = "https://api.typesafe.ai/v1/systemone";
const MODEL = "jev-latest";
const USD = 0.042 / 1e6;
const BATCH = 100;
const DT = 1 / 30;

const args = process.argv.slice(2);
const opts = { lanes: "all", budget: 0.1, seconds: 300, seed: 1, ants: 600, doctrines: "forage,cautious,warlike", dry: false };
for (let k = 0; k < args.length; k++) {
  const a = args[k];
  if (a === "--budget") opts.budget = Number(args[++k]);
  else if (a === "--seconds") opts.seconds = Number(args[++k]);
  else if (a === "--seed") opts.seed = Number(args[++k]);
  else if (a === "--ants") opts.ants = Number(args[++k]);
  else if (a === "--doctrines") opts.doctrines = args[++k];
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
  ...Object.fromEntries(RESPONSE_HOOKS.map((h) => [h, { key: touchKey, pack: (items, d) => packResponseRequest(h, items, d), read: (ans, id) => readResponse(h, ans, id), local: localResponses[h] }])),
};
const chosen = opts.lanes === "all" ? Object.keys(LANES) : opts.lanes.split(",");
for (const l of chosen) if (!LANES[l]) throw new Error(`no lane ${l} (have ${Object.keys(LANES).join(", ")})`);
const doctrines = opts.doctrines.split(",").map((id) => {
  const d = DOCTRINES.find((x) => x.id === id);
  if (!d) throw new Error(`no doctrine ${id} (have ${DOCTRINES.map((x) => x.id).join(", ")})`);
  return d;
});

// 1. Offline: the distinct situations of each lane, from one game on the local rule.
const met = Object.fromEntries(Object.keys(LANES).map((l) => [l, new Map()]));
const note = (lane, s) => {
  const k = LANES[lane].key(s);
  if (!met[lane].has(k)) met[lane].set(k, { ...s });
};
const noting = responses(Object.fromEntries(RESPONSE_HOOKS.map((h) => [h, (t) => (note(h, t), localResponses[h](t))])));
// Alarm painted somewhere about every 20 s, like colony-cost: the fungus's brush.
const paint = mulberry32(opts.seed + 99);
const events = [];
for (let t = 0; t < opts.seconds; t += DT) if (paint() < DT / 20) events.push({ at: t, kind: "paint", channel: "alarm", x: paint(), y: paint(), r: 3, amount: 12 });
const map = generateWorld(opts.seed);
for (const e of events) {
  e.x *= map.size.w;
  e.y *= map.size.h;
}
runGame({
  seed: opts.seed,
  map,
  game: { antCount: opts.ants, rivalAnts: opts.ants },
  sides: { policy: (s) => (note("mode", s), localPolicy(s)), stance: (s) => (note("stance", s), localStance(s)), responses: noting },
  seconds: opts.seconds,
  events,
});
console.log(`offline: seed ${opts.seed}, ${opts.ants} + ${opts.ants} ants, ${opts.seconds} s · situations met: ${chosen.map((l) => `${l} ${met[l].size}`).join(", ")}`);

// 2. Live, per doctrine and lane, within the budget.
async function ask(req) {
  const body = JSON.stringify({ model: MODEL, ...req });
  for (let attempt = 0; attempt < 4; attempt++) {
    const t0 = performance.now();
    const r = await fetch(URL_, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${KEY}` }, body });
    const ms = Math.round(performance.now() - t0);
    const text = await r.text();
    if (r.status === 429 || r.status >= 500) {
      const wait = Number(r.headers.get("retry-after")) || 2 ** attempt;
      console.error(`  ${r.status}, retrying in ${wait} s`);
      await new Promise((ok) => setTimeout(ok, wait * 1000));
      continue;
    }
    if (r.status !== 200) throw new Error(`Jev ${r.status}: ${text.slice(0, 300)}`);
    const j = JSON.parse(text);
    return { answers: j.answers ?? {}, inputTokens: j.usage?.input_tokens ?? 0, ms };
  }
  throw new Error("Jev kept failing");
}

let spentTokens = 0;
const report = [];
const caches = Object.fromEntries(doctrines.map((d) => [d.id, { version: COLONY_BRAIN_VERSION, seed: opts.seed, doctrine: d, modes: {}, stances: {}, responses: {} }]));
let stopped = false;
outer: for (const d of doctrines) {
  for (const lane of chosen) {
    const L = LANES[lane];
    const items = [...met[lane].entries()];
    const row = { doctrine: d.id, lane, asked: 0, answered: 0, agree: 0, estTokens: 0, realTokens: 0, requests: 0, disagreements: [] };
    report.push(row);
    for (let b = 0; b < items.length; b += BATCH) {
      const chunk = items.slice(b, b + BATCH);
      const req = L.pack(chunk.map(([, s], n) => ({ id: `s${n}`, situation: s })), d.text);
      const est = estimateTokens(req);
      // Never start a request that could pass the budget: allow 50 % over the estimate.
      if ((spentTokens + est * 1.5) * USD > opts.budget) {
        console.log(`budget: stopping before ${d.id}/${lane} batch ${b / BATCH + 1} (spent ≈ $${(spentTokens * USD).toFixed(4)})`);
        stopped = true;
        break outer;
      }
      row.estTokens += est;
      row.asked += chunk.length;
      row.requests++;
      if (opts.dry) continue;
      const { answers, inputTokens } = await ask(req);
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
      `${d.id.padEnd(9)} ${lane.padEnd(10)} ${String(row.asked).padStart(4)} asked · ${row.requests} req · est ${Math.round(row.estTokens / Math.max(1, row.asked))} tok/q` +
        (opts.dry ? "" : ` · real ${Math.round(row.realTokens / Math.max(1, row.asked))} tok/q (×${(row.realTokens / Math.max(1, row.estTokens)).toFixed(2)}) · agrees with local ${pct(row.agree, row.answered)} of ${row.answered}`),
    );
  }
}

console.log(`\n${opts.dry ? "would spend" : "spent"} ≈ ${(opts.dry ? report.reduce((a, r) => a + r.estTokens, 0) : spentTokens).toLocaleString()} input tokens ≈ $${((opts.dry ? report.reduce((a, r) => a + r.estTokens, 0) : spentTokens) * USD).toFixed(4)} of a $${opts.budget} budget${stopped ? " (stopped at the budget)" : ""}`);
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
for (const d of doctrines) writeFileSync(`${dir}jev-cache-${d.id}.json`, JSON.stringify(caches[d.id], null, 1));
writeFileSync(`${dir}jev-live-report.json`, JSON.stringify({ when: new Date().toISOString(), opts, spentTokens, usd: spentTokens * USD, report }, null, 1));
console.log(`\ncaches: ${doctrines.map((d) => `experiments/out/jev-cache-${d.id}.json`).join(", ")} · report: experiments/out/jev-live-report.json`);
