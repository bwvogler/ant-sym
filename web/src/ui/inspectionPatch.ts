import {
  CELL,
  isCurtainLayer,
  lineOfLayer,
  mapOfLayer,
  OPEN,
  PLANE,
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
  type AphidClump,
} from "../colony/index.ts";
import { indexInspectedWorkers, inspectCell, type CellInspectionState } from "./cellInspection.ts";
import type { LensWorld } from "./lens.ts";
import { LIVE, UNKNOWN } from "./fog/knowledge.ts";
import { SNAP } from "./fog/sources.ts";
import { seenCell, seenRock } from "./groundPeek.ts";
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
    map = mapOfLayer(g.world, layer),
    coords: [number, number][] = [[gx, gy]],
    bounds = voxelRegionBounds(x, y, width, height);
  // Surface piles can spill across cell edges. Read enough source cells for their supported bases.
  const margin = isCurtainLayer(layer) ? 1 : 3;
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
  const map = mapOfLayer(g.world, layer);
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
      surfaceStrip: isCurtainLayer(layer) && yy === STRIP,
    };
    if (out.surfaceStrip && cellAt(lineOfLayer(g.world, layer), xx)) {
      const px = CELL[0],
        py = CELL[1],
        // Under the fog the plane under the strip is what was last sensed there, and nothing where it never was.
        fog = sensed.knowledge,
        ps = fog ? fog.state(PLANE, px, py) : LIVE,
        kind = ps === LIVE ? seenRock(g.world.plane, px, py) : (fog!.snapshot(PLANE, SNAP.rock, px, py) ?? OPEN);
      if (ps !== UNKNOWN) {
        out.projectedGround = kind === OPEN ? "open" : kind === SOIL ? "soil" : "rock";
        out.projectedSpoil =
          ps === LIVE
            ? g.world.plane.spoil
              ? seenCell(g.world.plane, g.world.plane.spoil, px, py)
              : 0
            : (fog!.snapshot(PLANE, SNAP.spoil, px, py) ?? 0);
      }
      out.surfaceEntrance = g.colonies.some((c) => c.holeCells.some((h) => h.col === xx));
    }
    return out;
  });
  const fog = sensed.knowledge;
  const surfaceFood = new Map<number, number>();
  if (mode === "surface")
    for (const c of cells) {
      const [x, y] = c.state.cell;
      for (let d = -1; d < 6; d++) {
        const a = d < 0 ? x : nx(x, y, d),
          b = d < 0 ? y : ny(y, d);
        if (!inBounds(map, a, b)) continue;
        const fs = fog ? fog.state(layer, a, b) : LIVE;
        if (fs === UNKNOWN) continue; // nothing of ground never sensed
        const snap = fs === LIVE ? null : fog!; // a remembered cell reads its snapshot, not the truth
        const rock = snap ? (snap.snapshot(layer, SNAP.rock, a, b) ?? OPEN) : seenRock(map, a, b);
        const quality = snap ? (snap.snapshot(layer, SNAP.quality, a, b) ?? 1) : map.quality ? seenCell(map, map.quality, a, b) : 1;
        if (rock === OPEN && Math.abs(quality - 1) <= 0.01)
          surfaceFood.set(cellKey(a, b), snap ? (snap.snapshot(layer, SNAP.food, a, b) ?? 0) : seenCell(map, map.food, a, b));
      }
    }
  return { selected, mode, cells, surfaceFood };
}
