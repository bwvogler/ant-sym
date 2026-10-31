// Offline, no key, no spend: how many distinct situations does a formation
// actually ask about? Runs the real sim headless with a stand-in for Jev
// (greedy, like the local rule: stay where there is room, else the wanting
// neighbour, else the far hint, else the attractor) and counts what the cached schema would send against what
// the compass schema sends (one question pair per ant decision). Jev's own
// answers differ from the stand-in, so the counts are an estimate of the
// miss curve, not of Jev's steering; the live check is scripts/cacheprobe.mjs.
//
// Usage: node scripts/situations.mjs [word ...]   (default: ANTS JEV ANTS, run back to back, cache kept)
import { Engine } from "../web/src/sim/engine.ts";
import { normalizeTarget } from "../web/src/sim/grid.ts";
import { antState, applyDecision, packRequest, readDecision } from "../web/src/sim/jevBrain.ts";
import { answersFor, canonicalState, PolicyCache, situationKey } from "../web/src/sim/policyCache.ts";

const SIZE = { w: 96, h: 64 };
const ANTS = 1000;
const DT = 1 / 30;
const CYCLE = 0.2; // scheduler interval, s
const LATENCY = 0.4; // a Jev round trip, s (PRD §8.5: ~300–500 ms)
const MIN_AGE = 1.5;
const TOKENS_PER_ANT = 296; // measured, compass schema (PRD §8.1b)

// A 5×7 block font for the demo words.
const FONT = {
  A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  N: ["10001", "11001", "10101", "10011", "10001", "10001", "10001"],
  T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
  S: ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
  J: ["00111", "00010", "00010", "00010", "00010", "10010", "01100"],
  E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
  V: ["10001", "10001", "10001", "10001", "10001", "01010", "00100"],
};

function wordTarget(word) {
  const glyphs = [...word.toUpperCase()].map((c) => FONT[c]).filter(Boolean);
  const cols = glyphs.length * 6 - 1;
  const k = Math.floor(Math.min((SIZE.w * 0.9) / cols, (SIZE.h * 0.8) / 7));
  const x0 = Math.floor((SIZE.w - cols * k) / 2);
  const y0 = Math.floor((SIZE.h - 7 * k) / 2);
  const dark = new Float32Array(SIZE.w * SIZE.h);
  glyphs.forEach((g, gi) => {
    for (let r = 0; r < 7; r++)
      for (let c = 0; c < 5; c++)
        if (g[r][c] === "1")
          for (let dy = 0; dy < k; dy++) for (let dx = 0; dx < k; dx++) dark[(y0 + r * k + dy) * SIZE.w + x0 + (gi * 6 + c) * k + dx] = 1;
  });
  return normalizeTarget(dark, ANTS);
}

const CELL = ["NW", "N", "NE", "W", "", "E", "SW", "S", "SE"];
/** The stand-in: what a greedy Jev would answer for a (canonical) state. */
function standIn(state) {
  let best = -1;
  let bestV = 0.3;
  state.deficit3x3.forEach((v, k) => {
    if (k !== 4 && v > bestV) [best, bestV] = [k, v];
  });
  const choice = state.room >= 0 ? "stay" : best >= 0 ? CELL[best] : (state.far ?? state.attractor ?? "stay");
  return { choice, confidence: 0.8, probabilities: { [choice]: 0.8, stay: choice === "stay" ? 0.8 : 0.2 }, pSettle: state.room >= 0 ? 0.9 : 0.05 };
}

/** One formation from the engine's current positions; returns what each schema would have asked. */
function form(engine, schema, cache) {
  const w = engine.world;
  const parked = new Map(); // ant → answer time
  const asking = new Map(); // key → answer time
  const waiting = new Map(); // key → [{ i, state, transform }]
  let next = 0;
  let asked = 0;
  let hits = 0;
  let requests = 0;
  const t0 = engine.time;
  while (engine.time - t0 < 180) {
    engine.tick(DT);
    if (engine.formed) break;
    if (engine.time < next) continue;
    next = engine.time + CYCLE;
    // land replies that are due
    for (const [i, at] of parked) {
      if (at > engine.time || schema !== "compass") continue;
      parked.delete(i);
      const st = antState(engine, i);
      const a = standIn(st);
      const answers = { [`a${i}_dir`]: { type: "choice", ...a }, [`a${i}_settle`]: { type: "noul", noul: a.pSettle } };
      applyDecision(engine, i, readDecision(answers, `a${i}`, "compass"), st);
    }
    for (const [key, at] of asking) {
      if (at > engine.time) continue;
      asking.delete(key);
      cache.put(key, standIn(canonicalState(key)));
      for (const p of waiting.get(key) ?? []) {
        const d = readDecision(answersFor(`a${p.i}`, cache.get(key), p.transform), `a${p.i}`, "cached");
        applyDecision(engine, p.i, d, p.state);
      }
      waiting.delete(key);
    }
    // schedule
    let sent = 0;
    for (const i of engine.dueAnts()) {
      if (w.commit[i] >= 1e9) continue;
      if (engine.time - w.decidedAt[i] < MIN_AGE) continue; // both schemas keep the cadence (see jevScheduler.ts)
      if (schema === "compass") {
        parked.set(i, engine.time + LATENCY);
        w.commit[i] = 1e9;
        asked++;
        sent++;
        continue;
      }
      const state = antState(engine, i);
      const { key, transform } = situationKey(state);
      const hit = cache.get(key);
      if (hit) {
        applyDecision(engine, i, readDecision(answersFor(`a${i}`, hit, transform), `a${i}`, "cached"), state);
        hits++;
        continue;
      }
      if (!asking.has(key)) {
        asking.set(key, engine.time + LATENCY);
        asked++;
        sent++;
      }
      waiting.set(key, [...(waiting.get(key) ?? []), { i, state, transform }]);
      w.commit[i] = 1e9;
    }
    requests += Math.ceil(sent / 100);
  }
  return { seconds: engine.time - t0, formed: engine.formed, asked, hits, requests };
}

function run(schema, words) {
  const engine = new Engine({ size: SIZE, antCount: ANTS, brain: "jev" }, mulberry(7));
  engine.jevOwned.fill(1);
  const cache = new PolicyCache("offline");
  const rows = [];
  words.forEach((word, k) => {
    engine.setTarget(wordTarget(word));
    if (k === 0) engine.scatter();
    rows.push({ word: k === 0 ? `${word} from scatter` : `morph → ${word}`, ...form(engine, schema, cache) });
  });
  return { rows, situations: cache.size };
}

function mulberry(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Tokens per situation, from request size: the same states packed per ant (compass) and per situation (cached).
const probe = new Engine({ size: SIZE, antCount: ANTS }, mulberry(3));
probe.setTarget(wordTarget("ANTS"));
const states = Array.from({ length: 100 }, (_, i) => antState(probe, i));
const antBytes = JSON.stringify(packRequest(states.map((s, i) => ({ id: `a${i}`, state: s })), "compass")).length;
const sitBytes = JSON.stringify(packRequest(states.map((s, i) => ({ id: `s${i}`, state: canonicalState(situationKey(s).key) })), "cached")).length;
const tokensPerSituation = Math.round(TOKENS_PER_ANT * (sitBytes / antBytes));

const words = process.argv.slice(2).length ? process.argv.slice(2) : ["ANTS", "JEV", "ANTS"];
const usd = (tok) => `$${((tok * 0.042) / 1e6).toFixed(4)}`;
console.log(`grid ${SIZE.w}×${SIZE.h}, ${ANTS} ants, stand-in Jev, latency ${LATENCY}s; ~${tokensPerSituation} tok per situation (by request size, vs ${TOKENS_PER_ANT} measured per ant)\n`);
for (const schema of ["compass", "cached"]) {
  const { rows, situations } = run(schema, words);
  const per = schema === "compass" ? TOKENS_PER_ANT : tokensPerSituation;
  console.log(`${schema}${schema === "cached" ? ` (${situations} situations cached by the end)` : ""}`);
  for (const r of rows) {
    const tok = r.asked * per;
    console.log(`  ${r.word.padEnd(18)} ${r.formed ? "formed" : "NOT formed"} in ${r.seconds.toFixed(1).padStart(5)} s · ${String(r.asked).padStart(6)} ${schema === "compass" ? "ant decisions" : "situations"} asked · ${String(r.hits).padStart(6)} hits · ${String(r.requests).padStart(4)} requests · ~${(tok / 1e6).toFixed(3)}M tok ≈ ${usd(tok)}`);
  }
}
