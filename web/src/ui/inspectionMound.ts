import { CELL, cellOf, cellKey, keyX, keyY, centreX, centreY } from "../colony/index.ts";
import type { InspectionPatch } from "./inspectionPatch.ts";

export interface DirtBall {
  id: string;
  x: number;
  y: number;
  z: number;
  radius: number;
  grain: number;
}

const pileCache = new Map<string, DirtBall[]>();
const RADIUS = 0.075,
  SPACING = RADIUS * 2,
  ROW_HEIGHT = (SPACING * Math.sqrt(3)) / 2,
  LAYER_HEIGHT = SPACING * Math.sqrt(2 / 3);

/** A shared close-packed lattice gives touching spheres identical positions on both sides of every hex boundary. */
export function moundBalls(level: number, seed: number): readonly DirtBall[] {
  const count = Math.ceil(8 * (level <= 4 ? level : 4 + Math.log2(level - 3) / 2)),
    key = `${seed}:${count}`;
  const cached = pileCache.get(key);
  if (cached) return cached;
  const gx = keyX(seed),
    gy = keyY(seed),
    ox = centreX(gx, gy),
    oy = centreY(gy),
    balls = new Map<string, DirtBall>();
  const position = (layer: number, column: number, row: number) => ({
    x: SPACING * (column + row / 2 + (layer % 2) / 2),
    y: ROW_HEIGHT * (row + (layer % 2) / 3),
  });
  const add = (layer: number, column: number, row: number): void => {
    const id = `${layer}:${column}:${row}`;
    if (balls.has(id)) return;
    if (layer > 0) {
      const side = layer % 2 ? 1 : -1;
      add(layer - 1, column, row);
      add(layer - 1, column + side, row);
      add(layer - 1, column, row + side);
    }
    const { x, y } = position(layer, column, row);
    balls.set(id, {
      id,
      x: x - ox,
      y: y - oy,
      z: RADIUS + layer * LAYER_HEIGHT,
      radius: RADIUS,
      grain: Math.abs((column * 73856093) ^ (row * 19349663) ^ (layer * 83492791)) % 5,
    });
  };
  let additions = 0;
  for (let layer = 0; additions < count; layer++) {
    const candidates: { column: number; row: number; distance: number }[] = [];
    for (let row = Math.floor(oy / ROW_HEIGHT) - 5; row <= Math.ceil(oy / ROW_HEIGHT) + 5; row++)
      for (let column = Math.floor(ox / SPACING - row / 2) - 5; column <= Math.ceil(ox / SPACING - row / 2) + 5; column++) {
        const { x, y } = position(layer, column, row);
        cellOf(x, y);
        if (CELL[0] === gx && CELL[1] === gy) candidates.push({ column, row, distance: (x - ox) ** 2 + (y - oy) ** 2 });
      }
    candidates.sort((a, b) => a.distance - b.distance || a.row - b.row || a.column - b.column);
    for (const { column, row } of candidates.slice(0, 8)) {
      if (additions >= count) break;
      add(layer, column, row);
      additions++;
    }
  }
  const result = [...balls.values()];
  if (pileCache.size >= 256) pileCache.delete(pileCache.keys().next().value!);
  pileCache.set(key, result);
  return result;
}

export function inspectionDirtBalls(patch: InspectionPatch): DirtBall[] {
  if (patch.mode !== "surface") return [];
  const balls = new Map<string, DirtBall>();
  for (const { valid, x, y, state } of patch.cells) {
    const p = state.place;
    if (!valid || p.ground !== "open" || p.hole >= 0 || p.mound <= 0) continue;
    for (const ball of moundBalls(p.mound, cellKey(...state.cell)))
      if (!balls.has(ball.id)) balls.set(ball.id, { ...ball, x: x + ball.x, y: y + ball.y });
  }
  return [...balls.values()];
}

/** Feet follow the tops of the actual pellets, with a short continuous approach at each edge. */
export function inspectionMoundFloor(patch: InspectionPatch): ((x: number, y: number) => number) | undefined {
  const balls = inspectionDirtBalls(patch);
  if (!balls.length) return;
  const ox = centreX(...patch.selected.cell),
    oy = centreY(patch.selected.cell[1]),
    buckets = new Map<string, DirtBall[]>();
  for (const ball of balls) {
    // A pellet only influences points within its own radius and a foot's reach.
    const reach = ball.radius + 0.06;
    for (let y = Math.floor((ball.y + oy - reach) * 2); y <= Math.floor((ball.y + oy + reach) * 2); y++)
      for (let x = Math.floor((ball.x + ox - reach) * 2); x <= Math.floor((ball.x + ox + reach) * 2); x++) {
        const key = `${x},${y}`,
          list = buckets.get(key) ?? [];
        if (!buckets.has(key)) buckets.set(key, list);
        list.push(ball);
      }
  }
  return (x, y) => {
    let top = 0;
    for (const ball of buckets.get(`${Math.floor((x + ox) * 2)},${Math.floor((y + oy) * 2)}`) ?? []) {
      const distance = Math.hypot(x - ball.x, y - ball.y);
      if (distance >= ball.radius + 0.06) continue;
      const height =
        distance <= ball.radius
          ? ball.z + Math.sqrt(Math.max(0, ball.radius ** 2 - distance ** 2))
          : ball.z * (1 - (distance - ball.radius) / 0.06);
      top = Math.max(top, height);
    }
    return top;
  };
}
