import { CadaverSprites } from "./cadaverSprites.ts";
import { decayStage, visibleCadavers } from "./cadaverVisual.ts";
import { FungalMapSprites } from "./fungalStructures.ts";
import { hyphaShape, HYPHA_COLOURS } from "./hyphaVisual.ts";
import { chamberFoodSpots } from "./chamberFood.ts";
import { drawMapInspection, mapInspectionNow } from "./mapInspection.ts";
import { MapLeafSprites, SurfaceLeaves } from "./surfaceFood.ts";
import { type KeyboardEvent, type PointerEvent, type RefObject, useEffect, useRef, useState } from "react";
import {
  CHUNK,
  type ChunkLayer,
  type Colony,
  CURTAIN,
  moundRadius,
  PLANE,
  groundHeat,
  sunDown,
  CELL,
  cellOf,
  centreX,
  centreY,
  R,
  SIDE,
  INFECTED,
  SPORE_FULL,
  SPORE_SHOWN,
  type Fungus,
  type Hyphae,
  hyphaCell,
  HYPHA_MASS,
  HYPHA_ROOT,
  nx as neighbourX,
  ny as neighbourY,
  cellKey,
  type OneWorld,
  STRIP,
  BINS,
  binOf,
  cellAt,
  columnsOver,
  turnAt,
  segmentCells,
  type Transect,
  AIR,
  OPEN,
  rockAt,
  SOIL,
  type WorldMap,
  worldExtent,
  type BuildTool,
  aphidCount,
  type AphidClump,
} from "../colony/index.ts";
import {
  aimed,
  type Aim,
  type Camera,
  clamp,
  type Extent,
  fit,
  fitZoom,
  fromMinimap,
  minimapRect,
  pan,
  toScreen,
  toWorld,
  type Viewport,
  visible,
  zoomBy,
} from "./camera.ts";
import { followedColony, type Followed } from "./follow.ts";
import { columnNear, planePoint, stripColumn, stripPoint } from "./link.ts";
import type { PenCircle, Settle } from "./pen.ts";
import { colonyName } from "./names.ts";
import { BROOD_RGB, HOME_RGB, ROLE_RGB } from "./palette.ts";
import { sightOf, type SensedMap } from "./fungusSight.ts";
import { antTag, badgeParts, nestBadge } from "./badges.ts";
import { isPalm } from "./build.ts";
import { ALARM_FULL, ALARM_SHOWN, FOOD_FULL, HOME_FULL, TRAIL_SHOWN } from "./lens.ts";
import { sameAnt, type Specimen, specimenLabel } from "./specimens.ts";
import { type AntTraces, traceAlpha } from "./trace.ts";
import type { FieldProbe } from "./lensStore.ts";
import { WorkerGait, WorkerSprites, drawWorkerSprite, workerLod } from "./workerSprites.ts";
import { NestSprites, drawNestSprite, type NestSprite } from "./nestSprites.ts";
import { drawMapTerrainGrain } from "./mapTerrain.ts";
import { carriedBroodOn } from "./mapCargo.ts";
import { APHID_SPOTS, FOOD_SPOTS, ResourceSprites, aphidDensity, foodDensity, foodKind, drawResourceSprite } from "./resourceSprites.ts";

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
  /** one world: the plane and the curtain, drawn one at a time (`view`); null or absent on a game on one map, drawn as ever */
  world?: OneWorld | null;
  /** which of one world's layers to show: PLANE (above) or CURTAIN (below); ignored without `world` */
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
  /** a piece of a stroke at world points on `layer` (PLANE, CURTAIN, or 0 on one map); `first`: a new drag begins */
  onStroke: (layer: number, points: { x: number; y: number }[], first: boolean) => void;
  /** the tweezers carry colony k's ant i to world (x, y) on the plane; `first`: a new lift begins */
  onTweeze?: (k: number, i: number, x: number, y: number, first: boolean) => void;
}

/** What the page may ask of the field's cameras. */
export interface FieldApi {
  /**
   * Centre view `view`'s camera (PLANE, CURTAIN, or the one map's) on world (x, y): it is the camera that view opens
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
export interface FieldPen extends PenCircle {
  /** where she would settle from plane point p, or why not (pen.ts penSettle) */
  preview: (p: { x: number; y: number }) => Settle;
  /** a click on the plane at p */
  onPick: (p: { x: number; y: number }) => void;
}

/** One view's camera: kept per view, so switching between above and below resets neither. */
interface ViewCam {
  cam: Camera | null;
  /** the view shows the whole map: it stays fitted when the canvas is resized (a phone turned, the layout reflowing) */
  fitted: boolean;
  /** whether the view is zoomed in past the whole map (the minimap shows, and takes clicks) */
  zoomedIn: boolean;
  /**
   * Where the page asked the view to centre (FieldApi.centreOn; `span`: world units across the box's shorter side): kept,
   * and the camera clamped round it in whatever box the view is drawn in (the box takes the view's shape a frame or two
   * after a switch), until the player moves the camera or a follow takes it. Without it a frame drawn in the passing box
   * clamped the place away for good.
   */
  aim: Aim | null;
}

const NEW_CAM = (): ViewCam => ({ cam: null, fitted: true, zoomedIn: false, aim: null });

/** No specimens: one empty list, so the default prop is the same each render. */
const NO_SPECIMENS: readonly Specimen[] = [];

/** The camera key of a game on one map (one world's are PLANE and CURTAIN). */
const ONE_MAP = -1;

/** A map's extent in world units, from its first column (x0: one world's curtain starts below 0): what the camera fits and clamps to. */
const extentOf = (m: WorldMap): Extent & { x0: number } => ({ x0: m.x0, ...worldExtent(m) });

/** The mound's cut drawn on the side view's strip: at most this many levels (the curtain's sky is STRIP rows). */
const CUT_MAX = STRIP;

function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function rgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  return m ? [parseInt(m[1]!, 16), parseInt(m[2]!, 16), parseInt(m[3]!, 16)] : [128, 128, 128];
}

/** A colony's tone by its odour t (0…1): ink at 0, the warn tone at 1, mixed between. */
function odourRgb(ink: [number, number, number], warn: [number, number, number], t: number): [number, number, number] {
  const m = (k: 0 | 1 | 2) => Math.round(ink[k] + (warn[k] - ink[k]) * Math.min(1, Math.max(0, t)));
  return [m(0), m(1), m(2)];
}
function odourColour(ink: [number, number, number], warn: [number, number, number], t: number): string {
  const [r, g, b] = odourRgb(ink, warn, t);
  return `rgb(${r}, ${g}, ${b})`;
}

/** Device pixels per world unit, per DPR, from which cells are drawn as true hexagons; below, as bricks. */
const HEX_ZOOM = 12;
/** A click (or a finger's tap) that moved less than this many CSS px is a click, not a drag. */
const CLICK_SLOP_PX = 8;
/** A click picks the nearest ant within this many CSS px. */
const PICK_PX = 14;
/** A linked click opens the other view at least this close (CSS px a cell, as `n` goes to a nest). */
const LINK_ZOOM = 8;
/** No chunk column: drawHexes' "none yet" (−1 is a real chunk column on one world's curtain). */
const NO_CHUNK = -0x80000000;
/** The builder's sugar (candy pink, as its 🍬) and crumbs (biscuit brown, as its 🍪), drawn apart from the ground's food. */
const SUGAR_RGB: [number, number, number] = [214, 72, 140];
const CRUMB_RGB: [number, number, number] = [150, 100, 52];

interface ChunkCanvas {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  img: ImageData;
}

/** The pointer gesture under way; `moved` is how far it has travelled (device px), (sx, sy) where it started. */
type Gesture = {
  kind: "pan" | "pinch" | "mini" | "paint" | "tweeze" | "none";
  moved: number;
  button: number;
  sx: number;
  sy: number;
  /** the ant the tweezers hold */
  ant?: Followed;
  /**
   * A finger's (or pen's) stroke or lift not begun yet: it starts once the finger has moved past a click's slop, or places on lifting
   * as a tap. A second finger landing first makes it a pinch instead, and nothing was built (a pinch with a brush in hand used to
   * drop the brush where the first finger landed).
   */
  pending?: boolean;
};
const NO_GESTURE: Gesture = { kind: "none", moved: 0, button: 0, sx: 0, sy: 0 };

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
  world = null,
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
  /** each view's camera (ViewCam), by view: one world's PLANE and CURTAIN, or ONE_MAP */
  const cams = useRef(new Map<number, ViewCam>());
  /** the view shown: one world's PLANE or CURTAIN, ONE_MAP on any other game. Read each frame, so switching draws no new field */
  const shown = useRef(world ? view : ONE_MAP);
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
  /** The shown view's camera. */
  const vc = (): ViewCam => {
    let s = cams.current.get(shown.current);
    if (!s) cams.current.set(shown.current, (s = NEW_CAM()));
    return s;
  };
  /** The shown view's map: one world's plane or curtain, or the game's one map (the colony's, between ticks). */
  const shownMap = (): WorldMap => (world ? (shown.current === PLANE ? world.plane : world.curtain) : anyColony.map);
  /** The shown map's extent, read afresh: one world's curtain widens when a colony is founded. */
  const extent = () => extentOf(shownMap());
  // A new game starts zoomed out, in both views.
  useEffect(() => {
    cams.current.clear();
  }, [colonies]);
  useEffect(() => {
    shown.current = world ? view : ONE_MAP;
  }, [world, view]);
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
  /** pointers set aside as palms (builder on): never panned, painted or counted toward a pinch */
  const palms = useRef(new Set<number>());

  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<Gesture>(NO_GESTURE);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const cadaverSprites = new CadaverSprites();
    const fungalSprites = new FungalMapSprites();
    const workerSprites = new WorkerSprites();
    const nestSprites = new NestSprites();
    const resourceSprites = new ResourceSprites();
    const surfaceLeaves = new SurfaceLeaves();
    const mapLeaves = new MapLeafSprites();
    const workerGait = new WorkerGait();
    const motion = matchMedia("(prefers-reduced-motion: reduce)");
    // The shown map, read each frame (bind): which layer (`lv`: one world's PLANE or CURTAIN, −1 on one map), its map, every
    // colony's alarm and the fungus's spores on it, and whether the side view's strip is drawn from the plane.
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
    const chunks = new Map<string, ChunkCanvas>();
    const chunkCanvas = (cx: number, cy: number): ChunkCanvas => {
      const key = `${cx},${cy}`;
      let c = chunks.get(key);
      if (!c) {
        const cv = document.createElement("canvas");
        cv.width = CHUNK;
        cv.height = CHUNK;
        const cctx = cv.getContext("2d")!;
        c = { canvas: cv, ctx: cctx, img: cctx.createImageData(CHUNK, CHUNK) };
        chunks.set(key, c);
      }
      return c;
    };
    // The minimap's picture of the whole map (2 world units a pixel), redrawn twice a second: ground, food, ants.
    const mini = document.createElement("canvas");
    const miniCtx = mini.getContext("2d")!;
    let miniImg = miniCtx.createImageData(1, 1);
    let miniAt = -Infinity;
    /** The shown map is another, or has grown (a founding widens one world's curtain): its size, extent, chunks and minimap afresh. */
    const rebuild = (map: WorldMap) => {
      geoMap = map;
      gx0 = map.x0;
      gw = map.size.w;
      gh = map.size.h;
      ext = extentOf(map);
      chunks.clear();
      mini.width = Math.ceil(ext.w / 2);
      mini.height = Math.ceil(ext.h / 2);
      miniImg = miniCtx.createImageData(mini.width, mini.height);
      miniAt = -Infinity;
    };
    /** Read the shown view: its layer, map, scent and spores (each frame). */
    const bind = () => {
      lv = world ? shown.current : -1;
      m = world ? (lv === PLANE ? world.plane : world.curtain) : anyColony.map;
      if (m !== geoMap || m.x0 !== gx0 || m.size.w !== gw || m.size.h !== gh) rebuild(m);
      spores = lv < 0 ? fungus.spores : (fungus.sporesOn(lv)?.spores ?? fungus.spores);
      strip = world !== null && lv === CURTAIN;
      trails = [];
      alarms = [];
      sensedLayer = sensed.layer(lv < 0 ? 0 : lv);
      smellAll = !!buildRef.current?.smell;
      for (const col of colonies) {
        const p = lv < 0 ? col.ph : col.layers[lv]?.ph;
        if (!p) continue;
        alarms.push(p.fields.alarm);
        trails.push({ food: p.fields.food, home: p.fields.home, odour: col.nestOdour });
      }
    };
    bind();

    let theme = {
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
      miniAt = -Infinity;
    };
    retheme();
    const mq = matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", retheme);
    // The player's own choice (Settings → Appearance) is data-theme on <html>.
    const themeWatch = new MutationObserver(retheme);
    themeWatch.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

    const fitCanvas = () => {
      const d = Math.min(2, window.devicePixelRatio || 1);
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

    /**
     * The side view of one world: what the strip and the mound's cut show at column s, row y, from the plane cell under
     * the line there (P(s)): the strip (row STRIP) is P(s)'s ground (rock, food, or open: the paper, as the side view's
     * walkway), and the rows above it the mound's cut, `spoil` levels high. null: sky, nothing to draw over it. (The
     * minimap's; paintChunk inlines it.)
     */
    const stripAt = (s: number, y: number): readonly number[] | null => {
      if (!world || y > STRIP || !cellAt(world.line, s)) return null;
      const qx = CELL[0];
      const qy = CELL[1];
      const plane = world.plane;
      if (y === STRIP) return rockAt(plane, qx, qy) !== OPEN ? theme.rock : plane.food.get(qx, qy) > 0 ? theme.accentRgb : theme.paperRgb;
      return STRIP - y <= Math.min(CUT_MAX, plane.spoil?.get(qx, qy) ?? 0) ? theme.spoil : null;
    };

    /** Paint chunk colours: rock/soil, trails, and legacy food washes unless aerial sprites will show the food. */
    const paintChunk = (cx: number, cy: number, c: ChunkCanvas, rc: Uint8Array, foodAsSprites: boolean) => {
      const fc = m.food.chunk(cx, cy);
      const lc = m.loose?.chunk(cx, cy);
      // What hosts sensed here and when: no host near lately, no scent shown (PRD §65).
      const sensedC = sensedLayer?.chunk(cx, cy);
      const now = sensed.now;
      // Every colony's food and home trails and alarm here, read only where something was sensed.
      const trailC: { food: Float32Array | undefined; home: Float32Array | undefined; tone: [number, number, number] }[] = [];
      const alarmC: Float32Array[] = [];
      const qc = m.quality?.chunk(cx, cy);
      if (sensedC || smellAll) {
        for (const t of trails) {
          const food = t.food.chunk(cx, cy);
          const home = t.home.chunk(cx, cy);
          if (food || home)
            trailC.push({
              food,
              home,
              tone: smellAll ? odourRgb(theme.inkRgb, theme.warnRgb, t.odour) : (theme.trail as [number, number, number]),
            });
        }
        for (const a of alarms) {
          const ac = a.chunk(cx, cy);
          if (ac) alarmC.push(ac);
        }
      }
      const sporeC = spores.chunk(cx, cy);
      // One world's plane: the mound, a height field of spoil (oneWorld.ts), washed in by its height.
      const spoilC = m.spoil?.chunk(cx, cy);
      const chambers = m.chambers;
      const chamberC = chambers?.cell.chunk(cx, cy); // nest slice 2: dug chambers, a faint wash; slice 3: tinted by role
      const [fr, fg, fb] = theme.accentRgb;
      const show = layers.current;
      const px = c.img.data;
      const x0 = cx * CHUNK;
      const y0 = cy * CHUNK;
      for (let ly = 0; ly < CHUNK; ly++) {
        for (let lx = 0; lx < CHUNK; lx++) {
          const i = ly * CHUNK + lx;
          const o = i * 4;
          if (x0 + lx < gx0 || x0 + lx >= gx0 + gw || y0 + ly >= gh) {
            px[o + 3] = 0; // past the edge of the map
            continue;
          }
          if (rc[i]) {
            const solid = rc[i] === SOIL ? (lc && lc[i] ? theme.spoil : theme.soil) : rc[i] === AIR ? theme.sky : theme.rock;
            px[o] = solid[0];
            px[o + 1] = solid[1];
            px[o + 2] = solid[2];
            px[o + 3] = 255;
            continue;
          }
          const fv = fc ? fc[i] : 0;
          if (fv > 0 && !foodAsSprites) {
            // The builder's sugar and crumbs (quality above and below the ground's 1) in their own colours (ja-kjj8).
            const q = qc ? qc[i]! : 1;
            const [qr, qg, qb] = q > 1.01 ? SUGAR_RGB : q < 0.99 ? CRUMB_RGB : [fr, fg, fb];
            px[o] = qr;
            px[o + 1] = qg;
            px[o + 2] = qb;
            px[o + 3] = 120 + Math.min(135, fv * 12);
            continue;
          }
          // How freshly a host sensed this cell: its scent shows that strongly (trails and alarm alike); everywhere in smell vision.
          const w = smellAll ? 1 : sensedC ? sightOf(sensedC[i]!, now) : 0;
          let al = 0;
          if (w > 0) for (const ac of alarmC) al = Math.max(al, w * Math.min(1, ac[i]! / ALARM_FULL));
          if (al > ALARM_SHOWN) {
            px[o] = theme.alarm[0];
            px[o + 1] = theme.alarm[1];
            px[o + 2] = theme.alarm[2];
            px[o + 3] = Math.round(40 + al * 150);
            continue;
          }
          // Spores: the fungus's own mark on the ground, under food and alarm, over the trails.
          const sv = sporeC ? sporeC[i] : 0;
          if (sv >= SPORE_SHOWN) {
            const sp = Math.min(1, sv / SPORE_FULL);
            px[o] = theme.sporeRgb[0];
            px[o + 1] = theme.sporeRgb[1];
            px[o + 2] = theme.sporeRgb[2];
            px[o + 3] = Math.round(35 + sp * 130);
            continue;
          }
          const heap = spoilC ? spoilC[i] : 0;
          if (heap > 0) {
            px[o] = theme.spoil[0];
            px[o + 1] = theme.spoil[1];
            px[o + 2] = theme.spoil[2];
            px[o + 3] = Math.min(255, 110 + heap * 45);
            continue;
          }
          // Every colony's trails, as freshly as a host sensed them; where two overlap, the stronger shows.
          let f = 0;
          let h = 0;
          let ft = theme.trail as [number, number, number];
          if (w > 0)
            for (const t of trailC) {
              const tf = show.food || smellAll ? (t.food ? w * Math.min(1, t.food[i]! / FOOD_FULL) : 0) : 0;
              if (tf > f) {
                f = tf;
                ft = t.tone;
              }
              // The home trail covers most walked ground: scaled softer, so it reads as a wash under the food trail.
              if (show.home && t.home) h = Math.max(h, w * Math.min(1, t.home[i]! / HOME_FULL));
            }
          if (f >= h && f > TRAIL_SHOWN) {
            px[o] = ft[0];
            px[o + 1] = ft[1];
            px[o + 2] = ft[2];
            px[o + 3] = Math.round(f * 150);
          } else if (h > TRAIL_SHOWN) {
            px[o] = HOME_RGB[0];
            px[o + 1] = HOME_RGB[1];
            px[o + 2] = HOME_RGB[2];
            px[o + 3] = Math.round(h * 90);
          } else if (chamberC && chamberC[i]) {
            const role = chambers!.list[chamberC[i] - 1]?.role ?? "none";
            const tint = ROLE_RGB[role] ?? theme.chamber;
            px[o] = tint[0];
            px[o + 1] = tint[1];
            px[o + 2] = tint[2];
            px[o + 3] = role === "none" ? 55 : 70;
          } else px[o + 3] = 0;
        }
      }
      // One world's side view: the strip and the mound's cut over it, drawn from the plane under the line (the curtain
      // stores neither: one-world §8 item 6). A chunk's width of columns, each the strip and its cut's height.
      if (strip && world && cy === STRIP >> 6) {
        const line = world.line;
        const plane = world.plane;
        const ly = STRIP - y0;
        for (let lx = 0; lx < CHUNK; lx++) {
          if (!cellAt(line, x0 + lx)) continue;
          const qx = CELL[0];
          const qy = CELL[1];
          let o = (ly * CHUNK + lx) * 4;
          const food = plane.food.get(qx, qy);
          if (rockAt(plane, qx, qy) !== OPEN) {
            px[o] = theme.rock[0];
            px[o + 1] = theme.rock[1];
            px[o + 2] = theme.rock[2];
            px[o + 3] = 255;
          } else if (food > 0) {
            px[o] = fr;
            px[o + 1] = fg;
            px[o + 2] = fb;
            px[o + 3] = 120 + Math.min(135, food * 12);
          } else px[o + 3] = 0; // open ground: the paper, as the side view's walkway
          const cut = Math.min(CUT_MAX, plane.spoil?.get(qx, qy) ?? 0);
          for (let k = 1; k <= cut; k++) {
            o = ((ly - k) * CHUNK + lx) * 4;
            px[o] = theme.spoil[0];
            px[o + 1] = theme.spoil[1];
            px[o + 2] = theme.spoil[2];
            px[o + 3] = 255;
          }
        }
      }
      c.ctx.putImageData(c.img, 0, 0);
    };

    /**
     * The minimap's picture: each pixel the cell under its centre (food, rock, soil or open ground), washed with the
     * fungus's colour where it has spores the field would draw; ants as dots, infected ones in the fungus's colour (ja-hcq).
     */
    const paintMini = () => {
      const px = miniImg.data;
      const food = theme.accentRgb;
      const spore = theme.sporeRgb;
      // Infected ants: the spore colour halfway to ink, so a host stands out on the spore wash as on bare ground, in
      // either theme (ink is light in dark mode) (ja-25sb).
      const host = [0, 1, 2].map((j) => Math.round((spore[j]! + theme.inkRgb[j]!) / 2)) as [number, number, number];
      for (let my = 0; my < mini.height; my++)
        for (let mx = 0; mx < mini.width; mx++) {
          cellOf(gx0 + mx * 2 + 1, my * 2 + 1);
          const x = CELL[0];
          const y = CELL[1];
          const off = x < gx0 || y < 0 || x >= gx0 + gw || y >= gh;
          const t = off ? 1 : m.rock.get(x, y);
          const fv = off ? 0 : m.food.get(x, y);
          const o = (my * mini.width + mx) * 4;
          const cut = strip && !off ? stripAt(x, y) : null;
          const heap = !off && t === 0 && m.spoil ? m.spoil.get(x, y) : 0;
          const c =
            cut ??
            (fv > 0
              ? food
              : t === SOIL
                ? !off && m.loose?.get(x, y)
                  ? theme.spoil
                  : theme.soil
                : t === AIR
                  ? theme.sky
                  : t
                    ? theme.rock
                    : heap > 0
                      ? theme.spoil
                      : theme.paperRgb);
          // Spores over the ground, as strongly as the field draws them (a pixel is too small for its fading in alpha).
          const sv = off || cut ? 0 : spores.get(x, y);
          const a = sv >= SPORE_SHOWN ? 0.35 + 0.5 * Math.min(1, sv / SPORE_FULL) : 0;
          px[o] = Math.round(c[0] + (spore[0] - c[0]) * a);
          px[o + 1] = Math.round(c[1] + (spore[1] - c[1]) * a);
          px[o + 2] = Math.round(c[2] + (spore[2] - c[2]) * a);
          px[o + 3] = 255;
        }
      // Every colony's ants, then the infected over them, so a healthy nestmate on the same pixel doesn't hide one.
      for (const sick of [false, true])
        for (let k = colonies.length - 1; k >= 0; k--) {
          const col = colonies[k] as Colony;
          // By the colony's odour, as the field colours its ants and nests: no colony by its index (PRD §65).
          const tone = sick ? host : odourRgb(theme.inkRgb, theme.warnRgb, col.nestOdour);
          for (let i = 0; i < col.n; i++) {
            if (!col.alive[i] || (lv >= 0 && col.layer[i] !== lv) || col.load[i] >= INFECTED !== sick) continue;
            const mx = Math.floor((col.x[i] - gx0) / 2);
            const my = Math.floor(col.y[i] / 2);
            if (mx < 0 || my < 0 || mx >= mini.width || my >= mini.height) continue;
            const o = (my * mini.width + mx) * 4;
            px[o] = tone[0];
            px[o + 1] = tone[1];
            px[o + 2] = tone[2];
          }
        }
      miniCtx.putImageData(miniImg, 0, 0);
    };

    /**
     * Up close: the cells in view as true hexagons. Each cell's colour is its pixel in its chunk's colour
     * buffer (painted this frame), laid over the paper; soil (the commonest, underground) is the
     * background, and the rest are batched into one path per colour, so a frame is a few dozen fills.
     */
    const paths = new Map<number, Path2D>();
    const drawHexes = (c: Camera, v: Viewport, rx0: number, rx1: number, ry0: number, ry1: number) => {
      // The background: soil underground (most cells), the paper on the open surface (no soil at all).
      const bg = m.hasSoil ? theme.soil : theme.paperRgb;
      const bgKey = (bg[0] << 16) | (bg[1] << 8) | bg[2];
      ctx.fillStyle = `rgb(${bg[0]},${bg[1]},${bg[2]})`;
      const [ax, ay] = toScreen(c, v, gx0, 0);
      const [bx, by] = toScreen(c, v, gx0 + ext.w, ext.h);
      ctx.fillRect(ax, ay, bx - ax, by - ay);
      paths.clear();
      const k = SIDE * c.zoom * 1.04; // a hair over, so neighbours meet without seams
      const [c0, c1, c2, c3, c4, c5] = [0, 1, 2, 3, 4, 5].map((j) => Math.cos(Math.PI / 6 + (j * Math.PI) / 3) * k) as [
        number,
        number,
        number,
        number,
        number,
        number,
      ];
      const [s0, s1, s2, s3, s4, s5] = [0, 1, 2, 3, 4, 5].map((j) => Math.sin(Math.PI / 6 + (j * Math.PI) / 3) * k) as [
        number,
        number,
        number,
        number,
        number,
        number,
      ];
      const pr = theme.paperRgb;
      const ox = v.w / 2 - c.x * c.zoom;
      const oy = v.h / 2 - c.y * c.zoom;
      for (let y = ry0; y <= ry1; y++) {
        const cy = y >> 6;
        const ly = y & 63;
        const sy = (y + 0.5) * R * c.zoom + oy;
        const shift = 0.5 + 0.5 * (y & 1);
        let chunkX = NO_CHUNK; // a chunk column can be −1 (one world's curtain): none is a value no chunk takes
        let data: Uint8ClampedArray | null = null;
        for (let x = rx0; x <= rx1; x++) {
          if (x >> 6 !== chunkX) {
            chunkX = x >> 6;
            data = chunks.get(`${chunkX},${cy}`)?.img.data ?? null;
          }
          if (!data) continue;
          const o = ((ly << 6) | (x & 63)) * 4;
          // The cell over the paper, its alpha in 16 steps (so trails batch into few colours).
          const a = Math.round((data[o + 3] / 255) * 15) / 15;
          const r = Math.round(data[o] * a + pr[0] * (1 - a));
          const g = Math.round(data[o + 1] * a + pr[1] * (1 - a));
          const b = Math.round(data[o + 2] * a + pr[2] * (1 - a));
          const key = (r << 16) | (g << 8) | b;
          if (key === bgKey) continue;
          let path = paths.get(key);
          if (!path) {
            path = new Path2D();
            paths.set(key, path);
          }
          const sx = (x + shift) * c.zoom + ox;
          path.moveTo(sx + c0, sy + s0);
          path.lineTo(sx + c1, sy + s1);
          path.lineTo(sx + c2, sy + s2);
          path.lineTo(sx + c3, sy + s3);
          path.lineTo(sx + c4, sy + s4);
          path.lineTo(sx + c5, sy + s5);
          path.closePath();
        }
      }
      for (const [key, path] of paths) {
        ctx.fillStyle = `rgb(${key >> 16},${(key >> 8) & 255},${key & 255})`;
        ctx.fill(path);
      }
    };

    /**
     * The mycelium's hyphae (ja-2bw.3, docs/hyphal-growth.md): each cell joined to the one it grew from by a line through
     * the hexagons' centres, the loops fusion closed, and a dot at each tip. On the plane (`under`) faint, as threads just
     * under the surface; in the curtain plainer. Only the cells in view (rows ry0…ry1, columns rx0…rx1, a cell's margin).
     */
    const drawHyphae = (
      h: Hyphae,
      c: Camera,
      v: Viewport,
      d: number,
      under: boolean,
      rx0: number,
      rx1: number,
      ry0: number,
      ry1: number,
    ) => {
      const inView = (x: number, y: number) => x >= rx0 - 1 && x <= rx1 + 1 && y >= ry0 - 1 && y <= ry1 + 1;
      const path = new Path2D(),
        cords = new Path2D(),
        hairs = new Path2D();
      const segment = (a: number, b: number, into: Path2D = path) => {
        const [ax, ay] = hyphaCell(a),
          [bx, by] = hyphaCell(b);
        if (!inView(ax, ay) && !inView(bx, by)) return;
        const shape = hyphaShape([centreX(ax, ay), centreY(ay)], [centreX(bx, by), centreY(by)]);
        shape.points.forEach(([x, y], i) => {
          const p = toScreen(c, v, x, y);
          if (i === 0) into.moveTo(...p);
          else into.lineTo(...p);
        });
        if (c.zoom / d >= 12)
          for (const [a, b] of shape.hairs) {
            hairs.moveTo(...toScreen(c, v, ...a));
            hairs.lineTo(...toScreen(c, v, ...b));
          }
      };
      for (const [k, p] of h.parent) if (p !== HYPHA_ROOT) segment(p, k, h.cords.has(k) ? cords : path);
      for (let i = 0; i + 1 < h.fusions.length; i += 2) segment(h.fusions[i], h.fusions[i + 1]);
      ctx.save();
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      const fine = Math.max(1.3 * d, Math.min(4 * d, c.zoom * 0.17)),
        thick = Math.max(2.8 * d, Math.min(9 * d, c.zoom * 0.35));
      ctx.globalAlpha = 0.72;
      ctx.strokeStyle = HYPHA_COLOURS.edge;
      ctx.lineWidth = fine + 1.2 * d;
      ctx.stroke(path);
      ctx.lineWidth = thick + 1.3 * d;
      ctx.stroke(cords);
      ctx.globalAlpha = under ? 0.92 : 1;
      ctx.strokeStyle = HYPHA_COLOURS.body;
      ctx.lineWidth = fine;
      ctx.stroke(path);
      ctx.lineWidth = thick;
      ctx.stroke(cords);
      ctx.strokeStyle = HYPHA_COLOURS.core;
      ctx.lineWidth = Math.max(0.8 * d, c.zoom * 0.045);
      ctx.stroke(hairs);
      ctx.fillStyle = HYPHA_COLOURS.body;
      ctx.globalAlpha = 1;
      const r = Math.max(1.5 * d, Math.min(4 * d, c.zoom * 0.18));
      for (const t of h.tips) {
        if (!inView(t.x, t.y)) continue;
        const [x, y] = toScreen(c, v, centreX(t.x, t.y), centreY(t.y)),
          dx = centreX(neighbourX(t.x, t.y, t.heading), neighbourY(t.y, t.heading)) - centreX(t.x, t.y),
          dy = centreY(neighbourY(t.y, t.heading)) - centreY(t.y);
        fungalSprites.draw(ctx, { tips: [[dx, dy]] }, 0, x, y, c.zoom);
      }
      // Mass in transit (ja-tgw9, flow on): a soft glow on each cell it fills, brighter and wider the more there is, so the
      // player sees where the mycelium is feeding and a front cut off from it going dim.
      for (const [k, load] of h.loads) {
        if (load < HYPHA_MASS * 0.1) continue;
        const [lx, ly] = hyphaCell(k);
        if (!inView(lx, ly)) continue;
        const [x, y] = toScreen(c, v, centreX(lx, ly), centreY(ly));
        const full = Math.min(1, load / (HYPHA_MASS * 2));
        ctx.globalAlpha = (under ? 0.3 : 0.5) * full;
        ctx.beginPath();
        ctx.arc(x, y, r * (1 + full), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      const fruits = new Set(h.fruits);
      for (const k of new Set([...h.knots.keys(), ...fruits])) {
        const [kx, ky] = hyphaCell(k);
        if (!inView(kx, ky)) continue;
        const [x, y] = toScreen(c, v, centreX(kx, ky), centreY(ky));
        fungalSprites.draw(
          ctx,
          { knot: h.knots.has(k), knotSprouted: h.knots.get(k)?.sprouted ?? false, fruit: fruits.has(k) },
          k,
          x,
          y,
          c.zoom,
        );
      }
      ctx.restore();
    };

    /** Parts of text side by side in one rounded box, centred on (x, y): a nest's badge, the followed ant's tag (PRD §69.2). */
    const pill = (parts: { text: string; fill: string }[], x: number, y: number, px: number) => {
      ctx.font = `600 ${px}px ui-sans-serif, system-ui, sans-serif`;
      const gap = px * 0.45;
      const widths = parts.map((p) => ctx.measureText(p.text).width);
      const w = widths.reduce((a, b) => a + b, 0) + gap * (parts.length - 1) + px;
      const h = px * 1.6;
      ctx.globalAlpha = 0.92;
      ctx.fillStyle = theme.paper;
      ctx.strokeStyle = theme.line;
      ctx.lineWidth = Math.max(1, px / 12);
      ctx.beginPath();
      ctx.roundRect(x - w / 2, y - h / 2, w, h, h / 2);
      ctx.fill();
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.textBaseline = "middle";
      ctx.textAlign = "start";
      let at = x - w / 2 + px / 2;
      parts.forEach((p, n) => {
        ctx.fillStyle = p.fill;
        ctx.fillText(p.text, at, y);
        at += widths[n]! + gap;
      });
      ctx.textBaseline = "alphabetic";
    };
    /** Text with a paper halo, centred at screen (x, y). */
    const label = (text: string, x: number, y: number, px: number, alpha = 1, fill = theme.ink) => {
      ctx.font = `600 ${px}px ui-sans-serif, system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.lineJoin = "round";
      ctx.lineWidth = Math.max(2, px / 4);
      ctx.strokeStyle = theme.paper;
      ctx.globalAlpha = 0.85 * alpha;
      ctx.strokeText(text, x, y);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = fill;
      ctx.fillText(text, x, y);
      ctx.globalAlpha = 1;
      ctx.textAlign = "start";
      ctx.textBaseline = "alphabetic";
    };

    /**
     * Columns lo … hi of the line as one dashed stretch through the centres of the plane cells they lie under (P(s)), so it
     * turns where its tiles turn (ja-lp4.17).
     */
    const traceColumns = (line: Transect, lo: number, hi: number, c: Camera, v: Viewport) => {
      for (let s = lo; s <= hi; s++) {
        cellAt(line, s);
        const [x, y] = toScreen(c, v, centreX(CELL[0], CELL[1]), centreY(CELL[1]));
        if (s === lo) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
    };

    /** One world's top view: the line, dashed over its tiles through the holes in order, fainter along its margins; a marker at each hole. */
    const drawLine = (w: OneWorld, c: Camera, v: Viewport, d: number) => {
      const line = w.line;
      const k = line.holes.length - 1;
      ctx.strokeStyle = theme.ink;
      ctx.lineWidth = Math.max(1, d * 1.2);
      ctx.setLineDash([6 * d, 5 * d]);
      // The margins: from each end hole to the line's end, P(sMin) and P(sMax).
      ctx.globalAlpha = 0.25;
      ctx.beginPath();
      traceColumns(line, line.sMin, line.sHole[0]!, c, v);
      traceColumns(line, line.sHole[k]!, line.sMax, c, v);
      ctx.stroke();
      ctx.globalAlpha = 0.6;
      ctx.beginPath();
      traceColumns(line, line.sHole[0]!, line.sHole[k]!, c, v);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = theme.ink;
      for (const h of line.holes) {
        const [x, y] = toScreen(c, v, centreX(h.x, h.y), centreY(h.y));
        ctx.beginPath();
        ctx.arc(x, y, Math.max(2.5 * d, 0.6 * c.zoom), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    };

    /** One world's top view: each hole named by the colony whose hole it is (holeCells), "empty hole" if none. */
    const drawHoleNames = (w: OneWorld, c: Camera, v: Viewport, d: number, inView: (x: number, y: number) => boolean) => {
      const holes = anyColony.holeCells;
      const px = Math.round(Math.max(10, Math.min(14, c.zoom * 0.9)) * d);
      for (const h of w.line.holes) {
        const wx = centreX(h.x, h.y);
        const wy = centreY(h.y);
        if (!inView(wx, wy)) continue;
        let k = -1;
        for (let n = 0; n < holes.length && k < 0; n++) if (holes[n]!.px === h.x && holes[n]!.py === h.y) k = n;
        const [x, y] = toScreen(c, v, wx, wy);
        const above = y - Math.max(12 * d, 4.5 * c.zoom);
        const col = k >= 0 ? colonies[k] : undefined;
        if (!col) {
          label("empty hole", x, above, px);
          continue;
        }
        const tone = { ink: theme.ink, spore: theme.spore, warn: theme.warn, dim: theme.fg3 };
        pill(
          badgeParts(nestBadge(col, k, fungus)).map((p) => ({ text: p.text, fill: tone[p.tone] })),
          x,
          above - px * 0.2,
          px,
        );
      }
    };

    /** One world's side view: a faint rule down the curtain at each bend (an interior hole's s), labelled with its turn. */
    const drawBends = (w: OneWorld, c: Camera, v: Viewport, d: number) => {
      const line = w.line;
      const px = Math.round(12 * d);
      for (let j = 1; j < line.holes.length - 1; j++) {
        const s = line.sHole[j]!;
        const [x, top] = toScreen(c, v, centreX(s, STRIP), 0);
        const [, bottom] = toScreen(c, v, 0, ext.h);
        if (x < -px * 4 || x > v.w + px * 4) continue;
        ctx.strokeStyle = theme.ink;
        ctx.globalAlpha = 0.18;
        ctx.lineWidth = Math.max(1, d);
        ctx.beginPath();
        ctx.moveTo(x, Math.max(0, top));
        ctx.lineTo(x, Math.min(v.h, bottom));
        ctx.stroke();
        ctx.globalAlpha = 1;
        const turn = turnAt(line, j);
        label(`${turn >= 0 ? "↱" : "↰"} ${Math.round(Math.abs(turn))}°`, x, Math.max(px, top + px), px, 0.8);
      }
    };

    /**
     * One world's side view: the ants on the plane standing on a cell under the line, drawn on the strip at its column(s)
     * (columnsOver: two at a bend), level, in their colony's colour, a crumb on a carrier. Ants elsewhere on the plane
     * aren't in this view (one-world §5).
     */
    const drawStripAnts = (w: OneWorld, c: Camera, v: Viewport, len: number, crumb: number, inView: (x: number, y: number) => boolean) => {
      const half = len / 2;
      const wy = centreY(STRIP);
      ctx.lineCap = "round";
      ctx.lineWidth = Math.max(1, len * 0.3);
      for (const col of colonies) {
        ctx.beginPath();
        let carriers = 0;
        for (let i = 0; i < col.n; i++) {
          if (!col.alive[i] || col.layer[i] !== PLANE) continue;
          cellOf(col.x[i], col.y[i]);
          const over = columnsOver(w.line, CELL[0], CELL[1]);
          for (let j = 0; j < over.length; j++) {
            const wx = centreX(over[j], STRIP);
            if (!inView(wx, wy)) continue;
            const [x, y] = toScreen(c, v, wx, wy);
            ctx.moveTo(x - half, y);
            ctx.lineTo(x + half, y);
            if (col.carrying[i]) carriers++;
          }
        }
        ctx.strokeStyle = odourColour(theme.inkRgb, theme.warnRgb, col.nestOdour);
        ctx.globalAlpha = 0.85;
        ctx.stroke();
        ctx.globalAlpha = 1;
        if (carriers === 0) continue;
        ctx.fillStyle = theme.accent;
        for (let i = 0; i < col.n; i++) {
          if (!col.alive[i] || col.layer[i] !== PLANE || !col.carrying[i]) continue;
          cellOf(col.x[i], col.y[i]);
          const over = columnsOver(w.line, CELL[0], CELL[1]);
          for (let j = 0; j < over.length; j++) {
            const wx = centreX(over[j], STRIP);
            if (!inView(wx, wy)) continue;
            const [x, y] = toScreen(c, v, wx, wy);
            ctx.fillRect(x + half - crumb / 2, y - crumb / 2, crumb, crumb);
          }
        }
      }
    };

    /** The last preview under the pointer: the pen asked once per cell (and side of the circle's edge), not every frame. */
    let penSeen: { pen: FieldPen; key: string; at: Settle } | null = null;
    /**
     * One world's queen's pen, on the top view: her flight's circle round her mother's hole and, under the pointer,
     * the cell she would settle on (the new segment of the line dashed to it from the end it grows) or why she can't.
     */
    const drawPen = (w: OneWorld, pn: FieldPen, c: Camera, v: Viewport, d: number) => {
      const [cx, cy] = toScreen(c, v, pn.x, pn.y);
      ctx.beginPath();
      ctx.arc(cx, cy, pn.r * c.zoom, 0, Math.PI * 2);
      ctx.fillStyle = theme.accent;
      ctx.globalAlpha = 0.06;
      ctx.fill();
      ctx.globalAlpha = 0.9;
      ctx.strokeStyle = theme.accent;
      ctx.lineWidth = 2 * d;
      ctx.setLineDash([8 * d, 6 * d]);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
      const hp = hover.current;
      if (!hp) return;
      const [wx, wy] = toWorld(c, v, hp[0], hp[1]);
      cellOf(wx, wy);
      const key = `${CELL[0]},${CELL[1]},${Math.hypot(wx - pn.x, wy - pn.y) <= pn.r}`;
      if (!penSeen || penSeen.pen !== pn || penSeen.key !== key) penSeen = { pen: pn, key, at: pn.preview({ x: wx, y: wy }) };
      const at = penSeen.at;
      const px = Math.round(12 * d);
      if (!at.ok) {
        // Kept inside the field: the reason is read near the pointer, whichever edge it is at.
        ctx.font = `600 ${px}px ui-sans-serif, system-ui, sans-serif`;
        const half = ctx.measureText(at.reason).width / 2 + 6 * d;
        const lx = half * 2 >= v.w ? v.w / 2 : Math.max(half, Math.min(v.w - half, hp[0]));
        label(at.reason, lx, Math.max(px, hp[1] - 18 * d), px, 1, theme.warn);
        return;
      }
      const tx = centreX(at.cell.x, at.cell.y);
      const ty = centreY(at.cell.y);
      const [sx, sy] = toScreen(c, v, tx, ty);
      const holes = w.line.holes;
      const e = at.end === "start" ? holes[0]! : holes[holes.length - 1]!;
      ctx.strokeStyle = theme.accent;
      ctx.lineWidth = Math.max(1.5, d * 1.5);
      ctx.setLineDash([6 * d, 5 * d]);
      // The new segment over the tiles it would lie on (segmentCells: what the founding lays).
      const seg = segmentCells(e, at.cell);
      ctx.beginPath();
      for (let i = 0; i < seg.length; i += 2) {
        const [x, y] = toScreen(c, v, centreX(seg[i]!, seg[i + 1]!), centreY(seg[i + 1]!));
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.setLineDash([]);
      // From where she lands to where she settles, when she walks on.
      if (Math.hypot(sx - hp[0], sy - hp[1]) > 4 * d) {
        ctx.globalAlpha = 0.5;
        ctx.lineWidth = d;
        ctx.beginPath();
        ctx.moveTo(hp[0], hp[1]);
        ctx.lineTo(sx, sy);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
      const rr = Math.max(6 * d, c.zoom * 1.2);
      ctx.beginPath();
      ctx.arc(sx, sy, rr, 0, Math.PI * 2);
      ctx.lineWidth = 2 * d;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(sx, sy, Math.max(2.5 * d, 0.6 * c.zoom), 0, Math.PI * 2);
      ctx.fillStyle = theme.accent;
      ctx.fill();
      label("her hole", sx, sy - rr - px, px);
    };

    const draw = () => {
      bind();
      const v: Viewport = { w: canvas.width, h: canvas.height };
      const d = Math.min(2, window.devicePixelRatio || 1);
      const s = vc();
      // Follow an ant: the camera centres on it; an ant that is gone (dead, or its slot reborn) ends the follow. In one
      // world, an ant on the other layer than the view's holds the camera where it was (carrying it across: U5.2).
      const f = follow.current;
      const fcol = f ? followedColony(colonies, f) : null;
      const fHere = f !== null && fcol !== null && (lv < 0 || fcol.layer[f.i] === lv);
      if (f && !fcol) {
        follow.current = null;
        followCb.current(null);
      } else if (f && fcol && fHere && s.cam) {
        s.cam = { ...s.cam, x: fcol.x[f.i], y: fcol.y[f.i] };
        s.aim = null;
      }
      // One world: the followed ant went through a hole, out of the view (its layer changed, not the view): the page is
      // told, and carries the camera across (U5.2).
      if (f && fcol && lv >= 0) {
        const layer = fcol.layer[f.i];
        const was = antLayer.current;
        if (carryTo.current === lv || !was || was.f !== f) carryTo.current = null;
        if (was && was.f === f && was.layer !== layer && layer !== (carryTo.current ?? lv)) {
          carryTo.current = layer;
          crossCb.current?.(layer, fcol.x[f.i], fcol.y[f.i]);
        }
        antLayer.current = { f, layer };
      } else {
        antLayer.current = null;
        carryTo.current = null;
      }
      const c = s.fitted || !s.cam ? clamp(fit(ext, v), ext, v) : aimed(s.cam, s.aim, ext, v);
      s.cam = c;
      s.zoomedIn = c.zoom > fitZoom(ext, v) * 1.05;
      ctx.fillStyle = theme.paper;
      ctx.fillRect(0, 0, v.w, v.h);
      ctx.imageSmoothingEnabled = false;

      // The rows of hexagons in view, and the chunks they fall in. Every chunk in view is painted
      // into its 64×64 colour buffer (one pixel a cell); then drawn as bricks or as hexagons.
      const vis = visible(c, v);
      const ry0 = Math.max(0, Math.floor(vis.y0 / R) - 1);
      const ry1 = Math.min(gh - 1, Math.ceil(vis.y1 / R) + 1);
      const rx0 = Math.max(gx0, Math.floor(vis.x0) - 1);
      const rx1 = Math.min(gx0 + gw - 1, Math.ceil(vis.x1) + 1);
      const hexes = c.zoom >= HEX_ZOOM * d;
      const resourceLod = workerLod(c.zoom, d);
      const darkSprites = theme.paperRgb[0] * 0.2126 + theme.paperRgb[1] * 0.7152 + theme.paperRgb[2] * 0.0722 < 100;
      // Read-only browser diagnostics: actual CSS scale and the available worker representation.
      const cssHex = (c.zoom / d).toFixed(2),
        workerStyle = hexes && workerSprites.ready(resourceLod) ? "voxel" : "ink";
      if (canvas.dataset.hexCssPx !== cssHex) canvas.dataset.hexCssPx = cssHex;
      if (canvas.dataset.workerStyle !== workerStyle) canvas.dataset.workerStyle = workerStyle;
      // Both maps face the ants' walking plane: aerial above, straight onto the back wall below.
      const resourceImage = hexes ? resourceSprites.get(resourceLod) : null;
      for (let cy = ry0 >> 6; cy <= ry1 >> 6; cy++)
        for (let cx = rx0 >> 6; cx <= rx1 >> 6; cx++) {
          const rc = m.rock.chunk(cx, cy);
          if (!rc) continue;
          const cc = chunkCanvas(cx, cy);
          paintChunk(cx, cy, cc, rc, !!resourceImage);
          if (hexes) continue;
          // Zoomed out: bricks. Each row of the chunk is a strip one cell high (R), odd rows shifted
          // half a cell right: the same six neighbours as hexagons, and a few draws per chunk.
          const ly0 = Math.max(0, ry0 - cy * CHUNK);
          const ly1 = Math.min(CHUNK - 1, ry1 - cy * CHUNK);
          for (let ly = ly0; ly <= ly1; ly++) {
            const y = cy * CHUNK + ly;
            const [ax, ay] = toScreen(c, v, cx * CHUNK + 0.5 * (y & 1), y * R);
            const [bx, by] = toScreen(c, v, (cx + 1) * CHUNK + 0.5 * (y & 1), (y + 1) * R);
            const dx = Math.round(ax);
            const dy = Math.round(ay);
            ctx.drawImage(cc.canvas, 0, ly, CHUNK, 1, dx, dy, Math.round(bx) - dx, Math.round(by) - dy);
          }
        }
      if (hexes) drawHexes(c, v, rx0, rx1, ry0, ry1);
      if (hexes)
        drawMapTerrainGrain(
          ctx,
          c.zoom,
          v.w / 2 - c.x * c.zoom,
          v.h / 2 - c.y * c.zoom,
          [rx0, rx1, ry0, ry1],
          (x, y) => rockAt(m, x, y),
          (x, y) => {
            const data = chunks.get(`${x >> 6},${y >> 6}`)?.img.data;
            return !!data && data[(((y & 63) << 6) | (x & 63)) * 4 + 3] === 0;
          },
          theme.ink,
          theme.paper,
        );
      const nestImage = hexes ? nestSprites.get(resourceLod) : null;
      const nestStyle = nestImage ? "voxel" : "symbols";
      if (canvas.dataset.nestStyle !== nestStyle) canvas.dataset.nestStyle = nestStyle;
      // Surface plain-food cells join into tissue; carried food and other qualities stay separate morsels.
      if (resourceImage) {
        for (let y = ry0; y <= ry1; y++)
          for (let x = rx0; x <= rx1; x++) {
            const amount = m.food.get(x, y);
            if (!(amount > 0) || rockAt(m, x, y) !== OPEN) continue;
            const density = foodDensity(amount),
              kind = foodKind(m.quality?.get(x, y) ?? 1);
            if ((lv === PLANE || (lv < 0 && !m.hasSoil && !m.sky)) && kind === "plain") {
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
      if (hp && hp.heatDay > 0 && (lv === PLANE || (lv < 0 && !m.sky))) {
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
      const hy = fungus.hyphaeOn(lv < 0 ? 0 : lv);
      if (hy) drawHyphae(hy, c, v, d, lv === PLANE || (lv < 0 && !m.sky), rx0, rx1, ry0, ry1);
      const corpseCells = new Set(colonies.flatMap((col) => visibleCadavers(col, lv).map((k) => cellKey(k.x, k.y))));
      const stalks = new Set(fungus.stalksOn(lv < 0 ? 0 : lv)),
        stalkLevel = fungus.evolution?.level("stalks") ?? 0;
      for (const [k, left] of fungus.corpsesOn(lv < 0 ? 0 : lv)) {
        const [sx, sy] = hyphaCell(k);
        if (sx < rx0 - 1 || sx > rx1 + 1 || sy < ry0 - 1 || sy > ry1 + 1) continue;
        const [x, y] = toScreen(c, v, centreX(sx, sy), centreY(sy));
        fungalSprites.draw(
          ctx,
          { colonised: true, sporulating: left > 0, stalkLevel: stalks.has(k) ? stalkLevel : 0 },
          k,
          x,
          y,
          c.zoom,
          "ground",
        );
        if (stalks.has(k) && !corpseCells.has(k)) cadaverSprites.draw(ctx, workerLod(c.zoom, d), 1, x, y, c.zoom);
      }

      // Nests and ants in view, coloured by odour (recognition.ts): the first colony (Ink) starts in ink, the second (Amber) in the
      // warn tone, and as the fungus brings them to one odour they meet in between. A jade crumb at the head of a carrier,
      // an earth one at the head of an ant carrying soil. Round each nest, the mound of the soil it dug.
      const len = Math.max(3, Math.min(22, c.zoom * 0.9));
      const half = len / 2;
      const crumb = Math.max(1.5, len * 0.35);
      const inView = (wx: number, wy: number) => wx >= vis.x0 - 2 && wx <= vis.x1 + 2 && wy >= vis.y0 - 2 && wy <= vis.y1 + 2;
      if (world && lv === PLANE) drawLine(world, c, v, d);
      if (world && lv === CURTAIN) drawBends(world, c, v, d);
      for (const col of [...colonies].reverse()) {
        // The nest on the shown layer (one world: a disc round its hole on the plane; the shaft and chamber in the curtain).
        const nest = lv < 0 ? col.nest : (col.layers[lv] ?? col.layers[0]!).nest;
        // The nest's life underground (brood, stores, the queen, alates) shows where the nest is: the curtain in one world.
        const home = lv < 0 || lv === col.home;
        const [nx, ny] = toScreen(c, v, nest.x, nest.y);
        // The side view's and the open map's top-down mound ring; one world's mound is its plane's spoil, painted as ground.
        if (col.soilOut > 0 && !nest.entrance && !m.spoil) {
          // The mound is on the surface, above this slice: every pellet brought out, heaped round the
          // entrance (its area holds them all, loosened by SWELL). A faint fill and an outline, so the
          // tunnels under it still show.
          const inner = Math.max(4, nest.r * c.zoom);
          const outer = Math.max(inner, moundRadius(col.soilOut, nest.r) * c.zoom);
          ctx.beginPath();
          ctx.arc(nx, ny, outer, 0, Math.PI * 2);
          ctx.arc(nx, ny, inner, 0, Math.PI * 2, true);
          ctx.fillStyle = theme.mound;
          ctx.globalAlpha = 0.12;
          ctx.fill();
          ctx.globalAlpha = 0.8;
          ctx.beginPath();
          ctx.arc(nx, ny, outer, 0, Math.PI * 2);
          ctx.strokeStyle = theme.mound;
          ctx.lineWidth = Math.max(1, d * 1.2);
          ctx.stroke();
          ctx.globalAlpha = 1;
        }
        ctx.beginPath();
        ctx.arc(nx, ny, Math.max(4, nest.r * c.zoom), 0, Math.PI * 2);
        ctx.strokeStyle = odourColour(theme.inkRgb, theme.warnRgb, col.nestOdour);
        ctx.lineWidth = 2;
        ctx.globalAlpha = 0.7;
        ctx.stroke();
        if (nest.entrance) {
          // The side view: the entrance, a small ring on the ground line where the shaft comes up.
          const [ex, ey] = toScreen(c, v, nest.entrance.x, nest.entrance.y);
          ctx.beginPath();
          ctx.arc(ex, ey, Math.max(3, 1.5 * c.zoom), 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
        // Nest slice 4: the brood where it lies (eggs pale, larvae cream, pupae tan) and the queen, larger, in her colony's
        // colour (dead: hollow, and crossed out).
        const bd = Math.max(1.5, len * 0.4);
        for (const b of col.brood.items) {
          if (b.held >= 0 || !home) continue;
          const wx = centreX(b.x, b.y);
          const wy = centreY(b.y);
          if (!inView(wx, wy)) continue;
          const [x, y] = toScreen(c, v, wx, wy);
          if (nestImage) drawNestSprite(ctx, nestImage, resourceLod, `brood-${b.stage}` as NestSprite, x, y, c.zoom);
          else {
            ctx.fillStyle = BROOD_RGB[b.stage] as string;
            ctx.fillRect(x - bd / 2, y - bd / 2, bd, bd);
          }
        }
        // Nest slice 5: food lying in this colony's chambers, as seeds along each floor (up to 40 drawn a chamber).
        if (home && m.chambers) {
          ctx.fillStyle = theme.accent;
          for (const ch of m.chambers.list) {
            if (ch.colony !== col.params.nest || ch.food < 1 || ch.cells === 0) continue;
            for (const [fx, fy] of chamberFoodSpots(ch, (x, y) => m.chambers!.at(x, y) === ch.id && rockAt(m, x, y) === OPEN)) {
              const wx = centreX(fx, fy);
              const wy = centreY(fy);
              if (!inView(wx, wy)) continue;
              const [x, y] = toScreen(c, v, wx, wy);
              if (resourceImage) drawResourceSprite(ctx, resourceImage, resourceLod, "plain", 0, x, y, c.zoom);
              else ctx.fillRect(x - bd / 2, y - bd / 2, bd, bd);
            }
          }
        }
        // Nest slice 7: the dead, where they lie or on the midden (a grey cross each).
        ctx.strokeStyle = theme.mound;
        ctx.lineWidth = Math.max(1, d * 0.8);
        ctx.beginPath();
        for (const k of visibleCadavers(col, lv)) {
          // One world: a corpse lies on its layer (carried up to the plane's midden, or dropped there; home when unset).
          if (k.held >= 0 || (lv >= 0 && (k.layer ?? col.home) !== lv)) continue;
          const wx = centreX(k.x, k.y);
          const wy = centreY(k.y);
          if (!inView(wx, wy)) continue;
          const [x, y] = toScreen(c, v, wx, wy);
          if (cadaverSprites.draw(ctx, resourceLod, decayStage(col.time, k.died), x, y, c.zoom)) continue;
          if (nestImage) {
            drawNestSprite(ctx, nestImage, resourceLod, "corpse", x, y, c.zoom);
            continue;
          }
          ctx.moveTo(x - bd, y - bd);
          ctx.lineTo(x + bd, y + bd);
          ctx.moveTo(x + bd, y - bd);
          ctx.lineTo(x - bd, y + bd);
        }
        // Historical burial counts remain in the inspector, rather than permanent exposed-body crosses.
        ctx.stroke();
        if (home && col.queen && inView(col.queen.x, col.queen.y)) {
          const [x, y] = toScreen(c, v, col.queen.x, col.queen.y);
          const queenImage = hexes ? nestSprites.get(resourceLod, odourRgb(theme.inkRgb, theme.warnRgb, col.nestOdour), darkSprites) : null;
          if (queenImage) {
            drawNestSprite(ctx, queenImage, resourceLod, col.queen.alive ? "queen" : "queen-dead", x, y, c.zoom);
          } else {
            const qr = Math.max(3, len * 0.9);
            ctx.beginPath();
            ctx.ellipse(x, y, qr * 1.4, qr * 0.8, 0, 0, Math.PI * 2);
            const qc = odourColour(theme.inkRgb, theme.warnRgb, col.nestOdour);
            ctx.lineWidth = Math.max(1, d);
            if (col.queen.alive) {
              ctx.fillStyle = qc;
              ctx.fill();
            } else {
              ctx.strokeStyle = qc;
              ctx.globalAlpha = 0.6;
              ctx.stroke();
              ctx.beginPath();
              ctx.moveTo(x - qr * 1.4, y - qr);
              ctx.lineTo(x + qr * 1.4, y + qr);
              ctx.stroke();
              ctx.globalAlpha = 1;
            }
          }
        }
        // Alates (ja-lo8.9): new queens, smaller than the queen, with wings, as they wait and walk out to fly.
        for (const al of col.alates) {
          if (!home || !inView(al.x, al.y)) continue;
          const [x, y] = toScreen(c, v, al.x, al.y);
          const ar = Math.max(2.5, len * 0.7);
          const alateImage = hexes ? nestSprites.get(resourceLod, odourRgb(theme.inkRgb, theme.warnRgb, col.nestOdour), darkSprites) : null;
          if (alateImage) {
            drawNestSprite(ctx, alateImage, resourceLod, "alate-wings", x, y, c.zoom);
            drawNestSprite(ctx, alateImage, resourceLod, "alate-body", x, y, c.zoom);
          } else {
            ctx.beginPath();
            ctx.ellipse(x, y, ar * 1.3, ar * 0.7, 0, 0, Math.PI * 2);
            ctx.fillStyle = odourColour(theme.inkRgb, theme.warnRgb, col.nestOdour);
            ctx.fill();
            ctx.beginPath();
            ctx.ellipse(x - ar * 0.6, y - ar * 0.9, ar * 0.9, ar * 0.4, -0.5, 0, Math.PI * 2);
            ctx.ellipse(x + ar * 0.6, y - ar * 0.9, ar * 0.9, ar * 0.4, 0.5, 0, Math.PI * 2);
            ctx.globalAlpha = 0.5;
            ctx.fillStyle = theme.paper;
            ctx.fill();
            ctx.globalAlpha = 1;
          }
          if (al.load > 0) {
            ctx.beginPath();
            ctx.arc(x, y, Math.max(1.5, ar * 0.45), 0, Math.PI * 2);
            ctx.fillStyle = theme.spore;
            ctx.fill();
          }
        }
        ctx.lineCap = "round";
        ctx.lineWidth = Math.max(1, len * 0.3);
        ctx.globalAlpha = 0.85;
        workerGait.update(col);
        // A front-facing curtain worker is the same silhouette as the aerial worker against its walking plane.
        // The surface strip is a separate diagrammatic projection, not another underground population.
        const lod = workerLod(c.zoom, d);
        // One stroke per odour band (most frames: one band per colony).
        let bands = 0;
        for (let i = 0; i < col.n; i++) if (col.alive[i] && (lv < 0 || col.layer[i] === lv)) bands |= 1 << binOf(col.odour[i]);
        for (let b = 0; b < BINS; b++) {
          if (!(bands & (1 << b))) continue;
          const colour = theme.inkRgb.map((ink, k) => Math.round(ink + ((theme.warnRgb[k] - ink) * b) / (BINS - 1)));
          const sprite = hexes ? workerSprites.get(lod, colour, darkSprites) : null;
          ctx.beginPath();
          for (let i = 0; i < col.n; i++) {
            if (!col.alive[i] || (lv >= 0 && col.layer[i] !== lv) || binOf(col.odour[i]) !== b || !inView(col.x[i], col.y[i])) continue;
            const [x, y] = toScreen(c, v, col.x[i], col.y[i]);
            if (sprite) {
              const pose = lod === "walk" && !motion.matches ? workerGait.pose(col, i) : 0;
              drawWorkerSprite(ctx, sprite, lod, col.heading[i], pose, x, y, c.zoom);
            } else {
              const hc = Math.cos(col.heading[i]) * half;
              const hs = Math.sin(col.heading[i]) * half;
              ctx.moveTo(x - hc, y - hs);
              ctx.lineTo(x + hc, y + hs);
            }
          }
          ctx.strokeStyle = theme.ink;
          ctx.stroke();
          if (!sprite) {
            ctx.beginPath();
            for (let i = 0; i < col.n; i++) {
              if (!col.alive[i] || (lv >= 0 && col.layer[i] !== lv) || binOf(col.odour[i]) !== b || !inView(col.x[i], col.y[i])) continue;
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
            if (!col.alive[i] || l < lo || l >= hi || (lv >= 0 && col.layer[i] !== lv) || !inView(col.x[i], col.y[i])) continue;
            const [x, y] = toScreen(c, v, col.x[i], col.y[i]);
            ctx.fillRect(x - dot / 2, y - dot / 2, dot, dot);
          }
        }
        ctx.globalAlpha = 1;
        ctx.fillStyle = theme.accent;
        for (let i = 0; i < col.n; i++) {
          if (!col.alive[i] || !col.carrying[i] || (lv >= 0 && col.layer[i] !== lv) || !inView(col.x[i], col.y[i])) continue;
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
          if (!col.alive[i] || !col.pellet[i] || (lv >= 0 && col.layer[i] !== lv) || !inView(col.x[i], col.y[i])) continue;
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
      if (strip && world) drawStripAnts(world, c, v, len, crumb, inView);

      // Tall structures occlude bodies in the aerial view, just as they do in 3D inspection.
      for (const k of stalks) {
        const [sx, sy] = hyphaCell(k);
        if (sx < rx0 - 1 || sx > rx1 + 1 || sy < ry0 - 1 || sy > ry1 + 1) continue;
        const [x, y] = toScreen(c, v, centreX(sx, sy), centreY(sy));
        fungalSprites.draw(ctx, { stalkLevel }, k, x, y, c.zoom, "raised");
      }

      // Chamber labels (the Learn drawer): each chamber's role at its centre, where the chamber is wide enough on screen.
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
      if (clumps?.length && (world ? lv === PLANE : true)) {
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
        const now = performance.now();
        tr.update(now);
        if (world && lv === PLANE)
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
        if (!sc || (lv >= 0 && sc.layer[s.i] !== lv) || (f && sameAnt(f, s))) continue;
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
        pill([{ text: specimenLabel(s.no), fill: theme.ink }], x, y - r - tpx, tpx);
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
        pill([{ text: antTag(fcol, f.i), fill: theme.accent }], x, y - r - tpx, tpx);
      }
      // The hole badges last of the map's marks, so a followed ant at its hole draws under its colony's badge (review of #189, N3).
      if (world && lv === PLANE) drawHoleNames(world, c, v, d, inView);
      const pn = penRef.current;
      if (world && lv === PLANE && pn) drawPen(world, pn, c, v, d);

      drawMapInspection(ctx, mapInspectionNow(), lv, c, v, d, motion.matches ? 0 : performance.now() / 1000);

      // Zoomed in: the minimap, with the view's rectangle.
      if (c.zoom > fitZoom(ext, v) * 1.05) {
        const now = performance.now();
        if (now - miniAt > 500) {
          paintMini();
          miniAt = now;
        }
        const r = minimapRect(ext, v, d);
        ctx.globalAlpha = 0.92;
        ctx.drawImage(mini, r.x, r.y, r.w, r.h);
        ctx.globalAlpha = 1;
        ctx.strokeStyle = theme.line;
        ctx.lineWidth = d;
        ctx.strokeRect(r.x, r.y, r.w, r.h);
        const k = r.w / ext.w;
        ctx.strokeStyle = theme.accent;
        ctx.lineWidth = 1.5 * d;
        const x0 = Math.max(gx0, vis.x0);
        const y0 = Math.max(0, vis.y0);
        ctx.strokeRect(r.x + (x0 - gx0) * k, r.y + y0 * k, (Math.min(gx0 + ext.w, vis.x1) - x0) * k, (Math.min(ext.h, vis.y1) - y0) * k);
      }
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
      const v: Viewport = { w: canvas.width, h: canvas.height };
      const s = vc();
      const we = extent();
      const c = zoomBy(s.cam ?? fit(we, v), we, v, (e.clientX - r.left) * k, (e.clientY - r.top) * k, Math.exp(-e.deltaY * 0.0015));
      s.cam = c;
      s.aim = null;
      s.zoomedIn = c.zoom > fitZoom(we, v) * 1.05;
      s.fitted = c.zoom <= fitZoom(we, v) * 1.0001;
    };
    canvas.addEventListener("wheel", wheel, { passive: false });
    return () => {
      off();
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
  const viewport = (): Viewport => ({ w: canvasRef.current?.width ?? 1, h: canvasRef.current?.height ?? 1 });
  const camera = (): Camera => {
    const s = vc();
    const we = extent();
    s.cam = clamp(s.cam ?? fit(we, viewport()), we, viewport());
    return s.cam;
  };
  const setCamera = (c: Camera) => {
    const s = vc();
    const we = extent();
    const cam = clamp(c, we, viewport());
    s.cam = cam;
    s.aim = null;
    const fz = fitZoom(we, viewport());
    s.zoomedIn = cam.zoom > fz * 1.05;
    s.fitted = cam.zoom <= fz * 1.0001;
  };
  /** View `v`'s map: one world's plane or curtain, or the game's one map. */
  const mapOf = (v: number): WorldMap => (world ? (v === PLANE ? world.plane : world.curtain) : anyColony.map);
  // The page's handle on the cameras: a view opens where it is asked (a linked click, an ant carried across).
  useEffect(() => {
    if (!api) return;
    api.current = {
      centreOn: (v, x, y, how = {}) => {
        // Looking elsewhere in the view shown ends a follow (as a drag does); a follow carried to the other view goes on.
        // `keepFollow`: the page carrying the followed ant itself (an ant that pops up a hole and straight back down asks
        // for the view still shown), which must not drop it.
        if (v === shown.current && follow.current && !how.keepFollow) unfollow();
        let s = cams.current.get(v);
        if (!s) cams.current.set(v, (s = NEW_CAM()));
        const we = extentOf(mapOf(v));
        const vp = viewport();
        const now = cams.current.get(shown.current)?.cam?.zoom ?? fitZoom(we, vp);
        const zoom = how.span ? Math.min(vp.w, vp.h) / how.span : how.close ? Math.max(now, LINK_ZOOM * dpr()) : now;
        // Not clamped here: each frame clamps round the aim in the box it is drawn in (ViewCam.aim).
        s.cam = { x, y, zoom };
        s.aim = { x, y, ...(how.span ? { span: how.span } : {}) };
        const fz = fitZoom(we, vp);
        s.fitted = false;
        s.zoomedIn = zoom > fz * 1.05;
      },
      camera: (v) => cams.current.get(v)?.cam ?? null,
      showAll: () => showAll(),
      goNest: (k) => goNest(k),
    };
    return () => {
      api.current = null;
    };
  });
  /** A click on nothing in one world: on the line above, the side view at its column; on the strip below (or the sky over it), the top view at P(s). */
  const link = (x: number, y: number) => {
    if (!world || !onLink) return;
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
  const inMini = (x: number, y: number) => {
    if (!vc().zoomedIn) return false;
    const r = minimapRect(extent(), viewport(), dpr());
    return x >= r.x && y >= r.y && x <= r.x + r.w && y <= r.y + r.h;
  };
  const jumpMini = (x: number, y: number) => {
    if (follow.current) unfollow();
    const [wx, wy] = fromMinimap(extent(), viewport(), dpr(), x, y);
    setCamera({ ...camera(), x: wx, y: wy });
  };
  /** The nearest ant (any colony, on the view's layer in one world) within PICK_PX of the point, or null. */
  const pick = (x: number, y: number): Followed | null => {
    const c = camera();
    const [wx, wy] = toWorld(c, viewport(), x, y);
    const reach = (PICK_PX * dpr()) / c.zoom;
    const lv = world ? shown.current : -1;
    let best: Followed | null = null;
    let bestD = reach * reach;
    for (const [k, col] of colonies.entries()) {
      for (let i = 0; i < col.n; i++) {
        if (!col.alive[i] || (lv >= 0 && col.layer[i] !== lv)) continue;
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

  /** The builder's layer for the shown view: PLANE or CURTAIN in one world, 0 on one map. */
  const buildLayer = () => (world ? shown.current : 0);
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

  const onDown = (e: PointerEvent<HTMLCanvasElement>) => {
    if (e.button === 1) e.preventDefault(); // middle-drag pans; no autoscroll
    // The builder sets a palm aside (a child's resting hand is no finger: docs/builder.md, design).
    if (buildRef.current && isPalm(e)) {
      palms.current.add(e.pointerId);
      return;
    }
    e.currentTarget.setPointerCapture(e.pointerId);
    e.currentTarget.focus({ preventScroll: true });
    const [x, y] = devicePoint(e);
    pointers.current.set(e.pointerId, { x, y });
    if (pointers.current.size === 2) {
      gesture.current = { ...NO_GESTURE, kind: "pinch", moved: Infinity };
      return;
    }
    if (pointers.current.size > 2) return;
    const start = { moved: 0, sx: x, sy: y };
    if (e.button === 0 && inMini(x, y)) {
      gesture.current = { ...NO_GESTURE, ...start, kind: "mini" };
      jumpMini(x, y);
    } else if (e.button === 0 && buildRef.current?.tool === "tweezers") {
      // The tweezers lift the ant under the finger, on the top view only; with none there the finger pans as ever.
      const ant = world && shown.current === PLANE ? pick(x, y) : null;
      if (ant) {
        // A finger waits to see whether a second joins it (a pinch); a mouse lifts at once.
        const held = e.pointerType !== "mouse";
        gesture.current = { ...NO_GESTURE, ...start, kind: "tweeze", ant, pending: held };
        if (!held) {
          const [wx, wy] = toWorld(camera(), viewport(), x, y);
          buildRef.current.onTweeze?.(ant.k, ant.i, wx, wy, true);
        }
      } else gesture.current = { ...NO_GESTURE, ...start, kind: "pan", button: e.button };
    } else if (e.button === 0 && buildRef.current?.tool) {
      // A tool in hand: a drag paints, and a tap places. A finger waits to see whether a second joins it (two fingers pan and
      // zoom, as with no tool): it builds once it has moved past the slop, or on lifting as a tap. A mouse builds at once.
      const held = e.pointerType !== "mouse";
      gesture.current = { ...NO_GESTURE, ...start, kind: "paint", pending: held };
      if (!held) paint([[x, y]], true);
    } else gesture.current = { ...NO_GESTURE, ...start, kind: "pan", button: e.button };
  };

  /** Report canvas point (x, y) to the lens: the page's pixels, the world point and the ant there. */
  const probeAt = (x: number, y: number, pinned: boolean) => {
    const cv = canvasRef.current;
    if (!cv || !probeCb.current) return;
    const r = cv.getBoundingClientRect();
    const k = cv.width / r.width;
    const [wx, wy] = toWorld(camera(), viewport(), x, y);
    probeCb.current({ sx: r.left + x / k, sy: r.top + y / k, lv: world ? shown.current : -1, x: wx, y: wy, ant: pick(x, y), pinned });
  };

  const onMove = (e: PointerEvent<HTMLCanvasElement>) => {
    const [x, y] = devicePoint(e);
    hover.current = [x, y];
    // The lens follows a mouse over the map (no button down); a finger taps instead (onUp).
    if (lensRef.current && e.pointerType === "mouse" && pointers.current.size === 0) probeAt(x, y, false);
    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    const g = gesture.current;
    if (g.kind === "pinch" && pointers.current.size >= 2) {
      let other = prev;
      for (const [id, p] of pointers.current) if (id !== e.pointerId) other = p;
      const before = Math.hypot(prev.x - other.x, prev.y - other.y);
      const after = Math.hypot(x - other.x, y - other.y);
      const c = zoomBy(camera(), extent(), viewport(), (x + other.x) / 2, (y + other.y) / 2, before > 0 ? after / before : 1);
      setCamera(pan(c, (x - prev.x) / 2, (y - prev.y) / 2));
    } else if (g.kind === "pan") {
      const was = g.moved;
      g.moved += Math.abs(x - prev.x) + Math.abs(y - prev.y);
      if (g.moved > slop()) {
        if (follow.current) unfollow();
        // Crossing the slop, catch up from where the drag began, so the ground stays under the pointer.
        setCamera(was <= slop() ? pan(camera(), x - g.sx, y - g.sy) : pan(camera(), x - prev.x, y - prev.y));
      }
    } else if (g.kind === "mini" && e.buttons & 1) jumpMini(x, y);
    else if (g.kind === "paint") {
      if (g.pending) {
        g.moved += Math.abs(x - prev.x) + Math.abs(y - prev.y);
        // Still within a click's slop: not yet a stroke (a second finger may be on its way).
        if (g.moved > slop()) {
          g.pending = false;
          paint(
            [
              [g.sx, g.sy],
              [x, y],
            ],
            true,
          );
        }
      } else
        paint(
          [
            [prev.x, prev.y],
            [x, y],
          ],
          false,
        );
    } else if (g.kind === "tweeze" && g.ant) {
      if (g.pending) {
        g.moved += Math.abs(x - prev.x) + Math.abs(y - prev.y);
        if (g.moved > slop()) {
          g.pending = false;
          const [sx, sy] = toWorld(camera(), viewport(), g.sx, g.sy);
          buildRef.current?.onTweeze?.(g.ant.k, g.ant.i, sx, sy, true);
        }
      }
      if (!g.pending) {
        const [wx, wy] = toWorld(camera(), viewport(), x, y);
        buildRef.current?.onTweeze?.(g.ant.k, g.ant.i, wx, wy, false);
      }
    }
    pointers.current.set(e.pointerId, { x, y });
  };

  const onUp = (e: PointerEvent<HTMLCanvasElement>) => {
    if (palms.current.delete(e.pointerId)) return;
    const g = gesture.current;
    const p = pointers.current.get(e.pointerId);
    pointers.current.delete(e.pointerId);
    // A tap with a tool in hand places it, where the finger landed (it built nothing while a second finger might have joined).
    if (e.type === "pointerup" && g.kind === "paint" && g.pending) paint([[g.sx, g.sy]], true);
    if (e.type === "pointerup" && g.kind === "pan" && g.button === 0 && g.moved <= slop() && p) {
      const pn = penRef.current;
      if (lensRef.current && !(world && pn && shown.current === PLANE)) {
        // The lens on: a click (a tap) says what is there, and keeps the card up; it follows nothing. The queen's pen keeps its click.
        probeAt(p.x, p.y, true);
      } else if (world && pn && shown.current === PLANE) {
        // The queen's pen: a click on the top view is where she flies (the page founds there, or says why not).
        const [wx, wy] = toWorld(camera(), viewport(), p.x, p.y);
        pn.onPick({ x: wx, y: wy });
      } else {
        const f = pick(p.x, p.y);
        follow.current = f;
        onFollow(f);
        const hit = !f && labelsOn.current && onChamber ? chamberAt(p.x, p.y) : null;
        if (hit) onChamber!(hit.k, hit.id);
        else if (!f) link(p.x, p.y);
      }
    }
    if (pointers.current.size === 0) gesture.current = NO_GESTURE;
    // A pinch stays a pinch while two fingers are down (a third lifted); the last finger left pans, and never clicks.
    else if (g.kind === "pinch" && pointers.current.size === 1) gesture.current = { ...NO_GESTURE, kind: "pan", moved: Infinity };
  };

  const onKey = (e: KeyboardEvent<HTMLCanvasElement>) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return; // browser and system shortcuts (Ctrl+0, Ctrl+S, …) pass through
    if (e.key === " ") {
      e.preventDefault(); // the focused field doesn't scroll the page
      return;
    }
    const v = viewport();
    const c = camera();
    const step = Math.min(v.w, v.h) * 0.15;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [step, 0],
      a: [step, 0],
      ArrowRight: [-step, 0],
      d: [-step, 0],
      ArrowUp: [0, step],
      w: [0, step],
      ArrowDown: [0, -step],
      s: [0, -step],
    };
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key; // Shift or Caps Lock still moves
    const m = moves[key];
    if (m) {
      if (follow.current) unfollow();
      setCamera(pan(c, m[0], m[1]));
    } else if (e.key === "+" || e.key === "=") setCamera(zoomBy(c, extent(), v, v.w / 2, v.h / 2, 1.25));
    else if (e.key === "-" || e.key === "_") setCamera(zoomBy(c, extent(), v, v.w / 2, v.h / 2, 0.8));
    else if (e.key === "0" || e.key === "Home") showAll();
    else if (key === "n") goNest((nestTurn.current + 1) % colonies.length);
    // Escape drops a follow; with nothing followed it is left for the drawer (review of #182, S7).
    else if (e.key === "Escape" && follow.current && !e.defaultPrevented) unfollow();
    else return;
    e.preventDefault();
  };

  const showAll = () => {
    unfollow();
    setCamera(fit(extent(), viewport()));
  };
  /** Centre on colony k's nest (n cycles through them). */
  const goNest = (k: number) => {
    const col = colonies[k] ?? anyColony;
    nestTurn.current = k;
    unfollow();
    // The side view: between the entrance and the chamber, so both the ground line and the nest are in view. One world:
    // the nest on the shown layer (its hole on the plane above, its shaft and chamber below).
    const nest = world ? (col.layers[shown.current] ?? col.layers[0]!).nest : col.nest;
    const e = nest.entrance;
    const hx = e ? (e.x + nest.x) / 2 : nest.x;
    const hy = e ? (e.y + nest.y) / 2 : nest.y;
    setCamera({ x: hx, y: hy, zoom: Math.max(camera().zoom, 8 * dpr()) });
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
        aria-label={`colony field: drag to pan, wheel or pinch to zoom, arrow keys to move, plus and minus to zoom, 0 for the whole map, n to cycle the nests; click an ant to follow it (with the lens on, i, a click says what is there instead)${world ? (pen && view === PLANE ? "; click where the new queen flies" : view === PLANE ? "; click the line to look below there" : "; click the ground strip to look above there") : ""}`}
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
            {(world ? (view === PLANE ? world.plane : world.curtain) : anyColony.map).chambers && (
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
