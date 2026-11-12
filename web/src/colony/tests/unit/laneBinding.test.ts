import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_MENU, askedLevers } from "../../fungus.ts";
import {
  DOCTRINES,
  packModeRequest,
  packStanceRequest,
  policyContext,
  readMode,
  readStance,
  situationKey,
  stanceContext,
  stanceKey,
} from "../../colonyBrain.ts";
import { AIMS, askedIn, fungalKey, fungusContext, packFungusRequest, readLevels, validLevels, worthAsking } from "../../fungusBrain.ts";
import { localPolicy, localStance } from "../../colony.ts";
import { LANE_KINDS, LANE_LIST, LANES, SAMPLE_FUNGAL, SAMPLE_SITUATION, SAMPLE_STANCE } from "../../lanes.ts";
import type { FungalSituation } from "../../fungalPolicy.ts";
import type { Situation, StanceSituation } from "../../vocab.ts";

// The registry's lanes (docs/refactor.md S4.2, ja-fnd.5.2.3) do what the brains do: each bound function gives the brain's own answer for
// the same inputs, under two frames. The brains' bytes are pinned elsewhere (ui/tests/laneRegistry.char.test.ts); this pins that the
// registry adds nothing and drops nothing.

const D = [DOCTRINES[0]!.text, "Be bold."];
const A = [AIMS[0]!.text, "Spread quietly."];
const MODES_SEEN: Situation[] = [
  SAMPLE_SITUATION,
  { mode: "return", tired: true, foodTrail: "none", homeTrail: "brood", alarm: "strong", enemy: "near", stance: "defend" },
];
const STANCES_SEEN: StanceSituation[] = [
  SAMPLE_STANCE,
  { stance: "defend", ants: "few", losses: "heavy", enemyNearNest: true, intake: "none", larder: "full" },
];
const FUNGAL_SEEN: FungalSituation[] = [
  SAMPLE_FUNGAL,
  { arousal: "calm", touch: "none", place: "queen", task: "queen", carrying: "nothing", groomed: false },
];
const MENUS = [new Set(DEFAULT_MENU), new Set(["food", "rival", "trail"])];

test("the registry lists the three lanes, each with its flags, counters and sample", () => {
  assert.deepEqual(
    LANE_LIST.map((l) => l.name),
    ["mode", "stance", "fungus"],
  );
  for (const l of LANE_LIST) assert.equal(l.kind, LANE_KINDS[l.name], `${l.name}'s flags are LANE_KINDS' row`);
  assert.deepEqual(
    LANE_LIST.map((l) => [l.counters.asked, l.counters.cached]),
    [
      ["asked", "cached"],
      ["stancesAsked", "stancesCached"],
      ["fungusAsked", "fungusCached"],
    ],
  );
  // The counter a lane feeds is the one its flags row names.
  for (const l of LANE_LIST) assert.equal(l.counters.asked, l.kind.counter);
  assert.deepEqual(
    LANE_LIST.map((l) => l.variants),
    [[""], [""], ["top", "side"]],
  );
  assert.equal(LANES.mode.sample, SAMPLE_SITUATION);
  assert.equal(LANES.stance.sample, SAMPLE_STANCE);
  assert.equal(LANES.fungus.sample, SAMPLE_FUNGAL);
});

test("the mode lane bound to a doctrine is the mode brain under it", () => {
  for (const words of D) {
    const b = LANES.mode.bind({ words });
    const items = MODES_SEEN.map((situation, i) => ({ id: `s${i}`, key: situationKey(situation), situation }));
    assert.deepEqual(b.pack(items), packModeRequest(items, words));
    assert.equal(b.context(), policyContext(words));
    assert.equal(b.context("anything"), policyContext(words), "mode has no variants");
    for (const s of MODES_SEEN) {
      assert.equal(b.key(s), situationKey(s));
      assert.equal(b.local!(s), localPolicy(s));
    }
    for (const choice of ["follow", "dance"]) {
      const a = { s0_mode: { type: "choice" as const, choice } };
      assert.equal(b.read(a, "s0", SAMPLE_SITUATION, "k"), readMode(a, "s0"));
      assert.equal(b.valid("k", choice), choice === "follow");
    }
    assert.equal(b.read({}, "s0", SAMPLE_SITUATION, "k"), null);
    assert.equal(b.asks, undefined);
  }
  assert.notEqual(
    LANES.mode.bind({ words: D[0]! }).context(),
    LANES.mode.bind({ words: D[1]! }).context(),
    "the frame's words are in the context",
  );
});

test("the stance lane bound to a doctrine is the stance brain under it", () => {
  for (const words of D) {
    const b = LANES.stance.bind({ words });
    const items = STANCES_SEEN.map((situation, i) => ({ id: `c${i}`, key: stanceKey(situation), situation }));
    assert.deepEqual(b.pack(items), packStanceRequest(items, words));
    assert.equal(b.context(), stanceContext(words));
    for (const s of STANCES_SEEN) {
      assert.equal(b.key(s), stanceKey(s));
      assert.equal(b.local!(s), localStance(s));
    }
    for (const choice of ["raid", "flee"]) {
      const a = { c0_stance: { type: "choice" as const, choice } };
      assert.equal(b.read(a, "c0", SAMPLE_STANCE, "k"), readStance(a, "c0"));
      assert.equal(b.valid("k", choice), choice === "raid");
    }
  }
});

test("the fungus lane bound to an aim and a menu is the fungus brain under them, and has no local rule of its own", () => {
  for (const words of A)
    for (const menu of MENUS) {
      const b = LANES.fungus.bind({ words, menu });
      for (const s of FUNGAL_SEEN) {
        const asked = askedLevers(menu, s.task === "queen");
        assert.equal(b.key(s), fungalKey(s, asked));
        assert.equal(b.asks!(s), worthAsking(asked));
      }
      const items = FUNGAL_SEEN.map((situation, i) => ({ id: `h${i}`, key: b.key(situation), situation }));
      assert.deepEqual(
        b.pack(items),
        packFungusRequest(
          items.map((it) => ({ ...it, asked: askedIn(it.key) })),
          words,
        ),
      );
      assert.equal(b.context("top"), fungusContext(words, "top"));
      assert.equal(b.context("side"), fungusContext(words, "side"));
      assert.equal(b.context(), fungusContext(words, "top"), "no variant is the top-down view");
      const key = b.key(FUNGAL_SEEN[0]!);
      const asked = askedIn(key);
      const answers = Object.fromEntries(asked.map((id) => [`h0_${id}`, { type: "score" as const, score: 1 }]));
      assert.equal(b.read(answers, "h0", FUNGAL_SEEN[0]!, key), readLevels(answers, "h0", asked));
      assert.equal(b.valid(key, "1,1,1"), validLevels(key, "1,1,1"));
      assert.equal(b.local, undefined, "the fungus's local rule is a Game method");
    }
  assert.notEqual(
    LANES.fungus.bind({ words: A[0]!, menu: MENUS[0]! }).context("top"),
    LANES.fungus.bind({ words: A[0]!, menu: MENUS[0]! }).context("side"),
  );
});
