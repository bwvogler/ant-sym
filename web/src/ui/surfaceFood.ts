import { CELL, cellOf, centreX, centreY, nx, ny } from "../colony/index.ts";

/** Visual reference only: generated surface food starts at 12 units; this is never a capacity limit. */
export const LEAF_FULL_AMOUNT = 12;
export const LEAF_STEP = 0.1;
export const LEAF_BOTTOM = 0.12;
export const LEAF_TOP = 0.2;
export const LEAF_VEIN_TOP = 0.24;
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
      // Fill the fan between adjacent occupied neighbours: three touching lobes must not leave a triangular pinhole.
      const joined = neighbours.some((a, i) => {
        const b = neighbours[(i + 1) % 6];
        if (!a || !b) return false;
        const determinant = a[0] * b[1] - a[1] * b[0];
        const u = (dx * b[1] - dy * b[0]) / determinant;
        const v = (a[0] * dy - a[1] * dx) / determinant;
        return u >= -1e-9 && v >= -1e-9 && u + v <= 1 + 1e-9;
      });
      if (radius > 1 && !joined && !distances.some((d) => d < 0.23)) continue;
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

export interface LeafFace {
  points: [number, number, number][];
  colour: string;
}
const faceCache = new WeakMap<readonly LeafTile[], LeafFace[]>();

/** One solid sheet: only the perimeter of the union receives an edge, never the seam between two cells. */
export function leafFaces(tiles: readonly LeafTile[]): LeafFace[] {
  const cached = faceCache.get(tiles);
  if (cached) return cached;
  const occupied = new Map(
    tiles.map((t) => [`${Math.round(t.x / LEAF_STEP)},${Math.round(t.y / LEAF_STEP)}`, t.vein ? LEAF_VEIN_TOP : LEAF_TOP]),
  );
  const faces: LeafFace[] = [];
  for (const { x, y, vein } of tiles) {
    const right = x + LEAF_STEP,
      bottom = y + LEAF_STEP,
      top = vein ? LEAF_VEIN_TOP : LEAF_TOP;
    faces.push({
      points: [
        [x, y, top],
        [right, y, top],
        [right, bottom, top],
        [x, bottom, top],
      ],
      colour: vein ? "#A3B85B" : "#627C37",
    });
    const ix = Math.round(x / LEAF_STEP),
      iy = Math.round(y / LEAF_STEP);
    // Perimeter walls reveal the leaf thickness. Internal steps only appear where a raised vein meets flat tissue.
    const east = occupied.get(`${ix + 1},${iy}`) ?? LEAF_BOTTOM;
    const south = occupied.get(`${ix},${iy + 1}`) ?? LEAF_BOTTOM;
    if (east < top)
      faces.push({
        points: [
          [right, y, east],
          [right, bottom, east],
          [right, bottom, top],
          [right, y, top],
        ],
        colour: east === LEAF_BOTTOM ? "#3E5426" : "#71813C",
      });
    if (south < top)
      faces.push({
        points: [
          [x, bottom, south],
          [right, bottom, south],
          [right, bottom, top],
          [x, bottom, top],
        ],
        colour: south === LEAF_BOTTOM ? "#4C622C" : "#829247",
      });
  }
  faces.sort((a, b) => {
    const depth = (face: LeafFace) => face.points.reduce((sum, [x, y, z]) => sum + x * 1.1 + y * 3.3 + z * 2.43, 0) / 4;
    return depth(a) - depth(b);
  });
  faceCache.set(tiles, faces);
  return faces;
}

export function drawLeafTiles(
  ctx: CanvasRenderingContext2D,
  tiles: readonly LeafTile[],
  point: (x: number, y: number, z?: number) => [number, number],
  volume = true,
  defer?: (x: number, y: number, z: number, paint: () => void) => void,
): void {
  const polygon = (points: readonly [number, number, number][], colour: string) => {
    ctx.fillStyle = colour;
    ctx.beginPath();
    points.forEach(([x, y, z], i) => {
      const p = point(x, y, z);
      if (i === 0) ctx.moveTo(...p);
      else ctx.lineTo(...p);
    });
    ctx.closePath();
    ctx.fill();
  };
  // A grounded, slightly offset shadow makes the air gap readable in inspection and from directly above.
  ctx.fillStyle = "rgba(30,44,17,0.18)";
  ctx.beginPath();
  for (const { x, y } of tiles) {
    [
      [x + 0.035, y + 0.05],
      [x + LEAF_STEP + 0.035, y + 0.05],
      [x + LEAF_STEP + 0.035, y + LEAF_STEP + 0.05],
      [x + 0.035, y + LEAF_STEP + 0.05],
    ].forEach(([a, b], i) => {
      const p = point(a, b, 0.005);
      if (i === 0) ctx.moveTo(...p);
      else ctx.lineTo(...p);
    });
    ctx.closePath();
  }
  ctx.fill();
  if (volume)
    for (const face of leafFaces(tiles)) {
      const paint = () => polygon(face.points, face.colour);
      if (defer) {
        const center = face.points.reduce((p, v) => p.map((a, i) => a + v[i] / 4) as [number, number, number], [0, 0, 0] as [
          number,
          number,
          number,
        ]);
        defer(...center, paint);
      } else paint();
    }
  else
    for (const vein of [false, true]) {
      ctx.fillStyle = vein ? "#A3B85B" : "#627C37";
      ctx.beginPath();
      for (const tile of tiles) {
        if (tile.vein !== vein) continue;
        const { x, y } = tile;
        [
          [x, y],
          [x + LEAF_STEP, y],
          [x + LEAF_STEP, y + LEAF_STEP],
          [x, y + LEAF_STEP],
        ].forEach(([a, b], i) => {
          const p = point(a, b, LEAF_TOP);
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

/** The aerial footprint does not change as the camera moves: rasterize once, then draw one image per food cell. */
export class MapLeafSprites {
  private cache = new WeakMap<readonly LeafTile[], { canvas: HTMLCanvasElement; x: number; y: number; w: number; h: number }>();
  private createCanvas: () => HTMLCanvasElement;
  constructor(createCanvas: () => HTMLCanvasElement = () => document.createElement("canvas")) {
    this.createCanvas = createCanvas;
  }
  draw(ctx: CanvasRenderingContext2D, tiles: readonly LeafTile[], zoom: number, originX: number, originY: number): void {
    if (!tiles.length) return;
    let image = this.cache.get(tiles);
    if (!image) {
      const ppu = 64;
      const x = Math.floor(Math.min(...tiles.map((t) => t.x)) * ppu) / ppu;
      const y = Math.floor(Math.min(...tiles.map((t) => t.y)) * ppu) / ppu;
      const width = Math.ceil((Math.max(...tiles.map((t) => t.x)) + LEAF_STEP + 0.035 - x) * ppu) + 1;
      const height = Math.ceil((Math.max(...tiles.map((t) => t.y)) + LEAF_STEP + 0.05 - y) * ppu) + 1;
      const canvas = this.createCanvas();
      canvas.width = width;
      canvas.height = height;
      drawLeafTiles(canvas.getContext("2d")!, tiles, (a, b) => [(a - x) * ppu, (b - y) * ppu], false);
      image = { canvas, x, y, w: width / ppu, h: height / ppu };
      this.cache.set(tiles, image);
    }
    ctx.drawImage(image.canvas, originX + image.x * zoom, originY + image.y * zoom, image.w * zoom, image.h * zoom);
  }
}
