// Probe the real Jev API with the requests the app sends: the compass schema
// (packRequest, as the scheduler packs it), through the server's JevClient
// (node:https with a sized Agent, as the proxy calls it). Reports latency,
// usage.input_tokens per ant and statuses under a burst.
// Global fetch is not used on purpose: one undici dispatcher queues parallel
// requests (web/server/jev.ts), so a fetch burst measures that queue, not Jev.
// Usage: node scripts/probe.mjs [sizes...]   (default 5 20 50 100; burst is 10 × 50 ants)
import { Engine } from "../web/src/sim/engine.ts";
import { normalizeTarget } from "../web/src/sim/grid.ts";
import { antState, packRequest } from "../web/src/sim/jevBrain.ts";
import { DEFAULT_BASE_URL, JevClient } from "../web/server/jev.ts";

const KEY = process.env.JEV_API_KEY;
if (!KEY) { console.error("JEV_API_KEY not set"); process.exit(1); }
const sizes = process.argv.slice(2).map(Number).filter(Boolean);
const SIZES = sizes.length ? sizes : [5, 20, 50, 100];
const BURST = 10;

// A mid-formation field, as cacheprobe builds it: a ring target, the ants part-way in.
const SIZE = { w: 96, h: 64 };
const dark = new Float32Array(SIZE.w * SIZE.h);
for (let y = 0; y < SIZE.h; y++) for (let x = 0; x < SIZE.w; x++) if (Math.abs(Math.hypot(x - 48, y - 32) - 20) < 4) dark[y * SIZE.w + x] = 1;
const engine = new Engine({ size: SIZE, antCount: 1000, brain: "local" });
engine.setTarget(normalizeTarget(dark, 1000));
for (let t = 0; t < 4; t += 1 / 30) engine.tick(1 / 30);
const pool = [];
for (let i = 0; i < engine.world.n; i++) if (!engine.world.settled[i]) pool.push({ id: `a${i}`, state: antState(engine, i) });
const request = (n, from = 0) => ({ model: "jev-latest", ...packRequest(pool.slice(from, from + n), "compass") });

const client = new JevClient({ apiKey: KEY, maxSockets: BURST, maxRetries: 0 });
async function call(n, from = 0) {
  const req = request(n, from);
  const r = await client.ask(req);
  const answers = r.body?.answers;
  return { n, status: r.status, ms: r.ms, bytes: JSON.stringify(req).length, tokens: r.inputTokens, sample: answers ? { dir: answers[`${pool[from]?.id}_dir`], settle: answers[`${pool[from]?.id}_settle`] } : JSON.stringify(r.body).slice(0, 300) };
}

const out = { models: null, sizes: [], burst: null };
const m = await fetch(new URL("/v1/models", DEFAULT_BASE_URL), { headers: { authorization: `Bearer ${KEY}` } });
out.models = await m.json().catch(() => null);
for (const n of SIZES) {
  const r = await call(n);
  out.sizes.push(r);
  console.log(`n=${n} status=${r.status} ${r.ms}ms body=${r.bytes}B tokens=${r.tokens} (${(r.tokens / n).toFixed(0)}/ant)`);
  if (r.status !== 200) { console.log("  ->", r.sample); break; }
}
const t0 = performance.now();
const burst = await Promise.all(Array.from({ length: BURST }, (_, k) => call(50, (k * 50) % Math.max(1, pool.length - 50))));
out.burst = { wallMs: Math.round(performance.now() - t0), statuses: burst.map((b) => b.status), ms: burst.map((b) => b.ms), tokens: burst.map((b) => b.tokens) };
console.log(`burst ${BURST} × 50 ants:`, JSON.stringify(out.burst));
console.log("sample answers:", JSON.stringify(out.sizes.at(-1)?.sample ?? out.sizes[0]?.sample, null, 1));
client.destroy();
await import("node:fs").then((fs) => fs.writeFileSync(process.env.PROBE_OUT || "/dev/null", JSON.stringify(out, null, 2)));
