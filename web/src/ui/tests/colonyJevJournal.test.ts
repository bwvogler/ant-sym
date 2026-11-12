import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import { Journal, type FungalSituation } from "../../colony/index.ts";
import { ColonyJev } from "../colonyJev.ts";
import type { RunSummary } from "../../../shared/jev.ts";

// The game journal's "jev" events (ja-8tb, PR #95 review N2): each batch ColonyJev asks, what came back, and a failure.

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

/** A fake proxy: every score question answered 1, or every Jev request refused with `fail`. */
function proxy(fail?: number) {
  globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
    if (String(url).includes("api/run")) return { ok: true, status: 200, json: async () => RUN } as Response;
    if (fail) return { ok: false, status: fail, json: async () => ({ error: "boom" }) } as Response;
    const req = JSON.parse(String(init?.body)) as { questions: Record<string, unknown> };
    const answers = Object.fromEntries(Object.keys(req.questions).map((q) => [q, { type: "score", score: 1 }]));
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
}

const fungal: FungalSituation = {
  arousal: "calm",
  touch: "nestmate",
  place: "chamber",
  task: "nurse",
  carrying: "nothing",
  groomed: false,
};

async function asked(fail?: number): Promise<string[]> {
  proxy(fail);
  const j = new ColonyJev({ intervalMs: 10, gatherMs: 0 });
  live.add(j);
  j.journal = new Journal("jev");
  j.setAim("x");
  j.setMenu(new Set(["calm"]));
  await j.start();
  j.fungusPolicy(fungal);
  await tick(60);
  return j.journal.events.map((e) => e.text);
}

test("a batch asked and answered: two jev events", async () => {
  assert.deepEqual(await asked(), ["asked 1 fungus situation", "fungus: 1 of 1 answered"]);
});

test("a batch that fails: asked, then failed with the server's reason", async () => {
  assert.deepEqual(await asked(500), ["asked 1 fungus situation", "fungus batch failed: boom"]);
});
