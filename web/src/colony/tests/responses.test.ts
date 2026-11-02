import { test } from "node:test";
import assert from "node:assert/strict";
import { Colony } from "../colony.ts";
import { packResponseRequest, RESPONSE_HOOKS, responseContext } from "../colonyBrain.ts";
import { localResponses, responses, touchKey, type Touch } from "../responses.ts";
import { foodAt, mulberry32, worldFromArrays, type WorldMap } from "../world.ts";

/** A bare 40×12 field: the nest on the left, one food cell straight east of it. */
function corridor(food = 3): WorldMap {
  const size = { w: 40, h: 12 };
  const f = new Float32Array(size.w * size.h);
  f[6 * size.w + 14] = food;
  return worldFromArrays(size, [{ x: 6, y: 6.5, r: 2 }], { food: f });
}

const touch = (t: Partial<Touch>): Touch => ({ mode: "explore", carrying: "none", atNest: false, enemy: false, stance: "forage", ...t });

/** One ant heading east at the food 4 cells away, stepped until it is home with food or `seconds` pass. */
function forage(c: Colony, seconds = 20): { picked: boolean } {
  c.x[0] = 10;
  c.y[0] = 6.5;
  c.heading[0] = 0;
  let picked = false;
  for (let k = 0; k < 30 * seconds && c.stored === 0; k++) {
    c.tick(1 / 30);
    if (c.carrying[0]) picked = true;
  }
  return { picked };
}

test("localResponses are the old mechanics", () => {
  assert.equal(localResponses.get(touch({})), true);
  assert.equal(localResponses.get(touch({ mode: "fight" })), false, "not mid-fight");
  assert.equal(localResponses.carry(touch({ carrying: "food" })), "return");
  assert.equal(localResponses.drop(touch({ carrying: "food", atNest: true })), true);
  assert.equal(localResponses.drop(touch({ carrying: "food", atNest: false })), false);
  assert.equal(localResponses.trail(touch({ carrying: "food" })), "food");
  assert.equal(localResponses.trail(touch({})), "home");
  assert.equal(localResponses.alarmGain(touch({ mode: "fight" })), 0);
  assert.equal(localResponses.alarmGain(touch({})), 1);
});

test("get: an ant whose get response says no walks over food and leaves it", () => {
  const map = corridor(3);
  const c = new Colony(map, { antCount: 1, wander: 0 }, mulberry32(1));
  c.responses = responses({ get: () => false });
  const { picked } = forage(c, 10);
  assert.equal(picked, false);
  assert.equal(foodAt(map, 14, 6), 3);
});

test("drop: an ant whose drop response says no keeps its food at the nest", () => {
  const c = new Colony(corridor(3), { antCount: 1, wander: 0 }, mulberry32(1));
  c.responses = responses({ drop: () => false });
  const { picked } = forage(c, 20);
  assert.ok(picked);
  assert.equal(c.stored, 0);
  assert.equal(c.carrying[0], 1);
});

test("carry: the carry response decides the carrier's mode, and the mode policy is not asked", () => {
  let asked = 0;
  const c = new Colony(corridor(3), { antCount: 1, wander: 0 }, mulberry32(1), (s) => (asked++, s.mode));
  c.responses = responses({ carry: () => "explore" });
  c.x[0] = 14.5; // on the food cell
  c.y[0] = 6.5;
  c.heading[0] = 0;
  c.tick(1 / 30); // picks the food up
  assert.equal(c.carrying[0], 1);
  const before = asked;
  c.tick(1 / 30);
  assert.equal(c.mode[0], 0, "explore, as the carry response said");
  assert.equal(asked, before, "the mode policy is not asked while carrying");
});

test("trail: no trail laid when the response says none; double when trailRate says 2", () => {
  const quiet = new Colony(corridor(0), { antCount: 50 }, mulberry32(3));
  quiet.responses = responses({ trail: () => "none" });
  for (let k = 0; k < 60; k++) quiet.tick(1 / 30);
  assert.equal(quiet.ph.total("home"), 0);

  const once = new Colony(corridor(0), { antCount: 50 }, mulberry32(3));
  const twice = new Colony(corridor(0), { antCount: 50 }, mulberry32(3));
  twice.responses = responses({ trailRate: () => 2 });
  once.tick(1 / 30);
  twice.tick(1 / 30);
  assert.ok(Math.abs(twice.ph.total("home") - 2 * once.ph.total("home")) < 1e-3 * once.ph.total("home"));
});

test("response lanes: one question per situation, cached per hook and doctrine", () => {
  assert.equal(touchKey(touch({ carrying: "food", atNest: true })), "explore|food|nest|clear|forage");
  for (const h of RESPONSE_HOOKS) {
    const req = packResponseRequest(h, [{ id: "s0", situation: touch({}) }, { id: "s1", situation: touch({ mode: "fight", enemy: true }) }], "Gather food.");
    assert.equal(Object.keys(req.questions).length, 2, h);
    assert.notEqual(responseContext(h, "Gather food."), responseContext(h, "Fight."), "a new doctrine is a new cache");
  }
  assert.notEqual(responseContext("get", "x"), responseContext("drop", "x"), "each hook its own cache");
});
