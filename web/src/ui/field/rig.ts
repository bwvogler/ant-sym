// The field's cameras (ja-fnd.6.3.11, docs/field-split.md): one camera per view, and what moves them: a clamped read, a set, the
// wheel's zoom around a point, the page's centreOn, the whole map, a nest, a jump on the minimap. Plain TypeScript with no DOM
// (the shell's host gives the canvas's size, the device ratio and the follow), so a unit test runs it. `ui/camera.ts` holds the maths;
// this holds the state the maths is applied to.

import { isEndless, worldExtent, type WorldMap } from "../../colony/index.ts";
import {
  clamp,
  fit,
  fitZoom,
  fromMinimap,
  isFitted,
  isZoomedIn,
  minimapRect,
  pan,
  type Camera,
  type Extent,
  type Viewport,
  zoomBy,
} from "../camera.ts";
import type { ViewCam } from "./prelude.ts";

/** A map's extent in world units, from its first column (x0: one world's curtain starts below 0): what the camera fits and clamps to. */
export function extentOf(m: WorldMap): Extent & { x0: number } {
  const e = { x0: m.x0, ...worldExtent(m) };
  if (!isEndless(m)) return e;
  // An endless plane (camera.ts header): no whole map to fit, so `fit` shows the start nests and a margin.
  const [a, b] = m.plane.startNests();
  const pad = Math.max(30, 0.25 * Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)));
  const x0 = Math.min(a.x, b.x) - pad;
  const y0 = Math.min(a.y, b.y) - pad;
  return { ...e, endless: true, home: { x0, y0, w: Math.max(a.x, b.x) + pad - x0, h: Math.max(a.y, b.y) + pad - y0 } };
}

/** A linked click opens the other view at least this close (CSS px a cell, as `n` goes to a nest). */
export const LINK_ZOOM = 8;
/** `n` goes to a nest at least this close (CSS px a cell). */
export const NEST_ZOOM = 8;

/** A pan on the ground by a drag or a key of (dx, dy) device pixels: on a tilted map (the inspection orbit's tilt, radians) a vertical move covers more ground than it shows. */
export function panGround(c: Camera, dx: number, dy: number, tilt: number | null): Camera {
  return pan(c, dx, tilt === null ? dy : dy / Math.cos(tilt));
}

export const NEW_CAM = (): ViewCam => ({ cam: null, fitted: true, zoomedIn: false, aim: null });

/** What the rig reads of the page, each time it is asked (so a changed view, size or follow is never stale). */
export interface RigHost {
  /** the view shown: PLANE or CURTAIN */
  view: () => number;
  /** a view's map */
  map: (view: number) => WorldMap;
  /** the canvas's size in device pixels (1 by 1 before there is a canvas) */
  size: () => { w: number; h: number };
  /** the device pixel ratio, at most 2 */
  dpr: () => number;
  /** whether an ant is followed */
  following: () => boolean;
  /** stop following now (the ref at once, the page's state after) */
  unfollow: () => void;
}

export class CameraRig {
  /** each view's camera, by view: PLANE and CURTAIN */
  readonly cams = new Map<number, ViewCam>();
  private readonly host: RigHost;

  constructor(host: RigHost) {
    this.host = host;
  }

  /** A new game starts zoomed out, in both views. */
  clear(): void {
    this.cams.clear();
  }

  /** A view's camera, made when first asked for. */
  of(view: number): ViewCam {
    let s = this.cams.get(view);
    if (!s) this.cams.set(view, (s = NEW_CAM()));
    return s;
  }

  /** The shown view's camera. */
  vc(): ViewCam {
    return this.of(this.host.view());
  }

  /** The shown map's extent, read afresh: one world's curtain widens when a colony is founded. */
  extent(): Extent & { x0: number } {
    return extentOf(this.host.map(this.host.view()));
  }

  viewport(): Viewport {
    const { w, h } = this.host.size();
    return { w, h, dpr: this.host.dpr() };
  }

  /** The shown view's camera, kept within the map and fitted the first time. */
  camera(): Camera {
    const s = this.vc();
    const we = this.extent();
    s.cam = clamp(s.cam ?? fit(we, this.viewport()), we, this.viewport());
    return s.cam;
  }

  /** Move the shown view's camera (the player did): clamped, with no aim kept, and whether it shows the whole map or is zoomed in noted. */
  set(c: Camera): void {
    const s = this.vc();
    const we = this.extent();
    const vp = this.viewport();
    const cam = clamp(c, we, vp);
    s.cam = cam;
    s.aim = null;
    s.zoomedIn = isZoomedIn(we, vp, cam.zoom);
    s.fitted = isFitted(we, vp, cam);
  }

  /** Zoom the shown view by `factor` about device point (sx, sy) in a box `v` (the wheel's own box: its ratio is the canvas's, not the device's). */
  zoomAround(v: Viewport, sx: number, sy: number, factor: number): void {
    const s = this.vc();
    const we = this.extent();
    const c = zoomBy(s.cam ?? fit(we, v), we, v, sx, sy, factor);
    s.cam = c;
    s.aim = null;
    s.zoomedIn = isZoomedIn(we, v, c.zoom);
    s.fitted = isFitted(we, v, c);
  }

  /**
   * The page's handle (FieldApi.centreOn): centre view `v` on world (x, y), the camera that view opens with. Looking elsewhere in the
   * view shown ends a follow (as a drag does); a follow carried to the other view goes on. `keepFollow`: the page carrying the followed
   * ant itself (an ant that pops up a hole and straight back down asks for the view still shown), which must not drop it.
   */
  centreOn(v: number, x: number, y: number, how: { close?: boolean; span?: number; keepFollow?: boolean } = {}): void {
    if (v === this.host.view() && this.host.following() && !how.keepFollow) this.host.unfollow();
    const s = this.of(v);
    const we = extentOf(this.host.map(v));
    const vp = this.viewport();
    const now = this.cams.get(this.host.view())?.cam?.zoom ?? fitZoom(we, vp);
    const zoom = how.span ? Math.min(vp.w, vp.h) / how.span : how.close ? Math.max(now, LINK_ZOOM * this.host.dpr()) : now;
    // Not clamped here: each frame clamps round the aim in the box it is drawn in (ViewCam.aim).
    s.cam = { x, y, zoom };
    s.aim = { x, y, ...(how.span ? { span: how.span } : {}) };
    s.fitted = false;
    s.zoomedIn = isZoomedIn(we, vp, zoom);
  }

  /** The whole map, in the view shown (the key 0). */
  showAll(): void {
    this.host.unfollow();
    this.set(fit(this.extent(), this.viewport()));
  }

  /** Centre on a nest (the key n): between its entrance and its chamber, so both the ground line and the nest are in view. */
  goTo(nest: { x: number; y: number; entrance?: { x: number; y: number } | null }): void {
    this.host.unfollow();
    const e = nest.entrance;
    const hx = e ? (e.x + nest.x) / 2 : nest.x;
    const hy = e ? (e.y + nest.y) / 2 : nest.y;
    this.set({ x: hx, y: hy, zoom: Math.max(this.camera().zoom, NEST_ZOOM * this.host.dpr()) });
  }

  /** Whether device point (x, y) is on the minimap: only while it is drawn (the view zoomed in). */
  inMini(x: number, y: number): boolean {
    const ext = this.extent();
    if (!this.vc().zoomedIn || ext.endless) return false; // an endless plane's minimap is E5.3's (minimap.ts draws none yet)
    const r = minimapRect(ext, this.viewport(), this.host.dpr());
    return x >= r.x && y >= r.y && x <= r.x + r.w && y <= r.y + r.h;
  }

  /** A click or drag on the minimap: look at the world point under it (a follow ends). */
  jumpMini(x: number, y: number): void {
    if (this.host.following()) this.host.unfollow();
    const [wx, wy] = fromMinimap(this.extent(), this.viewport(), this.host.dpr(), x, y);
    this.set({ ...this.camera(), x: wx, y: wy });
  }
}
