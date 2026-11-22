import type { DecayStage } from "./cadaverVisual.ts";
import type { WorkerLod } from "./workerSprites.ts";
const URLS = {
  tiny: new URL("../assets/inspection-3d/cadavers-tiny.png", import.meta.url).href,
  walk: new URL("../assets/inspection-3d/cadavers-walk.png", import.meta.url).href,
};
export const CADAVER_ATLAS = {
  tiny: { frame: 27, stride: 29, width: 116, height: 29 },
  walk: { frame: 64, stride: 66, width: 264, height: 66 },
} as const;
export function drawCadaverSprite(
  ctx: CanvasRenderingContext2D,
  image: CanvasImageSource,
  lod: WorkerLod,
  stage: DecayStage,
  x: number,
  y: number,
  zoom: number,
  heading = 0,
): void {
  const atlas = CADAVER_ATLAS[lod],
    size = zoom * 2.25;
  if (!heading) {
    ctx.drawImage(image, stage * atlas.stride + 1, 1, atlas.frame, atlas.frame, x - size / 2, y - size / 2, size, size);
    return;
  }
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(heading);
  ctx.drawImage(image, stage * atlas.stride + 1, 1, atlas.frame, atlas.frame, -size / 2, -size / 2, size, size);
  ctx.restore();
}
export class CadaverSprites {
  private images = new Map<WorkerLod, HTMLImageElement>();
  private pending: HTMLImageElement[] = [];
  private disposed = false;
  load(redraw: () => void): void {
    for (const lod of ["tiny", "walk"] as const) {
      const im = new Image(),
        atlas = CADAVER_ATLAS[lod];
      this.pending.push(im);
      im.onload = () => {
        if (this.disposed) return;
        if (im.naturalWidth === atlas.width && im.naturalHeight === atlas.height) this.images.set(lod, im);
        redraw();
      };
      im.onerror = () => {
        if (!this.disposed) redraw();
      };
      im.src = URLS[lod];
    }
  }
  draw(ctx: CanvasRenderingContext2D, lod: WorkerLod, stage: DecayStage, x: number, y: number, zoom: number, heading = 0): boolean {
    const im = this.images.get(lod);
    if (!im) return false;
    drawCadaverSprite(ctx, im, lod, stage, x, y, zoom, heading);
    return true;
  }
  get(lod: WorkerLod): CanvasImageSource | null {
    return this.images.get(lod) ?? null;
  }
  dispose(): void {
    this.disposed = true;
    for (const im of this.pending) im.onload = im.onerror = null;
    this.pending = [];
    this.images.clear();
  }
}
