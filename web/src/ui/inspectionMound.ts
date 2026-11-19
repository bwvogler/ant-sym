import { R, cellKey, centreX, centreY } from "../colony/index.ts";
import type { InspectionPatch } from "./inspectionPatch.ts";

const PELLET_HEIGHT = 0.15;

/** Each level adds soil. Compress rare tall piles to keep the whole slope at inspection scale. */
export function moundHeight(level: number): number {
  return PELLET_HEIGHT * (level <= 5 ? level : 5 + Math.log2(level - 4));
}

export function inspectionMoundFloor(patch: InspectionPatch): ((x: number, y: number) => number) | undefined {
  if (patch.mode !== "surface") return;
  const heights = new Map<number, number>();
  for (const { valid, state } of patch.cells)
    if (valid && state.place.ground === "open" && state.place.hole < 0 && state.place.mound > 0)
      heights.set(cellKey(...state.cell), moundHeight(state.place.mound));
  if (!heights.size) return;

  const ox = centreX(...patch.selected.cell),
    oy = centreY(patch.selected.cell[1]);
  // Interpolate over the triangles of hex centres. Each triangle shares the same edge heights
  // with its neighbour, so an ant crossing a cell edge keeps climbing smoothly.
  const at = (column: number, row: number) => heights.get(cellKey(column + Math.floor(row / 2), row)) ?? 0;
  return (x, y) => {
    const v = (y + oy) / R - 0.5,
      u = x + ox - 0.5 - v / 2,
      row = Math.floor(v),
      column = Math.floor(u),
      a = u - column,
      b = v - row;
    if (a + b <= 1) return a * at(column + 1, row) + b * at(column, row + 1) + (1 - a - b) * at(column, row);
    return (1 - b) * at(column + 1, row) + (1 - a) * at(column, row + 1) + (a + b - 1) * at(column + 1, row + 1);
  };
}

/** Use a mix of pale grit and darker clods, grouped into small patches. */
export function dugSoilGrain(x: number, y: number, z: number): number {
  return Math.abs((Math.floor(x / 2) * 73856093) ^ (Math.floor(y / 2) * 19349663) ^ (Math.floor(z / 2) * 83492791)) % 5;
}
