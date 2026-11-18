import { AIR, OPEN, SOIL, centreX, centreY } from "../colony/index.ts";

/** Stable, sparse surface grain. The same world cell keeps its marks while the camera moves. */
export function terrainGrain(x: number, y: number, kind: number): [number, number, number] | null {
  if (kind === AIR) return null;
  const hash = (Math.imul(x, 73856093) ^ Math.imul(y, 19349663)) >>> 0;
  if (hash % (kind === OPEN ? 16 : 4) !== 0) return null;
  return [((hash & 7) - 3.5) * 0.06, (((hash >>> 3) & 7) - 3.5) * 0.06, kind === SOIL ? 0.08 : 0.13];
}

/** Two batched paths, only at hex zoom; occupied overlay cells retain their clear colour wash. */
export function drawMapTerrainGrain(
  ctx: CanvasRenderingContext2D,
  zoom: number,
  originX: number,
  originY: number,
  bounds: readonly [number, number, number, number],
  ground: (x: number, y: number) => number,
  clearOverlay: (x: number, y: number) => boolean,
  ink: string,
  paper: string,
): void {
  const dark = new Path2D(),
    light = new Path2D();
  for (let y = bounds[2]; y <= bounds[3]; y++)
    for (let x = bounds[0]; x <= bounds[1]; x++) {
      const kind = ground(x, y);
      if (kind === OPEN && !clearOverlay(x, y)) continue;
      const grain = terrainGrain(x, y, kind);
      if (!grain) continue;
      const sx = (centreX(x, y) + grain[0]) * zoom + originX,
        sy = (centreY(y) + grain[1]) * zoom + originY,
        size = Math.max(1, grain[2] * zoom);
      dark.rect(Math.round(sx), Math.round(sy), size, Math.max(1, size / 2));
      if (kind !== OPEN) light.rect(Math.round(sx - 0.2 * zoom), Math.round(sy + 0.13 * zoom), size, Math.max(1, size / 2));
    }
  ctx.save();
  ctx.globalAlpha = 0.065;
  ctx.fillStyle = ink;
  ctx.fill(dark);
  ctx.globalAlpha = 0.08;
  ctx.fillStyle = paper;
  ctx.fill(light);
  ctx.restore();
}
