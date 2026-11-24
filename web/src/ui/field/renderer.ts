// The field's renderer (ja-fnd.6.3.8, docs/field-split.md): a frame is a list of stages, run in order over one FrameState. The shell does what only it
// can (read its refs and props, bind the shown map, ease the camera: field/prelude.ts) and hands the renderer a frame to draw; each stage is a plain
// function over FieldCtx and what the frame derived, so a Node test can run it on a recording fake context, and a species or a nest kind that needs
// its own drawer adds a stage to the list, not a branch to draw(). The stages leave the 2D context's state as the frame's old inline code did
// (docs/field-split.md, "the canvas state"): a stage's last property set is the next one's first, so the order of the list is the picture.

import {
  type AphidClump,
  CURTAIN,
  centreX,
  centreY,
  type Colony,
  groundHeat,
  OPEN,
  PLANE,
  R,
  rockAt,
  sunDown,
} from "../../colony/index.ts";
import { toScreen, visible } from "../camera.ts";
import type { Followed } from "../follow.ts";
import type { SensedMap } from "../fungusSight.ts";
import { type InspectionOrbit, mapCameraOrbit } from "../inspectionOrbit.ts";
import { drawMapTerrainGrain } from "../mapTerrain.ts";
import { canTiltMap, type MapVoxelPass } from "../mapVoxel.ts";
import { drawResourceSprite, FOOD_SPOTS, foodDensity, foodKind } from "../resourceSprites.ts";
import type { Specimen } from "../specimens.ts";
import type { AntTraces } from "../trace.ts";
import { workerLod } from "../workerSprites.ts";
import { type AntFrame, drawAnts } from "./ants.ts";
import type { FieldCtx, FieldInputs } from "./ctx.ts";
import { drawFungusGround, drawStalksRaised } from "./fungus.ts";
import { type Ground, groundPaper } from "./ground.ts";
import { drawAphids, drawFollowed, drawInspection, drawSpecimens, drawTraces, type MarkFrame } from "./marks.ts";
import { drawNest, drawRememberedCorpses, type NestFrame } from "./nests.ts";
import type { Minimap } from "./minimap.ts";
import { UNKNOWN } from "../fog/knowledge.ts";
import { actorCull, exploredCull } from "./fogCull.ts";
import { SNAP } from "../fog/sources.ts";
import { drawBends, drawHoleNames, drawLine, drawPen, drawStripAnts } from "./overlays.ts";
import { type FrameSinks, publishDrawMs, publishFrame } from "./result.ts";
import { BRICK_ZOOM, HEX_ZOOM } from "./zoom.ts";

/** What the renderer draws with, built once per field: the ground's chunk cache, the minimap, the voxel pass, and where the frame reports to. */
export interface FieldParts {
  ground: Ground;
  minimap: Minimap;
  voxelMap: Pick<MapVoxelPass, "draw">;
  sinks: FrameSinks;
}

/** What the frame reads of the shell's refs and props, taken as the frame begins. */
export interface FrameRefs {
  /** the map's tilt (the inspection orbit) */
  orbit: InspectionOrbit;
  /** the chamber labels are on */
  labelsOn: boolean;
  /** the builder's aphid clumps, read once a frame */
  aphids: readonly AphidClump[];
  traces: AntTraces | null;
  specimens: readonly Specimen[];
  /** what the fungus's hosts have sensed (the voxel pass draws it) */
  sensed: SensedMap;
}

/** The cells in view: the rows of hexagons and the columns, clipped to the map. */
export interface CellWindow {
  rx0: number;
  rx1: number;
  ry0: number;
  ry1: number;
}

/** Everything a frame's stages share: what the shell hands in, what the frame derives once, and what one stage leaves for a later one. */
export interface FrameState {
  fc: FieldCtx;
  inputs: FieldInputs;
  parts: FieldParts;
  refs: FrameRefs;
  /** the clock when the frame began (a dev build reports how long it took), or 0 */
  started: number;
  /** the followed ant as it stood when the frame began, its colony, and whether it is on the layer shown */
  f: Followed | null;
  fcol: Colony | null;
  fHere: boolean;
  /** the world rectangle in view (`visible`) */
  vis: ReturnType<typeof visible>;
  cellWindow: CellWindow;
  /** at the hexagon zoom, and how far the bricks have turned into hexagons */
  hexes: boolean;
  hexMix: number;
  resourceLod: ReturnType<typeof workerLod>;
  darkSprites: boolean;
  /** the diagnostics the frame publishes: the CSS size of a hexagon, and whether workers draw as sprites */
  cssHex: string;
  workerStyle: "ink" | "voxel";
  resourceImage: HTMLImageElement | null;
  nestImage: CanvasImageSource | null;
  nestStyle: "voxel" | "symbols";
  /** an ant's length, the view test, a crumb's size */
  len: number;
  half: number;
  crumb: number;
  inView: (wx: number, wy: number) => boolean;
  /** left by the fungus stage for the raised stalks, and by the voxel stage for the stages after it */
  fungusFrame: ReturnType<typeof drawFungusGround> | null;
  voxel: ReturnType<MapVoxelPass["draw"]> | null;
  /** the alates' drawers, which draw again over the voxel pass */
  alateOverlays: (() => void)[];
}

/** One stage of a frame. Returning false ends the frame there (the tilted map has no labels or marks over it). */
export type Stage = (fs: FrameState) => void | false;

/** Derive what the stages share from the shell's snapshot: the cells and zoom in view, the sprite sheets at this level, the sizes of an ant. */
export function beginFrame(
  fc: FieldCtx,
  inputs: FieldInputs,
  parts: FieldParts,
  refs: FrameRefs,
  seen: { started: number; f: Followed | null; fcol: Colony | null; fHere: boolean },
): FrameState {
  const { c, v, d, m, theme, sprites } = fc;
  const gx0 = m.x0;
  const vis = visible(c, v);
  const ry0 = Math.max(0, Math.floor(vis.y0 / R) - 1);
  const ry1 = Math.min(m.size.h - 1, Math.ceil(vis.y1 / R) + 1);
  const rx0 = Math.max(gx0, Math.floor(vis.x0) - 1);
  const rx1 = Math.min(gx0 + m.size.w - 1, Math.ceil(vis.x1) + 1);
  const zoom = c.zoom / d;
  const hexes = zoom >= HEX_ZOOM;
  const blend = Math.max(0, Math.min(1, (zoom - BRICK_ZOOM) / (16 - BRICK_ZOOM)));
  const hexMix = blend * blend * (3 - 2 * blend);
  const resourceLod = workerLod(c.zoom, d);
  const darkSprites = theme.paperRgb[0] * 0.2126 + theme.paperRgb[1] * 0.7152 + theme.paperRgb[2] * 0.0722 < 100;
  // Both maps face the ants' walking plane: aerial above, straight onto the back wall below.
  const resourceImage = hexes ? sprites.resource.get(resourceLod) : null;
  const nestImage = hexes ? sprites.nest.get(resourceLod) : null;
  const len = Math.max(3, Math.min(22, c.zoom * 0.9));
  return {
    fc,
    inputs,
    parts,
    refs,
    ...seen,
    vis,
    cellWindow: { rx0, rx1, ry0, ry1 },
    hexes,
    hexMix,
    resourceLod,
    darkSprites,
    // Read-only browser diagnostics: actual CSS scale and the available worker representation.
    cssHex: (c.zoom / d).toFixed(2),
    workerStyle: hexes && sprites.worker.ready(resourceLod) ? "voxel" : "ink",
    resourceImage,
    nestImage,
    nestStyle: nestImage ? "voxel" : "symbols",
    len,
    half: len / 2,
    crumb: Math.max(1.5, len * 0.35),
    inView: (wx, wy) => wx >= vis.x0 - 2 && wx <= vis.x1 + 2 && wy >= vis.y0 - 2 && wy <= vis.y1 + 2,
    fungusFrame: null,
    voxel: null,
    alateOverlays: [],
  };
}

/** The page's paper over the whole canvas, and the ground's own paper over the map. */
export const paperStage: Stage = ({ fc }) => {
  const { ctx, c, v, m, ext, theme } = fc;
  ctx.fillStyle = theme.paper;
  ctx.fillRect(0, 0, v.w, v.h);
  ctx.imageSmoothingEnabled = false;
  const [left, top] = toScreen(c, v, m.x0, 0);
  const [right, bottom] = toScreen(c, v, m.x0 + ext.w, ext.h);
  ctx.fillStyle = `rgb(${groundPaper(fc).join(",")})`;
  ctx.fillRect(left, top, right - left, bottom - top);
};

/** The chunks in view, as bricks or as hexagons, and the terrain's grain over the hexagons. */
export const groundStage: Stage = ({ fc, inputs, parts, hexMix, cellWindow, resourceImage }) => {
  const { ctx, c, v, m, theme, lv } = fc;
  const { rx0, rx1, ry0, ry1 } = cellWindow;
  const { ground } = parts;
  ground.draw(fc, inputs.show, cellWindow, hexMix, !!resourceImage);
  if (hexMix > 0) {
    ctx.save();
    ctx.globalAlpha = hexMix;
    drawMapTerrainGrain(
      ctx,
      c.zoom,
      v.w / 2 - c.x * c.zoom,
      v.h / 2 - c.y * c.zoom,
      [rx0, rx1, ry0, ry1],
      // Under the fog the grain shows the rock last sensed, and none where nothing was.
      (x, y) => (fc.fog ? (fc.fog.state(lv, x, y) === UNKNOWN ? 0 : (fc.fog.snapshot(lv, SNAP.rock, x, y) ?? 0)) : rockAt(m, x, y)),
      (x, y) => ground.isBare(x, y),
      theme.ink,
      theme.paper,
    );
    ctx.restore();
  }
};

/** Surface plain-food cells join into tissue; carried food and other qualities stay separate morsels. */
export const foodStage: Stage = ({ fc, cellWindow, resourceImage, resourceLod }) => {
  const { ctx, c, v, lv, m, sprites, fog } = fc;
  // Under the fog the food a cell shows is what was last sensed there (its snapshot), and none where nothing was.
  const foodAt = (x: number, y: number): number =>
    fog ? (fog.state(lv, x, y) === UNKNOWN ? 0 : (fog.snapshot(lv, SNAP.food, x, y) ?? 0)) : m.food.get(x, y);
  const qualityAt = (x: number, y: number): number => (fog ? (fog.snapshot(lv, SNAP.quality, x, y) ?? 1) : (m.quality?.get(x, y) ?? 1));
  const { rx0, rx1, ry0, ry1 } = cellWindow;
  const { surfaceLeaves, mapLeaves } = sprites;
  if (!resourceImage) return;
  for (let y = ry0; y <= ry1; y++)
    for (let x = rx0; x <= rx1; x++) {
      const amount = foodAt(x, y);
      if (!(amount > 0) || rockAt(m, x, y) !== OPEN) continue;
      const density = foodDensity(amount),
        kind = foodKind(qualityAt(x, y));
      if (lv === PLANE && kind === "plain") {
        const tiles = surfaceLeaves.get(x, y, (a, b) =>
          rockAt(m, a, b) === OPEN && foodKind(qualityAt(a, b)) === "plain" ? foodAt(a, b) : 0,
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
};

/** Heat (ja-rf5.5): the plane's ground warms toward noon and cools by dawn; a warm wash over it shows how hot it is now. */
export const heatStage: Stage = ({ fc }) => {
  const { ctx, v, lv, theme, colonies } = fc;
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
};

/** The fungus on the ground: this layer's hyphae, and the corpses it has colonised (field/fungus.ts). */
export const fungusStage: Stage = (fs) => {
  fs.fungusFrame = drawFungusGround(fs.fc, fs.cellWindow);
};

/**
 * Nests and ants in view, coloured by odour (recognition.ts): the first colony (Ink) starts in ink, the second (Amber) in the warn tone, and as
 * the fungus brings them to one odour they meet in between. The line over the plane (the bends below) first; each colony's nest, then its ants,
 * last colony first; the surface strip's ants; the raised stalks.
 */
export const actorsStage: Stage = (fs) => {
  const { fc, len, crumb, inView, half, hexes, resourceLod, darkSprites, nestImage, resourceImage } = fs;
  const { lv, strip, colonies } = fc;
  if (lv === PLANE) drawLine(fc);
  if (lv === CURTAIN) drawBends(fc);
  // Under the fog what lives on the ground (ants, brood, the queen, alates, corpses) is drawn only where an observer senses it now.
  const seen = actorCull(fc, inView);
  const nestFrame: NestFrame = { len, inView: seen, hexes, resourceLod, darkSprites, nestImage, resourceImage };
  const antFrame: AntFrame = { ...nestFrame, half, crumb };
  for (const col of [...colonies].reverse()) {
    const alates = drawNest(fc, nestFrame, col);
    if (alates) fs.alateOverlays.push(alates);
    drawAnts(fc, antFrame, col);
  }
  if (strip) drawStripAnts(fc, len, crumb, inView); // under the fog only the plane ants an observer senses now (overlays.ts)
  drawRememberedCorpses(fc, { ...nestFrame, inView });
  drawStalksRaised(fc, fs.cellWindow, fs.fungusFrame!);
};

/**
 * The voxel pass over the map (a tilted view, or the close map as a mesh), what the frame reports about itself (field/result.ts), and, where the
 * mesh shows, the alates and the heat over it again. A tilted map ends the frame after the minimap: its labels and hit targets use the overhead
 * projection.
 */
export const voxelStage: Stage = (fs) => {
  const { fc, parts, refs, vis, cssHex, workerStyle, nestStyle } = fs;
  const { ctx, c, v, d, lv, theme, colonies, fungus, world, smellAll } = fc;
  const voxel = parts.voxelMap.draw(
    ctx,
    { colonies, fungus, world },
    refs.sensed,
    lv,
    c,
    v,
    d,
    fs.inputs.show,
    refs.aphids,
    theme,
    !smellAll && !fc.fog,
    mapCameraOrbit(lv, refs.orbit),
  );
  fs.voxel = voxel;
  const canRotate = canTiltMap(lv, !!world, c, v, d, !smellAll && !fc.fog);
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
      chunkPaints: parts.ground.paints,
      chunkCacheHits: parts.ground.hits,
    },
    parts.sinks,
  );
  if (frameAngled) {
    parts.minimap.draw(fc, vis);
    return false; // Map labels and hit targets use the overhead projection.
  }
  if (voxel.alpha > 0) {
    // Alates keep their existing body/wing atlas until the shared mesh contains their separate wings.
    for (const drawAlates of fs.alateOverlays) drawAlates();
    const hp = colonies[0]?.params;
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
    if (world && lv === PLANE) drawLine(fc, false);
    if (world && lv === CURTAIN) drawBends(fc);
  }
};

/** Chamber labels (the Learn drawer): each chamber's role at its centre, where the chamber is wide enough on screen. */
export const labelsStage: Stage = ({ fc, refs, inView: viewed }) => {
  const { ctx, c, v, d, m, theme } = fc;
  // A chamber's role is read live, so under the fog a label shows only where an observer senses the place now.
  const inView = actorCull(fc, viewed);
  if (!(refs.labelsOn && m.chambers)) return;
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
};

/** The marks over everything on the map: aphids, a moved ant's trace, the specimens, the followed ant, the hole badges, the queen's pen, the inspection overlay. */
export const marksStage: Stage = (fs) => {
  const { fc, refs, inputs, f, fcol, fHere, inView, voxel } = fs;
  const { lv } = fc;
  const markFrame: MarkFrame = { inView, resourceImage: fs.resourceImage, resourceLod: fs.resourceLod };
  drawAphids(fc, markFrame, refs.aphids, voxel!.alpha);
  drawTraces(fc, refs.traces);
  drawSpecimens(fc, refs.specimens, f);
  drawFollowed(fc, f, fcol, fHere);
  // The hole badges last of the map's marks, so a followed ant at its hole draws under its colony's badge (review of #189, N3).
  if (lv === PLANE) drawHoleNames(fc, exploredCull(fc, inView));
  if (lv === PLANE && inputs.pen) drawPen(fc, inputs);
  drawInspection(fc);
};

/** The minimap in its corner, and, in a dev build, how long the frame took. */
export const minimapStage: Stage = ({ fc, parts, vis, started }) => {
  parts.minimap.draw(fc, vis);
  publishDrawMs(fc.env.now() - started, parts.sinks);
};

/** The stages of a frame, in the order they draw. */
export const STAGES: readonly Stage[] = [
  paperStage,
  groundStage,
  foodStage,
  heatStage,
  fungusStage,
  actorsStage,
  voxelStage,
  labelsStage,
  marksStage,
  minimapStage,
];

/** The renderer: a frame is its stages, in order, until one ends it. */
export class FieldRenderer {
  readonly stages: readonly Stage[];

  constructor(stages: readonly Stage[] = STAGES) {
    this.stages = stages;
  }

  /**
   * Draw a frame (`beginFrame` builds its state from what the shell read: the camera is already eased). Each stage starts from the same stroke state
   * (round caps, mitred joins, a 1 px line): the canvas keeps what the last stroke set, so a stage that did not set its own cap, join or width used to
   * draw with whatever the stage before it, or the frame before it, left (ja-fnd.6.3.10: the chamber labels' round join, which stayed on for every
   * stroke after them once the labels had been shown). The other state (the alpha, the smoothing, the styles) is still handed from stage to stage on purpose.
   */
  frame(fs: FrameState): void {
    const { ctx } = fs.fc;
    for (const stage of this.stages) {
      ctx.lineCap = "round";
      ctx.lineJoin = "miter";
      ctx.lineWidth = 1;
      if (stage(fs) === false) return;
    }
  }
}
