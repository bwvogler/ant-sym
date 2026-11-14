import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import {
  DOCTRINES,
  Game,
  generateWorld,
  mulberry32,
  NEUTRAL_STEERING,
  packSteerRequest,
  readSteer,
  steerContext,
  steerKey,
  steeringOf,
  validSteer,
  type SteerSituation,
} from "../../colony/index.ts";
import { ColonyJev } from "../colonyJev.ts";
import type { RunSummary } from "../../../shared/jev.ts";

// The steer lane (staging, ja-ykmu.3; docs/steering.md): an explorer's or follower's steering weights, asked per situation under
// its colony's doctrine, as a score per weight; the answer cached as levels and handed to the colony's steer policy.

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
const realFetch = globalThis.fetch;
const live = new Set<ColonyJev>();
afterEach(() => {
  for (const j of live) j.dispose();
  live.clear();
  globalThis.fetch = realFetch;
});
const tick = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** A fake proxy: every score question answered `score`, every choice `explore`; the questions seen. */
function proxy(score: number): { questions: string[] } {
  const seen = { questions: [] as string[] };
  globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
    if (String(url).includes("api/run")) return { ok: true, status: 200, json: async () => RUN } as Response;
    const req = JSON.parse(String(init?.body)) as { questions: Record<string, { type: string }> };
    seen.questions.push(...Object.keys(req.questions));
    const answers = Object.fromEntries(
      Object.entries(req.questions).map(([q, v]) => [
        q,
        v.type === "score" ? { type: "score", score } : { type: "choice", choice: "explore" },
      ]),
    );
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
  return seen;
}

const out: SteerSituation = {
  mode: "explore",
  tired: false,
  foodTrail: "none",
  homeTrail: "faint",
  alarm: "none",
  enemy: "none",
  stance: "forage",
  find: "far",
};
const colony = () => new Game(generateWorld(1, { size: { w: 120, h: 80 } }), { antCount: 10, rival: false }, mulberry32(3)).player;

test("a request asks a score per default weight; a reply reads as levels, and only answers its weights could give are valid", () => {
  const key = steerKey(out);
  assert.match(key, /\|far\|search,memory$/);
  assert.notEqual(steerKey({ ...out, find: "near" }), key, "near its last find is another situation");
  const req = packSteerRequest([{ id: "w0", key, situation: out }], DOCTRINES[0]!.text);
  assert.deepEqual(Object.keys(req.questions), ["w0_search", "w0_memory"]);
  assert.equal(
    readSteer(
      {
        w0_search: { type: "score", score: 2 },
        w0_memory: { type: "score", score: 0.4 },
      },
      "w0",
      ["search", "memory"],
    ),
    "1,-1",
  );
  assert.equal(readSteer({ w0_search: { type: "score", score: 1 } }, "w0", ["search", "memory"]), null, "a weight unanswered: no answer");
  assert.ok(validSteer(key, "1,-1"));
  assert.ok(!validSteer(key, "1"));
  assert.ok(!validSteer(key, "2,0"));
  assert.deepEqual(steeringOf(key, "1,-1"), { ...NEUTRAL_STEERING, search: 1, memory: -1 });
});

test("shipped answers reach the colony's steer policy; a situation with none plays every weight neutral", () => {
  const j = new ColonyJev({ intervalMs: 10, gatherMs: 0 });
  live.add(j);
  const c = colony();
  const doctrine = DOCTRINES[0]!.text;
  j.setDoctrine(doctrine);
  j.attach(c);
  assert.deepEqual(c.steerPolicy(out), NEUTRAL_STEERING, "nothing cached: neutral");
  assert.equal(j.seed(steerContext(doctrine), [[steerKey(out), "1,1"]]), 1);
  assert.deepEqual(c.steerPolicy(out), { ...NEUTRAL_STEERING, search: 1, memory: 1 });
  assert.equal(j.state.steerCached, 1);
  assert.deepEqual(c.steerPolicy({ ...out, mode: "return" }), NEUTRAL_STEERING, "a homing ant is not asked: neutral");
});

test("in a run, an explorer's situation is asked under the doctrine, and the answer then steers it", async () => {
  const seen = proxy(2);
  const j = new ColonyJev({ intervalMs: 10, gatherMs: 0 });
  live.add(j);
  const c = colony();
  j.setDoctrine(DOCTRINES[0]!.text);
  j.attach(c);
  await j.start();
  assert.deepEqual(c.steerPolicy(out), NEUTRAL_STEERING, "asked, not yet answered: neutral meanwhile");
  await tick(80);
  assert.ok(seen.questions.includes("w0_search") && seen.questions.includes("w0_memory"), `asked ${seen.questions.join(", ")}`);
  assert.deepEqual(c.steerPolicy(out), { ...NEUTRAL_STEERING, search: 1, memory: 1 });
  assert.ok(j.state.steerAsked >= 1);
  // Another doctrine is another cache.
  j.setDoctrine(DOCTRINES[1]!.text);
  assert.deepEqual(c.steerPolicy(out), NEUTRAL_STEERING);
});
