// Offline, no key: how much memory a game's chunk layers hold, and how much of it holds nothing. The endless world
// (docs/endless-world.md §7, ja-qpv.1) must grow with the ground that is awake or changed, not the ground ever touched;
// this is the baseline E4's memory soak reads. It runs the game as the page plays it (one world, gameRng(seed),
// regrowth on, Garden landed by the first colony's hole at the start, evolving) and every `every` sim seconds prints:
// the heap and the array buffers (typed arrays' memory, outside the heap) after a forced GC, and per kind of layer the chunks allocated and how many of them are bit-identical to the
// layer's empty fill (allocated but holding nothing).
//
// Kinds: "map" is every chunk layer of the plane and the curtain (rock, food, dug times, spoil…), "scent" every colony's
// pheromone channels on every layer, "other" any other chunk layer reachable from the game (the fungus, grids).
//
// Run with --expose-gc, from the repo root:
//   node --expose-gc scripts/lab/chunk-memory.mjs [ants per colony=800] [sim seconds=600] [seed=1] [every=60]
import { ChunkLayer, CHUNK_CELLS } from "../../web/src/colony/chunks.ts";
import { STRAINS } from "../../web/src/colony/fungus.ts";
import { Game, GAME_REGROW, gameRng } from "../../web/src/colony/game.ts";
import { generateOneWorld } from "../../web/src/colony/oneWorld.ts";

if (typeof globalThis.gc !== "function") throw new Error("run with node --expose-gc");
const [ants = 800, seconds = 600, seed = 1, every = 60] = process.argv.slice(2).map(Number);
const DT = 1 / 30;

const world = generateOneWorld(seed);
const game = new Game(world, { antCount: ants, rivalAnts: ants, regrow: GAME_REGROW, autoFound: false }, gameRng(seed));
game.land(
  0,
  STRAINS.findIndex((s) => s.id === "garden"),
  { evolve: true },
);

/** Whether every element of a chunk is bit-identical to the layer's empty fill. */
function blank(layer, a) {
  const e = layer.empty;
  for (let i = 0; i < a.length; i++) if (!Object.is(a[i], e)) return false;
  return true;
}

/** Every ChunkLayer reachable from `root`, each once, with the kind of the first path that reached it. */
function layers(root) {
  const seen = new Set();
  const found = new Map();
  const visit = (o, kind, depth) => {
    if (o === null || typeof o !== "object" || seen.has(o) || depth > 6) return;
    seen.add(o);
    if (o instanceof ChunkLayer) {
      found.set(o, kind);
      return;
    }
    if (ArrayBuffer.isView(o)) return;
    const values = o instanceof Map ? [...o.values()] : o instanceof Set ? [...o] : Array.isArray(o) ? o : Object.values(o);
    for (const v of values) visit(v, kind, depth + 1);
  };
  for (const m of game.layers) visit(m, "map", 0);
  for (const c of game.colonies) for (const L of c.layers) visit(L.ph.fields, "scent", 0);
  visit(game, "other", 0);
  return found;
}

function report(t) {
  globalThis.gc();
  const mem = process.memoryUsage();
  const heap = mem.heapUsed / 2 ** 20;
  const buffers = mem.arrayBuffers / 2 ** 20;
  const kinds = new Map();
  for (const [layer, kind] of layers(game)) {
    const k = kinds.get(kind) ?? { chunks: 0, blank: 0, bytes: 0 };
    layer.forEach((_, __, a) => {
      k.chunks++;
      k.bytes += a.byteLength;
      if (blank(layer, a)) k.blank++;
    });
    kinds.set(kind, k);
  }
  const parts = [...kinds].map(([kind, k]) => `${kind} ${k.chunks} chunks (${k.blank} blank), ${(k.bytes / 2 ** 20).toFixed(1)} MB`);
  console.log(`t ${String(t).padStart(4)} s: heap ${heap.toFixed(1)} MB, array buffers ${buffers.toFixed(1)} MB; ${parts.join("; ")}`);
}

console.log(`one world, seed ${seed}, ${ants} + ${ants} ants, as the page plays it; ${CHUNK_CELLS} cells a chunk`);
report(0);
const steps = Math.round(seconds / DT);
const per = Math.round(every / DT);
for (let k = 1; k <= steps; k++) {
  game.tick(DT);
  if (k % per === 0) report(Math.round(k * DT));
}
