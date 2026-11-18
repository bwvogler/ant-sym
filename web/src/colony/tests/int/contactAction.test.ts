import { test } from "node:test";
import assert from "node:assert/strict";
import { Colony } from "../../colony.ts";
import { decide } from "../../decide.ts";
import { responses, type Contact } from "../../responses.ts";
import { AntStep } from "../../step.ts";
import { EXPLORE, FIGHT, RETURN } from "../../vocab.ts";
import { mulberry32, worldFromArrays } from "../../world.ts";
import { nestAt, put } from "../hexmaps.ts";

function encounter(answer: Contact, loaded = false, reporting = false) {
  const map = worldFromArrays({ w: 40, h: 12 }, [nestAt(4, 6, 2)]);
  let policyCalls = 0;
  const c = new Colony(map, { antCount: 1, maxAnts: 1, wander: 0 }, mulberry32(7), () => {
    policyCalls++;
    return "explore";
  });
  put(c, 0, 20, 6);
  c.responses = responses({ contact: () => answer });
  c.carrying[0] = Number(loaded);
  c.reporting[0] = Number(reporting);
  const s = new AntStep();
  s.p = c.params;
  s.dt = 1 / 30;
  s.toEnemy = 0;
  s.carrying = loaded;
  s.reporting = reporting;
  return { c, s, calls: () => policyCalls };
}

test("an empty ant can attack a sensed stranger; its action names the local target", () => {
  const { c, s } = encounter("fight");
  decide(c, 0, s);
  assert.equal(c.mode[0], FIGHT);
  assert.equal(s.contactAction?.movement, "attack");
  assert.equal(s.contactAction?.target, "stranger");
  assert.equal(s.fleeFrom, null);
});

test("a load blocks an attack without discarding food or consulting the mode policy", () => {
  const { c, s, calls } = encounter("fight", true);
  decide(c, 0, s);
  assert.equal(c.mode[0], RETURN);
  assert.equal(c.carrying[0], 1);
  assert.equal(s.contactAction?.reason, "protect load");
  assert.equal(calls(), 0);
});

test("a reporting scout resists an attack instruction and continues its retreat", () => {
  const { c, s } = encounter("fight", false, true);
  decide(c, 0, s);
  assert.equal(c.mode[0], RETURN);
  assert.equal(c.reporting[0], 1);
  assert.equal(s.contactAction?.reason, "report home");
  assert.equal(s.fleeFrom, 0);
});

test("withdrawal keeps a carrier's load and targets home; an empty ant turns away from danger", () => {
  for (const loaded of [false, true]) {
    const { c, s } = encounter("flee", loaded);
    decide(c, 0, s);
    assert.equal(c.mode[0], RETURN);
    assert.equal(c.carrying[0], Number(loaded));
    assert.equal(s.contactAction?.target, loaded ? "home" : "stranger");
    assert.equal(s.fleeFrom, loaded ? null : 0);
  }
});

test("drop-and-run conserves food and does not repeatedly drop the same load", () => {
  const { c, s } = encounter("drop and run", true);
  const before = c.map.foodLeft + c.carrying[0];
  decide(c, 0, s);
  assert.equal(s.contactAction?.release, true);
  assert.equal(c.carrying[0], 0);
  assert.equal(c.map.foodLeft, 1);
  assert.equal(c.map.foodLeft + c.carrying[0], before);
  // The next step senses empty jaws: now retreat can turn away directly.
  s.carrying = false;
  decide(c, 0, s);
  assert.equal(s.contactAction?.release, false);
  assert.equal(s.fleeFrom, 0);
  assert.equal(c.map.foodLeft, 1);
});

test("a persistent encounter does not repeatedly flip mode policy and reset the decision", () => {
  const { c, s, calls } = encounter("flee");
  for (let k = 0; k < 30; k++) decide(c, 0, s);
  assert.equal(c.mode[0], RETURN);
  assert.equal(calls(), 1);
  // Contact disappears: the ordinary policy is consulted again.
  s.toEnemy = null;
  decide(c, 0, s);
  assert.equal(calls(), 2);
  assert.equal(c.mode[0], EXPLORE);
  assert.equal(s.contactAction, null);
  assert.equal(s.fleeFrom, null);
});

test("the shared step record clears encounter intent before processing the next ant", () => {
  const first = encounter("fight");
  decide(first.c, 0, first.s);
  const second = encounter("flee");
  first.s.toEnemy = null;
  decide(second.c, 0, first.s);
  assert.equal(first.s.contactAction, null);
  assert.equal(second.c.mode[0], EXPLORE);
});
