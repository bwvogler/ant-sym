import { type Cells, type ChunkLayer, rockAt, type WorldMap } from "../colony/index.ts";

// How the page reads ground it only shows (docs/endless-world.md §8, ja-qpv.4.4 and ja-qpv.4.8). On an endless plane the rock and food layers generate a
// chunk on the first read of a cell in it, so a frame, a click or the lens that read with `get` would make ground the game has not made, and change it.
// The page reads with `peek` there: a cell of a chunk nobody made reads as the layer's `empty` (rock, no food, no spoil). A bounded map has no such chunk
// (its layers are all made), so its reads stay the exact calls they were. This file is a leaf: it imports only the colony.

/** A layer's chunk as the page may read it: on an endless plane `peek`, which never makes a chunk the game has not made; a bounded map's `chunk` (the same read). */
// Only rock and food have generators on an endless plane (quality, spoil and chambers are absent from it), so `peek` and `chunk` answer alike for those three today;
// `peek` is used for all of them so that a layer that gets a generator later is not made by a frame.
export function chunkOf<A extends Cells>(endless: boolean, layer: ChunkLayer<A> | undefined, cx: number, cy: number): A | undefined {
  return endless ? layer?.peek(cx, cy) : layer?.chunk(cx, cy);
}

/** The cell (x, y) of a layer read with `peek` (what a cell of a chunk nobody made reads as: the layer's `empty`). Never makes a chunk. */
export function peekCell(layer: ChunkLayer<Cells>, x: number, y: number): number {
  const a = layer.peek(x >> 6, y >> 6);
  return a ? a[((y & 63) << 6) | (x & 63)]! : layer.empty;
}

/** The terrain of cell (x, y) as the page reads it: `rockAt` on a bounded map, `peek` on an endless plane (unmade ground reads as rock). */
export function seenRock(m: WorldMap, x: number, y: number): number {
  return m.endless === true ? peekCell(m.rock, x, y) : rockAt(m, x, y);
}

/** Cell (x, y) of one of map `m`'s layers as the page reads it: `layer.get` on a bounded map, `peek` on an endless plane (unmade ground reads as the layer's `empty`). */
export function seenCell(m: WorldMap, layer: ChunkLayer<Cells>, x: number, y: number): number {
  return m.endless === true ? peekCell(layer, x, y) : layer.get(x, y);
}
