import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import {
  Colony,
  localResponses,
  responses,
  responseContext,
  responseKey,
  SAMPLE_TOUCH,
  mulberry32,
  worldFromArrays,
  type Touch,
} from "../../colony/index.ts";
import { put, nestAt } from "../../colony/tests/hexmaps.ts";
import { ColonyJev } from "../colonyJev.ts";
import type { RunSummary } from "../../../shared/jev.ts";
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
function proxy(score: number) {
  const seen = {
    questions: [] as string[],
    requests: [] as { questions: Record<string, { type: string }>; state: { ants: Record<string, Touch> } }[],
  };
  globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
    if (String(url).includes("api/run")) return { ok: true, status: 200, json: async () => RUN } as Response;
    const req = JSON.parse(String(init?.body)) as { questions: Record<string, { type: string }>; state: { ants: Record<string, Touch> } };
    seen.requests.push(req);
    seen.questions.push(...Object.keys(req.questions));
    const answers = Object.fromEntries(
      Object.entries(req.questions).map(([q, v]) => [
        q,
        v.type === "noul" ? { type: "noul", noul: score } : { type: "choice", choice: "explore" },
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

function setup(enabled = true, seed = 1) {
  const food = new Float32Array(40 * 12);
  food[6 * 40 + 14] = 3;
  const map = worldFromArrays({ w: 40, h: 12 }, [nestAt(6, 6, 2)], { food });
  const c = new Colony(map, { antCount: 1, maxAnts: 1, deposit: 0, wander: 0 }, mulberry32(seed));
  put(c, 0, 14, 6);
  const j = new ColonyJev({ pickupPolicy: enabled, intervalMs: 5, gatherMs: 0 });
  live.add(j);
  j.setDoctrine("pickup experiment");
  j.attach(c);
  return { c, j, map };
}
function seed(j: ColonyJev, t: Touch, answer: string) {
  return j.seed(responseContext("get", "pickup experiment"), [[responseKey("get", t), answer]]);
}

test("off keeps the response object and food pickup unchanged even with a cached refusal", () => {
  const { c, j } = setup(false);
  assert.equal(c.responses, localResponses);
  seed(j, SAMPLE_TOUCH, "false=1");
  c.tick(1 / 30);
  assert.equal(c.carrying[0], 1);
  assert.equal(j.state.lanes.get.asked, 0);
  assert.equal(c.responses.get({ ...SAMPLE_TOUCH, mode: "fight" }), false);
});

test("a cached refusal prevents actual food pickup; a miss uses the local rule", () => {
  const { c, j, map } = setup();
  seed(j, SAMPLE_TOUCH, "false=1");
  c.tick(1 / 30);
  assert.equal(c.carrying[0], 0);
  assert.equal(map.foodLeft, 3);
  j.setDoctrine("new words");
  c.tick(1 / 30);
  assert.equal(c.carrying[0], 1, "old doctrine is not a fallback for pickup, even offline");
});

test("fighters refuse locally but can accept a cached get; other loads and hooks stay local", () => {
  const { c, j } = setup();
  const fight: Touch = { ...SAMPLE_TOUCH, mode: "fight" };
  assert.equal(c.responses.get(fight), false);
  assert.equal(seed(j, fight, "true=1"), 1);
  assert.equal(c.responses.get(fight), true);
  assert.equal(c.responses.get({ ...fight, offered: "soil" }), true);
  assert.equal(c.responses.contact, localResponses.contact);
  assert.equal(c.responses.trail, localResponses.trail);
  assert.equal(seed(j, SAMPLE_TOUCH, "invalid"), 0);
});

test("probabilities reach the ant draw, and attaching twice does not wrap the old lane", () => {
  const { c, j } = setup();
  seed(j, SAMPLE_TOUCH, "true=0.75,false=0.25");
  assert.equal(
    c.responses.get(
      SAMPLE_TOUCH,
      Object.assign(() => 0.1, { temperature: 1 }),
    ),
    true,
  );
  assert.equal(
    c.responses.get(
      SAMPLE_TOUCH,
      Object.assign(() => 0.9, { temperature: 1 }),
    ),
    false,
  );
  j.attach(c);
  j.setDoctrine("another doctrine");
  assert.equal(c.responses.get(SAMPLE_TOUCH), true);
});

test("queued Touch is a snapshot, duplicate encounters ask once, and cached answers spend nothing", async () => {
  const seen = proxy(0);
  const { c, j } = setup();
  await j.start();
  let place = "out";
  const shared = Object.defineProperty({ ...SAMPLE_TOUCH }, "place", { get: () => place, enumerable: true });
  for (let i = 0; i < 20; i++) assert.equal(c.responses.get(shared), true);
  place = "chamber";
  shared.mode = "fight";
  shared.offered = "soil";
  await tick(100);
  assert.equal(j.state.lanes.get.asked, 1);
  const req = seen.requests.find((r) => r.questions.p0_get);
  assert.equal(req!.state.ants.p0.mode, "explore");
  assert.equal(req!.state.ants.p0.offered, "food");
  assert.equal(req!.state.ants.p0.place, "out");
  for (let i = 0; i < 20; i++) assert.equal(c.responses.get(SAMPLE_TOUCH), false);
  await tick(30);
  assert.equal(j.state.lanes.get.asked, 1);
  assert.equal(j.state.lanes.get.cached, 1);
});

test("disabled pickup queues no questions during a run", async () => {
  const seen = proxy(0);
  const { c, j } = setup(false);
  await j.start();
  for (let i = 0; i < 20; i++) c.responses.get(SAMPLE_TOUCH);
  await tick(30);
  assert.equal(seen.questions.filter((q) => q.endsWith("_get")).length, 0);
});

test("a species' own get remains the fallback, including after reattachment", () => {
  const { c, j } = setup(false);
  c.responses = responses({ get: () => false });
  j.opts.pickupPolicy = true;
  j.attach(c);
  j.attach(c);
  assert.equal(c.responses.get(SAMPLE_TOUCH), false);
});

test("paired pickup experiment, seeds 1-20: local and cached accept collect; cached reject leaves food", () => {
  const totals = { local: 0, accept: 0, reject: 0 };
  for (let n = 1; n <= 20; n++)
    for (const arm of ["local", "accept", "reject"] as const) {
      const { c, j, map } = setup(arm !== "local", n);
      if (arm !== "local") seed(j, SAMPLE_TOUCH, arm === "accept" ? "true=1" : "false=1");
      c.tick(1 / 30);
      totals[arm] += c.carrying[0];
      assert.equal(map.foodLeft + c.carrying[0], 3, "food conserved");
    }
  assert.deepEqual(totals, { local: 20, accept: 20, reject: 0 });
  console.log("Paired pickup experiment (20 seeds):", totals);
});

test("a fighting ant actually takes food only when the pickup policy accepts", () => {
  for (const accept of [false, true]) {
    const { c, j } = setup();
    c.bindPolicy("mode", () => "fight");
    if (accept) seed(j, { ...SAMPLE_TOUCH, mode: "fight" }, "true=1");
    c.tick(1 / 30);
    assert.equal(c.carrying[0], Number(accept));
  }
});

test("food fallback preserves the species draw; attachment leaves fungal sensory gains intact", () => {
  const { c, j } = setup(false);
  const draw = Object.assign(() => 0.4, { temperature: 1 });
  c.responses = responses({
    get: (_t, given) => {
      assert.equal(given, draw);
      return false;
    },
  });
  c.gainFood[0] = 0.25;
  c.gainHome[0] = 0.5;
  c.gainAlarm[0] = 2;
  j.opts.pickupPolicy = true;
  j.attach(c);
  assert.equal(c.responses.get(SAMPLE_TOUCH, draw), false);
  assert.deepEqual([c.gainFood[0], c.gainHome[0], c.gainAlarm[0]], [0.25, 0.5, 2]);
});

test("two colonies sharing a doctrine share one pending pickup question and its cached answer", async () => {
  const seen = proxy(0);
  const { c, j } = setup();
  const other = setup().c;
  j.attachColonies([c, other]);
  await j.start();
  assert.equal(c.responses.get(SAMPLE_TOUCH), true);
  assert.equal(other.responses.get(SAMPLE_TOUCH), true);
  await tick(100);
  assert.equal(seen.questions.filter((q) => q.endsWith("_get")).length, 1);
  assert.equal(c.responses.get(SAMPLE_TOUCH), false);
  assert.equal(other.responses.get(SAMPLE_TOUCH), false);
  assert.equal(j.state.lanes.get.cached, 1);
});

test("an invalid live pickup answer is not cached and leaves food pickup local", async () => {
  proxy(2); // A noul outside [0, 1] is invalid.
  const { c, j } = setup();
  await j.start();
  assert.equal(c.responses.get(SAMPLE_TOUCH), true);
  await tick(60);
  assert.equal(j.state.lanes.get.asked, 1);
  assert.equal(j.state.lanes.get.cached, 0);
  assert.equal(c.responses.get(SAMPLE_TOUCH), true);
});
