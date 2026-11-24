// The overlay layers of the map (ja-fnd.6.3.5, docs/field-split.md): text and pills, the line over the plane, each hole's name, the bends of the
// side view, the ants on its strip, and the queen's pen. Plain functions over FieldCtx (and FieldInputs for the pen): no React, no DOM. They
// draw in the order the frame calls them and leave the 2D context's state as they found it, except what is noted (see docs/field-split.md,
// "the canvas state").

import {
  CELL,
  cellAt,
  cellOf,
  centreX,
  centreY,
  columnsOver,
  segmentCells,
  STRIP,
  turnAt,
  PLANE,
  lineOfLayer,
  type Transect,
} from "../../colony/index.ts";
import { toScreen, toWorld } from "../camera.ts";
import { holeOwner } from "../lens.ts";
import { badgeParts, nestBadge } from "../badges.ts";
import { LIVE } from "../fog/knowledge.ts";
import { odourColour } from "./colour.ts";
import type { FieldCtx, FieldInputs } from "./ctx.ts";

/** Parts of text side by side in one rounded box, centred on (x, y): a nest's badge, the followed ant's tag (PRD §69.2). */
export function pill(k: FieldCtx, parts: { text: string; fill: string }[], x: number, y: number, px: number): void {
  const { ctx, theme } = k;
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
}

/** Text with a paper halo, centred at screen (x, y). Leaves lineJoin and lineWidth set until the stage ends (FieldRenderer.frame starts each stage from its own stroke state, docs/field-split.md). */
export function label(k: FieldCtx, text: string, x: number, y: number, px: number, alpha = 1, fill = k.theme.ink): void {
  const { ctx, theme } = k;
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
}

/**
 * Columns lo … hi of the line as one dashed stretch through the centres of the plane cells they lie under (P(s)), so it
 * turns where its tiles turn (ja-lp4.17).
 */
export function traceColumns(k: FieldCtx, line: Transect, lo: number, hi: number): void {
  for (let s = lo; s <= hi; s++) {
    cellAt(line, s);
    const [x, y] = toScreen(k.c, k.v, centreX(CELL[0], CELL[1]), centreY(CELL[1]));
    if (s === lo) k.ctx.moveTo(x, y);
    else k.ctx.lineTo(x, y);
  }
}

/** One world's top view: every line, dashed over its tiles through the holes in order, fainter along its margins; a marker at each hole. */
export function drawLine(k: FieldCtx, holes = true): void {
  for (const wl of k.world.lines) drawOneLine(k, wl.line, holes);
}

/** One line of the top view (drawLine's): its dashes, margins and hole markers. */
function drawOneLine(k: FieldCtx, line: Transect, holes: boolean): void {
  const { ctx, theme, c, v, d } = k;
  const last = line.holes.length - 1;
  ctx.strokeStyle = theme.ink;
  ctx.lineWidth = Math.max(1, d * 1.2);
  ctx.setLineDash([6 * d, 5 * d]);
  // The margins: from each end hole to the line's end, P(sMin) and P(sMax).
  ctx.globalAlpha = 0.25;
  ctx.beginPath();
  traceColumns(k, line, line.sMin, line.sHole[0]!);
  traceColumns(k, line, line.sHole[last]!, line.sMax);
  ctx.stroke();
  ctx.globalAlpha = 0.6;
  ctx.beginPath();
  traceColumns(k, line, line.sHole[0]!, line.sHole[last]!);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.globalAlpha = 0.9;
  ctx.fillStyle = theme.ink;
  if (holes)
    for (const h of line.holes) {
      const [x, y] = toScreen(c, v, centreX(h.x, h.y), centreY(h.y));
      ctx.beginPath();
      ctx.arc(x, y, Math.max(2.5 * d, 0.36 * c.zoom), 0, Math.PI * 2);
      ctx.fill();
    }
  ctx.globalAlpha = 1;
}

/** One world's top view: each hole named by the colony whose hole it is (holeCells), "empty hole" if none. */
export function drawHoleNames(k: FieldCtx, inView: (x: number, y: number) => boolean): void {
  const { theme, c, v, d, colonies, fungus } = k;
  const px = Math.round(Math.max(10, Math.min(14, c.zoom * 0.9)) * d);
  for (const h of k.world.lines.flatMap((l) => l.line.holes)) {
    const wx = centreX(h.x, h.y);
    const wy = centreY(h.y);
    if (!inView(wx, wy)) continue;
    const n = holeOwner(colonies, PLANE, h.x, h.y);
    const [x, y] = toScreen(c, v, wx, wy);
    const above = y - Math.max(12 * d, 4.5 * c.zoom);
    const col = n >= 0 ? colonies[n] : undefined;
    if (!col) {
      label(k, "empty hole", x, above, px);
      continue;
    }
    const tone = { ink: theme.ink, spore: theme.spore, warn: theme.warn, dim: theme.fg3 };
    pill(
      k,
      badgeParts(nestBadge(col, n, fungus)).map((p) => ({ text: p.text, fill: tone[p.tone] })),
      x,
      above - px * 0.2,
      px,
    );
  }
}

/** One world's side view: a faint rule down the curtain at each bend (an interior hole's s), labelled with its turn. */
export function drawBends(k: FieldCtx): void {
  const { ctx, theme, c, v, d } = k;
  const line = lineOfLayer(k.world, k.lv);
  const px = Math.round(12 * d);
  for (let j = 1; j < line.holes.length - 1; j++) {
    const s = line.sHole[j]!;
    const [x, top] = toScreen(c, v, centreX(s, STRIP), 0);
    const [, bottom] = toScreen(c, v, 0, k.ext.h);
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
    label(k, `${turn >= 0 ? "↱" : "↰"} ${Math.round(Math.abs(turn))}°`, x, Math.max(px, top + px), px, 0.8);
  }
}

/**
 * One world's side view: the ants on the plane standing on a cell under the line, drawn on the strip at its column(s)
 * (columnsOver: two at a bend), level, in their colony's colour, a crumb on a carrier. Ants elsewhere on the plane
 * aren't in this view (one-world §5). Leaves lineCap and lineWidth set until the stage ends (FieldRenderer.frame starts each stage clean).
 */
export function drawStripAnts(k: FieldCtx, len: number, crumb: number, inView: (x: number, y: number) => boolean): void {
  const { ctx, theme, c, v, colonies } = k;
  const line = lineOfLayer(k.world, k.lv);
  const half = len / 2;
  const wy = centreY(STRIP);
  ctx.lineCap = "round";
  ctx.lineWidth = Math.max(1, len * 0.3);
  for (const col of colonies) {
    ctx.beginPath();
    let carriers = 0;
    for (let i = 0; i < col.n; i++) {
      if (!col.alive[i] || col.layer[i] !== PLANE) continue;
      if (k.fog && k.fog.stateAt(PLANE, col.x[i]!, col.y[i]!) !== LIVE) continue; // plane ants only where an observer senses them now
      cellOf(col.x[i]!, col.y[i]!);
      const over = columnsOver(line, CELL[0], CELL[1]);
      for (let j = 0; j < over.length; j++) {
        const wx = centreX(over[j]!, STRIP);
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
      if (k.fog && k.fog.stateAt(PLANE, col.x[i]!, col.y[i]!) !== LIVE) continue;
      cellOf(col.x[i]!, col.y[i]!);
      const over = columnsOver(line, CELL[0], CELL[1]);
      for (let j = 0; j < over.length; j++) {
        const wx = centreX(over[j]!, STRIP);
        if (!inView(wx, wy)) continue;
        const [x, y] = toScreen(c, v, wx, wy);
        ctx.fillRect(x + half - crumb / 2, y - crumb / 2, crumb, crumb);
      }
    }
  }
}

/**
 * One world's queen's pen, on the top view: her flight's circle round her mother's hole and, under the pointer,
 * the cell she would settle on (the new segment of the line dashed to it from the end it grows) or why she can't.
 */
export function drawPen(k: FieldCtx, inp: FieldInputs): void {
  const { ctx, theme, c, v, d } = k;
  const pn = inp.pen;
  if (!pn) return;
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
  const hp = inp.hover;
  if (!hp) return;
  const [wx, wy] = toWorld(c, v, hp[0], hp[1]);
  cellOf(wx, wy);
  const key = `${CELL[0]},${CELL[1]},${Math.hypot(wx - pn.x, wy - pn.y) <= pn.r}`;
  const seen = inp.penSeen.current;
  if (!seen || seen.pen !== pn || seen.key !== key) inp.penSeen.current = { pen: pn, key, at: pn.preview({ x: wx, y: wy }) };
  const at = inp.penSeen.current!.at;
  const px = Math.round(12 * d);
  if (!at.ok) {
    // Kept inside the field: the reason is read near the pointer, whichever edge it is at.
    ctx.font = `600 ${px}px ui-sans-serif, system-ui, sans-serif`;
    const half = ctx.measureText(at.reason).width / 2 + 6 * d;
    const lx = half * 2 >= v.w ? v.w / 2 : Math.max(half, Math.min(v.w - half, hp[0]));
    label(k, at.reason, lx, Math.max(px, hp[1] - 18 * d), px, 1, theme.warn);
    return;
  }
  const tx = centreX(at.cell.x, at.cell.y);
  const ty = centreY(at.cell.y);
  const [sx, sy] = toScreen(c, v, tx, ty);
  ctx.strokeStyle = theme.accent;
  ctx.lineWidth = Math.max(1.5, d * 1.5);
  // A settle that begins a new line (`newLine`: its index is the world's next, so no such line yet) has no end to grow: only the ring and her hole.
  if (!at.newLine) {
    const holes = k.world.lines[at.line ?? 0]!.line.holes;
    const e = at.end === "start" ? holes[0]! : holes[holes.length - 1]!;
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
  }
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
  label(k, "her hole", sx, sy - rr - px, px);
}
