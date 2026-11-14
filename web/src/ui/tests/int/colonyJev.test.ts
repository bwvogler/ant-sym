import { afterEach, mock, test } from "node:test";
import assert from "node:assert/strict";
import {
  Colony,
  localPolicy,
  localStance,
  type Mode,
  type Situation,
  DOCTRINES,
  policyContext,
  situationKey,
  stanceContext,
  stanceKey,
  fungalKey,
  fungusContext,
  generateWorld,
  mulberry32,
  OPEN_WORLD,
  Game,
  LEVERS,
  STRAINS,
  preset,
  encodeLevels,
  PRESETS,
  decodeFungal,
  type FungalSituation,
} from "../../../colony/index.ts";
import { ColonyJev, type CacheStore } from "../../colonyJev.ts";
import type { JevRequest, RunSummary } from "../../../../shared/jev.ts";

// The colony's Jev client against a scripted fetch: no server, no key.

const RUN: RunSummary = {
  running: true,
  startedAt: 0,
  stoppedAt: null,
  stopReason: null,
  elapsedSeconds: 0,
  caps: { capUsd: 0.1, capSeconds: 1800 },
  requests: 0,
  inFlight: 0,
  maxInFlight: 5,
  inputTokens: 0,
  usd: 0,
  sessionInputTokens: 0,
  sessionUsd: 0,
  aborted: 0,
  medianMs: null,
  p90Ms: null,
  statuses: {},
  remainingUsd: 0.1,
  remainingSeconds: 1800,
};

type Script = (req: JevRequest) => { status: number; body: unknown } | Promise<{ status: number; body: unknown }>;

/** Scripted fetch; returns the situations each /api/jev request carried. */
function scriptFetch(jev: Script, runReply: (action: string) => { status: number; body: unknown } = () => ({ status: 200, body: RUN })) {
  const sent: string[][] = [];
  globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
    const path = String(url);
    let r: { status: number; body: unknown };
    if (path.startsWith("/api/run")) r = runReply((JSON.parse(String(init?.body ?? "{}")) as { action?: string }).action ?? "");
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
    return {
      status: 200,
      body: {
        status: 200,
        body: { model: "jev-x", answers, usage: { input_tokens: 10, output_tokens: 0 } },
        ms: 1,
        attempts: 1,
        inputTokens: 10,
        run: RUN,
      },
    };
  };

function memoryStore(): CacheStore & { data: Map<string, [string, string][]> } {
  const data = new Map<string, [string, string][]>();
  return { data, load: (c) => data.get(c) ?? [], save: (c, e) => void data.set(c, e) };
}

const tick = (ms: number) => new Promise((r) => setTimeout(r, ms));
const live = new Set<ColonyJev>();
function make(store: CacheStore | null = null, saveMs = 0): ColonyJev {
  const j = new ColonyJev({ intervalMs: 10, gatherMs: 0, saveMs }, store);
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

test("off, with answers cached: they play, and nothing is asked (the fungus game: Jev's answers outlive its run)", async () => {
  const sent = scriptFetch(answerAll("return"));
  const store = memoryStore();
  const s: Situation = {
    mode: "explore",
    tired: false,
    foodTrail: "none",
    homeTrail: "none",
    alarm: "none",
    enemy: "none",
    stance: "forage",
  };
  const wrong: Mode = localPolicy(s) === "fight" ? "return" : "fight";
  store.data.set(policyContext(DOCTRINES[0]!.text), [[situationKey(s), wrong]]);
  const j = make(store);
  const c = colony();
  j.attach(c);
  j.setDoctrine(DOCTRINES[0]!.text);
  assert.equal(c.policy(s), wrong, "the cached answer, not the local rule");
  assert.equal(j.explain(s).by, "jev");
  const other: Situation = { ...s, alarm: "strong" };
  assert.equal(c.policy(other), localPolicy(other), "an unanswered situation: the local rule");
  assert.equal(j.explain(other).by, "local");
  await tick(30);
  assert.equal(sent.length, 0, "no run, no calls");
});

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
  const sent = scriptFetch(answerAll("follow"));
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
  assert.equal(modes.follow, c.population, "every ant took Jev's answer on its next tick");
  assert.ok(j.state.hits > 0);
  assert.equal(store.data.get(policyContext(DOCTRINES[0]!.text))?.length, all.length, "persisted under the doctrine");
});

test("a miss with no run wants one, under a preset's words too; a cached answer doesn't (PR #42 review S7)", async () => {
  const sent = scriptFetch(answerAll("follow"));
  const store = memoryStore();
  const s: Situation = {
    mode: "explore",
    tired: false,
    foodTrail: "none",
    homeTrail: "none",
    alarm: "none",
    enemy: "none",
    stance: "forage",
  };
  store.data.set(policyContext(DOCTRINES[0]!.text), [[situationKey(s), "follow"]]);
  const j = make(store);
  let wants = 0;
  j.wantsRun = () => wants++;
  const c = colony();
  j.attach(c);
  j.setDoctrine(DOCTRINES[0]!.text);
  c.policy(s);
  assert.equal(wants, 0, "every situation met is cached: no run wanted, nothing spent");
  c.policy({ ...s, alarm: "strong" });
  assert.equal(wants, 1, "a preset's unanswered situation wants a run");
  await j.start();
  run(c, 3);
  await tick(40);
  assert.ok(sent.flat().length > 0, "once it runs, the preset's misses are asked");
  assert.equal(wants, 1, "a running client wants nothing more");
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
  assert.equal(
    j.policy({ mode: "follow", tired: true, foodTrail: "none", homeTrail: "none", alarm: "none", enemy: "none", stance: "forage" }),
    "return",
    "the local rule answers",
  );
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

test("a new doctrine: until Jev answers it, the local rule acts and each situation is asked; the old words' answers never stand in (ja-lo8.15)", async () => {
  const sent = scriptFetch(answerAll("fight"));
  const store = memoryStore();
  const s: Situation = {
    mode: "explore",
    tired: false,
    foodTrail: "none",
    homeTrail: "none",
    alarm: "none",
    enemy: "none",
    stance: "forage",
  };
  const old: Mode = localPolicy(s) === "return" ? "follow" : "return";
  store.data.set(policyContext(DOCTRINES[0]!.text), [[situationKey(s), old]]);
  const j = make(store);
  const c = colony();
  j.setDoctrine(DOCTRINES[0]!.text);
  j.attach(c);
  j.setDoctrine(DOCTRINES[1]!.text);
  assert.equal(c.policy(s), localPolicy(s), "the local rule, not the old words' answer");
  assert.equal(j.explain(s).by, "local");
  await j.start();
  assert.equal(c.policy(s), localPolicy(s), "still the local rule while it is asked");
  assert.equal(j.explain(s).by, "waiting");
  await tick(60);
  assert.ok(sent.flat().length > 0, "the situation was asked under the new words");
  assert.equal(c.policy(s), "fight", "the new answer takes over");
  assert.equal(j.explain(s).by, "jev");
});

test("while Jev can't answer, the old words' answers act, stale; a change of canAsk makes the colonies reconsider (ja-lo8.3, ja-lo8.15)", () => {
  scriptFetch(answerAll("fight"));
  const store = memoryStore();
  const s: Situation = {
    mode: "explore",
    tired: false,
    foodTrail: "none",
    homeTrail: "none",
    alarm: "none",
    enemy: "none",
    stance: "forage",
  };
  const old: Mode = localPolicy(s) === "return" ? "follow" : "return";
  store.data.set(policyContext(DOCTRINES[0]!.text), [[situationKey(s), old]]);
  const j = make(store);
  const c = colony();
  let reconsidered = 0;
  const reconsider = c.reconsider.bind(c);
  c.reconsider = () => {
    reconsidered++;
    reconsider();
  };
  j.setDoctrine(DOCTRINES[0]!.text);
  j.attach(c);
  j.setDoctrine(DOCTRINES[1]!.text);
  reconsidered = 0;
  j.canAsk = false;
  assert.equal(reconsidered, 1, "the colony reconsiders when Jev stops being able to answer");
  assert.equal(c.policy(s), old, "the old words' answer, not the local rule");
  assert.equal(j.explain(s).by, "stale");
  j.canAsk = false;
  assert.equal(reconsidered, 1, "no change, no reconsidering");
  j.canAsk = true;
  assert.equal(reconsidered, 2);
  assert.equal(c.policy(s), localPolicy(s));
});

test("a daughter colony's new words play the local rule, never another doctrine's answers (ja-lo8.15)", () => {
  scriptFetch(answerAll("fight"));
  const store = memoryStore();
  const s: Situation = {
    mode: "explore",
    tired: false,
    foodTrail: "faint",
    homeTrail: "none",
    alarm: "none",
    enemy: "none",
    stance: "forage",
  };
  const mother = DOCTRINES[2]!.text;
  const motherSays: Mode = localPolicy(s) === "return" ? "follow" : "return";
  store.data.set(policyContext(mother), [[situationKey(s), motherSays]]);
  const j = make(store);
  const c = colony();
  j.setDoctrine(mother);
  j.attach(c);
  assert.equal(c.policy(s), motherSays);
  j.setDoctrineFor(0, "Her own words.");
  assert.equal(c.policy(s), localPolicy(s));
  assert.equal(j.explain(s).by, "local");
});

test("answers shipped with the page are seeded under the ones this browser already has, and only valid ones", () => {
  scriptFetch(answerAll("fight"));
  const store = memoryStore();
  const ctx = policyContext(DOCTRINES[0]!.text);
  const a: Situation = {
    mode: "explore",
    tired: false,
    foodTrail: "none",
    homeTrail: "none",
    alarm: "none",
    enemy: "none",
    stance: "forage",
  };
  const b: Situation = { ...a, foodTrail: "strong" };
  store.data.set(ctx, [[situationKey(a), "return"]]);
  const j = make(store);
  const c = colony();
  j.setDoctrine(DOCTRINES[0]!.text);
  j.attach(c);
  const added = j.seed(ctx, [
    [situationKey(a), "explore"],
    [situationKey(b), "follow"],
    ["nonsense", "dance"],
  ]);
  assert.equal(added, 1, "only b: a is the browser's, and 'dance' is no mode");
  assert.equal(c.policy(a), "return", "the browser's own answer wins");
  assert.equal(c.policy(b), "follow", "the shipped answer plays, with no run on");
  assert.equal(j.seed("elsewhere-v1-0", [[situationKey(a), "explore"]]), 0, "a context of no lane is ignored");
});

test("the strategist's stance goes through its own cached lane", async () => {
  const stances: string[] = [];
  scriptFetch((req) => {
    const answers: Record<string, unknown> = {};
    for (const q of Object.keys(req.questions)) {
      if (q.endsWith("_stance")) stances.push(q);
      answers[q] = { type: "choice", choice: q.endsWith("_stance") ? "defend" : "explore" };
    }
    return {
      status: 200,
      body: {
        status: 200,
        body: { model: "jev-x", answers, usage: { input_tokens: 10, output_tokens: 0 } },
        ms: 1,
        attempts: 1,
        inputTokens: 10,
        run: RUN,
      },
    };
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

const SIT = {
  mode: "explore",
  tired: false,
  foodTrail: "none",
  homeTrail: "strong",
  alarm: "none",
  enemy: "none",
  stance: "forage",
} as const;

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
  const s = {
    mode: "explore",
    tired: false,
    foodTrail: "none",
    homeTrail: "strong",
    alarm: "none",
    enemy: "none",
    stance: "forage",
  } as const;
  assert.deepEqual(j.explain(s), { mode: "explore", by: "local", weights: [["explore", 1]] }, "off: the local rule");
  await j.start();
  const before = { hits: j.state.hits, misses: j.state.misses };
  assert.equal(j.explain(s).by, "local", "running, never met: the local rule, and nothing queued");
  assert.deepEqual({ hits: j.state.hits, misses: j.state.misses }, before, "explaining counts nothing");
  j.policy(s); // the colony meets it: queued for Jev
  assert.equal(j.explain(s).by, "waiting");
  await tick(60);
  assert.deepEqual(j.explain(s), { mode: "return", by: "jev", weights: [["return", 1]] }, "answered: Jev's cached answer");
});

test("the page's mode policy draws from a weighted answer with the colony's draw, once, and explain shows its weights", () => {
  // Review of #169, S2: dropping the draw in ColonyJev's mode policy, or explain's weights, passed every test before this one.
  scriptFetch(answerAll("return"));
  const j = make();
  const c = colony();
  j.setDoctrine(DOCTRINES[0]!.text);
  j.attach(c);
  const s: Situation = {
    mode: "explore",
    tired: false,
    foodTrail: "faint",
    homeTrail: "none",
    alarm: "none",
    enemy: "near",
    stance: "forage",
  };
  assert.equal(j.seed(policyContext(DOCTRINES[0]!.text), [[situationKey(s), "follow=0.5,fight=0.5"]]), 1);
  let calls = 0;
  const draw = Object.assign(() => (calls++, 0.9), { temperature: 1 });
  assert.equal(c.policy(s, draw), "fight", "drawn: the second option at 0.9");
  assert.equal(calls, 1, "one draw");
  assert.equal(c.policy(s), "follow", "no draw: Jev's choice");
  assert.deepEqual(j.explain(s), {
    mode: "follow",
    by: "jev",
    weights: [
      ["follow", 0.5],
      ["fight", 0.5],
    ],
  });
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

/** Every request, whole; Jev answers modes "explore", stances "forage", and the fungus preset `fungal`'s levels (as is elsewhere). */
function scriptAll(fungal: string) {
  const levels = PRESETS.find((p) => p.id === fungal)!.levels;
  const reqs: (JevRequest & { state: Record<string, unknown> })[] = [];
  globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
    if (String(url).startsWith("/api/run")) return { ok: true, status: 200, json: async () => RUN } as Response;
    const req = JSON.parse(String(init?.body)) as JevRequest & { state: Record<string, unknown> };
    reqs.push(req);
    const answers: Record<string, unknown> = {};
    for (const [q, spec] of Object.entries(req.questions)) {
      if (spec.type === "score") {
        const lever = LEVERS.find((v) => v.id === q.slice(q.indexOf("_") + 1))!;
        answers[q] = { type: "score", score: levels[lever.id] ?? lever.asIs };
      } else answers[q] = { type: "choice", choice: q.endsWith("_stance") ? "forage" : "explore", confidence: 0.9 };
    }
    const body = {
      status: 200,
      body: { model: "jev-x", answers, usage: { input_tokens: 10, output_tokens: 0 } },
      ms: 1,
      attempts: 1,
      inputTokens: 10,
      run: RUN,
    };
    return { ok: true, status: 200, json: async () => body } as Response;
  }) as typeof fetch;
  return reqs;
}

/** A small game with Garden painted on the player's nest. */
function infectedGame() {
  const g = new Game(generateWorld(1, { size: { w: 160, h: 100 } }), { antCount: 60, rivalAnts: 60 }, mulberry32(4));
  g.paintSpores(
    g.player.nest.x,
    g.player.nest.y,
    g.player.nest.r + 2,
    3,
    0.4,
    STRAINS.findIndex((s) => s.id === "garden"),
  );
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
  assert.ok(
    [...g.player.expr].some((e) => e === preset("blend")),
    "off: Garden blends",
  );
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
  // Jev's levels were dormant's: every host runs dormant now.
  for (let k = 0; k < 6; k++) g.tick(1 / 30);
  for (let i = 0; i < g.player.n; i++) if (g.player.alive[i] && g.player.load[i] > 0) assert.equal(g.player.expr[i], 0, `host ${i}`);
  const s = decodeFungal(g.player.fungal.find((v) => v >= 0) as number);
  assert.equal(j.explainFungus(s).by, "jev");
  assert.equal(j.explainFungus(s).answer, encodeLevels(PRESETS[0]!.levels, g.fungus.asked), "Jev's levels: dormant's");
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
  const asked = decodeFungal(g.player.fungal.find((v) => v >= 0) as number);
  assert.equal(j.explainFungus(asked).by, "jev");
  j.setMenu(new Set(["odour", "strangers"]));
  assert.notEqual(j.explainFungus(asked).by, "jev", "other levers on: a new question");
  assert.equal(j.state.fungusCached, before, "the old menu's answers are kept, for when it comes back");
  assert.equal(g.fungus.menu.has("calm"), false, "and the fungus runs under it");
  await j.stop();
  for (let k = 0; k < 6; k++) g.tick(1 / 30);
  const s = decodeFungal(g.player.fungal.find((v) => v >= 0) as number);
  assert.equal(j.explainFungus(s).by, "local");
  assert.ok(
    [...g.player.expr].some((e) => e === preset("blend")),
    "stopped: the local rule again",
  );
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
    for (const q of Object.keys(req.questions))
      answers[q] = { type: "choice", choice: q.endsWith("_stance") ? "forage" : answer(String(req.state.doctrine)), confidence: 0.9 };
    const body = {
      status: 200,
      body: { model: "jev-x", answers, usage: { input_tokens: 10, output_tokens: 0 } },
      ms: 1,
      attempts: 1,
      inputTokens: 10,
      run: RUN,
    };
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
  const { reqs } = scriptByDoctrine(() => "follow");
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
  // Every ant whose situation Jev has answered takes the answer. (One that met a new situation in the last
  // ticks is still on the local rule while its question is out: which ants do depends on the map, not the client.)
  let answered = 0;
  [a!, b!].forEach((c, k) => {
    for (let i = 0; i < c.n; i++) {
      if (!c.alive[i] || c.carrying[i] || j.explain(c.lastQuestion(i) as Situation, k).by !== "jev") continue;
      answered++;
      assert.equal(c.mode[i], 1, "Jev said follow");
    }
  });
  assert.ok(answered > 20, `most ants are on Jev's answer (${answered})`);
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
  const s: Situation = {
    mode: "explore",
    tired: false,
    foodTrail: "none",
    homeTrail: "none",
    alarm: "none",
    enemy: "none",
    stance: "forage",
  };
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
  const s: Situation = {
    mode: "explore",
    tired: true,
    foodTrail: "faint",
    homeTrail: "strong",
    alarm: "faint",
    enemy: "none",
    stance: "forage",
  };
  j.policy(s); // queued
  await tick(30); // sent, and held in flight
  assert.equal(j.explain(s, 0).by, "waiting");
  release();
  await tick(30);
  assert.equal(j.explain(s, 0).by, "jev");
});

// Hardening from the reviews of #2–#7 (ja-ue6, ja-7tf, ja-1u2, ja-6yj, ja-ytc).

const sit = (s: Partial<Situation> = {}): Situation => ({
  mode: "explore",
  tired: false,
  foodTrail: "none",
  homeTrail: "none",
  alarm: "none",
  enemy: "none",
  stance: "forage",
  ...s,
});
const GARDEN: FungalSituation = {
  arousal: "calm",
  touch: "nestmate",
  place: "outside",
  task: "forager",
  carrying: "nothing",
  groomed: false,
};

test("stored answers a lane could not have given are dropped on load (ja-ue6)", async () => {
  scriptFetch(answerAll("explore"));
  const store = memoryStore();
  const good = sit({ foodTrail: "strong" });
  const bad = sit({ tired: true });
  store.data.set(policyContext("Stored."), [
    [situationKey(good), "follow"],
    [situationKey(bad), "flee"],
  ]);
  const j = make(store);
  j.setDoctrine("Stored.");
  const c = colony();
  const calm = c.stanceSituation(false);
  const raided = c.stanceSituation(true);
  store.data.set(stanceContext("Stored."), [
    [stanceKey(calm), "panic"],
    [stanceKey(raided), "defend"],
  ]);
  j.attach(c);
  assert.equal(j.state.cached, 1, "the mode cache kept only the real mode");
  assert.equal(j.state.stancesCached, 1, "the stance cache kept only the real stance");
  await j.start();
  assert.equal(j.policy(good), "follow");
  assert.equal(j.policy(bad), localPolicy(bad), "not 'flee': the local rule while it is asked afresh");
  assert.equal(j.stancePolicy(calm), localStance(calm));
  assert.equal(j.stancePolicy(raided), "defend");
});

test("a stored fungus answer is kept only if it has a level for each lever its key asked, in range (ja-ue6)", () => {
  const store = memoryStore();
  const j = make(store);
  const g = infectedGame();
  j.attach(g.player);
  const asked = g.fungus.asked;
  const other = { ...GARDEN, groomed: true };
  store.data.set(fungusContext("Stored aim.", g.map.sky ? "side" : "top"), [
    [fungalKey(GARDEN, asked), encodeLevels({}, asked)],
    [fungalKey(other, asked), "9"],
  ]);
  j.attachFungus(g.fungus);
  j.setAim("Stored aim.");
  assert.equal(j.state.fungusCached, 1, "kept the full answer, dropped the malformed one");
});

test("a new aim plays the fungus's local rule until Jev answers; the earlier aim's answers play, and are listed, only while Jev can't answer (ja-lo8.15)", () => {
  scriptFetch(answerAll("fight"));
  const store = memoryStore();
  const j = make(store);
  const g = infectedGame();
  j.attach(g.player);
  const asked = g.fungus.asked;
  store.data.set(fungusContext("Old aim.", g.map.sky ? "side" : "top"), [[fungalKey(GARDEN, asked), encodeLevels({}, asked)]]);
  j.attachFungus(g.fungus);
  j.setAim("Old aim.");
  assert.equal(j.explainFungus(GARDEN).by, "jev");
  j.setAim("New aim.");
  assert.equal(j.explainFungus(GARDEN).by, "local", "the local rule, not the old aim's levels");
  assert.deepEqual(j.fungusAnswers(), [], "nothing under the new aim, and the old aim's rows don't play");
  j.canAsk = false;
  assert.equal(j.explainFungus(GARDEN).by, "stale");
  assert.deepEqual(
    j.fungusAnswers().map((r) => r.stale),
    [true],
    "the old aim's row, dimmed, while it plays",
  );
});

test("dispose while Start is on the wire: no run opens, nothing is asked, and the server's run is stopped (ja-7tf)", async () => {
  const gate = deferred<void>();
  const actions: string[] = [];
  let jev = 0;
  globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
    if (String(url).startsWith("/api/run")) {
      const action = String((JSON.parse(String(init?.body ?? "{}")) as { action?: string }).action);
      actions.push(action);
      if (action === "start") await gate.promise;
      return { ok: true, status: 200, json: async () => RUN } as Response;
    }
    jev++;
    return { ok: false, status: 503, json: async () => ({ error: "unused" }) } as Response;
  }) as typeof fetch;
  const j = make();
  const c = colony();
  j.attach(c);
  const started = j.start();
  j.dispose();
  gate.resolve();
  await started;
  run(c, 3);
  await tick(40);
  assert.notEqual(j.state.phase, "running");
  assert.equal(jev, 0, "no Jev call from a disposed client");
  assert.deepEqual(actions, ["start", "stop"], "the run Start opened is closed");
});

test("Start works after a dispose, as under React's StrictMode, which disposes once on mount and keeps the client", async () => {
  scriptFetch(answerAll("explore"));
  const j = make();
  const c = colony();
  j.attach(c);
  j.dispose();
  j.subscribe(() => {}); // StrictMode runs the effect again: a fresh subscription on the same client
  await j.start();
  assert.equal(j.state.phase, "running");
  run(c, 2);
  await tick(40);
  assert.ok(j.state.requests > 0, "it asks Jev");
});

test("Stop pressed while Start is on the wire: the run stays stopped, and the run Start opened is closed", async () => {
  const gate = deferred<void>();
  const actions: string[] = [];
  globalThis.fetch = (async (_url: string | URL, init?: RequestInit) => {
    const action = String((JSON.parse(String(init?.body ?? "{}")) as { action?: string }).action);
    actions.push(action);
    if (action === "start") await gate.promise;
    return { ok: true, status: 200, json: async () => RUN } as Response;
  }) as typeof fetch;
  const j = make();
  j.attach(colony());
  const started = j.start();
  await j.stop();
  gate.resolve();
  await started;
  assert.notEqual(j.state.phase, "running");
  assert.deepEqual(actions, ["start", "stop", "stop"]);
});

test("Start, Stop, Start before the first reply: the late reply leaves the second run alone (review of #32)", async () => {
  const first = deferred<void>();
  const actions: string[] = [];
  let starts = 0;
  globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
    if (String(url).includes("api/run")) {
      const action = String((JSON.parse(String(init?.body ?? "{}")) as { action?: string }).action);
      actions.push(action);
      if (action === "start" && ++starts === 1) await first.promise;
      return { ok: true, status: 200, json: async () => RUN } as Response;
    }
    const r = await answerAll("explore")(JSON.parse(String(init?.body)) as JevRequest);
    return { ok: true, status: 200, json: async () => r.body } as Response;
  }) as typeof fetch;
  const j = make();
  j.attach(colony());
  const one = j.start();
  await j.stop();
  await j.start();
  first.resolve();
  await one;
  await tick(20);
  assert.equal(j.state.phase, "running", "the second run is on");
  assert.deepEqual(actions, ["start", "stop", "start"], "no stop sent for the late first reply: it would end the second run");
});

test("Start while running aborts the old run's calls", async () => {
  const signals: AbortSignal[] = [];
  globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
    if (String(url).includes("api/run")) return { ok: true, status: 200, json: async () => RUN } as Response;
    signals.push(init!.signal!);
    return new Promise<Response>((_, reject) =>
      init!.signal!.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" }))),
    );
  }) as typeof fetch;
  const j = make();
  const c = colony();
  j.attach(c);
  await j.start();
  run(c, 2);
  await tick(30);
  assert.ok(signals.length > 0, "a call is in flight");
  await j.start();
  assert.ok(
    signals.every((s) => s.aborted),
    "the first run's calls were cut",
  );
});

test("busy after a new game: the situations go back into the new game's lanes, not the old one's (ja-1u2)", async () => {
  const gate = deferred<void>();
  const asked: string[][] = [];
  globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
    if (String(url).startsWith("/api/run")) return { ok: true, status: 200, json: async () => RUN } as Response;
    const req = JSON.parse(String(init?.body)) as JevRequest & { state: { ants?: Record<string, unknown> } };
    if (req.state.ants) {
      asked.push(Object.values(req.state.ants).map((a) => JSON.stringify(a)));
      if (asked.length === 1) {
        await gate.promise;
        return { ok: false, status: 429, json: async () => ({ error: "busy", run: RUN }) } as Response;
      }
    }
    const r = await answerAll("explore")(req);
    return { ok: true, status: 200, json: async () => r.body } as Response;
  }) as typeof fetch;
  const j = make();
  const c = colony();
  j.attach(c);
  await j.start();
  run(c, 2);
  await tick(30); // the first mode request is out, held
  assert.equal(asked.length, 1);
  j.attach(c); // a new game: new lanes, same doctrine; the ants are not stepped, so nothing re-queues them
  gate.resolve(); // busy
  await tick(60);
  const later = new Set(asked.slice(1).flat());
  assert.ok(asked[0]!.length > 0);
  for (const s of asked[0]!) assert.ok(later.has(s), `asked again after busy: ${s}`);
});

test("a colony with no doctrine of its own follows the first colony's when it changes (ja-6yj)", () => {
  const store = memoryStore();
  store.data.set(policyContext("Later."), [[situationKey(sit()), "follow"]]);
  const j = make(store);
  const [a, b] = twoColonies(5);
  j.setDoctrineFor(0, "First.");
  j.attachColonies([a!, b!]);
  assert.deepEqual(j.state.doctrineCached, [0, 0]);
  j.setDoctrineFor(0, "Later.");
  assert.deepEqual(j.state.doctrineCached, [1, 1], "the second colony moved with the first");
  j.setDoctrineFor(1, "Own.");
  j.setDoctrineFor(0, "First.");
  j.setDoctrineFor(0, "Later.");
  assert.deepEqual(j.state.doctrineCached, [1, 0], "once it has its own doctrine, it keeps it");
});

test("the cached count is every colony's, a doctrine two colonies share counted once (PRD §65: no colony is the player's)", () => {
  const store = memoryStore();
  store.data.set(policyContext("Mine."), [[situationKey(sit()), "follow"]]);
  store.data.set(policyContext("Theirs."), [
    [situationKey(sit()), "explore"],
    [situationKey({ ...sit(), mode: "follow" }), "explore"],
  ]);
  const j = make(store);
  const [a, b] = twoColonies(5);
  j.setDoctrineFor(0, "Mine.");
  j.setDoctrineFor(1, "Theirs.");
  j.attachColonies([a!, b!]);
  assert.equal(j.state.cached, 3, "the first colony's 1 and the second's 2");
  j.setDoctrineFor(1, "Mine.");
  assert.equal(j.state.cached, 1, "one shared doctrine: its answers once");
});

test("the stance count is every colony's too, a shared doctrine counted once (PRD §65)", () => {
  const store = memoryStore();
  const [a, b] = twoColonies(5);
  const calm = a!.stanceSituation(false);
  const raided = a!.stanceSituation(true);
  store.data.set(stanceContext("Mine."), [[stanceKey(calm), "forage"]]);
  store.data.set(stanceContext("Theirs."), [
    [stanceKey(calm), "defend"],
    [stanceKey(raided), "defend"],
  ]);
  const j = make(store);
  j.setDoctrineFor(0, "Mine.");
  j.setDoctrineFor(1, "Theirs.");
  j.attachColonies([a!, b!]);
  assert.equal(j.state.stancesCached, 3, "the first colony's 1 and the second's 2");
  j.setDoctrineFor(1, "Mine.");
  assert.equal(j.state.stancesCached, 1, "one shared doctrine: its stances once");
});

test("lanes take turns at any request latency: a long mode queue does not keep the fungus waiting (ja-ytc)", async () => {
  // Mocked intervals, so the cycle count is exact (a wall-clock version flaked under load). Latency in cycles: the
  // first cut moved its pointer every cycle, so a 3-cycle request found the mode lane first at every free slot.
  for (const latency of [1, 2, 3, 4, 5, 6]) {
    mock.timers.enable({ apis: ["setInterval"] });
    try {
      let now = 0;
      const pending: { due: number; done: () => void }[] = [];
      const order: string[] = [];
      globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
        if (String(url).startsWith("/api/run")) return { ok: true, status: 200, json: async () => RUN } as Response;
        const req = JSON.parse(String(init?.body)) as JevRequest & { state: Record<string, unknown> };
        order.push(req.state.hosts ? "fungus" : req.state.ants ? "mode" : "stance");
        await new Promise<void>((done) => pending.push({ due: now + latency, done }));
        const r = await answerAll("explore")(req);
        return { ok: true, status: 200, json: async () => r.body } as Response;
      }) as typeof fetch;
      const j = new ColonyJev({ intervalMs: 10, batch: 1, inFlight: 1, gatherMs: 0 });
      live.add(j);
      j.attach(colony(5));
      await j.start();
      const trails = ["none", "faint", "strong"] as const;
      for (const foodTrail of trails)
        for (const homeTrail of trails) for (const alarm of trails) j.policy(sit({ foodTrail, homeTrail, alarm })); // 27 mode questions
      j.fungusPolicy(GARDEN);
      const settle = async () => {
        for (let k = 0; k < 5; k++) await new Promise((r) => setImmediate(r));
      };
      for (let cycle = 0; cycle < 40 && !order.includes("fungus"); cycle++) {
        now++;
        for (const p of pending.splice(0))
          if (p.due <= now) p.done();
          else pending.push(p);
        await settle();
        mock.timers.tick(10);
        await settle();
      }
      const at = order.indexOf("fungus");
      assert.ok(at >= 0 && at < 3, `latency ${latency} cycles: the fungus is request #${at + 1} (${order.slice(0, 5).join(",")})`);
      j.dispose();
      for (const p of pending) p.done();
    } finally {
      mock.timers.reset();
    }
  }
});

test("answers are written to the store once for the replies in a second, and at once on a flush or a stop (not after every reply)", async () => {
  const sent = scriptFetch(answerAll("follow"));
  const saves: string[] = [];
  const store = memoryStore();
  const counted: CacheStore = { load: store.load, save: (c, e) => (saves.push(c), store.save(c, e)) };
  const j = make(counted, 60_000);
  j.setDoctrine(DOCTRINES[0]!.text);
  const c = colony();
  j.attach(c);
  await j.start();
  run(c, 3);
  await tick(60);
  assert.ok(sent.length >= 1, "it asked");
  assert.equal(saves.length, 0, "nothing written yet: the delay is a minute");
  j.flushCache();
  assert.equal(saves.length, 1, "one write for the context");
  assert.equal(store.data.get(policyContext(DOCTRINES[0]!.text))?.length, j.state.cached, "everything the replies brought");
  j.flushCache();
  assert.equal(saves.length, 1, "nothing more to write");
});

test("a 200 that is not what the server sends is an error, not a run: start, stop and ask each say so and carry on locally", async () => {
  // Start answered with a body that is no run summary: no run opens.
  scriptFetch(answerAll("follow"), () => ({ status: 200, body: { oops: true } }));
  const a = make();
  await a.start();
  assert.equal(a.state.phase, "off", "no run opened");
  assert.match(a.state.lastError ?? "", /start failed \(200\)/);
  // Stop answered the same way: the run is stopped locally and the error says why.
  scriptFetch(answerAll("follow"), (action) => (action === "stop" ? { status: 200, body: "<html>" } : { status: 200, body: RUN }));
  const b = make();
  await b.start();
  assert.equal(b.state.phase, "running");
  await b.stop();
  assert.equal(b.state.phase, "stopped");
  assert.match(b.state.lastError ?? "", /stop answered 200/);
  // A Jev reply that is not a proxy reply: a failure, the ants stay on the local rule.
  scriptFetch(() => ({ status: 200, body: { weird: 1 } }));
  const c = make();
  c.setDoctrine(DOCTRINES[0]!.text);
  const col = colony();
  c.attach(col);
  await c.start();
  run(col, 3);
  await tick(60);
  assert.ok(c.state.failures >= 1, "counted as a failure");
  assert.match(c.state.lastError ?? "", /not a Jev reply/);
  assert.equal(c.state.cached, 0, "nothing cached");
});

test("a billed reply whose run summary has drifted is still cached: the answers matter, the summary is read if it can be", async () => {
  const sent = scriptFetch((req) => {
    const r = answerAll("follow")(req) as { status: number; body: { run: unknown } };
    r.body.run = { running: true }; // an older or newer server's summary
    return r;
  });
  const j = make();
  j.setDoctrine(DOCTRINES[0]!.text);
  const col = colony();
  j.attach(col);
  await j.start();
  run(col, 3);
  await tick(60);
  assert.ok(sent.length > 0 && j.state.cached > 0, "answers cached");
  assert.equal(j.state.failures, 0);
});

test("stop and dispose write the answers still waiting for the debounce", async () => {
  for (const how of ["stop", "dispose"] as const) {
    scriptFetch(answerAll("follow"));
    const saves: string[] = [];
    const store = memoryStore();
    const j = make({ load: store.load, save: (c, e) => (saves.push(c), store.save(c, e)) }, 60_000);
    j.setDoctrine(DOCTRINES[0]!.text);
    const col = colony();
    j.attach(col);
    await j.start();
    run(col, 3);
    await tick(60);
    assert.equal(saves.length, 0, `${how}: nothing written before it`);
    if (how === "stop") await j.stop();
    else j.dispose();
    assert.equal(saves.length, 1, `${how} wrote them`);
    assert.equal(store.data.get(policyContext(DOCTRINES[0]!.text))?.length, j.state.cached);
  }
});
