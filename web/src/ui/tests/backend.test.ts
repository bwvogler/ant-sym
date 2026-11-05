import { test } from "node:test";
import assert from "node:assert/strict";
import { PASS_HEADER, apiHeaders, apiUrl, detectBackend, hostedApi, isDemo, jevUnavailable } from "../backend.ts";
import { PASS_HEADER as WORKER_PASS_HEADER } from "../../../worker/gate.ts";

const reply = (status: number, body: unknown, json = true) =>
  (async () => ({ ok: status >= 200 && status < 300, status, json: async () => (json ? body : Promise.reject(new SyntaxError("<html>"))) }) as Response) as typeof fetch;

test("apiUrl defaults to the root outside Vite", () => {
  assert.equal(apiUrl("api/jev"), "/api/jev");
  assert.equal(apiUrl("/api/run"), "/api/run");
});

test("live server with a key", async () => {
  assert.deepEqual(await detectBackend(reply(200, { ok: true, hasKey: true })), { hasBackend: true, hasKey: true, needsPass: false });
});

test("live server without a key", async () => {
  const b = await detectBackend(reply(200, { ok: true, hasKey: false }));
  assert.deepEqual(b, { hasBackend: true, hasKey: false, needsPass: false });
  assert.match(jevUnavailable(b)!, /JEV_API_KEY/);
});

test("static host: 404, HTML body, or network error all mean no backend", async () => {
  const none = { hasBackend: false, hasKey: false, needsPass: false };
  assert.deepEqual(await detectBackend(reply(404, null)), none);
  assert.deepEqual(await detectBackend(reply(200, null, false)), none);
  assert.deepEqual(await detectBackend((async () => { throw new TypeError("offline"); }) as typeof fetch), none);
  assert.match(jevUnavailable(none)!, /Demo build/);
});

test("Start stays disabled while the probe is pending; isDemo only after it answers", () => {
  assert.match(jevUnavailable(null)!, /Checking/);
  assert.equal(isDemo(null), false);
  assert.equal(isDemo({ hasBackend: false, hasKey: false, needsPass: false }), true);
  assert.equal(isDemo({ hasBackend: true, hasKey: false, needsPass: false }), false);
  assert.equal(jevUnavailable({ hasBackend: true, hasKey: true, needsPass: false }), null);
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

test("hosted proxy without the passphrase: a backend that asks for it", async () => {
  const b = await detectBackend(reply(200, { ok: true, hasKey: true, hosted: true, authorized: false }));
  assert.deepEqual(b, { hasBackend: true, hasKey: true, needsPass: true });
  assert.equal(isDemo(b), false);
  assert.match(jevUnavailable(b)!, /passphrase/);
  assert.deepEqual(await detectBackend(reply(200, { ok: true, hasKey: true, hosted: true, authorized: true })), { hasBackend: true, hasKey: true, needsPass: false });
});
