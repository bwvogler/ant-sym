// Offline, no key, no spend: run behaviour assays (web/src/colony/experiment.ts)
// over seeds and parameter values, and print each metric's median and range
// across seeds, with how many seeds passed the assay's mark. Runs (one per
// assay, combination and seed) go to a pool of worker threads.
//
// Usage: node scripts/experiment.mjs <assay ...|all> [--one] [--seeds 1-10] [--seconds N]
//          [--set colony.deposit=2,4,8] [--set game.fight.rate=1,2] [--json out.json] [--jobs N]
//          [--policy cache:<file>]
//
// --one reruns the assays on one world (experiment.ts ONE_ASSAYS, docs/one-world.md U6a): each arena made the plane,
// with a hole at each nest and the curtain under the line through them (oneArena); A8 in the curtain; G1 (game1), the
// whole one-world game. The ids are the legacy ones; those not rerun yet (ONE_PENDING: A11, A12) are listed
// with why. Without --one, `game1` still names G1.
//
// --set takes a dotted path under colony / rival / game and a comma list of
// values; several --set flags run their cross product. Pheromone channels are
// colony.channels.<food|home|alarm|noEntry>.<evaporation|diffusion>.
//
// --policy cache:<file> replays Jev's cached answers for the first colony
// (scripts/colony-live.mjs writes them: modes, stances and responses, with
// the brain versions they were asked under). A cache asked under other
// versions is refused (its keys would match nothing, or the wrong
// situations). Anything the cache lacks falls back to the local rule, so each
// result says how much of it was Jev: cache hits per lane. An assay that sets
// its own policy or stance (A6's raiders) keeps it.
import { readFileSync, writeFileSync } from "node:fs";
import { availableParallelism } from "node:os";
import { isMainThread, parentPort, Worker, workerData } from "node:worker_threads";

if (isMainThread) await main();
else await work();

function fail(msg) {
  console.error(msg);
  process.exit(1);
}

function range(s) {
  return s.split(",").flatMap((part) => {
    const [a, b] = part.split("-").map(Number);
    return b === undefined ? [a] : Array.from({ length: b - a + 1 }, (_, i) => a + i);
  });
}

function parse(v) {
  if (v === "true" || v === "false") return v === "true";
  const n = Number(v);
  return Number.isNaN(n) ? v : n;
}

/** Every combination of the --set values, as override objects ({} when there are none). */
function combos(sets) {
  let out = [{ label: "default", o: {} }];
  for (const { path, values } of sets)
    out = out.flatMap((c) =>
      values.map((v) => {
        const o = structuredClone(c.o);
        const keys = path.split(".");
        let at = o;
        for (const key of keys.slice(0, -1)) at = at[key] ??= {};
        at[keys.at(-1)] = v;
        return { label: c.label === "default" ? `${path}=${v}` : `${c.label} ${path}=${v}`, o };
      }),
    );
  return out;
}

async function main() {
  const args = process.argv.slice(2);
  const ids = [];
  let seeds = range("1-10");
  let seconds;
  let json;
  let jobs = availableParallelism();
  let policy = null;
  let one = false;
  const sets = [];
  for (let k = 0; k < args.length; k++) {
    const a = args[k];
    if (a === "--seeds") seeds = range(args[++k]);
    else if (a === "--seconds") seconds = Number(args[++k]);
    else if (a === "--json") json = args[++k];
    else if (a === "--jobs") jobs = Number(args[++k]);
    else if (a === "--policy") policy = args[++k];
    else if (a === "--one") one = true;
    else if (a === "--set") {
      const [path, values] = args[++k].split("=");
      sets.push({ path, values: values.split(",").map(parse) });
    } else if (a.startsWith("--")) fail(`unknown option ${a}`);
    else ids.push(a);
  }
  const { ASSAYS, ONE_ASSAYS, ONE_PENDING } = await import("../web/src/colony/experiment.ts");
  // Each chosen assay with the list it is run from (the worker finds it there): one world's, or the legacy ones (G1 only in one world's).
  const list = one ? ONE_ASSAYS : ASSAYS;
  const pending = [];
  const pick = (id) => {
    const a = list.find((x) => x.id === id) ?? (one ? null : ONE_ASSAYS.find((x) => x.id === id && !ASSAYS.some((y) => y.id === id)));
    if (a) return { assay: a, one: one || !ASSAYS.includes(a) };
    if (one && ONE_PENDING[id]) pending.push(id);
    else
      fail(
        `no assay "${id}"${one ? " on one world" : ""} (have: ${[...list, ...(one ? [] : ONE_ASSAYS.filter((x) => !ASSAYS.some((y) => y.id === x.id)))].map((x) => x.id).join(", ")})`,
      );
    return null;
  };
  const all = ids.length === 0 || ids.includes("all");
  if (all && one) pending.push(...Object.keys(ONE_PENDING));
  const picked = all ? list.map((a) => ({ assay: a, one })) : ids.map(pick).filter(Boolean);
  const chosen = picked.map((p) => p.assay);
  const cs = combos(sets);
  if (policy) {
    if (!policy.startsWith("cache:")) fail(`--policy ${policy}: cache:<file>`);
    const cache = loadCache(policy.slice(6));
    const { cacheContexts, COLONY_BRAIN_VERSION, STANCE_BRAIN_VERSION, RESPONSE_BRAIN_VERSION } =
      await import("../web/src/colony/index.ts");
    const want = { colony: COLONY_BRAIN_VERSION, stance: STANCE_BRAIN_VERSION, response: RESPONSE_BRAIN_VERSION };
    if (JSON.stringify(cache.version) !== JSON.stringify(want))
      fail(
        `${policy.slice(6)} was asked under brain versions ${JSON.stringify(cache.version)}; the code is at ${JSON.stringify(want)}. Ask afresh (scripts/colony-live.mjs).`,
      );
    // Versions are bumped by hand; the contexts (legend, question wording, doctrine) catch an edit made without a bump.
    if (JSON.stringify(cache.contexts) !== JSON.stringify(cacheContexts(cache.doctrine?.text ?? "")))
      fail(
        `${policy.slice(6)} was asked under other questions or another doctrine than the code's (cache contexts differ). Ask afresh (scripts/colony-live.mjs).`,
      );
    const n = (t) => Object.keys(t ?? {}).length;
    console.log(
      `Replaying Jev's answers under the doctrine "${cache.doctrine?.name ?? "?"}" (${cache.view ?? "?"} view, seed ${cache.seed}): ${n(cache.modes)} modes, ${n(cache.stances)} stances, ${Object.entries(
        cache.responses ?? {},
      )
        .map(([h, t]) => `${n(t)} ${h}`)
        .join(", ")}.`,
    );
  }

  // One job per assay, combination and seed; the longest assays first, so the pool ends together.
  const secondsOf = (id) => chosen.find((x) => x.id === id).seconds;
  const queue = [];
  for (const { assay, one: inOne } of picked)
    for (const [ci, c] of cs.entries())
      for (const seed of seeds) queue.push({ id: assay.id, one: inOne, ci, o: c.o, seed, seconds, policy });
  queue.sort((a, b) => secondsOf(b.id) - secondsOf(a.id));
  const results = new Map(); // `${id}|${ci}` → runs
  const t0 = performance.now();
  let done = 0;
  await Promise.all(
    Array.from({ length: Math.max(1, Math.min(jobs, queue.length)) }, async () => {
      for (let job = queue.shift(); job; job = queue.shift()) {
        const run = await inWorker(job);
        const key = `${job.id}|${job.ci}`;
        if (!results.has(key)) results.set(key, []);
        results.get(key).push(run);
        done++;
        process.stderr.write(`\r${done} runs, ${((performance.now() - t0) / 1000).toFixed(0)} s`);
      }
    }),
  );
  process.stderr.write("\n");

  const median = (a) => {
    const s = [...a].sort((x, y) => x - y);
    const m = s.length >> 1;
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  };
  const fmt = (v) => (Number.isNaN(v) ? "–" : Math.abs(v) >= 100 ? v.toFixed(0) : Math.abs(v) >= 10 ? v.toFixed(1) : v.toFixed(2));
  const out = [];
  for (const id of pending) {
    const title = ASSAYS.find((x) => x.id === id)?.title ?? id;
    console.log(`\n## ${title} (one world)\n\nNot run on one world: ${ONE_PENDING[id]}.`);
    out.push({ assay: id, pending: ONE_PENDING[id] });
  }
  for (const assay of chosen) {
    console.log(`\n## ${assay.title}\n\nTarget: ${assay.target}. Seeds ${seeds[0]}–${seeds.at(-1)}, ${seconds ?? assay.seconds} s.\n`);
    for (const [ci, { label, o }] of cs.entries()) {
      const runs = (results.get(`${assay.id}|${ci}`) ?? []).sort((a, b) => a.seed - b.seed);
      out.push({ assay: assay.id, label, overrides: o, runs });
      const keys = Object.keys(runs[0].metrics).filter((k) => k !== "pass");
      const passes = runs.filter((r) => r.metrics.pass === 1).length;
      const hasPass = runs.some((r) => "pass" in r.metrics);
      console.log(`**${label}**${hasPass ? ` — pass ${passes}/${runs.length}` : ""}\n`);
      console.log("| metric | median | min | max |\n|---|---|---|---|");
      for (const k of keys) {
        const v = runs.map((r) => r.metrics[k]).filter((x) => x !== undefined && x !== null && !Number.isNaN(x));
        if (v.length === 0) console.log(`| ${k} | – | – | – |`);
        else console.log(`| ${k} | ${fmt(median(v))} | ${fmt(Math.min(...v))} | ${fmt(Math.max(...v))} |`);
      }
      const ms = runs.map((r) => r.msPerTick);
      console.log(`| ms/tick | ${fmt(median(ms))} | ${fmt(Math.min(...ms))} | ${fmt(Math.max(...ms))} |\n`);
      if (policy) {
        // How much of the result was Jev: cache hits per lane, over every lookup of every seed.
        const sum = {};
        for (const r of runs)
          for (const [lane, { hit, miss }] of Object.entries(r.lookups ?? {})) {
            const t = (sum[lane] ??= { hit: 0, miss: 0 });
            t.hit += hit;
            t.miss += miss;
          }
        const parts = Object.entries(sum)
          .filter(([, v]) => v.hit + v.miss > 0)
          .map(([lane, v]) => `${lane} ${Math.round((100 * v.hit) / (v.hit + v.miss))} % of ${(v.hit + v.miss).toLocaleString()}`);
        console.log(`Jev's answers (cache hits; the rest the local rule): ${parts.join(", ") || "no lookups"}\n`);
      }
    }
  }
  console.error(
    `${done} runs in ${((performance.now() - t0) / 1000).toFixed(0)} s on ${jobs} threads (ms/tick is per run, with the threads sharing the machine)`,
  );
  if (json) writeFileSync(json, JSON.stringify(out, null, 1));
}

function inWorker(job) {
  return new Promise((resolve, reject) => {
    const w = new Worker(new URL(import.meta.url), { workerData: job });
    w.once("message", resolve);
    w.once("error", reject);
    w.once("exit", (code) => code && reject(new Error(`worker exited with ${code}`)));
  });
}

function loadCache(file) {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch (e) {
    fail(`--policy cache:${file}: ${e.message}`);
  }
}

async function work() {
  const { id, one, o, seed, seconds, policy } = workerData;
  const { ASSAYS, ONE_ASSAYS, runAssay } = await import("../web/src/colony/experiment.ts");
  const lookups = {};
  const count = (lane, hit) => {
    const l = (lookups[lane] ??= { hit: 0, miss: 0 });
    if (hit) l.hit++;
    else l.miss++;
  };
  const brains = {};
  if (policy) {
    const { localPolicy, localStance } = await import("../web/src/colony/index.ts");
    const { responsesFromAnswers, situationKey, stanceKey } = await import("../web/src/colony/index.ts");
    const cache = loadCache(policy.slice(6));
    const lane = (table, key, local, name) => (s) => {
      const a = table?.[key(s)];
      count(name, a !== undefined);
      return a ?? local(s);
    };
    brains.policy = lane(cache.modes, situationKey, localPolicy, "mode");
    brains.stance = lane(cache.stances, stanceKey, localStance, "stance");
    brains.responses = responsesFromAnswers(cache.responses ?? {}, undefined, count);
  }
  const run = runAssay(
    (one ? ONE_ASSAYS : ASSAYS).find((x) => x.id === id),
    seed,
    { ...o, ...brains },
    seconds,
  );
  parentPort.postMessage({ ...run, lookups });
}
