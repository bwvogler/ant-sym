import { moundGroundLevel } from "./inspectionGround.ts";
import { centreX, centreY, SIDE } from "../colony/index.ts";
import { buildPatchTerrain } from "./drawInspectionPatch.ts";
import type { InspectionPatch } from "./inspectionPatch.ts";
import { VOXEL_CHUNK_SIZE } from "./voxelViewport.ts";

export interface VoxelTerrainChunk {
  id: string;
  x: number;
  y: number;
  signature: string;
  patch: InspectionPatch;
}

export function terrainChunkDescriptors(patch: InspectionPatch): VoxelTerrainChunk[] {
  if (!patch.bounds) return [];
  const cx = centreX(...patch.selected.cell),
    cy = centreY(patch.selected.cell[1]),
    b = patch.bounds,
    size = VOXEL_CHUNK_SIZE,
    out: VoxelTerrainChunk[] = [];
  for (let y = Math.floor((cy + b.top) / size); y < Math.round((cy + b.bottom) / size); y++)
    for (let x = Math.floor((cx + b.left) / size); x < Math.round((cx + b.right) / size); x++) {
      const wx = x * size,
        wy = y * size,
        halo = SIDE + 0.061,
        cells = patch.cells
          .filter((c) => {
            const xx = centreX(...c.state.cell),
              yy = centreY(c.state.cell[1]);
            return xx >= wx - halo && xx <= wx + size + halo && yy >= wy - halo && yy <= wy + size + halo;
          })
          .sort((a, b) => a.state.cell[1] - b.state.cell[1] || a.state.cell[0] - b.state.cell[0]);
      out.push({
        id: `${patch.mode}:${x}:${y}`,
        x: wx,
        y: wy,
        signature: JSON.stringify(
          cells.map((c) => [
            c.state.cell,
            c.valid,
            c.surfaceStrip,
            c.state.place.ground,
            c.projectedGround,
            c.projectedSpoil,
            moundGroundLevel(c.state.place.mound),
            c.surfaceEntrance,
          ]),
        ),
        patch: {
          ...patch,
          cells,
          bounds: { left: wx - cx - 0.061, right: wx + size - cx + 0.061, top: wy - cy - 0.061, bottom: wy + size - cy + 0.061 },
        },
      });
    }
  return out;
}

/** A halo removes hidden faces across chunk borders; only the owning voxel's faces enter the mesh. */
export function buildVoxelTerrainChunk(chunk: VoxelTerrainChunk): ReturnType<typeof buildPatchTerrain> {
  const { patch, x, y } = chunk,
    below = patch.mode === "below",
    step = below ? 0.06 : 0.05,
    cx = centreX(...patch.selected.cell),
    cy = centreY(patch.selected.cell[1]),
    offset = below ? [x - cx, 0, cy - y] : [x - cx, cy - y, 0];
  return buildPatchTerrain(patch, true)
    .filter((face) => {
      let midX = 0,
        midY = 0;
      for (const p of face.points) {
        midX += p[0] / face.points.length;
        midY += p[below ? 2 : 1] / face.points.length;
      }
      const wx = midX - (face.normal[0] * step) / 2 + cx,
        wy = cy - (midY - (face.normal[below ? 2 : 1] * step) / 2);
      return wx >= x - 1e-7 && wx < x + VOXEL_CHUNK_SIZE - 1e-7 && wy >= y - 1e-7 && wy < y + VOXEL_CHUNK_SIZE - 1e-7;
    })
    .map((face) => ({ ...face, points: face.points.map((p) => p.map((v, i) => v - offset[i]) as [number, number, number]) }));
}

/** Bounded reuse across nearby pans and zooms. Visible meshes are retained even when they exceed the warm-cache budget. */
export class VoxelTerrainCache<T> {
  private entries = new Map<string, { signature: string; value: T }>();
  rebuilt = 0;
  get size(): number {
    return this.entries.size;
  }
  private create: (chunk: VoxelTerrainChunk) => T;
  private release: (value: T) => void;
  private capacity: number;
  constructor(create: (chunk: VoxelTerrainChunk) => T, release: (value: T) => void, capacity = 64) {
    this.create = create;
    this.release = release;
    this.capacity = capacity;
  }
  update(patch: InspectionPatch): { id: string; x: number; y: number; value: T }[] {
    this.rebuilt = 0;
    const chunks = terrainChunkDescriptors(patch),
      active = new Set(chunks.map((c) => c.id)),
      out = chunks.map((chunk) => {
        let entry = this.entries.get(chunk.id);
        if (!entry || entry.signature !== chunk.signature) {
          if (entry) this.release(entry.value);
          entry = { signature: chunk.signature, value: this.create(chunk) };
          this.rebuilt++;
        }
        this.entries.delete(chunk.id);
        this.entries.set(chunk.id, entry);
        return { id: chunk.id, x: chunk.x, y: chunk.y, value: entry.value };
      });
    for (const [id, entry] of this.entries) {
      if (this.entries.size <= Math.max(this.capacity, active.size)) break;
      if (active.has(id)) continue;
      this.release(entry.value);
      this.entries.delete(id);
    }
    return out;
  }
  dispose(): void {
    for (const entry of this.entries.values()) this.release(entry.value);
    this.entries.clear();
  }
}
