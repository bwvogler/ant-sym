import { createHash } from "node:crypto";
import { test } from "node:test";
import assert from "node:assert/strict";
import { Game, gameRng } from "../../game.ts";
import { CURTAIN, PLANE } from "../../colony.ts";
import { chooseDelivery, deliveryExplanation, requestedDelivery, localDelivery } from "../../deliveryAction.ts";
import { port, becomePorter, nurse } from "../../nestWork.ts";
import { putDown } from "../../dig.ts";
import { responses } from "../../responses.ts";
import { destMark } from "../../homing.ts";
import { walkTunnel } from "../../tunnel.ts";
import { digCell, OPEN, rockAt } from "../../world.ts";
import { NO_CELL } from "../../grid.ts";
import { CELL, cellKey } from "../../hex.ts";
import { decide } from "../../decide.ts";
import { stanceStep } from "../../stance.ts";
import { AntStep } from "../../step.ts";
import { HOLD_MAX } from "../../tuning.ts";
import { EXPLORE, RETURN } from "../../vocab.ts";
import { smallOne, run } from "../builders.ts";
import { put } from "../hexmaps.ts";

function setup(seed = 7) {
  const g = new Game(smallOne(7), {}, gameRng(seed), [{ antCount: 1, colony: { deliveryLane: 1 } }]);
  const c = g.colonies[0]!;
  c.bind(CURTAIN);
  c.layer[0] = CURTAIN;
  c.under[0] = 1;
  c.goalKind[0] = 0;
  const ch = c.map.chambers!;
  const y = ch.list[0].floorRow + 8;
  const store = ch.add(0, y, "store"),
    brood = ch.add(0, y, "brood");
  for (let x = 20; x <= 24; x++) digCell(c.map, x, y);
  ch.claim(store.id, 22, y, (x, yy) => rockAt(c.map, x, yy) === OPEN);
  ch.claim(brood.id, 24, y, (x, yy) => rockAt(c.map, x, yy) === OPEN);
  c.carrying[0] = 1;
  c.mode[0] = RETURN;
  put(c, 0, 22, y);
  return { g, c, ch, store, brood, y };
}

test("explicit food destination is separate from retaining and dropping a load", () => {
  const { c, store } = setup();
  chooseDelivery(c, 0, "to store");
  chooseDelivery(c, 0, "take");
  assert.equal(requestedDelivery(c, 0), "store");
  c.responses = responses({ drop: () => false });
  assert.equal(port(c, 0, 0.1), false);
  assert.equal(c.carrying[0], 1);
  assert.equal(store.food, 0);
  assert.match(deliveryExplanation(c, 0), /keeps food/i);
  c.responses = responses({ drop: () => true });
  assert.equal(port(c, 0, 0.1), true);
  assert.equal(c.carrying[0], 0);
  assert.equal(store.food, 1);
  assert.equal(c.stored, 1);
  assert.equal(requestedDelivery(c, 0), null);
});

test("a carrier passes the wrong destination and accepts a physically reached one without a global target", () => {
  const { c, brood, y } = setup();
  chooseDelivery(c, 0, "to brood");
  c.foodTo = () => {
    throw Error("global chamber target read");
  };
  assert.equal(port(c, 0, 0.1), false);
  assert.equal(destMark(c, 0), "brood");
  put(c, 0, 23, y);
  assert.equal(port(c, 0, 0.1), false, "adjacent is not standing inside");
  put(c, 0, 24, y);
  assert.equal(port(c, 0, 0.1), true);
  assert.equal(brood.food, 1);
});

test("misleading and erased floor cues affect recognition, not the physical food accounting", () => {
  const { c, store } = setup();
  chooseDelivery(c, 0, "to brood");
  c.swapMarks[0] = 1;
  c.gainMarks[0] = 0;
  assert.equal(port(c, 0, 0.1), false);
  c.gainMarks[0] = 1;
  assert.equal(port(c, 0, 0.1), true);
  assert.equal(store.food, 1);
});

test("a changed or missing destination does not trigger a hidden chamber fallback", () => {
  const { c, store, ch } = setup();
  chooseDelivery(c, 0, "to store");
  store.role = "none";
  assert.equal(port(c, 0, 0.1), false);
  assert.equal(c.carrying[0], 1);
  store.role = "store";
  store.colony = 1;
  assert.equal(port(c, 0, 0.1), false, "foreign chamber cannot receive colony food");
  assert.equal(ch.list[0].food >= 0, true);
});

test("a chamber food pickup can be refused without changing stock or committing a porter", () => {
  const { c, store, brood, y } = setup();
  brood.role = "reception";
  c.stock(brood, 2);
  c.carrying[0] = 0;
  c.mode[0] = EXPLORE;
  c.age[0] = 0;
  put(c, 0, 24, y);
  let offers = 0;
  let take = false;
  c.responses = responses({
    get(t) {
      assert.equal(t.offered, "food");
      assert.equal(t.carrying, "none");
      offers++;
      return take;
    },
  });
  const food = c.larder + c.inJaws;
  port(c, 0, 1);
  assert.equal(offers, 1);
  assert.equal(brood.food, 2);
  assert.equal(c.carrying[0], 0);
  assert.equal(c.porter[0], 0);
  assert.equal(c.portTo[0], -1);

  take = true;
  port(c, 0, 1);
  assert.equal(offers, 2);
  assert.equal(brood.food, 1);
  assert.equal(c.carrying[0], 1);
  assert.equal(c.porter[0], 1);
  assert.notEqual(c.portTo[0], brood.id);
  assert.ok(c.portTo[0] >= 0);
  assert.equal(store.food, 0);
  assert.equal(c.larder + c.inJaws, food);
});

for (const [label, x, destinationX] of [
  ["inside", 24, 24],
  ["adjacent", 23, 24],
  ["timed out", 20, 20],
] as const) {
  test(`nurse asks before placing brood ${label}`, () => {
    const { c, brood, y } = setup();
    const egg = c.brood.add(x, y, -1);
    egg.held = 0;
    c.carrying[0] = 0;
    c.broodHeld[0] = 1;
    c.broodTo[0] = brood.id;
    put(c, 0, x, y);
    let allow = false;
    let calls = 0;
    c.responses = responses({
      drop(t) {
        assert.equal(t.carrying, "brood");
        assert.equal(t.enemy, true);
        calls++;
        return allow;
      },
    });
    if (label === "timed out") {
      nurse(c, 0, 0.1, true);
      assert.equal(calls, 0);
      c.holdT[0] = HOLD_MAX;
    }
    nurse(c, 0, 0.1, true);
    assert.equal(calls, 1);
    assert.equal(egg.held, 0);
    assert.equal(c.broodHeld[0], 1);
    assert.equal(c.broodTo[0], brood.id);
    assert.equal(brood.brood, 0);
    allow = true;
    nurse(c, 0, 0.1, true);
    assert.equal(calls, 2);
    assert.equal(egg.held, -1);
    assert.equal(egg.x, destinationX);
    assert.equal(egg.chamber, label === "timed out" ? -1 : brood.id);
    assert.equal(brood.brood, label === "timed out" ? 0 : 1);
    assert.equal(c.broodHeld[0], 0);
  });
}

test("a porter's redirected food is counted once and release ends its destination", () => {
  const { c, store } = setup();
  c.carrying[0] = 0;
  becomePorter(c, 0, store.id);
  chooseDelivery(c, 0, "to store");
  const before = c.larder + c.inJaws;
  assert.equal(port(c, 0, 0.1), true);
  assert.equal(c.larder + c.inJaws, before);
  assert.equal(c.inJaws, 0);
  assert.equal(c.stored, 0);
  c.carrying[0] = 1;
  chooseDelivery(c, 0, "to brood");
  putDown(c, 0);
  assert.equal(c.deliveryRole[0], 0);
  assert.equal(c.carrying[0], 0);
});

test("destination changes discard the old movement step; food-only and opt-in guards", () => {
  const { c } = setup();
  chooseDelivery(c, 0, "to store");
  c.gx[0] = 24;
  chooseDelivery(c, 0, "to brood");
  assert.equal(c.gx[0], NO_CELL);
  c.params.deliveryLane = 0;
  chooseDelivery(c, 0, "to store");
  assert.equal(requestedDelivery(c, 0), null);
  c.params.deliveryLane = 1;
  c.carrying[0] = 0;
  c.pellet[0] = 1;
  chooseDelivery(c, 0, "to store");
  assert.equal(requestedDelivery(c, 0), null);
});

test("the destination follows local signs at a fork, ignoring an opposite global vector", () => {
  const { c, y } = setup();
  put(c, 0, 23, y);
  c.heading[0] = 0;
  c.gx[0] = NO_CELL;
  chooseDelivery(c, 0, "to brood");
  c.ph.fields.brood.set(24, y, 100);
  c.ph.fields.store.set(22, y, 100);
  c.goalX = -1000;
  c.goalY = -1000;
  c.stallT[0] = 10000;
  assert.equal(walkTunnel(c, 0, RETURN, 0.1), true);
  assert.equal(c.gx[0], 24);
  assert.equal(c.gy[0], y);
});

// walkTunnel gives up on a cell it stamped "no tunnel" a moment ago and steers freely (open ground), but an ant going to a delivery
// destination does not: it walks the cell by the floor marks (review of #281: the `!delivering` term of that check was reached by no test).
test("a carrier on its way to a destination keeps walking a cell stamped no-tunnel; one that is not delivering gives it up", () => {
  const { c, y } = setup();
  put(c, 0, 23, y);
  c.heading[0] = 0;
  c.goalX = -1000;
  c.goalY = -1000;
  const stamp = () => {
    c.gx[0] = NO_CELL;
    c.antCell(0);
    c.noTunnel[0] = cellKey(CELL[0], CELL[1]);
  };
  chooseDelivery(c, 0, "to store");
  assert.equal(localDelivery(c, 0), true, "the ant is delivering in the first half");
  stamp();
  assert.equal(walkTunnel(c, 0, RETURN, 0.1), true, "delivering: the stamp does not send it onto open ground");
  assert.notEqual(c.gx[0], NO_CELL);
  c.params.deliveryLane = 0; // the same ant, the same stamp, no longer delivering
  assert.equal(localDelivery(c, 0), false, "and not in the second");
  stamp();
  assert.equal(walkTunnel(c, 0, RETURN, 0.1), false, "not delivering: it gives the cell up");
  assert.equal(c.gx[0], NO_CELL);
});

test("inspection is read-only and a JSON save preserves the delivery commitment", () => {
  const { c, g } = setup();
  chooseDelivery(c, 0, "to store");
  c.saveState(); // The serializer itself populates cell caches on its first read.
  const before = JSON.stringify(c.saveState());
  assert.match(deliveryExplanation(c, 0), /store/);
  const after = JSON.parse(JSON.stringify(c.saveState()));
  const prior = JSON.parse(before);
  const changed = Object.keys(after.fields).filter((k) => JSON.stringify(after.fields[k]) !== JSON.stringify(prior.fields[k]));
  assert.deepEqual(changed, [], "inspection changed fields");
  const saved = JSON.parse(JSON.stringify(g.save()));
  const fresh = setup().g;
  fresh.load(saved);
  assert.equal(fresh.colonies[0]!.deliveryRole[0], c.deliveryRole[0]);
  run(g, 1);
  run(fresh, 1);
  const hash = (v: unknown) => createHash("sha256").update(JSON.stringify(v)).digest("hex");
  assert.equal(hash(fresh.save()), hash(g.save()));
});

test("the live carry stage accepts role answers and repeated takes keep the same movement step", () => {
  const { c } = setup();
  c.responses = responses({ carry: () => "to brood" });
  const step = new AntStep();
  step.p = c.params;
  step.dt = 1 / 30;
  step.rng = () => 0.5;
  stanceStep(c, 0, step);
  assert.equal(requestedDelivery(c, 0), "brood");
  c.gx[0] = 24;
  c.responses = responses({ carry: () => "take", contact: () => "flee" });
  stanceStep(c, 0, step);
  assert.equal(c.gx[0], 24);
  step.toEnemy = 0;
  decide(c, 0, step);
  assert.equal(c.carrying[0], 1);
  assert.equal(requestedDelivery(c, 0), "brood");
  c.responses = responses({ contact: () => "drop and run" });
  decide(c, 0, step);
  assert.equal(c.carrying[0], 0);
  assert.equal(c.deliveryRole[0], 0);
});

test("a recycled slot cannot inherit a delivery destination or trace", () => {
  const { c } = setup();
  chooseDelivery(c, 0, "to store");
  c.kill(0);
  assert.ok(c.spawn());
  assert.equal(c.deliveryRole[0], 0);
  assert.equal(c.deliveryState[0], 0);
});

test("erased signs cause local search even with an irresistible home trail and a stalled vector", () => {
  const { c, y } = setup();
  chooseDelivery(c, 0, "to brood");
  put(c, 0, 23, y);
  c.heading[0] = 0;
  c.gx[0] = NO_CELL;
  c.stallT[0] = 10000;
  c.ph.fields.brood.set(24, y, 100);
  c.ph.fields.home.set(22, y, 10000);
  c.gainMarks[0] = 0;
  walkTunnel(c, 0, RETURN, 0.1);
  assert.match(deliveryExplanation(c, 0), /no destination cue/);
  assert.equal(c.carrying[0], 1);
  assert.equal(requestedDelivery(c, 0), "brood");
});

test("paired delivery forks: the goal and fungal cue swap select the deposited chamber", (t) => {
  let delivered = 0;
  for (let seed = 1; seed <= 20; seed++) {
    for (const target of ["store", "brood"] as const)
      for (const swap of [0, 1]) {
        const { c, g, store, brood, y } = setup(seed);
        put(c, 0, 23, y);
        c.heading[0] = -Math.PI / 2;
        c.responses = responses({ carry: () => (target === "store" ? "to store" : "to brood") });
        c.ph.fields.store.set(22, y, 100);
        c.ph.fields.brood.set(24, y, 100);
        for (let tick = 0; tick < 90 && c.carrying[0]; tick++) {
          c.swapMarks[0] = swap;
          g.tick(1 / 30);
        }
        const actual = swap ? (target === "store" ? brood : store) : target === "store" ? store : brood;
        assert.equal(c.carrying[0], 0, `seed ${seed}, ${target}, swap ${swap}`);
        assert.equal(actual.food, 1, `correct physical destination: seed ${seed}, ${target}, swap ${swap}`);
        delivered++;
      }
  }
  t.diagnostic(`${delivered}/80 deliveries reached the perceived destination; each cue swap reversed the physical destination`);
});

test("an explicit destination on the surface still homes to its familiar entrance first", () => {
  const { c } = setup();
  c.bind(PLANE);
  c.layer[0] = PLANE;
  c.goalKind[0] = 1;
  chooseDelivery(c, 0, "to store");
  assert.equal(requestedDelivery(c, 0), "store");
  assert.equal(localDelivery(c, 0), false);
  c.foodTo = () => {
    throw Error("unseen destination");
  };
  const s = new AntStep();
  s.p = c.params;
  s.dt = 1 / 30;
  s.carrying = true;
  decide(c, 0, s);
  assert.equal(s.goal, c.nest);
  assert.equal(c.carrying[0], 1);
});

test("an explicit delivery can turn back toward a stronger destination mark", () => {
  const { c, y } = setup();
  put(c, 0, 23, y);
  c.heading[0] = 0; // east; the store is immediately west
  chooseDelivery(c, 0, "to store");
  c.ph.fields.store.set(22, y, 100);
  c.ph.fields.store.set(24, y, 1);
  walkTunnel(c, 0, RETURN, 0.01);
  assert.equal(c.gx[0], 22, "the strongest locally sensed destination mark may be behind");
  assert.equal(c.gy[0], y);
  assert.equal(c.carrying[0], 1);
});

test("a continuing delivery step does not repeatedly reverse at each cell", () => {
  const { c, y } = setup();
  chooseDelivery(c, 0, "to store");
  put(c, 0, 23, y);
  c.gx[0] = 23;
  c.gy[0] = y;
  c.gdir[0] = 0;
  c.ph.fields.store.set(22, y, 100);
  c.ph.fields.store.set(24, y, 1);
  walkTunnel(c, 0, RETURN, 0.01);
  assert.equal(c.gx[0], 24, "a continuing path retains its no-immediate-retrace rule");
});
