export type ResourceLod = "tiny" | "walk";
export type FoodKind = "plain" | "sweet" | "crumb";
export type ResourceKind = FoodKind | "aphid";
export const RESOURCE_WORLD_SIZE = 0.5;
export const RESOURCE_ATLAS = {
  tiny: { frame: 6, stride: 8, width: 56, height: 8 },
  walk: { frame: 14, stride: 16, width: 112, height: 16 },
} as const;
export const FOOD_SPOTS: readonly (readonly [number, number])[] = [
  [0, 0],
  [-0.23, -0.12],
  [0.22, 0.14],
  [-0.18, 0.22],
  [0.18, -0.23],
];
/** Same four aggregate-density positions as the original aphid dots. These are not individual tracked insects. */
export const APHID_SPOTS: readonly (readonly [number, number])[] = [
  [-0.22, -0.18],
  [0.24, -0.12],
  [-0.12, 0.24],
  [0.2, 0.22],
];

/** The world stores quality, not food identity: sugar and honeydew share the sweet class. */
export function foodKind(quality: number): FoodKind {
  return quality > 1.01 ? "sweet" : quality < 0.99 ? "crumb" : "plain";
}

/** More fixed-size marks, never bigger pieces. Five is a drawing budget, not cell capacity or units of food. */
export function foodDensity(amount: number): { marks: number; alpha: number } {
  if (!(amount > 0) || !Number.isFinite(amount)) return { marks: 0, alpha: 0 };
  return { marks: Math.max(1, Math.min(5, Math.ceil(Math.log2(1 + amount)))), alpha: 0.35 + 0.65 * Math.min(1, amount) };
}

/** Preserve the existing clump-density convention and crash fade; no per-cell population is invented. */
export function aphidDensity(count: number, cells: number): { marks: number; alpha: number } {
  if (!(count > 0) || !(cells > 0)) return { marks: 0, alpha: 0 };
  return { marks: Math.max(1, Math.min(4, Math.round(count / cells / 2))), alpha: Math.min(1, 0.35 + count / cells / 4) };
}

export function drawResourceSprite(
  ctx: CanvasRenderingContext2D,
  image: CanvasImageSource,
  lod: ResourceLod,
  kind: ResourceKind,
  variant: number,
  x: number,
  y: number,
  zoom: number,
): void {
  const column = kind === "aphid" ? 3 + (variant & 3) : kind === "plain" ? 0 : kind === "sweet" ? 1 : 2;
  const atlas = RESOURCE_ATLAS[lod],
    size = RESOURCE_WORLD_SIZE * zoom;
  ctx.drawImage(image, column * atlas.stride + 1, 1, atlas.frame, atlas.frame, x - size / 2, y - size / 2, size, size);
}

const URLS = {
  tiny: new URL("../assets/resources/resource-tiny.png", import.meta.url).href,
  walk: new URL("../assets/resources/resource-near.png", import.meta.url).href,
};

/** Pre-rendered colours stay readable in both themes. A missing atlas retains the old food wash / aphid dots. */
export class ResourceSprites {
  private images = new Map<ResourceLod, HTMLImageElement>();
  private pending: HTMLImageElement[] = [];
  private disposed = false;

  load(redraw: () => void): void {
    for (const lod of ["tiny", "walk"] as const) {
      const image = new Image();
      this.pending.push(image);
      image.onload = () => {
        if (this.disposed) return;
        const atlas = RESOURCE_ATLAS[lod];
        if (image.naturalWidth === atlas.width && image.naturalHeight === atlas.height) this.images.set(lod, image);
        redraw();
      };
      image.onerror = () => {
        if (!this.disposed) redraw();
      };
      image.src = URLS[lod];
    }
  }

  get(lod: ResourceLod): HTMLImageElement | null {
    return this.images.get(lod) ?? null;
  }

  dispose(): void {
    this.disposed = true;
    for (const image of this.pending) image.onload = image.onerror = null;
    this.pending.length = 0;
    this.images.clear();
  }
}
