// Offline, no key, no spend: what would Jev cost the colony? Runs the colony
// headless for a play session with a stand-in for Jev (the local rule, so
// the ants behave the same) behind the real cache logic: each new
// (doctrine, situation) is one question, asked once. The player retunes the
// doctrine every couple of minutes, back to one used before at the end, and
// paints alarm now and then. Tokens per question are estimated from request
// size (colonyBrain.estimateTokens); the ledger counts the real ones live.
//
// Usage: node scripts/colony-cost.mjs [minutes=10] [ants=800] [seed=1]
import { Colony, localPolicy } from "../web/src/colony/colony.ts";
import { DOCTRINES, estimateTokens, packModeRequest, policyContext, situationKey } from "../web/src/colony/colonyBrain.ts";
import { generateWorld, mulberry32 } from "../web/src/colony/world.ts";

const [minutes = 10, ants = 800, seed = 1] = process.argv.slice(2).map(Number);
const USD = 0.042 / 1e6;
const DT = 1 / 30;
const BATCH_EVERY = 0.3; // s, the client's interval

const map = generateWorld(seed);
const asked = new Map(); // context → Set of situation keys
const queue = new Map(); // key → situation, waiting for the next batch
let doctrine = DOCTRINES[0].text;
let context = policyContext(doctrine);
let tokens = 0;
let requests = 0;
const phases = [];

const policy = (s) => {
  const key = situationKey(s);
  if (!asked.get(context)?.has(key)) queue.set(key, s);
  return localPolicy(s); // the stand-in's answer, and what the ant does until Jev answers
};
const colony = new Colony(map, { antCount: ants }, mulberry32(seed + 7), policy);

function flush() {
  if (queue.size === 0) return;
  const set = asked.get(context) ?? new Set();
  asked.set(context, set);
  const items = [...queue.entries()].filter(([k]) => !set.has(k));
  queue.clear();
  for (let b = 0; b < items.length; b += 100) {
    const chunk = items.slice(b, b + 100);
    tokens += estimateTokens(packModeRequest(chunk.map(([, s], n) => ({ id: `s${n}`, situation: s })), doctrine));
    requests++;
    for (const [k] of chunk) set.add(k);
  }
}

// The session: a doctrine for each slice of time, the first one again at the end (should be free).
const plan = [DOCTRINES[0], DOCTRINES[1], DOCTRINES[2], { id: "custom", name: "Custom", text: "Hoard food: follow any food scent, even faint; explore otherwise; flee home at strong alarm." }, DOCTRINES[0]];
const slice = (minutes * 60) / plan.length;
const rng = mulberry32(seed + 99);
let next = 0;
let t = 0;
for (const d of plan) {
  doctrine = d.text;
  context = policyContext(doctrine);
  queue.clear();
  colony.reconsider();
  const before = { tokens, requests, asked: asked.get(context)?.size ?? 0 };
  const end = t + slice;
  for (; t < end; t += DT) {
    colony.tick(DT);
    if (t >= next) {
      flush();
      next = t + BATCH_EVERY;
    }
    // The fungus paints a blot of alarm somewhere every ~20 s.
    if (rng() < DT / 20) colony.paint("alarm", rng() * map.size.w, rng() * map.size.h, 3, 12);
  }
  flush();
  phases.push({ name: d.name, newSituations: (asked.get(context)?.size ?? 0) - before.asked, tokens: tokens - before.tokens, requests: requests - before.requests });
}

const usd = (n) => `$${(n * USD).toFixed(5)}`;
console.log(`colony cost, offline: seed ${seed}, ${ants} ants, ${minutes} sim-minutes, ${plan.length} doctrines (the first again at the end), alarm painted every ~20 s`);
console.log(`stored ${colony.stored} of ${map.foodTotal} food; ${colony.decisions.toLocaleString()} mode choices in ${colony.situationsSeen} distinct situations\n`);
for (const p of phases) console.log(`  ${p.name.padEnd(9)} ${String(p.newSituations).padStart(4)} new situations · ${String(p.requests).padStart(3)} requests · ~${p.tokens.toLocaleString().padStart(7)} tok ≈ ${usd(p.tokens)}`);
const perQuestion = Math.round(tokens / Math.max(1, [...asked.values()].reduce((a, s) => a + s.size, 0)));
console.log(`\ntotal ~${tokens.toLocaleString()} tok ≈ ${usd(tokens)} for the session (~${perQuestion} tok per question, ${(colony.decisions / Math.max(1, [...asked.values()].reduce((a, s) => a + s.size, 0))).toFixed(0)} mode choices per question)`);
console.log(`≈ ${usd((tokens * 60) / minutes)} per hour at this pace of retuning (one every ${(slice / 60).toFixed(1)} min); target ≤ $0.25/h`);
