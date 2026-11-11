// The colony field's camera, pure: where the view is centred (in cells) and
// how many device pixels a cell takes. The field draws through it, pointer
// events come back through it, and every rule about how far you may zoom or
// pan lives here, where a test can reach it. Zoomed all the way out, the
// whole map fits the view; zoomed in, the view never leaves the map. A map
// runs from x0 (0 but for one world's curtain, whose columns are the line's s
// and start below 0) to x0 + w, and from 0 to h.

/** The map's extent in world units: x from x0 (default 0) to x0 + w, y from 0 to h. */
export interface Extent {
  x0?: number;
  w: number;
  h: number;
}

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
export function fitZoom(world: Extent, view: Viewport): number {
  return Math.min(view.w / world.w, view.h / world.h);
}

/** The whole map, centred. */
export function fit(world: Extent, view: Viewport): Camera {
  return { x: (world.x0 ?? 0) + world.w / 2, y: world.h / 2, zoom: fitZoom(world, view) };
}

/** Zoom between "the whole map" and MAX_ZOOM; the centre kept so the view stays over the map (or centred on an axis the map doesn't fill). */
export function clamp(c: Camera, world: Extent, view: Viewport): Camera {
  const zoom = Math.max(fitZoom(world, view), Math.min(MAX_ZOOM, c.zoom));
  const halfW = view.w / zoom / 2;
  const halfH = view.h / zoom / 2;
  const x0 = world.x0 ?? 0;
  const x = halfW * 2 >= world.w ? x0 + world.w / 2 : Math.max(x0 + halfW, Math.min(x0 + world.w - halfW, c.x));
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

/**
 * Zoom by `factor` about screen (sx, sy), stopping at the limits: the factor is cut to what the
 * zoom range allows *before* the centre is worked out, so zooming in at MAX_ZOOM (or out at the
 * whole map) leaves the view where it is instead of sliding it toward the pointer.
 */
export function zoomBy(c: Camera, world: Extent, view: Viewport, sx: number, sy: number, factor: number): Camera {
  const zoom = Math.max(fitZoom(world, view), Math.min(MAX_ZOOM, c.zoom * factor));
  return clamp(zoomAt(c, view, sx, sy, zoom / c.zoom), world, view);
}

/** The world point under minimap pixel (mx, my) (device px, as pointer events give them): where a click there jumps. */
export function fromMinimap(world: Extent, view: Viewport, dpr: number, mx: number, my: number): [number, number] {
  const r = minimapRect(world, view, dpr);
  return [(world.x0 ?? 0) + ((mx - r.x) / r.w) * world.w, ((my - r.y) / r.h) * world.h];
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
export function minimapRect(world: Extent, view: Viewport, dpr: number): { x: number; y: number; w: number; h: number } {
  const margin = 8 * dpr;
  const w = Math.min(view.w * 0.28, 180 * dpr);
  const h = (w * world.h) / world.w;
  return { x: view.w - w - margin, y: view.h - h - margin, w, h };
}

/** A place a view was asked to centre on (the field's centreOn): `span`, world units to fit across the view's shorter side. */
export interface Aim {
  x: number;
  y: number;
  span?: number;
}

/**
 * The camera a view draws with: c, or, while it holds an aim, centred on the aim (at c's zoom, or zoomed to its span),
 * clamped to the map in this view. The aim is kept and clamped afresh each frame: a view's box takes its shape a frame or
 * two after a switch, and a camera clamped once in the passing box would keep that box's centre.
 */
export function aimed(c: Camera, aim: Aim | null, world: Extent, view: Viewport): Camera {
  if (!aim) return clamp(c, world, view);
  return clamp({ x: aim.x, y: aim.y, zoom: aim.span ? Math.min(view.w, view.h) / aim.span : c.zoom }, world, view);
}
