// The minimap (ja-fnd.6.3.19, docs/field-split.md): a small picture of the whole shown map in a corner of the field, with the rectangle of what the
// camera sees on it. Its own state: a canvas of its own (2 world units a pixel), the buffer painted into it and the clock of its last repaint (twice
// a second at most). A class, since it holds that; the canvas comes from FieldEnv.newCanvas and the clock from FieldEnv.now. Plain TypeScript.
//
// On an endless plane (E5.3, ja-qpv.4.3, docs/endless-world.md §8) it is instead a WINDOW of MINI_CHUNKS_W x MINI_CHUNKS_H chunks round the camera
// (camera.ts miniFrame: a pure function of the camera, so the picture, the camera's rectangle and a click agree), 4 world units a pixel, in a canvas
// of that fixed size whatever the plane's. It reads each layer with `peek`, never `get`: a chunk the game has not made is drawn as fog and the
// minimap makes none. The window moves a chunk at a time with the camera; between two repaints the last picture is shifted to the new window (a
// chunk is a whole number of pixels), so it is never more than half a second stale but never mislaid. Nests of the lines beyond its edge are small
// arrows on its frame (`arrowOn`).

import {
  CELL,
  CHUNK,
  CHUNK_BITS,
  INFECTED,
  PLANE,
  SOIL,
  AIR,
  SPORE_FULL,
  SPORE_SHOWN,
  cellOf,
  centreX,
  centreY,
  type Colony,
} from "../../colony/index.ts";
import { isZoomedIn, miniFrame, minimapRect, type Extent, type Reach } from "../camera.ts";
import { holeOwner } from "../lens.ts";
import { nestRgb } from "./colour.ts";
import type { FieldCtx } from "./ctx.ts";
import { SNAP } from "../fog/sources.ts";
import { UNKNOWN, LIVE } from "../fog/knowledge.ts";
import { dimPx, fogRgb } from "./fogCull.ts";
import { stripAt } from "./ground.ts";
import type { FieldEnv } from "./env.ts";

/** How often the picture is painted again while it shows, in milliseconds. */
export const MINIMAP_EVERY_MS = 500;
/** World units a pixel of the endless window (a bounded map's picture is 2 a pixel): 16 x 12 chunks are 256 x 167 pixels, about the work of a 512-cell map. */
export const WINDOW_UNITS_PX = 4;
/** The view's own box, in world units: what the camera sees. */
export interface Seen {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/**
 * Where on the frame of `win` an arrow for the world point (x, y) beyond its edge goes, and which way it points: the point where the line from the
 * window's middle to (x, y) crosses the frame (so the arrow is clamped to the frame, on the side the nest lies), and that line's angle (radians, y down).
 * null for a point inside the window: it is on the picture.
 */
export function arrowOn(win: Reach, x: number, y: number): { x: number; y: number; angle: number } | null {
  if (x >= win.x0 && x < win.x0 + win.w && y >= win.y0 && y < win.y0 + win.h) return null;
  const mx = win.x0 + win.w / 2;
  const my = win.y0 + win.h / 2;
  const dx = x - mx;
  const dy = y - my;
  const t = Math.min(dx === 0 ? Infinity : win.w / 2 / Math.abs(dx), dy === 0 ? Infinity : win.h / 2 / Math.abs(dy));
  return { x: mx + dx * t, y: my + dy * t, angle: Math.atan2(dy, dx) };
}

export class Minimap {
  private readonly env: FieldEnv;
  private readonly canvas: HTMLCanvasElement;
  private readonly cctx: CanvasRenderingContext2D;
  private img: ImageData;
  /** when it was last painted, on the env's clock; -Infinity: not yet, or its inputs changed */
  private at = -Infinity;
  /** endless: the window the picture was last painted for (the camera may have moved on since, by up to half a second) */
  private painted: Reach | null = null;

  constructor(env: FieldEnv) {
    this.env = env;
    this.canvas = env.newCanvas(1, 1);
    this.cctx = this.canvas.getContext("2d")!;
    this.img = this.cctx.createImageData(1, 1);
  }

  /** The shown map is another, or has grown: a canvas of 2 world units a pixel, painted afresh next time. */
  resize(ext: Extent): void {
    // An endless plane's canvas is the window's, the same whatever the plane's nominal box (a picture of that would be 2M cells wide).
    const win = ext.endless ? miniFrame(ext, { x: 0, y: 0 }) : ext;
    const step = ext.endless ? WINDOW_UNITS_PX : 2;
    this.canvas.width = Math.ceil(win.w / step);
    this.canvas.height = Math.ceil(win.h / step);
    this.painted = null;
    this.img = this.cctx.createImageData(this.canvas.width, this.canvas.height);
    this.at = -Infinity;
  }

  /** The theme changed: paint it again next time it shows. */
  invalidate(): void {
    this.at = -Infinity;
  }

  /**
   * The picture: each pixel the cell under its centre (food, rock, soil or open ground), washed with the fungus's colour where it has spores the
   * field would draw; ants as dots, infected ones in the fungus's colour (ja-hcq).
   */
  paint(k: FieldCtx): void {
    if (k.ext.endless) return this.paintWindow(k, k.miniWin ?? miniFrame(k.ext, k.c));
    const { theme, m, colonies, lv, strip, fog } = k;
    const [gx0, gw, gh] = [m.x0, m.size.w, m.size.h];
    const px = this.img.data;
    const food = theme.accentRgb;
    const spore = theme.sporeRgb;
    // Infected ants: the spore colour halfway to ink, so a host stands out on the spore wash as on bare ground, in
    // either theme (ink is light in dark mode) (ja-25sb).
    const host = [0, 1, 2].map((j) => Math.round((spore[j]! + theme.inkRgb[j]!) / 2)) as [number, number, number];
    const fogPx = fogRgb(theme);
    for (let my = 0; my < this.canvas.height; my++)
      for (let mx = 0; mx < this.canvas.width; mx++) {
        cellOf(gx0 + mx * 2 + 1, my * 2 + 1);
        const x = CELL[0];
        const y = CELL[1];
        const off = x < gx0 || y < 0 || x >= gx0 + gw || y >= gh;
        const o = (my * this.canvas.width + mx) * 4;
        // Under the fog a pixel is what was last sensed there: fog where nothing was, dimmed where nobody senses it now (docs/fog-of-war.md §5.1).
        const fs = fog && !off ? fog.state(lv, x, y) : LIVE;
        // On the side view the pixels of the line's columns are the plane's (stripAt, which fogs its own); every other unexplored pixel is fog.
        const cut = strip && !off ? stripAt(k, x, y) : null;
        if (fs === UNKNOWN && !cut) {
          px[o] = fogPx[0];
          px[o + 1] = fogPx[1];
          px[o + 2] = fogPx[2];
          px[o + 3] = 255;
          continue;
        }
        const t = off ? 1 : fog ? (fog.snapshot(lv, SNAP.rock, x, y) ?? 0) : m.rock.get(x, y);
        const fv = off ? 0 : fog ? (fog.snapshot(lv, SNAP.food, x, y) ?? 0) : m.food.get(x, y);
        const heap = !off && t === 0 && m.spoil ? (fog ? (fog.snapshot(lv, SNAP.spoil, x, y) ?? 0) : m.spoil.get(x, y)) : 0;
        const c =
          cut ??
          (fv > 0 ? food : t === SOIL ? theme.soil : t === AIR ? theme.sky : t ? theme.rock : heap > 0 ? theme.spoil : theme.paperRgb);
        // Spores over the ground, as strongly as the field draws them (a pixel is too small for its fading in alpha).
        const sv = off || cut ? 0 : k.spores.get(x, y);
        const a = sv >= SPORE_SHOWN ? 0.35 + 0.5 * Math.min(1, sv / SPORE_FULL) : 0;
        px[o] = Math.round(c[0] + (spore[0] - c[0]) * a);
        px[o + 1] = Math.round(c[1] + (spore[1] - c[1]) * a);
        px[o + 2] = Math.round(c[2] + (spore[2] - c[2]) * a);
        px[o + 3] = 255;
        if (fs !== LIVE && !cut) dimPx(px, o, fogPx);
      }
    // Every colony's ants, then the infected over them, so a healthy nestmate on the same pixel doesn't hide one.
    for (const sick of [false, true])
      for (let n = colonies.length - 1; n >= 0; n--) {
        const col = colonies[n] as Colony;
        // By the colony's odour, as the field colours its ants and nests: no colony by its index (PRD §65).
        const tone = sick ? host : nestRgb(theme.inkRgb, theme.warnRgb, col);
        for (let i = 0; i < col.n; i++) {
          if (!col.alive[i] || col.layer[i] !== lv || col.load[i] >= INFECTED !== sick) continue;
          const mx = Math.floor((col.x[i] - gx0) / 2);
          const my = Math.floor(col.y[i] / 2);
          if (mx < 0 || my < 0 || mx >= this.canvas.width || my >= this.canvas.height) continue;
          if (fog && fog.stateAt(lv, col.x[i]!, col.y[i]!) !== LIVE) continue; // ants only where an observer senses them now
          const o = (my * this.canvas.width + mx) * 4;
          px[o] = tone[0];
          px[o + 1] = tone[1];
          px[o + 2] = tone[2];
        }
      }
    this.cctx.putImageData(this.img, 0, 0);
  }

  /** The endless plane's picture: the window `win` (chunks round the camera), each pixel the cell under its centre, read with `peek` so no chunk is made. */
  private paintWindow(k: FieldCtx, win: Reach): void {
    const { theme, m, colonies, lv, fog } = k;
    const step = WINDOW_UNITS_PX;
    const [W, H] = [Math.ceil(win.w / step), Math.ceil(win.h / step)];
    if (this.canvas.width !== W || this.canvas.height !== H) this.resize(k.ext);
    const px = this.img.data;
    const food = theme.accentRgb;
    const spore = theme.sporeRgb;
    const host = [0, 1, 2].map((j) => Math.round((spore[j]! + theme.inkRgb[j]!) / 2)) as [number, number, number];
    const fogPx = fogRgb(theme);
    const mask = CHUNK - 1;
    // The chunks of the last cell's: a run of pixels along a row stays in one chunk for 16 of them.
    let [ckx, cky] = [NaN, NaN];
    let rockC: Uint8Array | undefined;
    let foodC: Float32Array | undefined;
    let spoilC: ArrayLike<number> | undefined;
    let sporeC: Float32Array | undefined;
    for (let my = 0; my < H; my++)
      for (let mx = 0; mx < W; mx++) {
        cellOf(win.x0 + mx * step + step / 2, win.y0 + my * step + step / 2);
        const x = CELL[0];
        const y = CELL[1];
        const o = (my * W + mx) * 4;
        const [cx, cy] = [x >> CHUNK_BITS, y >> CHUNK_BITS];
        if (cx !== ckx || cy !== cky) {
          [ckx, cky] = [cx, cy];
          // past the nominal box (+-32,768 chunks) chunk keys alias (`ja-qpv.10`): the window there is unmade ground, as the camera's reach holds it
          const inBox = cx >= -32768 && cx < 32768 && cy >= -32768 && cy < 32768;
          rockC = inBox ? m.rock.peek(cx, cy) : undefined;
          foodC = inBox ? m.food.peek(cx, cy) : undefined;
          spoilC = inBox ? m.spoil?.peek(cx, cy) : undefined;
          sporeC = inBox ? k.spores.peek(cx, cy) : undefined;
        }
        const at = ((y & mask) << CHUNK_BITS) | (x & mask);
        // Ground nobody has made (and under the fog, ground nobody has sensed) is fog; sensed ground that nobody senses now is dimmed.
        const fs = fog ? fog.state(lv, x, y) : rockC ? LIVE : UNKNOWN;
        if (fs === UNKNOWN) {
          px[o] = fogPx[0];
          px[o + 1] = fogPx[1];
          px[o + 2] = fogPx[2];
          px[o + 3] = 255;
          continue;
        }
        const t = fog ? (fog.snapshot(lv, SNAP.rock, x, y) ?? 0) : (rockC?.[at] ?? 0);
        const fv = fog ? (fog.snapshot(lv, SNAP.food, x, y) ?? 0) : (foodC?.[at] ?? 0);
        const heap = t === 0 && m.spoil ? (fog ? (fog.snapshot(lv, SNAP.spoil, x, y) ?? 0) : (spoilC?.[at] ?? 0)) : 0;
        const c =
          fv > 0 ? food : t === SOIL ? theme.soil : t === AIR ? theme.sky : t ? theme.rock : heap > 0 ? theme.spoil : theme.paperRgb;
        const sv = sporeC?.[at] ?? 0;
        const a = sv >= SPORE_SHOWN ? 0.35 + 0.5 * Math.min(1, sv / SPORE_FULL) : 0;
        px[o] = Math.round(c[0] + (spore[0] - c[0]) * a);
        px[o + 1] = Math.round(c[1] + (spore[1] - c[1]) * a);
        px[o + 2] = Math.round(c[2] + (spore[2] - c[2]) * a);
        px[o + 3] = 255;
        if (fs !== LIVE) dimPx(px, o, fogPx);
      }
    for (const sick of [false, true])
      for (let n = colonies.length - 1; n >= 0; n--) {
        const col = colonies[n] as Colony;
        const tone = sick ? host : nestRgb(theme.inkRgb, theme.warnRgb, col);
        for (let i = 0; i < col.n; i++) {
          if (!col.alive[i] || col.layer[i] !== lv || col.load[i] >= INFECTED !== sick) continue;
          const mx = Math.floor((col.x[i]! - win.x0) / step);
          const my = Math.floor((col.y[i]! - win.y0) / step);
          if (mx < 0 || my < 0 || mx >= W || my >= H) continue;
          if (fog && fog.stateAt(lv, col.x[i]!, col.y[i]!) !== LIVE) continue;
          const o = (my * W + mx) * 4;
          px[o] = tone[0];
          px[o + 1] = tone[1];
          px[o + 2] = tone[2];
        }
      }
    this.cctx.putImageData(this.img, 0, 0);
    this.painted = win;
  }

  /**
   * The endless plane's stage: the window's picture in the corner (painted again when half a second old; between, the old picture is shifted to the
   * window the camera is in now), the frame, the camera's rectangle clipped to it, and an arrow on the frame for each nest of the lines beyond its
   * edge: only the holes the page draws (the fungus has sensed them, under the fog).
   */
  private drawWindow(k: FieldCtx, seen: Seen): void {
    const { ctx, theme, c, v, d, fog, world } = k;
    const win = k.miniWin ?? miniFrame(k.ext, c);
    const now = this.env.now();
    if (now - this.at > MINIMAP_EVERY_MS) {
      this.paint(k);
      this.at = now;
    }
    const r = minimapRect(win, v, d);
    const scale = r.w / win.w;
    const p = this.painted ?? win;
    ctx.globalAlpha = 0.92;
    if (p.x0 === win.x0 && p.y0 === win.y0) ctx.drawImage(this.canvas, r.x, r.y, r.w, r.h);
    else {
      // The camera crossed a chunk since the last paint: the old picture, moved by whole chunks, under the new frame; what it does not cover is paper.
      ctx.save();
      ctx.beginPath();
      ctx.rect(r.x, r.y, r.w, r.h);
      ctx.clip();
      ctx.fillStyle = theme.paper;
      ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.drawImage(this.canvas, r.x + (p.x0 - win.x0) * scale, r.y + (p.y0 - win.y0) * scale, r.w, r.h);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
    ctx.strokeStyle = theme.line;
    ctx.lineWidth = d;
    ctx.strokeRect(r.x, r.y, r.w, r.h);
    ctx.strokeStyle = theme.accent;
    ctx.lineWidth = 1.5 * d;
    const x0 = Math.max(win.x0, seen.x0);
    const y0 = Math.max(win.y0, seen.y0);
    ctx.strokeRect(
      r.x + (x0 - win.x0) * scale,
      r.y + (y0 - win.y0) * scale,
      Math.max(0, Math.min(win.x0 + win.w, seen.x1) - x0) * scale,
      Math.max(0, Math.min(win.y0 + win.h, seen.y1) - y0) * scale,
    );
    // The nests beyond the edge. A hole's owner colours its arrow as its ants are coloured; a hole nobody owns (a line's end, a site) is ink.
    const a = 4.5 * d;
    for (const h of world.lines.flatMap((wl) => wl.line.holes)) {
      if (fog && fog.state(PLANE, h.x, h.y) === UNKNOWN) continue;
      const arrow = arrowOn(win, centreX(h.x, h.y), centreY(h.y));
      if (!arrow) continue;
      const own = holeOwner(k.colonies, PLANE, h.x, h.y);
      const col = own >= 0 ? k.colonies[own] : undefined;
      const [cr, cg, cb] = col ? nestRgb(theme.inkRgb, theme.warnRgb, col) : theme.inkRgb;
      const [ax, ay] = [r.x + (arrow.x - win.x0) * scale, r.y + (arrow.y - win.y0) * scale];
      const [ux, uy] = [Math.cos(arrow.angle), Math.sin(arrow.angle)];
      ctx.fillStyle = `rgb(${cr}, ${cg}, ${cb})`;
      ctx.beginPath();
      ctx.moveTo(ax + ux * a, ay + uy * a);
      ctx.lineTo(ax - ux * a * 0.4 - uy * a * 0.7, ay - uy * a * 0.4 + ux * a * 0.7);
      ctx.lineTo(ax - ux * a * 0.4 + uy * a * 0.7, ay - uy * a * 0.4 - ux * a * 0.7);
      ctx.closePath();
      ctx.fill();
    }
  }

  /**
   * The last stage of a frame: zoomed in past the whole map (a twentieth over), the picture in the corner (painted again when it is half a second
   * old), a frame round it, and on it the rectangle of what the camera sees (`seen`, in world units).
   */
  draw(k: FieldCtx, seen: Seen): void {
    const { ctx, theme, c, v, d, ext, m } = k;
    if (!isZoomedIn(ext, v, c.zoom)) return;
    if (ext.endless) return this.drawWindow(k, seen);
    const gx0 = m.x0;
    const now = this.env.now();
    if (now - this.at > MINIMAP_EVERY_MS) {
      this.paint(k);
      this.at = now;
    }
    const r = minimapRect(ext, v, d);
    ctx.globalAlpha = 0.92;
    ctx.drawImage(this.canvas, r.x, r.y, r.w, r.h);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = theme.line;
    ctx.lineWidth = d;
    ctx.strokeRect(r.x, r.y, r.w, r.h);
    const scale = r.w / ext.w;
    ctx.strokeStyle = theme.accent;
    ctx.lineWidth = 1.5 * d;
    const x0 = Math.max(gx0, seen.x0);
    const y0 = Math.max(0, seen.y0);
    ctx.strokeRect(
      r.x + (x0 - gx0) * scale,
      r.y + y0 * scale,
      (Math.min(gx0 + ext.w, seen.x1) - x0) * scale,
      (Math.min(ext.h, seen.y1) - y0) * scale,
    );
  }
}
