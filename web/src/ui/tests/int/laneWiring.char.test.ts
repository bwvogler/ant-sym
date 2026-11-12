import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import {
  askedLevers,
  encodeLevels,
  fungalKey,
  fungusContext,
  Game,
  generateWorld,
  LEVERS,
  mulberry32,
  PRESETS,
  STRAINS,
  type FungalSituation,
} from "../../../colony/index.ts";
import { smallOne } from "../../../colony/tests/builders.ts";
import { ColonyJev, DEFAULT_COLONY_JEV, type CacheStore } from "../../colonyJev.ts";
import type { JevRequest, RunSummary } from "../../../../shared/jev.ts";

// How the Jev client wires its lanes (docs/refactor.md S4.2, ja-fnd.5.2.1, review of PR #92 S1): the parts of colonyJev.ts the lane
// registry's slice 4 rebuilds, pinned through what they do, before they move: the client's defaults, which context the fungus lane
// asks and answers under (the view the game has), which levers it asks of a queen, its own batch size, and its wait before it sends
// less than a full batch. laneRegistry.char.test.ts pins what the brains produce; this pins that the client uses them so.

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

const tick = (ms: number) => new Promise((r) => setTimeout(r, ms));
const live = new Set<ColonyJev>();
afterEach(() => {
  for (const j of live) j.dispose();
  live.clear();
});
const make = (opts: ConstructorParameters<typeof ColonyJev>[0] = {}, store: CacheStore | null = null) => {
  const j = new ColonyJev({ intervalMs: 10, gatherMs: 0, saveMs: 0, ...opts }, store);
  live.add(j);
  return j;
};
const memoryStore = (): CacheStore & { data: Map<string, [string, string][]> } => {
  const data = new Map<string, [string, string][]>();
  return { data, load: (c) => data.get(c) ?? [], save: (c, e) => void data.set(c, e) };
};

/** A fetch that answers every question of every lane (levels as the first preset's) and records the requests. */
function scriptAll() {
  const levels = PRESETS[0]!.levels;
  const reqs: { at: number; req: JevRequest & { state: Record<string, unknown> } }[] = [];
  const t0 = Date.now();
  globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
    if (String(url).startsWith("/api/run")) return { ok: true, status: 200, json: async () => RUN } as Response;
    const req = JSON.parse(String(init?.body)) as JevRequest & { state: Record<string, unknown> };
    reqs.push({ at: Date.now() - t0, req });
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

/** A game on the top-down kind of map (no nest underground), Garden painted on the player's nest. */
function topGame() {
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
/** One world's: a curtain under the plane, so the fungus has a nest (its view is "side"). */
function nestGame() {
  const g = new Game(smallOne(7), { antCount: 60, rivalAnts: 60 }, mulberry32(4));
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

const AIM = "Spread unseen.";
const WORKER: FungalSituation = {
  arousal: "calm",
  touch: "nestmate",
  place: "outside",
  task: "forager",
  carrying: "nothing",
  groomed: false,
};
const QUEEN: FungalSituation = { arousal: "calm", touch: "none", place: "queen", task: "queen", carrying: "nothing", groomed: false };

test("the client's defaults: a hundred situations a request, two in flight, a cycle every 300 ms, the fungus's gather wait, a save a second", () => {
  assert.deepEqual(DEFAULT_COLONY_JEV, { batch: 100, inFlight: 2, intervalMs: 300, gatherMs: 2000, saveMs: 1000 });
});

test("the fungus lane asks and answers under the view its game has: top without a nest, side with one", () => {
  for (const [game, view, other] of [
    [topGame(), "top", "side"],
    [nestGame(), "side", "top"],
  ] as const) {
    const askedFor = (s: FungalSituation) => askedLevers(game.fungus.menu, s.task === "queen");
    const answer = encodeLevels(PRESETS[0]!.levels, askedFor(WORKER));
    // Cached under the right view's context: a hit. Under the other view's: not asked there, so not a hit.
    for (const [ctxView, expected] of [
      [view, "jev"],
      [other, "local"],
    ] as const) {
      const store = memoryStore();
      store.data.set(fungusContext(AIM, ctxView), [[fungalKey(WORKER, askedFor(WORKER)), answer]]);
      const j = make({}, store);
      j.attachFungus(game.fungus);
      j.setAim(AIM);
      assert.equal(j.explainFungus(WORKER).by, expected, `${view} game, an answer cached under the ${ctxView} view`);
    }
  }
});

test("the fungus lane asks a queen host only her levers, and a worker the menu's", () => {
  const g = nestGame();
  const store = memoryStore();
  const queenAsked = askedLevers(g.fungus.menu, true);
  const workerAsked = askedLevers(g.fungus.menu, false);
  assert.notDeepEqual(queenAsked, workerAsked);
  // Cached under her own key (her levers): a hit for a queen. Under a worker's levers: not her key, so not a hit.
  store.data.set(fungusContext(AIM, "side"), [
    [fungalKey(QUEEN, queenAsked), encodeLevels(PRESETS[0]!.levels, queenAsked)],
    [fungalKey(WORKER, workerAsked), encodeLevels(PRESETS[0]!.levels, workerAsked)],
  ]);
  const j = make({}, store);
  j.attachFungus(g.fungus);
  j.setAim(AIM);
  assert.equal(j.explainFungus(QUEEN).by, "jev");
  assert.equal(j.explainFungus(WORKER).by, "jev");
  const wrong = memoryStore();
  wrong.data.set(fungusContext(AIM, "side"), [[fungalKey(QUEEN, workerAsked), encodeLevels(PRESETS[0]!.levels, workerAsked)]]);
  const k = make({}, wrong);
  k.attachFungus(g.fungus);
  k.setAim(AIM);
  assert.equal(k.explainFungus(QUEEN).by, "local", "a queen's situation is not asked with a worker's levers");
});

test("the fungus lane's batch is its own, not the client's: hosts go up to fifty a request while ants are held to the client's batch", async () => {
  const sent = scriptAll();
  const j = make({ batch: 2 });
  const g = topGame();
  j.attach(g.player);
  j.attachFungus(g.fungus);
  j.setAim(AIM);
  await j.start();
  for (let round = 0; round < 8; round++) {
    for (let k = 0; k < 6; k++) g.tick(1 / 30);
    await tick(25);
  }
  const hosts = sent.filter((s) => s.req.state.hosts).map((s) => Object.keys(s.req.state.hosts as object).length);
  const ants = sent.filter((s) => s.req.state.ants).map((s) => Object.keys(s.req.state.ants as object).length);
  assert.ok(hosts.length > 0 && ants.length > 0, "both lanes asked");
  assert.ok(Math.max(...ants) <= 2, `ant requests are held to the client's batch (${ants})`);
  assert.ok(Math.max(...hosts) > 2 && Math.max(...hosts) <= 50, `the fungus's requests are its own size (${hosts})`);
});

test("the fungus lane waits to gather a fuller request before it sends; the ants' lanes send at once", async () => {
  const sent = scriptAll();
  const j = make({ gatherMs: 600 });
  const g = topGame();
  j.attach(g.player);
  j.attachFungus(g.fungus);
  j.setAim(AIM);
  await j.start();
  for (let round = 0; round < 5; round++) {
    for (let k = 0; k < 6; k++) g.tick(1 / 30);
    await tick(20);
  }
  const early = sent.filter((s) => s.req.state.hosts).length;
  assert.ok(sent.filter((s) => s.req.state.ants).length > 0, "the ants' lane asked already");
  assert.equal(early, 0, "the fungus lane is still gathering");
  for (let round = 0; round < 60 && !sent.some((s) => s.req.state.hosts); round++) {
    for (let k = 0; k < 3; k++) g.tick(1 / 30);
    await tick(50);
  }
  assert.ok(
    sent.some((s) => s.req.state.hosts),
    "it asks once it has waited",
  );
});

test("each lane sends its own ids and feeds its own counter: ants s0.., the strategist c0.., the fungus h0..; hits are the ants' modes only (review of #101)", async () => {
  const sent = scriptAll();
  const j = make();
  const g = topGame();
  j.attach(g.player);
  j.attachFungus(g.fungus);
  j.setAim(AIM);
  await j.start();
  const asked = (key: string) => sent.some((x) => x.req.state[key]);
  // The strategist is asked by the game when it chooses a stance: here by hand, as colonyJev.test.ts does, with a few views.
  const views = [g.player.stanceSituation(false), g.player.stanceSituation(true)];
  for (let round = 0; round < 20 && !(asked("ants") && asked("colony") && asked("hosts")); round++) {
    for (let k = 0; k < 6; k++) g.tick(1 / 30);
    for (const v of views) j.stancePolicy(v);
    await tick(25);
  }
  await tick(60);
  const ids = (key: string) => sent.flatMap((s) => Object.keys((s.req.state[key] ?? {}) as object));
  const ants = ids("ants");
  const strategist = ids("colony");
  const hosts = ids("hosts");
  assert.ok(ants.length > 0 && strategist.length > 0 && hosts.length > 0, "all three lanes asked");
  assert.ok(
    ants.every((id) => /^s\d+$/.test(id)),
    "an ant's situation is s<n>",
  );
  assert.ok(
    strategist.every((id) => /^c\d+$/.test(id)),
    "the strategist's view is c<n>",
  );
  assert.ok(
    hosts.every((id) => /^h\d+$/.test(id)),
    "a host is h<n>",
  );
  // Each counter counts the situations its own lane sent.
  assert.equal(j.state.asked, ants.length);
  assert.equal(j.state.stancesAsked, strategist.length);
  assert.equal(j.state.fungusAsked, hosts.length);
  // Only the ants' modes are tallied as hits and misses: a strategist lookup moves neither.
  assert.ok(j.state.hits + j.state.misses > 0, "the ants' lookups are tallied");
  const tally = j.state.hits + j.state.misses;
  for (const v of views) j.stancePolicy(v);
  assert.equal(j.state.hits + j.state.misses, tally, "the strategist's lookups are not tallied");
});
