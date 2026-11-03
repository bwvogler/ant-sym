import { test } from "node:test";
import assert from "node:assert/strict";
import { apiUrl, detectBackend, isDemo, jevUnavailable } from "../backend.ts";

const reply = (status: number, body: unknown, json = true) =>
  (async () => ({ ok: status >= 200 && status < 300, status, json: async () => (json ? body : Promise.reject(new SyntaxError("<html>"))) }) as Response) as typeof fetch;

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
  assert.match(jevUnavailable(b)!, /JEV_API_KEY/);
});

test("static host: 404, HTML body, or network error all mean no backend", async () => {
  const none = { hasBackend: false, hasKey: false };
  assert.deepEqual(await detectBackend(reply(404, null)), none);
  assert.deepEqual(await detectBackend(reply(200, null, false)), none);
  assert.deepEqual(await detectBackend((async () => { throw new TypeError("offline"); }) as typeof fetch), none);
  assert.match(jevUnavailable(none)!, /Demo build/);
});

test("Start stays disabled while the probe is pending; isDemo only after it answers", () => {
  assert.match(jevUnavailable(null)!, /Checking/);
  assert.equal(isDemo(null), false);
  assert.equal(isDemo({ hasBackend: false, hasKey: false }), true);
  assert.equal(isDemo({ hasBackend: true, hasKey: false }), false);
  assert.equal(jevUnavailable({ hasBackend: true, hasKey: true }), null);
});
