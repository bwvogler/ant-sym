import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import { Colony, type Situation } from "../../colony/colony.ts";
import type { FungalSituation } from "../../colony/fungalPolicy.ts";
import { generateWorld, mulberry32, OPEN_WORLD } from "../../colony/world.ts";
import { ColonyJev, type CacheStore } from "../colonyJev.ts";
import type { JevRequest, RunSummary } from "../../../shared/jev.ts";

// PR #7 review: the fungus lane's menu, and a 409 with questions still in flight.

const RUN: RunSummary = { running: true, startedAt: 0, stoppedAt: null, stopReason: null, elapsedSeconds: 0, caps: { capUsd: 0.1, capSeconds: 1800 }, requests: 0, inFlight: 0, maxInFlight: 5, inputTokens: 0, usd: 0, sessionInputTokens: 0, sessionUsd: 0, aborted: 0, medianMs: null, p90Ms: null, statuses: {}, remainingUsd: 0.1, remainingSeconds: 1800 };
type Req = JevRequest & { state: Record<string, unknown> };
const realFetch = globalThis.fetch;
const live = new Set<ColonyJev>();
afterEach(() => {
  for (const j of live) j.dispose();
  live.clear();
  globalThis.fetch = realFetch;
});
const tick = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** A fake proxy that honours the abort signal, as fetch does. `hold(req)` parks a request until released or aborted. */
function proxy(opts: { answer: (q: string) => string; status?: (req: Req) => number; hold?: (req: Req) => boolean }) {
  const reqs: Req[] = [];
  const held: (() => void)[] = [];
  const count = { aborted: 0, holding: 0 };
  globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
    if (String(url).startsWith("/api/run")) return { ok: true, status: 200, json: async () => RUN } as Response;
    const req = JSON.parse(String(init?.body)) as Req;
    reqs.push(req);
    if (opts.hold?.(req))
      await new Promise<void>((resolve, reject) => {
        count.holding++;
        held.push(() => (count.holding--, resolve()));
        init?.signal?.addEventListener("abort", () => (count.holding--, count.aborted++, reject(Object.assign(new Error("aborted"), { name: "AbortError" }))));
      });
    const st = opts.status?.(req) ?? 200;
    if (st === 409) return { ok: false, status: 409, json: async () => ({ error: "over", run: RUN }) } as Response;
    const answers: Record<string, unknown> = {};
    for (const q of Object.keys(req.questions)) answers[q] = { type: "choice", choice: opts.answer(q), confidence: 0.9 };
    const body = { status: 200, body: { model: "jev-x", answers, usage: { input_tokens: 10, output_tokens: 0 } }, ms: 1, attempts: 1, inputTokens: 10, run: RUN };
    return { ok: true, status: 200, json: async () => body } as Response;
  }) as typeof fetch;
  return { reqs, count, release: () => held.splice(0).forEach((r) => r()) };
}

function make(store: CacheStore | null = null): ColonyJev {
  const j = new ColonyJev({ intervalMs: 10 }, store);
  live.add(j);
  return j;
}

const fungal = (s: Partial<FungalSituation> = {}): FungalSituation => ({ strain: "garden", load: "mid", host: "explore", ground: "home", contact: "kin", groomed: false, ...s });
const fungusRequests = (reqs: Req[]) => reqs.filter((r) => r.state.hosts);

test("no choice, no question: a strain with nothing (or one thing) on the menu is never asked; the local rule decides, free", async () => {
  const { reqs } = proxy({ answer: () => "dormant" });
  const j = make();
  j.setAim("x");
  j.setMenu(new Set(["blend", "share"])); // nothing Lockpick allows (dormant, soothe, roam)
  await j.start();
  for (let k = 0; k < 10; k++) {
    j.fungusPolicy(fungal({ strain: "lockpick" }));
    await tick(20);
  }
  assert.equal(fungusRequests(reqs).length, 0, "Lockpick: nothing on offer");
  assert.equal(j.explainFungus(fungal({ strain: "lockpick" })).by, "local");
  j.setMenu(new Set(["blend"]));
  for (let k = 0; k < 5; k++) {
    j.fungusPolicy(fungal());
    await tick(20);
  }
  assert.equal(fungusRequests(reqs).length, 0, "Garden: one thing on offer is no choice");
  j.setMenu(new Set(["blend", "share"]));
  j.fungusPolicy(fungal());
  await tick(40);
  assert.equal(fungusRequests(reqs).length, 1, "two things: a question");
  const crit = Object.keys((Object.values(fungusRequests(reqs)[0]!.questions)[0] as { criteria: object }).criteria);
  assert.deepEqual(crit, ["blend", "share"]);
});

test("a menu change while a fungus question is in flight: its answer is kept for what it was offered, and serves when that menu comes back", async () => {
  let holding = true;
  const { reqs, release } = proxy({ answer: () => "soothe", hold: () => holding });
  const j = make();
  j.setAim("x");
  const m1 = new Set(["dormant", "soothe", "share", "roam", "blend"]);
  j.setMenu(m1);
  await j.start();
  const s = fungal();
  j.fungusPolicy(s);
  await tick(30);
  assert.equal(fungusRequests(reqs).length, 1);
  j.setMenu(new Set(["dormant", "blend", "share", "roam"])); // soothe off while it is asked
  holding = false;
  release();
  await tick(30);
  assert.notEqual(j.explainFungus(s).by, "jev", "soothe is off: the answer does not serve this menu");
  j.setMenu(m1);
  assert.deepEqual(j.explainFungus(s), { answer: "soothe", by: "jev" }, "paid for under m1, kept under m1");
  assert.equal(j.state.fungusCached, 1);
});

test("a 409 ends the run and cancels what is still in flight: Start again asks it once, never alongside the old run's copy", async () => {
  let refused = false;
  const tired = (r: Req) => Object.values((r.state.ants ?? {}) as Record<string, { tired?: boolean }>).some((a) => a.tired === true);
  const { reqs, count, release } = proxy({
    answer: (q) => (q.endsWith("_stance") ? "forage" : "return"),
    hold: tired,
    status: (r) => (!tired(r) && !refused && r.state.ants ? ((refused = true), 409) : 200),
  });
  const j = new ColonyJev({ intervalMs: 10, batch: 1 });
  live.add(j);
  const c = new Colony(generateWorld(1, OPEN_WORLD), { antCount: 5 }, mulberry32(9));
  j.attach(c);
  await j.start();
  const a: Situation = { mode: "explore", tired: true, foodTrail: "faint", homeTrail: "strong", alarm: "faint", enemy: "none", stance: "forage" };
  const b: Situation = { mode: "explore", tired: false, foodTrail: "none", homeTrail: "none", alarm: "strong", enemy: "none", stance: "forage" };
  j.policy(a);
  j.policy(b);
  await tick(40);
  assert.equal(j.state.phase, "stopped", "b was refused: the run is over");
  assert.equal(count.aborted, 1, "a, still in flight, was cancelled with it");
  await j.start();
  j.policy(a);
  await tick(40);
  assert.equal(reqs.filter(tired).length, 2, "asked again in the new run");
  assert.equal(count.holding, 1, "and only the new run's copy is in flight");
  release();
  await tick(30);
  assert.equal(j.explain(a).by, "jev");
});
