// The ground of the map (ja-fnd.6.3.7, docs/field-split.md): each 64 x 64 chunk of the shown map painted into a colour buffer (one pixel a cell: rock,
// soil and sky, food, the trails and alarm hosts have sensed, the fungus's spores, the mound, the chambers), kept between frames while its inputs
// are unchanged, then laid on the canvas as bricks (zoomed out) or drawn as true hexagons (up close). The side view's strip and the mound's cut
// are painted into the chunk that holds them. A class, since it holds the chunk canvases and the cache; the canvases and paths come from FieldEnv.
// The spore wash is here: it is a colour of the chunk's pixels. Plain TypeScript, no DOM of its own.

import {
  AIR,
  CELL,
  CHUNK,
  type Cells,
  type ChunkLayer,
  OPEN,
  PLANE,
  R,
  SIDE,
  SOIL,
  STRIP,
  cellAt,
  lineOfLayer,
  cellKey,
  rockAt,
  SPORE_FULL,
  SPORE_SHOWN,
} from "../../colony/index.ts";
import { toScreen } from "../camera.ts";
import { SENSED_FADE, sightOf } from "../fungusSight.ts";
import { moundBalls, type DirtBall } from "../inspectionMound.ts";
import { CLOSE_SPRITE_GROUND, INSPECTION_GROUND } from "../inspectionGround.ts";
import { ALARM_FULL, ALARM_SHOWN, FOOD_FULL, HOME_FULL, TRAIL_SHOWN } from "../lens.ts";
import { MapChunkPaintCache } from "../mapChunkPaintCache.ts";
import { HOME_RGB, ROLE_RGB } from "../palette.ts";
import { odourRgb } from "./colour.ts";
import { GRACE, LIVE, UNKNOWN } from "../fog/knowledge.ts";
import { SNAP } from "../fog/sources.ts";
import type { FieldCtx } from "./ctx.ts";
import { dimPx, fogRgb, planeGround, setPx } from "./fogCull.ts";
import type { FieldEnv } from "./env.ts";
import type { CellWindow } from "./fungus.ts";
import { HEX_ZOOM } from "./zoom.ts";

/** The mound's cut drawn on the side view's strip: at most this many levels (the curtain's sky is STRIP rows). */
export const CUT_MAX = STRIP;
/** No chunk column: drawHexes' "none yet" (−1 is a real chunk column on one world's curtain). */
const NO_CHUNK = -0x80000000;

/** Whether chunk pixel `o` is plain fog: never sensed (opaque) or remembered open ground (dimPx's 70). */
function fogCell(data: Uint8ClampedArray, o: number, fogPx: readonly number[]): boolean {
  const a = data[o + 3];
  return (a === 255 || a === 70) && data[o] === fogPx[0] && data[o + 1] === fogPx[1] && data[o + 2] === fogPx[2];
}
/** The builder's sugar (candy pink, as its 🍬) and crumbs (biscuit brown, as its 🍪), drawn apart from the ground's food. */
export const SUGAR_RGB: [number, number, number] = [214, 72, 140];
export const CRUMB_RGB: [number, number, number] = [150, 100, 52];

/**
 * On an endless plane (docs/endless-world.md §8, PRD §66 E5.4) a chunk canvas is kept while its chunk is within this many chunks of the cells in view, and
 * dropped beyond: memory follows the view, not the ground the camera has crossed. A bounded map keeps every canvas it has painted (its size is its bound).
 */
export const EVICT_MARGIN = 2;

/** One chunk of the shown map: its canvas, the canvas's 2D context and the colour buffer painted into it. */
export interface ChunkCanvas {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  img: ImageData;
  /** the chunk's column and row */
  cx: number;
  cy: number;
  /** how many times this chunk has been painted: it moves only when the chunk's inputs changed (the tile cache's exact compare), never with the frame count */
  version: number;
}

/** A layer's chunk as the page may read it: on an endless plane `peek`, which never makes a chunk the game has not made; a bounded map's `chunk` (the same read). */
// Only rock and food have generators on an endless plane (quality, spoil and chambers are absent from it), so `peek` and `chunk` answer alike for those three today;
// `peek` is used for all of them so that a layer that gets a generator later is not made by a frame.
function chunkOf<A extends Cells>(endless: boolean, layer: ChunkLayer<A> | undefined, cx: number, cy: number): A | undefined {
  return endless ? layer?.peek(cx, cy) : layer?.chunk(cx, cy);
}

/** The cell (x, y) of a layer read with `peek` (what a cell of a chunk nobody made reads as: the layer's `empty`). Never makes a chunk. */
export function peekCell(layer: ChunkLayer<Cells>, x: number, y: number): number {
  const a = layer.peek(x >> 6, y >> 6);
  return a ? a[((y & 63) << 6) | (x & 63)]! : layer.empty;
}

/** Which scent washes the Settings show (food trails, home trails). */
export interface GroundShow {
  food: boolean;
  home: boolean;
}

export const groundPaper = (k: FieldCtx) =>
  k.smellAll ? k.theme.paperRgb : k.lv === PLANE ? CLOSE_SPRITE_GROUND.surface : CLOSE_SPRITE_GROUND.back;
export const groundRock = (k: FieldCtx) => (k.smellAll ? k.theme.rock : CLOSE_SPRITE_GROUND.rock);
export const groundSoil = (k: FieldCtx) => (k.smellAll ? k.theme.soil : CLOSE_SPRITE_GROUND.soil);
export const groundSpoil = (k: FieldCtx) => (k.smellAll ? k.theme.spoil : CLOSE_SPRITE_GROUND.spoil);

/**
 * The side view of one world: what the strip and the mound's cut show at column s, row y, from the plane cell under
 * the line there (P(s)): the strip (row STRIP) is P(s)'s ground (rock, food, or open: the paper, as the side view's
 * walkway), and the rows above it the mound's cut, `spoil` levels high. null: sky, nothing to draw over it. (The
 * minimap's; paintChunk inlines it.)
 */
export function stripAt(k: FieldCtx, s: number, y: number): readonly number[] | null {
  const { world, theme } = k;
  if (y > STRIP || !cellAt(lineOfLayer(world, k.lv), s)) return null;
  const g = planeGround(k, CELL[0], CELL[1]);
  if (g.state === UNKNOWN) return y === STRIP ? fogRgb(theme) : null; // under the fog, a place nothing has sensed is fog on the strip; there is no cut above it
  const c =
    y === STRIP
      ? g.rock !== OPEN
        ? theme.rock
        : g.food > 0
          ? theme.accentRgb
          : theme.paperRgb
      : STRIP - y <= Math.min(CUT_MAX, g.spoil)
        ? theme.spoil
        : null;
  return c && g.state !== LIVE ? mixToFog(c, fogRgb(theme)) : c;
}

/** A chunk nothing has been sensed in, for the strip's chunk of the curtain: no explored bit, no snapshot. */
const EMPTY_VIEW = { bits: new Uint32Array((CHUNK * CHUNK) >> 5), snap: () => undefined };
/** A colour mixed towards the fog, as a remembered cell is. */
const mixToFog = (c: readonly number[], f: readonly number[]): number[] => [0, 1, 2].map((k) => Math.round(c[k]! * 0.6 + f[k]! * 0.4));

/** The chunks of the shown map and what keeps them. One per field; `clear()` when the shown map is another or has grown. */
export class Ground {
  /** the chunk canvases painted so far, by "cx,cy" */
  readonly chunks = new Map<string, ChunkCanvas>();
  /** chunks painted and chunk paints served from the cache, this frame */
  paints = 0;
  hits = 0;
  private readonly tiles = new MapChunkPaintCache();
  private readonly paths = new Map<number, Path2D>();
  /** under the fog, the hexagons of the strip-shown cells on an edge, by colour: drawn under the mound tint and the pellets (drawHexes) */
  private readonly edges = new Map<number, Path2D>();
  /** per frame, under the fog: each cell in view's colour (-1: none) and whether a strip shows it (drawHexes) */
  private keys = new Int32Array(0);
  private plains = new Uint8Array(0);
  private readonly env: FieldEnv;
  constructor(env: FieldEnv) {
    this.env = env;
  }

  /** The chunk (cx, cy)'s canvas and colour buffer, made on first use. */
  chunkCanvas(cx: number, cy: number): ChunkCanvas {
    const key = `${cx},${cy}`;
    let c = this.chunks.get(key);
    if (!c) {
      const cv = this.env.newCanvas(CHUNK, CHUNK);
      const cctx = cv.getContext("2d")!;
      c = { canvas: cv, ctx: cctx, img: cctx.createImageData(CHUNK, CHUNK), cx, cy, version: 0 };
      this.chunks.set(key, c);
    }
    return c;
  }

  /** The shown map is another, or has grown: no chunk is kept. */
  clear(): void {
    this.chunks.clear();
  }

  /** The theme changed: every chunk is painted again, whether its inputs changed or not. */
  clearTiles(): void {
    this.tiles.clear();
  }

  /** A frame begins: its counters start from nothing. */
  beginFrame(): void {
    this.paints = this.hits = 0;
  }

  /** Whether cell (x, y) of the shown map has nothing painted over the ground (its pixel is clear): the terrain's grain shows there. */
  isBare(x: number, y: number): boolean {
    const data = this.chunks.get(`${x >> 6},${y >> 6}`)?.img.data;
    return !!data && data[(((y & 63) << 6) | (x & 63)) * 4 + 3] === 0;
  }

  /**
   * The chunks in view painted (or kept) and laid on the canvas: as bricks (a strip a cell high for each row of the chunk, odd rows shifted half a
   * cell, the same six neighbours as hexagons) while hexMix is 0, else as hexagons. `foodAsSprites`: aerial sprites show the food, so the ground
   * paints none.
   */
  draw(k: FieldCtx, show: GroundShow, win: CellWindow, hexMix: number, foodAsSprites: boolean): void {
    const { m } = k;
    const { rx0, rx1, ry0, ry1 } = win;
    const endless = m.endless === true;
    for (let cy = ry0 >> 6; cy <= ry1 >> 6; cy++)
      for (let cx = rx0 >> 6; cx <= rx1 >> 6; cx++) {
        const rc = chunkOf(endless, m.rock, cx, cy);
        if (!rc) {
          // A chunk the game has not made (or has since freed) has no canvas: nothing here makes it, and a canvas of one it let go is dropped.
          if (endless) this.chunks.delete(`${cx},${cy}`);
          continue;
        }
        const cc = this.chunkCanvas(cx, cy);
        this.paintChunk(k, show, cx, cy, cc, rc, foodAsSprites);
        if (hexMix > 0) continue;
        this.layBricks(k, win, cx, cy, cc);
      }
    if (hexMix > 0) this.drawHexes(k, win, hexMix);
    if (endless) this.evict(win);
  }

  /**
   * Drop the canvases of chunks more than `margin` chunks beyond the cells in view (an endless plane's; E5.4). A chunk painted again later starts from
   * nothing, as a first paint does. Returns how many were dropped.
   */
  evict(win: CellWindow, margin = EVICT_MARGIN): number {
    const x0 = (win.rx0 >> 6) - margin;
    const x1 = (win.rx1 >> 6) + margin;
    const y0 = (win.ry0 >> 6) - margin;
    const y1 = (win.ry1 >> 6) + margin;
    let dropped = 0;
    for (const [key, cc] of this.chunks)
      if (cc.cx < x0 || cc.cx > x1 || cc.cy < y0 || cc.cy > y1) {
        this.chunks.delete(key);
        dropped++;
      }
    return dropped;
  }

  /** Chunk (cx, cy)'s rows laid on the canvas as bricks: a strip a cell high for each row, odd rows shifted half a cell. */
  private layBricks(k: FieldCtx, win: CellWindow, cx: number, cy: number, cc: ChunkCanvas): void {
    const { ctx, c, v } = k;
    const ly0 = Math.max(0, win.ry0 - cy * CHUNK);
    const ly1 = Math.min(CHUNK - 1, win.ry1 - cy * CHUNK);
    for (let ly = ly0; ly <= ly1; ly++) {
      const y = cy * CHUNK + ly;
      const [ax, ay] = toScreen(c, v, cx * CHUNK + 0.5 * (y & 1), y * R);
      const [bx, by] = toScreen(c, v, (cx + 1) * CHUNK + 0.5 * (y & 1), (y + 1) * R);
      const dx = Math.round(ax);
      const dy = Math.round(ay);
      ctx.drawImage(cc.canvas, 0, ly, CHUNK, 1, dx, dy, Math.round(bx) - dx, Math.round(by) - dy);
    }
  }

  /** Paint chunk colours: rock/soil, trails, and legacy food washes unless aerial sprites will show the food. */
  paintChunk(k: FieldCtx, show: GroundShow, cx: number, cy: number, c: ChunkCanvas, rc: Uint8Array, foodAsSprites: boolean): void {
    const { theme, m, world, smellAll, strip } = k;
    const [gx0, gw, gh] = [m.x0, m.size.w, m.size.h];
    // An endless plane's rows run from -gh/2 (camera.ts reachOf), not from 0, and its layers are read with `peek` (no chunk is made to be painted).
    const endless = m.endless === true;
    const [yLo, yHi] = endless ? [-gh / 2, gh / 2] : [0, gh];
    const rock = groundRock(k),
      soil = groundSoil(k),
      spoil = groundSpoil(k);
    // Under the fog (docs/fog-of-war.md §5.1) a chunk paints from what was last sensed: unexplored cells as fog, remembered ones from their
    // snapshots, dimmed, and the cells an observer senses now from the truth (the snapshot is written as they are sensed).
    const fog = k.fog;
    // The strip chunk of the side view is painted from the plane under the line, so it paints even where the curtain's own chunk is unknown.
    const stripChunk = k.strip && cy === STRIP >> 6;
    const fogV = fog ? (fog.view(k.lv, cx, cy) ?? (stripChunk ? EMPTY_VIEW : undefined)) : undefined;
    if (fog && !fogV) {
      if (this.tiles.needsPaint(c, "fog-unknown", [])) {
        const fogPx = fogRgb(theme);
        for (let i = 0; i < CHUNK * CHUNK; i++) setPx(c.img.data, i * 4, fogPx, 255);
        c.ctx.putImageData(c.img, 0, 0);
        c.version++;
      }
      return;
    }
    if (fogV) rc = (fogV.snap(SNAP.rock) as Uint8Array | undefined) ?? rc;
    const fc = fogV ? (fogV.snap(SNAP.food) as Float32Array | undefined) : chunkOf(endless, m.food, cx, cy);
    // What hosts sensed here and when: no host near lately, no scent shown (PRD §65). A chunk whose newest mark is SENSED_FADE old shows nothing, so its
    // per-cell scent reads are skipped (ja-23io): the same pixels, since every cell's sight is 0 (and GRACE is under SENSED_FADE, so the fog's live test fails too).
    const now = k.sensedNow;
    let sensedC = k.sensedLayer?.chunk(cx, cy);
    if (sensedC) {
      const newest = k.sensedNewest?.(cx, cy);
      if (newest !== undefined && now - newest >= SENSED_FADE) sensedC = undefined;
    }
    // Every colony's food and home trails and alarm here, read only where something was sensed.
    const trailC: { food: Float32Array | undefined; home: Float32Array | undefined; tone: [number, number, number] }[] = [];
    const alarmC: Float32Array[] = [];
    const qc = fogV ? (fogV.snap(SNAP.quality) as Float32Array | undefined) : chunkOf(endless, m.quality, cx, cy);
    if (sensedC || smellAll) {
      for (const t of k.trails) {
        const food = t.food.chunk(cx, cy);
        const home = t.home.chunk(cx, cy);
        if (food || home)
          trailC.push({
            food,
            home,
            tone: smellAll ? odourRgb(theme.inkRgb, theme.warnRgb, t.odour) : (theme.trail as [number, number, number]),
          });
      }
      for (const a of k.alarms) {
        const ac = a.chunk(cx, cy);
        if (ac) alarmC.push(ac);
      }
    }
    const sporeC = k.spores.chunk(cx, cy);
    // One world's plane: the mound, a height field of spoil (oneWorld.ts), washed in by its height.
    const spoilC = fogV ? (fogV.snap(SNAP.spoil) as Uint16Array | undefined) : chunkOf(endless, m.spoil, cx, cy);
    const chambers = m.chambers;
    const chamberC = fogV
      ? (fogV.snap(SNAP.chamber) as Int16Array | Uint8Array | Uint16Array | undefined)
      : chunkOf(endless, chambers?.cell, cx, cy); // nest slice 2: dug chambers, a faint wash; slice 3: tinted by role
    const [fr, fg, fb] = theme.accentRgb;
    const px = c.img.data;
    const x0 = cx * CHUNK;
    const y0 = cy * CHUNK;
    // The strip also depends on projected plane cells; keep its existing live repaint path.
    if (!(strip && world && cy === STRIP >> 6)) {
      const tag = JSON.stringify([
        foodAsSprites,
        !!fog,
        show.food,
        show.home,
        smellAll,
        gx0,
        gw,
        gh,
        // The clock matters only where it scales a scent (a trail or alarm here) or decides the fog's live ground: a chunk with neither does not repaint as time passes.
        sensedC && !smellAll && (fog || trailC.length > 0 || alarmC.length > 0) ? now : 0,
        chambers?.list.map((ch) => ch.role),
        trailC.map((t) => t.tone),
      ]);
      if (
        !this.tiles.needsPaint(c, tag, [
          rc,
          fc,
          qc,
          fogV?.bits,
          sensedC,
          sporeC,
          spoilC,
          chamberC,
          ...trailC.flatMap((t) => [t.food, t.home]),
          ...alarmC,
        ])
      ) {
        this.hits++;
        return;
      }
    }
    this.paints++;
    c.version++;
    for (let ly = 0; ly < CHUNK; ly++) {
      for (let lx = 0; lx < CHUNK; lx++) {
        const i = ly * CHUNK + lx;
        const o = i * 4;
        if (x0 + lx < gx0 || x0 + lx >= gx0 + gw || y0 + ly >= yHi || y0 + ly < yLo) {
          px[o + 3] = 0; // past the edge of the map
          continue;
        }
        if (rc[i]) {
          const solid = rc[i] === SOIL ? soil : rc[i] === AIR ? theme.sky : rock;
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
          px[o] = spoil[0];
          px[o + 1] = spoil[1];
          px[o + 2] = spoil[2];
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
          // A remembered chamber's role is not what it is now: its tint is the plain one until an observer senses it again.
          const role = fogV && !(sensedC && now - sensedC[i]! <= GRACE) ? "none" : (chambers!.list[chamberC[i] - 1]?.role ?? "none");
          const tint = ROLE_RGB[role] ?? theme.chamber;
          px[o] = tint[0];
          px[o + 1] = tint[1];
          px[o + 2] = tint[2];
          px[o + 3] = role === "none" ? 55 : 70;
        } else px[o + 3] = 0;
      }
    }
    // The fog's last pass: what was never sensed is fog, and what was sensed but is not now is dimmed towards it.
    if (fog && fogV) {
      const fogPx = fogRgb(theme);
      for (let ly = 0; ly < CHUNK; ly++)
        for (let lx = 0; lx < CHUNK; lx++) {
          const i = ly * CHUNK + lx;
          const o = i * 4;
          if (!(fogV.bits[i >> 5]! & (1 << (i & 31)))) setPx(px, o, fogPx, 255);
          else if (!(sensedC && now - sensedC[i]! <= GRACE)) dimPx(px, o, fogPx);
        }
    }
    // One world's side view: the strip and the mound's cut over it, drawn from the plane under the line (the curtain
    // stores neither: one-world §8 item 6). A chunk's width of columns, each the strip and its cut's height.
    if (strip && cy === STRIP >> 6) {
      const line = lineOfLayer(world, k.lv);
      const plane = world.plane;
      const ly = STRIP - y0;
      for (let lx = 0; lx < CHUNK; lx++) {
        if (!cellAt(line, x0 + lx)) continue;
        const qx = CELL[0];
        const qy = CELL[1];
        let o = (ly * CHUNK + lx) * 4;
        // Under the fog the strip is the plane as last sensed there: fog where nothing was, dimmed where nobody senses it now.
        const pg = fog ? planeGround(k, qx, qy) : null;
        const food = pg ? pg.food : plane.food.get(qx, qy);
        if (pg?.state === UNKNOWN) {
          setPx(px, o, fogRgb(theme), 255);
          continue;
        }
        if ((pg ? pg.rock : rockAt(plane, qx, qy)) !== OPEN) {
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
        const dim = pg !== null && pg.state !== LIVE;
        if (dim) dimPx(px, o, fogRgb(theme));
        const cut = Math.min(CUT_MAX, pg ? pg.spoil : (plane.spoil?.get(qx, qy) ?? 0));
        for (let up = 1; up <= cut; up++) {
          o = ((ly - up) * CHUNK + lx) * 4;
          px[o] = theme.spoil[0];
          px[o + 1] = theme.spoil[1];
          px[o + 2] = theme.spoil[2];
          px[o + 3] = 255;
          if (dim) dimPx(px, o, fogRgb(theme));
        }
      }
    }
    c.ctx.putImageData(c.img, 0, 0);
  }

  /**
   * Up close: the cells in view as true hexagons. Each cell's colour is its pixel in its chunk's colour
   * buffer (painted this frame), laid over the paper; soil (the commonest, underground) is the
   * background, and the rest are batched into one path per colour, so a frame is a few dozen fills.
   */
  drawHexes(k: FieldCtx, win: CellWindow, hexMix: number): void {
    const { ctx, c, v, m, lv, smellAll, ext } = k;
    const { rx0, rx1, ry0, ry1 } = win;
    const paper = groundPaper(k);
    const spoil = groundSpoil(k);
    const pelletAlpha = !smellAll && lv === PLANE ? Math.max(0, Math.min(1, (c.zoom / (v.dpr ?? 1) - HEX_ZOOM) / 8)) : 0;
    const moundTints = new Map<number, Path2D>();
    const pellets = new Map<string, DirtBall>();
    const bg = paper;
    const bgKey = (bg[0] << 16) | (bg[1] << 8) | bg[2];
    ctx.fillStyle = `rgb(${bg[0]},${bg[1]},${bg[2]})`;
    const endless = m.endless === true;
    if (endless)
      ctx.fillRect(0, 0, v.w, v.h); // an endless plane has no edge to stop the ground's paper at (its rows start at -h/2, not 0)
    else {
      const [ax, ay] = toScreen(c, v, m.x0, 0);
      const [bx, by] = toScreen(c, v, m.x0 + ext.w, ext.h);
      ctx.fillRect(ax, ay, bx - ax, by - ay);
    }
    this.paths.clear();
    this.edges.clear();
    // Under the fog most cells in view are fog or remembered open ground: one strip a row lays them (a hexagon each, a path op a vertex, cost
    // the phone its frame rate); hexagons then draw only the cells with something on them.
    const fogPx = k.fog ? fogRgb(k.theme) : null;
    if (fogPx)
      for (let cy = ry0 >> 6; cy <= ry1 >> 6; cy++)
        for (let cx = rx0 >> 6; cx <= rx1 >> 6; cx++) {
          const cc = this.chunks.get(`${cx},${cy}`);
          if (cc) this.layBricks(k, win, cx, cy, cc);
        }
    // At the distant end these six vertices describe the same staggered rectangles as the chunk pass.
    const x = c.zoom * 0.5 * (1 + 0.04 * hexMix);
    const shoulder = c.zoom * (R / 2 + (SIDE * 0.52 - R / 2) * hexMix);
    const tip = c.zoom * (R / 2 + (SIDE * 1.04 - R / 2) * hexMix);
    const [c0, c1, c2, c3, c4, c5] = [x, 0, -x, -x, 0, x];
    const [s0, s1, s2, s3, s4, s5] = [shoulder, tip, shoulder, -shoulder, -tip, -shoulder];
    // Under the fog: the colour of every cell in view and whether the strips above already show it, for the cells on an edge (below).
    const gw = rx1 - rx0 + 1;
    let keys: Int32Array | null = null;
    let plains: Uint8Array | null = null;
    if (fogPx) {
      const n = gw * (ry1 - ry0 + 1);
      if (this.keys.length < n) {
        this.keys = new Int32Array(n);
        this.plains = new Uint8Array(n);
      }
      keys = this.keys.fill(-1, 0, n);
      plains = this.plains.fill(0, 0, n);
    }
    const ox = v.w / 2 - c.x * c.zoom;
    const oy = v.h / 2 - c.y * c.zoom;
    for (let y = ry0; y <= ry1; y++) {
      const cy = y >> 6;
      const ly = y & 63;
      const sy = (y + 0.5) * R * c.zoom + oy;
      const shift = 0.5 + 0.5 * (y & 1);
      let chunkX = NO_CHUNK; // a chunk column can be −1 (one world's curtain): none is a value no chunk takes
      let data: Uint8ClampedArray | null = null;
      let terrain: Uint8Array | undefined;
      let heaps: Uint16Array | undefined;
      for (let x = rx0; x <= rx1; x++) {
        if (x >> 6 !== chunkX) {
          chunkX = x >> 6;
          data = this.chunks.get(`${chunkX},${cy}`)?.img.data ?? null;
          // Under the fog the pellets of a mound are the ones last sensed, and none where nothing was.
          const fv = k.fog?.view(lv, chunkX, cy);
          terrain = !pelletAlpha
            ? undefined
            : k.fog
              ? (fv?.snap(SNAP.rock) as Uint8Array | undefined)
              : chunkOf(endless, m.rock, chunkX, cy);
          heaps = !pelletAlpha
            ? undefined
            : k.fog
              ? (fv?.snap(SNAP.spoil) as Uint16Array | undefined)
              : chunkOf(endless, m.spoil, chunkX, cy);
        }
        if (!data) continue;
        const index = (ly << 6) | (x & 63);
        const o = index * 4;
        // Leave scent, food and chamber washes in their own colours over the shared ground palette.
        const kind = terrain?.[index];
        const heap = heaps?.[index] ?? 0;
        if (heap > 0 && (kind ?? OPEN) === OPEN) {
          // Shared world positions let the flat pellets cross hex edges and stack in the same order as voxels.
          for (const ball of moundBalls(heap, cellKey(x, y)))
            if (!pellets.has(ball.id)) pellets.set(ball.id, { ...ball, x: ball.x + x + shift, y: ball.y + (y + 0.5) * R });
        }
        // The spoil wash fades out as the overhead pellets appear.
        const spoilWash = heap > 0 && data[o] === spoil[0] && data[o + 1] === spoil[1] && data[o + 2] === spoil[2];
        const opacity = Math.round((data[o + 3] / 255) * 15) / 15;
        const a = spoilWash ? opacity * (1 - pelletAlpha * pelletAlpha) : opacity;
        const r = Math.round(data[o] * a + paper[0] * (1 - a));
        const g = Math.round(data[o + 1] * a + paper[1] * (1 - a));
        const b = Math.round(data[o + 2] * a + paper[2] * (1 - a));
        const key = (r << 16) | (g << 8) | b;
        // Under the fog a cell that is fog (opaque) or remembered open ground (the fog at 70) is the strip already laid, as open ground is the paper.
        const plain = key === bgKey || (fogPx !== null && fogCell(data, o, fogPx));
        if (keys) {
          const gi = (y - ry0) * gw + (x - rx0);
          keys[gi] = key;
          plains![gi] = plain ? 1 : 0;
        }
        if (plain) continue;
        const paint = spoilWash ? moundTints : this.paths;
        let path = paint.get(key);
        if (!path) {
          path = this.env.newPath();
          paint.set(key, path);
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
    // The strips laid under the fog are brick-shaped: a cell they show beside a cell of another colour (the edge of the explored ground, of what is live
    // now) is a hexagon too, so the edge is hexagonal as everywhere else. Only those cells, so the count follows the edges and not the area.
    if (keys && plains)
      for (let y = ry0; y <= ry1; y++) {
        const shift = 0.5 + 0.5 * (y & 1);
        const up = y & 1 ? 1 : 0; // the neighbours in the rows above and below: x - 1 + up and x + up
        for (let x = rx0; x <= rx1; x++) {
          const gi = (y - ry0) * gw + (x - rx0);
          const key = keys[gi]!;
          if (key < 0 || !plains[gi]) continue;
          let edge = false;
          for (let n = 0; n < 6 && !edge; n++) {
            // the six neighbours: x - 1 and x + 1 in the row, and in the rows above and below x - 1 + up and x + up
            const nx = x + (n < 2 ? (n ? 1 : -1) : n & 1 ? up : up - 1);
            const ny = y + (n < 2 ? 0 : n < 4 ? -1 : 1);
            if (nx < rx0 || nx > rx1 || ny < ry0 || ny > ry1) continue;
            const nk = keys[(ny - ry0) * gw + (nx - rx0)]!;
            if (nk >= 0 && nk !== key) edge = true;
          }
          if (!edge) continue;
          let path = this.edges.get(key);
          if (!path) {
            path = this.env.newPath();
            this.edges.set(key, path);
          }
          const sx = (x + shift) * c.zoom + ox;
          const sy = (y + 0.5) * R * c.zoom + oy;
          path.moveTo(sx + c0, sy + s0);
          path.lineTo(sx + c1, sy + s1);
          path.lineTo(sx + c2, sy + s2);
          path.lineTo(sx + c3, sy + s3);
          path.lineTo(sx + c4, sy + s4);
          path.lineTo(sx + c5, sy + s5);
          path.closePath();
        }
      }
    for (const [key, path] of this.edges) {
      ctx.fillStyle = `rgb(${key >> 16},${(key >> 8) & 255},${key & 255})`;
      ctx.fill(path);
    }
    // Keep the returning brown tint behind the fading pellets so both are visible.
    for (const [key, path] of moundTints) {
      ctx.fillStyle = `rgb(${key >> 16},${(key >> 8) & 255},${key & 255})`;
      ctx.fill(path);
    }
    if (pellets.size) {
      ctx.save();
      ctx.globalAlpha = pelletAlpha;
      for (const ball of [...pellets.values()].sort((a, b) => a.z - b.z)) {
        ctx.fillStyle = INSPECTION_GROUND.dugSoil[ball.grain];
        ctx.beginPath();
        ctx.arc(ball.x * c.zoom + ox, ball.y * c.zoom + oy, ball.radius * c.zoom, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
    for (const [key, path] of this.paths) {
      ctx.fillStyle = `rgb(${key >> 16},${(key >> 8) & 255},${key & 255})`;
      ctx.fill(path);
    }
  }
}
