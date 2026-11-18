import { CELL, cellOf, centreX, centreY, nx, ny } from "../colony/index.ts";

/** Visual reference only: generated surface food starts at 12 units; this is never a capacity limit. */
export const LEAF_FULL_AMOUNT = 12;
export const LEAF_STEP = 0.1;
export interface LeafTile {
  x: number;
  y: number;
  vein: boolean;
}
export type LeafFood = (x: number, y: number) => number;

/** World-aligned tissue. Connected cells share bridges; less food removes stable edge bites, never rescales the leaf. */
export function leafTiles(gx: number, gy: number, food: LeafFood): LeafTile[] {
  const amount = food(gx, gy);
  if (!(amount > 0) || !Number.isFinite(amount)) return [];
  const cx = centreX(gx, gy),
    cy = centreY(gy),
    out: LeafTile[] = [];
  const neighbours = Array.from({ length: 6 }, (_, d) => {
    const x = nx(gx, gy, d),
      y = ny(gy, d);
    return food(x, y) > 0 ? [centreX(x, y) - cx, centreY(y) - cy] : null;
  });
  for (let iy = Math.floor((cy - 0.6) / LEAF_STEP); iy <= Math.ceil((cy + 0.6) / LEAF_STEP); iy++)
    for (let ix = Math.floor((cx - 0.6) / LEAF_STEP); ix <= Math.ceil((cx + 0.6) / LEAF_STEP); ix++) {
      const x = (ix + 0.5) * LEAF_STEP,
        y = (iy + 0.5) * LEAF_STEP;
      cellOf(x, y);
      if (CELL[0] !== gx || CELL[1] !== gy) continue;
      const dx = x - cx,
        dy = y - cy;
      const radius = (dx / 0.53) ** 2 + (dy / 0.37) ** 2;
      const distances = neighbours.map((n) => {
        if (!n) return Infinity;
        const t = Math.max(0, Math.min(1, (dx * n[0] + dy * n[1]) / (n[0] ** 2 + n[1] ** 2)));
        return Math.hypot(dx - t * n[0], dy - t * n[1]);
      });
      if (radius > 1 && !distances.some((d) => d < 0.23)) continue;
      // Coarse, repeatable bites consume the margins first and leave a central rib until last.
      const hash = (Math.imul(Math.floor(ix / 2), 73856093) ^ Math.imul(Math.floor(iy / 2), 19349663)) >>> 0;
      const threshold = Math.min(0.98, 0.04 + 0.65 * Math.min(1, radius) + (hash % 7) * 0.05);
      if (Math.min(1, amount / LEAF_FULL_AMOUNT) < threshold && !(ix === Math.floor(cx / LEAF_STEP) && iy === Math.floor(cy / LEAF_STEP)))
        continue;
      out.push({ x: ix * LEAF_STEP, y: iy * LEAF_STEP, vein: Math.abs(dy - 0.12 * dx) < 0.055 || distances.some((d) => d < 0.045) });
    }
  if (!out.length) out.push({ x: Math.floor(cx / LEAF_STEP) * LEAF_STEP, y: Math.floor(cy / LEAF_STEP) * LEAF_STEP, vein: true });
  return out;
}

export function drawLeafTiles(
  ctx: CanvasRenderingContext2D,
  tiles: readonly LeafTile[],
  point: (x: number, y: number, z?: number) => [number, number],
): void {
  for (const vein of [false, true]) {
    ctx.fillStyle = vein ? "#A3B85B" : "#627C37";
    ctx.beginPath();
    for (const tile of tiles) {
      if (tile.vein !== vein) continue;
      const { x, y } = tile;
      const corners = [
        [x, y],
        [x + LEAF_STEP, y],
        [x + LEAF_STEP, y + LEAF_STEP],
        [x, y + LEAF_STEP],
      ];
      corners.forEach(([a, b], i) => {
        const p = point(a, b, 0.035);
        if (i === 0) ctx.moveTo(...p);
        else ctx.lineTo(...p);
      });
      ctx.closePath();
    }
    ctx.fill();
  }
}

/** Per-view bounded cache: unchanged food does not rebuild geometry every animation frame. */
export class SurfaceLeaves {
  private cache = new Map<string, LeafTile[]>();
  get(x: number, y: number, food: LeafFood): LeafTile[] {
    const amount = food(x, y);
    let mask = 0;
    for (let d = 0; d < 6; d++) if (food(nx(x, y, d), ny(y, d)) > 0) mask |= 1 << d;
    const key = `${x},${y},${amount},${mask}`;
    const old = this.cache.get(key);
    if (old) return old;
    const tiles = leafTiles(x, y, food);
    if (this.cache.size >= 512) this.cache.delete(this.cache.keys().next().value!);
    this.cache.set(key, tiles);
    return tiles;
  }
}
