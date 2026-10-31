import { useEffect, useRef } from "react";
import type { Colony } from "../colony/colony.ts";

// The colony's ground, drawn like the picture field: one canvas at device
// resolution, redrawn every frame from the colony's typed arrays. The grid
// (rock, food, the two trails) goes through a grid-sized ImageData scaled up
// without smoothing, so cells stay crisp; ants are ink ticks on top, with a
// jade crumb at the head of every ant carrying food. Colours come from the
// theme's CSS variables, so dark mode needs no code path of its own. The
// canvas sits absolutely in its aspect-ratio box: in flow, its own pixel
// height fed back into the box and stretched the map to 1.4:1 on a phone.

interface Props {
  colony: Colony;
  onFrame: (fn: () => void) => () => void;
  showFoodTrail: boolean;
  showHomeTrail: boolean;
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

export default function ColonyField({ colony, onFrame, showFoodTrail, showHomeTrail }: Props) {
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

    let theme = { paper: "", ink: "", accent: "", rock: rgb("#c9c2b5"), trail: [31, 111, 92] };
    const retheme = () => {
      theme = { paper: cssVar("--paper"), ink: cssVar("--ink"), accent: cssVar("--accent"), rock: rgb(cssVar("--line-strong")), trail: cssVar("--heat").split(/\s+/).map(Number) };
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

      // The grid: rock, then the trails, then food over everything.
      const { rock, food } = colony.map;
      const foodField = colony.ph.fields.food;
      const homeField = colony.ph.fields.home;
      const [fr, fg, fb] = accentRgb();
      const px = img.data;
      for (let i = 0; i < rock.length; i++) {
        const o = i * 4;
        if (rock[i]) {
          px[o] = theme.rock[0];
          px[o + 1] = theme.rock[1];
          px[o + 2] = theme.rock[2];
          px[o + 3] = 255;
          continue;
        }
        if ((food[i] as number) > 0) {
          px[o] = fr;
          px[o + 1] = fg;
          px[o + 2] = fb;
          px[o + 3] = 120 + Math.min(135, (food[i] as number) * 12);
          continue;
        }
        const f = layers.current.food ? Math.min(1, (foodField[i] as number) / 4) : 0;
        // The home trail covers most walked ground: scaled softer, so it reads as a wash under the food trail.
        const h = layers.current.home ? Math.min(1, (homeField[i] as number) / 12) : 0;
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
      gridCtx.putImageData(img, 0, 0);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(grid, 0, 0, W, H);

      // The nest.
      const { nest } = colony.map;
      ctx.beginPath();
      ctx.arc(nest.x * sx, nest.y * sy, nest.r * Math.min(sx, sy), 0, Math.PI * 2);
      ctx.strokeStyle = theme.ink;
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.7;
      ctx.stroke();
      ctx.globalAlpha = 1;

      // Ants: ink ticks along their heading; a crumb at the head of a carrier.
      const len = Math.max(3, Math.min(sx, sy) * 0.9);
      const half = len / 2;
      ctx.lineCap = "round";
      ctx.beginPath();
      for (let i = 0; i < colony.n; i++) {
        const x = (colony.x[i] as number) * sx;
        const y = (colony.y[i] as number) * sy;
        const c = Math.cos(colony.heading[i] as number) * half;
        const s = Math.sin(colony.heading[i] as number) * half;
        ctx.moveTo(x - c, y - s);
        ctx.lineTo(x + c, y + s);
      }
      ctx.strokeStyle = theme.ink;
      ctx.lineWidth = Math.max(1, len * 0.3);
      ctx.globalAlpha = 0.85;
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.fillStyle = theme.accent;
      const crumb = Math.max(1.5, len * 0.35);
      for (let i = 0; i < colony.n; i++) {
        if (!colony.carrying[i]) continue;
        const x = (colony.x[i] as number) * sx + Math.cos(colony.heading[i] as number) * half;
        const y = (colony.y[i] as number) * sy + Math.sin(colony.heading[i] as number) * half;
        ctx.fillRect(x - crumb / 2, y - crumb / 2, crumb, crumb);
      }
    };
    const off = onFrame(draw);
    draw();
    return () => {
      off();
      ro.disconnect();
      mq.removeEventListener("change", retheme);
    };
  }, [colony, onFrame]);

  return <canvas ref={canvasRef} className="absolute inset-0 block h-full w-full rounded-lg border border-line" aria-label="colony field" />;
}
