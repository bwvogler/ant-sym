import { CELL, CURTAIN, OPEN, SOIL, STRIP, cellAt, centreX, centreY, inBounds, nx, ny, rockAt, type AphidClump } from "../colony/index.ts";
import { inspectCell, type CellInspectionState } from "./cellInspection.ts";
import type { LensWorld } from "./lens.ts";
import type { SensedMap } from "./fungusSight.ts";

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
  /** Centre first, then the six game neighbours; invalid edge slots remain present but empty. */
  cells: InspectionPatchCell[];
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
  const map = g.world ? (layer === CURTAIN ? g.world.curtain : g.world.plane) : g.colonies[0]!.map;
  const mode = selected.place.view === "below" || (selected.place.view === "map" && map.hasSoil) ? "below" : "surface";
  const coords: [number, number][] = [[gx, gy], ...Array.from({ length: 6 }, (_, d): [number, number] => [nx(gx, gy, d), ny(gy, d)])];
  const cx = centreX(gx, gy),
    cy = centreY(gy);
  const cells = coords.map(([xx, yy], i): InspectionPatchCell => {
    const valid = inBounds(map, xx, yy),
      state = i === 0 ? selected : inspectCell(g, sensed, layer, centreX(xx, yy), centreY(yy), trails, clumps);
    const out: InspectionPatchCell = {
      state,
      x: centreX(xx, yy) - cx,
      y: centreY(yy) - cy,
      valid,
      surfaceStrip: !!g.world && layer === CURTAIN && yy === STRIP,
    };
    if (out.surfaceStrip && g.world?.line && cellAt(g.world.line, xx)) {
      const px = CELL[0],
        py = CELL[1],
        kind = rockAt(g.world.plane, px, py);
      out.projectedGround = kind === OPEN ? "open" : kind === SOIL ? "soil" : "rock";
      out.projectedSpoil = g.world.plane.spoil?.get(px, py) ?? 0;
      out.surfaceEntrance = g.colonies.some((c) => c.holeCells.some((h) => h.col === xx));
    }
    return out;
  });
  return { selected, mode, cells };
}
