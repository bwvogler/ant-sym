// Recovery assays for the existing delivery action. Scheduled interventions are
// experiment controls, not an ant's autonomous timeout or a new policy sense.
import { test } from "node:test";
import assert from "node:assert/strict";
import { Game, gameRng } from "../../game.ts";
import { CURTAIN } from "../../colony.ts";
import { body } from "../../body.ts";
import { chooseDelivery, requestedDelivery, deliveryExplanation } from "../../deliveryAction.ts";
import { port } from "../../nestWork.ts";
import { responses } from "../../responses.ts";
import { walkTunnel } from "../../tunnel.ts";
import { digCell, OPEN, ROCK, rockAt, setRock } from "../../world.ts";
import { NO_CELL } from "../../grid.ts";
import { RETURN } from "../../vocab.ts";
import { smallOne } from "../builders.ts";
import { put } from "../hexmaps.ts";

function setup(seed = 1, n = 1) {
  const g = new Game(smallOne(7), {}, gameRng(seed), [{ antCount: n, colony: { deliveryLane: 1 } }]);
  const c = g.colonies[0]!;
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

test("a filled next step is reconsidered locally without replacing the delivery role", () => {
  const { c, y } = setup();
  chooseDelivery(c, 0, "to brood");
  c.gx[0] = 24;
  c.gy[0] = y;
  setRock(c.map, 24, y, ROCK);
  c.foodTo = () => {
    throw Error("unseen chamber target");
  };
  walkTunnel(c, 0, RETURN, 0.01);
  assert.notEqual(c.gx[0], 24, "must abandon the blocked movement step");
  assert.equal(requestedDelivery(c, 0), "brood");
  assert.equal(c.carrying[0], 1);
});

test("a policy replacement recovers from an unavailable destination within a bounded assay", (t) => {
  let recovered = 0;
  for (let seed = 1; seed <= 20; seed++) {
    const { g, c, store, brood } = setup(seed);
    brood.role = "none";
    c.responses = responses({ carry: () => "to brood" });
    for (let tick = 0; tick < 30; tick++) g.tick(1 / 30);
    assert.equal(c.carrying[0], 1);
    assert.equal(brood.food, 0);
    // The harness changes doctrine after one second; the ant cannot yet sense
    // search duration. Test the recovery mechanism without claiming it can.
    c.responses = responses({ carry: () => "to store" });
    for (let tick = 0; tick < 150 && c.carrying[0]; tick++) g.tick(1 / 30);
    assert.equal(c.carrying[0], 0, `seed ${seed}`);
    assert.equal(store.food, 1);
    assert.equal(brood.food, 0);
    assert.ok(c.alive[0]);
    recovered++;
  }
  t.diagnostic(`${recovered}/20 scheduled replacements delivered within five seconds`);
});

test("feeding during a delivery consumes stock, preserves the jaw load and resumes its goal", () => {
  const { c, store, brood, y } = setup();
  chooseDelivery(c, 0, "to brood");
  c.stock(store, 2);
  c.energy[0] = 0.1;
  const before = store.food + brood.food + c.eaten + c.carrying[0];
  body(c, 1 / 30);
  assert.ok(c.energy[0] > 0.1);
  assert.ok(c.eaten > 0);
  assert.equal(c.carrying[0], 1);
  assert.equal(requestedDelivery(c, 0), "brood");
  assert.ok(Math.abs(store.food + brood.food + c.eaten + c.carrying[0] - before) < 1e-6);
  put(c, 0, 24, y);
  assert.ok(port(c, 0, 1 / 30));
  assert.ok(Math.abs(store.food + brood.food + c.eaten - before) < 1e-6);
  assert.equal(brood.food, 1);
});

test("save continuation through a blocked destination and policy replacement is deterministic", () => {
  const a = setup(11);
  a.brood.role = "none";
  a.c.responses = responses({ carry: () => "to brood" });
  for (let tick = 0; tick < 30; tick++) a.g.tick(1 / 30);
  const saved = JSON.parse(JSON.stringify(a.g.save()));
  const b = setup(11);
  b.g.load(saved);
  for (const g of [a.g, b.g]) {
    g.colonies[0]!.responses = responses({ carry: () => "to store" });
    for (let tick = 0; tick < 150; tick++) g.tick(1 / 30);
  }
  assert.deepEqual(b.g.save(), a.g.save());
});

test("reading recovery traces preserves identical subsequent random draws", () => {
  const a = setup(19),
    b = setup(19);
  for (const { c } of [a, b]) {
    chooseDelivery(c, 0, "to brood");
    c.gainMarks[0] = 0;
    c.gx[0] = NO_CELL;
    walkTunnel(c, 0, RETURN, 0.01);
  }
  for (let k = 0; k < 100; k++) deliveryExplanation(a.c, 0);
  assert.deepEqual(
    Array.from({ length: 50 }, () => a.c.rng()),
    Array.from({ length: 50 }, () => b.c.rng()),
  );
  assert.deepEqual(a.g.save(), b.g.save());
});

test("crowded one-cell passage: all carried food arrives without duplication", (t) => {
  for (const n of [1, 8, 24]) {
    const { g, c, brood, store } = setup(7, n);
    c.responses = responses({ carry: () => "to brood" });
    let ticks = 0;
    for (; ticks < 150 && c.stored < n; ticks++) g.tick(1 / 30);
    assert.equal(c.stored, n, `${n} carriers`);
    assert.equal(brood.food, n);
    assert.equal(store.food, 0);
    assert.equal(
      Array.from(c.carrying.slice(0, n)).reduce((a, b) => a + b, 0),
      0,
    );
    assert.equal(
      Array.from(c.alive.slice(0, n)).reduce((a, b) => a + b, 0),
      n,
    );
    t.diagnostic(`${n} carriers: ${ticks} ticks to deliver all food`);
  }
});
