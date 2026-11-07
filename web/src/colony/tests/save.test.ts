import { test } from "node:test";
import assert from "node:assert/strict";
import { ChunkLayer } from "../chunks.ts";
import { Game, type GameSave } from "../game.ts";
import { STRAINS } from "../fungus.ts";
import { generateSideWorld, generateWorld, mulberry32, OPEN_WORLD, type WorldMap } from "../world.ts";

// Saving a game (ja-lo8.6): run, save, restore into a game built afresh from the same world and settings, run on. The
// result must be bit-identical to the unbroken run: every typed array of every colony, every scent and map layer, the
// fungus's spores, the brood and the chambers. A field the save misses shows up here as a hash that differs.

const DT = 1 / 30;
const GARDEN = STRAINS.findIndex((s) => s.id === "garden");

function fnv(h: number, bytes: Uint8Array): number {
  for (const b of bytes) {
    h ^= b;
    h = Math.imul(h, 0x01000193);
  }
  return h;
}

/** A hash of everything the sim holds that can be read from outside. */
function hashGame(g: Game): string {
  let h = 0x811c9dc5;
  const view = (a: ArrayBufferView) => (h = fnv(h, new Uint8Array(a.buffer, a.byteOffset, a.byteLength)));
  const text = (v: unknown) => (h = fnv(h, new TextEncoder().encode(JSON.stringify(v))));
  const layer = (l: ChunkLayer<Uint8Array | Uint16Array | Float32Array>) => l.forEach((cx, cy, a) => (view(new Int32Array([cx, cy])), view(a)));
  const walk = (o: object) => {
    for (const [, v] of Object.entries(o)) {
      if (ArrayBuffer.isView(v)) view(v);
      else if (v instanceof ChunkLayer) layer(v);
    }
  };
  text([g.time, g.strategyChoices, g.regrown, g.map.foodLeft, g.map.foodTotal, g.map.dug, g.map.filled]);
  walk(g.map);
  if (g.map.chambers) {
    layer(g.map.chambers.cell);
    text(g.map.chambers.list);
  }
  for (const c of g.colonies) {
    walk(c);
    for (const l of Object.values(c.ph.fields)) layer(l);
    text([c.stored, c.births, c.losses, c.decisions, c.larder, c.stance, c.queen, c.brood.items, c.corpses]);
  }
  layer(g.fungus.spores);
  return (h >>> 0).toString(16);
}

function build(view: "side" | "top", seed: number): Game {
  const map: WorldMap = view === "side" ? generateSideWorld(seed) : generateWorld(seed, { ...OPEN_WORLD, size: { w: 160, h: 100 } });
  return new Game(map, { antCount: 200, rivalAnts: 200, regrow: 600 }, mulberry32(seed * 7919));
}

function run(g: Game, seconds: number): void {
  for (let k = 0; k < Math.round(seconds / DT); k++) g.tick(DT);
}

for (const view of ["side", "top"] as const)
  test(`a save restored into a fresh game runs on exactly as the unbroken game (${view} view, the fungus landed)`, () => {
    const whole = build(view, 3);
    whole.land(0, GARDEN);
    run(whole, 40);
    const before = hashGame(whole);
    run(whole, 20);
    const unbroken = hashGame(whole);

    const first = build(view, 3);
    first.land(0, GARDEN);
    run(first, 40);
    assert.equal(hashGame(first), before, "the same game, the same state (the test's own check)");
    const saved = JSON.parse(JSON.stringify(first.save())) as GameSave;

    const again = build(view, 3);
    again.load(saved);
    assert.equal(hashGame(again), before, "restored: the state as saved");
    // Every field the save holds was put back: saving the restored game gives the same save, field for field (a field
    // a load drops shows here even when it changes nothing for a while).
    const resaved = JSON.parse(JSON.stringify(again.save())) as GameSave;
    for (const k of Object.keys(saved) as (keyof GameSave)[]) assert.deepEqual(resaved[k], saved[k], `save field ${k}`);
    run(again, 20);
    assert.equal(hashGame(again), unbroken, "run on: as if never saved");
    assert.ok(again.landed, "it remembers where the fungus landed");
    assert.ok(again.fungus.census(again.colonies[0]!).infected > 0);
  });

test("a save of another version is refused", () => {
  const g = build("top", 2);
  const s = g.save();
  assert.throws(() => build("top", 2).load({ ...s, version: s.version + 1 }), /version/);
});
