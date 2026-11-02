// Live check of the cached schema against the real API (spends about $0.01).
//   1. Determinism: the same situation request twice; do the answers match?
//   2. Tokens per situation, from usage.input_tokens.
//   3. Fidelity: the same ants asked per ant (compass schema, full state) and
//      through their situation (cached schema, turned back into each ant's
//      frame). How often do the two send the ant the same way?
// Usage: JEV_API_KEY=... node scripts/cacheprobe.mjs [ants=100]   (--dry: build the requests, print sizes, call nothing)
import { Engine } from "../web/src/sim/engine.ts";
import { normalizeTarget } from "../web/src/sim/grid.ts";
import { antState, packRequest } from "../web/src/sim/jevBrain.ts";
import { answersFor, canonicalState, readSituation, situationKey } from "../web/src/sim/policyCache.ts";
import { JevClient } from "../web/server/jev.ts";

const DRY = process.argv.includes("--dry");
const KEY = process.env.JEV_API_KEY;
if (!KEY && !DRY) {
  console.error("JEV_API_KEY not set (or pass --dry)");
  process.exit(1);
}
const N = Number(process.argv.slice(2).find((a) => /^\d+$/.test(a)) ?? 100);

// A mid-formation field: a ring target, the ants part-way in (the local rule for a few seconds).
const SIZE = { w: 96, h: 64 };
const dark = new Float32Array(SIZE.w * SIZE.h);
for (let y = 0; y < SIZE.h; y++) for (let x = 0; x < SIZE.w; x++) if (Math.abs(Math.hypot(x - 48, y - 32) - 20) < 4) dark[y * SIZE.w + x] = 1;
const engine = new Engine({ size: SIZE, antCount: 1000, brain: "local" });
engine.setTarget(normalizeTarget(dark, 1000));
for (let t = 0; t < 4; t += 1 / 30) engine.tick(1 / 30);

// N unsettled ants, as the scheduler would see them.
const ants = [];
for (let i = 0; i < engine.world.n && ants.length < N; i++) if (!engine.world.settled[i]) ants.push({ id: `a${i}`, state: antState(engine, i) });
const sits = new Map(); // key → id
for (const a of ants) {
  const { key } = situationKey(a.state);
  if (!sits.has(key)) sits.set(key, `s${sits.size}`);
}
const perAnt = { model: "jev-latest", ...packRequest(ants, "compass") };
const perSit = { model: "jev-latest", ...packRequest([...sits].map(([key, id]) => ({ id, state: canonicalState(key) })), "cached") };
console.log(`${ants.length} ants → ${sits.size} distinct situations; request bytes: per ant ${JSON.stringify(perAnt).length}, per situation ${JSON.stringify(perSit).length}`);
if (DRY) process.exit(0);

// The server's client, not global fetch: fetch queues the three parallel asks behind one socket and stacks their ms.
const client = new JevClient({ apiKey: KEY });
async function ask(body) {
  const r = await client.ask(body);
  const j = r.body;
  if (r.status !== 200 || !j?.answers) throw new Error(`status ${r.status}: ${JSON.stringify(j).slice(0, 300)}`);
  return { answers: j.answers, tokens: r.inputTokens, ms: r.ms };
}

const [a1, a2, b] = await Promise.all([ask(perSit), ask(perSit), ask(perAnt)]);
client.destroy();

// 1. determinism
let same = 0;
let maxDiff = 0;
for (const id of sits.values()) {
  const x = readSituation(a1.answers, id);
  const y = readSituation(a2.answers, id);
  if (!x || !y) continue;
  if (x.choice === y.choice) same++;
  for (const k of new Set([...Object.keys(x.probabilities), ...Object.keys(y.probabilities)])) maxDiff = Math.max(maxDiff, Math.abs((x.probabilities[k] ?? 0) - (y.probabilities[k] ?? 0)));
  maxDiff = Math.max(maxDiff, Math.abs(x.pSettle - y.pSettle));
}
console.log(`determinism: same choice for ${same}/${sits.size} situations, largest probability difference ${maxDiff.toFixed(4)}`);

// 2. tokens
console.log(`tokens: per situation ${(a1.tokens / sits.size).toFixed(0)} (${a1.tokens} for ${sits.size}, ${a1.ms} ms); per ant ${(b.tokens / ants.length).toFixed(0)} (${b.tokens} for ${ants.length}, ${b.ms} ms)`);
console.log(`this batch: ${a1.tokens} tokens through situations vs ${b.tokens} per ant (${(b.tokens / Math.max(1, a1.tokens)).toFixed(1)}× cheaper before any reuse)`);

// 3. fidelity
const ANGLE = { E: 0, SE: 1, S: 2, SW: 3, W: 4, NW: 5, N: 6, NE: 7 };
let exact = 0;
let near = 0;
let settleAgree = 0;
for (const a of ants) {
  const { key, transform } = situationKey(a.state);
  const cached = readSituation(a1.answers, sits.get(key));
  const own = b.answers[`${a.id}_dir`];
  const ownSettle = b.answers[`${a.id}_settle`];
  if (!cached || !own) continue;
  const viaSit = answersFor(a.id, cached, transform);
  const c1 = viaSit[`${a.id}_dir`].choice;
  const c2 = own.choice;
  if (c1 === c2) exact++;
  const d = c1 in ANGLE && c2 in ANGLE ? Math.min((ANGLE[c1] - ANGLE[c2] + 8) % 8, (ANGLE[c2] - ANGLE[c1] + 8) % 8) : c1 === c2 ? 0 : 9;
  if (d <= 1) near++;
  if ((cached.pSettle >= 0.5) === ((ownSettle?.noul ?? 0) >= 0.5)) settleAgree++;
}
const pct = (k) => `${Math.round((100 * k) / ants.length)}%`;
console.log(`fidelity vs asking per ant: same direction ${pct(exact)}, within 45° ${pct(near)}, same settle ${pct(settleAgree)}`);
