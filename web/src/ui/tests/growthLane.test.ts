import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import { Game, generateWorld, growthContext, growthKey, mulberry32, type GrowthSituation } from "../../colony/index.ts";
import { ColonyJev } from "../colonyJev.ts";
import type { RunSummary } from "../../../shared/jev.ts";

// The growth lane in the client (ja-2bw.5): a hyphal tip's situation asked under the fungus's aim, its answer cached, and
// no answer (the tip's own local rule) while there is none.

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

/** A fake proxy: every choice question answered `choice`; the requests seen. */
function proxy(choice: string): { questions: string[] } {
  const seen = { questions: [] as string[] };
  globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
    if (String(url).includes("api/run")) return { ok: true, status: 200, json: async () => RUN } as Response;
    const req = JSON.parse(String(init?.body)) as { questions: Record<string, unknown> };
    seen.questions.push(...Object.keys(req.questions));
    const answers = Object.fromEntries(Object.keys(req.questions).map((q) => [q, { type: "choice", choice }]));
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

const tip: GrowthSituation = { ahead: "open", exposed: "wall", supply: "ample", run: "short" };

test("with no answer and no run, a tip plays its own rule: the growth policy answers null", () => {
  const j = new ColonyJev({ intervalMs: 10, gatherMs: 0 });
  live.add(j);
  j.setAim("grow toward the tunnels");
  assert.equal(j.growthPolicy(tip), null);
});

test("in a run, a tip's situation is asked under the aim, and the answer then plays", async () => {
  const seen = proxy("fruit");
  const j = new ColonyJev({ intervalMs: 10, gatherMs: 0 });
  live.add(j);
  j.setAim("grow toward the tunnels");
  await j.start();
  assert.equal(j.growthPolicy(tip), null, "asked, not yet answered: the tip's own rule meanwhile");
  await tick(80);
  assert.ok(seen.questions.includes("g0_grow"), `asked ${seen.questions.join(", ")}`);
  assert.equal(j.growthPolicy(tip), "fruit");
  assert.equal(j.state.growthAsked, 1);
  assert.equal(j.state.growthCached, 1);
  // Another aim is another cache: no answer there yet.
  j.setAim("stay buried");
  assert.equal(j.growthPolicy(tip), null);
});

test("answers shipped for an aim play without a run; one the growth question can't give is refused", () => {
  const j = new ColonyJev({ intervalMs: 10, gatherMs: 0 });
  live.add(j);
  const aim = "grow toward the tunnels";
  j.setAim(aim);
  assert.equal(j.seed(growthContext(aim), [[growthKey(tip), "turn"]]), 1);
  assert.equal(j.growthPolicy(tip), "turn");
  const other: GrowthSituation = { ahead: "soil", exposed: "buried", supply: "ample", run: "short" };
  assert.equal(j.seed(growthContext(aim), [[growthKey(other), "left"]]), 0, "the tip's sides are not Jev's to name");
  assert.equal(j.growthPolicy(other), null);
});

test("attaching the fungus wires its tips to the growth lane (review of #115, S2)", () => {
  const j = new ColonyJev({ intervalMs: 10, gatherMs: 0 });
  live.add(j);
  // A real fungus: attachFungus binds its policies through bindPolicy (ja-fnd.5.4.1).
  const fungus = new Game(generateWorld(1, { size: { w: 120, h: 80 } }), { antCount: 10, rival: false }, mulberry32(3)).fungus;
  j.attachFungus(fungus);
  assert.equal(fungus.growthPolicy, j.growthPolicy);
});
