import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_MENU, askedLevers } from "../../fungus.ts";
import {
  DOCTRINES,
  MODE_WORDS,
  packModeRequest,
  packStanceRequest,
  policyContext,
  readMode,
  readStance,
  situationKey,
  stanceContext,
  stanceKey,
  STANCE_WORDS,
} from "../../colonyBrain.ts";
import { AIMS, askedIn, fungalKey, fungusContext, packFungusRequest, readLevels, validLevels, worthAsking } from "../../fungusBrain.ts";
import { decodeSituation, localPolicy, localStance, SITUATIONS } from "../../colony.ts";
import { growthContext, growthKey, localGrowthChoice, packGrowthRequest } from "../../growthBrain.ts";
import { LANE_KINDS, LANE_LIST, LANES, laneOfContext, SAMPLE_FUNGAL, SAMPLE_GROWTH, SAMPLE_SITUATION, SAMPLE_STANCE } from "../../lanes.ts";
import type { FungalSituation } from "../../fungalPolicy.ts";
import { STANCE_SCHEMA, type LaneWords, type Mode, type Situation, type Stance, type StanceSituation } from "../../vocab.ts";

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

test("the registry lists the four lanes, each with its flags, counters, variants, words and batching", () => {
  assert.deepEqual(
    LANE_LIST.map((l) => l.name),
    ["mode", "stance", "fungus", "growth"],
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
      ["growthAsked", "growthCached"],
    ],
  );
  assert.deepEqual(
    LANE_LIST.map((l) => l.variants),
    [[""], [""], ["top", "side"], [""]],
  );
  assert.deepEqual(
    LANE_LIST.map((l) => l.wordsField),
    ["doctrine", "doctrine", "aim", "aim"],
  );
  assert.equal(LANES.mode.presets, DOCTRINES);
  assert.equal(LANES.stance.presets, DOCTRINES);
  assert.equal(LANES.fungus.presets, AIMS);
  assert.equal(LANES.growth.presets, AIMS, "the growth lane asks under the fungus's aim");
  // Only the fungus's lanes gather a fuller request and have a batch of their own (the ants' lanes take the client's).
  assert.deepEqual(
    LANE_LIST.map((l) => [l.gather, l.batch]),
    [
      [false, null],
      [false, null],
      [true, 50],
      [true, 48],
    ],
  );
  assert.equal(LANES.mode.sample, SAMPLE_SITUATION);
  assert.equal(LANES.stance.sample, SAMPLE_STANCE);
  assert.equal(LANES.fungus.sample, SAMPLE_FUNGAL);
  assert.equal(LANES.growth.sample, SAMPLE_GROWTH);
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
  const whole = asked.map(() => "1").join(",");
  assert.equal(l.valid(key, whole), true, "an answer with a level for every lever asked is valid");
  assert.equal(validLevels(key, whole), true);
  assert.equal(l.valid(key, "1"), false, "an answer short of the levers asked is not valid");
});

// Words by species (ja-fnd.5.3.2): a lane asked with a species' own words uses its legend and criteria, keeps its answers under its own context, and
// reads only the choices its criteria name; asked with the generic ant's words (or none) nothing changes.

const SPECIES_MODE: LaneWords<Mode> = {
  legend: "Each key in `ants` is the situation of one lone forager. ",
  criteria: { explore: "explore: search alone", return: "return: walk home", fight: "fight: attack a stranger" },
  version: 1,
};
const SPECIES_STANCE: LaneWords<Stance> = {
  legend: "Each key in `colony` is the view one small nest has of itself. ",
  criteria: { forage: "forage: gather food", defend: "defend: stay near home" },
  version: 9,
};
// A species cannot offer a choice the lane does not have: this fails to compile if LaneWords stops checking its keys.
// @ts-expect-error "rest" is not a Mode
const NOT_A_MODE: LaneWords<Mode> = { legend: "", criteria: { rest: "rest: sit still" }, version: 1 };

test("a lane asked with the generic ant's own words is the lane asked with none", () => {
  for (const [l, words, sits] of [
    [LANES.mode, MODE_WORDS, MODES_SEEN],
    [LANES.stance, STANCE_WORDS, STANCES_SEEN],
  ] as const) {
    const items = (sits as readonly unknown[]).map((situation, i) => ({ id: `s${i}`, key: `k${i}`, situation }));
    for (const d of D) {
      assert.deepEqual(l.pack(items as never, d, words), l.pack(items as never, d));
      assert.equal(l.contextOf(d, undefined, words), l.contextOf(d));
    }
    for (const choice of Object.keys(words.criteria)) assert.equal(l.valid("k", choice, words), l.valid("k", choice));
  }
});

test("the mode lane with a species' words: its legend, its criteria, its own context under the same prefix, only its choices", () => {
  const l = LANES.mode;
  const items = MODES_SEEN.map((situation, i) => ({ id: `s${i}`, key: situationKey(situation), situation }));
  const req = l.pack(items, D[0]!, SPECIES_MODE);
  assert.equal((req.state as { legend: string }).legend, SPECIES_MODE.legend);
  assert.equal((req.state as { doctrine: string }).doctrine, D[0]);
  for (const q of Object.values(req.questions)) assert.deepEqual((q as { criteria: unknown }).criteria, SPECIES_MODE.criteria);
  const own = l.contextOf(D[0]!, undefined, SPECIES_MODE);
  assert.match(own, /^colony-v1-[0-9a-f]+$/, "its own version, the same lane prefix");
  assert.equal(laneOfContext(own), "mode", "an ordinary lookup finds the lane");
  assert.notEqual(own, l.contextOf(D[0]!), "not the generic ant's cache");
  assert.match(l.contextOf(D[0]!, undefined, { ...SPECIES_MODE, version: 2 }), /^colony-v2-/, "its version is in the context");
  assert.notEqual(
    own,
    l.contextOf(D[0]!, undefined, { ...SPECIES_MODE, legend: SPECIES_MODE.legend + "x" }),
    "the legend is in the context",
  );
  assert.notEqual(
    own,
    l.contextOf(D[0]!, undefined, { ...SPECIES_MODE, criteria: { ...SPECIES_MODE.criteria, fight: "fight: other" } }),
    "the criteria are in the context",
  );
  assert.notEqual(own, l.contextOf(D[1]!, undefined, SPECIES_MODE), "the doctrine is too");
  // It has no follow: neither read nor valid accepts it; they accept what it has.
  const follow = { s0_mode: { type: "choice" as const, choice: "follow" } };
  const ret = { s0_mode: { type: "choice" as const, choice: "return" } };
  assert.equal(l.read(follow, "s0", SAMPLE_SITUATION, "k", SPECIES_MODE), null);
  assert.equal(l.read(ret, "s0", SAMPLE_SITUATION, "k", SPECIES_MODE), "return");
  assert.equal(l.valid("k", "follow", SPECIES_MODE), false);
  assert.equal(l.valid("k", "return", SPECIES_MODE), true);
  assert.equal(l.read(follow, "s0", SAMPLE_SITUATION, "k"), "follow", "the generic ant still has it");
});

test("the stance lane with a species' words: its legend, its criteria, its own context under the stance- prefix, only its choices", () => {
  const l = LANES.stance;
  const items = STANCES_SEEN.map((situation, i) => ({ id: `c${i}`, key: stanceKey(situation), situation }));
  const req = l.pack(items, D[0]!, SPECIES_STANCE);
  assert.equal((req.state as { legend: string }).legend, SPECIES_STANCE.legend);
  assert.equal((req.state as { doctrine: string }).doctrine, D[0]);
  for (const q of Object.values(req.questions)) assert.deepEqual((q as { criteria: unknown }).criteria, SPECIES_STANCE.criteria);
  const own = l.contextOf(D[0]!, undefined, SPECIES_STANCE);
  assert.match(own, /^stance-v9-[0-9a-f]+$/);
  assert.equal(laneOfContext(own), "stance");
  assert.notEqual(own, l.contextOf(D[0]!));
  assert.match(l.contextOf(D[0]!, undefined, { ...SPECIES_STANCE, version: 2 }), /^stance-v2-/, "its version is in the context");
  assert.notEqual(
    own,
    l.contextOf(D[0]!, undefined, { ...SPECIES_STANCE, legend: SPECIES_STANCE.legend + "x" }),
    "the legend is in the context",
  );
  assert.notEqual(
    own,
    l.contextOf(D[0]!, undefined, { ...SPECIES_STANCE, criteria: { ...SPECIES_STANCE.criteria, defend: "defend: other" } }),
    "the criteria are",
  );
  assert.notEqual(own, l.contextOf(D[1]!, undefined, SPECIES_STANCE), "the doctrine is too");
  const raid = { c0_stance: { type: "choice" as const, choice: "raid" } };
  const defend = { c0_stance: { type: "choice" as const, choice: "defend" } };
  assert.equal(l.read(raid, "c0", SAMPLE_STANCE, "k", SPECIES_STANCE), null, "it has no raid");
  assert.equal(l.read(defend, "c0", SAMPLE_STANCE, "k", SPECIES_STANCE), "defend");
  assert.equal(l.read(raid, "c0", SAMPLE_STANCE, "k"), "raid", "the generic ant still has it");
  assert.equal(l.valid("k", "raid", SPECIES_STANCE), false);
  assert.equal(l.valid("k", "defend", SPECIES_STANCE), true);
});

test("a choice that is not the lane's is refused even when a species' criteria name it (a runtime guard behind the type)", () => {
  assert.ok(NOT_A_MODE, "the typed form of this refusal is the @ts-expect-error above");
  const rogue = { legend: "x", criteria: { rest: "rest: sit still" }, version: 1 } as unknown as LaneWords<Mode>;
  assert.equal(LANES.mode.read({ s0_mode: { type: "choice", choice: "rest" } }, "s0", SAMPLE_SITUATION, "k", rogue), null);
  const rogueStance = { legend: "x", criteria: { rest: "rest: x" }, version: 1 } as unknown as LaneWords<Stance>;
  assert.equal(LANES.stance.read({ c0_stance: { type: "choice", choice: "rest" } }, "c0", SAMPLE_STANCE, "k", rogueStance), null);
});

test("the fungus row takes no species words yet: a lane argument changes nothing", () => {
  const l = LANES.fungus;
  const s = FUNGAL_SEEN[0]!;
  const key = l.key(s, MENUS[0]!);
  const other = { legend: "x", criteria: {}, version: 3 };
  assert.deepEqual(l.pack([{ id: "h0", key, situation: s }], A[0]!, other), l.pack([{ id: "h0", key, situation: s }], A[0]!));
  assert.equal(l.contextOf(A[0]!, "top", other), l.contextOf(A[0]!, "top"));
});

test("the growth lane is the growth brain (ja-2bw.5): its 48 situations, its local rule, asked under the fungus's aim", () => {
  const l = LANES.growth;
  const all = l.all();
  assert.equal(all.length, 48);
  assert.equal(new Set(all.map((s) => l.key(s, undefined))).size, 48, "every situation has its own key");
  const items = all.slice(0, 5).map((situation, i) => ({ id: `g${i}`, key: growthKey(situation), situation }));
  for (const aim of AIMS.map((a) => a.text)) {
    assert.deepEqual(l.pack(items, aim), packGrowthRequest(items, aim));
    assert.equal(l.contextOf(aim), growthContext(aim));
    assert.ok(l.contextOf(aim).startsWith(LANE_KINDS.growth.contextPrefix));
  }
  assert.notEqual(l.contextOf(AIMS[0]!.text), l.contextOf(AIMS[1]!.text), "another aim is another cache");
  for (const s of all) assert.equal(l.local(s), localGrowthChoice(s));
  assert.equal(l.read({ g0_grow: { type: "choice", choice: "fruit" } }, "g0", all[0]!, growthKey(all[0]!)), "fruit");
  assert.equal(l.read({ g0_grow: { type: "choice", choice: "explore" } }, "g0", all[0]!, growthKey(all[0]!)), null);
  assert.ok(l.valid("", "turn") && !l.valid("", "") && !l.valid("", "left"), "the tip's own sides are not Jev's to name");
});
