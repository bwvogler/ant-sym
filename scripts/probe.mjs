// Probe the real Jev API with packed ant requests: N ants share one `state`,
// each ant gets three questions (direction choice, pace score, settle noul).
// Reports latency, usage.input_tokens and the first 429 under a burst.
// Usage: node scripts/probe.mjs [sizes...]   (default 5 20 50 100)
const KEY = process.env.JEV_API_KEY;
if (!KEY) { console.error("JEV_API_KEY not set"); process.exit(1); }
const URL_ = "https://api.typesafe.ai/v1/systemone";
const DIRS = { N: "step north", NE: "step north-east", E: "step east", SE: "step south-east", S: "step south", SW: "step south-west", W: "step west", NW: "step north-west", stay: "do not move this cycle" };
const rnd = (n) => Math.floor(Math.random() * n);
const HEAD = Object.keys(DIRS).slice(0, 8);

function antState(i) {
  return {
    pos: [rnd(64), rnd(64)],
    heading: HEAD[rnd(8)],
    // deficit = target ants minus current ants in each of the 3x3 cells around me, row-major NW..SE
    deficit3x3: Array.from({ length: 9 }, () => +(Math.random() * 4 - 1.5).toFixed(1)),
    crowd: +Math.random().toFixed(2),
    nearbyHeadings: Array.from({ length: rnd(4) }, () => HEAD[rnd(8)]),
    ticksSinceMove: rnd(12),
    attractor: Math.random() < 0.3 ? HEAD[rnd(8)] : null,
  };
}
function body(n) {
  const state = { ants: {} }, questions = {};
  const rules = "Each ant is one key in `ants`. deficit3x3 lists how many more ants each of the 9 cells around the ant still needs (negative = too many), row-major from north-west to south-east; the centre is the ant's own cell. crowd is 0..1 local density. attractor is a hint toward the region the overseer says most lacks ants.";
  state.rules = rules;
  for (let i = 0; i < n; i++) {
    const id = `a${i}`;
    state.ants[id] = antState(i);
    questions[`${id}_dir`] = { type: "choice", instructions: `Which way should ant \`${id}\` step so the cells that still need ants get filled, avoiding crowding?`, criteria: DIRS };
    questions[`${id}_pace`] = { type: "score", instructions: `How fast should ant \`${id}\` move this cycle?`, criteria: ["creep: barely move, nearly settled", "walk: normal pace", "hurry: far from where ants are needed"] };
    questions[`${id}_settle`] = { type: "noul", instructions: `Ant \`${id}\` is standing in a cell that still needs ants and should settle here.` };
  }
  return { model: "jev-latest", state, questions };
}
async function call(n) {
  const b = JSON.stringify(body(n));
  const t0 = performance.now();
  const r = await fetch(URL_, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${KEY}` }, body: b });
  const ms = Math.round(performance.now() - t0);
  const text = await r.text();
  let j = null; try { j = JSON.parse(text); } catch {}
  return { n, status: r.status, ms, bytes: b.length, usage: j?.usage, retryAfter: r.headers.get("retry-after"), sample: j?.answers ? { dir: j.answers.a0_dir, pace: j.answers.a0_pace, settle: j.answers.a0_settle } : text.slice(0, 300), headers: Object.fromEntries([...r.headers].filter(([k]) => /ratelimit|limit|remaining|reset/i.test(k))) };
}
const sizes = process.argv.slice(2).map(Number).filter(Boolean);
const SIZES = sizes.length ? sizes : [5, 20, 50, 100];
const out = { models: null, sizes: [], burst: null };
const m = await fetch("https://api.typesafe.ai/v1/models", { headers: { authorization: `Bearer ${KEY}` } });
out.models = await m.json().catch(() => null);
for (const n of SIZES) {
  const r = await call(n);
  out.sizes.push(r);
  console.log(`n=${n} status=${r.status} ${r.ms}ms body=${r.bytes}B tokens=${JSON.stringify(r.usage)} ratelimitHeaders=${JSON.stringify(r.headers)}`);
  if (r.status !== 200) { console.log("  ->", r.sample); break; }
}
// burst: 10 parallel requests of 50 ants
const t0 = performance.now();
const burst = await Promise.all(Array.from({ length: 10 }, () => call(50)));
out.burst = { wallMs: Math.round(performance.now() - t0), statuses: burst.map((b) => b.status), ms: burst.map((b) => b.ms), retryAfter: burst.map((b) => b.retryAfter).filter(Boolean), tokens: burst.map((b) => b.usage?.input_tokens) };
console.log("burst x10 of 50 ants:", JSON.stringify(out.burst));
console.log("sample answers for a0:", JSON.stringify(out.sizes.at(-1)?.sample ?? out.sizes[0]?.sample, null, 1));
await import("node:fs").then((fs) => fs.writeFileSync(process.env.PROBE_OUT || "/dev/null", JSON.stringify(out, null, 2)));
