// Offline, no key, no spend: what would Jev cost a game? Runs the game
// headless for a play session — your colony against the rival's — with a
// stand-in for Jev (the local rule and the local strategist, so the colony
// behaves the same) behind the real cache logic: each new (doctrine, ant
// situation) and each new (doctrine, strategist view) is one question, asked
// once. You retune the doctrine every couple of minutes, back to one used
// before at the end, and paint alarm now and then. The rival plays the local
// rule (free). Tokens per question are estimated from request size
// (colonyBrain.estimateTokens); the ledger counts the real ones live.
// The ant's small responses (get, carry, drop, trail: responses.ts) are
// costed the same way, as if each were its own Jev lane; they are not asked
// live yet, so they are reported apart from the session total.
//
// Usage: node scripts/colony-cost.mjs [minutes=10] [ants=800] [seed=1]
import { localPolicy, localStance } from "../web/src/colony/colony.ts";
import { DOCTRINES, estimateTokens, packModeRequest, packResponseRequest, packStanceRequest, policyContext, RESPONSE_HOOKS, responseContext, situationKey, stanceContext, stanceKey } from "../web/src/colony/colonyBrain.ts";
import { localResponses, responses, touchKey } from "../web/src/colony/responses.ts";
import { Game } from "../web/src/colony/game.ts";
import { generateWorld, mulberry32 } from "../web/src/colony/world.ts";

const [minutes = 10, ants = 600, seed = 1] = process.argv.slice(2).map(Number);
const USD = 0.042 / 1e6;
const DT = 1 / 30;
const BATCH_EVERY = 0.3; // s, the client's interval

const map = generateWorld(seed);
let doctrine = DOCTRINES[0].text;
let tokens = 0;
let requests = 0;
let questions = 0;
const phases = [];

/** One kind of question, cached per doctrine like ui/colonyJev.ts. */
function lane(key, pack, contextOf, local) {
  const asked = new Map(); // context → Set of keys
  const queue = new Map(); // key → situation, waiting for the next batch
  return {
    asked,
    policy: (s) => {
      const k = key(s);
      if (!asked.get(contextOf(doctrine))?.has(k)) queue.set(k, { ...s }); // a copy: responses share one Touch object
      return local(s); // the stand-in's answer, and what the colony does until Jev answers
    },
    tokens: 0,
    flush(counted = true) {
      const context = contextOf(doctrine);
      const set = asked.get(context) ?? new Set();
      asked.set(context, set);
      const items = [...queue.entries()].filter(([k]) => !set.has(k));
      queue.clear();
      for (let b = 0; b < items.length; b += 100) {
        const chunk = items.slice(b, b + 100);
        const tok = estimateTokens(pack(chunk.map(([, s], n) => ({ id: `s${n}`, situation: s })), doctrine));
        this.tokens += tok;
        if (counted) {
          tokens += tok;
          requests++;
          questions += chunk.length;
        }
        for (const [k] of chunk) set.add(k);
      }
    },
    clear: () => queue.clear(),
    seen: (context) => asked.get(context)?.size ?? 0,
  };
}
const modes = lane(situationKey, packModeRequest, policyContext, localPolicy);
const stances = lane(stanceKey, packStanceRequest, stanceContext, localStance);
const hooks = Object.fromEntries(RESPONSE_HOOKS.map((h) => [h, lane(touchKey, (items, d) => packResponseRequest(h, items, d), (d) => responseContext(h, d), localResponses[h])]));
const game = new Game(map, { antCount: ants, rivalAnts: ants }, mulberry32(seed + 7), {
  policy: modes.policy,
  stance: stances.policy,
  responses: responses(Object.fromEntries(RESPONSE_HOOKS.map((h) => [h, hooks[h].policy]))),
});
const colony = game.player;
const flush = () => {
  modes.flush();
  stances.flush();
  for (const h of RESPONSE_HOOKS) hooks[h].flush(false);
};

// The session: a doctrine for each slice of time, the first one again at the end (should be free).
const plan = [DOCTRINES[0], DOCTRINES[1], DOCTRINES[2], { id: "custom", name: "Custom", text: "Hoard food: follow any food scent, even faint; explore otherwise; flee home at strong alarm." }, DOCTRINES[0]];
const slice = (minutes * 60) / plan.length;
const rng = mulberry32(seed + 99);
let next = 0;
let t = 0;
for (const d of plan) {
  doctrine = d.text;
  modes.clear();
  stances.clear();
  for (const h of RESPONSE_HOOKS) hooks[h].clear();
  colony.reconsider();
  const before = { tokens, requests, modes: modes.seen(policyContext(doctrine)), stances: stances.seen(stanceContext(doctrine)) };
  const end = t + slice;
  for (; t < end; t += DT) {
    game.tick(DT);
    if (t >= next) {
      flush();
      next = t + BATCH_EVERY;
    }
    // The fungus paints a blot of alarm somewhere every ~20 s.
    if (rng() < DT / 20) colony.paint("alarm", rng() * map.size.w, rng() * map.size.h, 3, 12);
  }
  flush();
  phases.push({ name: d.name, newSituations: modes.seen(policyContext(doctrine)) - before.modes, newStances: stances.seen(stanceContext(doctrine)) - before.stances, tokens: tokens - before.tokens, requests: requests - before.requests });
}

const usd = (n) => `$${(n * USD).toFixed(5)}`;
const r = game.rival;
console.log(`game cost, offline: seed ${seed}, ${ants} + ${ants} ants, ${minutes} sim-minutes, ${plan.length} doctrines (the first again at the end), alarm painted every ~20 s`);
console.log(`you: ${colony.population} ants, ${colony.stored} food home, ${colony.losses} lost · rival: ${r ? `${r.population} ants, ${r.stored} food home, ${r.losses} lost` : "none"} · ${game.outcome()}`);
console.log(`${colony.decisions.toLocaleString()} mode choices in ${colony.situationsSeen} distinct situations; ${game.strategyChoices / game.colonies.length} stance choices each\n`);
for (const p of phases) console.log(`  ${p.name.padEnd(9)} ${String(p.newSituations).padStart(4)} ant situations + ${String(p.newStances).padStart(2)} stance views · ${String(p.requests).padStart(3)} requests · ~${p.tokens.toLocaleString().padStart(7)} tok ≈ ${usd(p.tokens)}`);
console.log(`\ntotal ~${tokens.toLocaleString()} tok ≈ ${usd(tokens)} for the session (~${Math.round(tokens / Math.max(1, questions))} tok per question, ${Math.round(colony.decisions / Math.max(1, questions))} mode choices per question)`);
console.log(`≈ ${usd((tokens * 60) / minutes)} per hour at this pace of retuning (one every ${(slice / 60).toFixed(1)} min); target ≤ $0.25/h`);
console.log(`\nresponse lanes, if each were asked like the modes (not live yet; not in the total above):`);
for (const h of RESPONSE_HOOKS) {
  const seen = plan.reduce((n, d, k) => n + (plan.findIndex((x) => x.text === d.text) === k ? hooks[h].seen(responseContext(h, d.text)) : 0), 0);
  console.log(`  ${h.padEnd(6)} ${String(seen).padStart(3)} situations over the doctrines · ~${hooks[h].tokens.toLocaleString().padStart(6)} tok ≈ ${usd(hooks[h].tokens)}`);
}
