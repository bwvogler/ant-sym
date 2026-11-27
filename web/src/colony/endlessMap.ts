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
import { EndlessPlane, GENERATOR_VERSION, planeFingerprint, type EndlessOptions, type PlaneChunk } from "./endlessPlane.ts";
import { FoodLedger } from "./foodLedger.ts";
import { editLayers, type WorldMap } from "./world.ts";

/**
 * Half the nominal box, in cells: the chunk key's range (chunks.ts chunkKey, ±32,768 chunks). Past it chunk keys alias (chunk (32768, 0) and chunk
 * (-32768, 1) share a key) and the food ledger throws: it is a limit of correctness, 2,097,152 cells from the origin, not an edge the map draws
 * (ja-qpv.8 owns widening the key; an ant would have to walk that far).
 */
export const ENDLESS_HALF = 32768 * CHUNK;

/** Chunks a map keeps made-but-not-yet-read at most (a chunk is ~20 KB, so ~10 MB): 3 colonies' rings are ~100. */
const PENDING_MAX = 512;

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
  /**
   * Called with a chunk's food when it is generated AGAIN: after `dropClean` freed it, or, in a loaded game, the first time a chunk the save counted
   * (`madeFood`) is made after the load. The ledger counts nothing the second time, so `foodHooks` stay quiet; a reader that dropped or never held what it keeps
   * per chunk (the game's regrowth piles) takes it up here. Run inside the generator: do not read the map's food.
   */
  regenHooks: ((cx: number, cy: number, food: Float32Array) => void)[];
  /**
   * Make the plane's chunk (cx, cy) ahead of need (PRD §66 E6.0.4, `ja-qpv.9.1`): the layers take it from here when they first read the chunk, so that read
   * costs a copy, not the ~70 ms of a chunk with food patches. One call does one step of that work (the patches of one of the chunk's 3x3 neighbours, or the
   * chunk once they are all known) and returns true; false means there is nothing left to do (the chunk is made, or a layer holds it), so call until false,
   * a step per tick. It touches no layer, no total and no hook, so the game cannot tell when, or whether, a chunk was prefetched: generation is pure in (seed, chunk).
   */
  prefetch(cx: number, cy: number): boolean;
  /** Chunks a layer read had to make on a miss (nothing had prefetched them), and chunks `prefetch` made (steps that only warmed the patches are not counted): the bench and the soak test read these. */
  gen: { misses: number; prefetched: number };
}

/** The map over the endless plane of `seed`; `opts` are the plane's (endlessPlane.ts). Chunks generate as they are read. */
export function generateEndlessPlane(seed: number, opts: Partial<EndlessOptions> = {}): EndlessMap {
  const plane = new EndlessPlane(seed, opts);
  const ledger = new FoodLedger();
  const starts = plane.startNests();
  // One plane.chunk() makes a chunk's rock and food together; whichever layer asks first leaves the other's half here (bounded: a layer
  // that never asks for it must not hold the world).
  // Each entry is kept until BOTH layers have taken their half (else a layer asking second would make the chunk again: 70 ms with food patches).
  // A prefetched chunk waits here for both layers too. When full the oldest entry goes (Map order): a chunk read after that is made again on its miss.
  const pending = new Map<number, { chunk: PlaneChunk; rock: boolean; food: boolean }>();
  const gen = { misses: 0, prefetched: 0 };
  const keep = (k: number, have: { chunk: PlaneChunk; rock: boolean; food: boolean }): void => {
    if (pending.size >= PENDING_MAX) pending.delete(pending.keys().next().value as number);
    pending.set(k, have);
  };
  const made = (cx: number, cy: number, half: "rock" | "food"): PlaneChunk => {
    const k = chunkKey(cx, cy);
    let have = pending.get(k);
    if (!have) {
      gen.misses++;
      have = { chunk: plane.chunk(cx, cy), rock: false, food: false };
      keep(k, have);
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
    regenHooks: [],
    gen,
    prefetch: (cx, cy) => {
      const k = chunkKey(cx, cy);
      if (pending.has(k) || (map.rock.peek(cx, cy) !== undefined && map.food.peek(cx, cy) !== undefined)) return false;
      // A chunk's food comes from the patches of its 3x3 neighbours, each a flood over its own window (~10-80 ms): one of those, or the chunk, per call.
      for (let j = -1; j <= 1; j++)
        for (let i = -1; i <= 1; i++)
          if (!plane.patchesReady(cx + i, cy + j)) {
            plane.patchesOf(cx + i, cy + j);
            return true;
          }
      keep(k, { chunk: plane.chunk(cx, cy), rock: map.rock.peek(cx, cy) !== undefined, food: map.food.peek(cx, cy) !== undefined });
      gen.prefetched++;
      return true;
    },
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
      } else for (const hook of map.regenHooks) hook(cx, cy, f);
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
 * noted): it will be generated again the same. A chunk with a change is the delta and stays. Returns whether it was freed, or was already
 * absent from every layer (nothing to drop: nothing is generated and no food counted, ja-qpv.8.1). A layer that does not hold the chunk
 * holds no change to it (a generated layer would make the plane's own, the others read `empty`), so it is read with `peek`, never
 * generated. Costs one regeneration of the plane's chunk when some layer holds it, so call it when a region goes to sleep or leaves the
 * screen, not every tick.
 */
export function dropClean(map: EndlessMap, cx: number, cy: number): boolean {
  const written = [map.digHeading, map.filledAt, map.dugAt, map.quality];
  if (map.rock.peek(cx, cy) === undefined && map.food.peek(cx, cy) === undefined && written.every((l) => l.peek(cx, cy) === undefined))
    return true;
  const own = map.plane.chunk(cx, cy);
  const fill = (l: ChunkLayer<Cells>) => new Float32Array(CHUNK * CHUNK).fill(l.empty);
  if (
    !unchanged(map.rock.peek(cx, cy), own.rock) ||
    !unchanged(map.food.peek(cx, cy), own.food) ||
    !written.every((l) => unchanged(l.peek(cx, cy), fill(l)))
  )
    return false;
  map.rock.drop(cx, cy);
  map.food.drop(cx, cy);
  for (const l of written) l.drop(cx, cy);
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
 * headings, dug and filled times, quality, the mound), the food counters, and the chunks whose food was counted (`madeFood`: one 24-byte entry for every chunk
 * ever read, evicted ones too: 3.4 KB at 140 chunks, under 1% of the map save). The rest follows the ground changed, not the ground seen. A load into a plane
 * made with other options, or another generator version, than the save's is refused at the load (`checkPlane`, `ja-qpv.5.9`).
 */
export function saveEndless(map: EndlessMap): Record<string, unknown> {
  const spoil = map.spoil;
  return {
    endless: true,
    seed: map.seed,
    // the plane this is the delta of: a load into another is refused (`checkPlane`)
    plane: { generator: GENERATOR_VERSION, options: planeFingerprint(map.plane.options) },
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
    // the chunks whose food was counted, with their amounts (a few KB): a load counts them again without making them, so foodLeft and foodTotal equal the original game's (ja-qpv.5.2)
    madeFood: map.ledger.entries(),
    // the counters as they are (a load with `madeFood` sets them exactly) and as offsets from the food generated (what an older reader, or a save with no `madeFood`, counts from)
    foodTotal: map.foodTotal,
    foodLeft: map.foodLeft,
    foodAddedTotal: map.foodTotal - map.ledger.generatedTotal,
    foodAddedLeft: map.foodLeft - map.ledger.generatedTotal,
  };
}

/**
 * A save back into a fresh map of the same seed: every chunk is dropped (an unchanged one is generated again as it is read), the changed ones put back,
 * and the food counters rebuilt: the saved offsets, plus the food of each chunk as it is generated again (the changed ones are counted here, from the
 * plane's own chunk). `onFood` hooks (the game's regrowth piles) hear of each chunk counted.
 */
/**
 * Refuse a save made on another plane than `map`'s: another generator version, or other options, name what differs. A save with no `plane` (made before this was
 * recorded) is not checked. Before the load changes anything, so a refused load leaves the map as it was.
 */
function checkPlane(map: EndlessMap, saved: unknown): void {
  if (saved === undefined) return;
  const p = saved as { generator?: number; options?: Record<string, number> };
  if (p.generator !== GENERATOR_VERSION)
    throw new Error(`save: another plane (generator version ${String(p.generator)} in the save, ${GENERATOR_VERSION} in this build)`);
  const here = planeFingerprint(map.plane.options);
  const there = p.options ?? {};
  const differ = [...new Set([...Object.keys(here), ...Object.keys(there)])]
    .filter((k) => here[k] !== there[k])
    .map((k) => `${k} ${String(there[k] ?? "absent")} in the save, ${String(here[k] ?? "absent")} in this map`);
  if (differ.length > 0) throw new Error(`save: another plane (${differ.join("; ")})`);
}

export function loadEndless(map: EndlessMap, saved: Record<string, unknown>): void {
  if (saved.endless !== true || saved.seed !== map.seed)
    throw new Error(`save: another plane (seed ${String(saved.seed)}, this map's: ${map.seed})`);
  checkPlane(map, saved.plane);
  map.ledger.reset();
  // A save made since the ledger was kept carries the chunks counted (`madeFood`): restored, the counters equal the original game's at once, and a chunk made
  // again later counts nothing the second time. An older save has none, and counts the chunks as they are made.
  const made = saved.madeFood as [string, number][] | undefined;
  if (made) map.ledger.restore(made);
  // the absolute counters when the ledger is restored (exact: an offset plus the generated total can differ in the last bits); otherwise the offsets, counting from nothing
  map.foodTotal =
    made && typeof saved.foodTotal === "number" ? saved.foodTotal : (saved.foodAddedTotal as number) + map.ledger.generatedTotal;
  map.foodLeft = made && typeof saved.foodLeft === "number" ? saved.foodLeft : (saved.foodAddedLeft as number) + map.ledger.generatedTotal;
  fillLayer(map.rock, saved.rock);
  fillLayer(map.food, saved.food);
  for (const [cx, cy] of (saved.food as SavedChunks).$chunks) {
    // a changed chunk was not generated by the layer: count what the plane generated there, once (a restored ledger has counted it, and checks the amount)
    const f = map.plane.chunk(cx, cy).food;
    let sum = 0;
    for (let i = 0; i < f.length; i++) sum += f[i]!;
    if (map.ledger.generated("food", chunkKey(cx, cy), sum)) {
      map.foodTotal += sum;
      map.foodLeft += sum;
    }
    // the game learns of the chunk either way (its piles)
    for (const hook of map.foodHooks) hook(cx, cy, f);
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
