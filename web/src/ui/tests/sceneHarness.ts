// The renderer on a real game, headless (ja-fnd.6.3.9, docs/field-split.md): a small real Game, the real Ground, Minimap and FieldBinding, a recording 2D
// context and a FieldEnv whose sprite sets report READY (in Node no image ever loads, so the real sets would draw the ink and symbol fallbacks that no
// Chromium scene shows). A scene is one frame of FieldRenderer over that game: its call log is the frame's behaviour without a browser.
//
// What the log cannot see (the Chromium scenes of scripts/field-shots.mjs stay the arbiter of pixels): the pixels themselves (rasterisation, anti-aliasing,
// compositing), the decoding of the sprite sheets (a ready fake draws a named stand-in image, so which frame of a sheet is cut is in the log but what it
// looks like is not), fonts (text is measured as half its size a character), the WebGL voxel pass (a stand-in answers; its call and arguments are logged),
// the page around the canvas (DOM, CSS, the camera's easing and the pointer), and timing. Of the frame's draw calls it sees all of them, from the layers
// the renderer owns; of what a person sees, less: the sprite and voxel parts above are the share it cannot judge.

import { Game, PLANE } from "../../colony/index.ts";
import { followedColony, type Followed } from "../follow.ts";
import type { Specimen } from "../specimens.ts";
import { fit, type Camera, type Viewport } from "../camera.ts";
import { FieldBinding } from "../field/binding.ts";
import type { FieldCtx, FieldInputs, FieldPen } from "../field/ctx.ts";
import type { FieldEnv, SpriteSets } from "../field/env.ts";
import { Ground } from "../field/ground.ts";
import { Minimap } from "../field/minimap.ts";
import { beginFrame, type FieldParts, FieldRenderer } from "../field/renderer.ts";
import type { FrameSinks } from "../field/result.ts";
import { sensedFor } from "../fog/sources.ts";
import { SensedMap } from "../fungusSight.ts";
import { buildGame } from "../useColony.ts";
import { RecordedCanvas, RecordedImage, RecordedPath, recordingContext } from "./recordingContext.ts";

/** A stand-in for an image: it prints as its name in the log. */
const named = (name: string) => ({ toString: () => name }) as never;

/** Sprite sets that report ready: each answers with a named image, and the sets that draw themselves draw a named image on the context. */
export function readySprites(): SpriteSets {
  const sheet = (set: string) => (lod: string, colour?: readonly number[], dark?: boolean) =>
    named(`${set}:${lod}${colour ? `:${colour.map((n) => Math.round(n)).join(",")}` : ""}${dark ? ":dark" : ""}`);
  return {
    cadaver: {
      draw: (ctx: CanvasRenderingContext2D, lod: string, stage: number, x: number, y: number, zoom: number, heading = 0) => {
        ctx.drawImage(named(`cadaver:${lod}:${stage}:${Math.round(heading * 100)}`), x, y, zoom, zoom);
        return true;
      },
      get: sheet("cadaver"),
      load: () => {},
      dispose: () => {},
    },
    fungal: {
      draw: (ctx: CanvasRenderingContext2D, s: unknown, seed: number, x: number, y: number, zoom: number, layer = "all") => {
        ctx.drawImage(named(`fungal:${JSON.stringify(s)}:${seed % 8}:${layer}`), x, y, zoom, zoom);
      },
    },
    worker: { ready: () => true, get: sheet("worker"), clearTints: () => {}, load: () => {}, dispose: () => {} },
    nest: { get: sheet("nest"), clearTints: () => {}, load: () => {}, dispose: () => {} },
    resource: { get: sheet("resource"), load: () => {}, dispose: () => {} },
    surfaceLeaves: { get: (x: number, y: number) => [{ x, y, tile: `leaf${x},${y}` }] },
    mapLeaves: {
      draw: (ctx: CanvasRenderingContext2D, tiles: unknown) => ctx.drawImage(named(`leaves:${JSON.stringify(tiles).length}`), 0, 0, 1, 1),
    },
    gait: { update: () => {}, pose: () => 0 },
  } as unknown as SpriteSets;
}

export interface Scene {
  /** the game's seed and how long it has been played (ticks of 0.05 s) */
  seed?: number;
  /** the species id (the page's default is generic; the desert ant has the day's heat) */
  species?: string;
  /** runs on the game after its ticks and before the frame (set the time of day, say) */
  setup?: (g: Game) => void;
  /** the pinned specimens, as the page keeps them */
  specimens?: Specimen[] | ((g: Game) => Specimen[]);
  ticks?: number;
  /** the layer shown, the camera's centre and zoom (null: the whole map fitted) */
  lv?: number;
  at?: Camera | ((g: Game, ext: { x0: number; w: number; h: number }) => Camera) | null;
  /** the canvas, in device pixels, and the device ratio */
  size?: { w: number; h: number; dpr?: number };
  /** the page's palette: light or dark */
  dark?: boolean;
  follow?: Followed | ((g: Game) => Followed) | null;
  pen?: FieldPen | ((g: Game) => FieldPen) | null;
  hover?: readonly [number, number] | null;
  labels?: boolean;
  smell?: boolean;
  /** the fog of war on (fog/sources.ts sensedFor): nothing is sensed until `setup` or `stamp` says so */
  fog?: boolean;
  /** runs on the game and its sensed map just before the frame (stamp what the fungus senses) */
  stamp?: (g: Game, sensed: SensedMap) => void;
  /** the walking traces of moved ants (what AntTraces holds): a run of the old vector, then a search loop */
  traces?: (g: Game) => unknown[];
  /** frames drawn on the one context (default 1): the log is the last one's, which starts from what the frames before it left set */
  frames?: number;
  /** aphid clumps and a hook to add them */
  aphids?: unknown[] | ((g: Game) => unknown[]);
}

const LIGHT = (name: string) =>
  ({
    "--paper": "#f6f4ef",
    "--ink": "#1c1b19",
    "--accent": "#1f6f5c",
    "--warn": "#8a5300",
    "--line-strong": "#c9c2b5",
    "--fg-3": "#777",
    "--soil": "#e3d5bf",
    "--sky": "#e4edf1",
    "--spoil": "#c8b28c",
    "--mound": "#6e6250",
    "--heat": "31 111 92",
    "--spore": "#7a4fa0",
    "--aphid": "#5a9a2c",
  })[name] ?? "";
const DARK = (name: string) =>
  ({
    ...Object.fromEntries(["--paper", "--ink"].map((k) => [k, k === "--paper" ? "#14130f" : "#e8e4da"])),
    "--accent": "#6fc1a8",
    "--warn": "#e0a040",
    "--line-strong": "#4a4538",
    "--fg-3": "#999",
    "--soil": "#2b2418",
    "--sky": "#1d2730",
    "--spoil": "#5c4d33",
    "--mound": "#9a8b70",
    "--heat": "111 193 168",
    "--spore": "#b48ad6",
    "--aphid": "#8fcf5a",
  })[name] ?? "";

/** One frame of the renderer over a real game; returns the call log of the main canvas (and the game, for assertions). */
export function renderScene(s: Scene = {}): {
  log: string[];
  full: string[];
  from: number;
  pixels: Uint8ClampedArray[];
  game: Game;
  frameState: unknown;
} {
  RecordedImage.made.length = 0;
  RecordedCanvas.count = 0; // canvases print as canvas#n: a scene's log is the same whichever scenes ran before it
  const g = (globalThis as { Path2D?: unknown }).Path2D;
  (globalThis as { Path2D?: unknown }).Path2D = RecordedPath;
  try {
    const game = buildGame({ species: s.species ?? "generic", seed: s.seed ?? 3, antCount: 40, rival: true, generation: 0 });
    for (let k = 0; k < (s.ticks ?? 0); k++) game.tick(0.05);
    s.setup?.(game);
    const rec = recordingContext();
    const dpr = s.size?.dpr ?? 1;
    const v: Viewport = { w: s.size?.w ?? 800, h: s.size?.h ?? 600, dpr };
    const env: FieldEnv = {
      now: () => 1000,
      dpr: () => dpr,
      dev: false,
      reducedMotion: () => false,
      newPath: () => new RecordedPath() as unknown as Path2D,
      newCanvas: (w, h) => new RecordedCanvas(w, h) as unknown as HTMLCanvasElement,
      sprites: readySprites,
    };
    const lv = s.lv ?? PLANE;
    const sensed = sensedFor(game, !!s.fog);
    s.stamp?.(game, sensed);
    const ground = new Ground(env);
    const minimap = new Minimap(env);
    const parts: FieldParts = {
      ground,
      minimap,
      // the stand-in for the WebGL pass: it draws a named image on the context, where the real one composites its surface, so the log holds its place
      voxelMap: {
        draw: (ctx: CanvasRenderingContext2D, _scene: unknown, _sensed: unknown, lv: number) => (
          ctx.drawImage(named(`voxel:lv${lv}`), 0, 0, 1, 1),
          { renderer: "flat", alpha: 0 }
        ),
      } as never,
      sinks: {
        dataset: {},
        orbit: { current: { yaw: 0, tilt: 0 } },
        orbitAxes: { current: { hidden: false } },
        angled: { current: false },
        flatOrbit: () => ({ yaw: 0, tilt: 0 }),
        dev: false,
      } as unknown as FrameSinks,
    };
    const binding = new FieldBinding(
      env,
      game.world,
      game.colonies,
      game.fungus,
      sensed,
      ground,
      minimap,
      { shown: () => lv, smell: () => !!s.smell, pen: () => null },
      s.dark ? DARK : LIGHT,
      game.colonies[0]!,
    );
    binding.bind();
    const ext = binding.ext;
    const c: Camera = typeof s.at === "function" ? s.at(game, ext) : (s.at ?? fit(ext, v));
    const fctx = {
      ctx: rec.ctx,
      d: dpr,
      v,
      c,
      world: game.world,
      colonies: game.colonies,
      fungus: game.fungus,
      env,
      sprites: binding.sprites,
    } as unknown as FieldCtx;
    binding.fill(fctx);
    const inputs: FieldInputs = {
      hover: s.hover ?? null,
      pen: typeof s.pen === "function" ? s.pen(game) : (s.pen ?? null),
      penSeen: { current: null },
      show: { food: true, home: true },
    };
    const f = typeof s.follow === "function" ? s.follow(game) : (s.follow ?? null);
    const fcol = f ? followedColony(game.colonies, f) : null;
    const makeFrame = () =>
      beginFrame(
        fctx,
        inputs,
        parts,
        {
          orbit: { yaw: 0, tilt: 0 } as never,
          labelsOn: !!s.labels,
          aphids: (typeof s.aphids === "function" ? s.aphids(game) : (s.aphids ?? [])) as never,
          traces: (s.traces ? { traces: s.traces(game), update: () => {} } : null) as never,
          specimens: typeof s.specimens === "function" ? s.specimens(game) : (s.specimens ?? []),
          sensed,
        },
        { started: 0, f, fcol, fHere: !!(f && fcol && fcol.layer[f.i] === lv) },
      );
    // The same context for every frame, as the page has it: what one frame leaves set on it, the next starts from. The log is the last frame's.
    const renderer = new FieldRenderer();
    let fs!: ReturnType<typeof makeFrame>;
    let from = 0;
    for (let k = 0; k < (s.frames ?? 1); k++) {
      from = rec.log.length;
      fs = makeFrame();
      renderer.frame(fs);
    }
    return { log: rec.log.slice(from), full: rec.log, from, pixels: RecordedImage.made.map((i) => i.data), game, frameState: fs };
  } finally {
    (globalThis as { Path2D?: unknown }).Path2D = g;
  }
}
