// The nests stage of the map (ja-fnd.6.3.14, docs/field-split.md): what a colony's nest shows on the shown layer: the mound's ring on the side view, the
// nest's ring and entrance, the brood where it lies, the food in its chambers, its dead, the queen, and the alates (drawn again, over the ants,
// by the overlay this returns). A plain function over FieldCtx and a few values the frame derives once (NestFrame): no React, no DOM, so a Node test
// can run it on a recording fake context. It leaves the 2D context's state as the frame's old inline code did (docs/field-split.md, "the canvas
// state": the ants' stage that follows sets its own line cap, width and alpha).

import { type Colony, centreX, centreY, moundRadius, OPEN, rockAt } from "../../colony/index.ts";
import { toScreen } from "../camera.ts";
import { decayStage, visibleCadavers } from "../cadaverVisual.ts";
import { chamberFoodSpots } from "../chamberFood.ts";
import { BROOD_RGB } from "../palette.ts";
import { drawNestSprite, type NestSprite } from "../nestSprites.ts";
import { drawResourceSprite } from "../resourceSprites.ts";
import type { WorkerLod } from "../workerSprites.ts";
import { odourColour, odourRgb } from "./colour.ts";
import type { FieldCtx } from "./ctx.ts";

/** What the frame derives once for every colony's nest (and its ants): the ant length, the view test, the sprite images and the level of detail. */
export interface NestFrame {
  /** an ant's length in device pixels this frame */
  len: number;
  /** whether a world point is in view (a little beyond the edge) */
  inView: (wx: number, wy: number) => boolean;
  /** the map is zoomed in far enough to draw hexagons and sprites */
  hexes: boolean;
  resourceLod: WorkerLod;
  /** the paper is dark, so the sprites take the dark-ground tints */
  darkSprites: boolean;
  /** the nest sprite sheet at this level (untinted), or null while it loads or below the hexagon zoom */
  nestImage: CanvasImageSource | null;
  /** the resource sprite sheet, or null */
  resourceImage: HTMLImageElement | null;
}

/**
 * Draw colony `col`'s nest on the shown layer. Returns the alates' drawer when it has any: the frame calls it again after every colony, so
 * new queens show over the ants (it draws what the first call drew).
 */
export function drawNest(fc: FieldCtx, f: NestFrame, col: Colony): (() => void) | null {
  const { ctx, c, v, d, lv, m, theme } = fc;
  const { len, inView, hexes, resourceLod, darkSprites, nestImage, resourceImage } = f;
  const { cadaver: cadaverSprites, nest: nestSprites } = fc.sprites;
  // The nest on the shown layer (one world: a disc round its hole on the plane; the shaft and chamber in the curtain).
  const nest = (col.layers[lv] ?? col.layers[0]!).nest;
  // The nest's life underground (brood, stores, the queen, alates) shows where the nest is: the curtain in one world.
  const home = lv === col.home;
  const [nx, ny] = toScreen(c, v, nest.x, nest.y);
  // The side view's top-down mound ring; one world's mound is its plane's spoil, painted as ground.
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
    if (k.held >= 0 || (k.layer ?? col.home) !== lv) continue;
    const wx = centreX(k.x, k.y);
    const wy = centreY(k.y);
    if (!inView(wx, wy)) continue;
    const [x, y] = toScreen(c, v, wx, wy);
    if (cadaverSprites.draw(ctx, resourceLod, decayStage(col.time, k.died), x, y, c.zoom, k.heading)) continue;
    if (nestImage) {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(k.heading ?? 0);
      drawNestSprite(ctx, nestImage, resourceLod, "corpse", 0, 0, c.zoom);
      ctx.restore();
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
  const drawAlates = () => {
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
  };
  drawAlates();
  return col.alates.length ? drawAlates : null;
}
