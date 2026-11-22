// What a frame's layers share and read (ja-fnd.6.3.5, docs/field-split.md): FieldCtx is the per-frame drawing context the shell fills each
// frame (the 2D context, the theme, the device ratio, the viewport, the camera, the layer and map shown, the world and what lives in it);
// FieldInputs is the read-only snapshot of what the shell's refs and props hold that a layer reads. A layer is a plain function over them, so a
// Node test can run it on a recording fake context. Each layer that moves brings the inputs it reads; the rest join as their layers move.

import type { Colony, Fungus, OneWorld, WorldMap } from "../../colony/index.ts";
import type { Camera, Extent, Viewport } from "../camera.ts";
import type { PenCircle, Settle } from "../pen.ts";
import type { Rgb } from "./colour.ts";

/** The page's colours as the field draws with them: CSS colours for strokes and fills, triples for what is mixed pixel by pixel. */
export interface FieldTheme {
  paper: string;
  ink: string;
  accent: string;
  warn: string;
  line: string;
  fg3: string;
  rock: Rgb;
  soil: Rgb;
  sky: Rgb;
  spoil: Rgb;
  mound: string;
  trail: number[];
  alarm: Rgb;
  accentRgb: Rgb;
  paperRgb: Rgb;
  inkRgb: Rgb;
  warnRgb: Rgb;
  spore: string;
  aphid: string;
  sporeRgb: Rgb;
  chamber: Rgb;
}

/** The queen's pen as the field draws it: her flight's circle, the settle preview under the pointer, and the click (pen.ts). */
export interface FieldPen extends PenCircle {
  /** where she would settle from plane point p, or why not (pen.ts penSettle) */
  preview: (p: { x: number; y: number }) => Settle;
  /** a click on the plane at p */
  onPick: (p: { x: number; y: number }) => void;
}

/** What a frame's layers share. The shell fills `c`, `v`, `d`, `lv`, `m`, `ext` and `theme` each frame, the rest once. */
export interface FieldCtx {
  ctx: CanvasRenderingContext2D;
  theme: FieldTheme;
  /** device pixels per CSS pixel, at most 2 */
  d: number;
  /** the canvas, in device pixels */
  v: Viewport;
  /** the camera this frame draws with */
  c: Camera;
  /** the layer shown: PLANE or CURTAIN */
  lv: number;
  /** the shown layer's map, and its extent */
  m: WorldMap;
  ext: Extent;
  world: OneWorld;
  colonies: readonly Colony[];
  fungus: Fungus;
}

/** The last preview under the pointer: the pen asked once per cell (and side of the circle's edge), not every frame. */
export interface PenSeen {
  pen: FieldPen;
  key: string;
  at: Settle;
}

/** What a frame reads of the shell's refs and props (a snapshot: a layer never writes to it, except the pen's cache). */
export interface FieldInputs {
  /** the pointer over the canvas in device pixels, for the pen's preview; null when it left */
  hover: readonly [number, number] | null;
  /** the queen's pen, or null */
  pen: FieldPen | null;
  /** the pen's last preview (a cache; the layer fills it) */
  penSeen: { current: PenSeen | null };
}
