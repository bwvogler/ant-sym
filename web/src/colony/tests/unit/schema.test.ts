import assert from "node:assert/strict";
import test from "node:test";
import { defineSchema } from "../../schema.ts";
import { situationKey, situationState, stanceKey } from "../../colonyBrain.ts";
import { decodeSituation, encodeSituation, packSituation, SITUATIONS } from "../../colony.ts";
import { HOMES, MODES, STANCE_SCHEMA, STANCES, TRAILS, type Situation, type StanceSituation } from "../../vocab.ts";

// The situation's code, key and state as they were written by hand before they came from the schema (docs/refactor.md S4.1):
// the schema must reproduce every one of them, so no cached Jev answer is bought again.
function legacyDecode(code: number): Situation {
  let c = code;
  const stance = STANCES[c % 3]!;
  c = Math.floor(c / 3);
  const enemy = c % 2 ? "near" : "none";
  c = Math.floor(c / 2);
  const alarm = TRAILS[c % 3]!;
  c = Math.floor(c / 3);
  const homeTrail = HOMES[c % HOMES.length]!;
  c = Math.floor(c / HOMES.length);
  const foodTrail = TRAILS[c % 3]!;
  c = Math.floor(c / 3);
  const tired = c % 2 === 1;
  const mode = MODES[Math.floor(c / 2)]!;
  return { mode, tired, foodTrail, homeTrail, alarm, enemy, stance };
}
const legacyKey = (s: Situation) =>
  `${s.mode}|${s.tired ? "tired" : "fresh"}|${s.foodTrail}|${s.homeTrail}|${s.alarm}|${s.enemy}|${s.stance}`;
const legacyStanceKey = (s: StanceSituation) =>
  `${s.stance}|${s.ants}|${s.losses}|${s.enemyNearNest ? "enemy" : "clear"}|intake:${s.intake}|${s.larder}`;

test("the mode lane's schema reproduces the hand-written decode, key and state of every one of its 3,888 situations", () => {
  assert.equal(SITUATIONS, 3888);
  for (let code = 0; code < SITUATIONS; code++) {
    const s = decodeSituation(code);
    assert.deepEqual(s, legacyDecode(code));
    assert.equal(encodeSituation(s), code);
    assert.equal(situationKey(s), legacyKey(s));
    // The state keeps the fields in order: the request's bytes depend on it.
    assert.equal(JSON.stringify(situationState(s)), JSON.stringify(legacyDecode(code)));
  }
});

test("the hot path's packSituation gives the code encode gives, for every situation", () => {
  for (let code = 0; code < SITUATIONS; code++) {
    const s = decodeSituation(code);
    // Mode, enemy and stance go in as their indices, as colony.ts's tick passes them.
    const packed = packSituation(
      MODES.indexOf(s.mode),
      s.tired,
      s.foodTrail,
      s.homeTrail,
      s.alarm,
      s.enemy === "near" ? 1 : 0,
      STANCES.indexOf(s.stance),
    );
    assert.equal(packed, code);
  }
});

test("the strategist's schema has 324 views and reproduces the hand-written key of each", () => {
  assert.equal(STANCE_SCHEMA.size, 324);
  // The values the views take are the schema's fields: a value added to one would be a view no loop below reaches.
  const values = (name: string) => STANCE_SCHEMA.fields.find((f) => f.name === name)?.values;
  assert.deepEqual(values("ants"), ["few", "some", "many"]);
  assert.deepEqual(values("losses"), ["none", "some", "heavy"]);
  assert.deepEqual(values("intake"), ["none", "some", "plenty"]);
  assert.deepEqual(values("larder"), ["low", "full"]);
  assert.deepEqual(values("enemyNearNest"), [false, true]);
  let n = 0;
  for (const stance of STANCES)
    for (const ants of ["few", "some", "many"] as const)
      for (const losses of ["none", "some", "heavy"] as const)
        for (const enemyNearNest of [false, true])
          for (const intake of ["none", "some", "plenty"] as const)
            for (const larder of ["low", "full"] as const) {
              const s = { stance, ants, losses, enemyNearNest, intake, larder };
              assert.equal(stanceKey(s), legacyStanceKey(s));
              n++;
            }
  assert.equal(n, 324);
});

test("a schema numbers its situations 0 .. size − 1 with the first field most significant, and decode inverts encode", () => {
  const schema = defineSchema<{ a: "x" | "y"; b: 1 | 2 | 3 }>([
    { name: "a", values: ["x", "y"] },
    { name: "b", values: [1, 2, 3] },
  ]);
  assert.equal(schema.size, 6);
  assert.deepEqual([...schema.strides], [3, 1]);
  assert.equal(schema.encode({ a: "x", b: 1 }), 0);
  assert.equal(schema.encode({ a: "x", b: 3 }), 2);
  assert.equal(schema.encode({ a: "y", b: 1 }), 3);
  for (let c = 0; c < schema.size; c++) assert.equal(schema.encode(schema.decode(c)), c);
  assert.equal(schema.key({ a: "y", b: 2 }), "y|2");
});

test("a field's own key wording and the state's field order come from the schema", () => {
  const schema = defineSchema<{ hot: boolean; n: 1 | 2 }>([
    { name: "hot", values: [false, true], key: (v) => (v ? "hot" : "cool") },
    { name: "n", values: [1, 2] },
  ]);
  assert.equal(schema.key({ hot: true, n: 2 }), "hot|2");
  // Fields given in another order, and an extra one, still come out as the schema's two, in its order.
  const state = schema.state({ n: 1, hot: false, extra: "x" } as never);
  assert.equal(JSON.stringify(state), '{"hot":false,"n":1}');
});
