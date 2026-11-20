import { drawVoxelLoupe } from "./voxelLoupe.ts";
import { CELL, cellOf, centreX, centreY } from "../colony/index.ts";
import { toScreen, type Camera, type Viewport } from "./camera.ts";

export interface MapInspection {
  lv: number;
  x: number;
  y: number;
}
let selected: MapInspection | null = null;
export const setMapInspection = (at: MapInspection | null): void => {
  selected = at;
};
export const mapInspectionNow = (): MapInspection | null => selected;

/** Anchor to the cell centre, not the original tap or the moving ant under it. */
export function inspectionMarker(at: MapInspection | null, layer: number, camera: Camera, view: Viewport, dpr: number, seconds: number) {
  if (!at || at.lv !== layer) return null;
  cellOf(at.x, at.y);
  const [x, y] = toScreen(camera, view, centreX(CELL[0], CELL[1]), centreY(CELL[1]));
  return { x, y, bob: Math.sin(seconds * 2.6) * 3 * dpr };
}

/** Readable on light/dark terrain and at distant zoom, with an exact-size hex underneath the floating loupe. */
export function drawMapInspection(
  ctx: CanvasRenderingContext2D,
  at: MapInspection | null,
  layer: number,
  camera: Camera,
  view: Viewport,
  dpr: number,
  seconds: number,
): void {
  const p = inspectionMarker(at, layer, camera, view, dpr, seconds);
  if (!p || p.x < -60 * dpr || p.y < -20 * dpr || p.x > view.w + 60 * dpr || p.y > view.h + 70 * dpr) return;
  const { x, y, bob } = p;
  ctx.save();
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = Math.PI / 6 + (i * Math.PI) / 3;
    const px = x + (Math.cos(a) * camera.zoom) / Math.sqrt(3),
      py = y + (Math.sin(a) * camera.zoom) / Math.sqrt(3);
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fillStyle = "rgba(83,218,181,0.15)";
  ctx.fill();
  ctx.strokeStyle = "#172E2A";
  ctx.lineWidth = 5 * dpr;
  ctx.stroke();
  ctx.strokeStyle = "#87F4D1";
  ctx.lineWidth = 2 * dpr;
  ctx.stroke();
  const cy = y - 27 * dpr + bob;
  // A screen-facing stem connects the floating marker to its exact cell.
  ctx.beginPath();
  ctx.moveTo(x, y - 3 * dpr);
  ctx.lineTo(x, cy + 13 * dpr);
  ctx.strokeStyle = "#172E2A";
  ctx.lineWidth = 3 * dpr;
  ctx.stroke();
  ctx.strokeStyle = "#87F4D1";
  ctx.lineWidth = dpr;
  ctx.stroke();
  drawVoxelLoupe(ctx, x, cy, dpr, seconds);
  ctx.font = `600 ${10 * dpr}px system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const label = "Inspecting",
    width = ctx.measureText(label).width + 12 * dpr;
  ctx.fillStyle = "#172E2A";
  ctx.fillRect(x - width / 2, cy - 27 * dpr, width, 15 * dpr);
  ctx.fillStyle = "#E6FFF6";
  ctx.fillText(label, x, cy - 19 * dpr);
  ctx.restore();
}
