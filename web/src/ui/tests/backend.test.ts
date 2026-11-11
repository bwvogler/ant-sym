import { test } from "node:test";
import assert from "node:assert/strict";
import { PASS_HEADER, apiHeaders, apiUrl, detectBackend, hostedApi, isDemo } from "../backend.ts";
import { canResume, policyLock } from "../policyLock.ts";
import { PASS_HEADER as WORKER_PASS_HEADER } from "../../../worker/gate.ts";

const running = { phase: "running" as const, run: null, lastError: null };

const reply = (status: number, body: unknown, json = true) =>
  (async () =>
    ({
      ok: status >= 200 && status < 300,
      status,
      json: async () => (json ? body : Promise.reject(new SyntaxError("<html>"))),
    }) as Response) as typeof fetch;

test("apiUrl defaults to the root outside Vite", () => {
  assert.equal(apiUrl("api/jev"), "/api/jev");
  assert.equal(apiUrl("/api/run"), "/api/run");
});

test("live server with a key", async () => {
  assert.deepEqual(await detectBackend(reply(200, { ok: true, hasKey: true })), { hasBackend: true, hasKey: true });
});

test("live server without a key", async () => {
  const b = await detectBackend(reply(200, { ok: true, hasKey: false }));
  assert.deepEqual(b, { hasBackend: true, hasKey: false });
  assert.match(policyLock(b, running)!, /JEV_API_KEY/);
});

test("static host: 404, HTML body, or network error all mean no backend", async () => {
  const none = { hasBackend: false, hasKey: false };
  assert.deepEqual(await detectBackend(reply(404, null)), none);
  assert.deepEqual(await detectBackend(reply(200, null, false)), none);
  assert.deepEqual(
    await detectBackend((async () => {
      throw new TypeError("offline");
    }) as typeof fetch),
    none,
  );
  assert.match(policyLock(none, running)!, /No Jev server/);
});

test("policies stay locked while the probe is pending; isDemo only after it answers", () => {
  assert.match(policyLock(null, running)!, /Checking/);
  assert.equal(isDemo(null), false);
  assert.equal(isDemo({ hasBackend: false, hasKey: false }), true);
  assert.equal(isDemo({ hasBackend: true, hasKey: false }), false);
  assert.equal(policyLock({ hasBackend: true, hasKey: true }, running), null);
});

test("a build with VITE_JEV_API calls the hosted proxy, not its own base path", () => {
  const env = { BASE_URL: "/ant-sym/pr-preview/pr-7/", VITE_JEV_API: "https://jev-ants-api.example.workers.dev/" };
  assert.equal(hostedApi(env), "https://jev-ants-api.example.workers.dev");
  assert.equal(apiUrl("api/jev", env), "https://jev-ants-api.example.workers.dev/api/jev");
  assert.equal(apiUrl("/api/run", { BASE_URL: "/ant-sym/" }), "/ant-sym/api/run");
  assert.equal(hostedApi({ VITE_JEV_API: "  " }), null);
});

test("the passphrase goes only to the hosted proxy, under the header the Worker reads", () => {
  assert.equal(PASS_HEADER, WORKER_PASS_HEADER);
  const hosted = { VITE_JEV_API: "https://p.example" };
  assert.deepEqual(apiHeaders(hosted, "s3cret"), { "content-type": "application/json", [PASS_HEADER]: "s3cret" });
  assert.deepEqual(apiHeaders({}, "s3cret"), { "content-type": "application/json" });
  assert.deepEqual(apiHeaders(hosted, null), { "content-type": "application/json" });
});

test("hosted proxy without the passphrase: a backend that is locked until it is given", async () => {
  const b = await detectBackend(reply(200, { ok: true, hasKey: true, hosted: true, authorized: false }));
  assert.deepEqual(b, { hasBackend: true, hasKey: true, needsPass: true });
  assert.equal(isDemo(b), false);
  assert.match(policyLock(b, running)!, /passphrase/);
  assert.equal(canResume(b, { phase: "off", run: null, lastError: null }, false), false);
  const open = await detectBackend(
    reply(200, {
      ok: true,
      hasKey: true,
      hosted: true,
      authorized: true,
      run: { budget: { day: "2026-11-10", usdPerDay: 2, spentUsd: 0, remainingUsd: 2 } },
    }),
  );
  assert.equal(open.needsPass, undefined);
  assert.equal(open.budget?.usdPerDay, 2);
  assert.equal(policyLock(open, running), null);
});

test("the health probe asks the hosted proxy, with the passphrase, so an unlocked browser is told it is unlocked", async () => {
  const seen: { url: string; headers: Record<string, string> }[] = [];
  const fetchFn = (async (url: string, init: RequestInit) => {
    seen.push({ url, headers: init.headers as Record<string, string> });
    return { ok: true, status: 200, json: async () => ({ ok: true, hasKey: true, hosted: true, authorized: true }) } as Response;
  }) as unknown as typeof fetch;
  const b = await detectBackend(fetchFn, { VITE_JEV_API: "https://p.example" }, "s3cret");
  assert.equal(seen[0]!.url, "https://p.example/api/health");
  assert.equal(seen[0]!.headers[PASS_HEADER], "s3cret");
  assert.equal(b.needsPass, undefined);
});
