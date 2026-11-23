import { mapOrbit, tiltFromDrag, type InspectionOrbit } from "./inspectionOrbit.ts";
import { MAP_ORBIT_READY_ZOOM, MapVoxelPass } from "./mapVoxel.ts";
import { type KeyboardEvent, type PointerEvent, type RefObject, useEffect, useRef, useState } from "react";
import {
  type Colony,
  CURTAIN,
  PLANE,
  CELL,
  cellOf,
  type Fungus,
  type OneWorld,
  type WorldMap,
  type BuildTool,
  type AphidClump,
} from "../colony/index.ts";
import { type Camera, toWorld, type Viewport } from "./camera.ts";
import { followedColony, type Followed } from "./follow.ts";
import { prepareFrame } from "./field/prelude.ts";
import { handleKey, handleWheel, type KeyHost } from "./field/keyboard.ts";
import { PointerController, type PointerHost, type PointerInput } from "./field/pointer.ts";
import { CameraRig } from "./field/rig.ts";
import type { FieldCtx, FieldInputs, FieldPen } from "./field/ctx.ts";
import { browserEnv } from "./field/env.ts";
import { FieldBinding } from "./field/binding.ts";
import { Ground } from "./field/ground.ts";
import { Minimap } from "./field/minimap.ts";
import { beginFrame, type FieldParts, FieldRenderer } from "./field/renderer.ts";
import type { FrameSinks } from "./field/result.ts";
import { columnNear, planePoint, stripColumn, stripPoint } from "./link.ts";
import { colonyName } from "./names.ts";
import type { SensedMap } from "./fungusSight.ts";
import { isPalm } from "./build.ts";
import type { Specimen } from "./specimens.ts";
import type { AntTraces } from "./trace.ts";
import type { FieldProbe } from "./lensStore.ts";

export type { FieldProbe };

// The colony's ground through a camera. One canvas at device resolution,
// redrawn every frame: only the chunks in view are painted, each into its
// own 64×64 canvas and scaled up without smoothing, so cells stay crisp;
// only the ants in view are drawn, as aerial worker sprites at hex zoom and ink ticks farther out, with a jade crumb on the
// carriers. Drag to pan, wheel or pinch to zoom, arrows/WASD and +/− on the
// keyboard; click an ant to follow it. Zoomed in, a minimap in the corner
// shows the whole map and where the view is (click it to jump). Colours
// come from the theme's CSS variables, so dark mode needs no code path of
// its own. The canvas sits absolutely in its aspect-ratio box: in flow, its
// own pixel height fed back into the box and stretched the map on a phone.
//
// One world (docs/one-world.md §5) is one game in two views, drawn one at a time: above, the plane, with the line
// dashed through the holes, each hole named, and the mound; below, the curtain unrolled, with the ground strip drawn
// from the plane cells under the line (P(s)), the mound's cut stacked on it and the plane's ants standing there, and a
// faint rule at each bend. Each view keeps its own camera; only the ants, corpses and scent of the view's layer show.
// The views are linked (U5.2): a click on the line above, or on the strip below, asks the page for the other view there
// (onLink); a followed ant that goes through a hole is reported (onCross), and the page carries the camera across. In
// the queen's pen the top view shows her flight's circle and, under the pointer, where she would settle.

interface Props {
  /** every colony on the map: the first drawn in ink, the second in the warn tone, the ones founded later by their odour (ja-lo8.8) */
  colonies: readonly Colony[];

  /** the fungus: spores drawn on the ground, infected ants marked */
  fungus: Fungus;
  /** what the fungus's hosts have sensed (PRD §65): every colony's trails and alarm show only there, fading */
  sensed: SensedMap;
  onFrame: (fn: () => void) => () => void;
  showFoodTrail: boolean;
  showHomeTrail: boolean;
  followed: Followed | null;
  onFollow: (f: Followed | null) => void;
  /** with chamber labels on, a click on a chamber (no ant under it): colony k's chamber `id` (the Learn drawer's Nest tab) */
  onChamber?: (k: number, id: number) => void;
  /** one world: the plane and the curtain, drawn one at a time (`view`) */
  world: OneWorld;
  /** which of one world's layers to show: PLANE (above) or CURTAIN (below) */
  view?: number;
  /**
   * One world: a click (no ant under it) on the line in the top view, or on the side view's strip or the sky over it,
   * asks for the other view (PLANE or CURTAIN) centred on (x, y) there: the strip at that column below, P(s) above.
   */
  onLink?: (view: number, x: number, y: number) => void;
  /** One world: the followed ant has gone through a hole, out of the shown view, onto layer `view` at (x, y). */
  onCross?: (view: number, x: number, y: number) => void;
  /** the field's cameras, for the page (centreOn: a linked click, an ant carried across) and the dev hook */
  api?: RefObject<FieldApi | null>;
  /** one world's queen's pen: her flight's circle on the plane, where she would settle, and a click to found there */
  pen?: FieldPen | null;
  /** where the "Go to" menu sits over the field (position classes; the page keeps it clear of its own surfaces) */
  toolsAt?: string;
  /** the specimens (PRD §69.5): each marked on the map with its label */
  specimens?: readonly Specimen[];
  /** the lens is on (PRD §69.3): a mouse over the map reports what is under it, and a click reports it pinned instead of following */
  lens?: boolean;
  /** what is under the pointer, with the lens on (null: the pointer left the map) */
  onProbe?: (p: FieldProbe | null) => void;
  /** the builder (docs/builder.md, PRD §73): the tool in hand, smell vision, and where a stroke goes; null when it is off */
  build?: FieldBuild | null;
  /** the ants the tweezers moved: each one's way home, drawn on the top view (ja-cwjp), builder on or off */
  traces?: AntTraces | null;
  /** the builder's aphid clumps (docs/aphids.md, ja-nzkg.6), read each frame: the game replaces its list as clumps go */
  aphids?: (() => readonly AphidClump[]) | null;
}

/** The builder on the field (ja-kjj8.3, ja-kjj8.4). */
export interface FieldBuild {
  /** the tool in hand; null: Move (one finger pans and a tap picks an ant, as ever); "tweezers": a touch on an ant lifts it */
  tool: BuildTool | "tweezers" | null;
  /** smell vision (owner, PRD §73): every colony's trails and alarm, everywhere, each trail in its colony's tone */
  smell: boolean;
  /** a piece of a stroke at world points on `layer` (PLANE or CURTAIN); `first`: a new drag begins */
  onStroke: (layer: number, points: { x: number; y: number }[], first: boolean) => void;
  /** the tweezers carry colony k's ant i to world (x, y) on the plane; `first`: a new lift begins */
  onTweeze?: (k: number, i: number, x: number, y: number, first: boolean) => void;
}

/** What the page may ask of the field's cameras. */
export interface FieldApi {
  /**
   * Centre view `view`'s camera (PLANE or CURTAIN) on world (x, y): it is the camera that view opens
   * with. At the shown view's zoom; `close`: at least LINK_ZOOM, so the place shows; `span`: zoomed so that many world
   * units fit across the box's shorter side.
   */
  centreOn: (view: number, x: number, y: number, how?: { close?: boolean; span?: number; keepFollow?: boolean }) => void;
  /** view `view`'s camera as last drawn (null before it was shown or centred) */
  camera: (view: number) => Camera | null;
  /** the whole map, in the view shown (the key 0) */
  showAll: () => void;
  /** colony k's nest, in the view shown (the key n cycles them) */
  goNest: (k: number) => void;
}

/** The pen on the field (one world's top view). */
export type { FieldPen };

/** No specimens: one empty list, so the default prop is the same each render. */
const NO_SPECIMENS: readonly Specimen[] = [];

function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/** A click (or a finger's tap) that moved less than this many CSS px is a click, not a drag. */
const CLICK_SLOP_PX = 8;
/** A click picks the nearest ant within this many CSS px. */
const PICK_PX = 14;

export default function ColonyField({
  colonies,
  fungus,
  sensed,
  onFrame,
  showFoodTrail,
  showHomeTrail,
  followed,
  onFollow,
  onChamber,
  world,
  view = CURTAIN,
  onLink,
  onCross,
  api,
  pen = null,
  toolsAt = "top-2 left-2",
  lens = false,
  onProbe,
  build = null,
  traces = null,
  aphids = null,
  specimens = NO_SPECIMENS,
}: Props) {
  // No colony is the player's (you are the fungus): this one only gives what every colony shares, the map and the holes.
  const anyColony = colonies[0] as Colony;
  const count = colonies.length;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  /** chamber names drawn on the side view's nests (the Labels button); a click on a chamber then inspects it */
  const orbitAxes = useRef<HTMLButtonElement>(null);
  const orbit = useRef(mapOrbit());
  const orbitDrag = useRef<{ id: number; y: number; start: InspectionOrbit } | null>(null);
  const angled = useRef(false);
  const [labels, setLabels] = useState(false);
  const [goOpen, setGoOpen] = useState(false);
  const goRef = useRef<HTMLDivElement>(null);
  // The Go to menu, open: Escape closes it (first, in the capture phase, so a drawer under it stays open) and so does a
  // press anywhere outside it. An Escape something above it took (a pinned lens card) or one a dialog over it will take
  // (the palette) is not its own: one Escape closes one thing (review of #196, S1).
  useEffect(() => {
    if (!goOpen) return;
    const key = (e: globalThis.KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented || document.querySelector('[aria-modal="true"]')) return;
      e.preventDefault();
      setGoOpen(false);
    };
    const outside = (e: globalThis.PointerEvent) => {
      if (!goRef.current?.contains(e.target as Node)) setGoOpen(false);
    };
    window.addEventListener("keydown", key, true);
    window.addEventListener("pointerdown", outside, true);
    return () => {
      window.removeEventListener("keydown", key, true);
      window.removeEventListener("pointerdown", outside, true);
    };
  }, [goOpen]);
  const labelsOn = useRef(labels);
  useEffect(() => {
    labelsOn.current = labels;
  }, [labels]);
  const layers = useRef({ food: showFoodTrail, home: showHomeTrail });
  /** the view shown: PLANE or CURTAIN. Read each frame, so switching draws no new field */
  const shown = useRef(view);
  const follow = useRef<Followed | null>(followed);
  /** the nest `n` went to last: it cycles through the colonies' nests */
  const nestTurn = useRef(0);
  const followCb = useRef(onFollow);
  const crossCb = useRef(onCross);
  /** the followed ant's layer when last drawn: a change is a crossing (a new follow starts afresh) */
  const antLayer = useRef<{ f: Followed; layer: number } | null>(null);
  /**
   * The layer the page was last asked to show for the followed ant (onCross), until the view shown is it: a crossing is
   * judged against the view on its way, not the one still drawn. An ant flicking up and down a hole within the frame or
   * two the switch takes otherwise left the view on the wrong side of it (the e2e guard caught one in twenty runs).
   */
  const carryTo = useRef<number | null>(null);
  const penRef = useRef(pen);
  const buildRef = useRef(build);
  /** the pointer over the canvas (device px), for the pen's preview; null when it left */
  const hover = useRef<[number, number] | null>(null);
  const worldRef = useRef(world);
  useEffect(() => {
    worldRef.current = world;
  }, [world]);
  /** The cameras, one per view (ui/field/rig.ts); the rig reads the page through these ports each time it is asked. */
  const [rig] = useState(
    () =>
      new CameraRig({
        view: () => shown.current,
        map: (v) => (v === PLANE ? worldRef.current.plane : worldRef.current.curtain),
        size: () => ({ w: canvasRef.current?.width ?? 1, h: canvasRef.current?.height ?? 1 }),
        dpr: () => Math.min(2, window.devicePixelRatio || 1),
        following: () => !!follow.current,
        unfollow: () => {
          follow.current = null;
          followCb.current(null);
        },
      }),
  );
  /** The shown view's camera. */
  const vc = () => rig.vc();
  /** The shown view's map: the plane or the curtain. */
  const shownMap = (): WorldMap => (shown.current === PLANE ? world.plane : world.curtain);
  // A new game starts zoomed out, in both views.
  useEffect(() => {
    rig.clear();
  }, [colonies, rig]);
  useEffect(() => {
    shown.current = view;
  }, [view]);
  useEffect(() => {
    layers.current = { food: showFoodTrail, home: showHomeTrail };
  }, [showFoodTrail, showHomeTrail]);
  useEffect(() => {
    follow.current = followed;
  }, [followed]);
  const aphidsRef = useRef(aphids);
  useEffect(() => {
    aphidsRef.current = aphids;
  }, [aphids]);
  const tracesRef = useRef(traces);
  useEffect(() => {
    tracesRef.current = traces;
  }, [traces]);
  const pinnedRef = useRef(specimens);
  useEffect(() => {
    pinnedRef.current = specimens;
  }, [specimens]);
  useEffect(() => {
    followCb.current = onFollow;
  }, [onFollow]);
  useEffect(() => {
    crossCb.current = onCross;
  }, [onCross]);
  useEffect(() => {
    penRef.current = pen;
  }, [pen]);
  const lensRef = useRef(!!lens);
  const probeCb = useRef(onProbe);
  useEffect(() => {
    lensRef.current = !!lens;
    probeCb.current = onProbe;
  }, [lens, onProbe]);
  useEffect(() => {
    buildRef.current = build;
  }, [build]);
  /** The pointer gestures (ui/field/pointer.ts): the pointers down, the gesture under way, the palms the builder set aside (never panned, painted or counted toward a pinch). */
  const [ptr] = useState(() => new PointerController());
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
      const c = prepareFrame(colonies, binding.lv, binding.ext, v, vc(), { follow, followCb, antLayer, carryTo, crossCb });
      binding.fill(fctx);
      Object.assign(fctx, { d, v, c });
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
          { started, f, fcol, fHere },
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

  // ——— input: one pointer drags (pans), two pinch; a click picks an ant; the minimap jumps ———

  const dpr = () => Math.min(2, window.devicePixelRatio || 1);
  const slop = () => CLICK_SLOP_PX * dpr();
  const viewport = () => rig.viewport();
  const camera = () => rig.camera();
  const setCamera = (c: Camera) => rig.set(c);
  const tiltMap = (start: InspectionOrbit, dy: number) => {
    const tilt = tiltFromDrag(start, dy);
    if (tilt === orbit.current.tilt) return;
    const current = camera();
    const readyZoom = MAP_ORBIT_READY_ZOOM * dpr();
    if (current.zoom < readyZoom) setCamera({ ...current, zoom: readyZoom });
    orbit.current = { yaw: 0, tilt };
  };
  // The page's handle on the cameras: a view opens where it is asked (a linked click, an ant carried across).
  useEffect(() => {
    if (!api) return;
    api.current = {
      centreOn: (v, x, y, how) => rig.centreOn(v, x, y, how),
      camera: (v) => rig.cams.get(v)?.cam ?? null,
      showAll: () => showAll(),
      goNest: (k) => goNest(k),
    };
    return () => {
      api.current = null;
    };
  });
  /** A click on nothing in one world: on the line above, the side view at its column; on the strip below (or the sky over it), the top view at P(s). */
  const link = (x: number, y: number) => {
    if (!onLink) return;
    const [wx, wy] = toWorld(camera(), viewport(), x, y);
    if (shown.current === PLANE) {
      const s = columnNear(world.line, wx, wy);
      if (s === null) return;
      const q = stripPoint(s);
      onLink(CURTAIN, q.x, q.y);
    } else {
      const s = stripColumn(world.line, wx, wy);
      const q = s === null ? null : planePoint(world.line, s);
      if (q) onLink(PLANE, q.x, q.y);
    }
  };
  /** Stop following now: the ref at once (a rAF draw must not re-centre on the ant first), the parent's state after. */
  const unfollow = () => {
    follow.current = null;
    onFollow(null);
  };
  const devicePoint = (e: PointerEvent<HTMLCanvasElement>): [number, number] => {
    const r = e.currentTarget.getBoundingClientRect();
    const k = e.currentTarget.width / r.width;
    return [(e.clientX - r.left) * k, (e.clientY - r.top) * k];
  };
  /** The nearest ant (any colony, on the view's layer) within PICK_PX of the point, or null. */
  const pick = (x: number, y: number): Followed | null => {
    const c = camera();
    const [wx, wy] = toWorld(c, viewport(), x, y);
    const reach = (PICK_PX * dpr()) / c.zoom;
    const lv = shown.current;
    let best: Followed | null = null;
    let bestD = reach * reach;
    for (const [k, col] of colonies.entries()) {
      for (let i = 0; i < col.n; i++) {
        if (!col.alive[i] || col.layer[i] !== lv) continue;
        const dx = col.x[i] - wx;
        const dy = col.y[i] - wy;
        const dd = dx * dx + dy * dy;
        if (dd < bestD) {
          bestD = dd;
          best = { k, i, gen: col.gen[i] };
        }
      }
    }
    return best;
  };

  /** The chamber under the point, as (colony index, chamber id), or null. */
  const chamberAt = (x: number, y: number): { k: number; id: number } | null => {
    const chambers = shownMap().chambers;
    if (!chambers) return null;
    const [wx, wy] = toWorld(camera(), viewport(), x, y);
    cellOf(wx, wy);
    const id = chambers.at(CELL[0], CELL[1]);
    const ch = id >= 0 ? chambers.list[id] : undefined;
    if (!ch) return null;
    // A chamber's colony is its nest's index (Colony.params.nest), not "the player's or not": three colonies and more since ja-lo8.8.
    const k = colonies.findIndex((c) => c.params.nest === ch.colony);
    return k < 0 ? null : { k, id };
  };

  /** The builder's layer for the shown view: PLANE or CURTAIN. */
  const buildLayer = () => shown.current;
  /** Send a piece of stroke, device points to world, to the builder. */
  const paint = (pts: [number, number][], first: boolean) => {
    const b = buildRef.current;
    if (!b?.tool) return;
    const c = camera();
    const v = viewport();
    b.onStroke(
      buildLayer(),
      pts.map(([px, py]) => {
        const [wx, wy] = toWorld(c, v, px, py);
        return { x: wx, y: wy };
      }),
      first,
    );
  };

  /** What the pointer controller reads and does on the page (ui/field/pointer.ts): this render's, like the handlers' closures were. */
  const ptrHost = (): PointerHost => ({
    rig,
    slop,
    angled: () => angled.current,
    tilt: () => orbit.current.tilt,
    build: () => buildRef.current,
    pick,
    paint,
    onPlane: () => shown.current === PLANE,
    following: () => !!follow.current,
    follow: (f) => {
      follow.current = f;
      onFollow(f);
    },
    setHover: (x, y) => {
      hover.current = [x, y];
    },
    lensOn: () => lensRef.current,
    probe: probeAt,
    pen: () => penRef.current,
    labelsOn: () => labelsOn.current,
    chamberAt,
    onChamber,
    link,
  });
  const pointerInput = (e: PointerEvent<HTMLCanvasElement>): PointerInput => {
    const [x, y] = devicePoint(e);
    return { id: e.pointerId, pointerType: e.pointerType, button: e.button, buttons: e.buttons, x, y, palm: isPalm(e) };
  };
  const onDown = (e: PointerEvent<HTMLCanvasElement>) => {
    if (e.button === 1) e.preventDefault(); // middle-drag pans; no autoscroll
    if (!ptr.down(ptrHost(), pointerInput(e))) return; // a palm, set aside by the builder
    e.currentTarget.setPointerCapture(e.pointerId);
    e.currentTarget.focus({ preventScroll: true });
  };

  /** Report canvas point (x, y) to the lens: the page's pixels, the world point and the ant there. */
  const probeAt = (x: number, y: number, pinned: boolean) => {
    const cv = canvasRef.current;
    if (!cv || !probeCb.current) return;
    const r = cv.getBoundingClientRect();
    const k = cv.width / r.width;
    const [wx, wy] = toWorld(camera(), viewport(), x, y);
    probeCb.current({ sx: r.left + x / k, sy: r.top + y / k, lv: shown.current, x: wx, y: wy, ant: pick(x, y), pinned });
  };

  const onMove = (e: PointerEvent<HTMLCanvasElement>) => ptr.move(ptrHost(), pointerInput(e));

  const onUp = (e: PointerEvent<HTMLCanvasElement>) => ptr.up(ptrHost(), pointerInput(e), e.type !== "pointerup");

  const keyHost = (): KeyHost => ({
    rig,
    angled: () => angled.current,
    tilt: () => orbit.current.tilt,
    following: () => !!follow.current,
    unfollow,
    nextNest: () => goNest((nestTurn.current + 1) % colonies.length),
  });
  const onKey = (e: KeyboardEvent<HTMLCanvasElement>) => {
    if (handleKey(keyHost(), e)) e.preventDefault();
  };

  const showAll = () => rig.showAll();
  /** Centre on colony k's nest (n cycles through them): on the shown layer (its hole on the plane above, its shaft and chamber below). */
  const goNest = (k: number) => {
    const col = colonies[k] ?? anyColony;
    nestTurn.current = k;
    rig.goTo((col.layers[shown.current] ?? col.layers[0]!).nest);
  };

  const button =
    "pointer-events-auto rounded-md border border-line bg-panel/90 px-2.5 py-1 text-xs text-fg-2 shadow-sm backdrop-blur-sm hover:bg-raised";
  const item = "rounded-md px-3 py-1.5 text-left text-xs text-fg-2 hover:bg-raised";
  return (
    <>
      <canvas
        ref={canvasRef}
        tabIndex={0}
        className={`absolute inset-0 block h-full w-full touch-none outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset ${build?.tool ? "cursor-crosshair" : "cursor-grab active:cursor-grabbing"}`}
        role="application"
        aria-label={`colony field: drag to pan, wheel or pinch to zoom, arrow keys to move, plus and minus to zoom, 0 for the whole map, n to cycle the nests; click an ant to follow it (with the lens on, i, a click says what is there instead)${pen && view === PLANE ? "; click where the new queen flies" : view === PLANE ? "; click the line to look below there" : "; click the ground strip to look above there"}`}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onPointerLeave={() => {
          hover.current = null;
          if (lensRef.current) probeCb.current?.(null);
        }}
        onKeyDown={onKey}
        onContextMenu={(e) => e.preventDefault()}
      />
      <button
        ref={orbitAxes}
        hidden
        type="button"
        aria-label="Tilt close map. Up and down arrow keys tilt. Home resets."
        title="Drag up to tilt · drag down to flatten · Home or double-click resets"
        className="absolute top-1/2 left-1/2 z-10 -translate-x-1/2 -translate-y-1/2 cursor-grab touch-none rounded-full border border-line bg-panel px-2 py-1 text-xs text-fg-2 shadow-md active:cursor-grabbing"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          orbitDrag.current = { id: e.pointerId, y: e.clientY, start: orbit.current };
        }}
        onPointerMove={(e) => {
          const drag = orbitDrag.current;
          if (drag?.id === e.pointerId) {
            tiltMap(drag.start, e.clientY - drag.y);
          }
        }}
        onLostPointerCapture={() => {
          orbitDrag.current = null;
        }}
        onDoubleClick={() => {
          orbit.current = mapOrbit();
        }}
        onKeyDown={(e) => {
          if (e.key === "Home" || e.key === "Escape") orbit.current = mapOrbit();
          else if (e.key === "ArrowUp" || e.key === "ArrowDown") tiltMap(orbit.current, e.key === "ArrowUp" ? -12 : 12);
          else return;
          e.preventDefault();
        }}
      >
        <svg
          aria-hidden="true"
          width="32"
          height="32"
          viewBox="0 0 32 32"
          fill="none"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path stroke="#e95151" d="M15 17h13m-4-4 4 4-4 4" />
          <path stroke="#36a45c" d="m15 17-9 10m0-5v5h5" />
          <path stroke="#3888de" d="M15 17V4m-4 4 4-4 4 4" />
        </svg>
        Tilt
      </button>
      {/* Where to look (PRD §69): one compact menu, so the overlay never runs off a phone's width. */}
      <div ref={goRef} className={`pointer-events-none absolute flex flex-col items-start gap-1 ${toolsAt}`}>
        <button
          type="button"
          className={button}
          aria-expanded={goOpen}
          onClick={() => setGoOpen((o) => !o)}
          title="Whole map, a colony's nest, chamber labels"
        >
          Go to ▾
        </button>
        {goOpen && (
          <div
            className="pointer-events-auto flex flex-col gap-1 rounded-lg border border-line bg-panel/95 p-1 shadow-lg"
            role="group"
            aria-label="go to"
          >
            <button type="button" className={item} onClick={() => (showAll(), setGoOpen(false))} title="Show the whole map (0)">
              Whole map
            </button>
            {colonies.map((_, k) => (
              <button
                key={k}
                type="button"
                className={item}
                onClick={() => (goNest(k), setGoOpen(false))}
                title={`Go to the ${colonyName(k)} colony's nest (n cycles nests)`}
              >
                {colonyName(k)} nest
              </button>
            ))}
            {(view === PLANE ? world.plane : world.curtain).chambers && (
              <button
                type="button"
                className={labels ? `${item} text-accent` : item}
                aria-pressed={labels}
                onClick={() => setLabels((on) => !on)}
                title="Name each chamber by its role; click a chamber to inspect it in the Codex"
              >
                {labels ? "✓ " : ""}Chamber labels
              </button>
            )}
          </div>
        )}
      </div>
    </>
  );
}
