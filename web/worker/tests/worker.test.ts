import { test } from "node:test";
import assert from "node:assert/strict";
import { USD_PER_INPUT_TOKEN, type JevRequest, type RunSummary } from "../../shared/jev.ts";
import type { Services } from "../../server/replies.ts";
import { JevAbortError, type JevCallResult, type JevCaller } from "../../server/jev.ts";
import { Ledger, type BudgetStore, type Timer } from "../../server/ledger.ts";
import { FetchJevClient } from "../fetchJev.ts";
import { corsHeaders, originAllowed, parseOrigins, passOk } from "../gate.ts";
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

function services(client: JevCaller | null, opts: { dailyUsd?: number; store?: BudgetStore } = {}): Services {
  return { client, ledger: new Ledger({ timer: manualTimer, dailyUsd: opts.dailyUsd, budgetStore: opts.store }), now: () => DAY };
}

const billed = (inputTokens: number): JevCaller => ({
  ask: async (): Promise<JevCallResult> => ({ status: 200, body: { model: "m", answers: { q: { type: "noul", noul: 1 } }, usage: { input_tokens: inputTokens, output_tokens: 1 } }, ms: 5, attempts: 1, inputTokens }),
  destroy: () => {},
});

test("routes: the ledger's daily budget holds across a restart of the Durable Object", async () => {
  let saved: { day: string; tokens: number } | null = null;
  const store: BudgetStore = { load: () => saved, save: (v) => void (saved = v) };
  const body = (o: unknown) => async () => JSON.stringify(o);
  const svc = services(billed(Math.round(0.6 / USD_PER_INPUT_TOKEN)), { dailyUsd: 1, store });
  assert.equal((await route(svc, "POST", "/api/run", body({ action: "start", caps: { capUsd: 100, capSeconds: 86_400 } }))).status, 200);
  assert.equal((await route(svc, "POST", "/api/jev", body(ask))).status, 200);
  assert.ok(saved!.tokens > 0, "the day's spend was handed to the store");
  // Evicted and rebuilt: a new ledger from the same storage still counts the day's $0.60, so a reply billing $0.60 more is over.
  const again = services(billed(Math.round(0.6 / USD_PER_INPUT_TOKEN)), { dailyUsd: 1, store });
  const health = await route(again, "GET", "/api/health", async () => "");
  assert.ok(Math.abs((health.body as { run: RunSummary }).run.budget!.spentUsd - 0.6) < 1e-6);
  await route(again, "POST", "/api/run", body({ action: "start" }));
  await route(again, "POST", "/api/jev", body(ask));
  const spent = await route(again, "POST", "/api/run", body({ action: "start" }));
  assert.equal((spent.body as RunSummary).running, false);
  assert.equal((spent.body as RunSummary).stopReason, "budget");
});

test("routes: errors keep the dev server's statuses", async () => {
  const none = await route(services(null), "POST", "/api/jev", async () => JSON.stringify(ask));
  assert.equal(none.status, 503);
  const svc = services(billed(1));
  assert.equal((await route(svc, "POST", "/api/jev", async () => "{nope")).status, 400);
  assert.equal((await route(svc, "GET", "/api/jev", async () => "")).status, 405);
  assert.equal((await route(svc, "GET", "/api/nope", async () => "")).status, 404);
  assert.equal((await route(svc, "POST", "/api/jev", async () => JSON.stringify(ask))).status, 409, "no run started");
  const health = await route(svc, "GET", "/api/health", async () => "");
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

test("the Worker never loads server/api.ts, and what it shares stays free of node:fs", async () => {
  const { readdirSync, readFileSync } = await import("node:fs");
  const dir = new URL("../", import.meta.url);
  for (const f of readdirSync(dir).filter((n: string) => n.endsWith(".ts"))) {
    assert.doesNotMatch(readFileSync(new URL(f, dir), "utf8"), /from\s+["'][^"']*server\/api\.ts["']/, `worker/${f} imports server/api.ts, which throws at load in a Worker`);
  }
  assert.doesNotMatch(readFileSync(new URL("../../server/replies.ts", import.meta.url), "utf8"), /from\s+["']node:fs["']|new URL\([^)]*import\.meta\.url/);
});
