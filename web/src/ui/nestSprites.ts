import bands from "../assets/inspection-3d/abdomen-bands.json" with { type: "json" };
import layout from "../assets/nest/manifest.json" with { type: "json" };
import { neutralSpriteRim, tintWorkerPixels, type WorkerLod } from "./workerSprites.ts";

export type NestSprite = "queen" | "queen-dead" | "corpse" | "brood-0" | "brood-1" | "brood-2" | "alate-body" | "alate-wings";
export function drawNestSprite(
  ctx: CanvasRenderingContext2D,
  image: CanvasImageSource,
  lod: WorkerLod,
  kind: NestSprite,
  x: number,
  y: number,
  zoom: number,
): void {
  const a = layout[lod],
    i = layout.names.indexOf(kind),
    size = layout.worldFrame * zoom;
  ctx.drawImage(image, i * a.stride + 1, 1, a.frame, a.frame, x - size / 2, y - size / 2, size, size);
}
const URLS = {
  tiny: new URL("../assets/nest/nest-tiny.png", import.meta.url).href,
  walk: new URL("../assets/nest/nest-walk.png", import.meta.url).href,
};
export class NestSprites {
  private images = new Map<WorkerLod, HTMLImageElement>();
  private pending: HTMLImageElement[] = [];
  private tints = new Map<string, HTMLCanvasElement>();
  private disposed = false;
  load(redraw: () => void): void {
    for (const lod of ["tiny", "walk"] as const) {
      const im = new Image();
      this.pending.push(im);
      im.onload = () => {
        if (this.disposed) return;
        const a = layout[lod];
        if (im.naturalWidth === a.width && im.naturalHeight === a.height) this.images.set(lod, im);
        redraw();
      };
      im.onerror = () => {
        if (!this.disposed) redraw();
      };
      im.src = URLS[lod];
    }
  }
  get(lod: WorkerLod, colour?: readonly number[], darkGround = false): CanvasImageSource | null {
    const im = this.images.get(lod);
    if (!im || !colour) return im ?? null;
    const key = `${lod}:${colour.join(",")}:${darkGround}`;
    const cached = this.tints.get(key);
    if (cached) return cached;
    const a = layout[lod],
      cv = document.createElement("canvas");
    cv.width = a.width;
    cv.height = a.height;
    const ctx = cv.getContext("2d");
    if (!ctx) return null;
    try {
      ctx.drawImage(im, 0, 0);
      // Abdomen bands adopt colony colour; the separate wings, brood and dead bodies keep their materials.
      for (const kind of ["queen", "alate-body"]) {
        const x = layout.names.indexOf(kind) * a.stride + 1;
        const data = ctx.getImageData(x, 1, a.frame, a.frame);
        if (darkGround) neutralSpriteRim(data.data, a.frame, a.frame);
        tintWorkerPixels(data.data, colour, (lod === "tiny" ? bands.nestTiny : bands.nestWalk)[kind as "queen" | "alate-body"]);
        ctx.putImageData(data, x, 1);
      }
      this.tints.set(key, cv);
      return cv;
    } catch {
      return null;
    }
  }
  clearTints(): void {
    this.tints.clear();
  }
  dispose(): void {
    this.disposed = true;
    for (const im of this.pending) im.onload = im.onerror = null;
    this.pending.length = 0;
    this.images.clear();
    this.clearTints();
  }
}
