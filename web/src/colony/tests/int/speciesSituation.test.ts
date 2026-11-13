import { test } from "node:test";
import assert from "node:assert/strict";
import { Colony, localPolicy } from "../../colony.ts";
import { MODE_CRITERIA, packModeRequest, situationKey } from "../../colonyBrain.ts";
import { Game } from "../../game.ts";
import { LANES, SAMPLE_SITUATION } from "../../lanes.ts";
import { localResponses } from "../../responses.ts";
import { defineSchema, legendOf } from "../../schema.ts";
import type { Species } from "../../species.ts";
import { MODES, SITUATION_SCHEMA, STANCES, TRAILS, type LaneWords, type Mode, type Policy, type SpeciesSituation } from "../../vocab.ts";
import { generateWorld, mulberry32 } from "../../world.ts";
import { smallOne } from "../builders.ts";

// ja-fnd.5.10's acceptance: a species asks its mode lane about its own situation. This one leaves two generic fields out (homeTrail, alarm) and adds one
// it senses itself (its age band, own body): its key, its question, the codes its ants keep and what its policy reads are all its own, and the generic
// ant's are untouched (the goldens, the schema and precache pins hold that).

const AGES = ["young", "middle", "old"] as const;
const SCHEMA = defineSchema<SpeciesSituation>([
  { name: "mode", values: MODES },
  { name: "tired", values: [false, true], key: (v) => (v ? "tired" : "fresh") },
  { name: "foodTrail", values: TRAILS },
  { name: "enemy", values: ["none", "near"] },
  { name: "stance", values: STANCES },
  { name: "age", values: AGES },
]);
const WORDS: LaneWords<Mode> = {
  legend: legendOf(SCHEMA, {
    intro: "Each key in `ants` is the situation of one worker. ",
    fields: [
      ["mode", "mode is what it is doing. "],
      ["tired", "tired says whether it is tired. "],
      ["foodTrail", "foodTrail is the food scent it smells. "],
      ["enemy", "enemy says whether strangers are near. "],
      ["stance", "stance is its own stance. "],
      ["age", "age is how old it is: young, middle or old. "],
    ],
  }),
  criteria: MODE_CRITERIA,
  version: 1,
  schema: SCHEMA,
};
const asked: SpeciesSituation[] = [];
const spy: Policy = (s) => (asked.push(s as SpeciesSituation), localPolicy(s));
const AGED: Species = {
  id: "aged",
  name: "Aged",
  params: {},
  responses: localResponses,
  lanes: { mode: WORDS },
  policy: spy,
  sense: (c, i) => ({ age: AGES[c.band(i)] }),
};

test("its schema is its own: a key and a question over its fields, the generic ant's unchanged", () => {
  const s: SpeciesSituation = { ...SAMPLE_SITUATION, age: "old" };
  assert.equal(LANES.mode.key(s, undefined, WORDS), "explore|fresh|faint|none|forage|old");
  assert.equal(LANES.mode.key(s, undefined), situationKey(SAMPLE_SITUATION), "no words: the generic key");
  const req = packModeRequest([{ id: "a0", situation: s }], "forage", WORDS) as { state: { ants: Record<string, object>; legend: string } };
  assert.deepEqual(Object.keys(req.state.ants.a0!), ["mode", "tired", "foodTrail", "enemy", "stance", "age"]);
  assert.equal(req.state.legend, WORDS.legend);
  assert.equal(LANES.mode.all!(WORDS).length, SCHEMA.size, "every situation it can be asked in");
});

test("its ants are asked about their own situation, and keep its codes", () => {
  asked.length = 0;
  const g = new Game(smallOne(7), { antCount: 40, rival: false, species: AGED }, mulberry32(1));
  for (let k = 0; k < 30 * 20; k++) g.tick(1 / 30);
  const c = g.player;
  assert.equal(c.seen.length, SCHEMA.size, "situations seen are counted over its own");
  assert.ok(c.situationsSeen > 0);
  assert.ok(asked.length > 0, "its policy was asked");
  const fields = ["mode", "tired", "foodTrail", "enemy", "stance", "age"];
  assert.ok(
    asked.every((s) => JSON.stringify(Object.keys(s)) === JSON.stringify(fields)),
    "its policy sees only its schema's fields (review of #122, D1)",
  );
  assert.ok(
    asked.every((s) => AGES.includes(s.age as (typeof AGES)[number])),
    "with its own field, in its values",
  );
  let decoded = 0;
  for (let i = 0; i < c.n; i++) {
    const q = c.lastQuestion(i);
    if (!q) continue;
    decoded++;
    assert.ok(
      q.alarm === "none" || q.alarm === "faint" || q.alarm === "strong",
      "the generic situation stays whole for the fungus and the journal (S1)",
    );
    assert.ok(q.homeTrail !== undefined);
  }
  assert.ok(decoded > 0);
  // The codes each ant keeps are consistent (review of #122, S2): its species code decodes to its mode now, and shares the sensed fields with its
  // generic last question.
  let checked = 0;
  for (let i = 0; i < c.n; i++) {
    const code = c.asked[i]!;
    const q = c.lastQuestion(i);
    if (!c.alive[i] || code < 0 || !q) continue;
    const own = SCHEMA.decode(code);
    assert.equal(own.mode, MODES[c.mode[i]!], `ant ${i}: its kept code holds its mode`);
    for (const f of ["tired", "foodTrail", "enemy", "stance"] as const) assert.equal(own[f], q[f], `ant ${i}: ${f}`);
    checked++;
  }
  assert.ok(checked > 0, "some ants hold a code");
});

test("a schema without every mode, or too big for an ant's question code, is refused", () => {
  const c = new Colony(generateWorld(1, { size: { w: 60, h: 40 } }), {}, mulberry32(1));
  assert.throws(() => c.setSituation({ schema: defineSchema<SpeciesSituation>([{ name: "tired", values: [false, true] }]) }), /mode field/);
  assert.throws(
    () => c.setSituation({ schema: defineSchema<SpeciesSituation>([{ name: "mode", values: ["explore", "return", "fight"] }]) }),
    /every mode/,
  );
  const big = Array.from({ length: 16 }, (_, k) => ({ name: `f${k}`, values: [0, 1] }));
  assert.throws(() => c.setSituation({ schema: defineSchema<SpeciesSituation>([{ name: "mode", values: MODES }, ...big]) }), /32,767/);
  c.setSituation(null);
  assert.equal(c.seen.length, 3888, "null: the generic situation again");
});

test("a species that re-declares the generic fields plays exactly as the generic ant (review of #122, S2)", () => {
  const same = defineSchema<SpeciesSituation>(SITUATION_SCHEMA.fields as never);
  const words: LaneWords<Mode> = { ...WORDS, legend: "the same fields", schema: same };
  const mirror: Species = { id: "mirror", name: "Mirror", params: {}, responses: localResponses, lanes: { mode: words } };
  const play = (species?: Species) => {
    const g = new Game(smallOne(7), species ? { antCount: 40, species } : { antCount: 40 }, mulberry32(2));
    for (let k = 0; k < 30 * 35; k++) g.tick(1 / 30);
    return g;
  };
  // and in another order (mode last: its step in the code is 1, not the generic 972), so a code built with the wrong step shows
  const reordered = defineSchema<SpeciesSituation>([...SITUATION_SCHEMA.fields.slice(1), SITUATION_SCHEMA.fields[0]!] as never);
  const shuffled: Species = { ...mirror, id: "shuffled", lanes: { mode: { ...words, schema: reordered } } };
  const generic = play();
  // What the ants do, as the golden masters compare it (the save's question codes differ by design when the fields are reordered).
  const behaviour = (g: Game) =>
    JSON.stringify(g.colonies.map((c) => [c.x, c.y, c.heading, c.mode, c.carrying, c.alive].map((a) => Array.from(a.subarray(0, c.n)))));
  for (const g of [play(mirror), play(shuffled)]) {
    assert.equal(behaviour(g), behaviour(generic));
    assert.equal(g.player.decisions, generic.player.decisions, "as many questions");
  }
  assert.ok(generic.player.decisions > 0);
});

test("a sensed value outside its field's values is refused (review of #122, nit)", () => {
  const bad: Species = { ...AGED, sense: () => ({ age: "ancient" }) };
  const g = new Game(smallOne(7), { antCount: 20, rival: false, species: bad }, mulberry32(1));
  assert.throws(() => {
    for (let k = 0; k < 30 * 5; k++) g.tick(1 / 30);
  }, /"age" is ancient/);
});

test("a species that leaves generic fields out brings its own local rule (review of #122, D1)", () => {
  assert.throws(() => new Game(smallOne(7), { antCount: 10, species: { ...AGED, policy: undefined } }, mulberry32(1)), /homeTrail, alarm/);
});
