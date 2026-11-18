import type { Colony } from "../colony/index.ts";

/** Atlas frame padding is transparent; worldSize keeps the body at the same ant:hex scale. */
export const WORKER_ATLAS = {
  tiny: { frame: 20, stride: 22, width: 264, height: 22, worldSize: 20 / 12 },
  walk: { frame: 42, stride: 44, width: 528, height: 352, worldSize: 1.5 },
} as const;
export type WorkerLod = keyof typeof WORKER_ATLAS;
export const WORKER_CYCLE_TRAVEL = 0.14 / 0.6;
export const workerDirection = (heading: number): number => ((Math.round(heading / (Math.PI / 6)) % 12) + 12) % 12;
/** Zoom is in backing pixels, not CSS pixels. Keep 12 CSS px static on every display. */
export const workerLod = (zoom: number, dpr: number): WorkerLod => (zoom / dpr < 14 ? "tiny" : "walk");

/** Source rectangles and world scaling are shared by the map and native render checks. */
export function drawWorkerSprite(
  ctx: CanvasRenderingContext2D,
  image: CanvasImageSource,
  lod: WorkerLod,
  heading: number,
  pose: number,
  x: number,
  y: number,
  zoom: number,
): void {
  const atlas = WORKER_ATLAS[lod],
    size = atlas.worldSize * zoom;
  const row = lod === "tiny" ? 0 : pose % 8;
  ctx.drawImage(
    image,
    workerDirection(heading) * atlas.stride + 1,
    row * atlas.stride + 1,
    atlas.frame,
    atlas.frame,
    x - size / 2,
    y - size / 2,
    size,
    size,
  );
}

type Workers = Pick<Colony, "n" | "x" | "y" | "alive" | "gen" | "layer">;
interface GaitSlots {
  x: Float32Array;
  y: Float32Array;
  phase: Float32Array;
  generation: Float64Array;
  layer: Int32Array;
  seen: Uint8Array;
}

/** Visual state only: never writes simulation arrays. Slot generation and layer changes reset a gait. */
export class WorkerGait {
  private colonies = new WeakMap<Workers, GaitSlots>();

  update(col: Workers): void {
    let slots = this.colonies.get(col);
    if (!slots || slots.x.length !== col.x.length) {
      const n = col.x.length;
      slots = {
        x: new Float32Array(n),
        y: new Float32Array(n),
        phase: new Float32Array(n),
        generation: new Float64Array(n),
        layer: new Int32Array(n),
        seen: new Uint8Array(n),
      };
      this.colonies.set(col, slots);
    }
    for (let i = 0; i < col.n; i++) {
      if (!col.alive[i]) {
        slots.seen[i] = 0;
        continue;
      }
      const distance = Math.hypot(col.x[i] - slots.x[i], col.y[i] - slots.y[i]);
      if (slots.seen[i] && slots.generation[i] === col.gen[i] && slots.layer[i] === col.layer[i] && distance < 2) {
        slots.phase[i] = (slots.phase[i] + (distance * 8) / WORKER_CYCLE_TRAVEL) % 8;
      } else slots.phase[i] = 0;
      slots.x[i] = col.x[i];
      slots.y[i] = col.y[i];
      slots.generation[i] = col.gen[i];
      slots.layer[i] = col.layer[i];
      slots.seen[i] = 1;
    }
  }

  pose(col: Workers, i: number): number {
    return Math.floor(this.colonies.get(col)?.phase[i] ?? 0) % 8;
  }
}

/** Keep alpha and voxel shading while using the game's existing odour colours in either theme. */
export function tintWorkerPixels(pixels: Uint8ClampedArray, colour: readonly number[]): void {
  for (let i = 0; i < pixels.length; i += 4) {
    if (!pixels[i + 3]) continue;
    const light = (pixels[i] * 0.2126 + pixels[i + 1] * 0.7152 + pixels[i + 2] * 0.0722 - 28) / 100;
    const shade = 0.65 + Math.max(0, Math.min(1, light)) * 0.5;
    for (let k = 0; k < 3; k++) pixels[i + k] = Math.round(Math.min(255, colour[k] * shade));
  }
}

const URLS = {
  tiny: new URL("../assets/workers/tiny-idle.png", import.meta.url).href,
  walk: new URL("../assets/workers/map-walk.png", import.meta.url).href,
};

/** At most ten odour-band canvases per LOD and theme; no per-ant recolouring or rotation. */
export class WorkerSprites {
  private images = new Map<WorkerLod, HTMLImageElement>();
  private tints = new Map<string, HTMLCanvasElement>();
  private pending: HTMLImageElement[] = [];
  private disposed = false;

  load(redraw: () => void): void {
    for (const lod of ["tiny", "walk"] as const) {
      const image = new Image();
      this.pending.push(image);
      image.onload = () => {
        if (this.disposed) return;
        const atlas = WORKER_ATLAS[lod];
        if (image.naturalWidth === atlas.width && image.naturalHeight === atlas.height) this.images.set(lod, image);
        redraw();
      };
      image.onerror = () => {
        if (!this.disposed) redraw();
      };
      image.src = URLS[lod];
    }
  }

  clearTints(): void {
    this.tints.clear();
  }

  ready(lod: WorkerLod): boolean {
    return this.images.has(lod);
  }

  get(lod: WorkerLod, colour: readonly number[]): HTMLCanvasElement | null {
    const image = this.images.get(lod);
    if (!image) return null;
    const key = `${lod}:${colour.join(",")}`;
    let canvas = this.tints.get(key);
    if (canvas) return canvas;
    canvas = document.createElement("canvas");
    const atlas = WORKER_ATLAS[lod];
    canvas.width = atlas.width;
    canvas.height = atlas.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    try {
      ctx.drawImage(image, 0, 0);
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
      tintWorkerPixels(data.data, colour);
      ctx.putImageData(data, 0, 0);
      this.tints.set(key, canvas);
      return canvas;
    } catch {
      // An unavailable/undecodable atlas must leave the existing ink marks usable.
      this.images.delete(lod);
      return null;
    }
  }

  dispose(): void {
    this.disposed = true;
    for (const image of this.pending) image.onload = image.onerror = null;
    this.pending.length = 0;
    this.images.clear();
    this.clearTints();
  }
}
