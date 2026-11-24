import assert from "node:assert/strict";
import { test } from "node:test";
import { CHUNK_BITS, ChunkLayer } from "../../chunks.ts";
import { saveEndless } from "../../endlessMap.ts";
import { generateEndlessWorld, type EndlessWorld } from "../../endlessWorld.ts";
import { STRAINS } from "../../fungus.ts";
import type { Layer } from "../../colony.ts";
import { Game, gameRng, GAME_REGROW } from "../../game.ts";
import { cellOf, CELL } from "../../hex.ts";
import { CHANNELS } from "../../pheromone.ts";
import { DT } from "../builders.ts";

// The memory budget (docs/endless-world.md §7, PRD §66 E4.5b, `ja-qpv.3.5`): the chunks every layer holds grow with the awake area plus the changed area, not
// with the ground a host has crossed. A host carrying the fungus walks out and back; colonies far apart on lines of their own were woken at the start and
// sleep; the chunks held at the end do not depend on how far the host went, and are about what a game that stayed home holds.
//
// Chunks are counted, not heap: `node --test` has no `--expose-gc` (run `node --expose-gc` over this file to see the heap after a collection, printed).

const SEED = 3;
const U = 140;
/** Where the far colonies are woken: the wild site nearest each of these points (world units), 20 to 30 U from the start and from each other. */
const FAR: [number, number][] = [
  [0, 3000],
  [0, -3000],
  [-3000, 0],
  [3000, 3000],
];

const scentChunks = (g: Game) =>
  g.colonies.reduce((n, c) => n + CHANNELS.reduce((s, ch) => s + ((c.layers[0] as Layer).ph?.fields[ch].count ?? 0), 0), 0);

/** A game with two start colonies and the far ones woken, and a host that walks `walkUnits` out along a row and back, then `after` seconds more. */
const gc = (globalThis as { gc?: () => void }).gc;
/** Heap and typed arrays in MB after a collection, or null without `--expose-gc`. */
const heap = (): number | null => {
  gc?.();
  return gc ? (process.memoryUsage().heapUsed + process.memoryUsage().arrayBuffers) / 1e6 : null;
};

function play(walkUnits: number, after: number) {
  const heap0 = heap();
  const world = generateEndlessWorld(SEED) as EndlessWorld;
  const g = new Game(world, { regrow: GAME_REGROW, autoFound: false }, gameRng(SEED), [{ antCount: 10 }, { antCount: 10 }]);
  g.enableSleep();
  g.land(
    0,
    STRAINS.findIndex((s) => s.id === "garden"),
    { evolve: true },
  );
  const live0 = ChunkLayer.live;
  const far: number[] = [];
  for (const [x, y] of FAR) {
    const site = world.plane.plane
      .sitesIn(x - 600, y - 600, x + 600, y + 600)
      .sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y))[0];
    assert.ok(site, `a wild site near (${x}, ${y})`);
    far.push(g.wakeSite(site, { ants: 12 }));
  }
  const c = g.colonies[0]!;
  const [x0, y0] = [c.x[0]!, c.y[0]!];
  const cells = walkUnits * U;
  let peak = 0;
  for (let leg = 0; leg < 2 && cells > 0; leg++)
    for (let s = 0; s <= cells; s += 2) {
      c.putAnt(0, 0, x0 + (leg === 0 ? s : cells - s), y0);
      c.load[0] = 1;
      g.tick(DT);
      if (s % 60 === 0) peak = Math.max(peak, ChunkLayer.live - live0);
    }
  for (let k = 0; k < Math.round(after / DT); k++) g.tick(DT);
  const m = world.plane;
  const saved = saveEndless(m) as { rock: { $chunks: unknown[] }; food: { $chunks: unknown[] } };
  const heap1 = heap();
  return {
    g,
    world,
    far,
    peak,
    live: ChunkLayer.live - live0,
    rock: m.rock.count,
    food: m.food.count,
    scent: scentChunks(g),
    changed: saved.rock.$chunks.length + saved.food.$chunks.length,
    heapMB: heap0 === null || heap1 === null ? null : Math.round(heap1 - heap0),
  };
}

type Run = ReturnType<typeof play>;
const line = (name: string, r: Run) =>
  `${name}: ${r.live} chunks held (rock ${r.rock}, food ${r.food}, scent ${r.scent}, spores ${r.g.fungus.spores.count}, quality ${r.world.plane.quality.count}, dig ${
    r.world.plane.digHeading.count + r.world.plane.dugAt.count + r.world.plane.filledAt.count
  }), peak ${r.peak}, ${r.changed} changed, this game's heap and typed arrays ${r.heapMB ?? "n/a"} MB`;

test("chunks held after a host walks 25 U and 50 U out and back are the awake area plus the changed area, whatever the distance", () => {
  const home = play(0, 250);
  const near = play(25, 30);
  const far = play(50, 30);
  for (const [n, r] of [
    ["stay home 250 s", home],
    ["25 U out and back", near],
    ["50 U out and back", far],
  ] as const)
    console.log(line(n, r));

  // the world is what the budget is for: lines of their own, a colony on each, asleep, the ground round them not held
  assert.ok(far.world.lines.length >= 4, `${far.world.lines.length} lines`);
  for (const k of far.far) {
    assert.ok(far.g.isFrozen(k), `colony ${k} sleeps`);
    const hole = (far.g.colonies[k]!.layers[0] as Layer).nest;
    cellOf(hole.x, hole.y);
    const [hx, hy] = [CELL[0]! >> CHUNK_BITS, CELL[1]! >> CHUNK_BITS];
    let held = 0;
    for (let j = -5; j <= 5; j++) for (let i = -5; i <= 5; i++) if (far.world.plane.rock.peek(hx + i, hy + j)) held++;
    console.log("held round colony", k, held);
    assert.ok(held <= 9, `${held} chunks of the 11 x 11 round sleeping colony ${k} are held`);
  }

  // not even at its peak: the chunks held while the host is far out do not grow with the ground it has crossed (a game that keeps what it crossed holds
  // about 2,300 for the 50 U walk alone, PRD §66 E4.4b)
  assert.ok(far.peak <= 1.2 * near.peak + 50, `peak ${near.peak} chunks over 25 U, ${far.peak} over 50 U`);
  // not scaling with how far it went: twice the distance holds about what the shorter walk does, layer by layer
  const about = (a: number, b: number, slack: number) => Math.abs(a - b) <= Math.max(0.2 * Math.max(a, b), slack);
  assert.ok(about(near.live, far.live, 30), `${near.live} chunks after 25 U, ${far.live} after 50 U`);
  assert.ok(about(near.rock, far.rock, 15), `rock ${near.rock}, ${far.rock}`);
  assert.ok(about(near.food, far.food, 10), `food ${near.food}, ${far.food}`);
  assert.ok(about(near.scent, far.scent, 20), `scent ${near.scent}, ${far.scent}`);
  // and about what a game that never left home holds: the awake area, plus what the walk changed
  assert.ok(
    far.live <= 1.25 * home.live + 3 * Math.max(0, far.changed - home.changed) + 30,
    `${far.live} chunks after 50 U against ${home.live} staying home`,
  );
});
