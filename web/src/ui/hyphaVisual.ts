import { wander } from "./hyphaeLook.ts";

export type HyphaPoint = readonly [number, number];
export const HYPHA_COLOURS = { body: "#F3F0DF", core: "#FFFFFF", edge: "#8A8976", knot: "#E3DDC5" } as const;
export function hyphaShape(a: HyphaPoint, b: HyphaPoint): { points: HyphaPoint[]; hairs: [HyphaPoint, HyphaPoint][] } {
  const reverse = a[0] > b[0] || (a[0] === b[0] && a[1] > b[1]),
    start = reverse ? b : a,
    end = reverse ? a : b,
    dx = end[0] - start[0],
    dy = end[1] - start[1],
    len = Math.hypot(dx, dy) || 1;
  const points: HyphaPoint[] = [];
  const hairs: [HyphaPoint, HyphaPoint][] = [];
  for (let i = 0; i <= 8; i++) {
    const point: [number, number] = [0, 0];
    wander(start[0] + (dx * i) / 8, start[1] + (dy * i) / 8, point);
    points.push(point);
  }
  for (let i = 1; i < 4; i++) {
    const sign = i % 2 ? 1 : -1,
      size = 0.1 + i * 0.02,
      p = points[i * 2];
    hairs.push([p, [p[0] - (dy / len) * size * sign + dx * 0.035, p[1] + (dx / len) * size * sign + dy * 0.035]]);
  }
  return { points: reverse ? points.reverse() : points, hairs };
}
