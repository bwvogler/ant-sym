// Offline, no key, no spend: which of Jev's cached answers cost what. Takes a cache that
// scripts/colony-live.mjs wrote, finds every answer that differs from the local rule (modes,
// stances, responses), groups them (lane, the ant's mode or the colony's stance, local → Jev),
// and replays an assay once with the whole cache and once per group with that group put back to
// the local rule, through scripts/experiment.mjs --policy cache:. A group whose reversal brings
// food home up is what cost it.
//
// Usage: node scripts/ablate.mjs <cache.json> [--assay game] [--seconds 300] [--seeds 1-5]
//          [--jobs N] [--top N] [--match <regex>]
//   --top: replay only the N largest groups; --match: only groups whose name matches (default: all)
//
// Writes the cache variants and each replay's JSON under experiments/out/ablate/<cache name>/.
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
// The cache is the one argument that is neither a flag nor a flag's value (review of #36: "--assay game cache.json"
// read "game" as the cache).
const file = args.find((a, k) => !a.startsWith("--") && !(k > 0 && args[k - 1].startsWith("--")));
if (!file) {
  console.error("usage: node scripts/ablate.mjs <cache.json> [--assay game] [--seconds 300] [--seeds 1-5] [--jobs N] [--top N]");
  process.exit(1);
}
const opt = (name, dflt) => {
  const k = args.indexOf(`--${name}`);
  return k < 0 ? dflt : args[k + 1];
};
const assay = opt("assay", "game");
const seconds = opt("seconds", "300");
const seeds = opt("seeds", "1-5");
const jobs = opt("jobs", undefined);
const top = Number(opt("top", "0"));
const match = opt("match", undefined);

const { localPolicy, localStance } = await import("../web/src/colony/colony.ts");
const { localResponses } = await import("../web/src/colony/responses.ts");

const cache = JSON.parse(readFileSync(file, "utf8"));
const outDir = join(root, "experiments", "out", "ablate", `${basename(file, ".json")}-${opt("assay", "game")}-${opt("seconds", "300")}`);
mkdirSync(outDir, { recursive: true });

// The local rule's answer for a cached key, by parsing the key back into its situation.
const local = {
  modes: (k) => {
    const [mode, tired, foodTrail, homeTrail, alarm, enemy, stance] = k.split("|");
    return localPolicy({ mode, tired: tired === "tired", foodTrail, homeTrail, alarm, enemy, stance });
  },
  stances: (k) => {
    const [stance, ants, losses, enemy, foodLeft, larder] = k.split("|");
    return localStance({ stance, ants, losses, enemyNearNest: enemy === "enemy", foodLeft, larder });
  },
  response: (hook, k) => {
    const [mode, carrying, porter, digging, place, offered, enemy, stance] = k.split("|");
    return localResponses[hook]({ mode, carrying, porter: porter === "porter", digging: digging === "digging", place, offered, enemy: enemy === "enemy", stance });
  },
};

// Every disagreement, grouped: lane, then the ant's mode (modes) or the colony's stance (stances) or the hook and
// what it holds or is offered (responses), then local → Jev.
const groups = new Map();
const add = (g, lane, key) => {
  if (!groups.has(g)) groups.set(g, []);
  groups.get(g).push({ lane, key });
};
for (const [k, v] of Object.entries(cache.modes ?? {})) {
  const l = local.modes(k);
  if (l !== v) add(`mode: ${k.split("|")[0]}${k.split("|")[1] === "tired" ? " tired" : ""} (stance ${k.split("|")[6]}) ${l} → ${v}`, "modes", k);
}
for (const [k, v] of Object.entries(cache.stances ?? {})) {
  const l = local.stances(k);
  if (l !== v) add(`stance: ${l} → ${v}`, "stances", k);
}
for (const [hook, table] of Object.entries(cache.responses ?? {}))
  for (const [k, v] of Object.entries(table)) {
    const l = local.response(hook, k);
    if (l !== v) {
      const f = k.split("|");
      add(`${hook}: ${hook === "get" ? `offered ${f[5]}` : `carrying ${f[1]}`} ${l} → ${v}`, `responses.${hook}`, k);
    }
  }

/** The cache with some entries put back to the local rule (deleted: a replay falls back to it). */
const without = (entries) => {
  const c = structuredClone(cache);
  for (const { lane, key } of entries) {
    if (lane.startsWith("responses.")) delete c.responses[lane.slice(10)][key];
    else delete c[lane][key];
  }
  return c;
};

const run = (name, c) => {
  const cf = join(outDir, `${name}.cache.json`);
  const jf = join(outDir, `${name}.json`);
  writeFileSync(cf, JSON.stringify(c));
  execFileSync(process.execPath, [join(root, "scripts", "experiment.mjs"), assay, "--seeds", seeds, "--seconds", seconds, "--policy", `cache:${cf}`, "--json", jf, ...(jobs ? ["--jobs", jobs] : [])], { stdio: ["ignore", "ignore", "inherit"] });
  const runs = JSON.parse(readFileSync(jf, "utf8"))[0].runs;
  return { stored: runs.map((r) => r.metrics["you.stored"]), held: Math.max(...runs.map((r) => r.metrics["you.maxHeld"] ?? 0)) };
};

const sum = (a) => a.reduce((x, y) => x + y, 0);
const ordered = [...groups.entries()].sort((a, b) => b[1].length - a[1].length);
const matched = match ? ordered.filter(([g]) => new RegExp(match).test(g)) : ordered;
const chosen = top > 0 ? matched.slice(0, top) : matched;
console.log(`${file}: ${sum(ordered.map(([, e]) => e.length))} answers differ from the local rule, in ${ordered.length} groups; replaying ${assay} (${seconds} s, seeds ${seeds}) ${chosen.length + 2} times.\n`);

const allLocal = { ...structuredClone(cache), modes: {}, stances: {}, responses: {} };
const base = run("all", cache);
const loc = run("local", allLocal);
console.log(`| replay | food home (sum) | per seed | Δ vs all of Jev | held over 120 s, most |\n|---|---|---|---|---|`);
const row = (name, r) => console.log(`| ${name} | ${sum(r.stored)} | ${r.stored.join(", ")} | ${name === "all of Jev's answers" ? "–" : `${sum(r.stored) - sum(base.stored) >= 0 ? "+" : ""}${sum(r.stored) - sum(base.stored)}`} | ${r.held} |`);
row("all of Jev's answers", base);
row("the local rule", loc);
const results = [];
for (const [g, entries] of chosen) {
  const r = run(`g${results.length}`, without(entries));
  results.push({ g, n: entries.length, r });
  row(`without ${g} (${entries.length})`, r);
}
writeFileSync(join(outDir, "ablation.json"), JSON.stringify({ assay, seconds, seeds, base, local: loc, groups: results.map((x) => ({ group: x.g, answers: ordered.find(([g]) => g === x.g)[1].map((e) => e.key), ...x.r })) }, null, 1));
