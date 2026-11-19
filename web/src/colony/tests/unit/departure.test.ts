import { test } from "node:test";
import assert from "node:assert/strict";
import { Colony, worldFromArrays, mulberry32, SAMPLE_TOUCH, EXPLORE, FIGHT, RETURN } from "../../index.ts";
import { AntStep } from "../../step.ts";
import { enableDeparture, departureHeading, refusedFood } from "../../departure.ts";

function setup() {
  const food = new Float32Array(100).fill(10);
  const map = worldFromArrays({ w: 10, h: 10 }, [{ x: 2, y: 2, r: 1 }], { food });
  const c = new Colony(map, { antCount: 1, maxAnts: 1 }, mulberry32(1));
  const s = new AntStep();
  Object.assign(s, { p: c.params, map, mode: EXPLORE, item: "none", resp: c.responses, dt: 1 / 30, h: 0 });
  enableDeparture(c, 1);
  let calls = 0;
  s.resp = {
    ...c.responses,
    depart: () => {
      calls++;
      return "pass-by";
    },
  };
  return { c, s, calls: () => calls };
}
test("pass-by latches until contact ends; timeout cannot restart it", () => {
  const { c, s, calls } = setup();
  refusedFood(c, 0, s, SAMPLE_TOUCH);
  for (let n = 0; n < 100; n++) {
    departureHeading(c, 0, s, 1);
    refusedFood(c, 0, s, SAMPLE_TOUCH);
  }
  assert.equal(calls(), 1);
  assert.equal(c.departure!.ants[0]!.remaining, 0);
  assert.equal(departureHeading(c, 0, s, 1), 1);
  s.map.food.set(c.cellX[0]!, c.cellY[0]!, 0);
  departureHeading(c, 0, s, 1);
  assert.equal(c.departure!.ants[0], undefined);
});
test("combat, return, load, layer transfer and slot reuse cancel active departure", () => {
  const changes: ((ctx: ReturnType<typeof setup>) => void)[] = [
    ({ s }) => (s.mode = FIGHT),
    ({ s }) => (s.mode = RETURN),
    ({ s }) => (s.toEnemy = 0),
    ({ s }) => (s.fleeFrom = 0),
    ({ s }) => (s.item = "food"),
    ({ c }) => c.departure!.ants[0]!.layer--,
    ({ c }) => c.gen[0]++,
    ({ c }) => (c.alive[0] = 0),
  ];
  for (const change of changes) {
    const ctx = setup();
    refusedFood(ctx.c, 0, ctx.s, SAMPLE_TOUCH);
    change(ctx);
    assert.equal(departureHeading(ctx.c, 0, ctx.s, 2), 2);
    assert.equal(ctx.c.departure!.ants[0], undefined);
  }
});
test("fighting ants do not ask for departure; disabling discards it", () => {
  const { c, s, calls } = setup();
  s.mode = FIGHT;
  refusedFood(c, 0, s, SAMPLE_TOUCH);
  assert.equal(calls(), 0);
  enableDeparture(c, 0);
  assert.equal(c.departure, undefined);
  assert.throws(() => enableDeparture(c, NaN));
  assert.throws(() => enableDeparture(c, 3));
});
test("active action survives save/load without aliasing; loading an old save clears it", () => {
  const { c, s } = setup();
  const old = c.saveState();
  refusedFood(c, 0, s, SAMPLE_TOUCH);
  departureHeading(c, 0, s, 1);
  const saved = c.saveState(),
    other = setup();
  other.c.loadState(saved);
  assert.deepEqual(other.c.departure, c.departure);
  other.c.departure!.ants[0]!.remaining = 0;
  assert.notEqual(c.departure!.ants[0]!.remaining, 0);
  c.loadState(old);
  assert.deepEqual(c.departure!.ants, {});
});

test("a saved active pass-by continues on the identical trajectory after loading", () => {
  const original = setup(),
    restored = setup();
  refusedFood(original.c, 0, original.s, SAMPLE_TOUCH);
  restored.c.loadState(original.c.saveState());
  for (const { c } of [original, restored]) c.responses = { ...c.responses, get: () => false, depart: () => "pass-by" };
  const gains = [original.c.gainFood[0], original.c.gainHome[0], original.c.gainAlarm[0]];
  for (let n = 0; n < 10; n++) {
    original.c.tick(1 / 30);
    restored.c.tick(1 / 30);
  }
  assert.deepEqual(restored.c.saveState(), original.c.saveState());
  assert.deepEqual([original.c.gainFood[0], original.c.gainHome[0], original.c.gainAlarm[0]], gains);
});
