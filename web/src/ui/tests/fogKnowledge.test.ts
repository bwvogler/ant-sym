import { test } from "node:test";
import assert from "node:assert/strict";
import { centreX, centreY, CHUNK, INFECTED, PLANE, type Colony, type Game } from "../../colony/index.ts";
import { GRACE, Knowledge, LIVE, REMEMBERED, type Source, UNKNOWN } from "../fog/knowledge.ts";
import { BODY_EVERY } from "../fog/observers.ts";
import { KnownColonies } from "../fog/known.ts";
import { SensedMap } from "../fungusSight.ts";

// What the fungus knows of the ground (docs/fog-of-war.md §4.2-4.4, ja-1ypq.2).

/** A truth of one Uint8 layer, a map of chunk arrays the test edits directly, as the sim does. */
function world() {
  const chunks = new Map<number, Uint8Array>();
  const at = (cx: number, cy: number) => {
    const k = cx * 1000 + cy;
    let c = chunks.get(k);
    if (!c) chunks.set(k, (c = new Uint8Array(CHUNK * CHUNK)));
    return c;
  };
  const set = (gx: number, gy: number, v: number) => (at(gx >> 6, gy >> 6)[((gy & 63) << 6) | (gx & 63)] = v);
  const get = (gx: number, gy: number) => at(gx >> 6, gy >> 6)[((gy & 63) << 6) | (gx & 63)]!;
  const source: Source = { name: "food", layer: PLANE, at };
  return { source, set, get };
}
const host = (x: number, y: number): Colony =>
  ({
    n: 1,
    params: { sensorDistance: 3 },
    alates: [],
    alive: Uint8Array.of(1),
    load: Float32Array.of(INFECTED),
    layer: Uint8Array.of(PLANE),
    x: Float32Array.of(x),
    y: Float32Array.of(y),
    holeCells: [],
  }) as unknown as Colony;
/** A host standing at cell (gx, gy). */
const hostAt = (gx: number, gy: number) => host(centreX(gx, gy), centreY(gy));
const none = (): Colony => ({ ...host(0, 0), n: 0 }) as Colony;

test("a cell is unknown until sensed, live while sensed, remembered after, and never unknown again", () => {
  const s = new SensedMap();
  const k = new Knowledge(s, []);
  assert.equal(k.state(PLANE, 40, 40), UNKNOWN);
  s.stamp([hostAt(40, 40)], 10);
  assert.equal(k.state(PLANE, 40, 40), LIVE);
  s.stamp([none()], 10 + GRACE / 2);
  assert.equal(k.state(PLANE, 40, 40), LIVE, "within the grace");
  s.stamp([none()], 10 + GRACE + 0.1);
  assert.equal(k.state(PLANE, 40, 40), REMEMBERED);
  s.stamp([none()], 500); // the sensed chunk has long been dropped
  assert.equal(k.state(PLANE, 40, 40), REMEMBERED, "explored stays after SensedMap forgets");
  assert.equal(k.state(PLANE, 200, 200), UNKNOWN, "never sensed");
});

test("a remembered cell keeps what it held when last live; a change while away is not shown, and re-entry updates it", () => {
  const w = world();
  const s = new SensedMap();
  const k = new Knowledge(s, [w.source]);
  w.set(40, 40, 7);
  s.stamp([hostAt(40, 40)], 1);
  assert.equal(k.snapshot(PLANE, "food", 40, 40), 7);
  s.stamp([none()], 10);
  w.set(40, 40, 9); // food eaten or grown while no observer is near
  assert.equal(k.state(PLANE, 40, 40), REMEMBERED);
  assert.equal(k.snapshot(PLANE, "food", 40, 40), 7, "still the last-seen value");
  s.stamp([hostAt(40, 40)], 20);
  assert.equal(k.snapshot(PLANE, "food", 40, 40), 9, "seen again");
});

test("in a chunk part live, only the live cells follow the truth; the rest keep their last sight", () => {
  const w = world();
  const s = new SensedMap();
  const k = new Knowledge(s, [w.source]);
  w.set(10, 40, 1);
  w.set(50, 40, 1);
  s.stamp([hostAt(10, 40)], 1);
  s.stamp([hostAt(50, 40)], 5); // the host walks to the other side of the same chunk
  w.set(10, 40, 2);
  w.set(50, 40, 2);
  s.stamp([hostAt(50, 40)], 6);
  assert.equal(k.snapshot(PLANE, "food", 50, 40), 2, "live: follows");
  assert.equal(k.snapshot(PLANE, "food", 10, 40), 1, "remembered, in the same chunk: frozen");
  assert.ok(k.lastSeen(PLANE, 10, 40) === 1 && k.lastSeen(PLANE, 50, 40) === 6, "last seen per block");
  assert.equal(k.lastSeen(PLANE, 200, 200), -1);
});

test("property: every remembered cell's snapshot is the truth at the step it was last sensed", () => {
  const w = world();
  const s = new SensedMap();
  const k = new Knowledge(s, [w.source]);
  let seed = 12345;
  const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  const W = 90;
  const H = 20;
  const lastLive = new Map<number, number>(); // cell -> the truth when it was last live
  let now = 0;
  let x = 10;
  for (let step = 0; step < 300; step++) {
    now += 0.25;
    for (let j = 0; j < 12; j++) w.set(Math.floor(rnd() * W), 30 + Math.floor(rnd() * H), 1 + Math.floor(rnd() * 200));
    x = Math.max(5, Math.min(W - 5, x + (rnd() - 0.5) * 6));
    s.stamp(rnd() < 0.15 ? [none()] : [hostAt(Math.round(x), 40)], now); // sometimes nobody is there
    for (let gy = 30; gy < 30 + H; gy++)
      for (let gx = 0; gx < W; gx++) if (s.sight(PLANE, gx, gy) === 1) lastLive.set(gy * 1000 + gx, w.get(gx, gy));
  }
  let checked = 0;
  for (let gy = 30; gy < 30 + H; gy++)
    for (let gx = 0; gx < W; gx++) {
      if (k.state(PLANE, gx, gy) === UNKNOWN) continue;
      checked++;
      assert.equal(k.snapshot(PLANE, "food", gx, gy), lastLive.get(gy * 1000 + gx), `(${gx}, ${gy})`);
    }
  assert.ok(checked > 200, `${checked} cells explored`);
});

test("time going back forgets everything; the grace outlasts the body's stamp interval", () => {
  const s = new SensedMap();
  const k = new Knowledge(s, []);
  s.stamp([hostAt(40, 40)], 50);
  assert.equal(k.state(PLANE, 40, 40), LIVE);
  s.stamp([none()], 3);
  assert.equal(k.state(PLANE, 40, 40), UNKNOWN);
  assert.equal(k.chunks(PLANE), 0);
  assert.ok(GRACE > BODY_EVERY, "a body cell stamped every BODY_EVERY stays live between stamps");
});

test("what it costs: 512 B of explored bits and 256 B of block times a chunk, and a snapshot of 4 KB a byte layer", () => {
  const w = world();
  const s = new SensedMap();
  const bare = new Knowledge(s, []);
  s.stamp([hostAt(40, 40)], 1);
  assert.equal(bare.chunks(PLANE), 1);
  assert.equal(bare.bytes(), 512 + 256);
  const s2 = new SensedMap();
  const withSnap = new Knowledge(s2, [w.source]);
  s2.stamp([hostAt(40, 40)], 1);
  assert.equal(withSnap.bytes(), 512 + 256 + CHUNK * CHUNK);
});

test("known colonies: by a host or by the hole; live while it holds a host, as of when the last left", () => {
  const w = world();
  const s = new SensedMap();
  const k = new Knowledge(s, [w.source]);
  const a = hostAt(40, 40);
  const b = { ...none(), params: { nest: 0 }, holeCells: [{ col: 0, row: 0, px: 120, py: 40 }] } as unknown as Colony;
  const c = none();
  let pop = 5;
  const known = new KnownColonies<number>(() => pop);
  const game = { time: 1, colonies: [a, b, c] } as unknown as Game;
  s.stamp(game.colonies, game.time);
  known.update(game, k);
  assert.deepEqual(known.list(), [0], "a host: known; the hole not sensed: not");
  assert.deepEqual(known.get(0), { readout: 5, asOf: 1, live: true });
  // The host leaves: the readout stays as it was.
  (a as { load: Float32Array }).load[0] = 0;
  pop = 9;
  game.time = 4;
  s.stamp(game.colonies, game.time);
  known.update(game, k);
  assert.deepEqual(known.get(0), { readout: 5, asOf: 1, live: false });
  // The fungus senses colony 1's hole: the nest is known, its counts are not.
  game.colonies[2] = hostAt(120, 40);
  game.time = 6;
  s.stamp(game.colonies, game.time);
  known.update(game, k);
  assert.deepEqual(known.get(1), { readout: null, asOf: 6, live: false });
  assert.deepEqual(known.list(), [0, 1, 2]);
  // Time goes back: the fog forgets, and so do the known colonies; what is sensed now is known again (the host at colony 1's hole, by the hole).
  game.time = 2;
  s.stamp(game.colonies, game.time);
  known.update(game, k);
  assert.deepEqual(known.list(), [1, 2]);
  assert.deepEqual(known.get(1), { readout: null, asOf: 2, live: false });
  assert.equal(known.get(0), null, "colony 0's host has gone: forgotten");
});
