// The ants stage of the map (ja-fnd.6.3.15, docs/field-split.md): one colony's ants on the shown layer: a stroke (or a sprite) a body, one pass a
// band of odour; the spore dot on an infected ant, fainter for a light load; what each carries (food, soil, a corpse, brood) at its head. A plain
// function over FieldCtx and the values the frame derives once (AntFrame): no React, no DOM, so a Node test can run it on a recording fake
// context. It leaves the 2D context's state as the frame's old inline code did (docs/field-split.md, "the canvas state": the next colony's
// nest stage sets its own widths and alpha, and the strip's ants after the last colony set theirs).

import { BINS, binOf, type Colony, INFECTED } from "../../colony/index.ts";
import { toScreen } from "../camera.ts";
import { decayStage } from "../cadaverVisual.ts";
import { carriedBroodOn } from "../mapCargo.ts";
import { drawNestSprite, type NestSprite } from "../nestSprites.ts";
import { BROOD_RGB } from "../palette.ts";
import { drawResourceSprite, foodKind } from "../resourceSprites.ts";
import { drawWorkerSprite, workerLod } from "../workerSprites.ts";
import { ASLEEP_DIM, colonyAsleep } from "./asleep.ts";
import { odourColour } from "./colour.ts";
import type { FieldCtx } from "./ctx.ts";
import type { NestFrame } from "./nests.ts";
import { HEX_ZOOM } from "./zoom.ts";

/** What the frame derives once for every colony's ants: what the nests stage reads, and half an ant's length and a food crumb's size. */
export interface AntFrame extends NestFrame {
  half: number;
  crumb: number;
}

/** Draw colony `col`'s ants on the shown layer. */
export function drawAnts(fc: FieldCtx, f: AntFrame, col: Colony): void {
  const { ctx, c, v, d, lv, theme, env } = fc;
  const { len, half, crumb, inView, hexes, resourceLod, darkSprites, nestImage, resourceImage } = f;
  const { worker: workerSprites, gait: workerGait, cadaver: cadaverSprites } = fc.sprites;
  const zoom = c.zoom / d;
  ctx.lineCap = "round";
  ctx.lineWidth = Math.max(1, len * 0.3);
  // A colony the game has frozen draws still (no gait) and dimmed; with nothing asleep every value below is what it was.
  const asleep = colonyAsleep(fc, col);
  const dim = asleep ? ASLEEP_DIM : 1;
  ctx.globalAlpha = 0.85 * dim;
  workerGait.update(col);
  // A front-facing curtain worker is the same silhouette as the aerial worker against its walking plane.
  // The surface strip is a separate diagrammatic projection, not another underground population.
  const lod = workerLod(c.zoom, d);
  // One stroke per odour band (most frames: one band per colony).
  let bands = 0;
  for (let i = 0; i < col.n; i++) if (col.alive[i] && col.layer[i] === lv) bands |= 1 << binOf(col.odourAt(i));
  for (let b = 0; b < BINS; b++) {
    if (!(bands & (1 << b))) continue;
    const colour = theme.inkRgb.map((ink, k) => Math.round(ink + ((theme.warnRgb[k] - ink) * b) / (BINS - 1)));
    const sprite = hexes ? workerSprites.get(lod, colour, darkSprites) : null;
    const spriteMix = sprite ? Math.min(1, (zoom - HEX_ZOOM) / 2) : 0;
    ctx.beginPath();
    for (let i = 0; i < col.n; i++) {
      if (!col.alive[i] || col.layer[i] !== lv || binOf(col.odourAt(i)) !== b || !inView(col.x[i], col.y[i])) continue;
      const [x, y] = toScreen(c, v, col.x[i], col.y[i]);
      if (sprite && spriteMix > 0) {
        ctx.globalAlpha = spriteMix * dim;
        const pose = lod === "walk" && !env.reducedMotion() && !asleep ? workerGait.pose(col, i) : 0;
        drawWorkerSprite(ctx, sprite, lod, col.heading[i], pose, x, y, c.zoom);
      }
      if (spriteMix < 1) {
        const hc = Math.cos(col.heading[i]) * half;
        const hs = Math.sin(col.heading[i]) * half;
        ctx.moveTo(x - hc, y - hs);
        ctx.lineTo(x + hc, y + hs);
      }
    }
    ctx.globalAlpha = (1 - spriteMix) * dim;
    ctx.strokeStyle = theme.ink;
    ctx.stroke();
    if (spriteMix < 1) {
      ctx.beginPath();
      for (let i = 0; i < col.n; i++) {
        if (!col.alive[i] || col.layer[i] !== lv || binOf(col.odourAt(i)) !== b || !inView(col.x[i], col.y[i])) continue;
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
  ctx.globalAlpha = dim;
  // Infected ants: a spore-coloured dot on the body, fainter for a light load.
  const dot = Math.max(1.5, len * 0.45);
  ctx.fillStyle = theme.spore;
  for (const [lo, hi, alpha] of [
    [INFECTED, 0.5, 0.55],
    [0.5, 2, 1],
  ] as const) {
    ctx.globalAlpha = alpha * dim;
    for (let i = 0; i < col.n; i++) {
      const l = col.load[i];
      if (!col.alive[i] || l < lo || l >= hi || col.layer[i] !== lv || !inView(col.x[i], col.y[i])) continue;
      const [x, y] = toScreen(c, v, col.x[i], col.y[i]);
      ctx.fillRect(x - dot / 2, y - dot / 2, dot, dot);
    }
  }
  ctx.globalAlpha = dim;
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
    } else ctx.fillRect(x + Math.cos(col.heading[i]) * half - crumb / 2, y + Math.sin(col.heading[i]) * half - crumb / 2, crumb, crumb);
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
  // A sleeping colony drew at its dimmed strength: leave the strength as it was, for the next stage.
  if (asleep) ctx.globalAlpha = 1;
}
