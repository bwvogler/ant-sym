import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { USD_PER_INPUT_TOKEN } from "../../shared/jev.ts";
import worker, { JevLedger } from "../index.ts";

// The Worker's wiring (PR #66 review S2): the locks in its fetch, and the Durable Object's storage. Driven in Node with a
// fake environment and a stubbed upstream, so nothing is spent.

const PAGES = "https://bwvogler.github.io";
const KEY = "sk-test-not-a-real-key";
const PASS = "correct horse battery staple";

function storage() {
  const m = new Map<string, unknown>();
  return { m, get: async <T>(k: string) => m.get(k) as T | undefined, put: async (k: string, v: unknown) => void m.set(k, v) };
}

async function ledgerObject(env: Record<string, string>, store = storage()) {
  let ready: Promise<unknown> = Promise.resolve();
  const state = { storage: store, blockConcurrencyWhile: <T>(fn: () => Promise<T>) => (ready = fn()) as Promise<T> };
  const obj = new JevLedger(state, env as never);
  await ready;
  return { obj, store };
}

async function environment(extra: Record<string, string> = {}, store = storage()) {
  const base = { JEV_API_KEY: KEY, ACCESS_PASSPHRASE: PASS, ALLOWED_ORIGINS: PAGES, JEV_DAILY_USD: "1", ...extra };
  const { obj } = await ledgerObject(base, store);
  return { ...base, LEDGER: { idFromName: () => "global", get: () => ({ fetch: (r: Request) => obj.fetch(r) }) } };
}

const req = (path: string, init: RequestInit & { origin?: string; pass?: string } = {}) => {
  const headers = new Headers(init.headers);
  if (init.origin) headers.set("origin", init.origin);
  if (init.pass !== undefined) headers.set("x-jev-ants-pass", init.pass);
  return new Request(`https://jev-ants-api.example.workers.dev${path}`, { ...init, headers });
};

const realFetch = globalThis.fetch;
let upstream: { body: { model?: string } }[] = [];
function stubUpstream(inputTokens: number) {
  upstream = [];
  globalThis.fetch = (async (_url: string, init: RequestInit) => {
    upstream.push({ body: JSON.parse(String(init.body)) });
    return Response.json({
      model: "jev",
      answers: { q: { type: "noul", noul: 1 } },
      usage: { input_tokens: inputTokens, output_tokens: 1 },
    });
  }) as typeof fetch;
}
afterEach(() => {
  globalThis.fetch = realFetch;
});

const ask = { model: "jev-preview", state: { x: 1 }, questions: { q: { type: "noul", instructions: "x > 0?" } } };

test("a browser on another origin is refused before anything else", async () => {
  const env = await environment();
  const r = await worker.fetch(req("/api/health", { origin: "https://evil.example", pass: PASS }), env as never);
  assert.equal(r.status, 403);
  assert.equal(r.headers.get("access-control-allow-origin"), null);
});

test("the preflight from the Pages origin gets CORS headers naming the passphrase header", async () => {
  const r = await worker.fetch(req("/api/jev", { method: "OPTIONS", origin: PAGES }), (await environment()) as never);
  assert.equal(r.status, 204);
  assert.equal(r.headers.get("access-control-allow-origin"), PAGES);
  assert.match(r.headers.get("access-control-allow-headers")!, /x-jev-ants-pass/);
});

test("without the right passphrase: health says locked, every other route is 401, and nothing reaches the ledger", async () => {
  const env = await environment();
  const health = await worker.fetch(req("/api/health", { origin: PAGES }), env as never);
  assert.deepEqual(await health.json(), { ok: true, hasKey: true, hosted: true, authorized: false });
  for (const pass of [undefined, "", "wrong"]) {
    const r = await worker.fetch(
      req("/api/run", { method: "POST", origin: PAGES, pass, body: JSON.stringify({ action: "start" }) }),
      env as never,
    );
    assert.equal(r.status, 401, `pass ${JSON.stringify(pass)}`);
    assert.equal(r.headers.get("access-control-allow-origin"), PAGES, "the page can read the refusal");
  }
  const run = await worker.fetch(req("/api/run", { origin: PAGES, pass: PASS }), env as never);
  assert.equal(((await run.json()) as { startedAt: number | null }).startedAt, null, "no run was started");
});

test("no passphrase configured: nobody gets in, not even with an empty header", async () => {
  const env = await environment({ ACCESS_PASSPHRASE: "" });
  assert.equal((await worker.fetch(req("/api/run", { pass: "" }), env as never)).status, 401);
  const health = (await (await worker.fetch(req("/api/health", { pass: "" }), env as never)).json()) as { authorized: boolean };
  assert.equal(health.authorized, false);
});

test("unlocked: a call goes through with CORS, the model is pinned, and no reply carries the key", async () => {
  stubUpstream(1_000);
  const env = await environment();
  const send = (path: string, body?: unknown) =>
    worker.fetch(
      req(path, { method: body ? "POST" : "GET", origin: PAGES, pass: PASS, ...(body ? { body: JSON.stringify(body) } : {}) }),
      env as never,
    );
  const texts: string[] = [];
  for (const [path, body] of [["/api/health"], ["/api/run", { action: "start" }], ["/api/jev", ask], ["/api/run"]] as const) {
    const r = await send(path, body);
    assert.equal(r.status, 200, path);
    assert.equal(r.headers.get("access-control-allow-origin"), PAGES, path);
    texts.push(await r.text());
  }
  assert.equal(upstream.length, 1);
  assert.equal(upstream[0]!.body.model, "jev-latest", "the client asked for jev-preview; the Worker asks for the model it prices");
  for (const t of texts) assert.ok(!t.includes(KEY), "the key never leaves the Worker");
});

test("an oversized body is refused by its length, before it is read", async () => {
  const { obj } = await ledgerObject({ JEV_API_KEY: KEY, JEV_DAILY_USD: "1" });
  const r = await obj.fetch(
    new Request("https://x/api/jev", { method: "POST", headers: { "content-length": String(2 << 20) }, body: "{}" }),
  );
  assert.equal(r.status, 413);
});

test("the day's spend is written to Durable Object storage and a rebuilt object starts from it", async () => {
  const tokens = Math.round(0.6 / USD_PER_INPUT_TOKEN);
  stubUpstream(tokens);
  const store = storage();
  const env = { JEV_API_KEY: KEY, JEV_DAILY_USD: "1" };
  const { obj } = await ledgerObject(env, store);
  const post = (o: { fetch(r: Request): Promise<Response> }, path: string, body: unknown) =>
    o.fetch(new Request(`https://x${path}`, { method: "POST", body: JSON.stringify(body) }));
  await post(obj, "/api/run", { action: "start" });
  assert.equal((await post(obj, "/api/jev", ask)).status, 200);
  assert.equal((store.m.get("daily-spend") as { tokens: number }).tokens, tokens);
  // Evicted or redeployed: the new object still counts the $0.60, so the day's $1 has no room for another such call.
  const again = (await ledgerObject(env, store)).obj;
  const health = (await (await again.fetch(new Request("https://x/api/health"))).json()) as { run: { budget: { spentUsd: number } } };
  assert.ok(Math.abs(health.run.budget.spentUsd - 0.6) < 1e-6);
  await post(again, "/api/run", { action: "start" });
  await post(again, "/api/jev", ask);
  const start = (await (await post(again, "/api/run", { action: "start" })).json()) as { running: boolean; stopReason: string };
  assert.deepEqual([start.running, start.stopReason], [false, "budget"]);
});

test("a large request reserves by its size, past the dev server's 64k ceiling, so it cannot slip under the day's cap", async () => {
  stubUpstream(1_000);
  const env = { JEV_API_KEY: KEY, JEV_DAILY_USD: "0.01" }; // 238,095 tokens
  const { obj } = await ledgerObject(env);
  const post = (path: string, body: unknown) => obj.fetch(new Request(`https://x${path}`, { method: "POST", body: JSON.stringify(body) }));
  await post("/api/run", { action: "start" });
  // ~500 KB reserves ~333k tokens: more than the day has, so it is refused, not sent. At a 64k ceiling it went out.
  const big = { ...ask, state: { pad: "x".repeat(500_000) } };
  const r = await post("/api/jev", big);
  assert.equal(r.status, 409);
  assert.equal(((await r.json()) as { error: string }).error, "budget");
  assert.equal(upstream.length, 0);
});

test("a call already sent when a new run starts runs to its reply, and what it bills is stored (S3)", async () => {
  const tokens = 5_000;
  // Slower than the dev server's 1.5 s grace, and honouring abort as a real fetch would.
  globalThis.fetch = ((_url: string, init: RequestInit) =>
    new Promise((resolve, reject) => {
      const t = setTimeout(
        () => resolve(Response.json({ answers: { q: { type: "noul", noul: 1 } }, usage: { input_tokens: tokens } })),
        1_800,
      );
      init.signal?.addEventListener("abort", () => (clearTimeout(t), reject(init.signal?.reason)));
    })) as typeof fetch;
  const store = storage();
  const { obj } = await ledgerObject({ JEV_API_KEY: KEY, JEV_DAILY_USD: "1" }, store);
  const post = (path: string, body: unknown) => obj.fetch(new Request(`https://x${path}`, { method: "POST", body: JSON.stringify(body) }));
  await post("/api/run", { action: "start" });
  const call = post("/api/jev", ask);
  await new Promise((r) => setTimeout(r, 50));
  await post("/api/run", { action: "start" }); // aborts the first run's calls
  const r = await call;
  assert.equal(r.status, 200, "not cut off after a grace");
  assert.equal((store.m.get("daily-spend") as { tokens: number }).tokens, tokens);
});
