import type { WorldSize } from "../colony/world.ts";

// The colony field's camera, pure: where the view is centred (in cells) and
// how many device pixels a cell takes. The field draws through it, pointer
// events come back through it, and every rule about how far you may zoom or
// pan lives here, where a test can reach it. Zoomed all the way out, the
// whole map fits the view; zoomed in, the view never leaves the map.

export interface Camera {
  /** centre of the view, in cells */
  x: number;
  y: number;
  /** device pixels per cell */
  zoom: number;
}

/** The view's size in device pixels. */
export interface Viewport {
  w: number;
  h: number;
}

/** Closest zoom: a cell this many device pixels wide. */
export const MAX_ZOOM = 28;

/** The zoom at which the whole map fits the view. */
export function fitZoom(world: WorldSize, view: Viewport): number {
  return Math.min(view.w / world.w, view.h / world.h);
}

/** The whole map, centred. */
export function fit(world: WorldSize, view: Viewport): Camera {
  return { x: world.w / 2, y: world.h / 2, zoom: fitZoom(world, view) };
}

/** Zoom between "the whole map" and MAX_ZOOM; the centre kept so the view stays over the map (or centred on an axis the map doesn't fill). */
export function clamp(c: Camera, world: WorldSize, view: Viewport): Camera {
  const zoom = Math.max(fitZoom(world, view), Math.min(MAX_ZOOM, c.zoom));
  const halfW = view.w / zoom / 2;
  const halfH = view.h / zoom / 2;
  const x = halfW * 2 >= world.w ? world.w / 2 : Math.max(halfW, Math.min(world.w - halfW, c.x));
  const y = halfH * 2 >= world.h ? world.h / 2 : Math.max(halfH, Math.min(world.h - halfH, c.y));
  return { x, y, zoom };
}

/** Screen (device px) → world (cells). */
export function toWorld(c: Camera, view: Viewport, sx: number, sy: number): [number, number] {
  return [c.x + (sx - view.w / 2) / c.zoom, c.y + (sy - view.h / 2) / c.zoom];
}

/** World (cells) → screen (device px). */
export function toScreen(c: Camera, view: Viewport, x: number, y: number): [number, number] {
  return [(x - c.x) * c.zoom + view.w / 2, (y - c.y) * c.zoom + view.h / 2];
}

/** Zoom by `factor`, keeping the world point under screen (sx, sy) where it is. */
export function zoomAt(c: Camera, view: Viewport, sx: number, sy: number, factor: number): Camera {
  const [wx, wy] = toWorld(c, view, sx, sy);
  const zoom = c.zoom * factor;
  return { x: wx - (sx - view.w / 2) / zoom, y: wy - (sy - view.h / 2) / zoom, zoom };
}

/** Move the view by a drag of (dx, dy) device pixels: the ground follows the pointer. */
export function pan(c: Camera, dx: number, dy: number): Camera {
  return { x: c.x - dx / c.zoom, y: c.y - dy / c.zoom, zoom: c.zoom };
}

/** The cells in view, as a rectangle (fractional, unclipped). */
export function visible(c: Camera, view: Viewport): { x0: number; y0: number; x1: number; y1: number } {
  const halfW = view.w / c.zoom / 2;
  const halfH = view.h / c.zoom / 2;
  return { x0: c.x - halfW, y0: c.y - halfH, x1: c.x + halfW, y1: c.y + halfH };
}

/** The minimap's place in the corner: its rectangle in device px, sized to the map's shape. */
export function minimapRect(world: WorldSize, view: Viewport, dpr: number): { x: number; y: number; w: number; h: number } {
  const margin = 8 * dpr;
  const w = Math.min(view.w * 0.28, 180 * dpr);
  const h = (w * world.h) / world.w;
  return { x: view.w - w - margin, y: view.h - h - margin, w, h };
}
