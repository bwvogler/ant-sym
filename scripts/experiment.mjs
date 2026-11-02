// Offline, no key, no spend: run behaviour assays (web/src/colony/experiment.ts)
// over seeds and parameter values, and print each metric's median and range
// across seeds, with how many seeds passed the assay's mark.
//
// Usage: node scripts/experiment.mjs <assay ...|all> [--seeds 1-10] [--seconds N]
//          [--set colony.deposit=2,4,8] [--set game.fight.rate=1,2] [--json out.json]
//          [--policy cache:<file>]
//
// --set takes a dotted path under colony / rival / game and a comma list of
// values; several --set flags run their cross product. Pheromone channels are
// colony.channels.<food|home|alarm>.<evaporation|diffusion>.
//
// --policy cache:<file> replays Jev's cached answers for the player's colony
// ({ modes: { situationKey: mode }, stances: { stanceKey: stance }, responses:
// { hook: { touchKey: answer } } }, as scripts/colony-live.mjs saves them):
// free, offline, over every seed. Anything the cache lacks falls back to the
// local rule; an assay that sets its own brains (A6's raiders) keeps them.
import { readFileSync, writeFileSync } from "node:fs";
import { localPolicy, localStance } from "../web/src/colony/colony.ts";
import { responsesFromAnswers, situationKey, stanceKey } from "../web/src/colony/colonyBrain.ts";
import { ASSAYS, runAssay } from "../web/src/colony/experiment.ts";

const args = process.argv.slice(2);
const ids = [];
let seeds = range("1-10");
let seconds;
let json;
let brains = {};
const sets = [];
for (let k = 0; k < args.length; k++) {
  const a = args[k];
  if (a === "--seeds") seeds = range(args[++k]);
  else if (a === "--seconds") seconds = Number(args[++k]);
  else if (a === "--json") json = args[++k];
  else if (a === "--policy") brains = loadPolicy(args[++k]);
  else if (a === "--set") {
    const [path, values] = args[++k].split("=");
    sets.push({ path, values: values.split(",").map(parse) });
  } else ids.push(a);
}
const chosen = ids.length === 0 || ids.includes("all") ? ASSAYS : ids.map((id) => ASSAYS.find((x) => x.id === id) ?? fail(`no assay "${id}" (have: ${ASSAYS.map((x) => x.id).join(", ")})`));

/** The player's brains from `local` (the default) or `cache:<file>`. */
function loadPolicy(spec) {
  if (spec === "local") return {};
  if (!spec.startsWith("cache:")) fail(`--policy ${spec}: local or cache:<file>`);
  const cache = JSON.parse(readFileSync(spec.slice(6), "utf8"));
  const modes = cache.modes ?? {};
  const stances = cache.stances ?? {};
  return {
    policy: (s) => modes[situationKey(s)] ?? localPolicy(s),
    stance: (s) => stances[stanceKey(s)] ?? localStance(s),
    responses: responsesFromAnswers(cache.responses ?? {}),
  };
}

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
function combos() {
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

const median = (a) => {
  const s = [...a].sort((x, y) => x - y);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const fmt = (v) => (Number.isNaN(v) ? "–" : Math.abs(v) >= 100 ? v.toFixed(0) : Math.abs(v) >= 10 ? v.toFixed(1) : v.toFixed(2));

const all = [];
for (const assay of chosen) {
  console.log(`\n## ${assay.title}\n\nTarget: ${assay.target}. Seeds ${seeds[0]}–${seeds.at(-1)}, ${seconds ?? assay.seconds} s.\n`);
  for (const { label, o } of combos()) {
    const runs = seeds.map((seed) => runAssay(assay, seed, { ...o, ...brains }, seconds));
    all.push({ assay: assay.id, label, overrides: o, runs });
    const keys = Object.keys(runs[0].metrics).filter((k) => k !== "pass");
    const passes = runs.filter((r) => r.metrics.pass === 1).length;
    const hasPass = runs.some((r) => "pass" in r.metrics);
    console.log(`**${label}**${hasPass ? ` — pass ${passes}/${runs.length}` : ""}\n`);
    console.log("| metric | median | min | max |\n|---|---|---|---|");
    for (const k of keys) {
      const v = runs.map((r) => r.metrics[k]).filter((x) => x !== undefined && !Number.isNaN(x));
      if (v.length === 0) console.log(`| ${k} | – | – | – |`);
      else console.log(`| ${k} | ${fmt(median(v))} | ${fmt(Math.min(...v))} | ${fmt(Math.max(...v))} |`);
    }
    const ms = runs.map((r) => r.msPerTick);
    console.log(`| ms/tick | ${fmt(median(ms))} | ${fmt(Math.min(...ms))} | ${fmt(Math.max(...ms))} |\n`);
  }
}
if (json) writeFileSync(json, JSON.stringify(all, null, 1));
