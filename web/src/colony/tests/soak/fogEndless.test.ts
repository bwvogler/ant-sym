import { test } from "node:test";
import assert from "node:assert/strict";
import { cellOf, CELL, Game, GAME_REGROW, gameRng, generateEndlessWorld, saveEndless, STRAINS, type EndlessWorld } from "../../index.ts";
import { Knowledge } from "../../../ui/fog/knowledge.ts";
import { layerSources, saveFog, loadFog, sensedFor } from "../../../ui/fog/sources.ts";
import { SENSED_FADE, SensedMap } from "../../../ui/fungusSight.ts";

// The fog on the endless world (F7, ja-1ypq.7; docs/fog-of-war.md §6, endless-world §8): a host walks 50 U out and back; what the fog holds grows with the
// ground explored in bits (512 B a chunk) and the ground changed in sight, not with the snapshots of ground the seed can make again; and a save and load
// keep the fog bit for bit.

const SEED = 3;
const U = 140;
const DT = 1 / 30;
/** Bytes of an explored chunk's bits and block times. */
const BYTES = 512 + 256;

/** `keepAll`: the control, a fog whose sources cannot regenerate, so it drops nothing. */
function walk(units: number, keepAll = false) {
  const world = generateEndlessWorld(SEED) as EndlessWorld;
  const g = new Game(world, { regrow: GAME_REGROW, autoFound: false }, gameRng(SEED), [{ antCount: 10 }, { antCount: 10 }]);
  g.land(
    0,
    STRAINS.findIndex((s) => s.id === "garden"),
    { evolve: true },
  );
  const sensed = keepAll ? new SensedMap() : sensedFor(g, true);
  if (keepAll) sensed.knowledge = new Knowledge(sensed, (l) => layerSources(g, l).map(({ name, layer, at }) => ({ name, layer, at })));
  const k = sensed.knowledge!;
  const c = g.colonies[0]!;
  const [x0, y0] = [c.x[0]!, c.y[0]!];
  const cells = units * U;
  const step = () => {
    g.tick(DT);
    sensed.stampGame(g);
  };
  for (let leg = 0; leg < 2; leg++)
    for (let s = 0; s <= cells; s += 2) {
      c.putAnt(0, 0, x0 + (leg === 0 ? s : cells - s), y0);
      c.load[0] = 1;
      step();
    }
  cellOf(x0, y0);
  return { g, world, sensed, k, c, step, row: CELL[1] as number, col: CELL[0] as number };
}

/**
 * The most a fog may hold beyond bits and block times: a snapshot of each chunk the game changed (rock 4 KB, food 16 KB), and of each written quality chunk (16 KB).
 * Snapshots are kept only where the ground the fog saw differs from the seed's, so only in chunks the game changed.
 */
function changedBound(world: EndlessWorld): number {
  const saved = saveEndless(world.plane) as { rock: { $chunks: unknown[] }; food: { $chunks: unknown[] } };
  return saved.rock.$chunks.length * 4096 + saved.food.$chunks.length * 16384 + world.plane.quality.count * 16384;
}

test("after a host walks 50 U out and back the fog holds explored bits and no snapshot of ground the seed can make again", () => {
  const { k, step, world, row, col } = walk(50);
  const chunks = k.chunks(0);
  assert.ok(chunks > 100, `${chunks} chunks explored`);
  // reads are the same before and after: sample explored cells along the walked row
  const samples: [number, number][] = [];
  for (let gx = col - 60; gx < col + 7000; gx += 411) samples.push([gx, row]);
  const seen = samples.filter(([gx, gy]) => k.explored(0, gx, gy));
  assert.ok(seen.length > 5, "sampled explored cells");
  const read = () => seen.map(([gx, gy]) => ["rock", "food", "quality"].map((n) => k.snapshot(0, n, gx, gy)));
  for (let t = 0; t < SENSED_FADE * 30 + 30; t++) step(); // the marks fade right out
  const before = read();
  const explored = k.chunks(0);
  while (k.compact(64) > 0); // the page compacts a chunk a second of sim as it plays; this is it caught up
  assert.equal(k.chunks(0), explored, "nothing explored is forgotten");
  assert.deepEqual(read(), before, "every read is what it was");
  const extra = k.bytes(0) - explored * BYTES;
  assert.ok(
    extra >= 0 && extra <= changedBound(world),
    `explored bits and block times, 768 B a chunk, and snapshots only of ground changed: ${extra} B over`,
  );
  // the control: a shorter walk with nothing droppable holds a rock and a food snapshot of every chunk walked
  const all = walk(12, true);
  assert.ok(all.k.bytes(0) >= all.k.chunks(0) * (BYTES + 4096 + 16384), `held: ${all.k.bytes(0)} B over ${all.k.chunks(0)} chunks`);
});

test("the fog saved and loaded is the same fog, bit for bit, and the chunks a host has not changed cost nothing but their bits", () => {
  const { g, k, sensed, step, world, row, col } = walk(12);
  const live = (): number => k.bytes(0);
  const heldBefore = walk(12, true).k.bytes(0); // the control: nothing droppable
  // the page's own stamps compact as it plays (nothing here calls compact until below): the walk already holds less than the control
  assert.ok(k.bytes(0) < heldBefore, `stampGame compacts: ${k.bytes(0)} B against the control's ${heldBefore} B`);
  for (let t = 0; t < SENSED_FADE * 30 + 30; t++) step(); // the marks fade right out
  while (k.compact(64) > 0);
  const extra = live() - k.chunks(0) * BYTES;
  assert.ok(
    extra >= 0 && extra <= changedBound(world),
    `compacted: bits and block times, and snapshots only of ground changed (${extra} B over)`,
  );
  assert.ok(extra < heldBefore / 2, "most of what was held is gone");

  const saved = JSON.parse(JSON.stringify(saveFog(sensed)));
  const loaded = sensedFor(g, true);
  loadFog(loaded, saved);
  assert.deepEqual(JSON.parse(JSON.stringify(saveFog(loaded))), saved, "what is saved after a load is what was loaded");
  assert.equal(loaded.knowledge!.bytes(), k.bytes());
  assert.equal(loaded.knowledge!.chunks(0), k.chunks(0));
  for (let gx = col - 40; gx < col + 1700; gx += 97) {
    assert.equal(loaded.knowledge!.explored(0, gx, row), k.explored(0, gx, row));
    for (const n of ["rock", "food", "quality"]) assert.equal(loaded.knowledge!.snapshot(0, n, gx, row), k.snapshot(0, n, gx, row));
  }
});
