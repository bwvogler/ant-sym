// The minimap (ja-fnd.6.3.19, docs/field-split.md): a small picture of the whole shown map in a corner of the field, with the rectangle of what the
// camera sees on it. Its own state: a canvas of its own (2 world units a pixel), the buffer painted into it and the clock of its last repaint (twice
// a second at most). A class, since it holds that; the canvas comes from FieldEnv.newCanvas and the clock from FieldEnv.now. Plain TypeScript.

import { CELL, INFECTED, SOIL, AIR, SPORE_FULL, SPORE_SHOWN, cellOf, type Colony } from "../../colony/index.ts";
import { isZoomedIn, minimapRect, type Extent } from "../camera.ts";
import { odourRgb } from "./colour.ts";
import type { FieldCtx } from "./ctx.ts";
import { SNAP } from "../fog/sources.ts";
import { UNKNOWN, LIVE } from "../fog/knowledge.ts";
import { dimPx, fogRgb } from "./fogCull.ts";
import { stripAt } from "./ground.ts";
import type { FieldEnv } from "./env.ts";

/** How often the picture is painted again while it shows, in milliseconds. */
export const MINIMAP_EVERY_MS = 500;
/** The view's own box, in world units: what the camera sees. */
export interface Seen {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export class Minimap {
  private readonly env: FieldEnv;
  private readonly canvas: HTMLCanvasElement;
  private readonly cctx: CanvasRenderingContext2D;
  private img: ImageData;
  /** when it was last painted, on the env's clock; -Infinity: not yet, or its inputs changed */
  private at = -Infinity;

  constructor(env: FieldEnv) {
    this.env = env;
    this.canvas = env.newCanvas(1, 1);
    this.cctx = this.canvas.getContext("2d")!;
    this.img = this.cctx.createImageData(1, 1);
  }

  /** The shown map is another, or has grown: a canvas of 2 world units a pixel, painted afresh next time. */
  resize(ext: Extent): void {
    if (ext.endless) return;
    this.canvas.width = Math.ceil(ext.w / 2);
    this.canvas.height = Math.ceil(ext.h / 2);
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
        const tone = sick ? host : odourRgb(theme.inkRgb, theme.warnRgb, col.nestOdour);
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

  /**
   * The last stage of a frame: zoomed in past the whole map (a twentieth over), the picture in the corner (painted again when it is half a second
   * old), a frame round it, and on it the rectangle of what the camera sees (`seen`, in world units).
   */
  draw(k: FieldCtx, seen: Seen): void {
    const { ctx, theme, c, v, d, ext, m } = k;
    // The endless plane's minimap is a window of chunks (E5.3, ja-qpv.4.3); until it is built, none is drawn (a picture of the nominal box is 2M cells wide).
    if (ext.endless || !isZoomedIn(ext, v, c.zoom)) return;
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
