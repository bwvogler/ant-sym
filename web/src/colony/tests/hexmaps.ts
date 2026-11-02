// Test helpers for hand-made hex maps: cells in offset rows (odd rows half a cell right), so a map
// still reads as rows of characters, and world positions come from cells.
import { centreX, centreY } from "../hex.ts";
import { OPEN, ROCK, SOIL, worldFromArrays, type Nest, type WorldMap } from "../world.ts";

/** The world position of cell (x, y)'s centre. */
export function at(x: number, y: number): { x: number; y: number } {
  return { x: centreX(x, y), y: centreY(y) };
}

/** Put ant i of a colony at cell (x, y)'s centre. */
export function put(c: { x: Float32Array; y: Float32Array }, i: number, x: number, y: number): void {
  c.x[i] = centreX(x, y);
  c.y[i] = centreY(y);
}

/** The nest centred on cell (x, y), radius r (world units). */
export function nestAt(x: number, y: number, r: number): Nest {
  return { ...at(x, y), r };
}

/**
 * A map from rows of characters (spaces ignored, so odd rows can be indented to show the shift):
 * `.` open, `s` soil, `#` rock, `f` open with food (`food` units), `N` open, a nest cell (the nest is
 * centred on the first `N`, radius `r`).
 */
export function hexMap(rows: string[], opts: { food?: number; r?: number } = {}): WorldMap {
  const lines = rows.map((l) => l.replace(/ /g, ""));
  const h = lines.length;
  const w = Math.max(...lines.map((l) => l.length));
  const rock = new Uint8Array(w * h);
  const food = new Float32Array(w * h);
  let nest: Nest | null = null;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const ch = lines[y]![x] ?? "#";
      rock[y * w + x] = ch === "s" ? SOIL : ch === "#" ? ROCK : OPEN;
      if (ch === "f") food[y * w + x] = opts.food ?? 3;
      if (ch === "N" && !nest) nest = nestAt(x, y, opts.r ?? 1.2);
    }
  return worldFromArrays({ w, h }, [nest ?? nestAt(0, 0, 1)], { rock, food });
}
