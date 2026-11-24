// The endless plane as a WorldMap (docs/endless-world.md §2-§3, PRD §66 E6.0.1, `ja-qpv.7`), pure: a map whose rock and food layers generate each
// chunk on its first touch from an EndlessPlane (endlessPlane.ts), so the map has no edge and holds only the chunks in use. Nothing plays on it
// yet; E6.0.2 (`ja-qpv.8`) fixes the places the colony assumes an edge, E6.0.3 builds the game over it.
//
// What the map's fields mean here:
//   endless   true. rockAt, inBounds, clampCol and disc read the layers at any coordinate, negative too (world.ts); no cell is "off the map".
//   size, x0  a nominal box the size of the chunk key's range (±ENDLESS_HALF cells), never a bound. Code not yet taught the flag sees a huge box
//             rather than NaN; it must not be trusted to window (E6.0.2's list).
//   foodTotal the food generated so far (each chunk counts once, by key, in the FoodLedger, however often it is dropped and generated again)
//   foodLeft  foodTotal less what the game took (takeFoodCell) plus what it added (dropFood). Both move as chunks generate, so they are running
//             totals, not the world's: a reader wanting a stable denominator asks `plane.foodWithin` (the fixed disc the generator places).
//   quality   a layer reading 1 (the plane has no quality yet); a write (honeydew, sugar) is kept per chunk like any other.
//   nest(s)   the plane's two start nests; hasSoil false (the plane has none).
// Writes land in the chunk arrays (dig, takeFoodCell, fillCell, setRock all go through the layers). A chunk read and never written is the
// plane's own, so `dropClean` frees it and it comes back identical; a changed one is the delta and is kept (dropping it would bring the food
// eaten back and make foodLeft wrong).

import { chunkKey, CHUNK, ChunkLayer, type Cells } from "./chunks.ts";
import { encode, fillLayer, type SavedChunks } from "./save.ts";
import { EndlessPlane, type EndlessOptions, type PlaneChunk } from "./endlessPlane.ts";
import { FoodLedger } from "./foodLedger.ts";
import { editLayers, type WorldMap } from "./world.ts";

/**
 * Half the nominal box, in cells: the chunk key's range (chunks.ts chunkKey, ±32,768 chunks). Past it chunk keys alias (chunk (32768, 0) and chunk
 * (-32768, 1) share a key) and the food ledger throws: it is a limit of correctness, 2,097,152 cells from the origin, not an edge the map draws
 * (ja-qpv.8 owns widening the key; an ant would have to walk that far).
 */
export const ENDLESS_HALF = 32768 * CHUNK;

/** A map with no edge, and the plane and ledger behind it. */
export interface EndlessMap extends WorldMap {
  endless: true;
  quality: ChunkLayer<Float32Array>;
  plane: EndlessPlane;
  ledger: FoodLedger;
  /**
   * Called with a chunk's food when it is first generated in this map's life (never again for a chunk dropped and generated again), so a reader
   * that keeps a list of the food (the game's regrowth piles, game.ts) learns of each chunk as it is made. Run inside the generator: do not read the map's food.
   */
  foodHooks: ((cx: number, cy: number, food: Float32Array) => void)[];
}

/** The map over the endless plane of `seed`; `opts` are the plane's (endlessPlane.ts). Chunks generate as they are read. */
export function generateEndlessPlane(seed: number, opts: Partial<EndlessOptions> = {}): EndlessMap {
  const plane = new EndlessPlane(seed, opts);
  const ledger = new FoodLedger();
  const starts = plane.startNests();
  // One plane.chunk() makes a chunk's rock and food together; whichever layer asks first leaves the other's half here (bounded: a layer
  // that never asks for it must not hold the world).
  // Each entry is kept until BOTH layers have taken their half (else a layer asking second would make the chunk again: 70 ms with food patches).
  const pending = new Map<number, { chunk: PlaneChunk; rock: boolean; food: boolean }>();
  const made = (cx: number, cy: number, half: "rock" | "food"): PlaneChunk => {
    const k = chunkKey(cx, cy);
    let have = pending.get(k);
    if (!have) {
      if (pending.size >= 256) pending.clear();
      have = { chunk: plane.chunk(cx, cy), rock: false, food: false };
      pending.set(k, have);
    }
    have[half] = true;
    if (have.rock && have.food) pending.delete(k);
    return have.chunk;
  };
  const rock = new ChunkLayer<Uint8Array>(
    (n) => new Uint8Array(n),
    1,
    (cx, cy, a) => a.set(made(cx, cy, "rock").rock),
  );
  const map: EndlessMap = {
    endless: true,
    size: { w: 2 * ENDLESS_HALF, h: 2 * ENDLESS_HALF },
    x0: -ENDLESS_HALF,
    seed,
    rock,
    food: new ChunkLayer<Float32Array>((n) => new Float32Array(n), 0),
    quality: new ChunkLayer<Float32Array>((n) => new Float32Array(n), 1),
    nest: starts[0],
    nests: [...starts],
    foodTotal: 0,
    foodLeft: 0,
    dug: 0,
    filled: 0,
    hasSoil: false,
    ...editLayers(),
    plane,
    ledger,
    foodHooks: [],
  };
  // The food layer's generator writes the map's totals, so it is made once the map exists.
  map.food = new ChunkLayer<Float32Array>(
    (n) => new Float32Array(n),
    0,
    (cx, cy, a) => {
      const f = made(cx, cy, "food").food;
      a.set(f);
      let sum = 0;
      for (let i = 0; i < f.length; i++) sum += f[i]!;
      // a chunk dropped and generated again adds nothing the second time
      if (ledger.generated("food", chunkKey(cx, cy), sum)) {
        map.foodTotal += sum;
        map.foodLeft += sum;
        for (const hook of map.foodHooks) hook(cx, cy, f);
      }
    },
  );
  return map;
}

/** Whether `map` is an endless plane map. */
export function isEndless(map: WorldMap): map is EndlessMap {
  return map.endless === true;
}

function unchanged(a: Cells | undefined, b: ArrayLike<number>): boolean {
  if (a === undefined) return true;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/**
 * Free chunk (cx, cy) of every layer if no layer holds a change to it (a cell dug, food eaten or added, a quality set, a heading or time
 * noted): it will be generated again the same. A chunk with a change is the delta and stays. Returns whether it was freed. Costs one
 * regeneration of the chunk, so call it when a region goes to sleep or leaves the screen, not every tick.
 */
export function dropClean(map: EndlessMap, cx: number, cy: number): boolean {
  const own = map.plane.chunk(cx, cy);
  const layers = [map.digHeading, map.filledAt, map.dugAt, map.quality];
  const fill = (l: ChunkLayer<Cells>) => new Float32Array(CHUNK * CHUNK).fill(l.empty);
  if (
    !unchanged(map.rock.chunk(cx, cy), own.rock) ||
    !unchanged(map.food.chunk(cx, cy), own.food) ||
    !layers.every((l) => unchanged(l.chunk(cx, cy), fill(l)))
  )
    return false;
  map.rock.drop(cx, cy);
  map.food.drop(cx, cy);
  for (const l of layers) l.drop(cx, cy);
  return true;
}

/** The chunks of `layer` that differ from what the plane generates (`own` reads its half of a plane chunk), as a layer's saved chunks. */
function changedChunks(map: EndlessMap, layer: ChunkLayer<Cells>, own: (c: PlaneChunk) => ArrayLike<number>): SavedChunks {
  const out: [number, number, unknown][] = [];
  layer.forEach((cx, cy, a) => {
    if (!unchanged(a, own(map.plane.chunk(cx, cy)))) out.push([cx, cy, encode(a)]);
  });
  return { $chunks: out };
}

/** The chunks of a layer with no generator that hold something other than `empty` (the layer's own written ground), as a layer's saved chunks. */
function writtenChunks(layer: ChunkLayer<Cells>): SavedChunks {
  const out: [number, number, unknown][] = [];
  layer.forEach((cx, cy, a) => {
    for (let i = 0; i < a.length; i++)
      if (a[i] !== layer.empty) {
        out.push([cx, cy, encode(a)]);
        return;
      }
  });
  return { $chunks: out };
}

/**
 * The endless plane as a save holds it (PRD §66 E6.0.3, docs/endless-world.md §8): not the plane, which is the seed, but what the game changed: the
 * chunks of rock and food that differ from what the plane generates (`dropClean`'s notion of unchanged), the other layers' written chunks (dig
 * headings, dug and filled times, quality, the mound), and the food counters as offsets from the food generated (which a load counts again as chunks are
 * made). Size follows the ground changed, not the ground seen.
 */
export function saveEndless(map: EndlessMap): Record<string, unknown> {
  const spoil = map.spoil;
  return {
    endless: true,
    seed: map.seed,
    rock: changedChunks(map, map.rock, (c) => c.rock),
    food: changedChunks(map, map.food, (c) => c.food),
    quality: writtenChunks(map.quality),
    digHeading: writtenChunks(map.digHeading),
    filledAt: writtenChunks(map.filledAt),
    dugAt: writtenChunks(map.dugAt),
    spoil: spoil ? writtenChunks(spoil) : null,
    moundCells: map.moundCells ?? 0,
    dug: map.dug,
    filled: map.filled,
    foodAddedTotal: map.foodTotal - map.ledger.generatedTotal,
    foodAddedLeft: map.foodLeft - map.ledger.generatedTotal,
  };
}

/**
 * A save back into a fresh map of the same seed: every chunk is dropped (an unchanged one is generated again as it is read), the changed ones put back,
 * and the food counters rebuilt: the saved offsets, plus the food of each chunk as it is generated again (the changed ones are counted here, from the
 * plane's own chunk). `onFood` hooks (the game's regrowth piles) hear of each chunk counted.
 */
export function loadEndless(map: EndlessMap, saved: Record<string, unknown>): void {
  if (saved.endless !== true || saved.seed !== map.seed)
    throw new Error(`save: another plane (seed ${String(saved.seed)}, this map's: ${map.seed})`);
  map.ledger.reset();
  map.foodTotal = saved.foodAddedTotal as number;
  map.foodLeft = saved.foodAddedLeft as number;
  fillLayer(map.rock, saved.rock);
  fillLayer(map.food, saved.food);
  for (const [cx, cy] of (saved.food as SavedChunks).$chunks) {
    // a changed chunk was not generated by the layer: count what the plane generated there, once
    const f = map.plane.chunk(cx, cy).food;
    let sum = 0;
    for (let i = 0; i < f.length; i++) sum += f[i]!;
    if (map.ledger.generated("food", chunkKey(cx, cy), sum)) {
      map.foodTotal += sum;
      map.foodLeft += sum;
      for (const hook of map.foodHooks) hook(cx, cy, f);
    }
  }
  fillLayer(map.quality, saved.quality);
  fillLayer(map.digHeading, saved.digHeading);
  fillLayer(map.filledAt, saved.filledAt);
  fillLayer(map.dugAt, saved.dugAt);
  if (saved.spoil && map.spoil) fillLayer(map.spoil, saved.spoil);
  map.moundCells = saved.moundCells as number;
  map.dug = saved.dug as number;
  map.filled = saved.filled as number;
}
