import { useState, type RefObject } from "react";
import { PLANE, type OneWorld } from "../colony/index.ts";
import { CameraRig } from "./field/rig.ts";
import type { Followed } from "./follow.ts";

/** What the rig reads of the page each time it is asked: the shell's refs (it is built once, so it cannot close over a prop). */
export interface RigRefs {
  shown: RefObject<number>;
  worldRef: RefObject<OneWorld>;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  follow: RefObject<Followed | null>;
  followCb: RefObject<(f: Followed | null) => void>;
}

/** The cameras, one per view (ui/field/rig.ts); the rig reads the page through these refs each time it is asked. */
export function useCameraRig(r: RigRefs): CameraRig {
  const [rig] = useState(
    () =>
      new CameraRig({
        view: () => r.shown.current,
        map: (v) => (v === PLANE ? r.worldRef.current.plane : r.worldRef.current.curtain),
        size: () => ({ w: r.canvasRef.current?.width ?? 1, h: r.canvasRef.current?.height ?? 1 }),
        dpr: () => Math.min(2, window.devicePixelRatio || 1),
        following: () => !!r.follow.current,
        unfollow: () => {
          r.follow.current = null;
          r.followCb.current(null);
        },
      }),
  );
  return rig;
}
