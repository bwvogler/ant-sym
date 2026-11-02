import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import { Engine } from "../../sim/engine.ts";
import { JevScheduler, type SchedulerOptions } from "../jevScheduler.ts";
import type { JevRequest, RunSummary } from "../../../shared/jev.ts";
import { antState, POLICY_CONTEXT } from "../../sim/jevBrain.ts";
import { PolicyCache, situationKey } from "../../sim/policyCache.ts";

// The scheduler against a scripted fetch: no server, no key. Each case is a
// path that must release the ants it parked at commit 1e9 (PR #3 review:
// "there are no scheduler tests at all" — the 429 release could be deleted
// and the suite stayed green).

const RUN: RunSummary = { running: true, startedAt: 0, stoppedAt: null, stopReason: null, elapsedSeconds: 0, caps: { capUsd: 0.5, capSeconds: 180 }, requests: 0, inFlight: 0, maxInFlight: 5, inputTokens: 0, usd: 0, sessionInputTokens: 0, sessionUsd: 0, aborted: 0, medianMs: null, p90Ms: null, statuses: {}, remainingUsd: 0.5, remainingSeconds: 180 };

type Reply = { status: number; body: unknown } | ((signal: AbortSignal | undefined) => Promise<{ status: number; body: unknown }>);

/** Scripted fetch: /api/run answers with a summary; /api/jev answers with `jev` (a reply or a function of the signal). */
function scriptFetch(jev: Reply) {
  const calls: string[] = [];
  const fetchStub = async (url: string | URL, init?: RequestInit) => {
    const path = String(url);
    calls.push(path);
    let r: { status: number; body: unknown };
    if (path.startsWith("/api/run")) {
      const action = init?.body ? (JSON.parse(String(init.body)) as { action?: string }).action : undefined;
      r = { status: 200, body: action === "stop" || action === "formed" ? { ...RUN, running: false, stopReason: action === "formed" ? "formed" : "user" } : RUN };
    } else r = typeof jev === "function" ? await jev(init?.signal ?? undefined) : jev;
    return { ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => r.body } as Response;
  };
  globalThis.fetch = fetchStub as typeof fetch;
  return calls;
}

function world(n = 20) {
  const e = new Engine({ antCount: n, size: { w: 16, h: 16 }, speed: 1 });
  const t = new Float32Array(256);
  t[8 * 16 + 8] = n;
  e.setTarget(t);
  e.refreshGrids();
  return e;
}

const tick = (ms: number) => new Promise((r) => setTimeout(r, ms));

// A failed assertion must not skip dispose(): live intervals would keep the
// test process alive. Every scheduler registers here and is disposed after each test.
const live = new Set<JevScheduler>();
function make(e: Engine, opts: Partial<SchedulerOptions>, cache?: PolicyCache): JevScheduler {
  const s = new JevScheduler(e, opts, cache);
  live.add(s);
  return s;
}
afterEach(() => {
  for (const s of live) s.dispose();
  live.clear();
});

function parked(e: Engine): number {
  let n = 0;
  for (let i = 0; i < e.world.n; i++) if ((e.world.commit[i] as number) >= 1e9) n++;
  return n;
}

test("429 busy releases the ants it parked, keeps running, and is not a failure", async () => {
  const e = world();
  const calls = scriptFetch({ status: 429, body: { error: "busy", run: RUN } });
  const s = make(e, { intervalMs: 10, minAgeSeconds: 0, batch: 5, inFlight: 1 });
  await s.start({});
  await tick(60);
  const st = s.state;
  s.dispose();
  assert.equal(st.phase, "running");
  assert.equal(st.failures, 0);
  assert.equal(st.pending, 0);
  assert.equal(parked(e), 0, "no ant left at commit 1e9");
  assert.ok(calls.filter((c) => c === "/api/jev").length >= 2, "retried on later cycles");
});

test("409 (cap or stop elsewhere) halts: phase stopped, ants released to the local rule, nothing more sent", async () => {
  const e = world();
  const stopped = { ...RUN, running: false, stopReason: "spend-cap" as const };
  const calls = scriptFetch({ status: 409, body: { error: "spend-cap", run: stopped } });
  const s = make(e, { intervalMs: 10, minAgeSeconds: 0, batch: 5, inFlight: 2 });
  await s.start({});
  await tick(60);
  const sent = calls.filter((c) => c === "/api/jev").length;
  await tick(40);
  const st = s.state;
  s.dispose();
  assert.equal(st.phase, "stopped");
  assert.equal(st.run?.stopReason, "spend-cap");
  assert.equal(parked(e), 0);
  assert.equal(e.idleBehaviour, "local");
  assert.equal(calls.filter((c) => c === "/api/jev").length, sent, "no calls after the halt");
});

test("Stop aborts the browser side of open calls and releases their ants; the abort is not a failure", async () => {
  const e = world();
  scriptFetch(
    (signal) =>
      new Promise((_resolve, reject) => {
        const err = new Error("aborted");
        err.name = "AbortError";
        if (signal?.aborted) reject(err);
        signal?.addEventListener("abort", () => reject(err));
        // never answers on its own
      }),
  );
  const s = make(e, { intervalMs: 10, minAgeSeconds: 0, batch: 5, inFlight: 2 });
  await s.start({});
  await tick(30);
  assert.ok(parked(e) > 0, "calls are open");
  await s.stop("user");
  await tick(20);
  const st = s.state;
  s.dispose();
  assert.equal(st.phase, "stopped");
  assert.equal(st.pending, 0);
  assert.equal(parked(e), 0);
  assert.equal(st.failures, 0);
  assert.equal(st.lastError, null);
});

test("never keeps more calls open than the server allows (JEV_IN_FLIGHT below the browser's width)", async () => {
  const e = world(40);
  let open = 0;
  let most = 0;
  globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
    if (String(url).startsWith("/api/run")) return { ok: true, status: 200, json: async () => ({ ...RUN, maxInFlight: 1 }) } as Response;
    open++;
    most = Math.max(most, open);
    // never answers on its own; Stop aborts it
    return new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener("abort", () => (open--, reject(Object.assign(new Error("aborted"), { name: "AbortError" })))));
  }) as typeof fetch;
  const s = make(e, { intervalMs: 10, minAgeSeconds: 0, batch: 5, inFlight: 5, overseer: false });
  await s.start({});
  await tick(60);
  await s.stop("user");
  s.dispose();
  assert.equal(most, 1, "one call at a time, as the server's limit says");
});

test("a reply that cannot be read does not strand the batch", async () => {
  const e = world();
  // compass answers whose choice has no probabilities: sampling throws "reduce of empty array"
  const answers: Record<string, unknown> = {};
  for (let i = 0; i < e.world.n; i++) {
    answers[`a${i}_dir`] = { type: "choice", choice: "N", confidence: 0.5, probabilities: {} };
    answers[`a${i}_settle`] = { type: "noul", noul: 0.1 };
  }
  scriptFetch({ status: 200, body: { status: 200, body: { model: "jev-x", answers, usage: { input_tokens: 10, output_tokens: 0 } }, ms: 1, attempts: 1, inputTokens: 10, run: RUN } });
  const s = make(e, { intervalMs: 10, minAgeSeconds: 0, batch: 5, inFlight: 1, sample: true, schema: "compass" });
  await s.start({});
  await tick(40);
  const st = s.state;
  s.dispose();
  assert.equal(parked(e), 0, "every ant of the batch was released");
  assert.ok(st.failures >= 1);
  assert.match(String(st.lastError), /reading answers/);
});

const IMAGES = async () => ({ target: "AA==", current: "AA==" });
const OVERSEER_OK = { status: 200, body: { status: 200, body: { model: "jev-x", answers: { gap: { type: "box", box: { top: 0.2, bottom: 0.4, left: 0.2, right: 0.4 } }, done: { type: "noul", noul: 0.3 } }, usage: { input_tokens: 10, output_tokens: 0 } }, ms: 1, attempts: 1, inputTokens: 10, run: RUN } };

/** Scripted fetch that tells the overseer's request (box question) from the ants'. */
function scriptBoth(ants: Reply, overseer: Reply) {
  const calls: string[] = [];
  const fetchStub = async (url: string | URL, init?: RequestInit) => {
    const path = String(url);
    let r: { status: number; body: unknown };
    if (path.startsWith("/api/run")) {
      const action = init?.body ? (JSON.parse(String(init.body)) as { action?: string }).action : undefined;
      r = { status: 200, body: action === "stop" || action === "formed" ? { ...RUN, running: false, stopReason: "user" } : RUN };
      calls.push(`run:${action ?? "get"}`);
    } else {
      const isOverseer = String(init?.body ?? "").includes('"type":"box"');
      calls.push(isOverseer ? "overseer" : "ants");
      const script = isOverseer ? overseer : ants;
      r = typeof script === "function" ? await script(init?.signal ?? undefined) : script;
    }
    return { ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => r.body } as Response;
  };
  globalThis.fetch = fetchStub as typeof fetch;
  return calls;
}

test("overseer: a look held across Stop and Start does not steer the new run; a 409 on the overseer halts like the ant path", async () => {
  // M4 / M5 from the PR #3 review: both guards could be deleted with the suite green.
  const e = world();
  let release: (() => void) | null = null;
  const held = new Promise<void>((r) => (release = r));
  // the ant path answers busy so no ant decisions interfere; the first look is held and its box sits on the
  // ink at the centre (so it would steer); later looks never answer
  let looks = 0;
  const onInk = { ...OVERSEER_OK, body: { ...OVERSEER_OK.body, body: { ...OVERSEER_OK.body.body, answers: { ...OVERSEER_OK.body.body.answers, gap: { type: "box", box: { top: 0.45, bottom: 0.6, left: 0.45, right: 0.6 } } } } } };
  const calls = scriptBoth({ status: 429, body: { error: "busy", run: RUN } }, async () => {
    if (looks++ === 0) {
      await held;
      return onInk;
    }
    return new Promise(() => {});
  });
  const s = make(e, { intervalMs: 50, minAgeSeconds: 0, batch: 5, inFlight: 1, overseer: true, overseerMs: 10, renderImages: IMAGES });
  await s.start({});
  await tick(40); // the look is in flight
  await s.stop("user");
  await s.start({}); // run 2
  release!();
  await tick(5);
  assert.equal(e.attractor, null, "the old run's box did not become run 2's attractor");
  assert.equal(s.state.overseer, null, "nor its readout");
  s.dispose();

  const e2 = world();
  const stopped = { ...RUN, running: false, stopReason: "time-cap" as const };
  const calls2 = scriptBoth({ status: 429, body: { error: "busy", run: RUN } }, { status: 409, body: { error: "time-cap", run: stopped } });
  const s2 = make(e2, { intervalMs: 50, minAgeSeconds: 0, batch: 5, inFlight: 1, overseer: true, overseerMs: 10, renderImages: IMAGES });
  await s2.start({});
  await tick(60);
  const st = s2.state;
  s2.dispose();
  assert.equal(st.phase, "stopped", "an overseer 409 ends the run on the browser side too");
  assert.equal(st.run?.stopReason, "time-cap");
  assert.equal(e2.idleBehaviour, "local");
  assert.ok(calls2.includes("overseer") && calls.includes("overseer"));
});

test("the session line is the server's cross-run total and never goes backwards on an out-of-order reply", async () => {
  // M6 from the PR #3 review.
  const e = world();
  let n = 0;
  const totals = [500, 300, 900]; // the 300 is a reply that landed late
  scriptFetch(async () => {
    const t = totals[Math.min(n++, totals.length - 1)] as number;
    return { status: 429, body: { error: "busy", run: { ...RUN, sessionInputTokens: t, sessionUsd: t * (0.042 / 1e6) } } };
  });
  const s = make(e, { intervalMs: 10, minAgeSeconds: 0, batch: 5, inFlight: 1, overseer: false });
  await s.start({});
  await tick(25);
  assert.equal(s.state.sessionTokens, 500, "a late, lower total does not pull the line down");
  await tick(40);
  assert.equal(s.state.sessionTokens, 900);
  s.dispose();
});


// The cached schema: situations, not ants, go to Jev.

/** A proxy reply answering every situation in the request: go north, do not settle. Records each request's situation states. */
function situationReplies(sent: string[][]) {
  return async (_signal: AbortSignal | undefined, body?: string) => {
    const req = JSON.parse(String(body)) as JevRequest & { state: { ants: Record<string, unknown> } };
    sent.push(Object.values(req.state.ants).map((a) => JSON.stringify(a)));
    const answers: Record<string, unknown> = {};
    for (const id of Object.keys(req.state.ants)) {
      answers[`${id}_dir`] = { type: "choice", choice: "N", confidence: 0.9, probabilities: { N: 0.9, stay: 0.1 } };
      answers[`${id}_settle`] = { type: "noul", noul: 0.1 };
    }
    return { status: 200, body: { status: 200, body: { model: "jev-x", answers, usage: { input_tokens: 10, output_tokens: 0 } }, ms: 1, attempts: 1, inputTokens: 10, run: RUN } };
  };
}

/** scriptFetch, with the request body passed to the script. */
function scriptFetchBody(jev: (signal: AbortSignal | undefined, body?: string) => Promise<{ status: number; body: unknown }>) {
  const calls: string[] = [];
  globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
    const path = String(url);
    calls.push(path);
    let r: { status: number; body: unknown };
    if (path.startsWith("/api/run")) r = { status: 200, body: RUN };
    else r = await jev(init?.signal ?? undefined, init?.body ? String(init.body) : undefined);
    return { ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => r.body } as Response;
  }) as typeof fetch;
  return calls;
}

test("cached: each situation is asked once however many ants share it, and the reply decides for all of them", async () => {
  const e = world(40);
  const sent: string[][] = [];
  scriptFetchBody(situationReplies(sent));
  const s = make(e, { schema: "cached", intervalMs: 10, minAgeSeconds: 0, batch: 100, inFlight: 2, overseer: false });
  await s.start({});
  await tick(60);
  const st = s.state;
  s.dispose();
  const all = sent.flat();
  assert.ok(all.length > 0);
  assert.equal(new Set(all).size, all.length, "no situation was asked twice");
  const keys = new Set(Array.from({ length: e.world.n }, (_, i) => situationKey(antState(e, i)).key));
  assert.ok(all.length < e.world.n, `fewer situations (${all.length}) than ants (${e.world.n})`);
  assert.equal(parked(e), 0, "every parked ant was decided");
  assert.equal(st.pending, 0);
  assert.equal(st.cache.waited, e.world.n);
  assert.equal(st.cache.asked, all.length);
  assert.equal(s.cache.size, all.length);
  assert.equal(all.length, keys.size, "one question per distinct situation the ants stood in");
  assert.ok(st.sample?.situation, "the live sample names its situation");
});

test("cached: ants in situations already in the cache decide without a call", async () => {
  const e = world(40);
  const cache = new PolicyCache(POLICY_CONTEXT);
  for (let i = 0; i < e.world.n; i++) cache.put(situationKey(antState(e, i)).key, { choice: "N", confidence: 0.9, probabilities: { N: 0.9, stay: 0.1 }, pSettle: 0.1 });
  const calls = scriptFetch({ status: 500, body: { error: "should not be called" } });
  const s = make(e, { schema: "cached", intervalMs: 10, minAgeSeconds: 0, batch: 100, inFlight: 2, overseer: false }, cache);
  await s.start({});
  await tick(40);
  const st = s.state;
  s.dispose();
  assert.equal(calls.filter((c) => c === "/api/jev").length, 0);
  assert.equal(st.cache.hits, e.world.n);
  assert.equal(st.cache.asked, 0);
  assert.equal(e.decisions.jev + e.decisions.local, e.world.n);
  assert.equal(parked(e), 0);
});

test("cached: a hit keeps the minimum age, like a call (the coast between decisions is part of the policy)", async () => {
  const e = world(20);
  const cache = new PolicyCache(POLICY_CONTEXT);
  for (let i = 0; i < e.world.n; i++) cache.put(situationKey(antState(e, i)).key, { choice: "N", confidence: 0.9, probabilities: { N: 0.9 }, pSettle: 0.1 });
  e.world.decidedAt.fill(e.time); // everyone just decided
  const calls = scriptFetch({ status: 500, body: { error: "should not be called" } });
  const s = make(e, { schema: "cached", intervalMs: 10, minAgeSeconds: 5, batch: 100, inFlight: 2, overseer: false }, cache);
  await s.start({});
  await tick(40);
  const st = s.state;
  s.dispose();
  assert.equal(st.cache.hits, 0);
  assert.equal(calls.filter((c) => c === "/api/jev").length, 0);
});

test("cached: busy releases the ants parked on its situations and un-counts them; a failed call hands them to the local rule", async () => {
  const e = world(30);
  scriptFetch({ status: 429, body: { error: "busy", run: RUN } });
  const s = make(e, { schema: "cached", intervalMs: 10, minAgeSeconds: 0, batch: 100, inFlight: 1, overseer: false });
  await s.start({});
  await tick(50);
  const st = s.state;
  s.dispose();
  assert.equal(st.phase, "running");
  assert.equal(st.failures, 0);
  assert.equal(st.cache.asked, 0, "nothing was answered");
  assert.equal(s.cache.size, 0);

  const e2 = world(30);
  scriptFetch({ status: 502, body: { error: "upstream" } });
  const s2 = make(e2, { schema: "cached", intervalMs: 10, minAgeSeconds: 0, batch: 100, inFlight: 1, overseer: false });
  await s2.start({});
  await tick(30);
  const st2 = s2.state;
  s2.dispose();
  assert.ok(st2.failures >= 1);
  assert.equal(parked(e2), 0, "no ant left at commit 1e9");
  assert.ok(e2.decisions.local > 0);
});

test("cached: a 409 halts and releases every parked ant", async () => {
  const e = world(30);
  const stopped = { ...RUN, running: false, stopReason: "spend-cap" as const };
  scriptFetch({ status: 409, body: { error: "spend-cap", run: stopped } });
  const s = make(e, { schema: "cached", intervalMs: 10, minAgeSeconds: 0, batch: 100, inFlight: 2, overseer: false });
  await s.start({});
  await tick(40);
  const st = s.state;
  s.dispose();
  assert.equal(st.phase, "stopped");
  assert.equal(st.pending, 0);
  assert.equal(parked(e), 0);
});
