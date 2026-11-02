// Offline, no key, no spend: what would Jev cost a game? Runs the game
// headless for a play session — your colony against the rival's — with a
// stand-in for Jev (the local rule and the local strategist, so the colony
// behaves the same) behind the real cache logic: each new (doctrine, ant
// situation) and each new (doctrine, strategist view) is one question, asked
// once. You retune the doctrine every couple of minutes, back to one used
// before at the end, and paint alarm now and then. The rival plays the local
// rule (free). Tokens per question are estimated from request size
// (colonyBrain.estimateTokens); the ledger counts the real ones live.
// Each response hook (responses.ts) is costed too, as the lane it would be
// if Jev answered it (HOOK_LANES): a question per new view of the fields
// that hook reads, asked when its event fires. Hook lanes are not wired to
// Jev in the client yet; their lines say what each would add.
//
// Usage: node scripts/colony-cost.mjs [minutes=10] [ants=600] [seed=1]
import { localPolicy, localStance } from "../web/src/colony/colony.ts";
import { DOCTRINES, estimateTokens, hookContext, hookKey, localHookAnswer, packHookRequest, packModeRequest, packStanceRequest, policyContext, situationKey, stanceContext, stanceKey } from "../web/src/colony/colonyBrain.ts";
import { HOOKS, localResponses } from "../web/src/colony/responses.ts";
import { newGame } from "../web/src/colony/experiment.ts";
import { mulberry32 } from "../web/src/colony/world.ts";

const [minutes = 10, ants = 600, seed = 1] = process.argv.slice(2).map(Number);
const USD = 0.042 / 1e6;
const DT = 1 / 30;
const BATCH_EVERY = 0.3; // s, the client's interval

let doctrine = DOCTRINES[0].text;
const phases = [];

/** One kind of question, cached per doctrine like ui/colonyJev.ts. */
function lane(key, pack, contextOf, local) {
  const asked = new Map(); // context → Set of keys
  const queue = new Map(); // key → situation, waiting for the next batch
  let context = contextOf(doctrine);
  let set = new Set();
  asked.set(context, set);
  const totals = { tokens: 0, requests: 0, questions: 0 };
  return {
    asked,
    totals,
    policy: (s) => {
      const k = key(s);
      if (!set.has(k) && !queue.has(k)) queue.set(k, { ...s }); // a copy: hook views are reused
      return local(s); // the stand-in's answer, and what the colony does until Jev answers
    },
    /** the doctrine changed: switch to its cache */
    retune() {
      context = contextOf(doctrine);
      set = asked.get(context) ?? new Set();
      asked.set(context, set);
    },
    flush() {
      const items = [...queue.entries()].filter(([k]) => !set.has(k));
      queue.clear();
      for (let b = 0; b < items.length; b += 100) {
        const chunk = items.slice(b, b + 100);
        const t = estimateTokens(pack(chunk.map(([, s], n) => ({ id: `s${n}`, situation: s })), doctrine));
        totals.tokens += t;
        totals.requests++;
        totals.questions += chunk.length;
        for (const [k] of chunk) set.add(k);
      }
    },
    clear: () => queue.clear(),
    seen: (context) => asked.get(context)?.size ?? 0,
  };
}
const modes = lane(situationKey, packModeRequest, policyContext, localPolicy);
const stances = lane(stanceKey, packStanceRequest, stanceContext, localStance);
const hooks = Object.fromEntries(HOOKS.map((h) => [h, lane((v) => hookKey(h, v), (items, d) => packHookRequest(h, items, d), (d) => hookContext(h, d), (v) => localHookAnswer(h, v))]));
// The colony plays the local responses; each hook call also queues its view on the hook's lane.
const responses = Object.fromEntries(HOOKS.map((h) => [h, (v) => (hooks[h].policy(v), localResponses[h](v))]));
const game = newGame({ seed, game: { antCount: ants, rivalAnts: ants }, player: { policy: modes.policy, stance: stances.policy, responses } });
const map = game.map;
const colony = game.player;
const all = [modes, stances, ...Object.values(hooks)];
const paid = [modes, stances]; // the lanes the client asks Jev today
const sum = (lanes, f) => lanes.reduce((a, l) => a + l.totals[f], 0);
const flush = () => {
  for (const l of all) l.flush();
};

// The session: a doctrine for each slice of time, the first one again at the end (should be free).
const plan = [DOCTRINES[0], DOCTRINES[1], DOCTRINES[2], { id: "custom", name: "Custom", text: "Hoard food: follow any food scent, even faint; explore otherwise; flee home at strong alarm." }, DOCTRINES[0]];
const slice = (minutes * 60) / plan.length;
const rng = mulberry32(seed + 99);
let next = 0;
let t = 0;
for (const d of plan) {
  doctrine = d.text;
  for (const l of all) {
    l.clear();
    l.retune();
  }
  colony.reconsider();
  const before = { tokens: sum(paid, "tokens"), requests: sum(paid, "requests"), modes: modes.seen(policyContext(doctrine)), stances: stances.seen(stanceContext(doctrine)) };
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
  phases.push({ name: d.name, newSituations: modes.seen(policyContext(doctrine)) - before.modes, newStances: stances.seen(stanceContext(doctrine)) - before.stances, tokens: sum(paid, "tokens") - before.tokens, requests: sum(paid, "requests") - before.requests });
}

const usd = (n) => `$${(n * USD).toFixed(5)}`;
const r = game.rival;
console.log(`game cost, offline: seed ${seed}, ${ants} + ${ants} ants, ${minutes} sim-minutes, ${plan.length} doctrines (the first again at the end), alarm painted every ~20 s`);
console.log(`you: ${colony.population} ants, ${colony.stored} food home, ${colony.losses} lost · rival: ${r ? `${r.population} ants, ${r.stored} food home, ${r.losses} lost` : "none"} · ${game.outcome()}`);
console.log(`${colony.decisions.toLocaleString()} mode choices in ${colony.situationsSeen} distinct situations; ${game.strategyChoices / game.colonies.length} stance choices each\n`);
for (const p of phases) console.log(`  ${p.name.padEnd(9)} ${String(p.newSituations).padStart(4)} ant situations + ${String(p.newStances).padStart(2)} stance views · ${String(p.requests).padStart(3)} requests · ~${p.tokens.toLocaleString().padStart(7)} tok ≈ ${usd(p.tokens)}`);
const tokens = sum(paid, "tokens");
const questions = sum(paid, "questions");
console.log(`\ntotal ~${tokens.toLocaleString()} tok ≈ ${usd(tokens)} for the session (~${Math.round(tokens / Math.max(1, questions))} tok per question, ${Math.round(colony.decisions / Math.max(1, questions))} mode choices per question; modes ~${Math.round(modes.totals.tokens / Math.max(1, modes.totals.questions))} tok per situation)`);
console.log(`≈ ${usd((tokens * 60) / minutes)} per hour at this pace of retuning (one every ${(slice / 60).toFixed(1)} min); target ≤ $0.25/h`);
console.log(`\nresponse hooks as Jev lanes (not asked by the client yet), over the whole session:`);
for (const h of HOOKS) {
  const t = hooks[h].totals;
  console.log(`  ${h.padEnd(10)} ${String(t.questions).padStart(4)} views · ${String(t.requests).padStart(3)} requests · ~${t.tokens.toLocaleString().padStart(7)} tok ≈ ${usd(t.tokens)} (~${Math.round(t.tokens / Math.max(1, t.questions))} tok per view)`);
}
const ht = sum(Object.values(hooks), "tokens");
console.log(`  all hooks ~${ht.toLocaleString()} tok ≈ ${usd(ht)}; with them the session would be ≈ ${usd(((tokens + ht) * 60) / minutes)} per hour`);
