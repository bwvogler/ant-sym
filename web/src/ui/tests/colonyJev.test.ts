import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import { Colony, type Mode, type Situation } from "../../colony/colony.ts";
import { DOCTRINES, policyContext } from "../../colony/colonyBrain.ts";
import { generateWorld, mulberry32, OPEN_WORLD } from "../../colony/world.ts";
import { Game } from "../../colony/game.ts";
import { STRAINS, intervention } from "../../colony/fungus.ts";
import { decodeFungal } from "../../colony/fungalPolicy.ts";
import { ColonyJev, type CacheStore } from "../colonyJev.ts";
import type { JevRequest, RunSummary } from "../../../shared/jev.ts";

// The colony's Jev client against a scripted fetch: no server, no key.

const RUN: RunSummary = { running: true, startedAt: 0, stoppedAt: null, stopReason: null, elapsedSeconds: 0, caps: { capUsd: 0.1, capSeconds: 1800 }, requests: 0, inFlight: 0, maxInFlight: 5, inputTokens: 0, usd: 0, sessionInputTokens: 0, sessionUsd: 0, aborted: 0, medianMs: null, p90Ms: null, statuses: {}, remainingUsd: 0.1, remainingSeconds: 1800 };

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
  return new Colony(generateWorld(1, OPEN_WORLD), { antCount: n }, mulberry32(9));
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

/** A promise you resolve by hand, to hold a reply in flight. */
function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

const SIT = { mode: "explore", tired: false, foodTrail: "none", homeTrail: "strong", alarm: "none", enemy: "none", stance: "forage" } as const;

test("a late Stop reply does not overwrite a run started again in the meantime", async () => {
  const slowStop = deferred<void>();
  globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
    const action = (JSON.parse(String(init?.body ?? "{}")) as { action?: string }).action;
    if (String(url).startsWith("/api/run") && action === "stop") await slowStop.promise;
    return { ok: true, status: 200, json: async () => RUN } as Response;
  }) as typeof fetch;
  const j = make();
  j.attach(colony());
  await j.start();
  const stopping = j.stop();
  await j.start(); // pressed Start again before the stop reply came back
  slowStop.resolve();
  await stopping;
  assert.equal(j.state.phase, "running");
});

test("busy after a doctrine switch does not re-ask what the current doctrine has cached; in-flight questions are per doctrine", async () => {
  const [a, b] = [DOCTRINES[0]!.text, DOCTRINES[1]!.text];
  const held = deferred<void>();
  const sent: string[] = [];
  scriptFetch(async (req) => {
    const doctrine = (req.state as { doctrine: string }).doctrine;
    sent.push(doctrine === a ? "A" : "B");
    if (doctrine === b && sent.filter((d) => d === "B").length === 1) {
      await held.promise;
      return { status: 429, body: { error: "busy", run: RUN } };
    }
    return answerAll("follow")(req);
  });
  const j = make();
  j.setDoctrine(a);
  j.attach(colony());
  await j.start();
  j.policy(SIT);
  await tick(30);
  assert.deepEqual(sent, ["A"], "A answered it");
  j.setDoctrine(b);
  j.policy(SIT); // asked under B; held in flight
  await tick(30);
  j.setDoctrine(a); // back to A, which has it cached
  assert.equal(j.policy(SIT), "follow", "A's cached answer");
  held.resolve(); // B's request comes back busy
  await tick(60);
  assert.deepEqual(sent, ["A", "B"], "nothing re-asked: B is not current, and A has it");

  // In flight under one doctrine is still unasked under another.
  const held2 = deferred<void>();
  const sent2: string[] = [];
  scriptFetch(async (req) => {
    const doctrine = (req.state as { doctrine: string }).doctrine;
    sent2.push(doctrine === a ? "A" : "B");
    if (doctrine === a) await held2.promise;
    return answerAll("return")(req);
  });
  const j2 = make();
  j2.setDoctrine(a);
  j2.attach(colony());
  await j2.start();
  const s2 = { ...SIT, alarm: "faint" } as const;
  j2.policy(s2); // A: in flight, held
  await tick(30);
  j2.setDoctrine(b);
  j2.policy(s2); // must be queued for B, not skipped as "already asking"
  await tick(30);
  assert.deepEqual(sent2, ["A", "B"]);
  held2.resolve();
  await tick(30);
});

test("explain says who decides a situation, without counting or queuing it", async () => {
  scriptFetch(answerAll("return"));
  const j = make();
  const c = colony();
  j.attach(c);
  const s = { mode: "explore", tired: false, foodTrail: "none", homeTrail: "strong", alarm: "none", enemy: "none", stance: "forage" } as const;
  assert.deepEqual(j.explain(s), { mode: "explore", by: "local" }, "off: the local rule");
  await j.start();
  const before = { hits: j.state.hits, misses: j.state.misses };
  assert.equal(j.explain(s).by, "local", "running, never met: the local rule, and nothing queued");
  assert.deepEqual({ hits: j.state.hits, misses: j.state.misses }, before, "explaining counts nothing");
  j.policy(s); // the colony meets it: queued for Jev
  assert.equal(j.explain(s).by, "waiting");
  await tick(60);
  assert.deepEqual(j.explain(s), { mode: "return", by: "jev" }, "answered: Jev's cached answer");
});

test("explain alone never asks Jev", async () => {
  const sent = scriptFetch(answerAll("follow"));
  const j = make();
  j.attach(colony());
  await j.start();
  j.explain({ mode: "explore", tired: true, foodTrail: "faint", homeTrail: "none", alarm: "none", enemy: "none", stance: "forage" });
  await tick(60); // several cycles
  assert.equal(sent.length, 0, "no /api/jev request");
});

// The fungus's lane (ja-t4d.5): its own questions, under the player's aim, never in an ant's request.

/** Every request, whole; Jev answers modes "explore", stances "forage", and the fungus `fungal`. */
function scriptAll(fungal: string) {
  const reqs: (JevRequest & { state: Record<string, unknown> })[] = [];
  globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
    if (String(url).startsWith("/api/run")) return { ok: true, status: 200, json: async () => RUN } as Response;
    const req = JSON.parse(String(init?.body)) as JevRequest & { state: Record<string, unknown> };
    reqs.push(req);
    const answers: Record<string, unknown> = {};
    for (const q of Object.keys(req.questions)) answers[q] = { type: "choice", choice: q.endsWith("_do") ? fungal : q.endsWith("_stance") ? "forage" : "explore", confidence: 0.9 };
    const body = { status: 200, body: { model: "jev-x", answers, usage: { input_tokens: 10, output_tokens: 0 } }, ms: 1, attempts: 1, inputTokens: 10, run: RUN };
    return { ok: true, status: 200, json: async () => body } as Response;
  }) as typeof fetch;
  return reqs;
}

/** A small game with Garden painted on the player's nest. */
function infectedGame() {
  const g = new Game(generateWorld(1, { size: { w: 160, h: 100 } }), { antCount: 60, rivalAnts: 60 }, mulberry32(4));
  g.paintSpores(g.player.nest.x, g.player.nest.y, g.player.nest.r + 2, 3, 0.4, STRAINS.findIndex((s) => s.id === "garden"));
  return g;
}

test("the fungus lane: fungal situations go to Jev under the aim, the answers are cached, and the hosts run them", async () => {
  const reqs = scriptAll("dormant");
  const j = make();
  const g = infectedGame();
  j.attach(g.player);
  j.attachFungus(g.fungus);
  j.setAim("Spread unseen.");
  // Off: the local rule (Garden's default, blend).
  for (let k = 0; k < 6; k++) g.tick(1 / 30);
  assert.ok([...g.player.expr].some((e) => e === intervention("blend")), "off: Garden blends");
  await j.start();
  for (let round = 0; round < 6; round++) {
    for (let k = 0; k < 6; k++) g.tick(1 / 30);
    await tick(25);
  }
  const fungal = reqs.filter((r) => r.state.hosts);
  assert.ok(fungal.length > 0, "the fungus asked");
  for (const r of fungal) {
    assert.equal(r.state.aim, "Spread unseen.");
    assert.equal(r.state.ants, undefined);
    assert.equal(r.state.doctrine, undefined, "the aim, not the colony's doctrine");
  }
  for (const r of reqs.filter((x) => x.state.ants)) {
    assert.equal(r.state.aim, undefined, "an ant's request never carries the fungus's aim");
    assert.equal(r.state.hosts, undefined);
  }
  assert.ok(j.state.fungusCached > 0 && j.state.fungusAsked > 0);
  // Jev said dormant: every host runs dormant now.
  for (let k = 0; k < 6; k++) g.tick(1 / 30);
  for (let i = 0; i < g.player.n; i++) if (g.player.alive[i] && (g.player.load[i] as number) > 0) assert.equal(g.player.expr[i], 0, `host ${i}`);
  const s = decodeFungal(g.player.fungal.find((v) => v >= 0) as number, "garden");
  assert.equal(j.explainFungus(s).by, "jev");
  assert.equal(j.explainFungus(s).answer, "dormant");
});

test("the fungus lane: a new aim is a new cache, a new menu a new question; stopping hands the fungus back to the local rule", async () => {
  scriptAll("soothe");
  const store = memoryStore();
  const j = make(store);
  const g = infectedGame();
  j.attach(g.player);
  j.attachFungus(g.fungus);
  j.setAim("Calm every meeting.");
  await j.start();
  for (let round = 0; round < 5; round++) {
    for (let k = 0; k < 6; k++) g.tick(1 / 30);
    await tick(25);
  }
  const before = j.state.fungusCached;
  assert.ok(before > 0);
  j.setAim("Something else.");
  assert.equal(j.state.fungusCached, 0, "nothing cached under the new aim yet");
  j.setAim("Calm every meeting.");
  assert.equal(j.state.fungusCached, before, "the old aim's answers are still there");
  const asked = decodeFungal(g.player.fungal.find((v) => v >= 0) as number, "garden");
  assert.equal(j.explainFungus(asked).by, "jev");
  j.setMenu(new Set(["dormant", "blend"]));
  assert.notEqual(j.explainFungus(asked).by, "jev", "a new offer for Garden: a new question");
  assert.equal(j.state.fungusCached, before, "the old menu's answers are kept, for when it comes back");
  assert.equal(g.fungus.menu.has("soothe"), false, "and the fungus runs under it");
  await j.stop();
  for (let k = 0; k < 6; k++) g.tick(1 / 30);
  const s = decodeFungal(g.player.fungal.find((v) => v >= 0) as number, "garden");
  assert.equal(j.explainFungus(s).by, "local");
  assert.ok([...g.player.expr].some((e) => e === intervention("blend")), "stopped: the local rule again");
});

// Every colony on equal footing (ja-t4d.6): the player is the fungus, so Jev drives each colony under its own doctrine.

/** Every request, whole; modes are answered by doctrine: `answer(doctrine)`. A request can be held until `release()`. */
function scriptByDoctrine(answer: (doctrine: string) => string) {
  const reqs: (JevRequest & { state: Record<string, unknown> })[] = [];
  let held: (() => void) | null = null;
  let holding = false;
  globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
    if (String(url).startsWith("/api/run")) return { ok: true, status: 200, json: async () => RUN } as Response;
    const req = JSON.parse(String(init?.body)) as JevRequest & { state: Record<string, unknown> };
    reqs.push(req);
    if (holding) await new Promise<void>((r) => (held = r));
    const answers: Record<string, unknown> = {};
    for (const q of Object.keys(req.questions)) answers[q] = { type: "choice", choice: q.endsWith("_stance") ? "forage" : answer(String(req.state.doctrine)), confidence: 0.9 };
    const body = { status: 200, body: { model: "jev-x", answers, usage: { input_tokens: 10, output_tokens: 0 } }, ms: 1, attempts: 1, inputTokens: 10, run: RUN };
    return { ok: true, status: 200, json: async () => body } as Response;
  }) as typeof fetch;
  return { reqs, hold: () => void (holding = true), release: () => ((holding = false), held?.()) };
}

function twoColonies(n = 40) {
  const map = generateWorld(1);
  return [new Colony(map, { antCount: n, nest: 0 }, mulberry32(9)), new Colony(map, { antCount: n, nest: 1 }, mulberry32(10))];
}

const modeRequests = (reqs: (JevRequest & { state: Record<string, unknown> })[]) => reqs.filter((r) => r.state.ants);

test("both colonies on one doctrine: each situation is asked once for both, and both colonies' ants take the answer", async () => {
  const { reqs } = scriptByDoctrine(() => "return");
  const j = make();
  const [a, b] = twoColonies();
  j.setDoctrineFor(0, "Same.");
  j.setDoctrineFor(1, "Same.");
  j.attachColonies([a!, b!]);
  await j.start();
  for (let round = 0; round < 5; round++) {
    run(a!, 3);
    run(b!, 3);
    await tick(25);
  }
  const keys = modeRequests(reqs).flatMap((r) => Object.values(r.state.ants as Record<string, unknown>).map((s) => JSON.stringify(s)));
  assert.ok(keys.length > 0);
  assert.equal(new Set(keys).size, keys.length, "no situation asked twice, though two colonies met it");
  for (const r of modeRequests(reqs)) assert.equal(r.state.doctrine, "Same.");
  run(a!, 2);
  run(b!, 2);
  // Underground, an ant that has just dropped a pellet meets a new situation; its answer is in flight for a tick.
  await tick(25);
  run(a!, 1);
  run(b!, 1);
  for (const c of [a!, b!]) for (let i = 0; i < c.n; i++) if (c.alive[i] && !c.carrying[i]) assert.equal(c.mode[i], 2, "Jev said return");
});

test("each colony its own doctrine: its questions carry its own words, its own cache, and explain names who decided for either colony", async () => {
  const { reqs } = scriptByDoctrine((d) => (d === "Ink's way." ? "explore" : "return"));
  const j = make();
  const [a, b] = twoColonies();
  j.setDoctrineFor(0, "Ink's way.");
  j.setDoctrineFor(1, "Amber's way.");
  j.attachColonies([a!, b!]);
  await j.start();
  for (let round = 0; round < 5; round++) {
    run(a!, 3);
    run(b!, 3);
    await tick(25);
  }
  const doctrines = new Set(modeRequests(reqs).map((r) => r.state.doctrine));
  assert.deepEqual([...doctrines].sort(), ["Amber's way.", "Ink's way."]);
  assert.equal(j.state.doctrineCached.length, 2);
  assert.ok(j.state.doctrineCached[0]! > 0 && j.state.doctrineCached[1]! > 0);
  const s: Situation = { mode: "explore", tired: false, foodTrail: "none", homeTrail: "none", alarm: "none", enemy: "none", stance: "forage" };
  run(a!, 1);
  run(b!, 1);
  const ea = j.explain(s, 0);
  const eb = j.explain(s, 1);
  if (ea.by === "jev") assert.equal(ea.mode, "explore");
  if (eb.by === "jev") assert.equal(eb.mode, "return", "the second colony is on Jev too, under its own doctrine");
  assert.ok(ea.by === "jev" || eb.by === "jev", "at least this common situation was met and answered");
});

test("explain says 'waiting' while the question is in flight", async () => {
  const { hold, release } = scriptByDoctrine(() => "return");
  const j = make();
  const [a] = twoColonies(5);
  j.attachColonies([a!]);
  await j.start();
  hold();
  const s: Situation = { mode: "explore", tired: true, foodTrail: "faint", homeTrail: "strong", alarm: "faint", enemy: "none", stance: "forage" };
  j.policy(s); // queued
  await tick(30); // sent, and held in flight
  assert.equal(j.explain(s, 0).by, "waiting");
  release();
  await tick(30);
  assert.equal(j.explain(s, 0).by, "jev");
});
