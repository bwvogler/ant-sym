import { test } from "node:test";
import assert from "node:assert/strict";
import { USD_PER_INPUT_TOKEN, type JevRequest } from "../../shared/jev.ts";
import type { Services } from "../../server/api.ts";
import { JevAbortError, type JevCallResult, type JevCaller } from "../../server/jev.ts";
import { Ledger, type Timer } from "../../server/ledger.ts";
import { FetchJevClient } from "../fetchJev.ts";
import { DailyBudget, corsHeaders, originAllowed, parseOrigins, passOk, utcDay } from "../gate.ts";
import { route } from "../routes.ts";

const PAGES = "https://bwvogler.github.io";
const DAY = Date.UTC(2026, 10, 5, 12);
const ask: JevRequest = { state: { x: 1 }, questions: { q: { type: "noul", instructions: "x > 0?" } } };
const manualTimer: Timer = { set: () => 0, clear: () => {} };

test("origins: exact match only; no Origin is left to the passphrase", () => {
  const allowed = parseOrigins(" https://bwvogler.github.io/ , http://localhost:38500");
  assert.deepEqual(allowed, [PAGES, "http://localhost:38500"]);
  assert.equal(originAllowed(PAGES, allowed), true);
  assert.equal(originAllowed("https://bwvogler.github.io.evil.example", allowed), false);
  assert.equal(originAllowed("https://evil.example", allowed), false);
  assert.equal(originAllowed(null, allowed), true);
  assert.equal(corsHeaders(PAGES, allowed)["access-control-allow-origin"], PAGES);
  assert.match(corsHeaders(PAGES, allowed)["access-control-allow-headers"]!, /x-jev-ants-pass/);
  assert.deepEqual(corsHeaders("https://evil.example", allowed), {});
  assert.deepEqual(parseOrigins(undefined), []);
});

test("passphrase: must match, and fails closed when none is configured", async () => {
  assert.equal(await passOk("open sesame", "open sesame"), true);
  assert.equal(await passOk("open sesam", "open sesame"), false);
  assert.equal(await passOk(null, "open sesame"), false);
  assert.equal(await passOk("", ""), false);
  assert.equal(await passOk("anything", undefined), false);
});

test("daily budget: a run's cap is cut to what the day has left, and the day rolls over at UTC midnight", () => {
  const b = new DailyBudget(1, null, DAY);
  assert.equal(b.capFor(0.1, DAY), 0.1);
  const spentTokens = Math.round(0.95 / USD_PER_INPUT_TOKEN);
  assert.equal(b.record(spentTokens, DAY), true);
  assert.equal(b.record(spentTokens, DAY), false, "the same session total is not counted twice");
  assert.ok(Math.abs(b.capFor(0.1, DAY) - 0.05) < 1e-6);
  const tomorrow = DAY + 24 * 3600 * 1000;
  assert.equal(utcDay(tomorrow), "2026-11-06");
  assert.equal(b.capFor(0.1, tomorrow), 0.1);
  // Restored from storage on another day: that day's spend does not count today.
  assert.equal(new DailyBudget(1, { day: "2026-11-04", inputTokens: spentTokens * 2 }, DAY).remainingUsd(DAY), 1);
  assert.equal(new DailyBudget(1, { day: "2026-11-05", inputTokens: spentTokens * 2 }, DAY).remainingUsd(DAY), 0);
});

function services(client: JevCaller | null, now = () => DAY): Services {
  return { client, ledger: new Ledger({ timer: manualTimer }), now };
}

const billed = (inputTokens: number): JevCaller => ({
  ask: async (): Promise<JevCallResult> => ({ status: 200, body: { model: "m", answers: { q: { type: "noul", noul: 1 } }, usage: { input_tokens: inputTokens, output_tokens: 1 } }, ms: 5, attempts: 1, inputTokens }),
  destroy: () => {},
});

test("routes: a call is counted against the day, and the day's cap stops the next run from starting", async () => {
  const svc = services(billed(Math.round(0.6 / USD_PER_INPUT_TOKEN)));
  const budget = new DailyBudget(1, null, DAY);
  const body = (o: unknown) => async () => JSON.stringify(o);
  const start = await route(svc, budget, "POST", "/api/run", body({ action: "start", caps: { capUsd: 5, capSeconds: 60 } }));
  assert.equal(start.status, 200);
  assert.equal((start.body as { caps: { capUsd: number } }).caps.capUsd, 1, "asked for $5, the day has $1");
  const r = await route(svc, budget, "POST", "/api/jev", body(ask));
  assert.equal(r.status, 200);
  assert.equal(r.spent, true);
  // A second run gets only the $0.40 left. (The stub bills far more than the request's size reserves, so it overshoots; a real reply cannot.)
  assert.equal((await route(svc, budget, "POST", "/api/run", body({ action: "start", caps: { capUsd: 1 } }))).status, 200);
  assert.ok(Math.abs((budget.snapshot(DAY).usd) - 0.6) < 1e-6);
  await route(svc, budget, "POST", "/api/jev", body(ask));
  const after = await route(svc, budget, "POST", "/api/run", body({ action: "start" }));
  assert.equal(after.status, 409);
  assert.match((after.body as { error: string }).error, /daily cap/);
});

test("routes: errors keep the dev server's statuses", async () => {
  const budget = new DailyBudget(1, null, DAY);
  const none = await route(services(null), budget, "POST", "/api/jev", async () => JSON.stringify(ask));
  assert.equal(none.status, 503);
  const svc = services(billed(1));
  assert.equal((await route(svc, budget, "POST", "/api/jev", async () => "{nope")).status, 400);
  assert.equal((await route(svc, budget, "GET", "/api/jev", async () => "")).status, 405);
  assert.equal((await route(svc, budget, "GET", "/api/nope", async () => "")).status, 404);
  assert.equal((await route(svc, budget, "POST", "/api/jev", async () => JSON.stringify(ask))).status, 409, "no run started");
  const health = await route(svc, budget, "GET", "/api/health", async () => "");
  assert.equal(health.status, 200);
  assert.equal((health.body as { authorized: boolean }).authorized, true);
});

type FakeFetch = (url: string, init: RequestInit) => Promise<Response>;
const client = (f: FakeFetch, extra: Partial<ConstructorParameters<typeof FetchJevClient>[0]> = {}) =>
  new FetchJevClient({ apiKey: "k", fetchFn: f as unknown as typeof fetch, sleep: async () => {}, ...extra });

test("fetch client: sends the key upstream, retries 429, reads usage", async () => {
  const seen: RequestInit[] = [];
  const replies = [new Response("{}", { status: 429, headers: { "retry-after": "0" } }), Response.json({ answers: {}, usage: { input_tokens: 42 } })];
  const r = await client(async (_u, init) => {
    seen.push(init);
    return replies.shift()!;
  }).ask(ask);
  assert.equal(r.status, 200);
  assert.equal(r.attempts, 2);
  assert.equal(r.inputTokens, 42);
  assert.equal((seen[0]!.headers as Record<string, string>).authorization, "Bearer k");
  assert.equal((seen[0]!.headers as Record<string, string>)["content-length"], undefined);
});

test("fetch client: a stop before sending throws at once; one on the wire gets the grace and is counted", async () => {
  const stopped = new AbortController();
  stopped.abort();
  await assert.rejects(client(async () => Response.json({})).ask(ask, stopped.signal), JevAbortError);

  const late = new AbortController();
  const slow: FakeFetch = (_u, init) =>
    new Promise((resolve, reject) => {
      const t = setTimeout(() => resolve(Response.json({ answers: {}, usage: { input_tokens: 7 } })), 30);
      init.signal?.addEventListener("abort", () => {
        clearTimeout(t);
        reject(init.signal?.reason);
      });
    });
  const inGrace = client(slow, { abortGraceMs: 200 }).ask(ask, late.signal);
  late.abort();
  assert.equal((await inGrace).inputTokens, 7, "landed inside the grace: billed, so returned");

  const cut = new AbortController();
  const noGrace = client(slow, { abortGraceMs: 0 }).ask(ask, cut.signal);
  cut.abort();
  await assert.rejects(noGrace, JevAbortError);
});

test("fetch client: the deadline turns a hung upstream into a plain error", async () => {
  const hang: FakeFetch = (_u, init) => new Promise((_r, reject) => init.signal?.addEventListener("abort", () => reject(init.signal?.reason)));
  await assert.rejects(client(hang, { timeoutMs: 20 }).ask(ask), (e: Error) => !(e instanceof JevAbortError) && /exceeded 20 ms/.test(e.message));
});
