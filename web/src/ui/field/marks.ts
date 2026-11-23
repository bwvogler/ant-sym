// The marks stage of the map (ja-fnd.6.3.16, docs/field-split.md): what the page lays over the ants and the nests: the aphid clumps, a moved ant's
// trace, the pinned specimens' dashed rings and labels, the followed ant's ring and tag, and the inspection overlay. Each is a plain function over
// FieldCtx (and what it reads of the page), drawn in the order the frame calls them: no React, no DOM, so a Node test can run them on a recording
// fake context. They leave the 2D context's state as the frame's old inline code did (docs/field-split.md, "the canvas state": the traces set
// a line cap and join the later marks inherit).

import { type AphidClump, aphidCount, centreX, centreY, type Colony, PLANE } from "../../colony/index.ts";
import { antTag } from "../badges.ts";
import type { Followed } from "../follow.ts";
import { followedColony } from "../follow.ts";
import { toScreen } from "../camera.ts";
import { drawMapInspection, mapInspectionNow } from "../mapInspection.ts";
import { APHID_SPOTS, aphidDensity, drawResourceSprite } from "../resourceSprites.ts";
import { sameAnt, type Specimen, specimenLabel } from "../specimens.ts";
import { type AntTraces, traceAlpha } from "../trace.ts";
import type { FieldCtx } from "./ctx.ts";
import type { NestFrame } from "./nests.ts";
import { pill } from "./overlays.ts";

/** What the marks read of the frame: the view test and the resource sheet (the nests stage's frame has both). */
export type MarkFrame = Pick<NestFrame, "inView" | "resourceImage" | "resourceLod">;

/**
 * Aphid marks show aggregate clump density, not individually simulated insects: fixed-size glyphs at hex zoom, the original green dots farther
 * out or while loading, fading by the clump's life. On the plane only, and not under the voxel pass's full cover (`voxelAlpha` 1).
 */
export function drawAphids(fc: FieldCtx, f: MarkFrame, clumps: readonly AphidClump[], voxelAlpha: number): void {
  const { ctx, c, v, d, lv, theme } = fc;
  const { inView, resourceImage, resourceLod } = f;
  if (voxelAlpha < 1 && clumps.length && lv === PLANE) {
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
}

/**
 * A moved ant's way home (ja-cwjp): from where the tweezers set it down (a ring), the run of its old vector in a solid line, then its search loops
 * dotted; a dot where it went down a hole. It fades once it is home or dead. On the plane only; the traces are advanced to now first.
 */
export function drawTraces(fc: FieldCtx, tr: AntTraces | null): void {
  const { ctx, c, v, d, lv, theme, env } = fc;
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
}

/**
 * The specimens (PRD §69.5): a dashed ring and the label, on the view's layer; the followed one has its own ring (drawFollowed), drawn after these
 * so its tag stays on top (review of #218).
 */
export function drawSpecimens(fc: FieldCtx, specimens: readonly Specimen[], f: Followed | null): void {
  const { ctx, c, v, d, lv, theme, colonies } = fc;
  for (const s of specimens) {
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
    pill(fc, [{ text: specimenLabel(s.no), fill: theme.ink }], x, y - r - tpx, tpx);
  }
}

/**
 * The followed ant: a jade ring and its tag (in one world, while it is on the view's layer). No mark while it is on the other one: the camera goes
 * with it through a hole, so the "gone below / up" ring only flashed for a frame and was removed (ja-rkse, PRD §61).
 */
export function drawFollowed(fc: FieldCtx, f: Followed | null, fcol: Colony | null, fHere: boolean): void {
  const { ctx, c, v, d, theme } = fc;
  if (f && fcol && fHere) {
    const [x, y] = toScreen(c, v, fcol.x[f.i], fcol.y[f.i]);
    ctx.beginPath();
    const r = Math.max(9 * d, c.zoom * 1.6);
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.strokeStyle = theme.accent;
    ctx.lineWidth = 2 * d;
    ctx.stroke();
    const tpx = Math.round(11 * d);
    pill(fc, [{ text: antTag(fcol, f.i), fill: theme.accent }], x, y - r - tpx, tpx);
  }
}

/** The inspection overlay (the map's own, ui/mapInspection.ts), pulsing with the clock unless motion is reduced. */
export function drawInspection(fc: FieldCtx): void {
  const { ctx, c, v, d, lv, env } = fc;
  drawMapInspection(ctx, mapInspectionNow(), lv, c, v, d, env.reducedMotion() ? 0 : env.now() / 1000);
}
