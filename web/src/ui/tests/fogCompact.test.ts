import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { centreX, centreY, CHUNK, encode, INFECTED, PLANE, type Colony, type Game } from "../../colony/index.ts";
import { Knowledge, type Source } from "../fog/knowledge.ts";
import { fogCarried, loadFog, saveFog, sensedFor } from "../fog/sources.ts";
import { record } from "../saves.ts";
import { CorpseMemory } from "../fog/corpses.ts";
import { KnownColonies } from "../fog/known.ts";
import { SensedMap, SENSED_FADE } from "../fungusSight.ts";

// The fog's memory kept small and saved (F7, ja-1ypq.7; docs/fog-of-war.md §6): a snapshot that says nothing the seed can't is dropped and read from
// the seed; one of ground changed while it was seen is kept; a save and load keep every bit.

const N = CHUNK * CHUNK;
/** What the seed makes of chunk (0, 0): not constant, so a wrong read shows. */
const generated = Uint8Array.from({ length: N }, (_, i) => (i * 7) % 251);
const BYTES = 512 + 256; // an explored chunk's bits and block times

/** A truth of one chunk, as the sim holds it (starts as the seed made it), and a source that can regenerate it. */
function world(layer = PLANE) {
  const truth = Uint8Array.from(generated);
  const source: Source = {
    name: "food",
    layer,
    at: (cx, cy) => (cx === 0 && cy === 0 ? truth : undefined),
    regen: (cx, cy) => (cx === 0 && cy === 0 ? generated : undefined),
  };
  return { truth, source };
}
const host = (x: number, y: number, layer = PLANE): Colony =>
  ({
    n: 1,
    params: { sensorDistance: 3 },
    alates: [],
    alive: Uint8Array.of(1),
    load: Float32Array.of(INFECTED),
    layer: Uint8Array.of(layer),
    x: Float32Array.of(x),
    y: Float32Array.of(y),
    holeCells: [],
  }) as unknown as Colony;
const hostAt = (gx: number, gy: number, layer = PLANE) => host(centreX(gx, gy), centreY(gy), layer);
const none = (): Colony => ({ ...host(0, 0), n: 0 }) as Colony;
const at = (gx: number, gy: number) => ((gy & 63) << 6) | (gx & 63);

/** Sense around cell (40, 40) at t = 10, then let it fade right out of the sight map (nobody is there for SENSED_FADE). */
function seenThenAway(truth: Uint8Array | null = null) {
  const w = world();
  if (truth) w.truth.set(truth);
  const s = new SensedMap();
  const k = new Knowledge(s, [w.source]);
  s.stamp([hostAt(40, 40)], 10);
  s.stamp([none()], 10 + SENSED_FADE + 5);
  return { ...w, s, k };
}

test("a snapshot equal to the seed's ground is dropped and read from the seed: bytes fall, every read is the same", () => {
  const { k } = seenThenAway();
  const cells = [at(40, 40), at(41, 40), at(38, 41)];
  const before = cells.map((i) => k.snapshot(PLANE, "food", i & 63, i >> 6));
  assert.equal(k.bytes(), BYTES + N, "held whole before");
  assert.equal(k.compact(), 1, "one chunk checked");
  assert.equal(k.bytes(), BYTES, "the snapshot is gone: bits and times only");
  assert.deepEqual(
    cells.map((i) => k.snapshot(PLANE, "food", i & 63, i >> 6)),
    before,
    "the reads are what they were",
  );
  assert.deepEqual(
    before,
    cells.map((i) => generated[i]),
  );
  assert.equal(k.view(PLANE, 0, 0)?.snap("food"), generated, "a painter reading the chunk whole gets the seed's");
  assert.equal(k.compact(), 0, "nothing left to check");
});

test("a snapshot of ground changed while it was seen is kept: it is what the fungus saw", () => {
  const w = world();
  w.truth[at(40, 40)] = 99; // eaten, dug: changed before the host senses it
  const s = new SensedMap();
  const k = new Knowledge(s, [w.source]);
  s.stamp([hostAt(40, 40)], 10);
  s.stamp([none()], 10 + SENSED_FADE + 5);
  k.compact();
  assert.equal(k.bytes(), BYTES + N, "kept: it differs from the seed on an explored cell");
  assert.equal(k.compact(), 0, "and not checked again until it is sensed again");
  assert.equal(k.snapshot(PLANE, "food", 40, 40), 99);
  // What the truth does later, out of sight, is not shown either way.
  w.truth[at(40, 40)] = 5;
  assert.equal(k.snapshot(PLANE, "food", 40, 40), 99);
});

test("only the explored cells decide: a cell never sensed that differs from the seed does not keep the snapshot", () => {
  const w = world();
  w.truth[at(10, 10)] = 77; // far from the host: never sensed, so never copied
  const s = new SensedMap();
  const k = new Knowledge(s, [w.source]);
  s.stamp([hostAt(40, 40)], 10);
  s.stamp([none()], 10 + SENSED_FADE + 5);
  k.compact();
  assert.equal(k.bytes(), BYTES, "dropped");
});

test("a chunk an observer senses now, or sensed lately, is not compacted", () => {
  const w = world();
  const s = new SensedMap();
  const k = new Knowledge(s, [w.source]);
  s.stamp([hostAt(40, 40)], 10);
  assert.equal(k.compact(), 0, "live");
  s.stamp([none()], 14);
  assert.equal(k.compact(), 0, "just left: its marks have not faded");
  assert.equal(k.bytes(), BYTES + N);
  s.stamp([none()], 10 + SENSED_FADE + 5);
  assert.equal(k.compact(), 1);
});

test("a dropped snapshot comes back whole when the chunk is sensed again, and the cells not sensed this time read as they did", () => {
  const { k, s, truth } = seenThenAway();
  k.compact();
  assert.equal(k.bytes(), BYTES);
  truth[at(60, 40)] = 200; // changed while away
  s.stamp([hostAt(60, 40)], 100);
  assert.equal(k.snapshot(PLANE, "food", 60, 40), 200, "the cell sensed now is as it is now");
  assert.equal(k.snapshot(PLANE, "food", 40, 40), generated[at(40, 40)], "the cell sensed before reads as it did, not as nothing");
  assert.equal(k.snapshot(PLANE, "food", 41, 40), generated[at(41, 40)]);
  assert.equal(k.bytes(), BYTES + N, "held again");
});

test("a source with no regen is never dropped", () => {
  const w = world();
  const s = new SensedMap();
  const k = new Knowledge(s, [{ name: "food", layer: PLANE, at: w.source.at }]);
  s.stamp([hostAt(40, 40)], 10);
  s.stamp([none()], 10 + SENSED_FADE + 5);
  assert.equal(k.compact(), 0);
  assert.equal(k.bytes(), BYTES + N);
});

test("a layer that comes after the knowledge was made is remembered too, when the sources are asked by layer", () => {
  const asked: number[] = [];
  const w1 = world(1);
  const s = new SensedMap();
  const k = new Knowledge(s, (layer) => {
    asked.push(layer);
    return layer === 1 ? [w1.source] : [];
  });
  s.stamp([hostAt(40, 40, 1)], 10);
  assert.equal(k.snapshot(1, "food", 40, 40), generated[at(40, 40)], "a curtain founded after the page began has its snapshot");
  s.stamp([hostAt(41, 40, 1)], 11);
  assert.deepEqual(asked, [1], "asked once for the layer");
});

/** JSON, as a stored save goes. */
const json = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

test("a saved fog loads bit for bit: bits, times, held and dropped snapshots, and what is read", () => {
  const { k, s, truth } = seenThenAway();
  truth[at(50, 50)] = 123;
  s.stamp([hostAt(50, 50)], 200); // a second sensing of the chunk: some cells as changed
  s.stamp([none()], 200 + SENSED_FADE + 5);
  const saved = json(k.save());

  const w2 = world();
  const s2 = new SensedMap();
  const k2 = new Knowledge(s2, [w2.source]);
  k2.load(saved);
  assert.deepEqual(json(k2.save()), saved, "saving what was loaded gives the same");
  assert.equal(k2.bytes(), k.bytes());
  assert.equal(k2.chunks(PLANE), k.chunks(PLANE));
  for (const [gx, gy] of [
    [40, 40],
    [50, 50],
    [51, 50],
    [10, 10],
  ] as const) {
    assert.equal(k2.explored(PLANE, gx, gy), k.explored(PLANE, gx, gy));
    assert.equal(k2.lastSeen(PLANE, gx, gy), k.lastSeen(PLANE, gx, gy));
    assert.equal(k2.snapshot(PLANE, "food", gx, gy), k.snapshot(PLANE, "food", gx, gy), `snapshot at ${gx}, ${gy}`);
  }
  assert.equal(k2.state(PLANE, 40, 40), 1, "remembered, not live: nothing senses it after a load");

  // dropped snapshots are saved as dropped: they load as dropped and read from the seed
  const compacted = seenThenAway();
  compacted.k.compact();
  const k3 = new Knowledge(new SensedMap(), [world().source]);
  k3.load(json(compacted.k.save()));
  assert.equal(k3.bytes(), BYTES);
  assert.equal(k3.snapshot(PLANE, "food", 40, 40), generated[at(40, 40)]);
});

test("the colonies known and the corpses remembered save and load as they were", () => {
  const known = new KnownColonies<{ n: number }>(() => ({ n: 3 }));
  const sensed = new SensedMap();
  const knowledge = new Knowledge(sensed, []);
  const colony = { ...host(0, 0), holeCells: [], params: { nest: 0, sensorDistance: 3 } } as unknown as Colony;
  known.update({ time: 5, colonies: [colony], layers: [] } as unknown as Game, knowledge);
  assert.deepEqual(known.get(0), { readout: { n: 3 }, asOf: 5, live: true });
  const known2 = new KnownColonies<{ n: number }>(() => ({ n: 0 }));
  known2.load(json(known.save()));
  assert.deepEqual(known2.get(0), known.get(0));
  assert.deepEqual(known2.list(), [0]);

  // A corpse needs a game to be seen; this is the shape a save holds: per layer, the cells' corpses.
  const corpses = new CorpseMemory();
  corpses.load(json(encode({ layers: [[PLANE, [[7, [{ x: 3, y: 4, stage: 2 }]]]]] })));
  assert.deepEqual([...corpses.on(PLANE)], [{ x: 3, y: 4, heading: undefined, stage: 2 }]);
  const again = new CorpseMemory();
  again.load(json(corpses.save()));
  assert.deepEqual([...again.on(PLANE)], [...corpses.on(PLANE)]);
});

test("a snapshot of ground changed to a value above the seed's is kept as well as one below it", () => {
  for (const v of [generated[at(40, 40)]! - 30, generated[at(40, 40)]! + 30]) {
    const { k } = seenThenAway(Uint8Array.from(generated, (g, i) => (i === at(40, 40) ? v : g)));
    k.compact();
    assert.equal(k.bytes(), BYTES + N, `kept at ${v}`);
    assert.equal(k.snapshot(PLANE, "food", 40, 40), v);
  }
});

test("reading a dropped chunk regenerates it once for each source, not once for each read", () => {
  const calls: Record<string, number> = { rock: 0, food: 0 };
  const source = (name: "rock" | "food"): Source => {
    const truth = Uint8Array.from(generated);
    return {
      name,
      layer: PLANE,
      at: (cx, cy) => (cx === 0 && cy === 0 ? truth : undefined),
      regen: (cx, cy) => (cx === 0 && cy === 0 ? (calls[name]!++, generated) : undefined),
    };
  };
  const s = new SensedMap();
  const k = new Knowledge(s, [source("rock"), source("food")]);
  s.stamp([hostAt(40, 40)], 10);
  s.stamp([none()], 10 + SENSED_FADE + 5);
  k.compact();
  assert.equal(k.bytes(), BYTES, "both snapshots dropped");
  const checked = { ...calls };
  // a painter reads rock, then food, then rock again, for each cell of the chunk
  for (let i = 0; i < 300; i++) for (const name of ["rock", "food", "rock"]) k.snapshot(PLANE, name, 40 + (i % 3), 40);
  for (const name of ["rock", "food"]) k.view(PLANE, 0, 0)?.snap(name);
  assert.equal(calls.rock! - checked.rock!, 1, "rock regenerated once for all those reads");
  assert.equal(calls.food! - checked.food!, 1, "food regenerated once for all those reads");
});

/** What `record` and the page's save and load carry, with the pieces the page uses. */
const fakeGame = { layers: [] } as unknown as Game;

test("a save made while the builder has the fog suspended still carries it", () => {
  const sensed = sensedFor(fakeGame, true);
  sensed.knowledge!.load(seenThenAway().k.save());
  sensed.suspended = true;
  assert.equal(sensed.knowledge, null, "the page sees no fog while suspended");
  const fog = saveFog(sensed);
  assert.ok(fog, "the save has the memory the builder hides");
  const back = sensedFor(fakeGame, true);
  loadFog(back, fog);
  assert.equal(back.knowledge!.chunks(PLANE), 1);
});

test("the page's save and load carry the fog: record keeps it, a loaded game's sensed map takes it up and holds it through a stamp", () => {
  const sensed = sensedFor(fakeGame, true);
  const { k } = seenThenAway();
  sensed.knowledge!.load(k.save());
  const fog = saveFog(sensed)!;
  const rec = record(1, {} as never, {} as never, { time: 5 } as never, "", fog);
  assert.deepEqual(rec.fog, fog, "record carries the fog");
  assert.equal("fog" in record(1, {} as never, {} as never, { time: 5 } as never, ""), false, "a save without the fog has none");

  const loaded = { layers: [] } as unknown as Game;
  assert.equal(sensedFor(loaded, true).knowledge!.chunks(PLANE), 0, "a game with nothing carried starts blank");
  fogCarried.set(loaded, rec.fog!);
  const next = sensedFor(loaded, true);
  assert.equal(next.knowledge!.chunks(PLANE), 1, "the loaded game's fog is what was saved");
  next.stamp([none()], 5);
  assert.equal(next.knowledge!.chunks(PLANE), 1, "and a stamp after the load keeps it");
  assert.equal(sensedFor(loaded, false).knowledge, null, "with the fog off, nothing is taken up");
});

test("the page hands a record's fog to the game it loads and writes the fog into its saves (the two lines the pure tests cannot reach)", () => {
  const read = (f: string) => readFileSync(new URL(f, import.meta.url), "utf8");
  assert.match(read("../useColony.ts"), /g\.load\(r\.game\);\s*if \(r\.fog\) fogCarried\.set\(g, r\.fog\);/);
  assert.match(read("../../ColonyApp.tsx"), /record\([^;]*saveFog\(n\.sensed\)\)/);
});
