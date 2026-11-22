// What a frame needs from the outside world (ja-fnd.6.3.13, docs/field-split.md "FieldEnv"): the clock, the device pixel ratio, whether this is a
// dev build, the reduced-motion preference, and the sprite sets. ColonyField takes them from the browser; a Node test gives fakes (sprite sets
// that report ready, a fixed clock), which is what lets the frame's layers run headless. The theme is not a port: it is plain data the shell reads
// from the page's CSS (retheme) and hands in.
//
// Importing this file needs no DOM and no `window`: browserEnv() touches them, and a test never calls it.

import { CadaverSprites } from "../cadaverSprites.ts";
import { FungalMapSprites } from "../fungalStructures.ts";
import { ResourceSprites } from "../resourceSprites.ts";
import { MapLeafSprites, SurfaceLeaves } from "../surfaceFood.ts";
import { NestSprites } from "../nestSprites.ts";
import { WorkerGait, WorkerSprites } from "../workerSprites.ts";

/** The sprite sets a frame draws with. Each loads its images when asked (`load`) and says when they are ready; a test's fakes are ready at once. */
export interface SpriteSets {
  cadaver: CadaverSprites;
  fungal: FungalMapSprites;
  worker: WorkerSprites;
  nest: NestSprites;
  resource: ResourceSprites;
  surfaceLeaves: SurfaceLeaves;
  mapLeaves: MapLeafSprites;
  gait: WorkerGait;
}

export interface FieldEnv {
  /** milliseconds on a monotonic clock (performance.now) */
  now(): number;
  /** device pixels per CSS pixel, as the field uses it: at most 2 */
  dpr(): number;
  /** a dev build: the frame writes its diagnostics */
  dev: boolean;
  /** the player prefers reduced motion (read when asked: it can change while the page is open) */
  reducedMotion(): boolean;
  /** a fresh set of sprite sets (the field builds them again when its colonies, world or fungus change) */
  sprites(): SpriteSets;
}

/** The browser's: performance.now, window.devicePixelRatio, matchMedia and the real sprite sets; `dev` is the build's flag (the shell passes import.meta.env.DEV). */
export function browserEnv(dev: boolean): FieldEnv {
  let motion: MediaQueryList | null = null;
  return {
    now: () => performance.now(),
    dpr: () => Math.min(2, window.devicePixelRatio || 1),
    dev,
    reducedMotion: () => (motion ??= matchMedia("(prefers-reduced-motion: reduce)")).matches,
    sprites: () => ({
      cadaver: new CadaverSprites(),
      fungal: new FungalMapSprites(),
      worker: new WorkerSprites(),
      nest: new NestSprites(),
      resource: new ResourceSprites(),
      surfaceLeaves: new SurfaceLeaves(),
      mapLeaves: new MapLeafSprites(),
      gait: new WorkerGait(),
    }),
  };
}
