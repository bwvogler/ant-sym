import { type KeyboardEvent, type PointerEvent, useEffect, useMemo, useRef } from "react";
import { CHUNK } from "../colony/chunks.ts";
import { type Colony, moundWidth } from "../colony/colony.ts";
import { CELL, cellOf, R, SIDE } from "../colony/hex.ts";
import { SOIL, worldExtent } from "../colony/world.ts";
import { type Camera, clamp, fit, fitZoom, minimapRect, pan, toScreen, toWorld, type Viewport, visible, zoomBy } from "./camera.ts";
import { followedColony, type Followed } from "./follow.ts";

// The colony's ground through a camera. One canvas at device resolution,
// redrawn every frame: only the chunks in view are painted, each into its
// own 64×64 canvas and scaled up without smoothing, so cells stay crisp;
// only the ants in view are drawn, as ink ticks with a jade crumb on the
// carriers. Drag to pan, wheel or pinch to zoom, arrows/WASD and +/− on the
// keyboard; click an ant to follow it. Zoomed in, a minimap in the corner
// shows the whole map and where the view is (click it to jump). Colours
// come from the theme's CSS variables, so dark mode needs no code path of
// its own. The canvas sits absolutely in its aspect-ratio box: in flow, its
// own pixel height fed back into the box and stretched the map on a phone.

interface Props {
  colony: Colony;
  /** the rival colony, drawn in the warn tone, or null */
  rival: Colony | null;
  onFrame: (fn: () => void) => () => void;
  showFoodTrail: boolean;
  showHomeTrail: boolean;
  /** a brush is chosen: dragging on the field paints at (x, y) in cells, the brush widened by `scale` */
  onPaint: ((x: number, y: number, scale: number) => void) | null;
  followed: Followed | null;
  onFollow: (f: Followed | null) => void;
}

function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function rgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  return m ? [parseInt(m[1]!, 16), parseInt(m[2]!, 16), parseInt(m[3]!, 16)] : [128, 128, 128];
}

/** The warm tone the picture heatmap uses for "too many": here, the way home. */
/** Device pixels per world unit, per DPR, from which cells are drawn as true hexagons; below, as bricks. */
const HEX_ZOOM = 12;
const HOME_RGB: [number, number, number] = [196, 110, 40];
/** At or above this zoom (device px per cell) a brush paints its own radius; zoomed further out it widens to match. */
const BRUSH_ZOOM = 6;
/** A click (or a finger's tap) that moved less than this many CSS px is a click, not a drag. */
const CLICK_SLOP_PX = 8;
/** A click picks the nearest ant within this many CSS px. */
const PICK_PX = 14;

interface ChunkCanvas {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  img: ImageData;
}

/** The pointer gesture under way; `moved` is how far it has travelled (device px), (sx, sy) where it started. */
type Gesture = { kind: "pan" | "paint" | "pinch" | "mini" | "none"; moved: number; button: number; sx: number; sy: number };
const NO_GESTURE: Gesture = { kind: "none", moved: 0, button: 0, sx: 0, sy: 0 };

export default function ColonyField({ colony, rival, onFrame, showFoodTrail, showHomeTrail, onPaint, followed, onFollow }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const layers = useRef({ food: showFoodTrail, home: showHomeTrail });
  const cam = useRef<Camera | null>(null);
  const follow = useRef<Followed | null>(followed);
  const followCb = useRef(onFollow);
  /** whether the view is zoomed in past the whole map (the minimap shows, and takes clicks) */
  const zoomedIn = useRef(false);
  /** the view shows the whole map: it stays fitted when the canvas is resized (a phone turned, the layout reflowing) */
  const fitted = useRef(true);
  useEffect(() => {
    layers.current = { food: showFoodTrail, home: showHomeTrail };
  }, [showFoodTrail, showHomeTrail]);
  useEffect(() => {
    follow.current = followed;
  }, [followed]);
  useEffect(() => {
    followCb.current = onFollow;
  }, [onPaint, onFollow]);

  // The map's size in world units (hexagon rows are R apart): what the camera fits and clamps to.
  const world = useMemo(() => worldExtent(colony.map), [colony]);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<Gesture>(NO_GESTURE);
  const space = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // A new world starts zoomed out.
    cam.current = null;
    zoomedIn.current = false;
    fitted.current = true;
    const ctx = canvas.getContext("2d")!;
    const { w: gw, h: gh } = colony.map.size;
    const chunks = new Map<string, ChunkCanvas>();
    const chunkCanvas = (cx: number, cy: number): ChunkCanvas => {
      const key = `${cx},${cy}`;
      let c = chunks.get(key);
      if (!c) {
        const cv = document.createElement("canvas");
        cv.width = CHUNK;
        cv.height = CHUNK;
        const cctx = cv.getContext("2d")!;
        c = { canvas: cv, ctx: cctx, img: cctx.createImageData(CHUNK, CHUNK) };
        chunks.set(key, c);
      }
      return c;
    };
    // The minimap's picture of the whole map (2 world units a pixel), redrawn twice a second: ground, food, ants.
    const mini = document.createElement("canvas");
    mini.width = Math.ceil(world.w / 2);
    mini.height = Math.ceil(world.h / 2);
    const miniCtx = mini.getContext("2d")!;
    const miniImg = miniCtx.createImageData(mini.width, mini.height);
    let miniAt = -Infinity;

    let theme = { paper: "", ink: "", accent: "", warn: "", line: "", rock: rgb("#c9c2b5"), soil: rgb("#e3d5bf"), mound: "#6e6250", trail: [31, 111, 92], alarm: rgb("#8a5300"), paperRgb: rgb("#f6f4ef"), inkRgb: rgb("#1c1b19"), warnRgb: rgb("#8a5300") };
    const retheme = () => {
      theme = {
        paper: cssVar("--paper"),
        ink: cssVar("--ink"),
        accent: cssVar("--accent"),
        warn: cssVar("--warn"),
        line: cssVar("--line-strong"),
        rock: rgb(cssVar("--line-strong")),
        soil: rgb(cssVar("--soil")),
        mound: cssVar("--mound"),
        trail: cssVar("--heat").split(/\s+/).map(Number),
        alarm: rgb(cssVar("--warn")),
        paperRgb: rgb(cssVar("--paper")),
        inkRgb: rgb(cssVar("--ink")),
        warnRgb: rgb(cssVar("--warn")),
      };
      miniAt = -Infinity;
    };
    retheme();
    const mq = matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", retheme);

    const fitCanvas = () => {
      const d = Math.min(2, window.devicePixelRatio || 1);
      const rect = canvas.getBoundingClientRect();
      const w = Math.max(1, Math.round(rect.width * d));
      const h = Math.max(1, Math.round(rect.height * d));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
    };
    const ro = new ResizeObserver(fitCanvas);
    ro.observe(canvas);
    fitCanvas();

    /** Paint chunk (cx, cy)'s cells into its canvas: rock and soil, then the trails, then food over everything. */
    const paintChunk = (cx: number, cy: number, c: ChunkCanvas, rc: Uint8Array) => {
      const fc = colony.map.food.chunk(cx, cy);
      const foodC = colony.ph.fields.food.chunk(cx, cy);
      const homeC = colony.ph.fields.home.chunk(cx, cy);
      const alarmC = colony.ph.fields.alarm.chunk(cx, cy);
      const [fr, fg, fb] = rgb(theme.accent);
      const show = layers.current;
      const px = c.img.data;
      const x0 = cx * CHUNK;
      const y0 = cy * CHUNK;
      for (let ly = 0; ly < CHUNK; ly++) {
        for (let lx = 0; lx < CHUNK; lx++) {
          const i = ly * CHUNK + lx;
          const o = i * 4;
          if (x0 + lx >= gw || y0 + ly >= gh) {
            px[o + 3] = 0; // past the edge of the map
            continue;
          }
          if (rc[i]) {
            const solid = rc[i] === SOIL ? theme.soil : theme.rock;
            px[o] = solid[0];
            px[o + 1] = solid[1];
            px[o + 2] = solid[2];
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
          // Alarm is always shown: the player painted it, or a fight laid it, and it fades in seconds.
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
      c.ctx.putImageData(c.img, 0, 0);
    };

    /** The minimap's picture: each pixel the cell under its centre (food, rock, soil or open ground); ants as dots. */
    const paintMini = () => {
      const px = miniImg.data;
      const food: [number, number, number] = rgb(theme.accent);
      for (let my = 0; my < mini.height; my++)
        for (let mx = 0; mx < mini.width; mx++) {
          cellOf(mx * 2 + 1, my * 2 + 1);
          const x = CELL[0] as number;
          const y = CELL[1] as number;
          const off = x < 0 || y < 0 || x >= gw || y >= gh;
          const t = off ? 1 : colony.map.rock.get(x, y);
          const fv = off ? 0 : colony.map.food.get(x, y);
          const o = (my * mini.width + mx) * 4;
          const c = fv > 0 ? food : t === SOIL ? theme.soil : t ? theme.rock : theme.paperRgb;
          px[o] = c[0];
          px[o + 1] = c[1];
          px[o + 2] = c[2];
          px[o + 3] = 255;
        }
      for (const [col, tone] of [[rival, theme.warnRgb], [colony, theme.inkRgb]] as const) {
        if (!col) continue;
        for (let i = 0; i < col.n; i++) {
          if (!col.alive[i]) continue;
          const mx = Math.floor((col.x[i] as number) / 2);
          const my = Math.floor((col.y[i] as number) / 2);
          if (mx < 0 || my < 0 || mx >= mini.width || my >= mini.height) continue;
          const o = (my * mini.width + mx) * 4;
          px[o] = tone[0];
          px[o + 1] = tone[1];
          px[o + 2] = tone[2];
        }
      }
      miniCtx.putImageData(miniImg, 0, 0);
    };

    /**
     * Up close: the cells in view as true hexagons. Each cell's colour is its pixel in its chunk's colour
     * buffer (painted this frame), laid over the paper; soil (the commonest, underground) is the
     * background, and the rest are batched into one path per colour, so a frame is a few dozen fills.
     */
    const paths = new Map<number, Path2D>();
    const drawHexes = (c: Camera, v: Viewport, rx0: number, rx1: number, ry0: number, ry1: number) => {
      // The background: soil underground (most cells), the paper on the open surface (no soil at all).
      const bg = colony.map.hasSoil ? theme.soil : theme.paperRgb;
      const bgKey = (bg[0] << 16) | (bg[1] << 8) | bg[2];
      ctx.fillStyle = `rgb(${bg[0]},${bg[1]},${bg[2]})`;
      const [ax, ay] = toScreen(c, v, 0, 0);
      const [bx, by] = toScreen(c, v, world.w, world.h);
      ctx.fillRect(ax, ay, bx - ax, by - ay);
      paths.clear();
      const k = SIDE * c.zoom * 1.04; // a hair over, so neighbours meet without seams
      const [c0, c1, c2, c3, c4, c5] = [0, 1, 2, 3, 4, 5].map((j) => Math.cos(Math.PI / 6 + (j * Math.PI) / 3) * k) as [number, number, number, number, number, number];
      const [s0, s1, s2, s3, s4, s5] = [0, 1, 2, 3, 4, 5].map((j) => Math.sin(Math.PI / 6 + (j * Math.PI) / 3) * k) as [number, number, number, number, number, number];
      const pr = theme.paperRgb;
      const ox = v.w / 2 - c.x * c.zoom;
      const oy = v.h / 2 - c.y * c.zoom;
      for (let y = ry0; y <= ry1; y++) {
        const cy = y >> 6;
        const ly = y & 63;
        const sy = (y + 0.5) * R * c.zoom + oy;
        const shift = 0.5 + 0.5 * (y & 1);
        let chunkX = -1;
        let data: Uint8ClampedArray | null = null;
        for (let x = rx0; x <= rx1; x++) {
          if (x >> 6 !== chunkX) {
            chunkX = x >> 6;
            data = chunks.get(`${chunkX},${cy}`)?.img.data ?? null;
          }
          if (!data) continue;
          const o = ((ly << 6) | (x & 63)) * 4;
          // The cell over the paper, its alpha in 16 steps (so trails batch into few colours).
          const a = Math.round(((data[o + 3] as number) / 255) * 15) / 15;
          const r = Math.round((data[o] as number) * a + (pr[0] as number) * (1 - a));
          const g = Math.round((data[o + 1] as number) * a + (pr[1] as number) * (1 - a));
          const b = Math.round((data[o + 2] as number) * a + (pr[2] as number) * (1 - a));
          const key = (r << 16) | (g << 8) | b;
          if (key === bgKey) continue;
          let path = paths.get(key);
          if (!path) {
            path = new Path2D();
            paths.set(key, path);
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
      for (const [key, path] of paths) {
        ctx.fillStyle = `rgb(${key >> 16},${(key >> 8) & 255},${key & 255})`;
        ctx.fill(path);
      }
    };

    const draw = () => {
      const v: Viewport = { w: canvas.width, h: canvas.height };
      const d = Math.min(2, window.devicePixelRatio || 1);
      // Follow an ant: the camera centres on it; an ant that is gone (dead, or its slot reborn) ends the follow.
      const f = follow.current;
      const fcol = f ? followedColony(colony, rival, f) : null;
      if (f && !fcol) {
        follow.current = null;
        followCb.current(null);
      } else if (f && fcol && cam.current) cam.current = { ...cam.current, x: fcol.x[f.i] as number, y: fcol.y[f.i] as number };
      const c = clamp(fitted.current || !cam.current ? fit(world, v) : cam.current, world, v);
      cam.current = c;
      zoomedIn.current = c.zoom > fitZoom(world, v) * 1.05;
      ctx.fillStyle = theme.paper;
      ctx.fillRect(0, 0, v.w, v.h);
      ctx.imageSmoothingEnabled = false;

      // The rows of hexagons in view, and the chunks they fall in. Every chunk in view is painted
      // into its 64×64 colour buffer (one pixel a cell); then drawn as bricks or as hexagons.
      const vis = visible(c, v);
      const ry0 = Math.max(0, Math.floor(vis.y0 / R) - 1);
      const ry1 = Math.min(gh - 1, Math.ceil(vis.y1 / R) + 1);
      const rx0 = Math.max(0, Math.floor(vis.x0) - 1);
      const rx1 = Math.min(gw - 1, Math.ceil(vis.x1) + 1);
      const hexes = c.zoom >= HEX_ZOOM * d;
      for (let cy = ry0 >> 6; cy <= ry1 >> 6; cy++)
        for (let cx = rx0 >> 6; cx <= rx1 >> 6; cx++) {
          const rc = colony.map.rock.chunk(cx, cy);
          if (!rc) continue;
          const cc = chunkCanvas(cx, cy);
          paintChunk(cx, cy, cc, rc);
          if (hexes) continue;
          // Zoomed out: bricks. Each row of the chunk is a strip one cell high (R), odd rows shifted
          // half a cell right: the same six neighbours as hexagons, and a few draws per chunk.
          const ly0 = Math.max(0, ry0 - cy * CHUNK);
          const ly1 = Math.min(CHUNK - 1, ry1 - cy * CHUNK);
          for (let ly = ly0; ly <= ly1; ly++) {
            const y = cy * CHUNK + ly;
            const [ax, ay] = toScreen(c, v, cx * CHUNK + 0.5 * (y & 1), y * R);
            const [bx, by] = toScreen(c, v, (cx + 1) * CHUNK + 0.5 * (y & 1), (y + 1) * R);
            const dx = Math.round(ax);
            const dy = Math.round(ay);
            ctx.drawImage(cc.canvas, 0, ly, CHUNK, 1, dx, dy, Math.round(bx) - dx, Math.round(by) - dy);
          }
        }
      if (hexes) drawHexes(c, v, rx0, rx1, ry0, ry1);

      // Nests and ants in view: the player's in ink, the rival's in the warn tone; a jade crumb at the head of a
      // carrier, an earth one at the head of an ant carrying soil. Round each nest, the mound of the soil it dug.
      const len = Math.max(3, Math.min(22, c.zoom * 0.9));
      const half = len / 2;
      const crumb = Math.max(1.5, len * 0.35);
      const inView = (wx: number, wy: number) => wx >= vis.x0 - 2 && wx <= vis.x1 + 2 && wy >= vis.y0 - 2 && wy <= vis.y1 + 2;
      for (const [col, tone] of [[rival, theme.warn], [colony, theme.ink]] as const) {
        if (!col) continue;
        const [nx, ny] = toScreen(c, v, col.nest.x, col.nest.y);
        if (col.soilOut > 0) {
          const inner = Math.max(4, col.nest.r * c.zoom);
          const outer = inner + moundWidth(col.soilOut) * c.zoom;
          ctx.beginPath();
          ctx.arc(nx, ny, outer, 0, Math.PI * 2);
          ctx.arc(nx, ny, inner, 0, Math.PI * 2, true);
          ctx.fillStyle = theme.mound;
          ctx.globalAlpha = 0.3;
          ctx.fill();
          ctx.globalAlpha = 1;
        }
        ctx.beginPath();
        ctx.arc(nx, ny, Math.max(4, col.nest.r * c.zoom), 0, Math.PI * 2);
        ctx.strokeStyle = tone;
        ctx.lineWidth = 2;
        ctx.globalAlpha = 0.7;
        ctx.stroke();
        ctx.lineCap = "round";
        ctx.beginPath();
        for (let i = 0; i < col.n; i++) {
          if (!col.alive[i] || !inView(col.x[i] as number, col.y[i] as number)) continue;
          const [x, y] = toScreen(c, v, col.x[i] as number, col.y[i] as number);
          const hc = Math.cos(col.heading[i] as number) * half;
          const hs = Math.sin(col.heading[i] as number) * half;
          ctx.moveTo(x - hc, y - hs);
          ctx.lineTo(x + hc, y + hs);
        }
        ctx.strokeStyle = tone;
        ctx.lineWidth = Math.max(1, len * 0.3);
        ctx.globalAlpha = 0.85;
        ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.fillStyle = theme.accent;
        for (let i = 0; i < col.n; i++) {
          if (!col.alive[i] || !col.carrying[i] || !inView(col.x[i] as number, col.y[i] as number)) continue;
          const [x, y] = toScreen(c, v, col.x[i] as number, col.y[i] as number);
          ctx.fillRect(x + Math.cos(col.heading[i] as number) * half - crumb / 2, y + Math.sin(col.heading[i] as number) * half - crumb / 2, crumb, crumb);
        }
        ctx.fillStyle = theme.mound;
        for (let i = 0; i < col.n; i++) {
          if (!col.alive[i] || !col.pellet[i] || !inView(col.x[i] as number, col.y[i] as number)) continue;
          const [x, y] = toScreen(c, v, col.x[i] as number, col.y[i] as number);
          ctx.fillRect(x + Math.cos(col.heading[i] as number) * half - crumb / 2, y + Math.sin(col.heading[i] as number) * half - crumb / 2, crumb, crumb);
        }
      }

      // The followed ant: a jade ring.
      if (f && fcol) {
        const [x, y] = toScreen(c, v, fcol.x[f.i] as number, fcol.y[f.i] as number);
        ctx.beginPath();
        ctx.arc(x, y, Math.max(9 * d, c.zoom * 1.6), 0, Math.PI * 2);
        ctx.strokeStyle = theme.accent;
        ctx.lineWidth = 2 * d;
        ctx.stroke();
      }

      // Zoomed in: the minimap, with the view's rectangle.
      if (c.zoom > fitZoom(world, v) * 1.05) {
        const now = performance.now();
        if (now - miniAt > 500) {
          paintMini();
          miniAt = now;
        }
        const r = minimapRect(world, v, d);
        ctx.globalAlpha = 0.92;
        ctx.drawImage(mini, r.x, r.y, r.w, r.h);
        ctx.globalAlpha = 1;
        ctx.strokeStyle = theme.line;
        ctx.lineWidth = d;
        ctx.strokeRect(r.x, r.y, r.w, r.h);
        const s = r.w / world.w;
        ctx.strokeStyle = theme.accent;
        ctx.lineWidth = 1.5 * d;
        const x0 = Math.max(0, vis.x0);
        const y0 = Math.max(0, vis.y0);
        ctx.strokeRect(r.x + x0 * s, r.y + y0 * s, (Math.min(world.w, vis.x1) - x0) * s, (Math.min(world.h, vis.y1) - y0) * s);
      }
    };
    const off = onFrame(draw);
    draw();

    // The wheel zooms around the pointer; it needs a non-passive listener to keep the page from scrolling.
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = canvas.getBoundingClientRect();
      const k = canvas.width / r.width;
      const v: Viewport = { w: canvas.width, h: canvas.height };
      const c = zoomBy(cam.current ?? fit(world, v), world, v, (e.clientX - r.left) * k, (e.clientY - r.top) * k, Math.exp(-e.deltaY * 0.0015));
      cam.current = c;
      zoomedIn.current = c.zoom > fitZoom(world, v) * 1.05;
      fitted.current = c.zoom <= fitZoom(world, v) * 1.0001;
    };
    canvas.addEventListener("wheel", wheel, { passive: false });
    // Space held for a pan drag is let go when the window loses focus, or it would stick "down" (its keyup goes elsewhere).
    const blur = () => {
      space.current = false;
    };
    window.addEventListener("blur", blur);
    return () => {
      off();
      ro.disconnect();
      mq.removeEventListener("change", retheme);
      canvas.removeEventListener("wheel", wheel);
      window.removeEventListener("blur", blur);
    };
  }, [colony, rival, onFrame, world]);

  // ——— input: one pointer drags (pan, or paint with a brush), two pinch; a click picks an ant; the minimap jumps ———

  const dpr = () => Math.min(2, window.devicePixelRatio || 1);
  const slop = () => CLICK_SLOP_PX * dpr();
  const view = (): Viewport => ({ w: canvasRef.current?.width ?? 1, h: canvasRef.current?.height ?? 1 });
  const camera = (): Camera => {
    cam.current = clamp(cam.current ?? fit(world, view()), world, view());
    return cam.current;
  };
  const setCamera = (c: Camera) => {
    cam.current = clamp(c, world, view());
    const fz = fitZoom(world, view());
    zoomedIn.current = cam.current.zoom > fz * 1.05;
    fitted.current = cam.current.zoom <= fz * 1.0001;
  };
  /** Stop following now: the ref at once (a rAF draw must not re-centre on the ant first), the parent's state after. */
  const unfollow = () => {
    follow.current = null;
    onFollow(null);
  };
  const devicePoint = (e: PointerEvent<HTMLCanvasElement>): [number, number] => {
    const r = e.currentTarget.getBoundingClientRect();
    const k = e.currentTarget.width / r.width;
    return [(e.clientX - r.left) * k, (e.clientY - r.top) * k];
  };
  const inMini = (x: number, y: number) => {
    if (!zoomedIn.current) return false;
    const r = minimapRect(world, view(), dpr());
    return x >= r.x && y >= r.y && x <= r.x + r.w && y <= r.y + r.h;
  };
  const jumpMini = (x: number, y: number) => {
    const r = minimapRect(world, view(), dpr());
    if (follow.current) unfollow();
    setCamera({ ...camera(), x: ((x - r.x) / r.w) * world.w, y: ((y - r.y) / r.h) * world.h });
  };
  const paintAt = (x: number, y: number) => {
    if (!onPaint) return;
    const c = camera();
    const [wx, wy] = toWorld(c, view(), x, y);
    onPaint(wx, wy, Math.min(6, Math.max(1, (BRUSH_ZOOM * dpr()) / c.zoom)));
  };
  /** The nearest ant (either colony) within PICK_PX of the point, or null. */
  const pick = (x: number, y: number): Followed | null => {
    const c = camera();
    const [wx, wy] = toWorld(c, view(), x, y);
    const reach = (PICK_PX * dpr()) / c.zoom;
    let best: Followed | null = null;
    let bestD = reach * reach;
    for (const [col, side] of [[colony, "you"], [rival, "rival"]] as const) {
      if (!col) continue;
      for (let i = 0; i < col.n; i++) {
        if (!col.alive[i]) continue;
        const dx = (col.x[i] as number) - wx;
        const dy = (col.y[i] as number) - wy;
        const dd = dx * dx + dy * dy;
        if (dd < bestD) {
          bestD = dd;
          best = { side, i, gen: col.gen[i] as number };
        }
      }
    }
    return best;
  };

  const onDown = (e: PointerEvent<HTMLCanvasElement>) => {
    if (e.button === 1) e.preventDefault(); // middle-drag pans; no autoscroll
    e.currentTarget.setPointerCapture(e.pointerId);
    e.currentTarget.focus({ preventScroll: true });
    const [x, y] = devicePoint(e);
    pointers.current.set(e.pointerId, { x, y });
    if (pointers.current.size === 2) {
      gesture.current = { ...NO_GESTURE, kind: "pinch", moved: Infinity };
      return;
    }
    if (pointers.current.size > 2) return;
    const start = { moved: 0, sx: x, sy: y };
    if (e.button === 0 && inMini(x, y)) {
      gesture.current = { ...NO_GESTURE, ...start, kind: "mini" };
      jumpMini(x, y);
    } else if (e.button === 0 && onPaint && !space.current) {
      gesture.current = { ...NO_GESTURE, ...start, kind: "paint" };
      paintAt(x, y);
    } else gesture.current = { ...NO_GESTURE, ...start, kind: "pan", button: e.button };
  };

  const onMove = (e: PointerEvent<HTMLCanvasElement>) => {
    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    const [x, y] = devicePoint(e);
    const g = gesture.current;
    if (g.kind === "pinch" && pointers.current.size >= 2) {
      let other = prev;
      for (const [id, p] of pointers.current) if (id !== e.pointerId) other = p;
      const before = Math.hypot(prev.x - other.x, prev.y - other.y);
      const after = Math.hypot(x - other.x, y - other.y);
      const c = zoomBy(camera(), world, view(), (x + other.x) / 2, (y + other.y) / 2, before > 0 ? after / before : 1);
      setCamera(pan(c, (x - prev.x) / 2, (y - prev.y) / 2));
    } else if (g.kind === "pan") {
      const was = g.moved;
      g.moved += Math.abs(x - prev.x) + Math.abs(y - prev.y);
      if (g.moved > slop()) {
        if (follow.current) unfollow();
        // Crossing the slop, catch up from where the drag began, so the ground stays under the pointer.
        setCamera(was <= slop() ? pan(camera(), x - g.sx, y - g.sy) : pan(camera(), x - prev.x, y - prev.y));
      }
    } else if (g.kind === "paint" && e.buttons & 1) paintAt(x, y);
    else if (g.kind === "mini" && e.buttons & 1) jumpMini(x, y);
    pointers.current.set(e.pointerId, { x, y });
  };

  const onUp = (e: PointerEvent<HTMLCanvasElement>) => {
    const g = gesture.current;
    const p = pointers.current.get(e.pointerId);
    pointers.current.delete(e.pointerId);
    if (e.type === "pointerup" && g.kind === "pan" && g.button === 0 && g.moved <= slop() && p) {
      const f = pick(p.x, p.y);
      follow.current = f;
      onFollow(f);
    }
    if (pointers.current.size === 0) gesture.current = NO_GESTURE;
    // A pinch stays a pinch while two fingers are down (a third lifted); the last finger left pans, and never clicks.
    else if (g.kind === "pinch" && pointers.current.size === 1) gesture.current = { ...NO_GESTURE, kind: "pan", moved: Infinity };
  };

  const onKey = (e: KeyboardEvent<HTMLCanvasElement>) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return; // browser and system shortcuts (Ctrl+0, Ctrl+S, …) pass through
    if (e.key === " ") {
      space.current = e.type === "keydown";
      e.preventDefault();
      return;
    }
    if (e.type !== "keydown") return;
    const v = view();
    const c = camera();
    const step = Math.min(v.w, v.h) * 0.15;
    const moves: Record<string, [number, number]> = { ArrowLeft: [step, 0], a: [step, 0], ArrowRight: [-step, 0], d: [-step, 0], ArrowUp: [0, step], w: [0, step], ArrowDown: [0, -step], s: [0, -step] };
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key; // Shift or Caps Lock still moves
    const m = moves[key];
    if (m) {
      if (follow.current) unfollow();
      setCamera(pan(c, m[0], m[1]));
    } else if (e.key === "+" || e.key === "=") setCamera(zoomBy(c, world, v, v.w / 2, v.h / 2, 1.25));
    else if (e.key === "-" || e.key === "_") setCamera(zoomBy(c, world, v, v.w / 2, v.h / 2, 0.8));
    else if (e.key === "0" || e.key === "Home") showAll();
    else if (key === "n") goHome();
    else if (e.key === "Escape") unfollow();
    else return;
    e.preventDefault();
  };

  const showAll = () => {
    unfollow();
    setCamera(fit(world, view()));
  };
  const goHome = () => {
    unfollow();
    setCamera({ x: colony.nest.x, y: colony.nest.y, zoom: Math.max(camera().zoom, 8 * dpr()) });
  };

  const button = "pointer-events-auto rounded-md border border-line bg-panel/90 px-2 py-1 text-xs text-fg-2 shadow-sm hover:bg-raised";
  return (
    <>
      <canvas
        ref={canvasRef}
        tabIndex={0}
        className={`absolute inset-0 block h-full w-full touch-none rounded-lg border border-line outline-none focus-visible:ring-2 focus-visible:ring-accent ${onPaint ? "cursor-crosshair" : "cursor-grab active:cursor-grabbing"}`}
        role="application"
        aria-label="colony field: drag to pan, wheel or pinch to zoom, arrow keys to move, plus and minus to zoom, 0 for the whole map, n for your nest; click an ant to follow it"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onKeyDown={onKey}
        onKeyUp={onKey}
        onBlur={() => {
          space.current = false;
        }}
        onContextMenu={(e) => e.preventDefault()}
      />
      <div className="pointer-events-none absolute left-2 top-2 flex gap-1.5">
        <button type="button" className={button} onClick={showAll} title="Show the whole map (0)">
          Whole map
        </button>
        <button type="button" className={button} onClick={goHome} title="Go to your nest (n)">
          Your nest
        </button>
      </div>
    </>
  );
}
