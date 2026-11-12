import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import { Game, generateWorld, localResponses, mulberry32, type LaneWords, type Mode, type Species } from "../../../colony/index.ts";
import { ColonyJev } from "../../colonyJev.ts";
import type { JevRequest, RunSummary } from "../../../../shared/jev.ts";

// ja-fnd.5.8, review of PR #118 S1: what a species sends Jev and how it reads Jev's live reply are the species' own. The request carries
// its legend and its choices; a reply its words don't allow (follow, which the lone forager's words drop) is not cached; no stance
// question is asked of a species without a stance lane. speciesLanes.test.ts covers the contexts and seeding.

const LONE_MODE: LaneWords<Mode> = {
  legend: "Each key in `ants` is the situation of one lone forager. It leaves no trail and follows none. ",
  criteria: { explore: "explore: search alone for food", return: "return: walk home", fight: "fight: attack a stranger" },
  version: 1,
};
const LONE: Species = { id: "lone", name: "Lone forager", params: {}, responses: localResponses, lanes: { mode: LONE_MODE } };

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
type Req = JevRequest & { state: Record<string, unknown> };

const realFetch = globalThis.fetch;
const live = new Set<ColonyJev>();
afterEach(() => {
  for (const j of live) j.dispose();
  live.clear();
  globalThis.fetch = realFetch;
});
const tick = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** A fake proxy answering every choice question with `choice`, recording the requests. */
function proxy(choice: string): Req[] {
  const reqs: Req[] = [];
  globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
    if (String(url).startsWith("/api/run")) return { ok: true, status: 200, json: async () => RUN } as Response;
    const req = JSON.parse(String(init?.body)) as Req;
    reqs.push(req);
    const answers: Record<string, unknown> = {};
    for (const q of Object.keys(req.questions)) answers[q] = { type: "choice", choice, confidence: 0.9 };
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

async function play(choice: string) {
  const reqs = proxy(choice);
  const j = new ColonyJev({ intervalMs: 10, gatherMs: 0, saveMs: 0 });
  live.add(j);
  const g = new Game(generateWorld(1, { size: { w: 120, h: 80 } }), { antCount: 30, rival: false, species: LONE }, mulberry32(4));
  j.setDoctrine("forage");
  j.attachColonies(g.colonies, LONE);
  await j.start();
  for (let round = 0; round < 10; round++) {
    for (let k = 0; k < 6; k++) g.tick(1 / 30);
    await tick(20);
  }
  return { reqs: reqs.filter((r) => r.state.ants), all: reqs, j };
}

test("a species' requests carry its own legend and choices, and no stance question", async () => {
  const { reqs, all } = await play("explore");
  assert.ok(reqs.length > 0, "the mode lane asked");
  for (const r of reqs) {
    assert.equal(r.state.legend, LONE_MODE.legend);
    for (const spec of Object.values(r.questions)) {
      assert.equal(spec.type, "choice");
      if (spec.type === "choice") assert.deepEqual(spec.criteria, LONE_MODE.criteria);
    }
  }
  assert.ok(!all.some((r) => Object.keys(r.questions).some((q) => q.endsWith("_stance"))), "no stance question");
});

test("a reply in the species' choices is cached; one its words drop is not", async () => {
  const ok = await play("explore");
  assert.ok(ok.j.state.cached > 0, "explore is one of the species' answers");
  ok.j.dispose();
  live.delete(ok.j);
  const dropped = await play("follow");
  assert.ok(dropped.reqs.length > 0, "it asked");
  assert.equal(dropped.j.state.cached, 0, "follow is not the lone forager's to give");
});
