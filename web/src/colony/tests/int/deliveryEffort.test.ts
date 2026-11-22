// Recovery assays for the existing delivery action. Scheduled interventions are
// experiment controls, not an ant's autonomous timeout or a new policy sense.
import { test } from "node:test";
import assert from "node:assert/strict";
import { Game, gameRng } from "../../game.ts";
import { CURTAIN, PLANE } from "../../colony.ts";
import { touch } from "../../sense.ts";
import { putDown } from "../../dig.ts";
import { RESPONSE_HOOKS, responseKey, packResponseRequest } from "../../colonyBrain.ts";
import { ageDelivery, chooseDelivery, requestedDelivery, deliveryExplanation } from "../../deliveryAction.ts";
import { port } from "../../nestWork.ts";
import { responses } from "../../responses.ts";
import { digCell, OPEN, rockAt } from "../../world.ts";
import { RETURN } from "../../vocab.ts";
import { smallOne } from "../builders.ts";
import { put } from "../hexmaps.ts";

function setup(seed = 1, n = 1) {
  const g = new Game(smallOne(7), { antCount: n, rival: false }, gameRng(seed), { colony: { deliveryLane: 1 } });
  const c = g.player;
  c.bind(CURTAIN);
  const ch = c.map.chambers!;
  const y = ch.list[0].floorRow + 8;
  const store = ch.add(0, y, "store"),
    brood = ch.add(0, y, "brood");
  for (let x = 20; x <= 24; x++) digCell(c.map, x, y);
  ch.claim(store.id, 22, y, (x, yy) => rockAt(c.map, x, yy) === OPEN);
  ch.claim(brood.id, 24, y, (x, yy) => rockAt(c.map, x, yy) === OPEN);
  for (let i = 0; i < n; i++) {
    c.layer[i] = CURTAIN;
    c.under[i] = 1;
    c.goalKind[i] = 0;
    c.carrying[i] = 1;
    c.mode[i] = RETURN;
    put(c, i, 23, y);
    c.heading[i] = -Math.PI / 2;
  }
  c.ph.fields.store.set(22, y, 100);
  c.ph.fields.brood.set(24, y, 100);
  return { g, c, store, brood, y };
}

test("attempt effort saturates and repeated policy answers cannot restart it", () => {
  const { c } = setup();
  c.params.deliveryReconsider = 1;
  chooseDelivery(c, 0, "to brood");
  for (let k = 0; k < 20; k++) {
    ageDelivery(c, 0, 0.1);
    chooseDelivery(c, 0, k % 2 ? "take" : "to brood");
  }
  assert.equal(c.deliveryTime[0], 1);
  assert.equal(touch(c, 0, false).deliveryAttempt, "long");
  assert.equal(c.carrying[0], 1, "timeout alone never disposes of food");
  chooseDelivery(c, 0, "to store");
  assert.equal(c.deliveryTime[0], 0);
  assert.equal(touch(c, 0, false).deliveryAttempt, "brief");
});

test("surface and foreign travel pause effort; disabled tracking clears it", () => {
  const { c } = setup();
  c.params.deliveryReconsider = 1;
  chooseDelivery(c, 0, "to brood");
  ageDelivery(c, 0, 0.25);
  c.bind(PLANE);
  ageDelivery(c, 0, 10);
  assert.equal(c.deliveryTime[0], 0.25);
  c.bind(CURTAIN);
  c.goalKind[0] = 1;
  ageDelivery(c, 0, 10);
  assert.equal(c.deliveryTime[0], 0.25);
  c.params.deliveryReconsider = 0;
  ageDelivery(c, 0, 1);
  assert.equal(c.deliveryTime[0], 0);
  assert.equal(touch(c, 0, false).deliveryAttempt, "none");
});

test("release, completion and a recycled ant clear effort", () => {
  const { c, y } = setup();
  c.params.deliveryReconsider = 1;
  chooseDelivery(c, 0, "to brood");
  ageDelivery(c, 0, 1);
  putDown(c, 0);
  assert.equal(c.deliveryTime[0], 0);
  c.carrying[0] = 1;
  chooseDelivery(c, 0, "to brood");
  ageDelivery(c, 0, 1);
  put(c, 0, 24, y);
  assert.ok(port(c, 0, 0.1));
  assert.equal(c.deliveryTime[0], 0);
  c.deliveryTime[0] = 1;
  c.kill(0);
  assert.ok(c.spawn());
  assert.equal(c.deliveryTime[0], 0);
});

test("only carry gets effort in its payload and key", () => {
  const { c } = setup();
  c.params.deliveryReconsider = 1;
  chooseDelivery(c, 0, "to brood");
  const brief = { ...touch(c, 0, false) };
  ageDelivery(c, 0, 1);
  const long = { ...touch(c, 0, false) };
  for (const hook of RESPONSE_HOOKS) {
    const a = responseKey(hook, brief),
      b = responseKey(hook, long);
    assert.equal(a === b, hook !== "carry", hook);
    const request = packResponseRequest(hook, [{ id: "s0", situation: long }], "forage");
    const ants = (request.state as { ants: Record<string, object> }).ants;
    assert.equal("deliveryAttempt" in ants.s0, hook === "carry", hook);
  }
});

test("a policy uses its effort sense to recover twenty lost deliveries without a scheduled intervention", (t) => {
  for (let seed = 1; seed <= 20; seed++) {
    const { c, g, brood, store } = setup(seed);
    c.params.deliveryReconsider = 1;
    brood.role = "none";
    let longSeen = 0;
    c.responses = responses({
      carry: (t) => {
        if (t.deliveryAttempt === "long") {
          longSeen++;
          return "to store";
        }
        return t.deliveryAttempt === "none" ? "to brood" : "take";
      },
    });
    for (let tick = 0; tick < 180 && c.carrying[0]; tick++) g.tick(1 / 30);
    assert.ok(longSeen > 0, `seed ${seed} used the sense`);
    assert.equal(c.carrying[0], 0, `seed ${seed}`);
    assert.equal(store.food, 1);
    assert.equal(brood.food, 0);
    assert.ok(c.alive[0]);
  }
  t.diagnostic("20/20 lost deliveries recovered using effort-conditioned carry decisions");
});

test("a persistent policy may retain its load beyond the threshold, including while refusing drop", () => {
  const { c, g } = setup();
  c.params.deliveryReconsider = 0.25;
  c.responses = responses({ carry: () => "to brood", drop: () => false });
  for (let tick = 0; tick < 60; tick++) g.tick(1 / 30);
  assert.equal(c.carrying[0], 1);
  assert.equal(requestedDelivery(c, 0), "brood");
  assert.equal(c.deliveryTime[0], 0.25);
  assert.match(deliveryExplanation(c, 0), /long attempt/);
});

test("mid-attempt JSON continuation preserves the effort clock and policy outcome", () => {
  const a = setup(17),
    b = setup(17);
  a.c.params.deliveryReconsider = 1;
  a.brood.role = "none";
  const policy = responses({
    carry: (t) =>
      t.deliveryTarget === "brood" && t.deliveryAttempt === "long" ? "to store" : t.deliveryTarget === "none" ? "to brood" : "take",
  });
  a.c.responses = policy;
  for (let k = 0; k < 15; k++) a.g.tick(1 / 30);
  b.g.load(JSON.parse(JSON.stringify(a.g.save())));
  b.g.player.responses = policy;
  for (let k = 0; k < 100; k++) {
    a.g.tick(1 / 30);
    b.g.tick(1 / 30);
  }
  assert.deepEqual(a.g.save(), b.g.save());
});

test("carry sees only its commitment and physically recognised floor role, through fungal distortion", () => {
  const { c, store, brood, y } = setup();
  put(c, 0, 22, y);
  chooseDelivery(c, 0, "to brood");
  brood.role = "none";
  assert.equal(touch(c, 0, false).deliveryTarget, "brood", "commitment does not certify a room exists");
  assert.equal(touch(c, 0, false).deliveryPlace, "store");
  c.swapMarks[0] = 1;
  assert.equal(touch(c, 0, false).deliveryPlace, "brood");
  c.gainMarks[0] = 0;
  assert.equal(touch(c, 0, false).deliveryPlace, "none");
  c.gainMarks[0] = 1;
  c.swapMarks[0] = 0;
  store.colony = 1;
  assert.equal(touch(c, 0, false).deliveryPlace, "none", "foreign room");
  store.colony = 0;
  c.layer[0] = PLANE;
  assert.equal(touch(c, 0, false).deliveryPlace, "none", "surface cannot read curtain floor");
  assert.equal(c.cur, CURTAIN, "temporary layer restored");
  c.layer[0] = CURTAIN;
  c.params.deliveryLane = 0;
  assert.equal(touch(c, 0, false).deliveryTarget, "none");
  assert.equal(touch(c, 0, false).deliveryPlace, "none");
});

test("every carry target/place combination has a distinct key without leaking to other lanes", () => {
  const { c } = setup();
  const base = { ...touch(c, 0, false) };
  const keys = new Set<string>();
  const roles = ["none", "royal", "brood", "store", "reception"] as const;
  for (const deliveryTarget of roles)
    for (const deliveryPlace of roles) {
      const t = { ...base, deliveryTarget, deliveryPlace };
      keys.add(responseKey("carry", t));
      for (const hook of RESPONSE_HOOKS) {
        if (hook !== "carry") assert.equal(responseKey(hook, t), responseKey(hook, base));
        const request = packResponseRequest(hook, [{ id: "s0", situation: t }], "forage");
        const ant = (request.state as { ants: Record<string, object> }).ants.s0;
        for (const field of ["deliveryTarget", "deliveryPlace"]) assert.equal(field in ant, hook === "carry");
      }
    }
  assert.equal(keys.size, 25);
});

test("a policy can accept a recognised room instead of repeatedly selecting an absent role", () => {
  for (let seed = 1; seed <= 20; seed++) {
    const { c, g, store, brood, y } = setup(seed);
    brood.role = "none";
    c.params.deliveryReconsider = 0.5;
    chooseDelivery(c, 0, "to brood");
    ageDelivery(c, 0, 0.5);
    put(c, 0, 22, y);
    c.responses = responses({
      carry: (t) => (t.deliveryAttempt === "long" && t.deliveryTarget === "brood" && t.deliveryPlace === "store" ? "to store" : "take"),
    });
    for (let k = 0; k < 60 && c.carrying[0]; k++) g.tick(1 / 30);
    assert.equal(store.food, 1, `seed ${seed}`);
    assert.equal(c.carrying[0], 0);
    assert.equal(touch(c, 0, false).deliveryTarget, "none");
  }
});

test("long attempts in a tunnel exercise persistence, redirection and release without counting drops as delivery", () => {
  for (const choice of ["persist", "redirect", "release"] as const) {
    for (let seed = 1; seed <= 20; seed++) {
      const { c, g, brood, store, y } = setup(seed);
      brood.role = "none";
      store.role = "none";
      put(c, 0, 23, y);
      c.params.deliveryReconsider = 1;
      chooseDelivery(c, 0, "to brood");
      ageDelivery(c, 0, 1);
      const storedBefore = c.stored;
      const groundBefore = c.map.food.get(23, y);
      let longCalls = 0;
      c.responses = responses({
        carry: (t) => {
          if (t.deliveryPlace !== "none") return `to ${t.deliveryPlace}`;
          if (t.deliveryAttempt === "long") {
            longCalls++;
            if (choice === "release") return "put down";
            if (choice === "redirect" && t.deliveryTarget === "brood") return "to royal";
          }
          return "take";
        },
      });
      g.tick(1 / 30);
      assert.ok(longCalls > 0, `${choice} seed ${seed} exercises its long-attempt branch`);
      assert.equal(c.stored, storedBefore, "a decision is not a successful delivery");
      assert.equal(requestedDelivery(c, 0), choice === "release" ? null : choice === "redirect" ? "royal" : "brood");
      assert.equal(c.carrying[0], choice === "release" ? 0 : 1);
      assert.equal(c.map.food.get(23, y), groundBefore + (choice === "release" ? 1 : 0));
      if (choice === "persist") assert.equal(c.deliveryTime[0], 1, "persistence retains saturated effort");
      else assert.equal(c.deliveryTime[0], 0, "change or release resets effort");
    }
  }
});

test("new food waits for an enabled carry policy before scripted delivery in the pickup tick", () => {
  for (const answer of ["to brood", "take", "put down"] as const) {
    const { c, g, store, y } = setup();
    c.carrying[0] = 0;
    put(c, 0, 22, y);
    c.map.food.set(22, y, 1);
    c.map.foodLeft++;
    c.foodTo = () => store.id;
    c.gainMarks[0] = 0;
    let calls = 0;
    c.responses = responses({
      get: () => true,
      carry: () => {
        calls++;
        return answer;
      },
    });
    g.tick(1 / 30);
    assert.equal(calls, 0, "pickup follows this tick's carry stage");
    assert.equal(c.carrying[0], 1, answer);
    assert.equal(c.stored, 0, "no scripted delivery before policy sees new load");
    assert.equal(store.food, 0);
    const replay = setup();
    replay.g.load(JSON.parse(JSON.stringify(g.save())));
    replay.c.foodTo = () => store.id;
    replay.c.responses = responses({ get: () => true, carry: () => answer });
    g.tick(1 / 30);
    replay.g.tick(1 / 30);
    assert.deepEqual(g.save(), replay.g.save(), "save after pickup preserves the pending next-tick choice");
    assert.equal(calls, 1, "one ordinary carry call next tick, no extra draw");
    assert.equal(c.stored, answer === "take" ? 1 : 0);
    assert.equal(store.food, answer === "take" ? 1 : 0);
    assert.equal(c.carrying[0], answer === "to brood" ? 1 : 0);
    if (answer === "put down") assert.equal(c.map.food.get(22, y), 1);
    if (answer === "to brood") assert.equal(requestedDelivery(c, 0), "brood");
  }
});

test("lane-off and local carry preserve immediate legacy pickup delivery", () => {
  for (const lane of [0, 1]) {
    const { c, g, store, y } = setup();
    c.params.deliveryLane = lane;
    c.carrying[0] = 0;
    put(c, 0, 22, y);
    c.map.food.set(22, y, 1);
    c.map.foodLeft++;
    c.foodTo = () => store.id;
    c.responses = responses({ get: () => true, ...(lane === 0 ? { carry: () => "to brood" as const } : {}) });
    g.tick(1 / 30);
    assert.equal(c.stored, 1);
    assert.equal(store.food, 1);
    assert.equal(c.carrying[0], 0);
  }
});

// The default (params.dropRefusalLimit, 2 s) is what the page plays when a drop answer refuses (review of #281, S2): nothing else
// reads it, so every other recovery test sets its own limit.
test("with default params, two seconds of refusal at an eligible chamber release the food", () => {
  const { c, store, y } = setup();
  assert.equal(c.params.dropRefusalLimit, 2, "the default under test");
  c.responses = responses({ drop: () => false });
  c.foodTo = () => store.id;
  put(c, 0, 22, y);
  assert.equal(port(c, 0, 1.5), false, "still holding it before the limit");
  assert.equal(c.carrying[0], 1);
  assert.equal(port(c, 0, 0.5), true, "released at 2 s");
  assert.equal(c.carrying[0], 0);
});

test("repeated refusal at an eligible chamber releases food for another worker", () => {
  const { c, store, y } = setup();
  c.params.dropRefusalLimit = 0.5;
  c.responses = responses({ drop: () => false });
  c.foodTo = () => store.id;
  const before = c.map.food.get(22, y);

  put(c, 0, 22, y);
  assert.equal(port(c, 0, 0.25), false);
  assert.equal(c.carrying[0], 1);
  put(c, 0, 23, y);
  assert.equal(port(c, 0, 1), false);
  assert.equal(c.dropRefusalTime[0], 0.25, "walking away does not count as a refusal");
  put(c, 0, 22, y);
  assert.equal(port(c, 0, 0.25), true);
  assert.equal(c.carrying[0], 0);
  assert.equal(c.dropRefusalTime[0], 0);
  assert.equal(c.map.food.get(22, y), before + 1);
  assert.equal(c.stored, 0, "a loose handoff does not count as a successful delivery");
});
