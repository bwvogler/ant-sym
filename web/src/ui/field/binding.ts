// What the field binds before a frame and keeps between frames (ja-fnd.6.3.8, part 2; docs/field-split.md): the shown layer and its map, each
// colony's trails and alarm on it, the fungus's spores, the theme read from the page's CSS, and the sprite sets. The shell's render effect used to hold
// these as a dozen `let`s; here they are one object, with no DOM and no clock (the CSS is read through a function the shell gives).

import { type Colony, CURTAIN, type ChunkLayer, type Fungus, type OneWorld, PLANE, type WorldMap } from "../../colony/index.ts";
import type { SensedMap } from "../fungusSight.ts";
import type { FieldCtx, FieldTheme } from "./ctx.ts";
import type { FieldEnv, SpriteSets } from "./env.ts";
import type { Ground } from "./ground.ts";
import type { Minimap } from "./minimap.ts";
import { extentOf } from "./rig.ts";

export function rgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  return m ? [parseInt(m[1]!, 16), parseInt(m[2]!, 16), parseInt(m[3]!, 16)] : [128, 128, 128];
}

/** The theme before the page's CSS is read: the light palette (retheme replaces every field before the first frame). */
export function defaultTheme(): FieldTheme {
  return {
    paper: "",
    ink: "",
    accent: "",
    warn: "",
    line: "",
    fg3: "",
    rock: rgb("#c9c2b5"),
    soil: rgb("#e3d5bf"),
    sky: rgb("#e4edf1"),
    spoil: rgb("#c8b28c"),
    mound: "#6e6250",
    trail: [31, 111, 92],
    alarm: rgb("#8a5300"),
    accentRgb: rgb("#1f6f5c"),
    paperRgb: rgb("#f6f4ef"),
    inkRgb: rgb("#1c1b19"),
    warnRgb: rgb("#8a5300"),
    spore: "#7a4fa0",
    aphid: "#5a9a2c",
    sporeRgb: rgb("#7a4fa0"),
    chamber: rgb("#a39a8a"),
  };
}

/** The theme from the page's custom properties (`css` reads one by name, trimmed). */
export function themeFromCss(css: (name: string) => string): FieldTheme {
  return {
    paper: css("--paper"),
    ink: css("--ink"),
    accent: css("--accent"),
    warn: css("--warn"),
    line: css("--line-strong"),
    fg3: css("--fg-3"),
    rock: rgb(css("--line-strong")),
    soil: rgb(css("--soil")),
    sky: rgb(css("--sky")),
    spoil: rgb(css("--spoil")),
    mound: css("--mound"),
    trail: css("--heat").split(/\s+/).map(Number),
    alarm: rgb(css("--warn")),
    accentRgb: rgb(css("--accent")),
    paperRgb: rgb(css("--paper")),
    inkRgb: rgb(css("--ink")),
    warnRgb: rgb(css("--warn")),
    spore: css("--spore"),
    aphid: css("--aphid"),
    sporeRgb: rgb(css("--spore")),
    chamber: rgb(css("--mound")),
  };
}

/** What the binding reads from the shell each frame. */
export interface BindingInputs {
  /** the shown layer (PLANE or CURTAIN) */
  shown(): number;
  /** the builder's smell vision is on */
  smell(): boolean;
}

export class FieldBinding {
  readonly sprites: SpriteSets;
  theme: FieldTheme = defaultTheme();
  lv = -1;
  // placeholders: bind() sets all of these before the first frame draws
  m: WorldMap;
  alarms: ChunkLayer<Float32Array>[] = [];
  spores: ChunkLayer<Float32Array>;
  strip = false;
  /** Each colony's trails on the shown layer; a cell shows them as strongly as a host sensed it lately (PRD §65). */
  trails: { food: ChunkLayer<Float32Array>; home: ChunkLayer<Float32Array>; odour: number }[] = [];
  /** Smell vision (the builder's, PRD §73): every trail and alarm shown everywhere, each food trail in its colony's tone. */
  smellAll = false;
  sensedLayer: ChunkLayer<Float32Array> | null = null;
  /** The map's size and first column: its columns run gx0 … gx0 + gw − 1 (gx0 < 0 on one world's curtain, whose column is the line's s), and the extent the camera fits. */
  gx0: number;
  gw: number;
  gh: number;
  ext: ReturnType<typeof extentOf>;
  #geoMap: WorldMap | null = null;
  readonly #world: OneWorld;
  readonly #colonies: readonly Colony[];
  readonly #fungus: Fungus;
  readonly #sensed: SensedMap;
  readonly #ground: Ground;
  readonly #minimap: Minimap;
  readonly #inputs: BindingInputs;
  readonly #css: (name: string) => string;

  constructor(
    env: FieldEnv,
    world: OneWorld,
    colonies: readonly Colony[],
    fungus: Fungus,
    sensed: SensedMap,
    ground: Ground,
    minimap: Minimap,
    inputs: BindingInputs,
    css: (name: string) => string,
    anyColony: Colony,
  ) {
    this.#world = world;
    this.#colonies = colonies;
    this.#fungus = fungus;
    this.#sensed = sensed;
    this.#ground = ground;
    this.#minimap = minimap;
    this.#inputs = inputs;
    this.#css = css;
    this.sprites = env.sprites();
    this.m = anyColony.map;
    this.spores = fungus.spores;
    this.gx0 = this.m.x0;
    this.gw = this.m.size.w;
    this.gh = this.m.size.h;
    this.ext = extentOf(this.m);
    this.bind();
    this.retheme();
  }

  /** The shown map is another, or has grown (a founding widens one world's curtain): its size, extent, chunks and minimap afresh. */
  #rebuild(map: WorldMap): void {
    this.#geoMap = map;
    this.gx0 = map.x0;
    this.gw = map.size.w;
    this.gh = map.size.h;
    this.ext = extentOf(map);
    this.#ground.clear();
    this.#minimap.resize(this.ext);
  }

  /** Read the shown view: its layer, map, scent and spores (each frame). */
  bind(): void {
    const lv = (this.lv = this.#inputs.shown());
    const m = (this.m = lv === PLANE ? this.#world.plane : this.#world.curtain);
    if (m !== this.#geoMap || m.x0 !== this.gx0 || m.size.w !== this.gw || m.size.h !== this.gh) this.#rebuild(m);
    this.spores = this.#fungus.sporesOn(lv)?.spores ?? this.#fungus.spores;
    this.strip = lv === CURTAIN;
    this.trails = [];
    this.alarms = [];
    this.sensedLayer = this.#sensed.layer(lv);
    this.smellAll = this.#inputs.smell();
    for (const col of this.#colonies) {
      const p = col.layers[lv]?.ph;
      if (!p) continue;
      this.alarms.push(p.fields.alarm);
      this.trails.push({ food: p.fields.food, home: p.fields.home, odour: col.nestOdour });
    }
  }

  /** The page's theme changed (dark mode, Settings → Appearance): read it again and drop what was painted with the old one. */
  retheme(): void {
    this.#ground.clearTiles();
    this.sprites.worker.clearTints();
    this.sprites.nest.clearTints();
    this.theme = themeFromCss(this.#css);
    this.#minimap.invalidate();
  }

  /** Copy the bound view into the frame's context (each frame, after bind). */
  fill(fc: FieldCtx): void {
    fc.theme = this.theme;
    fc.lv = this.lv;
    fc.m = this.m;
    fc.ext = this.ext;
    fc.smellAll = this.smellAll;
    fc.strip = this.strip;
    fc.trails = this.trails;
    fc.alarms = this.alarms;
    fc.spores = this.spores;
    fc.sensedLayer = this.sensedLayer;
    fc.sensedNow = this.#sensed.now;
    fc.fog = this.#sensed.knowledge;
    fc.corpses = this.#sensed.corpses;
  }

  /** Start loading the sprite images; each calls `redraw` when its images arrive. */
  load(redraw: () => void): void {
    const s = this.sprites;
    s.cadaver.load(redraw);
    s.worker.load(redraw);
    s.nest.load(redraw);
    s.resource.load(redraw);
  }

  dispose(): void {
    const s = this.sprites;
    s.cadaver.dispose();
    s.worker.dispose();
    s.nest.dispose();
    s.resource.dispose();
  }
}
