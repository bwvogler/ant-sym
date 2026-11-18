export type HyphaPoint = readonly [number, number];
export const HYPHA_COLOURS = { body: "#F3F0DF", core: "#FFFFFF", edge: "#8A8976", knot: "#E3DDC5" } as const;
export function hyphaShape(a: HyphaPoint, b: HyphaPoint): { points: HyphaPoint[]; hairs: [HyphaPoint, HyphaPoint][] } {
  const reverse = a[0] > b[0] || (a[0] === b[0] && a[1] > b[1]),
    start = reverse ? b : a,
    end = reverse ? a : b,
    dx = end[0] - start[0],
    dy = end[1] - start[1],
    len = Math.hypot(dx, dy) || 1;
  const hash =
    (Math.imul(Math.round(start[0] * 100), 73856093) ^
      Math.imul(Math.round(start[1] * 100), 19349663) ^
      Math.imul(Math.round(end[0] * 100), 83492791)) >>>
    0;
  const points: HyphaPoint[] = [start],
    hairs: [HyphaPoint, HyphaPoint][] = [];
  for (let i = 1; i < 4; i++) {
    const t = i / 4,
      off = (((hash >>> (i * 4)) & 15) / 15 - 0.5) * 0.16;
    points.push([start[0] + dx * t - (dy / len) * off, start[1] + dy * t + (dx / len) * off]);
  }
  points.push(end);
  for (let i = 1; i < 4; i++) {
    const sign = i % 2 ? 1 : -1,
      size = 0.07 + ((hash >>> (i * 3)) & 3) * 0.02,
      p = points[i];
    hairs.push([p, [p[0] - (dy / len) * size * sign + dx * 0.035, p[1] + (dx / len) * size * sign + dy * 0.035]]);
  }
  return { points: reverse ? points.reverse() : points, hairs };
}
