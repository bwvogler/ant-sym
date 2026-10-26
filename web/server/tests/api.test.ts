import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { EventEmitter } from "node:events";
import { apiPlugins, buildServices, isJevResponse, makeHandlers, sameOrigin, validateJevRequest, wrap, type Services } from "../api.ts";
import { DEFAULT_IN_FLIGHT } from "../jev.ts";
import { Ledger } from "../ledger.ts";
import { JevAbortError, type JevCallResult, type JevCaller } from "../jev.ts";
import type { JevRequest } from "../../shared/jev.ts";

// The routes, wired the way the Vite plugin wires them, on a real http server
// with a stub caller: no network, no key. Every finding from the first review
// (PR #1) that the unit tests missed is a case here.

function stubCaller(opts: { delayMs?: number; tokens?: number; status?: number } = {}): JevCaller & { calls: number } {
  const caller = {
    calls: 0,
    async ask(_req: JevRequest, signal?: AbortSignal): Promise<JevCallResult> {
      caller.calls++;
      await new Promise<void>((resolve, reject) => {
        if (signal?.aborted) return reject(new JevAbortError());
        const t = setTimeout(resolve, opts.delayMs ?? 5);
        signal?.addEventListener("abort", () => {
          clearTimeout(t);
          reject(new JevAbortError());
        });
      });
      const tokens = opts.tokens ?? 1000;
      return { status: opts.status ?? 200, body: { model: "jev-x", answers: { q: { type: "noul", noul: 0.5 } }, usage: { input_tokens: tokens, output_tokens: 0 } }, ms: opts.delayMs ?? 5, attempts: 1, inputTokens: tokens };
    },
    destroy() {},
  };
  return caller;
}

async function serve(svc: Services) {
  const h = makeHandlers(svc);
  const routes: Record<string, ReturnType<typeof wrap>> = { "/api/health": wrap(h.health), "/api/run": wrap(h.run), "/api/jev": wrap(h.jev) };
  const server = http.createServer((req, res) => {
    const path = new URL(req.url ?? "/", "http://x").pathname;
    const fn = routes[path];
    if (!fn) {
      res.writeHead(404);
      res.end();
      return;
    }
    void fn(req, res);
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as { port: number }).port;
  const base = `http://127.0.0.1:${port}`;
  const post = async (path: string, body: unknown, headers: Record<string, string> = {}) => {
    const r = await fetch(base + path, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
    return { status: r.status, json: (await r.json()) as Record<string, unknown> };
  };
  return { base, post, close: () => server.close() };
}

const JEV_BODY = { state: "x", questions: { q: { type: "noul", instructions: "y" } } };

test("routes: cross-origin is refused by wrap(); 409 before start; a call is recorded; the cap fires", { timeout: 15_000 }, async () => {
  const ledger = new Ledger({ reserveTokens: 0 });
  const client = stubCaller({ tokens: 20_000 });
  const s = await serve({ client, ledger, now: () => Date.now() });
  try {
    const foreign = await s.post("/api/jev", JEV_BODY, { origin: "http://evil.example" });
    assert.equal(foreign.status, 403);
    assert.equal(client.calls, 0);
    const idle = await s.post("/api/jev", JEV_BODY);
    assert.equal(idle.status, 409);
    assert.equal(idle.json.error, "not-running");
    await s.post("/api/run", { action: "start", caps: { capUsd: 0.001, capSeconds: 60 } });
    const ok = await s.post("/api/jev", JEV_BODY);
    assert.equal(ok.status, 200);
    assert.equal(ok.json.inputTokens, 20_000);
    assert.equal((ok.json.run as { requests: number }).requests, 1);
    assert.equal(client.calls, 1);
    const second = await s.post("/api/jev", JEV_BODY); // $0.00084 spent, one more passes
    assert.equal(second.status, 200);
    const third = await s.post("/api/jev", JEV_BODY); // $0.00168 ≥ cap
    assert.equal(third.status, 409);
    assert.equal(third.json.error, "spend-cap");
    assert.equal(client.calls, 2, "nothing goes upstream past the cap");
    const bad = await s.post("/api/jev", { questions: {} });
    assert.equal(bad.status, 400);
  } finally {
    s.close();
  }
});

test("routes: concurrent calls cannot overrun the cap (reservation) and the pool ceiling answers 429 busy", { timeout: 15_000 }, async () => {
  const ledger = new Ledger({ maxInFlight: 3 });
  const client = stubCaller({ delayMs: 80, tokens: 60_000 });
  const s = await serve({ client, ledger, now: () => Date.now() });
  try {
    await s.post("/api/run", { action: "start", caps: { capUsd: 0.003, capSeconds: 60 } }); // room for one worst case
    // a 96 KB request reserves the 64k-token ceiling ($0.002688); six of them at once
    const BIG = { state: "x".repeat(96_000), questions: JEV_BODY.questions };
    const results = await Promise.all(Array.from({ length: 6 }, () => s.post("/api/jev", BIG)));
    const statuses = results.map((r) => r.status).sort();
    assert.equal(statuses.filter((x) => x === 200).length, 1, `exactly one call may go upstream: ${statuses}`);
    assert.equal(client.calls, 1);
    assert.ok(ledger.usd < 0.003);
    // pool ceiling
    const roomy = new Ledger({ maxInFlight: 2, reserveTokens: 0 });
    const slow = stubCaller({ delayMs: 120 });
    const s2 = await serve({ client: slow, ledger: roomy, now: () => Date.now() });
    try {
      await s2.post("/api/run", { action: "start", caps: { capUsd: 10, capSeconds: 60 } });
      const rs = await Promise.all(Array.from({ length: 4 }, () => s2.post("/api/jev", JEV_BODY)));
      assert.deepEqual(rs.map((r) => r.status).sort(), [200, 200, 429, 429]);
      assert.equal(rs.find((r) => r.status === 429)?.json.error, "busy");
    } finally {
      s2.close();
    }
  } finally {
    s.close();
  }
});

test("routes: Stop aborts calls in flight and their tokens never land; a new Start ignores the old run's calls", { timeout: 15_000 }, async () => {
  const ledger = new Ledger({ reserveTokens: 0 });
  const client = stubCaller({ delayMs: 300, tokens: 50_000 });
  const s = await serve({ client, ledger, now: () => Date.now() });
  try {
    await s.post("/api/run", { action: "start", caps: { capUsd: 10, capSeconds: 60 } });
    const inFlight = Promise.all(Array.from({ length: 3 }, () => s.post("/api/jev", JEV_BODY)));
    await new Promise((r) => setTimeout(r, 40));
    const stopped = await s.post("/api/run", { action: "stop" });
    assert.equal((stopped.json as { running: boolean }).running, false);
    const rs = await inFlight;
    assert.deepEqual(rs.map((r) => r.status), [409, 409, 409]);
    assert.deepEqual(rs.map((r) => r.json.error), ["stopped", "stopped", "stopped"]);
    assert.equal(ledger.usd, 0, "the cost line did not move after Stop");
    const cut = await fetch(`${s.base}/api/run`).then((r) => r.json() as Promise<{ requests: number; aborted: number; statuses: Record<string, number> }>);
    assert.equal(cut.aborted, 3, "cut-off calls are reported, not hidden as free requests");
    assert.equal(cut.requests, 0);
    assert.deepEqual(cut.statuses, {});
    // start, send, start again: the first run's call is cut off and not counted in run 2
    await s.post("/api/run", { action: "start", caps: { capUsd: 10, capSeconds: 60 } });
    const old = s.post("/api/jev", JEV_BODY);
    await new Promise((r) => setTimeout(r, 40));
    const fresh = await s.post("/api/run", { action: "start", caps: { capUsd: 10, capSeconds: 60 } });
    assert.equal((fresh.json as { inFlight: number }).inFlight, 0);
    assert.equal((await old).status, 409);
    const after = await fetch(`${s.base}/api/run`).then((r) => r.json() as Promise<{ requests: number; inputTokens: number }>);
    assert.equal(after.requests, 0);
    assert.equal(after.inputTokens, 0);
  } finally {
    s.close();
  }
});

test("routes: a 200 without answers is flagged, a thrown client error is a 502 and still ends the call", { timeout: 15_000 }, async () => {
  const ledger = new Ledger({ reserveTokens: 0 });
  const empty: JevCaller = { async ask() { return { status: 200, body: { nope: true }, ms: 1, attempts: 1, inputTokens: 0 }; }, destroy() {} };
  const s = await serve({ client: empty, ledger, now: () => Date.now() });
  try {
    await s.post("/api/run", { action: "start", caps: {} });
    const r = await s.post("/api/jev", JEV_BODY);
    assert.equal(r.status, 200);
    assert.match(String((r.json.body as { error: string }).error), /no answers/);
    assert.equal(isJevResponse({ answers: {} }), true);
    assert.equal(isJevResponse({ answers: null }), false);
  } finally {
    s.close();
  }
  const broken: JevCaller = { async ask() { throw new Error("boom"); }, destroy() {} };
  const l2 = new Ledger({ reserveTokens: 0, maxInFlight: 1 });
  const s2 = await serve({ client: broken, ledger: l2, now: () => Date.now() });
  try {
    await s2.post("/api/run", { action: "start", caps: {} });
    const r = await s2.post("/api/jev", JEV_BODY);
    assert.equal(r.status, 502);
    assert.equal(l2.summary(0).inFlight, 0, "the failed call was ended, the pool slot freed");
    assert.equal(l2.summary(0).statuses["0"], 1);
  } finally {
    s2.close();
  }
});


test("sameOrigin: no Origin passes, matching host passes, anything else is refused", () => {
  assert.equal(sameOrigin(undefined, "localhost:38500"), true);
  assert.equal(sameOrigin("http://localhost:38500", "localhost:38500"), true);
  assert.equal(sameOrigin("http://evil.example", "localhost:38500"), false);
  assert.equal(sameOrigin("http://localhost:38400", "localhost:38500"), false);
  assert.equal(sameOrigin("not a url", "localhost:38500"), false);
  assert.equal(sameOrigin("http://localhost:38500", undefined), false);
});

test("validateJevRequest fills the model, keeps assets, rejects junk", () => {
  const ok = validateJevRequest({ state: "x", questions: { q: { type: "noul", instructions: "y" } } });
  assert.equal(ok.model, "jev-latest");
  assert.equal(ok.assets, undefined);
  const withAssets = validateJevRequest({ model: "jev-preview", state: {}, questions: { b: { type: "box", instructions: "z" } }, assets: { i: { type: "image", format: "png", data_base64: "AA==" } } });
  assert.equal(withAssets.model, "jev-preview");
  assert.ok(withAssets.assets);
  assert.throws(() => validateJevRequest(null), /Jev request object/);
  assert.throws(() => validateJevRequest({ questions: { q: { type: "noul", instructions: "" } } }), /state is required/);
  assert.throws(() => validateJevRequest({ state: 1, questions: {} }), /non-empty/);
  assert.throws(() => validateJevRequest({ state: 1, questions: { q: { type: "rank" } } }), /no valid type/);
});

test("the Vite plugin mounts every route through wrap(), sizes the pool from the environment, and closes it on restart", { timeout: 15_000 }, async () => {
  // Round 2 (PR #1): the route tests above build their own table, so a
  // route mounted without wrap() in apiPlugins() was never exercised.
  const destroyed: string[] = [];
  const stub: JevCaller = { async ask() { throw new Error("unused"); }, destroy() { destroyed.push("client"); } };
  const svc: Services = { client: stub, ledger: new Ledger(), now: () => Date.now() };
  const mounted: { path: string; fn: ReturnType<typeof wrap> }[] = [];
  const httpServer = new EventEmitter();
  const plugin = apiPlugins(svc);
  (plugin.configureServer as (server: unknown) => void)({ middlewares: { use: (path: string, fn: ReturnType<typeof wrap>) => mounted.push({ path, fn }) }, httpServer });
  assert.deepEqual(
    mounted.map((m) => m.path),
    ["/api/health", "/api/run", "/api/jev", "/api"],
  );
  // connect-style dispatch: first mounted prefix wins
  const server = http.createServer((req, res) => {
    const m = mounted.find((x) => (req.url ?? "").startsWith(x.path));
    if (!m) {
      res.writeHead(404);
      res.end();
      return;
    }
    void m.fn(req, res);
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  try {
    for (const path of ["/api/health", "/api/run", "/api/jev", "/api/other"]) {
      const r = await fetch(base + path, { method: "POST", headers: { origin: "http://evil.example", "content-type": "application/json" }, body: "{}" });
      assert.equal(r.status, 403, `${path} is not behind wrap()`);
    }
    const ok = await fetch(base + "/api/health").then((r) => r.json() as Promise<{ ok: boolean }>);
    assert.equal(ok.ok, true);
    const missing = await fetch(base + "/api/other");
    assert.equal(missing.status, 404);
  } finally {
    server.close();
  }
  httpServer.emit("close");
  assert.deepEqual(destroyed, ["client"], "a Vite restart closes the old pool");

  // the environment: no key means no client; the width defaults to 5 (one browser connection left for Stop) and is clamped
  const bare = buildServices({});
  assert.equal(bare.client, null);
  assert.equal(bare.inFlight, DEFAULT_IN_FLIGHT);
  assert.equal(DEFAULT_IN_FLIGHT, 5);
  const three = buildServices({ JEV_API_KEY: "k", JEV_IN_FLIGHT: "3" });
  assert.notEqual(three.client, null);
  assert.equal(three.inFlight, 3);
  three.client?.destroy();
  assert.equal(buildServices({ JEV_IN_FLIGHT: "40" }).inFlight, 6, "never past the browser's connection count");
  assert.equal(buildServices({ JEV_IN_FLIGHT: "junk" }).inFlight, DEFAULT_IN_FLIGHT);
  assert.equal(buildServices({ JEV_IN_FLIGHT: "-3" }).inFlight, 1, "never below one");
  assert.equal(buildServices({ JEV_IN_FLIGHT: "0" }).inFlight, DEFAULT_IN_FLIGHT);
});

test("routes: a body over the limit is refused with 413 before anything goes upstream", { timeout: 15_000 }, async () => {
  const ledger = new Ledger({ reserveTokens: 0 });
  const client = stubCaller();
  const s = await serve({ client, ledger, now: () => Date.now() });
  try {
    await s.post("/api/run", { action: "start", caps: {} });
    const huge = JSON.stringify({ state: "x".repeat(9 * 1024 * 1024), questions: { q: { type: "noul", instructions: "y" } } });
    const status = await new Promise<number>((resolve, reject) => {
      const r = http.request(`${s.base}/api/jev`, { method: "POST", headers: { "content-type": "application/json", "content-length": String(Buffer.byteLength(huge)) } }, (res) => {
        res.resume();
        resolve(res.statusCode ?? 0);
      });
      r.on("error", reject);
      r.write(huge);
      r.end();
    });
    assert.equal(status, 413);
    assert.equal(client.calls, 0);
  } finally {
    s.close();
  }
});

test("routes: a call reserves from its own payload, so a big request after a small one is refused rather than overspending", { timeout: 15_000 }, async () => {
  // Round 3 (PR #1). Cap $0.003: a 2 KB request (1,334 tokens reserved) is admitted; a 90 KB one (60k reserved = $0.00252) is not once $0.00084 is spent.
  const ledger = new Ledger();
  const client = stubCaller({ tokens: 20_000 });
  const s = await serve({ client, ledger, now: () => Date.now() });
  try {
    await s.post("/api/run", { action: "start", caps: { capUsd: 0.003, capSeconds: 60 } });
    const small = await s.post("/api/jev", JEV_BODY);
    assert.equal(small.status, 200);
    const bigBody = { state: "x".repeat(90_000), questions: { q: { type: "noul", instructions: "y" } } };
    const big = await s.post("/api/jev", bigBody);
    assert.equal(big.status, 409, "no room for a 60k-token call: the cap");
    assert.equal(big.json.error, "spend-cap");
    assert.equal(client.calls, 1);
  } finally {
    s.close();
  }
});
