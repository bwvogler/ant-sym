import assert from "node:assert/strict";
import { test } from "node:test";
import { defendControl, firstResponses, oneAssay, withFirstColony, type RunSpec } from "../../experiment.ts";
import { Colony, PLANE } from "../../colony.ts";
import { localResponses, type Touch } from "../../responses.ts";
import { Game } from "../../game.ts";
import { SEEN } from "../../params.ts";
import { mulberry32 } from "../../world.ts";
import { arena, smallOne } from "../builders.ts";

for (const intent of [false, true]) {
  test(`A13 controls preserve combat settings and duration (intent=${intent})`, () => {
    const fight = Object.freeze({ rate: 0.75, alarm: 3, intent });
    const sealed = defendControl(7, true, 12, fight);
    const undefended = defendControl(7, false, 12, fight, { defendAt: Infinity });
    for (const spec of [sealed, undefended]) {
      assert.equal(spec.seed, 7);
      assert.equal(spec.seconds, 12);
      assert.deepEqual(spec.game?.fight, fight);
      assert.notEqual(spec.game?.fight, fight);
    }
    assert.equal(undefended.colonies?.[0]?.colony?.defendAt, Infinity);
    assert.notEqual(sealed.colonies?.[0]?.colony?.defendAt, Infinity);
    undefended.game!.fight!.rate = 9;
    assert.equal(sealed.game!.fight!.rate, 0.75);
    assert.equal(fight.rate, 0.75);
  });
}

test("the entrance assay only changes an unladen defender facing an enemy at the hole", () => {
  const base = oneAssay("defendHome").spec(1);
  const treatment = oneAssay("defendEntrance").spec(1);
  const colony = new Colony(arena(), { antCount: 1, maxAnts: 1 }, mulberry32(1));
  const contact = firstResponses(treatment)!.contact;
  const alarmContact = firstResponses(oneAssay("defendAlarmEntrance").spec(1))!.contact;
  const threatContact = firstResponses(oneAssay("defendThreatEntrance").spec(1))!.contact;
  const draw = colony.antDraw(0);
  const atHole: Touch = { ...colony.t, mode: "explore", stance: "forage", enemy: true, place: "hole", carrying: "none" };
  assert.equal(localResponses.contact(atHole, draw), "flee");
  assert.equal(contact(atHole, draw), "fight");
  assert.equal(alarmContact({ ...atHole, alarm: "none" }, draw), "flee");
  assert.equal(alarmContact({ ...atHole, alarm: "faint" }, draw), "fight");
  assert.equal(alarmContact({ ...atHole, alarm: "strong" }, draw), "fight");
  assert.equal(threatContact({ ...atHole, alarm: "none", odds: "even" }, draw), "flee");
  assert.equal(threatContact({ ...atHole, alarm: "none", odds: "outnumbered" }, draw), "fight");
  for (const touch of [
    { ...atHole, place: "out" },
    { ...atHole, place: "tunnel" },
    { ...atHole, carrying: "food" },
    { ...atHole, enemy: false },
  ] satisfies Touch[]) {
    assert.equal(contact(touch, draw), localResponses.contact(touch, draw));
    const withAlarm = { ...touch, alarm: "strong" } as const;
    assert.equal(alarmContact(withAlarm, draw), localResponses.contact(withAlarm, draw));
    const outnumbered = { ...touch, alarm: "none", odds: "outnumbered" } as const;
    assert.equal(threatContact(outnumbered, draw), localResponses.contact(outnumbered, draw));
  }
  assert.equal(treatment.game!.fight!.intent, true);
  assert.equal(treatment.colonies?.[1]?.responses, base.colonies?.[1]?.responses);
});

test("approach defense requires both a currently sensed entrance and alarm", () => {
  const spec = oneAssay("defendAlarmApproach").spec(1);
  const game = new Game(smallOne(1), {}, mulberry32(1), [{ antCount: 1 }, { antCount: 800 }]);
  for (const event of spec.events ?? []) if (event.kind === "call" && event.at === 0) event.run(game);
  const colony = game.colonies[0]!;
  colony.bind(PLANE);
  const contact = firstResponses(spec)!.contact;
  const draw = colony.antDraw(0);
  const approach: Touch = {
    ...colony.t,
    mode: "explore",
    stance: "forage",
    enemy: true,
    place: "out",
    carrying: "none",
    alarm: "strong",
  };
  colony.s[4] = SEEN - 1;
  assert.equal(contact(approach, draw), "flee");
  colony.s[4] = SEEN;
  assert.equal(contact({ ...approach, alarm: "none" }, draw), "flee");
  assert.equal(contact({ ...approach, carrying: "food" }, draw), "flee");
  assert.equal(contact(approach, draw), "fight");
});

// Once an assay lists its colonies (docs/game-colonies.md, #309) `sides` is ignored, so an assay that sets the first colony's params and
// responses must go through withFirstColony (review of #281): a revert to `sides` would play the local rule without a failure.
test("the royal-routing assays set the first colony's delivery lane and responses on the list, not on sides", () => {
  for (const id of ["gameRoyalDelivery", "gameRoyalRecovery"]) {
    const spec = oneAssay(id).spec(1);
    assert.equal(spec.colonies?.[0]?.colony?.deliveryLane, 1, `${id}: the first colony plays explicit delivery`);
    assert.notEqual(firstResponses(spec), undefined, `${id}: the first colony has its own responses`);
    assert.notEqual(firstResponses(spec), localResponses, `${id}: not the local rule`);
    assert.equal(spec.sides, undefined, `${id}: nothing set on sides, which a listed spec ignores`);
  }
});

test("withFirstColony patches the first colony of a listed spec and the sides of a paired one", () => {
  const mine = { ...localResponses };
  const listed: RunSpec = { seed: 1, seconds: 1, colonies: [{ antCount: 3, colony: { findNear: 2 } }, { antCount: 4 }] };
  const a = withFirstColony(listed, { colony: { deliveryLane: 1 }, responses: mine });
  assert.deepEqual(a.colonies?.[0]?.colony, { findNear: 2, deliveryLane: 1 }, "merged into the colony's own params");
  assert.equal(a.colonies?.[0]?.responses, mine);
  assert.equal(a.colonies?.[1], listed.colonies?.[1], "the second colony is untouched");
  assert.equal(a.sides, undefined);
  assert.equal(firstResponses(a), mine);
  assert.equal(listed.colonies?.[0]?.responses, undefined, "the spec it was given is not changed");

  const paired: RunSpec = { seed: 1, seconds: 1, sides: { colony: { findNear: 2 } } };
  const b = withFirstColony(paired, { colony: { deliveryLane: 1 }, responses: mine });
  assert.deepEqual(b.sides?.colony, { findNear: 2, deliveryLane: 1 });
  assert.equal(b.sides?.responses, mine);
  assert.equal(b.colonies, undefined);
  assert.equal(firstResponses(b), mine);
  assert.throws(() => withFirstColony({ seed: 1, seconds: 1, colonies: [] }, { responses: mine }), /lists no colony/);
});
