import { cellKey, centreX, centreY } from "../colony/index.ts";
import type { InspectionPatch } from "./inspectionPatch.ts";

export interface DirtBall {
  x: number;
  y: number;
  z: number;
  radius: number;
  grain: number;
}

const pileCache = new Map<string, DirtBall[]>();

/** Deterministic loose pellets. Adding soil retains the existing balls and stacks new ones on them. */
export function moundBalls(level: number, seed: number): readonly DirtBall[] {
  const count = Math.ceil(8 * (level <= 8 ? level : 8 + Math.log2(level - 7))),
    key = `${seed}:${count}`;
  const cached = pileCache.get(key);
  if (cached) return cached;
  let state = seed | 0;
  const random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) | 0;
    return (state >>> 0) / 0x100000000;
  };
  const balls: DirtBall[] = [];
  for (let i = 0; i < count; i++) {
    const angle = random() * Math.PI * 2,
      distance = Math.sqrt(random()) * 0.39,
      radius = 0.085 + random() * 0.025,
      x = Math.cos(angle) * distance,
      y = Math.sin(angle) * distance;
    let z = radius * 0.85;
    for (const other of balls) {
      const d2 = (x - other.x) ** 2 + (y - other.y) ** 2,
        contact = (radius + other.radius) * 0.94;
      if (d2 < contact * contact) z = Math.max(z, other.z + Math.sqrt(contact * contact - d2));
    }
    balls.push({ x, y, z, radius, grain: Math.floor(random() * 5) });
  }
  if (pileCache.size >= 256) pileCache.delete(pileCache.keys().next().value!);
  pileCache.set(key, balls);
  return balls;
}

export function inspectionDirtBalls(patch: InspectionPatch): DirtBall[] {
  if (patch.mode !== "surface") return [];
  const balls: DirtBall[] = [];
  for (const { valid, x, y, state } of patch.cells) {
    const p = state.place;
    if (!valid || p.ground !== "open" || p.hole >= 0 || p.mound <= 0) continue;
    for (const ball of moundBalls(p.mound, cellKey(...state.cell))) balls.push({ ...ball, x: x + ball.x, y: y + ball.y });
  }
  return balls;
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
