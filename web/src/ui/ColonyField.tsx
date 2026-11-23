import { mapCameraOrbit, mapOrbit, tiltFromDrag, type InspectionOrbit } from "./inspectionOrbit.ts";
import { MAP_ORBIT_READY_ZOOM, MapVoxelPass, canTiltMap } from "./mapVoxel.ts";
import { decayStage } from "./cadaverVisual.ts";
import { drawMapInspection, mapInspectionNow } from "./mapInspection.ts";
import { type KeyboardEvent, type PointerEvent, type RefObject, useEffect, useRef, useState } from "react";
import {
  type ChunkLayer,
  type Colony,
  CURTAIN,
  PLANE,
  groundHeat,
  sunDown,
  CELL,
  cellOf,
  centreX,
  centreY,
  R,
  INFECTED,
  type Fungus,
  type OneWorld,
  BINS,
  binOf,
  OPEN,
  rockAt,
  type WorldMap,
  type BuildTool,
  aphidCount,
  type AphidClump,
} from "../colony/index.ts";
import { type Camera, toScreen, toWorld, type Viewport, visible } from "./camera.ts";
import { followedColony, type Followed } from "./follow.ts";
import { prepareFrame } from "./field/prelude.ts";
import { handleKey, handleWheel, type KeyHost } from "./field/keyboard.ts";
import { PointerController, type PointerHost, type PointerInput } from "./field/pointer.ts";
import { CameraRig, extentOf } from "./field/rig.ts";
import { odourColour } from "./field/colour.ts";
import type { FieldCtx, FieldInputs, FieldPen, FieldTheme } from "./field/ctx.ts";
import { browserEnv } from "./field/env.ts";
import { drawFungusGround, drawStalksRaised } from "./field/fungus.ts";
import { Ground, groundPaper } from "./field/ground.ts";
import { Minimap } from "./field/minimap.ts";
import { drawNest, type NestFrame } from "./field/nests.ts";
import { BRICK_ZOOM, HEX_ZOOM } from "./field/zoom.ts";
import { drawBends, drawHoleNames, drawLine, drawPen, drawStripAnts, pill } from "./field/overlays.ts";
import { publishDrawMs, publishFrame, type FrameSinks } from "./field/result.ts";
import { columnNear, planePoint, stripColumn, stripPoint } from "./link.ts";
import { colonyName } from "./names.ts";
import { BROOD_RGB } from "./palette.ts";
import type { SensedMap } from "./fungusSight.ts";
import { antTag } from "./badges.ts";
import { isPalm } from "./build.ts";
import { sameAnt, type Specimen, specimenLabel } from "./specimens.ts";
import { type AntTraces, traceAlpha } from "./trace.ts";
import type { FieldProbe } from "./lensStore.ts";
import { drawWorkerSprite, workerLod } from "./workerSprites.ts";
import { drawNestSprite, type NestSprite } from "./nestSprites.ts";
import { drawMapTerrainGrain } from "./mapTerrain.ts";
import { carriedBroodOn } from "./mapCargo.ts";
import { APHID_SPOTS, FOOD_SPOTS, aphidDensity, foodDensity, foodKind, drawResourceSprite } from "./resourceSprites.ts";

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

function rgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  return m ? [parseInt(m[1]!, 16), parseInt(m[2]!, 16), parseInt(m[3]!, 16)] : [128, 128, 128];
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
    const sprites = env.sprites();
    const {
      cadaver: cadaverSprites,
      worker: workerSprites,
      nest: nestSprites,
      resource: resourceSprites,
      surfaceLeaves,
      mapLeaves,
      gait: workerGait,
    } = sprites;
    const voxelMap = new MapVoxelPass(() => draw());
    const ground = new Ground(env);
    const sinks: FrameSinks = { dataset: canvas.dataset, orbit, orbitAxes, angled, flatOrbit: mapOrbit, dev: env.dev };
    // The shown map, read each frame (bind): which layer (`lv`: PLANE or CURTAIN), its map, every
    // colony's alarm and the fungus's spores on it, and whether the side view's strip is drawn from the plane.
    // placeholders: bind() sets all of these before the first frame draws
    let lv = -1;
    let m: WorldMap = anyColony.map;
    let alarms: ChunkLayer<Float32Array>[] = [];
    let spores: ChunkLayer<Float32Array> = fungus.spores;
    let strip = false;
    // Each colony's trails on the shown layer; a cell shows them as strongly as a host sensed it lately (PRD §65).
    let trails: { food: ChunkLayer<Float32Array>; home: ChunkLayer<Float32Array>; odour: number }[] = [];
    // Smell vision (the builder's, PRD §73): every trail and alarm shown everywhere, each food trail in its colony's tone.
    let smellAll = false;
    let sensedLayer: ChunkLayer<Float32Array> | null = null;
    // The map's size and first column: its columns run gx0 … gx0 + gw − 1 (gx0 < 0 on one world's curtain, whose column
    // is the line's s), and the extent the camera fits; set again (rebuild) when the map or its size changes.
    let gx0 = m.x0;
    let gw = m.size.w;
    let gh = m.size.h;
    let ext = extentOf(m);
    let geoMap: WorldMap | null = null;
    // The minimap's picture of the whole map (2 world units a pixel), redrawn twice a second: ground, food, ants (field/minimap.ts).
    const minimap = new Minimap(env);
    /** The shown map is another, or has grown (a founding widens one world's curtain): its size, extent, chunks and minimap afresh. */
    const rebuild = (map: WorldMap) => {
      geoMap = map;
      gx0 = map.x0;
      gw = map.size.w;
      gh = map.size.h;
      ext = extentOf(map);
      ground.clear();
      minimap.resize(ext);
    };
    /** Read the shown view: its layer, map, scent and spores (each frame). */
    const bind = () => {
      lv = shown.current;
      m = lv === PLANE ? world.plane : world.curtain;
      if (m !== geoMap || m.x0 !== gx0 || m.size.w !== gw || m.size.h !== gh) rebuild(m);
      spores = fungus.sporesOn(lv)?.spores ?? fungus.spores;
      strip = lv === CURTAIN;
      trails = [];
      alarms = [];
      sensedLayer = sensed.layer(lv);
      smellAll = !!buildRef.current?.smell;
      for (const col of colonies) {
        const p = col.layers[lv]?.ph;
        if (!p) continue;
        alarms.push(p.fields.alarm);
        trails.push({ food: p.fields.food, home: p.fields.home, odour: col.nestOdour });
      }
    };
    bind();

    let theme: FieldTheme = {
      paper: "",
      ink: "",
      accent: "",
      warn: "",
      line: "",
      fg3: "",
      rock: rgb("#c9c2b5"),
      soil: rgb("#e3d5bf"),
      sky: rgb("#e4edf1"),
      spoil: rgb("#c8b28c"),
      mound: "#6e6250",
      trail: [31, 111, 92],
      alarm: rgb("#8a5300"),
      accentRgb: rgb("#1f6f5c"),
      paperRgb: rgb("#f6f4ef"),
      inkRgb: rgb("#1c1b19"),
      warnRgb: rgb("#8a5300"),
      spore: "#7a4fa0",
      aphid: "#5a9a2c",
      sporeRgb: rgb("#7a4fa0"),
      chamber: rgb("#a39a8a"),
    };
    const retheme = () => {
      ground.clearTiles();
      workerSprites.clearTints();
      nestSprites.clearTints();
      theme = {
        paper: cssVar("--paper"),
        ink: cssVar("--ink"),
        accent: cssVar("--accent"),
        warn: cssVar("--warn"),
        line: cssVar("--line-strong"),
        fg3: cssVar("--fg-3"),
        rock: rgb(cssVar("--line-strong")),
        soil: rgb(cssVar("--soil")),
        sky: rgb(cssVar("--sky")),
        spoil: rgb(cssVar("--spoil")),
        mound: cssVar("--mound"),
        trail: cssVar("--heat").split(/\s+/).map(Number),
        alarm: rgb(cssVar("--warn")),
        accentRgb: rgb(cssVar("--accent")),
        paperRgb: rgb(cssVar("--paper")),
        inkRgb: rgb(cssVar("--ink")),
        warnRgb: rgb(cssVar("--warn")),
        spore: cssVar("--spore"),
        aphid: cssVar("--aphid"),
        sporeRgb: rgb(cssVar("--spore")),
        chamber: rgb(cssVar("--mound")),
      };
      minimap.invalidate();
    };
    retheme();
    // What the layers share and read (field/ctx.ts): filled each frame below, once the camera is known.
    const fctx: FieldCtx = {
      ctx,
      theme,
      d: 1,
      v: { w: 0, h: 0 },
      c: { x: 0, y: 0, zoom: 1 },
      lv,
      m,
      ext,
      world,
      colonies,
      fungus,
      env,
      sprites,
      smellAll,
      strip,
      trails,
      alarms,
      spores,
      sensedLayer,
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

    const draw = () => {
      const started = env.dev ? env.now() : 0;
      bind();
      const d = env.dpr();
      const v: Viewport = { w: canvas.width, h: canvas.height, dpr: d };
      ground.beginFrame();
      // The followed ant as it stood when the frame began (the prelude below ends the follow of an ant that is gone).
      const f = follow.current;
      const fcol = f ? followedColony(colonies, f) : null;
      const fHere = f !== null && fcol !== null && fcol.layer[f.i] === lv;
      // The follow, the crossing through a hole and the camera's ease (field/prelude.ts), then the frame draws with the camera it gives.
      const c = prepareFrame(colonies, lv, ext, v, vc(), { follow, followCb, antLayer, carryTo, crossCb });
      Object.assign(fctx, { theme, d, v, c, lv, m, ext, smellAll, strip, trails, alarms, spores, sensedLayer, sensedNow: sensed.now });
      inputs.show = layers.current;
      inputs.hover = hover.current;
      inputs.pen = penRef.current;
      ctx.fillStyle = theme.paper;
      ctx.fillRect(0, 0, v.w, v.h);
      ctx.imageSmoothingEnabled = false;
      const [left, top] = toScreen(c, v, gx0, 0);
      const [right, bottom] = toScreen(c, v, gx0 + ext.w, ext.h);
      ctx.fillStyle = `rgb(${groundPaper(fctx).join(",")})`;
      ctx.fillRect(left, top, right - left, bottom - top);

      // The rows of hexagons in view, and the chunks they fall in. Every chunk in view is painted
      // into its 64×64 colour buffer (one pixel a cell); then drawn as bricks or as hexagons.
      const vis = visible(c, v);
      const ry0 = Math.max(0, Math.floor(vis.y0 / R) - 1);
      const ry1 = Math.min(gh - 1, Math.ceil(vis.y1 / R) + 1);
      const rx0 = Math.max(gx0, Math.floor(vis.x0) - 1);
      const rx1 = Math.min(gx0 + gw - 1, Math.ceil(vis.x1) + 1);
      const zoom = c.zoom / d;
      const hexes = zoom >= HEX_ZOOM;
      const blend = Math.max(0, Math.min(1, (zoom - BRICK_ZOOM) / (16 - BRICK_ZOOM)));
      const hexMix = blend * blend * (3 - 2 * blend);
      const resourceLod = workerLod(c.zoom, d);
      const darkSprites = theme.paperRgb[0] * 0.2126 + theme.paperRgb[1] * 0.7152 + theme.paperRgb[2] * 0.0722 < 100;
      // Read-only browser diagnostics: actual CSS scale and the available worker representation.
      const cssHex = (c.zoom / d).toFixed(2),
        workerStyle = hexes && workerSprites.ready(resourceLod) ? "voxel" : "ink";
      // Both maps face the ants' walking plane: aerial above, straight onto the back wall below.
      const resourceImage = hexes ? resourceSprites.get(resourceLod) : null;
      const cellWindow = { rx0, rx1, ry0, ry1 };
      ground.draw(fctx, inputs.show, cellWindow, hexMix, !!resourceImage);
      if (hexMix > 0) {
        ctx.save();
        ctx.globalAlpha = hexMix;
        drawMapTerrainGrain(
          ctx,
          c.zoom,
          v.w / 2 - c.x * c.zoom,
          v.h / 2 - c.y * c.zoom,
          [rx0, rx1, ry0, ry1],
          (x, y) => rockAt(m, x, y),
          (x, y) => ground.isBare(x, y),
          theme.ink,
          theme.paper,
        );
        ctx.restore();
      }
      const nestImage = hexes ? nestSprites.get(resourceLod) : null;
      const nestStyle = nestImage ? "voxel" : "symbols";
      // Surface plain-food cells join into tissue; carried food and other qualities stay separate morsels.
      if (resourceImage) {
        for (let y = ry0; y <= ry1; y++)
          for (let x = rx0; x <= rx1; x++) {
            const amount = m.food.get(x, y);
            if (!(amount > 0) || rockAt(m, x, y) !== OPEN) continue;
            const density = foodDensity(amount),
              kind = foodKind(m.quality?.get(x, y) ?? 1);
            if (lv === PLANE && kind === "plain") {
              const tiles = surfaceLeaves.get(x, y, (a, b) =>
                rockAt(m, a, b) === OPEN && foodKind(m.quality?.get(a, b) ?? 1) === "plain" ? m.food.get(a, b) : 0,
              );
              mapLeaves.draw(ctx, tiles, c.zoom, v.w / 2 - c.x * c.zoom, v.h / 2 - c.y * c.zoom);
              continue;
            }
            ctx.globalAlpha = density.alpha;
            for (let j = 0; j < density.marks; j++) {
              const [ox, oy] = FOOD_SPOTS[j]!;
              const [sx, sy] = toScreen(c, v, centreX(x, y) + ox, centreY(y) + oy);
              drawResourceSprite(ctx, resourceImage, resourceLod, kind, 0, sx, sy, c.zoom);
            }
          }
        ctx.globalAlpha = 1;
      }
      // Heat (ja-rf5.5): the plane's ground warms toward noon and cools by dawn; a warm wash over it shows how hot it is now.
      const hp = colonies[0]?.params;
      if (hp && hp.heatDay > 0 && lv === PLANE) {
        const k = Math.max(0, Math.min(1, (groundHeat(hp, colonies[0]!.time) - hp.heatDawn) / (hp.heatNoon - hp.heatDawn)));
        ctx.globalAlpha = 0.28 * k;
        ctx.fillStyle = theme.warn;
        ctx.fillRect(0, 0, v.w, v.h);
        // Night (the sun down): a dark wash; the desert ants are in. Black in both themes: the ink is pale in dark mode (review of #155, S1).
        if (sunDown(hp, colonies[0]!.time)) {
          ctx.globalAlpha = 0.3;
          ctx.fillStyle = "#000";
          ctx.fillRect(0, 0, v.w, v.h);
        }
        ctx.globalAlpha = 1;
      }
      // The fungus on the ground: this layer's hyphae, and the corpses it has colonised (field/fungus.ts).
      const fungusFrame = drawFungusGround(fctx, cellWindow);

      // Nests and ants in view, coloured by odour (recognition.ts): the first colony (Ink) starts in ink, the second (Amber) in the
      // warn tone, and as the fungus brings them to one odour they meet in between. A jade crumb at the head of a carrier,
      // an earth one at the head of an ant carrying soil. Round each nest, the mound of the soil it dug.
      const len = Math.max(3, Math.min(22, c.zoom * 0.9));
      const half = len / 2;
      const crumb = Math.max(1.5, len * 0.35);
      const inView = (wx: number, wy: number) => wx >= vis.x0 - 2 && wx <= vis.x1 + 2 && wy >= vis.y0 - 2 && wy <= vis.y1 + 2;
      if (lv === PLANE) drawLine(fctx);
      if (lv === CURTAIN) drawBends(fctx);
      const alateOverlays: (() => void)[] = [];
      const nestFrame: NestFrame = { len, inView, hexes, resourceLod, darkSprites, nestImage, resourceImage };
      for (const col of [...colonies].reverse()) {
        const alates = drawNest(fctx, nestFrame, col);
        if (alates) alateOverlays.push(alates);
        ctx.lineCap = "round";
        ctx.lineWidth = Math.max(1, len * 0.3);
        ctx.globalAlpha = 0.85;
        workerGait.update(col);
        // A front-facing curtain worker is the same silhouette as the aerial worker against its walking plane.
        // The surface strip is a separate diagrammatic projection, not another underground population.
        const lod = workerLod(c.zoom, d);
        // One stroke per odour band (most frames: one band per colony).
        let bands = 0;
        for (let i = 0; i < col.n; i++) if (col.alive[i] && col.layer[i] === lv) bands |= 1 << binOf(col.odour[i]);
        for (let b = 0; b < BINS; b++) {
          if (!(bands & (1 << b))) continue;
          const colour = theme.inkRgb.map((ink, k) => Math.round(ink + ((theme.warnRgb[k] - ink) * b) / (BINS - 1)));
          const sprite = hexes ? workerSprites.get(lod, colour, darkSprites) : null;
          const spriteMix = sprite ? Math.min(1, (zoom - HEX_ZOOM) / 2) : 0;
          ctx.beginPath();
          for (let i = 0; i < col.n; i++) {
            if (!col.alive[i] || col.layer[i] !== lv || binOf(col.odour[i]) !== b || !inView(col.x[i], col.y[i])) continue;
            const [x, y] = toScreen(c, v, col.x[i], col.y[i]);
            if (sprite && spriteMix > 0) {
              ctx.globalAlpha = spriteMix;
              const pose = lod === "walk" && !env.reducedMotion() ? workerGait.pose(col, i) : 0;
              drawWorkerSprite(ctx, sprite, lod, col.heading[i], pose, x, y, c.zoom);
            }
            if (spriteMix < 1) {
              const hc = Math.cos(col.heading[i]) * half;
              const hs = Math.sin(col.heading[i]) * half;
              ctx.moveTo(x - hc, y - hs);
              ctx.lineTo(x + hc, y + hs);
            }
          }
          ctx.globalAlpha = 1 - spriteMix;
          ctx.strokeStyle = theme.ink;
          ctx.stroke();
          if (spriteMix < 1) {
            ctx.beginPath();
            for (let i = 0; i < col.n; i++) {
              if (!col.alive[i] || col.layer[i] !== lv || binOf(col.odour[i]) !== b || !inView(col.x[i], col.y[i])) continue;
              const [x, y] = toScreen(c, v, col.x[i], col.y[i]),
                co = Math.cos(col.heading[i]),
                si = Math.sin(col.heading[i]),
                ax = x - co * half * 0.45,
                ay = y - si * half * 0.45,
                w = Math.max(d, half * 0.35);
              ctx.moveTo(ax - si * w, ay + co * w);
              ctx.lineTo(ax + si * w, ay - co * w);
            }
            ctx.strokeStyle = odourColour(theme.inkRgb, theme.warnRgb, b / (BINS - 1));
            ctx.stroke();
          }
        }
        ctx.globalAlpha = 1;
        // Infected ants: a spore-coloured dot on the body, fainter for a light load.
        const dot = Math.max(1.5, len * 0.45);
        ctx.fillStyle = theme.spore;
        for (const [lo, hi, alpha] of [
          [INFECTED, 0.5, 0.55],
          [0.5, 2, 1],
        ] as const) {
          ctx.globalAlpha = alpha;
          for (let i = 0; i < col.n; i++) {
            const l = col.load[i];
            if (!col.alive[i] || l < lo || l >= hi || col.layer[i] !== lv || !inView(col.x[i], col.y[i])) continue;
            const [x, y] = toScreen(c, v, col.x[i], col.y[i]);
            ctx.fillRect(x - dot / 2, y - dot / 2, dot, dot);
          }
        }
        ctx.globalAlpha = 1;
        ctx.fillStyle = theme.accent;
        for (let i = 0; i < col.n; i++) {
          if (!col.alive[i] || !col.carrying[i] || col.layer[i] !== lv || !inView(col.x[i], col.y[i])) continue;
          const [x, y] = toScreen(c, v, col.x[i], col.y[i]);
          if (resourceImage) {
            const reach = 0.46 * c.zoom;
            drawResourceSprite(
              ctx,
              resourceImage,
              resourceLod,
              foodKind(col.quality[i]),
              0,
              x + Math.cos(col.heading[i]) * reach,
              y + Math.sin(col.heading[i]) * reach,
              c.zoom,
            );
          } else
            ctx.fillRect(x + Math.cos(col.heading[i]) * half - crumb / 2, y + Math.sin(col.heading[i]) * half - crumb / 2, crumb, crumb);
        }
        ctx.fillStyle = theme.mound;
        ctx.strokeStyle = theme.mound;
        ctx.lineWidth = Math.max(1, d * 0.8);
        ctx.beginPath();
        for (let i = 0; i < col.n; i++) {
          if (!col.alive[i] || !col.pellet[i] || col.layer[i] !== lv || !inView(col.x[i], col.y[i])) continue;
          const [x, y] = toScreen(c, v, col.x[i], col.y[i]);
          const reach = hexes ? c.zoom * 0.46 : half;
          const px = x + Math.cos(col.heading[i]) * reach;
          const py = y + Math.sin(col.heading[i]) * reach;
          if (col.carriesCorpse(i)) {
            const dead = col.corpses.find((k) => k.held === i);
            if (cadaverSprites.draw(ctx, resourceLod, decayStage(col.time, dead?.died ?? col.time), px, py, c.zoom)) continue;
            if (nestImage) {
              drawNestSprite(ctx, nestImage, resourceLod, "corpse", px, py, c.zoom);
              continue;
            }
            // A corpse in the jaws: the dead's grey cross, half size (slice 7 review: it was drawn as a soil crumb).
            const h = crumb * 0.75;
            ctx.moveTo(px - h, py - h);
            ctx.lineTo(px + h, py + h);
            ctx.moveTo(px + h, py - h);
            ctx.lineTo(px - h, py + h);
          } else if (resourceImage) drawResourceSprite(ctx, resourceImage, resourceLod, "crumb", 0, px, py, c.zoom);
          else ctx.fillRect(px - crumb / 2, py - crumb / 2, crumb, crumb);
        }
        ctx.stroke();
        for (const { i, stage } of carriedBroodOn(col, lv)) {
          if (!inView(col.x[i], col.y[i])) continue;
          const [x, y] = toScreen(c, v, col.x[i], col.y[i]);
          const reach = hexes ? c.zoom * 0.46 : half;
          const px = x + Math.cos(col.heading[i]) * reach,
            py = y + Math.sin(col.heading[i]) * reach;
          if (nestImage) drawNestSprite(ctx, nestImage, resourceLod, `brood-${stage}` as NestSprite, px, py, c.zoom);
          else {
            ctx.fillStyle = BROOD_RGB[stage] as string;
            ctx.fillRect(px - crumb / 2, py - crumb / 2, crumb, crumb);
          }
        }
      }
      if (strip) drawStripAnts(fctx, len, crumb, inView);

      drawStalksRaised(fctx, cellWindow, fungusFrame);

      // Chamber labels (the Learn drawer): each chamber's role at its centre, where the chamber is wide enough on screen.
      const voxel = voxelMap.draw(
        ctx,
        { colonies, fungus, world },
        sensed,
        lv,
        c,
        v,
        d,
        layers.current,
        aphidsRef.current?.() ?? [],
        theme,
        !smellAll,
        mapCameraOrbit(lv, orbit.current),
      );
      const canRotate = canTiltMap(lv, !!world, c, v, d, !smellAll);
      const frameAngled = "angled" in voxel && voxel.angled === true;
      // What the frame found out about itself goes to the shell's refs and the canvas's data attributes (field/result.ts).
      publishFrame(
        {
          hexCssPx: cssHex,
          workerStyle,
          nestStyle,
          renderer: voxel.renderer,
          voxelAlpha: voxel.alpha,
          angled: frameAngled,
          canRotate,
          chunkPaints: ground.paints,
          chunkCacheHits: ground.hits,
        },
        sinks,
      );
      if (frameAngled) {
        minimap.draw(fctx, vis);
        return; // Map labels and hit targets use the overhead projection.
      }
      if (voxel.alpha > 0) {
        // Alates keep their existing body/wing atlas until the shared mesh contains their separate wings.
        for (const drawAlates of alateOverlays) drawAlates();
        if (hp && hp.heatDay > 0 && lv === PLANE) {
          const heat = Math.max(0, Math.min(1, (groundHeat(hp, colonies[0]!.time) - hp.heatDawn) / (hp.heatNoon - hp.heatDawn)));
          ctx.globalAlpha = voxel.alpha * 0.28 * heat;
          ctx.fillStyle = theme.warn;
          ctx.fillRect(0, 0, v.w, v.h);
          if (sunDown(hp, colonies[0]!.time)) {
            ctx.globalAlpha = voxel.alpha * 0.3;
            ctx.fillStyle = "#000";
            ctx.fillRect(0, 0, v.w, v.h);
          }
          ctx.globalAlpha = 1;
        }
        if (world && lv === PLANE) drawLine(fctx, false);
        if (world && lv === CURTAIN) drawBends(fctx);
      }
      if (labelsOn.current && m.chambers) {
        const px = Math.round(Math.max(10, Math.min(14, c.zoom * 0.9)) * d);
        ctx.font = `600 ${px}px ui-sans-serif, system-ui, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.lineJoin = "round";
        ctx.lineWidth = Math.max(2, px / 4);
        for (const ch of m.chambers.list) {
          if (ch.cells === 0 || ch.role === "none") continue;
          const cy = ch.sumY / ch.cells;
          const wx = centreX(Math.round(ch.sumX / ch.cells), Math.round(cy));
          const wy = centreY(cy);
          if (!inView(wx, wy)) continue;
          const text = ch.role;
          const room = (ch.x1 - ch.x0 + 1) * c.zoom;
          if (ctx.measureText(text).width > room * 1.6) continue;
          const [x, y] = toScreen(c, v, wx, wy);
          ctx.strokeStyle = theme.paper;
          ctx.globalAlpha = 0.85;
          ctx.strokeText(text, x, y);
          ctx.globalAlpha = 1;
          ctx.fillStyle = theme.ink;
          ctx.fillText(text, x, y);
        }
        ctx.textAlign = "start";
        ctx.textBaseline = "alphabetic";
      }

      // Aphid marks show aggregate clump density, not individually simulated insects. Fixed-size glyphs at hex zoom;
      // the original green dots farther out / while loading, fading by the same clump-life convention.
      const clumps = aphidsRef.current?.();
      if (voxel.alpha < 1 && clumps?.length && lv === PLANE) {
        ctx.fillStyle = theme.aphid;
        const r = Math.max(1.2 * d, 0.13 * c.zoom);
        for (const cl of clumps) {
          const n = aphidCount(cl);
          const cells = cl.cells.length / 2;
          if (n <= 0 || !cells) continue;
          const density = aphidDensity(n, cells);
          ctx.globalAlpha = density.alpha;
          for (let k = 0; k < cl.cells.length; k += 2) {
            const wx = centreX(cl.cells[k]!, cl.cells[k + 1]!);
            const wy = centreY(cl.cells[k + 1]!);
            if (!inView(wx, wy)) continue;
            for (let j = 0; j < density.marks; j++) {
              const [ox, oy] = APHID_SPOTS[j]!;
              const [x, y] = toScreen(c, v, wx + ox, wy + oy);
              if (resourceImage)
                drawResourceSprite(ctx, resourceImage, resourceLod, "aphid", cl.cells[k]! + cl.cells[k + 1]! + j, x, y, c.zoom);
              else {
                ctx.beginPath();
                ctx.arc(x, y, r, 0, Math.PI * 2);
                ctx.fill();
              }
            }
          }
        }
        ctx.globalAlpha = 1;
      }
      // A moved ant's way home (ja-cwjp): from where the tweezers set it down (a ring), the run of its old vector in a
      // solid line, then its search loops dotted; a dot where it went down a hole. It fades once it is home or dead.
      const tr = tracesRef.current;
      if (tr) {
        const now = env.now();
        tr.update(now);
        if (lv === PLANE)
          for (const t of tr.traces) {
            const n = t.xs.length;
            const a = traceAlpha(t, now);
            if (!n || a <= 0) continue;
            ctx.globalAlpha = 0.85 * a;
            ctx.strokeStyle = theme.accent;
            ctx.fillStyle = theme.accent;
            ctx.lineWidth = Math.max(1.5 * d, 0.25 * c.zoom);
            ctx.lineJoin = "round";
            ctx.lineCap = "round";
            for (let k = 1; k < n;) {
              // One run of points in the same phase, as one path.
              const ph = t.search[k]!;
              ctx.setLineDash(ph ? [2 * d, 4 * d] : []);
              ctx.beginPath();
              const [x0, y0] = toScreen(c, v, t.xs[k - 1]!, t.ys[k - 1]!);
              ctx.moveTo(x0, y0);
              for (; k < n && t.search[k] === ph; k++) {
                const [x, y] = toScreen(c, v, t.xs[k]!, t.ys[k]!);
                ctx.lineTo(x, y);
              }
              ctx.stroke();
            }
            ctx.setLineDash([]);
            const [sx, sy] = toScreen(c, v, t.xs[0]!, t.ys[0]!);
            ctx.beginPath();
            ctx.arc(sx, sy, Math.max(5 * d, 0.8 * c.zoom), 0, Math.PI * 2);
            ctx.lineWidth = 2 * d;
            ctx.stroke();
            if (t.end === "home") {
              const [ex, ey] = toScreen(c, v, t.xs[n - 1]!, t.ys[n - 1]!);
              ctx.beginPath();
              ctx.arc(ex, ey, Math.max(4 * d, 0.6 * c.zoom), 0, Math.PI * 2);
              ctx.fill();
            }
            ctx.globalAlpha = 1;
          }
      }
      // The specimens (PRD §69.5): a dashed ring and the label, on the view's layer; the followed one has its own ring, drawn
      // after these so its tag stays on top (review of #218).
      for (const s of pinnedRef.current) {
        const sc = followedColony(colonies, s);
        if (!sc || sc.layer[s.i] !== lv || (f && sameAnt(f, s))) continue;
        const [x, y] = toScreen(c, v, sc.x[s.i], sc.y[s.i]);
        const r = Math.max(7 * d, c.zoom * 1.3);
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.setLineDash([3 * d, 3 * d]);
        ctx.strokeStyle = theme.ink;
        ctx.lineWidth = 1.5 * d;
        ctx.stroke();
        ctx.setLineDash([]);
        const tpx = Math.round(10 * d);
        pill(fctx, [{ text: specimenLabel(s.no), fill: theme.ink }], x, y - r - tpx, tpx);
      }
      // The followed ant: a jade ring (in one world, while it is on the view's layer). No mark while it is on the other one:
      // the camera goes with it through a hole, so the "gone below / up" ring only flashed for a frame and was removed
      // (ja-rkse, PRD §61).
      if (f && fcol && fHere) {
        const [x, y] = toScreen(c, v, fcol.x[f.i], fcol.y[f.i]);
        ctx.beginPath();
        const r = Math.max(9 * d, c.zoom * 1.6);
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.strokeStyle = theme.accent;
        ctx.lineWidth = 2 * d;
        ctx.stroke();
        const tpx = Math.round(11 * d);
        pill(fctx, [{ text: antTag(fcol, f.i), fill: theme.accent }], x, y - r - tpx, tpx);
      }
      // The hole badges last of the map's marks, so a followed ant at its hole draws under its colony's badge (review of #189, N3).
      if (lv === PLANE) drawHoleNames(fctx, inView);
      const pn = penRef.current;
      if (lv === PLANE && pn) drawPen(fctx, inputs);

      drawMapInspection(ctx, mapInspectionNow(), lv, c, v, d, env.reducedMotion() ? 0 : env.now() / 1000);

      minimap.draw(fctx, vis);
      publishDrawMs(env.now() - started, sinks);
    };
    cadaverSprites.load(draw);
    workerSprites.load(draw);
    nestSprites.load(draw);
    resourceSprites.load(draw);
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
      cadaverSprites.dispose();
      workerSprites.dispose();
      nestSprites.dispose();
      resourceSprites.dispose();
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
