// Offline, no key, no spend: what would Jev cost a game? Runs the game
// headless for a play session — your colony against the rival's — with a
// stand-in for Jev (the local rule and the local strategist, so the colony
// behaves the same) behind the real cache logic: each new (doctrine, ant
// situation) and each new (doctrine, strategist view) is one question, asked
// once. You retune the doctrine every couple of minutes, back to one used
// before at the end, and paint alarm now and then. The rival plays the local
// rule (free). Tokens per question are estimated from request size
// (colonyBrain.estimateTokens); the ledger counts the real ones live.
//
// --side plays the side view (the nest, its chambers and in-nest situations: PRD §32), as the app sets it up
// (generateSideWorld(seed), Game with gameRng(seed), as the page builds it); without it, the top-down map (generateWorld) with
// the rng this script always used, so earlier figures reproduce. --one plays one world (generateOneWorld(seed), gameRng(seed);
// docs/one-world.md), its alarm painted on the plane: each ant keeps its own stance, and `leave` is asked of the foragers
// held at the gate at the top of their shafts (ja-web, PRD §48.6), so the leave lane is counted like the others.
//
// The ant's response lanes (get, carry, drop, trail: colonyBrain.RESPONSE_HOOKS)
// are estimated too, as if each were asked like the modes; they are not asked
// by the page yet, so they are reported apart and not in the session's total.
//
// Usage: node scripts/colony-cost.mjs [--side | --one] [minutes=10] [ants=600] [seed=1]
import {
  LANES,
  PLANE,
  DOCTRINES,
  estimateTokens,
  packResponseRequest,
  RESPONSE_HOOKS,
  responseContext,
  responseKey,
  localResponses,
  responses,
  Game,
  gameRng,
  generateOneWorld,
  generateSideWorld,
  generateWorld,
  mulberry32,
  worldExtent,
} from "../web/src/colony/index.ts";
import { USD_PER_INPUT_TOKEN } from "../web/shared/jev.ts";
import { helpAndExit } from "./lib/usage.mjs";
helpAndExit(import.meta.url);

const side = process.argv.includes("--side");
const one = process.argv.includes("--one");
const [minutes = 10, ants = 600, seed = 1] = process.argv
  .slice(2)
  .filter((a) => a !== "--side" && a !== "--one")
  .map(Number);
const USD = USD_PER_INPUT_TOKEN;
const DT = 1 / 30;
const BATCH_EVERY = 0.3; // s, the client's interval

const world = one ? generateOneWorld(seed) : side ? generateSideWorld(seed) : generateWorld(seed);
const extent = worldExtent("plane" in world ? world.plane : world);
let doctrine = DOCTRINES[0].text;
let tokens = 0;
let requests = 0;
let questions = 0;
const phases = [];

/** One kind of question, cached per doctrine like ui/colonyJev.ts. `acc`, when given, counts its cost apart from the session's. */
function lane(key, pack, contextOf, local, acc = null, idPrefix = "s", batch = 100) {
  const asked = new Map(); // context → Set of keys
  const queue = new Map(); // key → situation, waiting for the next batch
  return {
    asked,
    acc,
    policy: (s) => {
      const k = key(s);
      if (!asked.get(contextOf(doctrine))?.has(k) && !queue.has(k)) queue.set(k, { ...s }); // a copy: responses share one Touch object
      return local(s); // the stand-in's answer, and what the colony does until Jev answers
    },
    flush() {
      const context = contextOf(doctrine);
      const set = asked.get(context) ?? new Set();
      asked.set(context, set);
      const items = [...queue.entries()].filter(([k]) => !set.has(k));
      queue.clear();
      for (let b = 0; b < items.length; b += batch) {
        const chunk = items.slice(b, b + batch);
        const t = estimateTokens(
          pack(
            chunk.map(([, s], n) => ({ id: `${idPrefix}${n}`, situation: s })),
            doctrine,
          ),
        );
        if (acc) {
          acc.tokens += t;
          acc.requests++;
          acc.questions += chunk.length;
        } else {
          tokens += t;
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
/** A lane for an ant's row of the lane registry (colony/lanes.ts): its key, packing, context and local rule, the id prefix its items carry and its request size. */
const fromRow = (row) =>
  lane(
    (s) => row.key(s, undefined),
    row.pack,
    (d) => row.contextOf(d),
    row.local,
    null,
    row.kind.idPrefix,
    row.batch ?? 100,
  );
const modes = fromRow(LANES.mode);
const stances = fromRow(LANES.stance);
const hooks = Object.fromEntries(
  RESPONSE_HOOKS.map((h) => [
    h,
    lane(
      (t) => responseKey(h, t),
      (items, d) => packResponseRequest(h, items, d),
      (d) => responseContext(h, d),
      localResponses[h],
      { tokens: 0, requests: 0, questions: 0 },
    ),
  ]),
);
const game = new Game(world, { antCount: ants, rivalAnts: ants }, side || one ? gameRng(seed) : mulberry32(seed + 7), {
  policy: modes.policy,
  stance: stances.policy,
  responses: responses(Object.fromEntries(RESPONSE_HOOKS.map((h) => [h, hooks[h].policy]))),
});
const colony = game.player;
const flush = () => {
  modes.flush();
  stances.flush();
  for (const h of RESPONSE_HOOKS) hooks[h].flush();
};

// The session: a doctrine for each slice of time, the first one again at the end (should be free).
const plan = [
  DOCTRINES[0],
  DOCTRINES[1],
  DOCTRINES[2],
  { id: "custom", name: "Custom", text: "Hoard food: follow any food scent, even faint; explore otherwise; flee home at strong alarm." },
  DOCTRINES[0],
];
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
  const before = {
    tokens,
    requests,
    modes: modes.seen(LANES.mode.contextOf(doctrine)),
    stances: stances.seen(LANES.stance.contextOf(doctrine)),
  };
  const end = t + slice;
  for (; t < end; t += DT) {
    game.tick(DT);
    if (t >= next) {
      flush();
      next = t + BATCH_EVERY;
    }
    // The fungus paints a blot of alarm somewhere every ~20 s.
    if (rng() < DT / 20) colony.paint("alarm", rng() * extent.w, rng() * extent.h, 3, 12, ...(one ? [PLANE] : [])); // world units: rows are R apart
  }
  flush();
  phases.push({
    name: d.name,
    newSituations: modes.seen(LANES.mode.contextOf(doctrine)) - before.modes,
    newStances: stances.seen(LANES.stance.contextOf(doctrine)) - before.stances,
    tokens: tokens - before.tokens,
    requests: requests - before.requests,
  });
}

const usd = (n) => `$${(n * USD).toFixed(5)}`;
const r = game.rival;
console.log(
  `game cost, offline (${one ? "one world" : side ? "side view" : "top-down"}): seed ${seed}, ${ants} + ${ants} ants, ${minutes} sim-minutes, ${plan.length} doctrines (the first again at the end), alarm painted every ~20 s`,
);
console.log(
  `you: ${colony.population} ants, ${colony.stored} food home, ${colony.losses} lost · rival: ${r ? `${r.population} ants, ${r.stored} food home, ${r.losses} lost` : "none"} · ${game.outcome()}`,
);
console.log(
  `${colony.decisions.toLocaleString()} mode choices in ${colony.situationsSeen} distinct situations; ${game.strategyChoices / game.colonies.length} stance choices each\n`,
);
for (const p of phases)
  console.log(
    `  ${p.name.padEnd(9)} ${String(p.newSituations).padStart(4)} ant situations + ${String(p.newStances).padStart(2)} stance views · ${String(p.requests).padStart(3)} requests · ~${p.tokens.toLocaleString().padStart(7)} tok ≈ ${usd(p.tokens)}`,
  );
console.log(
  `\ntotal ~${tokens.toLocaleString()} tok ≈ ${usd(tokens)} for the session (~${Math.round(tokens / Math.max(1, questions))} tok per question, ${Math.round(colony.decisions / Math.max(1, questions))} mode choices per question)`,
);
console.log(
  `≈ ${usd((tokens * 60) / minutes)} per hour at this pace of retuning (one every ${(slice / 60).toFixed(1)} min); target ≤ $0.25/h`,
);
console.log(`\nresponse lanes, if each were asked like the modes (not asked by the page yet; not in the total above):`);
let rt = 0;
for (const h of RESPONSE_HOOKS) {
  const a = hooks[h].acc;
  rt += a.tokens;
  console.log(
    `  ${h.padEnd(6)} ${String(a.questions).padStart(4)} situations · ${String(a.requests).padStart(3)} requests · ~${a.tokens.toLocaleString().padStart(6)} tok ≈ ${usd(a.tokens)} (~${Math.round(a.tokens / Math.max(1, a.questions))} tok per question)`,
  );
}
console.log(`  all ${RESPONSE_HOOKS.length} ≈ ${usd((rt * 60) / minutes)} per hour more at this pace`);
