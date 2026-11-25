import { useEffect, type RefObject } from "react";
import type { AphidClump, Colony, Fungus, OneWorld } from "../colony/index.ts";
import type { Viewport } from "./camera.ts";
import { FieldBinding } from "./field/binding.ts";
import type { FieldCtx, FieldInputs, FieldPen } from "./field/ctx.ts";
import { browserEnv } from "./field/env.ts";
import { Ground } from "./field/ground.ts";
import { handleWheel } from "./field/keyboard.ts";
import { Minimap } from "./field/minimap.ts";
import { prepareFrame } from "./field/prelude.ts";
import { beginFrame, type FieldParts, FieldRenderer } from "./field/renderer.ts";
import type { FrameSinks } from "./field/result.ts";
import type { CameraRig } from "./field/rig.ts";
import { followedColony, type Followed } from "./follow.ts";
import type { SensedMap } from "./fungusSight.ts";
import { mapOrbit, type InspectionOrbit } from "./inspectionOrbit.ts";
import type { FieldBuild } from "./field/api.ts";
import { MapVoxelPass } from "./mapVoxel.ts";
import type { Specimen } from "./specimens.ts";
import type { AntTraces } from "./trace.ts";

// The field's frame loop (ja-fnd.6.3.12, docs/field-split.md): what ColonyField's render effect did, as a hook. It builds the frame's parts (the env, the ground,
// the minimap, the binding, the renderer), watches the canvas's size, the theme and the wheel, and draws a frame on every tick of `onFrame`; it reads the
// shell's state through the refs below each time it draws, so a prop that changes builds nothing again. It is a hook, not plain TypeScript: the observers
// and the canvas are the browser's.

/** The shell's refs a frame reads (and the few it writes: the follow, the crossing, the orbit, whether the map is angled). */
export interface FieldFrameRefs {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  orbit: RefObject<InspectionOrbit>;
  orbitAxes: RefObject<HTMLButtonElement | null>;
  angled: RefObject<boolean>;
  shown: RefObject<number>;
  buildRef: RefObject<FieldBuild | null>;
  labelsOn: RefObject<boolean>;
  layers: RefObject<{ food: boolean; home: boolean }>;
  hover: RefObject<[number, number] | null>;
  penRef: RefObject<FieldPen | null>;
  aphidsRef: RefObject<(() => readonly AphidClump[]) | null>;
  tracesRef: RefObject<AntTraces | null>;
  pinnedRef: RefObject<readonly Specimen[]>;
  follow: RefObject<Followed | null>;
  followCb: RefObject<(f: Followed | null) => void>;
  antLayer: RefObject<{ f: Followed; layer: number } | null>;
  carryTo: RefObject<number | null>;
  crossCb: RefObject<((layer: number, x: number, y: number) => void) | undefined>;
  /** told when the followed ant is no longer sensed (the fog of war): the follow has ended */
  lostCb: RefObject<((f: Followed) => void) | undefined>;
  rig: CameraRig;
}

function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

export function useFieldFrame({
  colonies,
  count,
  fungus,
  sensed,
  world,
  onFrame,
  anyColony,
  refs,
}: {
  colonies: readonly Colony[];
  /** the number of colonies: a colony founded mid-game is pushed onto the same array (Game.addColony), so the loop is built again for it */
  count: number;
  fungus: Fungus;
  sensed: SensedMap;
  world: OneWorld;
  onFrame: (fn: () => void) => () => void;
  /** no colony is the player's (you are the fungus): this one only gives what every colony shares, the map and the holes */
  anyColony: Colony;
  refs: FieldFrameRefs;
}): void {
  const {
    canvasRef,
    orbit,
    orbitAxes,
    angled,
    shown,
    buildRef,
    labelsOn,
    layers,
    hover,
    penRef,
    aphidsRef,
    tracesRef,
    pinnedRef,
    follow,
    followCb,
    antLayer,
    carryTo,
    crossCb,
    lostCb,
    rig,
  } = refs;
  const vc = () => rig.vc();
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    // What the frame takes from the outside world: the clock, the pixel ratio, the dev flag, reduced motion and the sprite sets (field/env.ts).
    const env = browserEnv(import.meta.env.DEV);
    const voxelMap = new MapVoxelPass(() => draw());
    const ground = new Ground(env);
    const sinks: FrameSinks = { dataset: canvas.dataset, orbit, orbitAxes, angled, flatOrbit: mapOrbit, dev: env.dev };
    // The minimap's picture of the whole map (2 world units a pixel), redrawn twice a second: ground, food, ants (field/minimap.ts).
    const minimap = new Minimap(env);
    // The shown map, theme and sprite sets, bound each frame (field/binding.ts).
    const binding = new FieldBinding(
      env,
      world,
      colonies,
      fungus,
      sensed,
      ground,
      minimap,
      { shown: () => shown.current, smell: () => !!buildRef.current?.smell },
      cssVar,
      anyColony,
    );
    const retheme = () => binding.retheme();
    // What the layers share and read (field/ctx.ts): filled each frame below, once the camera is known.
    const fctx: FieldCtx = {
      ctx,
      theme: binding.theme,
      d: 1,
      v: { w: 0, h: 0 },
      c: { x: 0, y: 0, zoom: 1 },
      lv: binding.lv,
      m: binding.m,
      ext: binding.ext,
      world,
      colonies,
      fungus,
      env,
      sprites: binding.sprites,
      smellAll: binding.smellAll,
      strip: binding.strip,
      trails: binding.trails,
      alarms: binding.alarms,
      spores: binding.spores,
      sensedLayer: binding.sensedLayer,
      sensedNow: sensed.now,
      fog: sensed.knowledge,
      corpses: sensed.corpses,
    };
    const inputs: FieldInputs = { hover: null, pen: null, penSeen: { current: null }, show: layers.current };
    const mq = matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", retheme);
    // The player's own choice (Settings → Appearance) is data-theme on <html>.
    const themeWatch = new MutationObserver(retheme);
    themeWatch.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

    const fitCanvas = () => {
      const d = env.dpr();
      const rect = canvas.getBoundingClientRect();
      const w = Math.max(1, Math.round(rect.width * d));
      const h = Math.max(1, Math.round(rect.height * d));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
    };
    const ro = new ResizeObserver(fitCanvas);
    ro.observe(canvas);
    fitCanvas();

    // What the renderer draws with, and the renderer (field/renderer.ts): a frame is its stages, in order.
    const parts: FieldParts = { ground, minimap, voxelMap, sinks };
    const renderer = new FieldRenderer();
    const draw = () => {
      const started = env.dev ? env.now() : 0;
      binding.bind();
      const d = env.dpr();
      const v: Viewport = { w: canvas.width, h: canvas.height, dpr: d };
      ground.beginFrame();
      // The followed ant as it stood when the frame began (the prelude below ends the follow of an ant that is gone).
      const f = follow.current;
      const fcol = f ? followedColony(colonies, f) : null;
      const fHere = f !== null && fcol !== null && fcol.layer[f.i] === binding.lv;
      // The follow, the crossing through a hole and the camera's ease (field/prelude.ts), then the frame draws with the camera it gives.
      const c = prepareFrame(colonies, binding.lv, binding.ext, v, vc(), {
        follow,
        followCb,
        antLayer,
        carryTo,
        crossCb,
        lostCb,
        fog: sensed.knowledge,
      });
      binding.fill(fctx);
      Object.assign(fctx, { d, v, c, miniWin: rig.frozenMini() });
      inputs.show = layers.current;
      inputs.hover = hover.current;
      inputs.pen = penRef.current;
      renderer.frame(
        beginFrame(
          fctx,
          inputs,
          parts,
          {
            orbit: orbit.current,
            labelsOn: labelsOn.current,
            aphids: aphidsRef.current?.() ?? [],
            traces: tracesRef.current,
            specimens: pinnedRef.current,
            sensed,
          },
          // An ant the follow just lost sight of (it ended in the prelude) gets no ring: the ring would show where it is.
          f !== null && fcol !== null && follow.current === null
            ? { started, f: null, fcol: null, fHere: false }
            : { started, f, fcol, fHere },
        ),
      );
    };
    binding.load(draw);
    const off = onFrame(draw);
    draw();

    // The wheel zooms around the pointer; it needs a non-passive listener to keep the page from scrolling.
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = canvas.getBoundingClientRect();
      const k = canvas.width / r.width;
      const v: Viewport = { w: canvas.width, h: canvas.height, dpr: k };
      handleWheel(rig, v, { x: (e.clientX - r.left) * k, y: (e.clientY - r.top) * k, deltaY: e.deltaY }, angled.current);
    };
    canvas.addEventListener("wheel", wheel, { passive: false });
    return () => {
      off();
      voxelMap.dispose();
      binding.dispose();
      ro.disconnect();
      mq.removeEventListener("change", retheme);
      themeWatch.disconnect();
      canvas.removeEventListener("wheel", wheel);
    };
    // `count`: a colony founded mid-game is pushed onto the same array (Game.addColony). The view is read each frame
    // (`shown`), so switching it builds nothing again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [colonies, count, fungus, onFrame, world, sensed]);
}
