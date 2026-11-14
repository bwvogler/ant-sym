import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import {
  encodeFungal,
  fungalKey,
  fungusContext,
  Game,
  generateWorld,
  growthContext,
  LANES,
  askedLevers,
  DEFAULT_MENU,
  encodeLevels,
  mulberry32,
  type FungalSituation,
} from "../../colony/index.ts";
import { ColonyJev } from "../colonyJev.ts";
import type { RunSummary } from "../../../shared/jev.ts";

// A player's new aim is asked at once (ja-lo8.21, owner 2026-11-14): the situations the fungus's hosts are in and every
// growth situation go to Jev in one go, without the fungus lane's gather wait, instead of host by host as each meets
// its situation again. What is cached under the new aim (a preset's shipped answers) is not asked; a save's aim coming
// back, or the same words again, asks nothing.

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

/** A fake proxy: fungus levers scored 1, growth answered "grow"; each request's lane and the items (h0, g3, …) it asked. */
function proxy(): { reqs: { lane: "fungus" | "growth"; items: Set<string> }[] } {
  const seen = { reqs: [] as { lane: "fungus" | "growth"; items: Set<string> }[] };
  globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
    if (String(url).includes("api/run")) return { ok: true, status: 200, json: async () => RUN } as Response;
    const req = JSON.parse(String(init?.body)) as { state: { hosts?: unknown }; questions: Record<string, unknown> };
    const ids = Object.keys(req.questions);
    seen.reqs.push({ lane: req.state.hosts ? "fungus" : "growth", items: new Set(ids.map((q) => q.split("_")[0]!)) });
    const answers = Object.fromEntries(
      ids.map((q) => [q, req.state.hosts ? { type: "score", score: 1 } : { type: "choice", choice: "grow" }]),
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

const host = (s: Partial<FungalSituation>): FungalSituation => ({
  arousal: "calm",
  touch: "nestmate",
  place: "chamber",
  task: "nurse",
  carrying: "nothing",
  groomed: false,
  ...s,
});
const A = host({});
const B = host({ task: "forager", place: "outside", carrying: "food" });

/**
 * A client driving a real colony whose first ants are hosts in situations A, B, A (two distinct), as Fungus leaves them
 * (Colony.fungal), and one more ant, dead, whose last situation must not count. The gather wait is long: anything sent
 * within a few cycles went without it.
 */
function make(): ColonyJev {
  const g = new Game(generateWorld(1, { size: { w: 120, h: 80 } }), { antCount: 10, rival: false }, mulberry32(3));
  const c = g.colonies[0]!;
  c.fungal.fill(-1);
  [A, B, A].forEach((s, i) => (c.fungal[i] = encodeFungal(s)));
  c.fungal[3] = encodeFungal(host({ arousal: "alarmed" }));
  c.alive[3] = 0;
  const j = new ColonyJev({ intervalMs: 10, gatherMs: 10_000 });
  live.add(j);
  j.attachColonies([c]);
  return j;
}

const counts = (reqs: { lane: string; items: Set<string> }[], lane: string) =>
  reqs.filter((r) => r.lane === lane).reduce((n, r) => n + r.items.size, 0);

test("a player's new aim, with a run on: the hosts' situations and all 48 growth situations go at once, without the gather wait", async () => {
  const { reqs } = proxy();
  const j = make();
  j.setAim("first words");
  await j.start();
  // A host's miss just now starts the fungus lane's gather clock: without the aim's own send, the questions would wait it out.
  j.fungusPolicy(host({ arousal: "alarmed" }));
  j.setAim("new words", { askNow: true });
  await tick(80);
  assert.equal(counts(reqs, "fungus"), 2, "the two situations the living hosts are in, once each");
  assert.equal(counts(reqs, "growth"), LANES.growth.all().length);
  assert.equal(LANES.growth.all().length, 48);
  assert.equal(j.state.fungusCached, 2);
  assert.equal(j.state.growthCached, 48);
});

test("with no run on, a player's new aim wants one, and its questions go when it starts", async () => {
  const { reqs } = proxy();
  const j = make();
  j.setAim("first words");
  let wanted = 0;
  j.wantsRun = () => wanted++;
  j.setAim("new words", { askNow: true });
  assert.equal(wanted, 1, "a run is wanted");
  await j.start();
  await tick(80);
  assert.equal(counts(reqs, "fungus"), 2);
  assert.equal(counts(reqs, "growth"), 48);
});

test("what the new aim has cached is not asked; an aim with everything cached asks nothing and wants no run", async () => {
  const { reqs } = proxy();
  const j = make();
  j.setAim("first words");
  const aim = "shipped words";
  const lv = askedLevers(new Set(DEFAULT_MENU), false);
  assert.equal(j.seed(fungusContext(aim, "top"), [[fungalKey(A, lv), encodeLevels({}, lv)]]), 1, "A's answer under the new aim");
  j.seed(
    growthContext(aim),
    LANES.growth.all().map((s) => [LANES.growth.key(s, undefined), "grow"]),
  );
  await j.start();
  j.setAim(aim, { askNow: true });
  await tick(80);
  assert.equal(counts(reqs, "fungus"), 1, "only B: A is cached under the new aim");
  assert.equal(counts(reqs, "growth"), 0);

  // Everything cached, no run: nothing is wanted.
  const k = make();
  k.setAim("first words");
  k.seed(fungusContext(aim, "top"), [
    [fungalKey(A, lv), encodeLevels({}, lv)],
    [fungalKey(B, lv), encodeLevels({}, lv)],
  ]);
  k.seed(
    growthContext(aim),
    LANES.growth.all().map((s) => [LANES.growth.key(s, undefined), "grow"]),
  );
  let wanted = 0;
  k.wantsRun = () => wanted++;
  k.setAim(aim, { askNow: true });
  assert.equal(wanted, 0);
});

test("without askNow (the first aim, a save's coming back), or with the same words again, nothing is asked at once", async () => {
  const { reqs } = proxy();
  const j = make();
  j.setAim("first words");
  await j.start();
  j.setAim("restored words");
  await tick(80);
  assert.equal(reqs.length, 0, "lazy: asked only as the hosts meet their situations");
  j.setAim("restored words", { askNow: true });
  await tick(80);
  assert.equal(reqs.length, 0, "the same words: no change, nothing asked");
});

test("an aim changed with no run on is forgotten by Stop or dispose: a later run asks nothing at once", async () => {
  const { reqs } = proxy();
  const j = make();
  j.setAim("first words");
  j.wantsRun = () => {};
  j.setAim("new words", { askNow: true });
  await j.stop();
  await j.start();
  await tick(80);
  assert.equal(reqs.length, 0, "after Stop");
  const k = make();
  k.setAim("first words");
  k.setAim("new words", { askNow: true });
  k.dispose();
  await k.start();
  await tick(80);
  assert.equal(reqs.length, 0, "after dispose");
});

test("with no worker lever on the menu, a new aim asks no fungal situation (as #lookup)", async () => {
  const { reqs } = proxy();
  const j = make();
  j.setAim("first words");
  j.setMenu(new Set());
  await j.start();
  j.setAim("new words", { askNow: true });
  await tick(80);
  assert.equal(reqs.filter((r) => r.lane === "fungus").length, 0, "no fungus request at all");
  assert.equal(counts(reqs, "growth"), 48);
});
