import { BELOW_WALK_PLANE, type InspectionOrbit } from "./inspectionOrbit.ts";
import type { InspectionScene } from "./InspectionScene.ts";
import type { LensWorld } from "./lens.ts";
import type { SensedMap } from "./fungusSight.ts";
import type { Camera, Viewport } from "./camera.ts";
import { inspectViewport } from "./inspectionPatch.ts";
import { centreX, centreY, CURTAIN, STRIP, SIDE, type AphidClump } from "../colony/index.ts";

export type MapVoxelScene = Pick<InspectionScene, "accelerated" | "setViewport" | "setPalette" | "draw" | "dispose">;
type Factory = (canvas: HTMLCanvasElement, software: boolean) => Promise<MapVoxelScene>;
const load: Factory = async (canvas, software) =>
  (await import("./InspectionScene.ts")).InspectionScene.create(canvas, "surface", software);
const smooth = (x: number) => {
  x = Math.max(0, Math.min(1, x));
  return x * x * (3 - 2 * x);
};
export const MAP_ORBIT_SHOW_ZOOM = 120;
export const MAP_ORBIT_READY_ZOOM = 180;
const SOFTWARE_START = 160;
const PRELOAD_ZOOM = 100;

/** The projected ground strip uses a different projection and stays in 2D. */
export function canTiltMap(layer: number, hasWorld: boolean, camera: Camera, view: Viewport, dpr: number, allow: boolean): boolean {
  return allow && camera.zoom / dpr >= MAP_ORBIT_SHOW_ZOOM && supportsVoxelMap(layer, hasWorld, camera, view);
}

function supportsVoxelMap(layer: number, hasWorld: boolean, camera: Camera, view: Viewport): boolean {
  return !hasWorld || layer !== CURTAIN || camera.y - view.h / camera.zoom / 2 > centreY(STRIP) + SIDE;
}

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
  private software = false;
  private contextLost = (event: Event) => {
    event.preventDefault();
    if (this.disposed || event.currentTarget !== this.surface) return;
    this.software = true;
    this.loading = false;
    this.releaseSurface();
    this.ready();
  };

  private releaseSurface() {
    this.surface?.removeEventListener("webglcontextlost", this.contextLost);
    this.surface = null;
    this.scene?.dispose();
    this.scene = null;
  }
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
    if (this.disposed || this.failed || !allow || cssZoom < PRELOAD_ZOOM || !supportsVoxelMap(layer, !!g.world, camera, view))
      return { alpha: 0, renderer: "sprites" };
    if (!this.scene && !this.loading) {
      this.loading = true;
      const surface = (this.surface = this.canvas());
      surface.width = 384;
      surface.height = 320;
      surface.addEventListener("webglcontextlost", this.contextLost);
      void this.create(surface, this.software)
        .then((scene) => {
          if (this.disposed || this.surface !== surface) {
            scene.dispose();
            return;
          }
          this.scene = scene;
          this.loading = false;
          this.ready();
        })
        .catch(() => {
          if (this.disposed || this.surface !== surface) return;
          this.failed = true;
          this.loading = false;
          this.releaseSurface();
        });
    }
    if (cssZoom <= MAP_ORBIT_SHOW_ZOOM) return { alpha: 0, renderer: "sprites" };
    if (!this.scene || !this.surface) return { alpha: 0, renderer: "loading" };
    const scene = this.scene,
      alpha = mapVoxelAlpha(cssZoom, scene.accelerated);
    if (!alpha) return { alpha: 0, renderer: "sprites" };
    try {
      const worldWidth = view.w / camera.zoom;
      const worldHeight = view.h / camera.zoom;
      const tilt = orbit?.tilt ?? 0;
      const projectedTop = (worldHeight / 2 + BELOW_WALK_PLANE * Math.abs(Math.sin(tilt))) / Math.cos(tilt);
      const stripInView = !!g.world && layer === CURTAIN && camera.y - projectedTop <= centreY(STRIP) + SIDE;
      // The surface strip only has navigation hit targets in the flat projection.
      // So tilting Below near the strip switches between the tilted view and the flat map: intended (mapRendering.test.ts, "the underground camera tilts
      // at close zoom while the projected strip stays flat").
      if (stripInView && tilt !== 0) return { alpha: 0, renderer: "sprites" };
      const angled = alpha === 1 && orbit && (orbit.yaw !== 0 || tilt !== 0);
      const span = Math.hypot(worldWidth, worldHeight);
      const range = Math.min(16, span / Math.cos(tilt) + 2);
      const patch = inspectViewport(
          g,
          sensed,
          layer,
          camera.x,
          camera.y,
          // Pitch changes the sampled depth. Only yaw can enlarge its width.
          angled && orbit.yaw !== 0 ? range : worldWidth,
          angled ? range : worldHeight,
          trails,
          clumps,
        ),
        // A tilted frame on the software renderer (no WebGL: it rasterises on the CPU) takes a third of the device resolution, not a half,
        // to keep its frame time (#287, "Reduce tilted map work on the software renderer").
        scale = 1 / (dpr * (angled && !scene.accelerated ? 3 : 2)),
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
          ctx.fillStyle = layer === CURTAIN ? "#3e2b20" : "#b7b5aa";
          ctx.fillRect(0, 0, view.w, view.h);
        }
        ctx.drawImage(this.surface, 0, 0, view.w, view.h);
        if (angled && layer !== CURTAIN && Math.abs(orbit.tilt) > 0.5) {
          // Only Above (never Below) fogs, and Above's camera tilt is never negative (mapCameraOrbit), so the horizon is always the top edge;
          // the bottom-edge branch is kept for an orbit with the other sign.
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
      this.releaseSurface();
      this.failed = true;
      return { alpha: 0, renderer: "sprites" };
    }
  }
  dispose(): void {
    this.disposed = true;
    this.releaseSurface();
  }
}
