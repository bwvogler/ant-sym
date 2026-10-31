import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import { Colony, type Mode } from "../../colony/colony.ts";
import { DOCTRINES, policyContext } from "../../colony/colonyBrain.ts";
import { generateWorld, mulberry32 } from "../../colony/world.ts";
import { ColonyJev, type CacheStore } from "../colonyJev.ts";
import type { JevRequest, RunSummary } from "../../../shared/jev.ts";

// The colony's Jev client against a scripted fetch: no server, no key.

const RUN: RunSummary = { running: true, startedAt: 0, stoppedAt: null, stopReason: null, elapsedSeconds: 0, caps: { capUsd: 0.1, capSeconds: 1800 }, requests: 0, inFlight: 0, inputTokens: 0, usd: 0, sessionInputTokens: 0, sessionUsd: 0, aborted: 0, medianMs: null, p90Ms: null, statuses: {}, remainingUsd: 0.1, remainingSeconds: 1800 };

type Script = (req: JevRequest) => { status: number; body: unknown } | Promise<{ status: number; body: unknown }>;

/** Scripted fetch; returns the situations each /api/jev request carried. */
function scriptFetch(jev: Script) {
  const sent: string[][] = [];
  globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
    const path = String(url);
    let r: { status: number; body: unknown };
    if (path.startsWith("/api/run")) r = { status: 200, body: RUN };
    else {
      const req = JSON.parse(String(init?.body)) as JevRequest & { state: { ants?: Record<string, unknown> } };
      if (req.state.ants) sent.push(Object.values(req.state.ants).map((a) => JSON.stringify(a))); // ant situations only, not stances
      r = await jev(req);
    }
    return { ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => r.body } as Response;
  }) as typeof fetch;
  return sent;
}

/** Jev answers every situation with `mode`. */
const answerAll =
  (mode: Mode): Script =>
  (req) => {
    const answers: Record<string, unknown> = {};
    for (const q of Object.keys(req.questions)) answers[q] = { type: "choice", choice: mode, confidence: 0.9 };
    return { status: 200, body: { status: 200, body: { model: "jev-x", answers, usage: { input_tokens: 10, output_tokens: 0 } }, ms: 1, attempts: 1, inputTokens: 10, run: RUN } };
  };

function memoryStore(): CacheStore & { data: Map<string, [string, string][]> } {
  const data = new Map<string, [string, string][]>();
  return { data, load: (c) => data.get(c) ?? [], save: (c, e) => void data.set(c, e) };
}

const tick = (ms: number) => new Promise((r) => setTimeout(r, ms));
const live = new Set<ColonyJev>();
function make(store: CacheStore | null = null): ColonyJev {
  const j = new ColonyJev({ intervalMs: 10 }, store);
  live.add(j);
  return j;
}
afterEach(() => {
  for (const j of live) j.dispose();
  live.clear();
});

function colony(n = 60) {
  return new Colony(generateWorld(1), { antCount: n }, mulberry32(9));
}

/** Run the colony for k ticks (the policy is asked inside tick). */
function run(c: Colony, k: number) {
  for (let i = 0; i < k; i++) c.tick(1 / 30);
}

test("off: the local rule, no calls", async () => {
  const sent = scriptFetch(answerAll("return"));
  const j = make();
  const c = colony();
  j.attach(c);
  run(c, 5);
  await tick(30);
  assert.equal(sent.length, 0);
  assert.equal(j.state.phase, "off");
});

test("running: each new situation is asked once; the answers are cached and the ants switch to them", async () => {
  const sent = scriptFetch(answerAll("return"));
  const store = memoryStore();
  const j = make(store);
  j.setDoctrine(DOCTRINES[0]!.text);
  const c = colony();
  j.attach(c);
  await j.start();
  run(c, 3);
  await tick(40);
  const all = sent.flat();
  assert.ok(all.length > 0 && all.length < c.population, `${all.length} situations for ${c.population} ants`);
  assert.equal(new Set(all).size, all.length, "no situation asked twice");
  assert.equal(j.state.cached, all.length);
  run(c, 1);
  const modes = c.counts();
  assert.equal(modes.return, c.population, "every ant took Jev's answer on its next tick");
  assert.ok(j.state.hits > 0);
  assert.equal(store.data.get(policyContext(DOCTRINES[0]!.text))?.length, all.length, "persisted under the doctrine");
});

test("a new doctrine has its own cache; switching back to an old one is free", async () => {
  const sent = scriptFetch(answerAll("explore"));
  const j = make();
  const c = colony();
  j.setDoctrine(DOCTRINES[0]!.text);
  j.attach(c);
  await j.start();
  run(c, 3);
  await tick(40);
  const first = sent.flat().length;
  j.setDoctrine(DOCTRINES[1]!.text);
  assert.equal(j.state.cached, 0);
  run(c, 1);
  await tick(40);
  assert.ok(sent.flat().length > first, "the new doctrine was asked");
  const afterSecond = sent.length;
  j.setDoctrine(DOCTRINES[0]!.text);
  run(c, 1);
  await tick(40);
  assert.equal(sent.length, afterSecond, "back to the first doctrine: no calls for situations it has answered");
});

test("a 409 ends the run and the colony is back on the local rule", async () => {
  const stopped = { ...RUN, running: false, stopReason: "spend-cap" as const };
  scriptFetch(() => ({ status: 409, body: { error: "spend-cap", run: stopped } }));
  const j = make();
  const c = colony();
  j.attach(c);
  await j.start();
  run(c, 2);
  await tick(40);
  assert.equal(j.state.phase, "stopped");
  assert.match(String(j.state.lastError), /spend-cap/);
  assert.equal(j.policy({ mode: "follow", tired: true, foodTrail: "none", homeTrail: "none", alarm: "none", enemy: "none", stance: "forage" }), "return", "the local rule answers");
});

test("busy puts the situations back in the queue; a failure cools down instead of hammering", async () => {
  let calls = 0;
  scriptFetch(() => {
    calls++;
    return calls === 1 ? { status: 429, body: { error: "busy", run: RUN } } : answerAll("follow")({ questions: {} } as JevRequest);
  });
  const j = make();
  const c = colony();
  j.attach(c);
  await j.start();
  run(c, 2);
  await tick(50);
  assert.ok(calls >= 2, "asked again after busy");
  assert.equal(j.state.failures, 0);

  let failed = 0;
  scriptFetch(() => {
    failed++;
    return { status: 502, body: { error: "upstream" } };
  });
  const j2 = make();
  const c2 = colony();
  j2.attach(c2);
  await j2.start();
  run(c2, 2);
  await tick(45);
  assert.equal(failed, 1, "one failed call, then a cool-down");
  assert.equal(j2.state.failures, 1);
  assert.equal(j2.state.phase, "running", "a failure is not the end of the run");
});

test("the strategist's stance goes through its own cached lane", async () => {
  const stances: string[] = [];
  scriptFetch((req) => {
    const answers: Record<string, unknown> = {};
    for (const q of Object.keys(req.questions)) {
      if (q.endsWith("_stance")) stances.push(q);
      answers[q] = { type: "choice", choice: q.endsWith("_stance") ? "defend" : "explore" };
    }
    return { status: 200, body: { status: 200, body: { model: "jev-x", answers, usage: { input_tokens: 10, output_tokens: 0 } }, ms: 1, attempts: 1, inputTokens: 10, run: RUN } };
  });
  const j = make();
  const c = colony();
  j.attach(c);
  await j.start();
  const v = c.stanceSituation(false);
  assert.equal(j.stancePolicy(v), "forage", "first time: the local strategist, and the view is queued");
  await tick(40);
  assert.equal(stances.length, 1);
  assert.equal(j.stancePolicy(v), "defend", "then Jev's cached stance");
  assert.equal(j.state.stancesCached, 1);
  await tick(30);
  assert.equal(stances.length, 1, "asked once");
});
