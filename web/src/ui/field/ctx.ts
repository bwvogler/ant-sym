// What a frame's layers share and read (ja-fnd.6.3.5, docs/field-split.md): FieldCtx is the per-frame drawing context the shell fills each
// frame (the 2D context, the theme, the device ratio, the viewport, the camera, the layer and map shown, the world and what lives in it);
// FieldInputs is the read-only snapshot of what the shell's refs and props hold that a layer reads. A layer is a plain function over them, so a
// Node test can run it on a recording fake context. Each layer that moves brings the inputs it reads; the rest join as their layers move.

import type { ChunkLayer, Colony, Fungus, OneWorld, WorldMap } from "../../colony/index.ts";
import type { Knowledge } from "../fog/knowledge.ts";
import type { Camera, Extent, Viewport } from "../camera.ts";
import type { PenCircle, Settle } from "../pen.ts";
import type { Rgb } from "./colour.ts";
import type { FieldEnv, SpriteSets } from "./env.ts";

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

/** One colony's trails on the shown layer, and its nest's odour (the tone of its food trail in smell vision). */
export interface TrailLayers {
  food: ChunkLayer<Float32Array>;
  home: ChunkLayer<Float32Array>;
  odour: number;
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
  /** the scent the shell binds each frame (ColonyField's bind): every colony's trails and alarm on the shown layer, the spores, what hosts sensed */
  smellAll: boolean;
  /** the side view: its strip is painted from the plane */
  strip: boolean;
  trails: TrailLayers[];
  alarms: ChunkLayer<Float32Array>[];
  spores: ChunkLayer<Float32Array>;
  sensedLayer: ChunkLayer<Float32Array> | null;
  /** what the fungus knows of the ground (fog of war, docs/fog-of-war.md); null: no fog, the whole truth is drawn */
  fog?: Knowledge | null;
  /** the sensed map's clock: a cell sensed this long ago shows its scent this faintly */
  sensedNow: number;
  /** what the frame takes from the outside world: the clock, a new path, a new canvas (field/env.ts) */
  env: FieldEnv;
  /** the sprite sets this field draws with (built once per field: env.sprites()) */
  sprites: SpriteSets;
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
  /** which scent washes the Settings show */
  show: { food: boolean; home: boolean };
  /** the queen's pen, or null */
  pen: FieldPen | null;
  /** the pen's last preview (a cache; the layer fills it) */
  penSeen: { current: PenSeen | null };
}
