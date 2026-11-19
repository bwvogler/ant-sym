import type { InspectionOrbit } from "./inspectionOrbit.ts";

export interface VoxelViewport {
  orbit?: InspectionOrbit;
  /** Raster dimensions; CSS may enlarge them to retain pixelated detail. */
  width: number;
  height: number;
  pixelsPerWorld: number;
  /** Camera offset from the selected cell centre, in map-world coordinates. */
  x: number;
  y: number;
}

/** Three world units divide evenly into the surface (.05) and below (.06) voxel grids. */
export const VOXEL_CHUNK_SIZE = 3;
export function voxelRegionBounds(x: number, y: number, width: number, height: number) {
  const size = VOXEL_CHUNK_SIZE;
  return {
    left: Math.floor((x - width / 2 - 1) / size) * size,
    right: Math.ceil((x + width / 2 + 1) / size) * size,
    top: Math.floor((y - height / 2 - 1) / size) * size,
    bottom: Math.ceil((y + height / 2 + 1) / size) * size,
  };
}

export function voxelFrustum(view: VoxelViewport) {
  if (
    ![view.width, view.height, view.pixelsPerWorld, view.x, view.y].every(Number.isFinite) ||
    view.width < 1 ||
    view.height < 1 ||
    view.pixelsPerWorld <= 0
  )
    throw Error("Invalid voxel viewport");
  const width = Math.round(view.width),
    height = Math.round(view.height),
    right = width / view.pixelsPerWorld / 2,
    top = height / view.pixelsPerWorld / 2;
  return { ...view, width, height, left: -right, right, top, bottom: -top };
}
