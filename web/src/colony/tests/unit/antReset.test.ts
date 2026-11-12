import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ANT_FIELDS, antResets } from "../../ants.ts";
import { Colony } from "../../colony.ts";
import { Game, gameRng } from "../../game.ts";
import { generateOneWorld } from "../../oneWorld.ts";

// What a newborn ant and an ant "as is" reset (docs/refactor.md S3.1, ja-fnd.4.1): every per-ant field scribbled with a value no reset produces, then
// spawn() or asIs(), then every field read back. Recorded from the hand-written resets before they moved into the field table (tests/unit/fixtures/
// antReset.json): a field that keeps the scribble is one the call does not reset, so the fixture pins which fields are reset as well as to what.

type Slot = Record<string, (number | string)[]>;
const fixture = JSON.parse(readFileSync(new URL("./fixtures/antReset.json", import.meta.url), "utf8")) as { spawn: Slot; asIs: Slot };

const make = () =>
  new Game(generateOneWorld(7, { plane: { size: { w: 160, h: 100 } } }), { antCount: 10, rivalAnts: 10, rival: false }, gameRng(7)).player;
const names = Object.keys(ANT_FIELDS);
type Arrays = Record<string, { length: number; [i: number]: number }>;
const arrays = (c: Colony) => c as unknown as Arrays;

const scribble = (c: Colony, i: number) => {
  names.forEach((k, j) => {
    const a = arrays(c)[k]!;
    const per = a.length / c.n;
    for (let q = 0; q < per; q++) a[i * per + q] = 7 + j * 0.25; // a value no reset produces
  });
};
const code = (v: number) => (Number.isNaN(v) ? "NaN" : v === Infinity ? "Infinity" : v === -Infinity ? "-Infinity" : v);
const dump = (c: Colony, i: number): Slot => {
  const o: Slot = {};
  for (const k of names) {
    const a = arrays(c)[k]!;
    const per = a.length / c.n;
    o[k] = Array.from({ length: per }, (_, q) => code(a[i * per + q]!));
  }
  return o;
};

test("spawn resets exactly the fields it always has, to the values it always gave", () => {
  const c = make();
  const i = c.alive.indexOf(0);
  for (let k = 0; k < c.n; k++) c.alive[k] = k === i ? 0 : 1;
  scribble(c, i);
  c.alive[i] = 0;
  c.spawn();
  assert.deepEqual(dump(c, i), fixture.spawn);
});

test("asIs resets exactly the fields it always has, to the values it always gave", () => {
  const c = make();
  scribble(c, 3);
  c.asIs(3);
  assert.deepEqual(dump(c, 3), fixture.asIs);
});

test("the table says what asIs and spawn reset: asIs by hand (it runs for every healthy host each step), checked against the table here", () => {
  const c = make();
  const params = { odour: c.params.odour, tolerance: c.params.tolerance, routeStep: c.params.routeStep, routeMax: c.params.routeMax };
  // asIs: the fields the table marks "asIs", to their reset values, and nothing else changes.
  scribble(c, 5);
  const before = dump(c, 5);
  c.asIs(5);
  const after = dump(c, 5);
  const changed = names.filter((k) => JSON.stringify(before[k]) !== JSON.stringify(after[k])).sort();
  assert.deepEqual(
    changed,
    antResets(params, true)
      .map(([k]) => k)
      .sort(),
    "asIs changes exactly the fields the table marks asIs",
  );
  for (const [k, v] of antResets(params, true)) assert.deepEqual(after[k], [code(Math.fround(v))], `${k} goes back to ${v}`);
  // The asIs fields are a subset of spawn's.
  const spawn = new Set(antResets(params).map(([k]) => k));
  for (const [k] of antResets(params, true)) assert.ok(spawn.has(k), `${k} is reset by spawn too`);
});

test("a newborn's resets follow the colony's parameters: routeGap and tolerance away from the defaults", () => {
  const g = new Game(
    generateOneWorld(7, { plane: { size: { w: 160, h: 100 } } }),
    { antCount: 10, rivalAnts: 10, rival: false },
    gameRng(7),
    { colony: { routeStep: 5, tolerance: 0.2 } },
  );
  const c = g.player;
  const i = c.alive.indexOf(0);
  scribble(c, i);
  c.alive[i] = 0; // (the scribble made it alive)
  c.spawn();
  assert.equal(c.routeGap[i], 5, "routeGap starts at the colony's routeStep");
  assert.ok(Math.abs(c.tolerance[i]! - 0.2) < 1e-6, "tolerance at the colony's");
});
