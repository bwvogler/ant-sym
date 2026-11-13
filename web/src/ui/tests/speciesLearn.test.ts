import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import {
  defineSchema,
  Game,
  GENERIC_ANT,
  generateWorld,
  localResponses,
  MODES,
  mulberry32,
  STANCES,
  type LaneWords,
  type Mode,
  type ModeRuleText,
  type Policy,
  type Species,
  type SpeciesSituation,
} from "../../colony/index.ts";
import { ColonyJev } from "../colonyJev.ts";
import { ruleTextAgrees } from "../policyText.ts";
import { requestFor } from "../prompt.ts";

// ja-fnd.5.12 and .13: the page says what a species has and does. The client reports whether there is a stance lane at all (Details shows
// "no stance lane", not "0 stances"); a species' rule text is checked against its own rule over every situation of its schema; the request
// the Learn drawer shows is the species' own.

const SCHEMA = defineSchema<SpeciesSituation>([
  { name: "mode", values: MODES },
  { name: "tired", values: [false, true], key: (v) => (v ? "tired" : "fresh") },
  { name: "enemy", values: ["none", "near"] },
  { name: "stance", values: STANCES },
]);
const WORDS: LaneWords<Mode> = {
  legend: "A lone forager's situation. ",
  criteria: { explore: "explore: search alone", return: "return: walk home", fight: "fight: attack a stranger" },
  version: 1,
  schema: SCHEMA,
};
const lone: Policy = (s) => (s.tired ? "return" : s.enemy === "near" ? "fight" : "explore");
const TEXT: ModeRuleText = {
  rows: [
    { when: "it is tired", then: "return", test: (s) => s.tired },
    { when: "a stranger is near", then: "fight", test: (s) => s.enemy === "near" },
  ],
  otherwise: "Otherwise: search alone.",
  otherwiseMode: () => "explore",
};
const LONE: Species = {
  id: "lone",
  name: "Lone forager",
  params: {},
  responses: localResponses,
  lanes: { mode: WORDS },
  policy: lone,
  ruleText: TEXT,
};

const live = new Set<ColonyJev>();
afterEach(() => {
  for (const j of live) j.dispose();
  live.clear();
});

test("the client says whether the colonies have a stance lane at all", () => {
  for (const [species, has] of [
    [GENERIC_ANT, true],
    [LONE, false],
  ] as const) {
    const g = new Game(generateWorld(1, { size: { w: 60, h: 40 } }), { antCount: 5, rival: false, species }, mulberry32(1));
    const jev = new ColonyJev({});
    live.add(jev);
    jev.attachColonies(g.colonies, species);
    assert.equal(jev.state.stanceLane, has, species.id);
  }
});

test("a species' rule text agrees with its rule over every situation it has, and a wrong row is named", () => {
  assert.deepEqual(ruleTextAgrees(LONE), []);
  const wrong: Species = {
    ...LONE,
    ruleText: { ...TEXT, rows: [{ when: "it is tired", then: "fight", test: (s) => s.tired }, ...TEXT.rows.slice(1)] },
  };
  const out = ruleTextAgrees(wrong);
  assert.equal(out.length, SCHEMA.size / 2, "every tired situation");
  assert.match(out[0]!, /the words say fight, the rule return/);
  assert.deepEqual(ruleTextAgrees(GENERIC_ANT), [], "no rule of its own: nothing to check here (policyText.test covers the generic rows)");
});

test("the request the drawer shows for a species is its own: its legend, its fields, its choices", () => {
  const situation = { ...SCHEMA.decode(0), mode: "explore" as const };
  const req = requestFor({ lane: "mode", situation }, "forage", 1, WORDS) as unknown as {
    state: { legend: string; ants: Record<string, object> };
    questions: Record<string, { criteria: object }>;
  };
  assert.equal(req.state.legend, WORDS.legend);
  assert.deepEqual(Object.keys(Object.values(req.state.ants)[0]!), ["mode", "tired", "enemy", "stance"]);
  assert.deepEqual(Object.values(req.questions)[0]!.criteria, WORDS.criteria);
  const generic = requestFor(
    { lane: "mode", situation: { ...situation, foodTrail: "none", homeTrail: "none", alarm: "none" } },
    "forage",
  ) as unknown as {
    state: { legend: string };
  };
  assert.notEqual(generic.state.legend, WORDS.legend, "no words: the generic request");
});
