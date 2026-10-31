import { type PointerEvent, useEffect, useRef } from "react";
import { CHUNK } from "../colony/chunks.ts";
import type { Colony } from "../colony/colony.ts";

// The colony's ground, drawn like the picture field: one canvas at device
// resolution, redrawn every frame from the colony's chunked typed arrays. The grid
// (rock, food, the two trails) goes through a grid-sized ImageData scaled up
// without smoothing, so cells stay crisp; ants are ink ticks on top, with a
// jade crumb at the head of every ant carrying food. Colours come from the
// theme's CSS variables, so dark mode needs no code path of its own. The
// canvas sits absolutely in its aspect-ratio box: in flow, its own pixel
// height fed back into the box and stretched the map to 1.4:1 on a phone.

interface Props {
  colony: Colony;
  /** the rival colony, drawn in the warn tone, or null */
  rival: Colony | null;
  onFrame: (fn: () => void) => () => void;
  showFoodTrail: boolean;
  showHomeTrail: boolean;
  /** a brush is chosen: dragging on the field paints at (x, y) in cells */
  onPaint: ((x: number, y: number) => void) | null;
}

function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function rgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  return m ? [parseInt(m[1]!, 16), parseInt(m[2]!, 16), parseInt(m[3]!, 16)] : [128, 128, 128];
}

/** The warm tone the picture heatmap uses for "too many": here, the way home. */
const HOME_RGB: [number, number, number] = [196, 110, 40];

export default function ColonyField({ colony, rival, onFrame, showFoodTrail, showHomeTrail, onPaint }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const layers = useRef({ food: showFoodTrail, home: showHomeTrail });
  useEffect(() => {
    layers.current = { food: showFoodTrail, home: showHomeTrail };
  }, [showFoodTrail, showHomeTrail]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const { w: gw, h: gh } = colony.map.size;
    const grid = document.createElement("canvas");
    grid.width = gw;
    grid.height = gh;
    const gridCtx = grid.getContext("2d")!;
    const img = gridCtx.createImageData(gw, gh);

    let theme = { paper: "", ink: "", accent: "", warn: "", rock: rgb("#c9c2b5"), trail: [31, 111, 92], alarm: rgb("#8a5300") };
    const retheme = () => {
      theme = { paper: cssVar("--paper"), ink: cssVar("--ink"), accent: cssVar("--accent"), warn: cssVar("--warn"), rock: rgb(cssVar("--line-strong")), trail: cssVar("--heat").split(/\s+/).map(Number), alarm: rgb(cssVar("--warn")) };
    };
    retheme();
    const mq = matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", retheme);

    const fit = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const rect = canvas.getBoundingClientRect();
      const w = Math.max(1, Math.round(rect.width * dpr));
      const h = Math.max(1, Math.round(rect.height * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
    };
    const ro = new ResizeObserver(fit);
    ro.observe(canvas);
    fit();

    const accentRgb = () => rgb(theme.accent);
    const draw = () => {
      const W = canvas.width;
      const H = canvas.height;
      const sx = W / gw;
      const sy = H / gh;
      ctx.fillStyle = theme.paper;
      ctx.fillRect(0, 0, W, H);

      // The grid, chunk by chunk (each chunk's arrays read directly): rock, then the trails, then food over everything.
      const { rock, food } = colony.map;
      const [fr, fg, fb] = accentRgb();
      const px = img.data;
      const show = layers.current;
      rock.forEach((cx, cy, rc) => {
        const fc = food.chunk(cx, cy);
        const foodC = colony.ph.fields.food.chunk(cx, cy);
        const homeC = colony.ph.fields.home.chunk(cx, cy);
        const alarmC = colony.ph.fields.alarm.chunk(cx, cy);
        const x0 = cx * CHUNK;
        const y0 = cy * CHUNK;
        for (let ly = 0; ly < CHUNK && y0 + ly < gh; ly++) {
          for (let lx = 0; lx < CHUNK && x0 + lx < gw; lx++) {
            const i = ly * CHUNK + lx;
            const o = ((y0 + ly) * gw + x0 + lx) * 4;
            if (rc[i]) {
              px[o] = theme.rock[0];
              px[o + 1] = theme.rock[1];
              px[o + 2] = theme.rock[2];
              px[o + 3] = 255;
              continue;
            }
            const fv = fc ? (fc[i] as number) : 0;
            if (fv > 0) {
              px[o] = fr;
              px[o + 1] = fg;
              px[o + 2] = fb;
              px[o + 3] = 120 + Math.min(135, fv * 12);
              continue;
            }
            // Alarm is always shown: the player painted it, and it fades in seconds.
            const al = alarmC ? Math.min(1, (alarmC[i] as number) / 6) : 0;
            if (al > 0.03) {
              px[o] = theme.alarm[0];
              px[o + 1] = theme.alarm[1];
              px[o + 2] = theme.alarm[2];
              px[o + 3] = Math.round(40 + al * 150);
              continue;
            }
            const f = show.food && foodC ? Math.min(1, (foodC[i] as number) / 4) : 0;
            // The home trail covers most walked ground: scaled softer, so it reads as a wash under the food trail.
            const h = show.home && homeC ? Math.min(1, (homeC[i] as number) / 12) : 0;
            if (f >= h && f > 0.02) {
              px[o] = theme.trail[0] as number;
              px[o + 1] = theme.trail[1] as number;
              px[o + 2] = theme.trail[2] as number;
              px[o + 3] = Math.round(f * 150);
            } else if (h > 0.02) {
              px[o] = HOME_RGB[0];
              px[o + 1] = HOME_RGB[1];
              px[o + 2] = HOME_RGB[2];
              px[o + 3] = Math.round(h * 90);
            } else px[o + 3] = 0;
          }
        }
      });
      gridCtx.putImageData(img, 0, 0);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(grid, 0, 0, W, H);

      // Nests and ants: the player's in ink, the rival's in the warn tone; a jade crumb at the head of a carrier.
      const len = Math.max(3, Math.min(sx, sy) * 0.9);
      const half = len / 2;
      const crumb = Math.max(1.5, len * 0.35);
      for (const [col, tone] of [[rival, theme.warn], [colony, theme.ink]] as const) {
        if (!col) continue;
        ctx.beginPath();
        ctx.arc(col.nest.x * sx, col.nest.y * sy, col.nest.r * Math.min(sx, sy), 0, Math.PI * 2);
        ctx.strokeStyle = tone;
        ctx.lineWidth = 2;
        ctx.globalAlpha = 0.7;
        ctx.stroke();
        ctx.lineCap = "round";
        ctx.beginPath();
        for (let i = 0; i < col.n; i++) {
          if (!col.alive[i]) continue;
          const x = (col.x[i] as number) * sx;
          const y = (col.y[i] as number) * sy;
          const c = Math.cos(col.heading[i] as number) * half;
          const s = Math.sin(col.heading[i] as number) * half;
          ctx.moveTo(x - c, y - s);
          ctx.lineTo(x + c, y + s);
        }
        ctx.strokeStyle = tone;
        ctx.lineWidth = Math.max(1, len * 0.3);
        ctx.globalAlpha = 0.85;
        ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.fillStyle = theme.accent;
        for (let i = 0; i < col.n; i++) {
          if (!col.alive[i] || !col.carrying[i]) continue;
          const x = (col.x[i] as number) * sx + Math.cos(col.heading[i] as number) * half;
          const y = (col.y[i] as number) * sy + Math.sin(col.heading[i] as number) * half;
          ctx.fillRect(x - crumb / 2, y - crumb / 2, crumb, crumb);
        }
      }
    };
    const off = onFrame(draw);
    draw();
    return () => {
      off();
      ro.disconnect();
      mq.removeEventListener("change", retheme);
    };
  }, [colony, rival, onFrame]);

  const paintAt = (e: PointerEvent<HTMLCanvasElement>) => {
    if (!onPaint) return;
    const r = e.currentTarget.getBoundingClientRect();
    onPaint(((e.clientX - r.left) / r.width) * colony.map.size.w, ((e.clientY - r.top) / r.height) * colony.map.size.h);
  };
  return (
    <canvas
      ref={canvasRef}
      className={`absolute inset-0 block h-full w-full touch-none rounded-lg border border-line ${onPaint ? "cursor-crosshair" : ""}`}
      aria-label="colony field"
      onPointerDown={(e) => {
        if (!onPaint) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        paintAt(e);
      }}
      onPointerMove={(e) => {
        if (e.buttons & 1) paintAt(e);
      }}
    />
  );
}
