// The colony field's camera, pure: where the view is centred (in cells) and
// how many device pixels a cell takes. The field draws through it, pointer
// events come back through it, and every rule about how far you may zoom or
// pan lives here, where a test can reach it. Zoomed all the way out, the
// whole map fits the view; zoomed in, the view never leaves the map. A map
// runs from x0 (0 but for one world's curtain, whose columns are the line's s
// and start below 0) to x0 + w, and from 0 to h.
//
// An endless plane (docs/endless-world.md §8, `Extent.endless`) has no whole map to fit: the least zoom is a fixed number (ENDLESS_MIN_ZOOM),
// "zoomed in" is a zoom level (ENDLESS_ZOOMED_IN), and the view may go anywhere inside `reachOf(world)`, the ONE place a bound on the view
// lives. Today that is the nominal box (the limit of correctness of the chunk and cell keys); the fog (ja-1ypq.7) will set `Extent.reach` to the
// explored ground plus a margin and change nothing else here.

/** The map's extent in world units: x from x0 (default 0) to x0 + w, y from 0 to h. */
export interface Extent {
  x0?: number;
  w: number;
  h: number;
  /** An endless plane: no edge to fit or clamp to (see the header); `w` and `h` are only its nominal box. */
  endless?: true;
  /** Endless only: where the view may go (reachOf). Absent: the nominal box. The fog sets it to explored ground plus a margin. */
  reach?: Reach;
  /** Endless only: what `fit` shows, the start nests and a margin. Absent: the reach (which `fit` shows at the least zoom). */
  home?: Reach;
}

/** A rectangle of the plane in world units: from (x0, y0), w wide and h tall. */
export interface Reach {
  x0: number;
  y0: number;
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
  /** Backing pixels per CSS pixel; absent means 1. */
  dpr?: number;
}

/** Closest zoom in CSS pixels per world unit, reaching inspection-scale detail. */
export const MAX_ZOOM = 360;

/** An endless plane's least zoom, in CSS pixels per world unit (times the view's dpr): the same however far the plane reaches. */
export const ENDLESS_MIN_ZOOM = 0.5;

/** An endless plane counts as "zoomed in" (the minimap shows) past this zoom, in CSS pixels per world unit: about where a 512-wide map fits a 1000 px view. */
export const ENDLESS_ZOOMED_IN = 2;

/**
 * Where the view's edges may go: the one bound on the camera. A bounded map: the map. An endless plane: `world.reach` when set (the fog's
 * explored ground plus a margin), else its nominal box, centred on the origin in y (an endless plane has rows above and below 0).
 */
export function reachOf(world: Extent): Reach {
  if (!world.endless) return { x0: world.x0 ?? 0, y0: 0, w: world.w, h: world.h };
  return world.reach ?? { x0: world.x0 ?? -world.w / 2, y0: -world.h / 2, w: world.w, h: world.h };
}

/** The least zoom: a bounded map's whole map fitting the view, an endless plane's fixed ENDLESS_MIN_ZOOM. */
export function minZoom(world: Extent, view: Viewport): number {
  return world.endless ? ENDLESS_MIN_ZOOM * (view.dpr ?? 1) : Math.min(view.w / world.w, view.h / world.h);
}

/** The zoom `fit` starts at: the whole bounded map; on an endless plane the home rectangle (between the least zoom and MAX_ZOOM). */
export function fitZoom(world: Extent, view: Viewport): number {
  if (!world.endless) return Math.min(view.w / world.w, view.h / world.h);
  const h = homeOf(world);
  const z = Math.min(view.w / h.w, view.h / h.h);
  return Math.max(minZoom(world, view), Math.min(MAX_ZOOM * (view.dpr ?? 1), z));
}

/** What an endless plane's `fit` shows: `home`, else the reach. */
function homeOf(world: Extent): Reach {
  return world.home ?? reachOf(world);
}

/** The whole map, centred; on an endless plane its home (the start nests), clamped to the reach. */
export function fit(world: Extent, view: Viewport): Camera {
  if (!world.endless) return { x: (world.x0 ?? 0) + world.w / 2, y: world.h / 2, zoom: fitZoom(world, view) };
  const h = homeOf(world);
  return clamp({ x: h.x0 + h.w / 2, y: h.y0 + h.h / 2, zoom: fitZoom(world, view) }, world, view);
}

/** Whether the camera is showing what `fit` gives (the page then refits it as the box changes). An endless plane's is the home view only while the camera is on it. */
export function isFitted(world: Extent, view: Viewport, c: Camera): boolean {
  if (!world.endless) return c.zoom <= fitZoom(world, view) * 1.0001;
  const f = fit(world, view);
  return Math.abs(c.zoom - f.zoom) <= f.zoom * 1e-4 && Math.abs(c.x - f.x) < 1e-6 && Math.abs(c.y - f.y) < 1e-6;
}

/** Whether the view counts as zoomed in (the minimap shows): past the whole map by a twentieth, or past ENDLESS_ZOOMED_IN on an endless plane. */
export function isZoomedIn(world: Extent, view: Viewport, zoom: number): boolean {
  return world.endless ? zoom > ENDLESS_ZOOMED_IN * (view.dpr ?? 1) : zoom > fitZoom(world, view) * 1.05;
}

/** Zoom between the least zoom and MAX_ZOOM; the centre kept so the view stays inside `reachOf` (or centred on an axis the reach doesn't fill). */
export function clamp(c: Camera, world: Extent, view: Viewport): Camera {
  const zoom = Math.max(minZoom(world, view), Math.min(MAX_ZOOM * (view.dpr ?? 1), c.zoom));
  const halfW = view.w / zoom / 2;
  const halfH = view.h / zoom / 2;
  const r = reachOf(world);
  const x = halfW * 2 >= r.w ? r.x0 + r.w / 2 : Math.max(r.x0 + halfW, Math.min(r.x0 + r.w - halfW, c.x));
  const y = halfH * 2 >= r.h ? r.y0 + r.h / 2 : Math.max(r.y0 + halfH, Math.min(r.y0 + r.h - halfH, c.y));
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
 * least zoom) leaves the view where it is instead of sliding it toward the pointer.
 */
export function zoomBy(c: Camera, world: Extent, view: Viewport, sx: number, sy: number, factor: number): Camera {
  const zoom = Math.max(minZoom(world, view), Math.min(MAX_ZOOM * (view.dpr ?? 1), c.zoom * factor));
  if (zoom === c.zoom) return clamp(c, world, view);
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
