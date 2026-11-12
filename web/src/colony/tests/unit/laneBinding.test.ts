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
import { decodeSituation, localPolicy, localStance, SITUATIONS } from "../../colony.ts";
import { LANE_KINDS, LANE_LIST, LANES, SAMPLE_FUNGAL, SAMPLE_SITUATION, SAMPLE_STANCE } from "../../lanes.ts";
import type { FungalSituation } from "../../fungalPolicy.ts";
import { STANCE_SCHEMA, type Situation, type StanceSituation } from "../../vocab.ts";

// The registry's lanes (docs/refactor.md S4.2, ja-fnd.5.2.3) do what the brains do: each function of a row gives the brain's own answer for
// the same inputs. The brains' bytes are pinned elsewhere (ui/tests/laneRegistry.char.test.ts); this pins that the registry adds nothing and
// drops nothing, and that what a row says about its lane (counters, variants, words, presets, batching) is what the lane is.

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

test("the registry lists the three lanes, each with its flags, counters, variants, words and batching", () => {
  assert.deepEqual(
    LANE_LIST.map((l) => l.name),
    ["mode", "stance", "fungus"],
  );
  for (const l of LANE_LIST) {
    assert.equal(l.kind, LANE_KINDS[l.name], `${l.name}'s flags are LANE_KINDS' row`);
    assert.equal(l.counters.asked, l.kind.counter, "the counter a lane feeds is the one its flags row names");
  }
  assert.deepEqual(
    LANE_LIST.map((l) => [l.counters.asked, l.counters.cached]),
    [
      ["asked", "cached"],
      ["stancesAsked", "stancesCached"],
      ["fungusAsked", "fungusCached"],
    ],
  );
  assert.deepEqual(
    LANE_LIST.map((l) => l.variants),
    [[""], [""], ["top", "side"]],
  );
  assert.deepEqual(
    LANE_LIST.map((l) => l.wordsField),
    ["doctrine", "doctrine", "aim"],
  );
  assert.equal(LANES.mode.presets, DOCTRINES);
  assert.equal(LANES.stance.presets, DOCTRINES);
  assert.equal(LANES.fungus.presets, AIMS);
  // Only the fungus gathers a fuller request, and only it has a batch of its own (the ants' lanes take the client's).
  assert.deepEqual(
    LANE_LIST.map((l) => [l.gather, l.batch]),
    [
      [false, null],
      [false, null],
      [true, 50],
    ],
  );
  assert.equal(LANES.mode.sample, SAMPLE_SITUATION);
  assert.equal(LANES.stance.sample, SAMPLE_STANCE);
  assert.equal(LANES.fungus.sample, SAMPLE_FUNGAL);
  // The erased list is the typed rows themselves, not copies.
  assert.deepEqual(
    LANE_LIST.map((l) => l.name),
    Object.values(LANES).map((l) => l.name),
  );
  for (const l of LANE_LIST) assert.equal(l, LANES[l.name] as unknown);
});

test("the mode lane is the mode brain", () => {
  const l = LANES.mode;
  for (const words of D) {
    const items = MODES_SEEN.map((situation, i) => ({ id: `s${i}`, key: situationKey(situation), situation }));
    assert.deepEqual(l.pack(items, words), packModeRequest(items, words));
    assert.equal(l.contextOf(words), policyContext(words));
    assert.equal(l.contextOf(words, "anything"), policyContext(words), "mode has no variants");
  }
  for (const s of MODES_SEEN) {
    assert.equal(l.key(s, undefined), situationKey(s));
    assert.equal(l.local(s), localPolicy(s));
  }
  for (const choice of ["follow", "dance"]) {
    const a = { s0_mode: { type: "choice" as const, choice } };
    assert.equal(l.read(a, "s0", SAMPLE_SITUATION, "k"), readMode(a, "s0"));
    assert.equal(l.valid("k", choice), choice === "follow");
  }
  assert.equal(l.read({}, "s0", SAMPLE_SITUATION, "k"), null);
  assert.equal(l.asks, undefined);
  assert.notEqual(l.contextOf(D[0]!), l.contextOf(D[1]!), "the words are in the context");
  const all = l.all();
  assert.equal(all.length, SITUATIONS);
  assert.deepEqual(all[0], decodeSituation(0));
  assert.deepEqual(all[SITUATIONS - 1], decodeSituation(SITUATIONS - 1));
});

test("the stance lane is the stance brain", () => {
  const l = LANES.stance;
  for (const words of D) {
    const items = STANCES_SEEN.map((situation, i) => ({ id: `c${i}`, key: stanceKey(situation), situation }));
    assert.deepEqual(l.pack(items, words), packStanceRequest(items, words));
    assert.equal(l.contextOf(words), stanceContext(words));
  }
  for (const s of STANCES_SEEN) {
    assert.equal(l.key(s, undefined), stanceKey(s));
    assert.equal(l.local(s), localStance(s));
  }
  for (const choice of ["raid", "flee"]) {
    const a = { c0_stance: { type: "choice" as const, choice } };
    assert.equal(l.read(a, "c0", SAMPLE_STANCE, "k"), readStance(a, "c0"));
    assert.equal(l.valid("k", choice), choice === "raid");
  }
  const all = l.all();
  assert.equal(all.length, STANCE_SCHEMA.size);
  assert.deepEqual(all[5], STANCE_SCHEMA.decode(5));
});

test("the fungus lane is the fungus brain: only its key and asks read the menu, and it has no local rule of its own", () => {
  const l = LANES.fungus;
  for (const menu of MENUS)
    for (const s of FUNGAL_SEEN) {
      const asked = askedLevers(menu, s.task === "queen");
      assert.equal(l.key(s, menu), fungalKey(s, asked));
      assert.equal(l.asks(s, menu), worthAsking(asked));
    }
  assert.notEqual(l.key(FUNGAL_SEEN[0]!, MENUS[0]!), l.key(FUNGAL_SEEN[0]!, MENUS[1]!), "the menu is in the key");
  for (const words of A) {
    const items = FUNGAL_SEEN.map((situation, i) => ({ id: `h${i}`, key: l.key(situation, MENUS[i % 2]!), situation }));
    assert.deepEqual(
      l.pack(items, words),
      packFungusRequest(
        items.map((it) => ({ ...it, asked: askedIn(it.key) })),
        words,
      ),
    );
    assert.equal(l.contextOf(words, "top"), fungusContext(words, "top"));
    assert.equal(l.contextOf(words, "side"), fungusContext(words, "side"));
    assert.equal(l.contextOf(words), fungusContext(words, "top"), "no variant is the top-down view");
  }
  assert.notEqual(l.contextOf(A[0]!, "top"), l.contextOf(A[0]!, "side"));
  assert.equal((l as { local?: unknown }).local, undefined, "the fungus's local rule is a Game method");
  assert.equal((l as { all?: unknown }).all, undefined, "its situations are the ones a game meets");
});

test("a fungus question is packed and read against the levers its key asked, whatever the menu is when it lands", () => {
  const l = LANES.fungus;
  const s = FUNGAL_SEEN[0]!;
  // Keyed under the full menu; the menu has since shrunk to three levers (the lane holds no menu: only the key says what was asked).
  const key = l.key(s, MENUS[0]!);
  const asked = askedIn(key);
  assert.ok(asked.length > 3);
  const request = l.pack([{ id: "h0", key, situation: s }], A[0]!);
  assert.deepEqual(
    Object.keys(request.questions),
    asked.map((id) => `h0_${id}`),
    "every lever the key asked, not the menu's now",
  );
  const answers = Object.fromEntries(asked.map((id) => [`h0_${id}`, { type: "score" as const, score: 1 }]));
  assert.equal(l.read(answers, "h0", s, key), readLevels(answers, "h0", asked));
  assert.equal(l.read(answers, "h0", s, key)?.split(",").length, asked.length);
  assert.equal(l.valid(key, "1,1,1"), validLevels(key, "1,1,1"));
  assert.equal(l.valid(key, "1"), false, "an answer short of the levers asked is not valid");
});
