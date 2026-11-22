import { SIDE } from "../colony/index.ts";
import { drawWorkerSprite, workerLod, type WorkerLod } from "./workerSprites.ts";
import { drawCadaverSprite } from "./cadaverSprites.ts";
import { FungalMapSprites } from "./fungalStructures.ts";
import type { DecayStage } from "./cadaverVisual.ts";
export const MAP_REVIEW_SIZE = [960, 310] as const;
export const MAP_REVIEW_COLUMNS = ["Worker", "Fresh", "Weathered", "Breaking down", "Fragments", "Knot", "Spore tufts", "Stalk + cadaver"];
export const MAP_REVIEW_ZOOMS = [12, 20, 28] as const;
export interface MapReviewSources {
  worker: (lod: WorkerLod, darkGround: boolean) => CanvasImageSource | null;
  cadaver: (lod: WorkerLod) => CanvasImageSource | null;
}
/** Development-only calibration using production draw functions; never magnifies distant glyphs to improve their apparent detail. */
export function drawMapArtReview(
  ctx: CanvasRenderingContext2D,
  sources: MapReviewSources,
  fungal: FungalMapSprites,
  dpr = 1,
  dark = false,
): void {
  ctx.save();
  ctx.clearRect(0, 0, MAP_REVIEW_SIZE[0] * dpr, MAP_REVIEW_SIZE[1] * dpr);
  ctx.fillStyle = dark ? "#1A1A17" : "#FBFAF7";
  ctx.fillRect(0, 0, MAP_REVIEW_SIZE[0] * dpr, MAP_REVIEW_SIZE[1] * dpr);
  ctx.imageSmoothingEnabled = false;
  ctx.textAlign = "center";
  ctx.font = `${12 * dpr}px system-ui`;
  ctx.fillStyle = dark ? "#EAE4D8" : "#302A24";
  MAP_REVIEW_COLUMNS.forEach((label, i) => ctx.fillText(label, (130 + i * 105) * dpr, 28 * dpr));
  for (let row = 0; row < MAP_REVIEW_ZOOMS.length; row++) {
    const cssZoom = MAP_REVIEW_ZOOMS[row],
      zoom = cssZoom * dpr,
      y = (85 + row * 90) * dpr,
      lod = workerLod(zoom, dpr);
    ctx.fillStyle = dark ? "#EAE4D8" : "#302A24";
    ctx.fillText(`${cssZoom} px/hex`, 49 * dpr, y + 4 * dpr);
    for (let i = 0; i < MAP_REVIEW_COLUMNS.length; i++) {
      const x = (130 + i * 105) * dpr;
      ctx.strokeStyle = dark ? "#71685C" : "#CFC5B6";
      ctx.lineWidth = dpr;
      ctx.beginPath();
      for (let j = 0; j < 6; j++) {
        const t = Math.PI / 6 + (j * Math.PI) / 3;
        ctx.lineTo(x + Math.cos(t) * SIDE * zoom, y + Math.sin(t) * SIDE * zoom);
      }
      ctx.closePath();
      ctx.stroke();
      const cadaver = sources.cadaver(lod);
      if (i === 0) {
        const worker = sources.worker(lod, dark);
        if (worker) drawWorkerSprite(ctx, worker, lod, 0, 0, x, y, zoom);
      } else if (i < 5 && cadaver) drawCadaverSprite(ctx, cadaver, lod, (i - 1) as DecayStage, x, y, zoom);
      else if (i === 5) fungal.draw(ctx, { knot: true }, 0, x, y, zoom);
      else if (i === 6) fungal.draw(ctx, { fruit: true }, 0, x, y, zoom);
      else if (i === 7) {
        const state = { colonised: true, sporulating: true, stalkLevel: 2 };
        fungal.draw(ctx, state, 0, x, y, zoom, "ground");
        if (cadaver) drawCadaverSprite(ctx, cadaver, lod, 0, x, y, zoom);
        fungal.draw(ctx, state, 0, x, y, zoom, "raised");
      }
    }
  }
  ctx.restore();
}
