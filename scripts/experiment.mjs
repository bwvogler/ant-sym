// Offline, no key, no spend: run assays over seeds and parameter sweeps.
// Every assay is a hand-built arena (or the whole game) with a pass/fail
// target from published ant behaviour (web/src/colony/assays.ts). Each --set
// takes a list of values; the run is the cross product of all of them over
// the seeds. Prints a markdown table (median and worst seed per metric, the
// share of seeds that pass, the verdict) and writes the full results as JSON
// to experiments/out/ (gitignored). Seeds run in parallel worker threads.
//
// Usage:
//   npm run exp -- <all|a1|a1,a3,...> [--seeds 1-10] [--short]
//                  [--set colony.deposit=2,4,8] [--set colony.channels.food.evaporation=0.03,0.06]
//                  [--policy local|cache:<file>] [--jobs N] [--out file.json]
// Keys: colony.* (the player's colony; both sides in the combat assay), rival.*, game.* (game.fight.rate, …).
// --policy cache:<file> replays cached Jev answers ({ modes: { situationKey: mode }, stances: { stanceKey: stance } },
// written by scripts/colony-live.mjs); situations it lacks fall back to the local rule.
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { availableParallelism } from "node:os";
import { Worker, isMainThread, parentPort, workerData } from "node:worker_threads";

const ROOT = new URL("..", import.meta.url);

if (isMainThread) await main();
else await work();

function parseSeeds(s) {
  const out = [];
  for (const part of s.split(",")) {
    const [a, b] = part.split("-").map(Number);
    for (let k = a; k <= (b ?? a); k++) out.push(k);
  }
  return out;
}

function parseValue(v) {
  if (v === "true" || v === "false") return v === "true";
  const n = Number(v);
  return Number.isFinite(n) && v.trim() !== "" ? n : v;
}

/** The cross product of every --set: a list of { key: value } combinations. */
function combos(sets) {
  let out = [{}];
  for (const [key, values] of sets) out = out.flatMap((c) => values.map((v) => ({ ...c, [key]: v })));
  return out;
}

async function main() {
  const args = process.argv.slice(2);
  const opts = { which: "all", seeds: "1-10", short: false, sets: [], policy: "local", jobs: Math.max(1, availableParallelism()), out: null };
  for (let k = 0; k < args.length; k++) {
    const a = args[k];
    if (a === "--seeds") opts.seeds = args[++k];
    else if (a === "--short") opts.short = true;
    else if (a === "--set") {
      const [key, vals] = args[++k].split("=");
      opts.sets.push([key, vals.split(",").map(parseValue)]);
    } else if (a === "--policy") opts.policy = args[++k];
    else if (a === "--jobs") opts.jobs = Number(args[++k]);
    else if (a === "--out") opts.out = args[++k];
    else if (!a.startsWith("--")) opts.which = a;
    else throw new Error(`unknown option ${a}`);
  }
  const { ASSAYS, summarize } = await import("../web/src/colony/assays.ts");
  const ids = opts.which === "all" ? ASSAYS.filter((a) => a.metrics.length).map((a) => a.id) : opts.which.split(",");
  for (const id of ids) if (!ASSAYS.some((a) => a.id === id)) throw new Error(`no assay ${id} (have ${ASSAYS.map((a) => a.id).join(", ")})`);
  const seeds = parseSeeds(opts.seeds);
  const cs = combos(opts.sets);
  const jobs = cs.flatMap((set, ci) => seeds.map((seed) => ({ ci, set, seed })));
  const t0 = performance.now();
  console.error(`${ids.join(", ")} · seeds ${opts.seeds} · ${cs.length} combination${cs.length > 1 ? "s" : ""} · ${jobs.length} jobs on ${Math.min(opts.jobs, jobs.length)} threads${opts.short ? " · short" : ""} · policy ${opts.policy}`);

  // results[ci][assayId] = AssayRun[]
  const results = cs.map(() => Object.fromEntries(ids.map((id) => [id, []])));
  let next = 0;
  let done = 0;
  await Promise.all(
    Array.from({ length: Math.min(opts.jobs, jobs.length) }, async () => {
      while (next < jobs.length) {
        const job = jobs[next++];
        const runs = await runInWorker({ ids, seed: job.seed, set: job.set, short: opts.short, policy: opts.policy });
        for (const r of runs) results[job.ci][r.id].push(r.run);
        done++;
        process.stderr.write(`\r${done}/${jobs.length} jobs, ${((performance.now() - t0) / 1000).toFixed(0)} s`);
      }
    }),
  );
  process.stderr.write("\n");

  const fmt = (v) => (Number.isFinite(v) ? (Math.abs(v) >= 100 ? v.toFixed(0) : Math.abs(v) >= 10 ? v.toFixed(1) : v.toFixed(2)) : "–");
  const rows = [];
  const multi = cs.length > 1;
  console.log(`| ${multi ? "set | " : ""}assay | metric | median | worst seed | seeds pass | verdict |`);
  console.log(`|${multi ? "---|" : ""}---|---|---|---|---|---|`);
  cs.forEach((set, ci) => {
    const label = Object.entries(set).map(([k, v]) => `${k}=${v}`).join(" ") || "defaults";
    for (const id of ids) {
      const a = ASSAYS.find((x) => x.id === id);
      results[ci][id].sort((x, y) => x.seed - y.seed);
      const s = summarize(a, results[ci][id]);
      rows.push({ set, assay: id, ...s, runs: results[ci][id] });
      const verdict = s.verdict === null ? "info" : s.verdict ? "**pass**" : "fail";
      a.metrics.forEach((m, k) => {
        const head = k === 0 ? `${a.id.toUpperCase()} ${a.name}${a.pending ? " (pending)" : ""}` : "";
        const tail = k === 0 ? `${Math.round(s.passRate * 100)} % | ${verdict}` : " | ";
        console.log(`| ${multi ? `${k === 0 ? label : ""} | ` : ""}${head} | ${m.label} | ${fmt(s.metrics[m.key].median)} | ${fmt(s.metrics[m.key].worst)} | ${tail} |`);
      });
    }
  });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const file = opts.out ?? new URL(`experiments/out/${stamp}-${ids.join("_")}.json`, ROOT).pathname;
  mkdirSync(new URL("experiments/out/", ROOT).pathname, { recursive: true });
  writeFileSync(file, JSON.stringify({ when: new Date().toISOString(), opts, rows }, null, 1));
  console.error(`${((performance.now() - t0) / 1000).toFixed(0)} s · ${file}`);
}

function runInWorker(data) {
  return new Promise((resolve, reject) => {
    const w = new Worker(new URL(import.meta.url), { workerData: data });
    w.once("message", resolve);
    w.once("error", reject);
    w.once("exit", (code) => code && reject(new Error(`worker exited ${code}`)));
  });
}

/** Deep-set "a.b.c" = v into obj. */
function setPath(obj, path, v) {
  const keys = path.split(".");
  let o = obj;
  for (const k of keys.slice(0, -1)) o = o[k] ??= {};
  o[keys.at(-1)] = v;
}

async function work() {
  const { ids, seed, set, short, policy } = workerData;
  const { ASSAYS } = await import("../web/src/colony/assays.ts");
  const { DEFAULT_FIGHT } = await import("../web/src/colony/battle.ts");
  const cfg = { colony: {}, rival: {}, game: {} };
  for (const [k, v] of Object.entries(set)) {
    const [head, ...rest] = k.split(".");
    if (!(head in cfg)) throw new Error(`--set ${k}: keys start with colony., rival. or game.`);
    if (head === "game" && rest[0] === "fight") cfg.game.fight ??= { ...DEFAULT_FIGHT };
    setPath(cfg[head], rest.join("."), v);
  }
  if (policy.startsWith("cache:")) {
    const { localPolicy, localStance } = await import("../web/src/colony/colony.ts");
    const { situationKey, stanceKey } = await import("../web/src/colony/colonyBrain.ts");
    const cache = JSON.parse(readFileSync(policy.slice(6), "utf8"));
    const modes = cache.modes ?? {};
    const stances = cache.stances ?? {};
    cfg.policy = (s) => modes[situationKey(s)] ?? localPolicy(s);
    cfg.stance = (s) => stances[stanceKey(s)] ?? localStance(s);
  } else if (policy !== "local") throw new Error(`--policy ${policy}: local or cache:<file>`);
  const out = [];
  for (const id of ids) out.push({ id, run: ASSAYS.find((a) => a.id === id).run(seed, cfg, short) });
  parentPort.postMessage(out);
}
