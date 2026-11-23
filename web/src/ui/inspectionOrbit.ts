import { PLANE } from "../colony/index.ts";

export interface InspectionOrbit {
  yaw: number;
  tilt: number;
}
export const mapOrbit = (): InspectionOrbit => ({ yaw: 0, tilt: 0 });
export function dragOrbit(start: InspectionOrbit, dx: number, dy: number): InspectionOrbit {
  return { yaw: start.yaw + dx * 0.012, tilt: Math.max(-1.15, Math.min(1.15, start.tilt + dy * 0.01)) };
}
export function orbitCamera(
  mode: "surface" | "below",
  { yaw, tilt }: InspectionOrbit,
): { position: [number, number, number]; up: [number, number, number] } {
  const s = Math.sin(yaw),
    c = Math.cos(yaw),
    st = Math.sin(tilt),
    ct = Math.cos(tilt);
  return mode === "surface"
    ? { position: [s * st * 8, -c * st * 8, ct * 8], up: [-s * ct, c * ct, st] }
    : { position: [s * ct * 8, -c * ct * 8, st * 8], up: [-s * st, c * st, ct] };
}
export const BELOW_WALK_PLANE = 1.08;

/** The close map rotates about the walking plane under the center control. */
export function mapTiltTarget(mode: "surface" | "below", x: number, y: number): [number, number, number] {
  return mode === "surface" ? [x, -y, 0] : [x, BELOW_WALK_PLANE, -y];
}

export function inspectionFrameScale(
  points: readonly (readonly [number, number, number])[],
  mode: "surface" | "below",
  orbit: InspectionOrbit,
): number {
  const { position, up } = orbitCamera(mode, orbit),
    b = position.map((v) => v / 8),
    r = [up[1] * b[2] - up[2] * b[1], up[2] * b[0] - up[0] * b[2], up[0] * b[1] - up[1] * b[0]],
    target = mode === "surface" ? [0, 0, 0.15] : [0, 0.6, 0];
  let scale = 1;
  for (const p of points) {
    const q = p.map((v, i) => v - target[i]),
      dot = (a: number[]) => q.reduce((s, v, i) => s + v * a[i], 0);
    scale = Math.max(scale, Math.abs(dot(r)) / (2.15 * 0.94), Math.abs(dot(up)) / (1.792 * 0.94));
  }
  return scale;
}

/**
 * The tilt a vertical drag of `dy` CSS pixels (down is positive) gives the close map from `start`: dragging up tilts the map (the stored tilt is
 * negative, at most to the orbit's limit), and dragging down flattens it but never passes the flat map.
 */
export const tiltFromDrag = (start: InspectionOrbit, dy: number): number => Math.min(0, dragOrbit(start, 0, dy).tilt);

/**
 * The orbit the map's voxel camera takes for the layer shown. The stored tilt is never positive; Above (the plane) and Below (the curtain)
 * face different planes, so their camera pitch signs differ: Above's camera takes the tilt negated (so it is never negative), Below's as stored.
 */
export const mapCameraOrbit = (layer: number, orbit: InspectionOrbit): InspectionOrbit =>
  layer === PLANE ? { ...orbit, tilt: -orbit.tilt } : orbit;

export interface CameraPose {
  target: [number, number, number];
  position: [number, number, number];
  up: [number, number, number];
}

/**
 * Where the inspection scene's camera stands and looks: the orbit's offset from its target. With a live viewport (`view`: the map's close
 * camera, in cells from the selected cell) the target is the ground point under the map's centre and the camera pivots about it; without
 * one it is the inspection patch's own centre (a little above the surface, or 0.6 into the curtain).
 */
export function inspectionCameraPose(
  mode: "surface" | "below",
  orbit: InspectionOrbit,
  view?: { x: number; y: number } | null,
): CameraPose {
  const target: [number, number, number] = view ? mapTiltTarget(mode, view.x, view.y) : mode === "surface" ? [0, 0, 0.15] : [0, 0.6, 0];
  const o = orbitCamera(mode, orbit);
  return { target, position: [target[0] + o.position[0], target[1] + o.position[1], target[2] + o.position[2]], up: o.up };
}

/**
 * Half the orthographic frustum's width and height in world units. A live viewport shows what its raster size and scale say (so the world keeps
 * its scale across raster sizes and zoom); the inspection patch fits its `frame` (inspectionFrameScale) in a 4.3 by 3.584 box.
 */
export function inspectionFrustumHalf(
  view: { width: number; height: number; pixelsPerWorld: number } | null | undefined,
  frame: number,
): { halfWidth: number; halfHeight: number } {
  return view
    ? { halfWidth: view.width / view.pixelsPerWorld / 2, halfHeight: view.height / view.pixelsPerWorld / 2 }
    : { halfWidth: 2.15 * frame, halfHeight: 1.792 * frame };
}
