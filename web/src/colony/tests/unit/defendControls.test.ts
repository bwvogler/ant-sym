import assert from "node:assert/strict";
import { test } from "node:test";
import { defendControl, oneAssay } from "../../experiment.ts";
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
    assert.equal(undefended.sides?.colony?.defendAt, Infinity);
    assert.notEqual(sealed.sides?.colony?.defendAt, Infinity);
    undefended.game!.fight!.rate = 9;
    assert.equal(sealed.game!.fight!.rate, 0.75);
    assert.equal(fight.rate, 0.75);
  });
}

test("the entrance assay only changes an unladen defender facing an enemy at the hole", () => {
  const base = oneAssay("defendHome").spec(1);
  const treatment = oneAssay("defendEntrance").spec(1);
  const colony = new Colony(arena(), { antCount: 1, maxAnts: 1 }, mulberry32(1));
  const contact = treatment.sides!.responses!.contact;
  const alarmContact = oneAssay("defendAlarmEntrance").spec(1).sides!.responses!.contact;
  const threatContact = oneAssay("defendThreatEntrance").spec(1).sides!.responses!.contact;
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
  assert.equal(treatment.sides!.rivalResponses, base.sides!.rivalResponses);
});

test("approach defense requires both a currently sensed entrance and alarm", () => {
  const spec = oneAssay("defendAlarmApproach").spec(1);
  const game = new Game(smallOne(1), { antCount: 1 }, mulberry32(1));
  for (const event of spec.events ?? []) if (event.kind === "call" && event.at === 0) event.run(game);
  const colony = game.player;
  colony.bind(PLANE);
  const contact = spec.sides!.responses!.contact;
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
