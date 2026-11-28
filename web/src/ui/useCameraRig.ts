import { mapPixelRatio } from "./playbackOptions.ts";
import { useState, type RefObject } from "react";
import { mapOfLayer, type OneWorld } from "../colony/index.ts";
import { CameraRig, type Disc, type RigHost } from "./field/rig.ts";
import type { Followed } from "./follow.ts";
import type { SensedMap } from "./fungusSight.ts";

/** What the rig reads of the page each time it is asked: the shell's refs (it is built once, so it cannot close over a prop). */
export interface RigRefs {
  shown: RefObject<number>;
  worldRef: RefObject<OneWorld>;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  follow: RefObject<Followed | null>;
  followCb: RefObject<(f: Followed | null) => void>;
  /** what the hosts have sensed: the fog's knowledge bounds the camera (F7b) */
  sensed: RefObject<SensedMap>;
  /** the open flight pen (its circle), or null: the camera may go to its rim (ja-qpv.5.1.1) */
  pen: RefObject<Disc | null>;
}

/** What the rig reads of the page: each view's map is its layer's (the plane, or the curtain of the line that layer is). Exported for its test. */
export function rigHost(r: RigRefs): RigHost {
  return {
    view: () => r.shown.current,
    map: (v) => mapOfLayer(r.worldRef.current, v),
    size: () => ({ w: r.canvasRef.current?.width ?? 1, h: r.canvasRef.current?.height ?? 1 }),
    dpr: mapPixelRatio,
    following: () => !!r.follow.current,
    unfollow: () => {
      r.follow.current = null;
      r.followCb.current(null);
    },
    fog: () => r.sensed.current.knowledge,
    pen: () => r.pen.current,
  };
}

/** The cameras, one per view (ui/field/rig.ts); the rig reads the page through these refs each time it is asked. */
export function useCameraRig(r: RigRefs): CameraRig {
  const [rig] = useState(() => new CameraRig(rigHost(r)));
  return rig;
}
