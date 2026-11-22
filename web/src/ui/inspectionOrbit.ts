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
