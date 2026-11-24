// What a frame does before it draws (ja-fnd.6.3.13, docs/field-split.md): the follow, the crossing through a hole, and the camera's ease.
// Plain TypeScript with no DOM, so a unit test runs it; ColonyField calls it once a frame, after the canvas is sized and the shown view is
// bound, and the frame then draws with the camera it returns.

import type { Colony } from "../../colony/index.ts";
import { aimed, clamp, fit, isZoomedIn, type Aim, type Camera, type Extent, type Viewport } from "../camera.ts";
import { LIVE, type Knowledge } from "../fog/knowledge.ts";
import { followedColony, type Followed } from "../follow.ts";

/** One view's camera: kept per view, so switching between above and below resets neither. */
export interface ViewCam {
  cam: Camera | null;
  /** the view shows the whole map: it stays fitted when the canvas is resized (a phone turned, the layout reflowing) */
  fitted: boolean;
  /** whether the view is zoomed in past the whole map (the minimap shows, and takes clicks) */
  zoomedIn: boolean;
  /**
   * Where the page asked the view to centre (FieldApi.centreOn; `span`: world units across the box's shorter side): kept,
   * and the camera clamped round it in whatever box the view is drawn in (the box takes the view's shape a frame or two
   * after a switch), until the player moves the camera or a follow takes it. Without it a frame drawn in the passing box
   * clamped the place away for good.
   */
  aim: Aim | null;
}

/** The state the prelude reads and writes between frames (the shell's refs, passed as plain objects with a `current`). */
export interface PreludeRefs {
  /** the followed ant: nulled here when it is gone */
  follow: { current: Followed | null };
  /** told when the followed ant is gone */
  followCb: { current: (f: Followed | null) => void };
  /** the followed ant's layer when last drawn: a change is a crossing (a new follow starts afresh) */
  antLayer: { current: { f: Followed; layer: number } | null };
  /**
   * The layer the page was last asked to show for the followed ant (crossCb), until the view shown is it: a crossing is
   * judged against the view on its way, not the one still drawn. An ant flicking up and down a hole within the frame or
   * two the switch takes otherwise left the view on the wrong side of it (the e2e guard caught one in twenty runs).
   */
  carryTo: { current: number | null };
  /** told when the followed ant goes through a hole: the page carries the camera across (U5.2) */
  crossCb: { current: ((layer: number, x: number, y: number) => void) | undefined };
  /** told when the followed ant is no longer sensed, under the fog: the follow has ended */
  lostCb?: { current: ((f: Followed) => void) | undefined };
  /** what the fungus knows of the ground (the fog of war); null: no fog */
  fog?: Knowledge | null;
}

/**
 * Follow an ant: the camera centres on it; an ant that is gone (dead, or its slot reborn) ends the follow. In one world, an ant on the
 * other layer than the view's holds the camera where it was (carrying it across: U5.2). Then the camera the frame draws with: the whole
 * map while the view is fitted, else the view's camera eased toward its aim. Writes the view's `cam` and `zoomedIn`.
 */
export function prepareFrame(colonies: readonly Colony[], lv: number, ext: Extent, v: Viewport, s: ViewCam, refs: PreludeRefs): Camera {
  const { follow, followCb, antLayer, carryTo, crossCb } = refs;
  const f = follow.current;
  let fcol = f ? followedColony(colonies, f) : null;
  // Under the fog the camera follows only an ant an observer senses now (a host always is): out of sight, the follow ends.
  if (f && fcol && refs.fog && refs.fog.stateAt(fcol.layer[f.i]!, fcol.x[f.i]!, fcol.y[f.i]!) !== LIVE) {
    refs.lostCb?.current?.(f);
    fcol = null; // the follow ends below, as it does for an ant that is gone
  }
  const fHere = f !== null && fcol !== null && fcol.layer[f.i] === lv;
  if (f && !fcol) {
    follow.current = null;
    followCb.current(null);
  } else if (f && fcol && fHere && s.cam) {
    s.cam = { ...s.cam, x: fcol.x[f.i]!, y: fcol.y[f.i]! };
    s.aim = null;
  }
  // One world: the followed ant went through a hole, out of the view (its layer changed, not the view): the page is
  // told, and carries the camera across (U5.2).
  if (f && fcol) {
    const layer = fcol.layer[f.i]!;
    const was = antLayer.current;
    if (carryTo.current === lv || !was || was.f !== f) carryTo.current = null;
    if (was && was.f === f && was.layer !== layer && layer !== (carryTo.current ?? lv)) {
      carryTo.current = layer;
      crossCb.current?.(layer, fcol.x[f.i]!, fcol.y[f.i]!);
    }
    antLayer.current = { f, layer };
  } else {
    antLayer.current = null;
    carryTo.current = null;
  }
  const c = s.fitted || !s.cam ? clamp(fit(ext, v), ext, v) : aimed(s.cam, s.aim, ext, v);
  s.cam = c;
  s.zoomedIn = isZoomedIn(ext, v, c.zoom);
  return c;
}
