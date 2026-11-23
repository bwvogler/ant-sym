// The inspection tilt of the close map (ja-fnd.6.3.12, docs/field-split.md): the orbit handle drags it, the keys step it. Plain TypeScript over the
// orbit ref and the camera rig's two calls, so a Node test runs it.

import { MAP_ORBIT_READY_ZOOM } from "../mapVoxel.ts";
import { tiltFromDrag, mapOrbit, type InspectionOrbit } from "../inspectionOrbit.ts";
import type { Camera } from "../camera.ts";

/** What the tilt reads and does on the page. */
export interface OrbitHost {
  orbit: { current: InspectionOrbit };
  camera: () => Camera;
  setCamera: (c: Camera) => void;
  dpr: () => number;
}

/** Tilt the map by a drag of `dy` from `start`: a new tilt zooms in to the close view first when the camera is still farther out. */
export function tiltMap(h: OrbitHost, start: InspectionOrbit, dy: number): void {
  const tilt = tiltFromDrag(start, dy);
  if (tilt === h.orbit.current.tilt) return;
  const current = h.camera();
  const readyZoom = MAP_ORBIT_READY_ZOOM * h.dpr();
  if (current.zoom < readyZoom) h.setCamera({ ...current, zoom: readyZoom });
  h.orbit.current = { yaw: 0, tilt };
}

/** Stand the map upright again (a double-click on the handle, Home, Escape). */
export function resetOrbit(h: OrbitHost): void {
  h.orbit.current = mapOrbit();
}

/** The handle's keys: Home and Escape reset the tilt, the up and down arrows step it; true when the key was the handle's. */
export function orbitKey(h: OrbitHost, key: string): boolean {
  if (key === "Home" || key === "Escape") resetOrbit(h);
  else if (key === "ArrowUp" || key === "ArrowDown") tiltMap(h, h.orbit.current, key === "ArrowUp" ? -12 : 12);
  else return false;
  return true;
}
