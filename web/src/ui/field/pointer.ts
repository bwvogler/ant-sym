// The field's pointer gestures (ja-fnd.6.3.11 part 2, docs/field-split.md): one pointer drags (pans), two pinch, a tap picks an ant, the
// minimap jumps, a tool in hand paints, the tweezers lift. A state machine over what the pointers do, with no DOM: the shell turns each
// browser event into a `PointerInput` (device pixels), hands the controller this render's `PointerHost` (the page's ports, as the
// handlers closed over them before), and does what only an event can do (capture the pointer, focus the canvas, stop a middle-click's
// scroll). A unit test drives it with a fake host; e2e proves the real page.

import { pan, toWorld, zoomBy, type Camera, type Extent, type Viewport } from "../camera.ts";
import type { Followed } from "../follow.ts";

/** The pointer gesture under way; `moved` is how far it has travelled (device px), (sx, sy) where it started. */
export type Gesture = {
  kind: "pan" | "pinch" | "mini" | "paint" | "tweeze" | "none";
  moved: number;
  button: number;
  sx: number;
  sy: number;
  /** the ant the tweezers hold */
  ant?: Followed;
  /**
   * A finger's (or pen's) stroke or lift not begun yet: it starts once the finger has moved past a click's slop, or places on lifting
   * as a tap. A second finger landing first makes it a pinch instead, and nothing was built (a pinch with a brush in hand used to
   * drop the brush where the first finger landed).
   */
  pending?: boolean;
};
export const NO_GESTURE: Gesture = { kind: "none", moved: 0, button: 0, sx: 0, sy: 0 };

/** A pointer event, as the controller reads it: the canvas point in device pixels, and what the event said of the pointer. */
export interface PointerInput {
  id: number;
  /** "mouse", "touch" or "pen" */
  pointerType: string;
  /** the button that went down or up (0 the main one, 1 the middle) */
  button: number;
  /** the buttons held (bit 0 the main one) */
  buttons: number;
  x: number;
  y: number;
  /** a touch whose contact is too big for a fingertip (`isPalm`): the builder sets it aside */
  palm?: boolean;
}

/** What the builder offers the pointer: the tool in hand, and the tweezers' lift. */
export interface PointerBuild {
  tool: string | null;
  onTweeze?: (k: number, i: number, x: number, y: number, first: boolean) => void;
}

/** The cameras the controller moves (the `CameraRig`'s methods). */
export interface PointerRig {
  camera(): Camera;
  set(c: Camera): void;
  viewport(): Viewport;
  extent(): Extent & { x0: number };
  inMini(x: number, y: number): boolean;
  jumpMini(x: number, y: number): void;
}

/** What the controller reads and does on the page: given afresh for each event, so nothing is stale. */
export interface PointerHost {
  rig: PointerRig;
  /** a click's slop, in device pixels */
  slop(): number;
  /** the map is tilted (the inspection orbit): a pan is along the ground, and a pinch zooms about the centre */
  angled(): boolean;
  /** the tilt, radians */
  tilt(): number;
  build(): PointerBuild | null;
  /** the nearest ant under a device point, on the shown layer */
  pick(x: number, y: number): Followed | null;
  /** a piece of the builder's stroke, device points */
  paint(points: [number, number][], first: boolean): void;
  /** whether the top view is shown */
  onPlane(): boolean;
  following(): boolean;
  /** follow this ant now (or stop, with null): the ref at once, the page's state after */
  follow(f: Followed | null): void;
  /** the pointer over the canvas, for the pen's preview */
  setHover(x: number, y: number): void;
  lensOn(): boolean;
  /** report a device point to the lens; pinned keeps the card up */
  probe(x: number, y: number, pinned: boolean): void;
  /** the queen's pen, while it is open: where she flies, in world units */
  pen(): { onPick: (p: { x: number; y: number }) => void } | null;
  labelsOn(): boolean;
  chamberAt(x: number, y: number): { k: number; id: number } | null;
  onChamber?: (k: number, id: number) => void;
  /** a click on nothing: the other view at that place */
  link(x: number, y: number): void;
}

export class PointerController {
  /** the pointers down, by id: where each last was (device px) */
  readonly pointers = new Map<number, { x: number; y: number }>();
  gesture: Gesture = NO_GESTURE;
  /** touches the builder set aside as palms, by id */
  private readonly palms = new Set<number>();

  /** A pointer went down. False when it was set aside as a palm: the shell then neither captures it nor focuses the canvas. */
  down(host: PointerHost, e: PointerInput): boolean {
    // The builder sets a palm aside (a child's resting hand is no finger: docs/builder.md, design).
    if (host.build() && e.palm) {
      this.palms.add(e.id);
      return false;
    }
    const { x, y } = e;
    this.pointers.set(e.id, { x, y });
    if (this.pointers.size === 2) {
      this.gesture = { ...NO_GESTURE, kind: "pinch", moved: Infinity };
      return true;
    }
    if (this.pointers.size > 2) return true;
    const start = { moved: 0, sx: x, sy: y };
    const build = host.build();
    if (e.button === 0 && host.rig.inMini(x, y)) {
      this.gesture = { ...NO_GESTURE, ...start, kind: "mini" };
      host.rig.jumpMini(x, y);
    } else if (host.angled()) {
      this.gesture = { ...NO_GESTURE, ...start, kind: "pan", button: e.button };
    } else if (e.button === 0 && build?.tool === "tweezers") {
      // The tweezers lift the ant under the finger, on the top view only; with none there the finger pans as ever.
      const ant = host.onPlane() ? host.pick(x, y) : null;
      if (ant) {
        // A finger waits to see whether a second joins it (a pinch); a mouse lifts at once.
        const held = e.pointerType !== "mouse";
        this.gesture = { ...NO_GESTURE, ...start, kind: "tweeze", ant, pending: held };
        if (!held) {
          const [wx, wy] = toWorld(host.rig.camera(), host.rig.viewport(), x, y);
          build.onTweeze?.(ant.k, ant.i, wx, wy, true);
        }
      } else this.gesture = { ...NO_GESTURE, ...start, kind: "pan", button: e.button };
    } else if (e.button === 0 && build?.tool) {
      // A tool in hand: a drag paints, and a tap places. A finger waits to see whether a second joins it (two fingers pan and
      // zoom, as with no tool): it builds once it has moved past the slop, or on lifting as a tap. A mouse builds at once.
      const held = e.pointerType !== "mouse";
      this.gesture = { ...NO_GESTURE, ...start, kind: "paint", pending: held };
      if (!held) host.paint([[x, y]], true);
    } else this.gesture = { ...NO_GESTURE, ...start, kind: "pan", button: e.button };
    return true;
  }

  /** A pointer moved (down or not). */
  move(host: PointerHost, e: PointerInput): void {
    const { x, y } = e;
    host.setHover(x, y);
    // The lens follows a mouse over the map (no button down); a finger taps instead (up).
    if (!host.angled() && host.lensOn() && e.pointerType === "mouse" && this.pointers.size === 0) host.probe(x, y, false);
    const prev = this.pointers.get(e.id);
    if (!prev) return;
    const g = this.gesture;
    const rig = host.rig;
    if (g.kind === "pinch" && this.pointers.size >= 2) {
      let other = prev;
      for (const [id, p] of this.pointers) if (id !== e.id) other = p;
      const before = Math.hypot(prev.x - other.x, prev.y - other.y);
      const after = Math.hypot(x - other.x, y - other.y);
      const v = rig.viewport();
      const sx = host.angled() ? v.w / 2 : (x + other.x) / 2;
      const sy = host.angled() ? v.h / 2 : (y + other.y) / 2;
      const c = zoomBy(rig.camera(), rig.extent(), v, sx, sy, before > 0 ? after / before : 1);
      rig.set(this.panMap(host, c, (x - prev.x) / 2, (y - prev.y) / 2));
    } else if (g.kind === "pan") {
      const was = g.moved;
      g.moved += Math.abs(x - prev.x) + Math.abs(y - prev.y);
      if (g.moved > host.slop()) {
        if (host.following()) host.follow(null);
        // Crossing the slop, catch up from where the drag began, so the ground stays under the pointer.
        rig.set(
          was <= host.slop()
            ? this.panMap(host, rig.camera(), x - g.sx, y - g.sy)
            : this.panMap(host, rig.camera(), x - prev.x, y - prev.y),
        );
      }
    } else if (g.kind === "mini" && e.buttons & 1) rig.jumpMini(x, y);
    else if (g.kind === "paint") {
      if (g.pending) {
        g.moved += Math.abs(x - prev.x) + Math.abs(y - prev.y);
        // Still within a click's slop: not yet a stroke (a second finger may be on its way).
        if (g.moved > host.slop()) {
          g.pending = false;
          host.paint(
            [
              [g.sx, g.sy],
              [x, y],
            ],
            true,
          );
        }
      } else
        host.paint(
          [
            [prev.x, prev.y],
            [x, y],
          ],
          false,
        );
    } else if (g.kind === "tweeze" && g.ant) {
      if (g.pending) {
        g.moved += Math.abs(x - prev.x) + Math.abs(y - prev.y);
        if (g.moved > host.slop()) {
          g.pending = false;
          const [sx, sy] = toWorld(rig.camera(), rig.viewport(), g.sx, g.sy);
          host.build()?.onTweeze?.(g.ant.k, g.ant.i, sx, sy, true);
        }
      }
      if (!g.pending) {
        const [wx, wy] = toWorld(rig.camera(), rig.viewport(), x, y);
        host.build()?.onTweeze?.(g.ant.k, g.ant.i, wx, wy, false);
      }
    }
    this.pointers.set(e.id, { x, y });
  }

  /** A pointer went up, or its gesture was cancelled (the browser took it back). */
  up(host: PointerHost, e: PointerInput, cancelled = false): void {
    if (this.palms.delete(e.id)) return;
    const g = this.gesture;
    const p = this.pointers.get(e.id);
    this.pointers.delete(e.id);
    // A tap with a tool in hand places it, where the finger landed (it built nothing while a second finger might have joined).
    if (!cancelled && g.kind === "paint" && g.pending) host.paint([[g.sx, g.sy]], true);
    if (!host.angled() && !cancelled && g.kind === "pan" && g.button === 0 && g.moved <= host.slop() && p) {
      const pen = host.pen();
      if (host.lensOn() && !(pen && host.onPlane())) {
        // The lens on: a click (a tap) says what is there, and keeps the card up; it follows nothing. The queen's pen keeps its click.
        host.probe(p.x, p.y, true);
      } else if (pen && host.onPlane()) {
        // The queen's pen: a click on the top view is where she flies (the page founds there, or says why not).
        const [wx, wy] = toWorld(host.rig.camera(), host.rig.viewport(), p.x, p.y);
        pen.onPick({ x: wx, y: wy });
      } else {
        const f = host.pick(p.x, p.y);
        host.follow(f);
        const hit = !f && host.labelsOn() && host.onChamber ? host.chamberAt(p.x, p.y) : null;
        if (hit) host.onChamber!(hit.k, hit.id);
        else if (!f) host.link(p.x, p.y);
      }
    }
    if (this.pointers.size === 0) this.gesture = NO_GESTURE;
    // A pinch stays a pinch while two fingers are down (a third lifted); the last finger left pans, and never clicks.
    else if (g.kind === "pinch" && this.pointers.size === 1) this.gesture = { ...NO_GESTURE, kind: "pan", moved: Infinity };
  }

  /** A pan on the ground: on a tilted map a vertical drag covers more ground than it shows. */
  private panMap(host: PointerHost, c: Camera, dx: number, dy: number): Camera {
    return pan(c, dx, host.angled() ? dy / Math.cos(host.tilt()) : dy);
  }
}
