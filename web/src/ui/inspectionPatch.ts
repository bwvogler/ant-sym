import {
  CELL,
  CURTAIN,
  OPEN,
  SOIL,
  STRIP,
  R,
  cellAt,
  cellKey,
  centreX,
  centreY,
  inBounds,
  nx,
  ny,
  rockAt,
  type AphidClump,
} from "../colony/index.ts";
import { indexInspectedWorkers, inspectCell, type CellInspectionState } from "./cellInspection.ts";
import type { LensWorld } from "./lens.ts";
import type { SensedMap } from "./fungusSight.ts";
import { voxelRegionBounds } from "./voxelViewport.ts";

export interface InspectionPatchCell {
  state: CellInspectionState;
  x: number;
  y: number;
  valid: boolean;
  /** The curtain stores AIR here; this is the plane projected under the transect, not a tunnel. */
  surfaceStrip: boolean;
  projectedGround?: "open" | "soil" | "rock";
  projectedSpoil?: number;
  surfaceEntrance?: boolean;
}
export interface InspectionPatch {
  selected: CellInspectionState;
  mode: "surface" | "below";
  /** Centre first. inspectPatch adds six neighbours; inspectViewport adds the visible region and overscan. */
  cells: InspectionPatchCell[];
  /** One extra ring for leaf joins beyond the crop. */
  surfaceFood?: Map<number, number>;
  /** Optional viewport crop in map-world offsets from the selected hex centre. */
  bounds?: { left: number; right: number; top: number; bottom: number };
}

export function inspectPatch(
  g: LensWorld,
  sensed: SensedMap,
  layer: number,
  x: number,
  y: number,
  trails: { food: boolean; home: boolean },
  clumps: readonly AphidClump[] = [],
): InspectionPatch {
  const selected = inspectCell(g, sensed, layer, x, y, trails, clumps),
    [gx, gy] = selected.cell;
  const coords: [number, number][] = [[gx, gy], ...Array.from({ length: 6 }, (_, d): [number, number] => [nx(gx, gy, d), ny(gy, d)])];
  return readPatch(g, sensed, layer, selected, coords, trails, clumps);
}

/** Live, read-only region for a close-map viewport. One hex of overscan retains boundary actors and leaf joins. */
export function inspectViewport(
  g: LensWorld,
  sensed: SensedMap,
  layer: number,
  x: number,
  y: number,
  width: number,
  height: number,
  trails: { food: boolean; home: boolean },
  clumps: readonly AphidClump[] = [],
): InspectionPatch {
  if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) throw Error("Invalid voxel viewport");
  const workers = indexInspectedWorkers(g, layer),
    selected = inspectCell(g, sensed, layer, x, y, trails, clumps, workers),
    [gx, gy] = selected.cell,
    map = layer === CURTAIN ? g.world.curtain : g.world.plane,
    coords: [number, number][] = [[gx, gy]],
    bounds = voxelRegionBounds(x, y, width, height);
  // Surface piles can spill across cell edges. Read enough source cells for their supported bases.
  const margin = layer === CURTAIN ? 1 : 3;
  for (
    let yy = Math.max(0, Math.floor(bounds.top / R) - margin);
    yy <= Math.min(map.size.h - 1, Math.ceil(bounds.bottom / R) + margin);
    yy++
  )
    for (
      let xx = Math.max(map.x0, Math.floor(bounds.left) - margin);
      xx <= Math.min(map.x0 + map.size.w - 1, Math.ceil(bounds.right) + margin);
      xx++
    )
      if (xx !== gx || yy !== gy) coords.push([xx, yy]);
  const patch = readPatch(g, sensed, layer, selected, coords, trails, clumps, workers),
    cx = centreX(gx, gy),
    cy = centreY(gy);
  patch.bounds = {
    left: bounds.left - cx,
    right: bounds.right - cx,
    top: bounds.top - cy,
    bottom: bounds.bottom - cy,
  };
  return patch;
}

function readPatch(
  g: LensWorld,
  sensed: SensedMap,
  layer: number,
  selected: CellInspectionState,
  coords: [number, number][],
  trails: { food: boolean; home: boolean },
  clumps: readonly AphidClump[],
  workers?: ReturnType<typeof indexInspectedWorkers>,
): InspectionPatch {
  const [gx, gy] = selected.cell;
  const map = layer === CURTAIN ? g.world.curtain : g.world.plane;
  const mode = selected.place.view === "below" ? "below" : "surface";
  const cx = centreX(gx, gy),
    cy = centreY(gy);
  const cells = coords.map(([xx, yy], i): InspectionPatchCell => {
    const valid = inBounds(map, xx, yy),
      state = i === 0 ? selected : inspectCell(g, sensed, layer, centreX(xx, yy), centreY(yy), trails, clumps, workers);
    const out: InspectionPatchCell = {
      state,
      x: centreX(xx, yy) - cx,
      y: centreY(yy) - cy,
      valid,
      surfaceStrip: layer === CURTAIN && yy === STRIP,
    };
    if (out.surfaceStrip && g.world.line && cellAt(g.world.line, xx)) {
      const px = CELL[0],
        py = CELL[1],
        kind = rockAt(g.world.plane, px, py);
      out.projectedGround = kind === OPEN ? "open" : kind === SOIL ? "soil" : "rock";
      out.projectedSpoil = g.world.plane.spoil?.get(px, py) ?? 0;
      out.surfaceEntrance = g.colonies.some((c) => c.holeCells.some((h) => h.col === xx));
    }
    return out;
  });
  const surfaceFood = new Map<number, number>();
  if (mode === "surface")
    for (const c of cells) {
      const [x, y] = c.state.cell;
      for (let d = -1; d < 6; d++) {
        const a = d < 0 ? x : nx(x, y, d),
          b = d < 0 ? y : ny(y, d);
        if (inBounds(map, a, b) && rockAt(map, a, b) === OPEN && Math.abs((map.quality?.get(a, b) ?? 1) - 1) <= 0.01)
          surfaceFood.set(cellKey(a, b), map.food.get(a, b));
      }
    }
  return { selected, mode, cells, surfaceFood };
}
