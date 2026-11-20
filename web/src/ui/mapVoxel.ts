import type { InspectionOrbit } from "./inspectionOrbit.ts";
import type { InspectionScene } from "./InspectionScene.ts";
import type { LensWorld } from "./lens.ts";
import type { SensedMap } from "./fungusSight.ts";
import type { Camera, Viewport } from "./camera.ts";
import { inspectViewport } from "./inspectionPatch.ts";
import { centreX, centreY, CURTAIN, STRIP, SIDE, type AphidClump } from "../colony/index.ts";

export type MapVoxelScene = Pick<InspectionScene, "accelerated" | "setViewport" | "setPalette" | "draw" | "dispose">;
type Factory = (canvas: HTMLCanvasElement) => Promise<MapVoxelScene>;
const load: Factory = async (canvas) => (await import("./InspectionScene.ts")).InspectionScene.create(canvas, "surface");
const smooth = (x: number) => {
  x = Math.max(0, Math.min(1, x));
  return x * x * (3 - 2 * x);
};
export const MAP_ORBIT_SHOW_ZOOM = 120;
export const MAP_ORBIT_READY_ZOOM = 180;
const SOFTWARE_START = 160;
const PRELOAD_ZOOM = 100;

export function mapVoxelAlpha(cssZoom: number, accelerated = true): number {
  return accelerated
    ? smooth((cssZoom - MAP_ORBIT_SHOW_ZOOM) / 30)
    : smooth((cssZoom - SOFTWARE_START) / (MAP_ORBIT_READY_ZOOM - SOFTWARE_START));
}

/** Lazy close-map pass. Distant views never load models or sample voxel cells; map input and HUD stay on the existing canvas. */
export class MapVoxelPass {
  private scene: MapVoxelScene | null = null;
  private surface: HTMLCanvasElement | null = null;
  private loading = false;
  private failed = false;
  private disposed = false;
  private create: Factory;
  private canvas: () => HTMLCanvasElement;
  private ready: () => void;
  constructor(ready: () => void, create: Factory = load, canvas: () => HTMLCanvasElement = () => document.createElement("canvas")) {
    this.ready = ready;
    this.create = create;
    this.canvas = canvas;
  }
  draw(
    ctx: CanvasRenderingContext2D,
    g: LensWorld,
    sensed: SensedMap,
    layer: number,
    camera: Camera,
    view: Viewport,
    dpr: number,
    trails: { food: boolean; home: boolean },
    clumps: readonly AphidClump[],
    palette: { ink: string; warn: string },
    allow = true,
    orbit?: InspectionOrbit,
  ) {
    const cssZoom = camera.zoom / dpr;
    // The projected ground strip still owns its aerial ants and linking affordances in the 2D renderer.
    const strip = !!g.world && layer === CURTAIN && camera.y - view.h / camera.zoom / 2 <= centreY(STRIP) + SIDE;
    if (this.disposed || this.failed || !allow || strip || cssZoom < PRELOAD_ZOOM) return { alpha: 0, renderer: "sprites" };
    if (!this.scene && !this.loading) {
      this.loading = true;
      this.surface = this.canvas();
      this.surface.width = 384;
      this.surface.height = 320;
      void this.create(this.surface)
        .then((scene) => {
          if (this.disposed) {
            scene.dispose();
            return;
          }
          this.scene = scene;
          this.loading = false;
          this.ready();
        })
        .catch(() => {
          this.failed = true;
          this.loading = false;
        });
    }
    if (cssZoom <= MAP_ORBIT_SHOW_ZOOM) return { alpha: 0, renderer: "sprites" };
    if (!this.scene || !this.surface) return { alpha: 0, renderer: "loading" };
    const scene = this.scene,
      alpha = mapVoxelAlpha(cssZoom, scene.accelerated);
    if (!alpha) return { alpha: 0, renderer: "sprites" };
    try {
      const angled = layer !== CURTAIN && alpha === 1 && orbit && (orbit.yaw !== 0 || orbit.tilt !== 0);
      const span = Math.hypot(view.w, view.h) / camera.zoom;
      const range = Math.min(16, span / Math.cos(orbit?.tilt ?? 0) + 2);
      const patch = inspectViewport(
          g,
          sensed,
          layer,
          camera.x,
          camera.y,
          angled ? range : view.w / camera.zoom,
          angled ? range : view.h / camera.zoom,
          trails,
          clumps,
        ),
        scale = 1 / (dpr * 2),
        width = Math.max(1, Math.round(view.w * scale)),
        height = Math.max(1, Math.round(view.h * scale));
      scene.setPalette(palette.ink, palette.warn);
      scene.setViewport({
        width,
        height,
        ...(angled ? { orbit } : {}),
        pixelsPerWorld: camera.zoom * scale,
        x: camera.x - centreX(...patch.selected.cell),
        y: camera.y - centreY(patch.selected.cell[1]),
      });
      scene.draw(patch, { scents: true, markers: false, selection: false, chambers: true });
      ctx.save();
      try {
        ctx.globalAlpha = alpha;
        ctx.imageSmoothingEnabled = false;
        if (angled) {
          ctx.fillStyle = "#b7b5aa";
          ctx.fillRect(0, 0, view.w, view.h);
        }
        ctx.drawImage(this.surface, 0, 0, view.w, view.h);
        if (angled && Math.abs(orbit.tilt) > 0.5) {
          const horizon = orbit.tilt < 0 ? view.h : 0;
          const inner = horizon === 0 ? view.h * 0.56 : view.h * 0.44;
          const fog = ctx.createLinearGradient(0, horizon, 0, inner);
          fog.addColorStop(0, `rgba(183,181,170,${Math.min(1, (Math.abs(orbit.tilt) - 0.5) * 2)})`);
          fog.addColorStop(1, "rgba(183,181,170,0)");
          ctx.fillStyle = fog;
          ctx.fillRect(0, Math.min(horizon, inner), view.w, Math.abs(horizon - inner));
        }
      } finally {
        ctx.restore();
      }
      return { alpha, ...(angled ? { angled: true } : {}), renderer: scene.accelerated ? "voxel-webgl" : "voxel-software" };
    } catch {
      scene.dispose();
      this.scene = null;
      this.failed = true;
      return { alpha: 0, renderer: "sprites" };
    }
  }
  dispose(): void {
    this.disposed = true;
    this.scene?.dispose();
    this.scene = null;
  }
}
