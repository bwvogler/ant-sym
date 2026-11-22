// What a frame reports (ja-fnd.6.3.13, docs/field-split.md): the shell writes it to its refs (the tilt, whether the map is drawn angled) and
// to canvas.dataset, which the Playwright guards and the dev hook read (scripts/e2e-one-world.mjs, scripts/field-shots.mjs). Plain TypeScript
// with no DOM types of its own: the sinks are handed in, so a unit test runs it on plain objects.

import type { InspectionOrbit } from "../inspectionOrbit.ts";

/** What one frame found out about itself. */
export interface FrameResult {
  /** CSS pixels a hexagon spans, to two places (diagnostic) */
  hexCssPx: string;
  /** the worker representation available at this zoom (diagnostic) */
  workerStyle: "voxel" | "ink";
  /** the nest representation drawn (diagnostic) */
  nestStyle: "voxel" | "symbols";
  /** the map renderer the frame used: "sprites", "voxel-webgl", "voxel-software" */
  renderer: string;
  /** how far the voxel map fades in, 0 to 1 */
  voxelAlpha: number;
  /** the map was drawn from a tilted or turned camera: input then works on the middle of the view (see ColonyField's pointer code) */
  angled: boolean;
  /** the map can be tilted at this zoom and place: the tilt control shows; when it cannot, the tilt resets */
  canRotate: boolean;
  /** chunk buffers painted and chunk draws served from the cache this frame (dev builds only) */
  chunkPaints: number;
  chunkCacheHits: number;
}

/** Where a frame's result goes: the shell's refs and the canvas's data attributes. */
export interface FrameSinks {
  dataset: Record<string, string | undefined>;
  orbit: { current: InspectionOrbit };
  orbitAxes: { current: { hidden: boolean | string } | null };
  angled: { current: boolean };
  /** the untilted orbit, for a reset */
  flatOrbit: () => InspectionOrbit;
  /** dev builds also write the chunk counters and the draw time */
  dev: boolean;
}

/** Write one frame's result. The diagnostics that rarely change are written only when they do (a write to the DOM costs a style check). */
export function publishFrame(r: FrameResult, k: FrameSinks): void {
  if (k.dataset.hexCssPx !== r.hexCssPx) k.dataset.hexCssPx = r.hexCssPx;
  if (k.dataset.workerStyle !== r.workerStyle) k.dataset.workerStyle = r.workerStyle;
  if (k.dataset.nestStyle !== r.nestStyle) k.dataset.nestStyle = r.nestStyle;
  if (k.orbitAxes.current) k.orbitAxes.current.hidden = !r.canRotate;
  if (!r.canRotate) k.orbit.current = k.flatOrbit();
  k.angled.current = r.angled;
  k.dataset.mapRenderer = r.renderer;
  k.dataset.voxelAlpha = r.voxelAlpha.toFixed(3);
  if (k.dev) {
    k.dataset.chunkPaints = String(r.chunkPaints);
    k.dataset.chunkCacheHits = String(r.chunkCacheHits);
  }
}

/** A dev build's measure of how long the frame took, in milliseconds (the end of a frame that was not cut short). */
export function publishDrawMs(ms: number, k: Pick<FrameSinks, "dataset" | "dev">): void {
  if (k.dev) k.dataset.fieldDrawMs = ms.toFixed(2);
}
