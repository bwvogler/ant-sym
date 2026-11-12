import { decode, encode, fillLike } from "./save.ts";
import type { CountGrid } from "./battle.ts";
import { BLOCK_BITS, CHUNK, CHUNK_BITS, ChunkLayer } from "./chunks.ts";
import type { Colony, Layer } from "./colony.ts";
import {
  DEFAULT_RULE,
  HIGH_LOAD,
  STRAIN_DEFAULT,
  TASKS,
  encodeFungal,
  localFungusRule,
  type Arousal,
  type FungalSituation,
  type FungusPolicy,
  type FungusRule,
  type FungalPlace,
  type FungalTouch,
} from "./fungalPolicy.ts";
import { Evolution, type EvolutionSave } from "./evolution.ts";
import {
  compose,
  decodeLevels,
  hold,
  LETHAL_LEVERS,
  leverFor,
  LEVERS,
  NEST_LEVERS,
  presetOf,
  PRESETS,
  type LeverLevels,
  type Preset,
  type Reach,
} from "./levers.ts";
import { binCentre, binOf, STRANGER_EPS, type Recognition } from "./recognition.ts";
import { CELL, cellOf, discOffsets, E, nx, ny, NW, SE, SW, W } from "./hex.ts";
import { clampCol, disc, inBounds, OPEN, rockAt, SOIL, type WorldMap } from "./world.ts";
import {
  cellKey,
  type Ground,
  type GrowthAnswer,
  type GrowthSituation,
  HYPHA_MASS,
  Hyphae,
  type HyphaeSave,
  keyCell,
  stepRound,
  TIP_STEP,
} from "./hyphae.ts";

// The fungus, pure: the player. It is spores on the ground and load inside ants
// (docs/fungus-policy.md), and in the game a mycelium where it landed, which
// grows and pays for the spores it puts out (evolution.ts, ja-lo8.12). This
// module is how it gets there and how it moves (ja-t4d.1): spores laid (paint),
// contact transmission across colonies, and the colony's answer to it,
// grooming, which clears visible load and primes the groomers against it.
// It never touches an ant's choices: later slices bend what an infected ant
// perceives, and its own policy still decides.
//
// Every ant carries `load` (0..1), `strain` (which trait set infected it),
// `resist` (immune priming, 0..1) and `expr` (the preset the fungus runs in
// it, or CUSTOM). What the fungus does in a host is a level for each of its
// levers (levers.ts, docs/fungus-policy.md §11): gains on what the host
// perceives and on what it gives off. The host's own policy then decides from
// that bent state. The levels are the fungus policy's choice (fungalPolicy.ts):
// the local rule (presets: the strain's default), or Jev under the player's
// aim, lever by lever; a lever the player's menu has off stays as it is.
//
// One step reads only grids built from everyone's load before the step, and
// each ant writes only its own load, so the order colonies are listed in is no
// edge (compare ja-slv). Spores taken from the ground are pooled and taken
// after everyone has read the cell. Nothing here draws a random number, so a
// game with no spores painted runs exactly as it did before.

export { AS_IS, CUSTOM, LEVERS, PRESETS, preset, type Levers, type LeverLevels } from "./levers.ts";

/** Levers that act on the nest (its chambers' marks, its queen): on the menu only in the side view. */
export const NEST_ONLY: ReadonlySet<string> = NEST_LEVERS;

/** Levers that kill their host: off the player's menu until turned on. */
export const LETHAL: ReadonlySet<string> = LETHAL_LEVERS;

/** The levers on `menu` that mean something in a queen (`queen`) or a worker, in table order: what Jev is asked. */
export function askedLevers(menu: ReadonlySet<string>, queen: boolean): string[] {
  return LEVERS.filter((v) => menu.has(v.id) && leverFor(v, queen)).map((v) => v.id);
}

/** The menu the fungus starts with: every lever but the lethal ones. */
export const DEFAULT_MENU: readonly string[] = LEVERS.filter((v) => !LETHAL_LEVERS.has(v.id)).map((v) => v.id);

/** A strain: one trait set of the fungus. A landing or paint lays one; later organisms are other trait sets (§5.1). */
export interface Strain {
  id: string;
  name: string;
  /** what it is like, for the panel */
  blurb: string;
  /** load gained per second by a clean host whose every neighbour is fully loaded: scaled by the load-weighted share of neighbours carrying it */
  transmission: number;
  /** share of its load a host clears per second on its own */
  decay: number;
  /** share of a host's load nestmates can see: what grooming removes, and what primes the groomers */
  visibility: number;
  /** the preset (an id in levers.PRESETS) its hosts run by default: the local rule's answer, and what a host runs while no policy has answered */
  expresses: string;
  /** a host's corpse on the midden sporulates: spores on the ground there (Metarhizium on cadavers; nest slice 8) */
  sporulates?: boolean;
}

/**
 * Strains from the two ends of the stealth-against-potency dial (§6), and one between:
 * Lockpick after *Rickia wasmannii* (non-lethal, colony-wide, barely groomed; calms),
 * Bloom after *Metarhizium* (spreads fast, visible, groomed off, immunises the groomers),
 * Garden after the leafcutter's cultivar, whose odour becomes the colony's (blends odours).
 */
export const STRAINS: readonly Strain[] = [
  {
    id: "lockpick",
    name: "Lockpick",
    blurb: "spreads slowly, hides, never clears on its own; its hosts barely smell alarm",
    transmission: 0.15,
    decay: 0,
    visibility: 0.1,
    expresses: "soothe",
  },
  {
    id: "bloom",
    name: "Bloom",
    blurb: "spreads fast, shows, is groomed off and leaves the groomers resistant; its hosts smell the rival's food trail as their own",
    transmission: 0.6,
    decay: 0.01,
    visibility: 0.8,
    expresses: "share",
    sporulates: true,
  },
  {
    id: "garden",
    name: "Garden",
    blurb: "spreads steadily and half-shows; its hosts carry its own odour, so colonies that grow it come to smell alike",
    transmission: 0.3,
    decay: 0,
    visibility: 0.3,
    expresses: "blend",
  },
];

export interface FungusParams {
  /** load an ant takes per second per unit of spores on its cell */
  pickup: number;
  /** share of ground spores lost per second (sun, rain) */
  sporeDecay: number;
  /** spores a cell holds at most */
  maxSpores: number;
  /** load groomed off per second, per groomer, per unit of a host's visible share */
  grooming: number;
  /** most nestmates that groom one host at once */
  groomers: number;
  /**
   * most that groom a queen at once in the evolving game: her retinue tends her closely, so a fungus in her is groomed
   * harder than in a worker (ja-lo8.12, a stop-gap: ja-k4k.12). A lab or test game grooms her as any host (`groomers`).
   */
  queenGroomers: number;
  /** resistance gained per second at full visible load on the nestmates around (immune priming, Konrad et al. 2012) */
  priming: number;
  /** below this a host whose load is falling is clean again */
  clear: number;
  /**
   * the least a clean ant must take per second to be infected at all: a minimum infectious dose, as a rate so that it
   * means the same at any step (ja-lo8.12; before, `clear` zeroed a clean ant's first step, so the dose it asked for
   * grew as the step shrank)
   */
  minDose: number;
  /** seconds between steps when the game advances the fungus (Game.tick) */
  interval: number;
  /** a host counts as groomed when its nestmates take load off it at this rate per second or more */
  groomedAt: number;
  /** ground is home (or foreign) where a colony's home scent is at least this many times the strongest other's (or another's than its own); else border. In the side view, the same test says whose tunnel a host is in. */
  borderRatio: number;
  /**
   * the evolving fungus's mycelium grows as hyphae (docs/hyphal-growth.md, ja-2bw.2): tips that extend, turn and branch
   * from where it roots, and its spores go out where they are; off, its patch puts out its spores as before
   */
  hyphae: boolean;
}

export const DEFAULT_FUNGUS: FungusParams = {
  pickup: 0.3,
  sporeDecay: 0.03,
  maxSpores: 6,
  grooming: 0.12,
  groomers: 4,
  queenGroomers: 8,
  priming: 0.02,
  clear: 0.002,
  minDose: 0.02,
  interval: 0.1,
  groomedAt: 0.05,
  borderRatio: 2,
  hyphae: false,
};

/** A host the policy has chosen to keep dormant shows this share of its strain's visibility: lying low is how it hides from grooming. */
export const DORMANT_SHOW = 0.25;

/** The headings of the tips a landing's hyphae set out on: three, a third of the way round from each other (hex.ts E, SW, NW). */
const ROOT_HEADINGS = [E, SW, NW];
/**
 * A corpse the fungus grows out of (ja-2bw.7, docs/hyphal-growth.md §6): the spores it puts out on its cell, free (paid
 * by the cadaver, not the mycelium: Khun et al. 2021 counted about 1.3 × 10⁸ conidia a cadaver; the amount is design),
 * how fast, the mass it adds to the mycelium, and the tips that set out from it (east and west).
 */
export const CORPSE = { spores: 12, rate: 0.2, mass: 1, headings: [E, W] as readonly number[] };

/** How far down the shaft under a hole rootShaft looks for its walls, in rows. */
const SHAFT_ROWS = 8;

/** The queen's royal mark at or above which the fungus in a host feels it underfoot: place "queen". */
const ROYAL_FELT = 1;

/** Load at or above which an ant counts as infected in the panel and the renderer. */
export const INFECTED = 0.05;

/**
 * Below this, a neighbourhood's load (less the ant's own) is nothing. The grids sum in Float32, so
 * taking an ant's own float64 load back out leaves ~1e-8 behind; real contributions are ≥ ~2e-4.
 */
const NOTHING = 1e-6;

/** Ground spores below this are gone. */
const SPORE_GONE = 1e-3;

/** The last local coordinate in a chunk. */
const EDGE = CHUNK - 1;
/** A cell and its six hex neighbours as offsets into a chunk's flat array, for an even row ([0]) and an odd row ([1]): chunks are 64 wide, so a row's parity in its chunk is its parity on the map. */
const AROUND = [0, 1].map((parity) => {
  const o = discOffsets(1)[parity] as Int16Array;
  const out: number[] = [];
  for (let k = 0; k < o.length; k += 2) out.push(o[k + 1] * CHUNK + o[k]);
  return out;
});

/**
 * Load per cell, summed over the ants in it, with the strain of the most loaded ant there.
 * Like battle.ts's CountGrid: a chunked layer that remembers which cells it touched, so a
 * reset clears only those, and 8×8 block sums to rule out an empty neighbourhood cheaply.
 */
export class LoadGrid {
  readonly sum = new ChunkLayer((n) => new Float32Array(n), 0);
  readonly #top = new ChunkLayer((n) => new Float32Array(n), 0);
  readonly #strain = new ChunkLayer((n) => new Uint8Array(n), 0);
  readonly #blocks = new ChunkLayer((n) => new Float32Array(n), 0);
  #touched: number[] = [];

  reset(): void {
    const t = this.#touched;
    for (let k = 0; k < t.length; k += 2) {
      const x = t[k];
      const y = t[k + 1];
      this.sum.set(x, y, 0);
      this.#top.set(x, y, 0);
      this.#blocks.set(x >> BLOCK_BITS, y >> BLOCK_BITS, 0);
    }
    t.length = 0;
  }

  add(x: number, y: number, load: number, strain: number): void {
    const v = this.sum.get(x, y);
    if (v === 0) this.#touched.push(x, y);
    this.sum.set(x, y, v + load);
    if (load > this.#top.get(x, y)) {
      this.#top.set(x, y, load);
      this.#strain.set(x, y, strain);
    }
    const bx = x >> BLOCK_BITS;
    const by = y >> BLOCK_BITS;
    this.#blocks.set(bx, by, this.#blocks.get(bx, by) + load);
  }

  get(x: number, y: number): number {
    return this.sum.get(x, y);
  }

  /** The strain of the most loaded ant in cell (x, y). Meaningful only where get(x, y) > 0. */
  strainAt(x: number, y: number): number {
    return this.#strain.get(x, y);
  }

  any(x0: number, y0: number, x1: number, y1: number): boolean {
    for (let by = y0 >> BLOCK_BITS; by <= y1 >> BLOCK_BITS; by++)
      for (let bx = x0 >> BLOCK_BITS; bx <= x1 >> BLOCK_BITS; bx++) if (this.#blocks.get(bx, by) > 0) return true;
    return false;
  }
}

/** One colony's line on the fungus: how far in it is, and how far the colony has answered. */
export interface Census {
  /** living ants at or above INFECTED */
  infected: number;
  /** living ants */
  living: number;
  /** mean load over the infected */
  meanLoad: number;
  /** mean resistance over all living ants */
  meanResist: number;
}

/**
 * The SporeLayer keys a save keeps for each map past the first (Fungus.saveState's `layers`); the rest are the map itself,
 * or built every step. `base` there can't change in today's games (every `root` is on layer 0, so the curtain's base
 * stays empty): it is saved for completeness, and no test reaches it (#63's review, N3).
 */
export const SPORE_LAYER_STATE = ["spores", "sporeStrain", "sporeCells", "base"] as const;

/**
 * One map's share of the fungus (one world, ja-lp4.3): the ground's spores on it and the cells holding them, the evolving
 * fungus's base there, and what a step builds over the ants on it (everyone's load, each colony's visible load, the
 * spores taken). One world has two (the plane and the curtain); every other game one, whose spores are the fungus's own
 * public `spores` and `sporeStrain` on its `map`.
 */
interface SporeLayer {
  readonly map: WorldMap;
  readonly spores: ChunkLayer<Float32Array>;
  readonly sporeStrain: ChunkLayer<Uint8Array>;
  /** cells holding spores, as y * w + x − x0 (re-keyed by regrid when the map grows) */
  readonly sporeCells: Set<number>;
  /** the evolving fungus's base on this map (see #grow), as y * w + x − x0 (sporeCells' keys too) */
  base: number[];
  /** everyone's load, for transmission */
  readonly all: LoadGrid;
  /** each colony's visible load, for grooming's priming */
  readonly visible: LoadGrid[];
  /** spores taken this step, as x, y, amount: taken after every ant has read its cell */
  readonly taken: number[];
}

export class Fungus {
  /** the map its spores lie on (one world: the plane, layer 0) */
  readonly map: WorldMap;
  params: FungusParams;
  /** the strains, copied: an evolving fungus (evolution) sets its own strain's spread traits */
  readonly strains: Strain[];
  /** the game's fungus evolving (evolution.ts, ja-lo8.12); null in the lab and the tests, where every strain is as listed */
  #evolution: Evolution | null = null;
  /** the strains as listed, for putting them back when there is no evolution */
  readonly #listed: readonly Strain[];
  /** how far each lever may go (levers.hold), from the evolution; null: every lever's full range */
  #reach: Reach | null = null;
  /** the share of a host's primed resistance that counts against the evolving strain: 1 less its immune evasion */
  #evade = 1;
  /** spores on the ground, per cell (on `map`: layer 0's) */
  readonly spores = new ChunkLayer((n) => new Float32Array(n), 0);
  /** the strain of the spores on each cell (the last one painted there) */
  readonly sporeStrain = new ChunkLayer((n) => new Uint8Array(n), 0);
  /**
   * Each map's spores, base and step grids (SporeLayer): layer 0 holds `map`, `spores` and `sporeStrain`. The evolving
   * fungus's base (ja-lo8.12) is the cells it landed on: its mycelium grows there and puts out spores onto them, paid for
   * out of its mass (evolution.ts): a trickle of foragers walks through them all game, whether or not the fungus has a
   * hold in the nest.
   */
  readonly #layers: SporeLayer[];
  /** fungus the evolving strain made in hosts this step (load passed on by contact) */
  #made = 0;
  /** each map's hyphae (params.hyphae): null until the evolving fungus roots there */
  readonly #hyphae: (Hyphae | null)[];
  /** each map's spore cells under its hyphae (hyphae.ts sporeCellsOf), refreshed each round of tip steps (the ground a tip feels may be dug meanwhile) */
  #sporeSpots: (number[] | null)[] = [];
  /** each map's corpses the fungus grows out of (ja-2bw.7): cell (hyphae.ts cellKey) → free spores still to put out there; 0 once spent (it is not colonised again) */
  #corpses: Map<number, number>[];
  /** the corpses lying at (x, y) on map `layer` (the midden's), for a hypha that reaches one; set by the game */
  corpseAt: ((layer: number, x: number, y: number) => number) | null = null;
  /** the growth policy (ja-2bw.5): a tip's answer in its situation, or null for the local rule (hyphae.ts localGrowth) */
  growthPolicy: ((s: GrowthSituation) => GrowthAnswer | null) | null = null;
  /** loaded ants after the last step or paint: zero (and no spores) means the step has nothing to do */
  hosts = 0;
  /** the fungus policy: null for the local rule with `rule`; the Jev lane sets its own (ui/colonyJev.ts) */
  policy: FungusPolicy | null = null;
  /** the local rule's settings (the player's thresholds) */
  rule: FungusRule = { ...DEFAULT_RULE };
  /** the levers the player has on (§5.1, lever 4): lethal ones start off; the nest's (NEST_ONLY) only where there is a nest */
  #menu: Set<string> = new Set(DEFAULT_MENU);
  /** A copy: adding to it changes nothing (review of #27: adding "crown" to the live set skipped the NEST_ONLY filter). Set it to change the menu. */
  get menu(): Set<string> {
    return new Set(this.#menu);
  }
  set menu(menu: Iterable<string>) {
    // On the top-down maps there are no chambers or queen: floor marks and crown would do nothing (review of nest slice 8).
    const nest = this.hasNest;
    this.#menu = new Set([...menu].filter((id) => nest || !NEST_ONLY.has(id)));
  }
  /** Whether any of its maps has a nest underground (chambers, a queen): the side view's, one world's curtain. */
  get hasNest(): boolean {
    return this.#layers.some((L) => !!L.map.sky);
  }
  /** seconds owed since the last step (advance) */
  #clock = 0;
  /** what #gather read around the ant being stepped */
  readonly #nb = { load: 0, topX: 0, topY: 0, visible: 0, ants: 0, own: 0 };

  /** On one map, or (one world) on each of `map`'s, the first holding `spores` and `sporeStrain`. */
  constructor(map: WorldMap | readonly WorldMap[], params: Partial<FungusParams> = {}, strains: readonly Strain[] = STRAINS) {
    const maps: readonly WorldMap[] = Array.isArray(map) ? (map as readonly WorldMap[]) : [map as WorldMap];
    this.map = maps[0] as WorldMap;
    this.#layers = maps.map((m, l) => ({
      map: m,
      spores: l === 0 ? this.spores : new ChunkLayer((n) => new Float32Array(n), 0),
      sporeStrain: l === 0 ? this.sporeStrain : new ChunkLayer((n) => new Uint8Array(n), 0),
      sporeCells: new Set<number>(),
      base: [],
      all: new LoadGrid(),
      visible: [],
      taken: [],
    }));
    this.#hyphae = maps.map(() => null);
    this.#corpses = maps.map(() => new Map());
    this.params = { ...DEFAULT_FUNGUS, ...params };
    this.#listed = strains.map((s) => ({ ...s }));
    this.strains = strains.map((s) => ({ ...s }));
    this.menu = this.#menu; // through the setter: the nest's interventions only where there is a nest
  }

  /**
   * Map `layer`'s spores and their strain (one world: 0 the plane, 1 the curtain), for the renderer: layer 0's are the
   * public `spores` and `sporeStrain`. Read only; null for a layer the fungus has no map for.
   */
  sporesOn(layer: number): { readonly spores: ChunkLayer<Float32Array>; readonly sporeStrain: ChunkLayer<Uint8Array> } | null {
    const L = this.#layers[layer];
    return L ? { spores: L.spores, sporeStrain: L.sporeStrain } : null;
  }

  /**
   * The evolving fungus's patch on map `layer` (its base: where it rooted), as cells x0, y0, x1, y1, …, for the renderer
   * to grow its mycelium from. Empty without one.
   */
  patchOn(layer: number): number[] {
    const L = this.#layers[layer];
    if (!L) return [];
    const { w } = L.map.size;
    const { x0 } = L.map;
    const out: number[] = [];
    for (const key of L.base) {
      const col = key % w;
      out.push(col + x0, (key - col) / w);
    }
    return out;
  }

  /** Map `layer`'s hyphae (params.hyphae), for the renderer and the assays: read only; null where none has rooted. */
  hyphaeOn(layer: number): Hyphae | null {
    return this.#hyphae[layer] ?? null;
  }

  /**
   * Map `layer`'s ground as a hypha feels it (hyphae.ts Ground): a map with no sky (the plane, a top-down map) is read as
   * the topsoil just under its surface (owner, 2026-11-12); a map with sky (the curtain, the side view) is soil, dug
   * cells and rock.
   */
  #ground(layer: number): Ground {
    const map = (this.#layers[layer] as SporeLayer).map;
    return {
      topsoil: !map.sky,
      kind: (x, y) => {
        const t = rockAt(map, x, y);
        return t === OPEN ? "open" : t === SOIL ? "soil" : "rock";
      },
    };
  }

  /** Whether there is anything for a step to do: spores on the ground or load in any ant. */
  get active(): boolean {
    if (this.hosts > 0) return true;
    for (const L of this.#layers) if (L.sporeCells.size > 0) return true;
    return false;
  }

  /** Cells holding spores, on every map. */
  get sporeCells(): number {
    let n = 0;
    for (const L of this.#layers) n += L.sporeCells.size;
    return n;
  }

  /**
   * Spores on every open cell within `radius` of (x, y) (a landing; tests' and scripts' brush), and a direct dose of
   * load into every living ant there, of either colony, with strain `strain`. An ant already
   * carrying another strain keeps it (first in holds the host); the dose still adds load. On map `layer` (one world), and
   * only the ants on it.
   */
  paint(colonies: readonly Colony[], x: number, y: number, radius: number, spores: number, dose: number, strain: number, layer = 0): void {
    const L = this.#layers[layer] as SporeLayer;
    const { map } = L;
    const { w } = map.size;
    const { x0 } = map;
    const s = Math.max(0, Math.min(this.strains.length - 1, Math.floor(strain)));
    const r2 = radius * radius;
    disc(map, x, y, radius, (cx, cy) => {
      if (rockAt(map, cx, cy)) return;
      L.spores.set(cx, cy, Math.min(this.params.maxSpores, L.spores.get(cx, cy) + spores));
      L.sporeStrain.set(cx, cy, s);
      L.sporeCells.add(cy * w + cx - x0);
    });
    const layered = this.#layers.length > 1;
    for (const c of colonies)
      for (let i = 0; i < c.n; i++) {
        if (!c.alive[i] || (layered && c.layer[i] !== layer)) continue;
        const dx = c.x[i] - x;
        const dy = c.y[i] - y;
        if (dx * dx + dy * dy > r2) continue;
        const l = c.load[i];
        if (l === 0) c.strain[i] = s;
        const nl = Math.min(1, l + dose * (1 - c.resist[i]));
        if (l === 0 && nl > 0) this.hosts++;
        c.load[i] = nl;
      }
  }

  /**
   * Let dt seconds pass. `grids[k]` is colony k's occupancy, current for this tick. For every
   * living ant: load from the ground and from the ants around it (any colony), less what its
   * nestmates groom off and what it clears on its own; and resistance from grooming visible
   * nestmates. Then the ground's spores fade. (`rec` is who a host feels as a foreigner by touch.)
   */
  step(colonies: readonly Colony[], grids: readonly CountGrid[], dt: number, rec: Recognition | null = null): void {
    if (!this.active) return;
    this.#made = 0;
    const hosts = this.#stepLayer(this.#layers[0] as SporeLayer, -1, colonies, grids, dt, rec);
    this.#grow(dt);
    this.hosts = hosts;
  }

  /**
   * step, on every map (one world): `grids[l]` and `recs[l]` are layer l's occupancy and recognition (recs null: no
   * rival). Each map's ants read and pass on load only among themselves, and take spores off that map; a queen and her
   * alates are on her colony's home layer.
   */
  stepLayers(
    colonies: readonly Colony[],
    grids: readonly (readonly CountGrid[])[],
    dt: number,
    recs: readonly Recognition[] | null = null,
  ): void {
    if (!this.active) return;
    this.#made = 0;
    let hosts = 0;
    this.#layers.forEach((L, l) => {
      hosts += this.#stepLayer(L, l, colonies, grids[l] as readonly CountGrid[], dt, recs?.[l] ?? null);
    });
    this.#grow(dt);
    this.hosts = hosts;
  }

  /**
   * One map's part of a step: the ants on layer `layer` (−1: every ant, the fungus on one map), their queens' and alates'
   * where `layer` is their home, then the spores taken and the ground fading. Returns the hosts after it.
   */
  #stepLayer(
    L: SporeLayer,
    layer: number,
    colonies: readonly Colony[],
    grids: readonly CountGrid[],
    dt: number,
    rec: Recognition | null,
  ): number {
    const p = this.params;
    const map = L.map;
    const { w, h } = map.size;
    const { x0 } = map;
    while (L.visible.length < colonies.length) L.visible.push(new LoadGrid());

    // Everyone's load before the step: what every ant reads.
    const all = L.all;
    all.reset();
    colonies.forEach((c, k) => {
      const vis = L.visible[k] as LoadGrid;
      vis.reset();
      for (let i = 0; i < c.n; i++) {
        const l = c.load[i];
        if (!c.alive[i] || l === 0 || (layer >= 0 && c.layer[i] !== layer)) continue;
        c.antCell(i);
        const cx = clampCol(map, CELL[0]);
        const cy = Math.min(h - 1, Math.max(0, CELL[1]));
        const s = c.strain[i];
        all.add(cx, cy, l, s);
        vis.add(cx, cy, l * this.#shows(c, i, s), s);
      }
      // The queen too (ja-lo8.7): a host like any, who passes it to the ants that tend her.
      const q = c.queen;
      if (q && q.alive && q.load > 0 && (layer < 0 || layer === c.home)) {
        cellOf(q.x, q.y);
        const qx = clampCol(map, CELL[0]);
        const qy = Math.min(h - 1, Math.max(0, CELL[1]));
        all.add(qx, qy, q.load, q.strain);
        vis.add(qx, qy, q.load * ((this.strains[q.strain] as Strain).visibility * q.show), q.strain);
      }
    });

    let hosts = 0;
    // Fungus the evolving strain makes in hosts this step (load passed on by contact): what it mutates from (#made, zeroed by the caller).
    const evolving = this.#evolution ? this.#evolution.strain : -1;
    const taken = L.taken;
    taken.length = 0;
    const nb = this.#nb;
    colonies.forEach((c, k) => {
      const vis = L.visible[k] as LoadGrid;
      for (let i = 0; i < c.n; i++) {
        if (!c.alive[i] || (layer >= 0 && c.layer[i] !== layer)) continue;
        c.antCell(i);
        const cx = clampCol(map, CELL[0]);
        const cy = Math.min(h - 1, Math.max(0, CELL[1]));
        const l = c.load[i];
        const ground = L.spores.get(cx, cy);
        const near = all.any(cx - 1, cy - 1, cx + 1, cy + 1);
        const seen = vis.any(cx - 1, cy - 1, cx + 1, cy + 1);
        if (l === 0 && ground === 0 && !near && !seen) continue;
        const r = c.resist[i];
        const s = c.strain[i];
        const st = this.strains[s] as Strain;
        this.#gather(L, cx, cy, k, grids, vis, near, seen);

        // Contact: the load-weighted share of the ants around (every colony, not counting itself) that carry the fungus.
        // Frequency-dependent, so a crowded nest is not an instant epidemic; its rate is bounded by the strain's.
        let contactGain = 0;
        let contactStrain = s;
        if (near) {
          const load = nb.load - l;
          const ants = nb.ants - 1;
          if (load > NOTHING && ants > 0) {
            contactStrain = all.strainAt(nb.topX, nb.topY);
            contactGain = (this.strains[contactStrain] as Strain).transmission * Math.min(1, load / ants);
          }
        }
        // Ground: spores on the ant's cell.
        const groundGain = p.pickup * ground;
        if (groundGain > 0) taken.push(cx, cy, groundGain * dt);

        // The strain coming in: the host's own, or for a clean ant whichever reaches it most. Only the evolving strain's
        // immune evasion slips past resistance (PR #43 review, N2: a lab strain in an evolving game is as listed).
        const into = l > 0 ? s : contactGain >= groundGain ? contactStrain : L.sporeStrain.get(cx, cy);
        const susceptible = (1 - r * (into === evolving ? this.#evade : 1)) * (1 - l);
        let gain = (contactGain + groundGain) * susceptible * dt;
        if (l === 0 && gain < p.minDose * dt) gain = 0;
        const strain = l === 0 && gain > 0 ? into : s;
        // New fungus is what contact passes on (the source keeps its load); spores picked up from the ground are fungus
        // moved, already counted when the mycelium grew them (PR #43 review, S2).
        if (gain > 0 && strain === evolving) this.#made += (gain * contactGain) / (contactGain + groundGain);

        // Grooming by nestmates around (at most p.groomers of them), and the host's own clearing.
        const mates = Math.max(0, nb.own - 1);
        const shows = this.#shows(c, i, s);
        const loss = l > 0 ? (p.grooming * shows * Math.min(p.groomers, mates) + st.decay) * l * dt : 0;
        // Priming: grooming visible nestmates leaves an ant resistant (its own visible load does not count).
        if (seen) {
          const v = nb.visible - l * shows;
          if (v > NOTHING) c.resist[i] = Math.min(1, r + p.priming * Math.min(1, v / Math.max(1, mates)) * (1 - r) * dt);
        }

        let nl = Math.min(1, Math.max(0, l + gain - loss));
        if (nl < p.clear && nl <= l) nl = 0;
        c.load[i] = nl;
        c.strain[i] = nl > 0 ? strain : 0;
        if (nl > 0) {
          hosts++;
          // What the fungus in this host senses, and what its policy has it do there (fungus-policy §11.2).
          const ns = this.strains[strain] as Strain;
          const sit: FungalSituation = {
            arousal: this.#arousal(c, i),
            touch: this.#touch(L, c, cx, cy, nb.ants - 1, rec, c.odour[i]),
            place: this.#place(L, layer, colonies, cx, cy),
            task: TASKS[Math.min(2, c.band(i))] ?? "forager",
            carrying: c.carrying[i] ? "food" : c.holdsBrood(i) ? "brood" : "nothing",
            // Groomed: enough nestmates are around to groom it off, at what its strain shows. Judged at the strain's
            // visibility, not at what the host shows now: a hidden host shows a quarter, and judging it by that would
            // read it as ungroomed the step after it hid, show it again, and hide it again, every step.
            groomed: p.grooming * ns.visibility * Math.min(p.groomers, mates) >= p.groomedAt,
          };
          c.fungal[i] = encodeFungal(sit);
          this.expressLevels(c, i, this.choose(sit, strain), nl);
        } else if (l > 0) {
          this.express(c, i, 0, 0);
          c.fungal[i] = -1;
        }
      }
    });

    // Each colony's queen, read against the same grids (on her home layer).
    colonies.forEach((c, k) => {
      if (layer >= 0 && layer !== c.home) return;
      if (this.#stepQueen(L, c, k, grids, dt, rec, evolving)) hosts++;
      // Alates (ja-lo8.9) pick it up from the nestmates they pass as they wait and walk out; it does nothing in them yet.
      for (const al of c.alates) this.#royalLoad(L, al, 1, k, grids, dt, false, evolving, this.params.groomers);
    });

    // Spores taken, then the ground fades.
    for (let k = 0; k < taken.length; k += 3) {
      const x = taken[k];
      const y = taken[k + 1];
      L.spores.set(x, y, Math.max(0, L.spores.get(x, y) - taken[k + 2]));
    }
    const keep = Math.exp(-p.sporeDecay * dt);
    for (const key of L.sporeCells) {
      const col = key % w;
      const y = (key - col) / w;
      const x = col + x0;
      const v = L.spores.get(x, y) * keep;
      if (v < SPORE_GONE) {
        L.spores.set(x, y, 0);
        L.sporeCells.delete(key);
      } else L.spores.set(x, y, v);
    }
    return hosts;
  }

  /**
   * The evolving fungus's body (evolution.ts), after a step: what it grew in hosts, and its mycelium growing on its patch
   * (its base, on every map) and putting out spores there, spread evenly over its cells and paid for out of its mass.
   */
  #grow(dt: number): void {
    const e = this.#evolution;
    if (!e) return;
    const p = this.params;
    const before = e.growth;
    e.replicate(this.#made);
    if (p.hyphae && this.#hyphae.some((h) => h)) {
      this.#growHyphae(dt, e);
      e.pace(e.growth - before, dt);
      return;
    }
    let cells = 0;
    for (const L of this.#layers) cells += L.base.length;
    if (cells) {
      const each = e.grow(dt) / cells;
      let unplaced = 0;
      for (const L of this.#layers) {
        const { w } = L.map.size;
        const { x0 } = L.map;
        for (const key of L.base) {
          const col = key % w;
          const y = (key - col) / w;
          const x = col + x0;
          const v = L.spores.get(x, y);
          const put = Math.max(0, Math.min(each, p.maxSpores - v));
          unplaced += each - put;
          L.spores.set(x, y, v + put);
          L.sporeStrain.set(x, y, e.strain);
          L.sporeCells.add(key);
        }
      }
      // Spores a full cell can't hold stay mycelium (PR #43 review, N3: they were paid for, then clipped away).
      if (unplaced > 0) e.refund(unplaced);
    }
    e.pace(e.growth - before, dt);
  }

  /**
   * The fungus in colony c's queen (ja-lo8.7), stepped as an ant's is: load from the ants around her (her attendants) and
   * the spores under her, less what the nestmates around her groom off and what clears on its own; then what the fungus
   * does in her, from what it senses there (task "queen", place "queen"): how much of it she shows, and how much of her
   * royal mark she lays. Returns whether she is a host after the step.
   */
  #stepQueen(
    L: SporeLayer,
    c: Colony,
    k: number,
    grids: readonly CountGrid[],
    dt: number,
    rec: Recognition | null,
    evolving: number,
  ): boolean {
    const q = c.queen;
    if (!q || !q.alive) return false;
    // Her retinue's larger cap is the evolving game's stop-gap (ja-k4k.12); a lab or test game grooms her as any host
    // (PR #43 review, S1: every game's queen dynamics were otherwise changed).
    const groomers = this.#evolution ? this.params.queenGroomers : this.params.groomers;
    const mates = this.#royalLoad(L, q, q.show, k, grids, dt, true, evolving, groomers);
    if (mates < 0) return false;
    if (q.load === 0) {
      q.show = 1;
      q.signal = 1;
      return false;
    }
    const p = this.params;
    const nl = q.load;
    const st = this.strains[q.strain] as Strain;
    const nb = this.#nb;
    const { h } = L.map.size;
    cellOf(q.x, q.y);
    const cx = clampCol(L.map, CELL[0]);
    const cy = Math.min(h - 1, Math.max(0, CELL[1]));
    const sit: FungalSituation = {
      arousal: "calm",
      touch: this.#touch(L, c, cx, cy, nb.ants, rec, null),
      place: "queen",
      task: "queen",
      carrying: "nothing",
      groomed: p.grooming * st.visibility * Math.min(groomers, mates) >= p.groomedAt,
    };
    const v = compose(this.held(this.choose(sit, q.strain), q.strain), this.#menu);
    q.show = v.show;
    q.signal = 1 + (v.queenSignal - 1) * nl;
    return true;
  }

  /**
   * The fungus's load in a royal body (the queen, ja-lo8.7; an alate, ja-lo8.9), stepped as an ant's is: load from the
   * ants around her and the spores under her, less what the nestmates around her groom off (× `show`) and what clears
   * on its own. `inGrid`: her own load is in the load grid (the queen's is; an alate's isn't). `evolving`: the game's
   * fungus's strain (its resistance evaded, its gains counted: ja-lo8.12); `groomers`: the most nestmates that groom her.
   * Sets her load and strain; returns the nestmates around her, or −1 when nothing reached her and she carries none.
   */
  #royalLoad(
    L: SporeLayer,
    b: { x: number; y: number; load: number; strain: number; resist: number },
    show: number,
    k: number,
    grids: readonly CountGrid[],
    dt: number,
    inGrid: boolean,
    evolving: number,
    groomers: number,
  ): number {
    const p = this.params;
    const { h } = L.map.size;
    cellOf(b.x, b.y);
    const cx = clampCol(L.map, CELL[0]);
    const cy = Math.min(h - 1, Math.max(0, CELL[1]));
    const l = b.load;
    const ground = L.spores.get(cx, cy);
    const near = L.all.any(cx - 1, cy - 1, cx + 1, cy + 1);
    if (l === 0 && ground === 0 && !near) return -1;
    const vis = L.visible[k] as LoadGrid;
    this.#gather(L, cx, cy, k, grids, vis, near, false);
    const nb = this.#nb;
    let contactGain = 0;
    let contactStrain = b.strain;
    if (near) {
      const load = nb.load - (inGrid ? l : 0); // her own load, if it is in the grid, is not the ants around her
      if (load > NOTHING && nb.ants > 0) {
        contactStrain = L.all.strainAt(nb.topX, nb.topY);
        contactGain = (this.strains[contactStrain] as Strain).transmission * Math.min(1, load / nb.ants);
      }
    }
    const groundGain = p.pickup * ground;
    if (groundGain > 0) L.taken.push(cx, cy, groundGain * dt);
    const into = l > 0 ? b.strain : contactGain >= groundGain ? contactStrain : L.sporeStrain.get(cx, cy);
    let gain = (contactGain + groundGain) * (1 - b.resist * (into === evolving ? this.#evade : 1)) * (1 - l) * dt;
    if (l === 0 && gain < p.minDose * dt) gain = 0;
    const strain = l === 0 && gain > 0 ? into : b.strain;
    if (gain > 0 && strain === evolving) this.#made += (gain * contactGain) / (contactGain + groundGain);
    const st = this.strains[strain] as Strain;
    const mates = nb.own; // the nestmates around her: her groomers
    const loss = l > 0 ? (p.grooming * st.visibility * show * Math.min(groomers, mates) + st.decay) * l * dt : 0;
    let nl = Math.min(1, Math.max(0, l + gain - loss));
    if (nl < p.clear && nl <= l) nl = 0;
    b.load = nl;
    b.strain = nl > 0 ? strain : 0;
    return mates;
  }

  /**
   * Who touches the host's cuticle, in its cell and the six around, by smell (fungus-policy §11): a foreigner when an ant
   * there smells of another colony (its odour further from the host colony's than the healthy tolerance: tolerated or
   * not, since whether they fight is arousal's), else a nestmate when any other ant is there, else none. By odour, not
   * by colony (PR #42 review, S4): as odours converge a foreign ant that smells like home reads as a nestmate, and an
   * estranged nestmate as a foreigner. `others`: the ants around, not counting the host; `own`: the host's own odour
   * (an ant is in the bands it counts; the queen is not), so a host that smells foreign itself does not count itself.
   */
  #touch(L: SporeLayer, c: Colony, cx: number, cy: number, others: number, rec: Recognition | null, own: number | null): FungalTouch {
    let foreign = 0;
    if (rec) {
      const tol = rec.params.tolerance;
      rec.look(c.nestOdour, tol);
      foreign = rec.around(cx, cy, L.map, 1, true);
      if (own !== null && Math.abs(binCentre(binOf(own)) - c.nestOdour) > tol + STRANGER_EPS) foreign -= 1;
    }
    return foreign > 0.5 ? "foreigner" : others - foreign > 0.5 ? "nestmate" : "none";
  }

  /**
   * The host's arousal, as the fungus in its body reads it (its amines: Bubak 2016): fighting while it perceives strangers
   * close, alarmed while it perceives alarm, else calm. From what the host last perceived when it chose (the bent
   * readings); a host that has not chosen since its last pick-up (a carrier) reads calm.
   */
  #arousal(c: Colony, i: number): Arousal {
    const q = c.lastQuestion(i);
    if (!q) return "calm";
    return q.enemy === "near" ? "fighting" : q.alarm !== "none" ? "alarmed" : "calm";
  }

  /**
   * The substrate under a host: outside on the open ground (the sky's side of the ground line in the side view; every
   * cell of a top-down map but a nest's disc), a tunnel, a chamber's floor, or by the queen, where her royal mark lies
   * on the floor (any colony's). A chamber is felt by its floor, not read from whose it is. On map L, layer `layer` (−1:
   * the fungus's one map).
   */
  #place(L: SporeLayer, layer: number, colonies: readonly Colony[], cx: number, cy: number): FungalPlace {
    const { map } = L;
    const ch = map.chambers;
    if (ch && map.sky) {
      if (map.sky.get(cx, cy) === 1) return "outside";
      if (ch.at(cx, cy) < 0) return "tunnel";
      for (const o of colonies) {
        const ph = layer < 0 ? o.ph : (o.layers[layer] as Layer).ph;
        if (ph.fields.royal && ph.fields.royal.get(cx, cy) >= ROYAL_FELT) return "queen";
      }
      return "chamber";
    }
    for (const n of map.nests) {
      const dx = cx + 0.5 - n.x;
      const dy = cy + 0.5 - n.y;
      if (dx * dx + dy * dy <= n.r * n.r) return "chamber";
    }
    return "outside";
  }

  /**
   * The cell (cx, cy) and its six neighbours, read in one pass: everyone's load and its most loaded cell
   * (when `load`), colony k's visible load (when `visible`), ants of every colony, and colony
   * k's own. Where they lie inside one chunk (~94 % of cells) each layer's chunk array is
   * fetched once and indexed; cells past a ragged map edge inside a chunk are never written,
   * so they read 0 like the clipped slow path.
   */
  #gather(
    L: SporeLayer,
    cx: number,
    cy: number,
    k: number,
    grids: readonly CountGrid[],
    vis: LoadGrid,
    load: boolean,
    visible: boolean,
  ): void {
    const nb = this.#nb;
    nb.load = nb.visible = nb.ants = nb.own = 0;
    nb.topX = cx;
    nb.topY = cy;
    const lx = cx & EDGE;
    const ly = cy & EDGE;
    if (lx > 0 && lx < EDGE && ly > 0 && ly < EDGE) {
      const bx = cx >> CHUNK_BITS;
      const by = cy >> CHUNK_BITS;
      const o = (ly << CHUNK_BITS) | lx;
      const around = AROUND[cy & 1] as number[];
      for (let j = 0; j < grids.length; j++) {
        const a = (grids[j] as CountGrid).layer.chunk(bx, by);
        if (!a) continue;
        let n = 0;
        for (const d of around) n += a[o + d];
        nb.ants += n;
        if (j === k) nb.own = n;
      }
      const la = load ? L.all.sum.chunk(bx, by) : undefined;
      if (la) {
        let top = 0;
        for (const d of around) {
          const v = la[o + d];
          nb.load += v;
          if (v > top) {
            top = v;
            const q = o + d;
            nb.topX = (bx << CHUNK_BITS) | (q & EDGE);
            nb.topY = (by << CHUNK_BITS) | (q >> CHUNK_BITS);
          }
        }
      }
      const va = visible ? vis.sum.chunk(bx, by) : undefined;
      if (va) for (const d of around) nb.visible += va[o + d];
      return;
    }
    const map = L.map;
    let top = 0;
    const o = discOffsets(1)[cy & 1] as Int16Array;
    for (let q = 0; q < o.length; q += 2) {
      const x = cx + o[q];
      const y = cy + o[q + 1];
      if (!inBounds(map, x, y)) continue;
      for (let j = 0; j < grids.length; j++) {
        const n = (grids[j] as CountGrid).get(x, y);
        nb.ants += n;
        if (j === k) nb.own += n;
      }
      if (load) {
        const v = L.all.get(x, y);
        nb.load += v;
        if (v > top) {
          top = v;
          nb.topX = x;
          nb.topY = y;
        }
      }
      if (visible) nb.visible += vis.get(x, y);
    }
  }

  /**
   * Let dt seconds pass, stepping only every `p.interval` seconds (a game tick is shorter): rates
   * are at most ~0.6 per second, so a 0.1 s step moves a load by at most ~6 %, the budget the
   * pheromone channels use. Like them, the step that comes due covers all the time owed.
   * Returns whether it stepped (the caller passes occupancy grids current for this tick).
   */
  advance(colonies: readonly Colony[], grids: readonly CountGrid[], dt: number, rec: Recognition | null = null): boolean {
    this.#clock += dt;
    if (this.#clock + 1e-9 < this.params.interval) return false;
    const owed = this.#clock;
    this.#clock = 0;
    this.step(colonies, grids, owed, rec);
    return true;
  }

  /** advance, on every map (one world): stepLayers when a step comes due. The clock is the fungus's one clock. */
  advanceLayers(
    colonies: readonly Colony[],
    grids: readonly (readonly CountGrid[])[],
    dt: number,
    recs: readonly Recognition[] | null = null,
  ): boolean {
    this.#clock += dt;
    if (this.#clock + 1e-9 < this.params.interval) return false;
    const owed = this.#clock;
    this.#clock = 0;
    this.stepLayers(colonies, grids, owed, recs);
    return true;
  }

  /** Whether the next advance by dt would step: a caller can skip building grids it would not use. */
  due(dt: number): boolean {
    return this.active && this.#clock + dt + 1e-9 >= this.params.interval;
  }

  /**
   * The share of ant i's load its nestmates can see: its strain's visibility, times what the fungus's "showing" lever
   * has it show (a dormant host shows a quarter: hiding is how it escapes grooming).
   */
  #shows(c: Colony, i: number, s: number): number {
    return (this.strains[s] as Strain).visibility * c.show[i];
  }

  /** The player's settings: the local rule's thresholds and the menu (§5.1, levers 4 and 5). */
  configure(rule: FungusRule, menu: Iterable<string>): void {
    this.rule = { ...rule };
    this.menu = menu;
  }

  /** The game's fungus evolving (ja-lo8.12), or null: every strain as listed, every lever its full range. */
  get evolution(): Evolution | null {
    return this.#evolution;
  }

  /**
   * The mycelium as hyphae (params.hyphae, docs/hyphal-growth.md): every map's tips step every TIP_STEP seconds (by the
   * Mycelium level) on the mass the body has grown and not yet embodied in hypha, shared by all their tips; then the
   * spores it puts out spread evenly over the cells its hyphae reach the air at (hyphae.ts sporeCellsOf).
   */
  #growHyphae(dt: number, e: Evolution): void {
    const p = this.params;
    const level = Math.min(TIP_STEP.length - 1, e.level("mycelium"));
    const every = TIP_STEP[level] as number;
    let length = 0;
    let tips = 0;
    for (const h of this.#hyphae)
      if (h) {
        length += h.length;
        tips += h.tips.length;
      }
    const budget = { free: Math.max(0, e.mass - length * HYPHA_MASS), tips };
    // Every map's tips step together, in turns (hyphae.ts stepRound), on the first map's clock.
    const maps: { h: Hyphae; g: Ground }[] = [];
    this.#hyphae.forEach((h, l) => {
      if (h) maps.push({ h, g: this.#ground(l) });
    });
    const clock = maps[0]!.h;
    clock.clock += dt;
    let stepped = false;
    while (clock.clock >= every) {
      clock.clock -= every;
      stepRound(maps, level, budget, this.growthPolicy);
      stepped = true;
    }
    // Hypha the ants have dug through is cut, and the mass it held is lost (ja-2bw.4: the colonies' counterplay).
    if (stepped)
      for (const { h, g } of maps) {
        const lost = h.cutDug(g);
        if (lost > 0) e.lose(lost * HYPHA_MASS);
      }
    // A tip that has reached a corpse (the midden's) colonises it.
    if (stepped && this.corpseAt)
      this.#hyphae.forEach((h, l) => {
        if (!h) return;
        for (const t of h.tips.slice())
          if (!(this.#corpses[l] as Map<number, number>).has(cellKey(t.x, t.y)) && this.corpseAt!(l, t.x, t.y) > 0)
            this.colonise(l, t.x, t.y);
      });
    // The corpses fruit, free: paid by the cadaver, not the mycelium.
    this.#corpses.forEach((corpses, l) => {
      const L = this.#layers[l] as SporeLayer;
      const { w } = L.map.size;
      const { x0 } = L.map;
      for (const [k, left] of corpses) {
        if (left <= 0) continue;
        const [x, y] = keyCell(k);
        const v = L.spores.get(x, y);
        const put = Math.max(0, Math.min(left, CORPSE.rate * dt, p.maxSpores - v));
        corpses.set(k, left - Math.min(left, CORPSE.rate * dt));
        if (put <= 0) continue;
        L.spores.set(x, y, v + put);
        L.sporeStrain.set(x, y, e.strain);
        L.sporeCells.add(y * w + x - x0);
      }
    });
    const spots: { L: SporeLayer; cells: number[] }[] = [];
    let cells = 0;
    this.#hyphae.forEach((h, l) => {
      if (!h) return;
      if (stepped || !this.#sporeSpots[l]) {
        // The patch fruits where it landed (its base), as without hyphae; spread over every dug cell the hyphae reach,
        // the same spores thinned the patch below an infecting dose (6 seeds of 10 took hold against 9, PRD §63.1), so
        // the hyphae fruit only where a tip chose to (the `fruit` answer, owner 2026-11-12), each spot a patch cell's share
        const L = this.#layers[l] as SporeLayer;
        const { w } = L.map.size;
        const { x0 } = L.map;
        const g = this.#ground(l);
        // and the spots where its tips fruited, while they are still dug (a spot filled in puts out nothing)
        const spots = h.fruits.filter((k) => {
          const [x, y] = keyCell(k);
          return g.kind(x, y) === "open";
        });
        this.#sporeSpots[l] = [
          ...new Set([
            ...L.base.map((key) => {
              const col = key % w;
              return cellKey(col + x0, (key - col) / w);
            }),
            ...spots,
          ]),
        ];
      }
      const c = this.#sporeSpots[l] as number[];
      cells += c.length;
      spots.push({ L: this.#layers[l] as SporeLayer, cells: c });
    });
    const out = e.grow(dt);
    if (!cells) {
      if (out > 0) e.refund(out);
      return;
    }
    const each = out / cells;
    let unplaced = 0;
    for (const { L, cells: c } of spots) {
      const { w } = L.map.size;
      const { x0 } = L.map;
      for (const k of c) {
        const [x, y] = keyCell(k);
        const v = L.spores.get(x, y);
        const put = Math.max(0, Math.min(each, p.maxSpores - v));
        unplaced += each - put;
        L.spores.set(x, y, v + put);
        L.sporeStrain.set(x, y, e.strain);
        L.sporeCells.add(y * w + x - x0);
      }
    }
    if (unplaced > 0) e.refund(unplaced);
  }

  /**
   * Strain `strain` becomes the game's fungus and starts to evolve from its weakest (evolution.ts): its spread traits
   * and every lever's reach come from what it has bought from then on. Once only: a fungus already evolving keeps on.
   */
  evolve(strain: number): Evolution {
    this.#evolution ??= new Evolution(Math.max(0, Math.min(this.strains.length - 1, Math.floor(strain))));
    this.#evolved();
    return this.#evolution;
  }

  /**
   * The evolving fungus takes root on the open cells within `radius` of (x, y) (Game.land): its base, which keeps
   * sporulating at the evolution's `spores` level. Nothing without an evolution.
   */
  root(x: number, y: number, radius: number, layer = 0): void {
    if (!this.#evolution) return;
    const L = this.#layers[layer] as SporeLayer;
    const { map } = L;
    const { w } = map.size;
    const { x0 } = map;
    const have = new Set(L.base);
    disc(map, x, y, radius, (cx, cy) => {
      if (!rockAt(map, cx, cy) && !have.has(cy * w + cx - x0)) L.base.push(cy * w + cx - x0);
    });
    this.#evolution.root();
    if (!this.params.hyphae) return;
    // As hyphae: the patch is the hyphae's first cells, and three tips set out from its rim, going outward (a weak start).
    const h = (this.#hyphae[layer] ??= new Hyphae());
    for (const key of L.base) {
      const col = key % w;
      h.addCell(col + x0, (key - col) / w);
    }
    cellOf(x, y);
    const cx = CELL[0];
    const cy = CELL[1];
    if (rockAt(map, cx, cy)) return;
    for (const d of ROOT_HEADINGS) {
      // Out from the middle along d to the patch's last cell that way.
      let px = cx;
      let py = cy;
      for (let k = 0; k <= radius + 1; k++) {
        const qx = nx(px, py, d);
        const qy = ny(py, d);
        if (!h.has(qx, qy)) break;
        px = qx;
        py = qy;
      }
      if (h.has(px, py)) h.root(px, py, d);
    }
  }

  /**
   * The fungus grows out of a corpse at cell (x, y) on map `layer` (ja-2bw.7, owner 2026-11-12): a new start, whose
   * tips set out from it; the cadaver's substance joins the mycelium (Evolution.feed); and it fruits there for free,
   * CORPSE.spores in all at CORPSE.rate a second, paid by the corpse. Another corpse on a cell already colonised adds its
   * spores. Nothing without hyphae and an evolving fungus, or on rock.
   */
  colonise(layer: number, x: number, y: number): void {
    const e = this.#evolution;
    if (!e || !this.params.hyphae) return;
    const L = this.#layers[layer];
    if (!L || rockAt(L.map, x, y)) return;
    const h = (this.#hyphae[layer] ??= new Hyphae());
    const k = cellKey(x, y);
    const corpses = this.#corpses[layer] as Map<number, number>;
    const fresh = !corpses.has(k);
    corpses.set(k, (corpses.get(k) ?? 0) + CORPSE.spores);
    e.feed(CORPSE.mass);
    if (!fresh) return;
    if (!h.has(x, y)) h.addCell(x, y);
    for (const d of CORPSE.headings) h.root(x, y, d);
  }

  /** Map `layer`'s corpses the fungus has grown out of, and the free spores each still has (the renderer, the tests). */
  corpsesOn(layer: number): ReadonlyMap<number, number> {
    return this.#corpses[layer] ?? new Map();
  }

  /**
   * One world: the hyphae also root on the walls of the shaft under a hole (layer `layer`, the curtain; `x`, `y` the
   * hole's entrance there), where `ja-yo3` put the mycelium: walking down the shaft from the entrance, the first soil
   * cell on each side takes a tip heading down. Nothing without hyphae and an evolving fungus.
   */
  rootShaft(layer: number, x: number, y: number): void {
    if (!this.#evolution || !this.params.hyphae) return;
    const L = this.#layers[layer];
    if (!L) return;
    const g = this.#ground(layer);
    cellOf(x, y);
    const sx = CELL[0];
    const sy = CELL[1];
    const h = (this.#hyphae[layer] ??= new Hyphae());
    let left = false;
    let right = false;
    for (let yy = sy; yy <= sy + SHAFT_ROWS && !(left && right); yy++) {
      if (g.kind(sx, yy) !== "open") continue;
      if (!left && g.kind(sx - 1, yy) === "soil") {
        h.root(sx - 1, yy, SW);
        h.soil.add(cellKey(sx - 1, yy));
        left = true;
      }
      if (!right && g.kind(sx + 1, yy) === "soil") {
        h.root(sx + 1, yy, SE);
        h.soil.add(cellKey(sx + 1, yy));
        right = true;
      }
    }
  }

  /**
   * Map `layer` has grown (one world's curtain, when a colony is founded on the line: oneWorld.ts growWorld). Its spore
   * cells and base are kept as y·w + x − x0, so they are re-keyed from its columns before, `was` (x0 and w then).
   */
  regrid(layer: number, was: { x0: number; w: number }): void {
    const L = this.#layers[layer];
    if (!L) return;
    const { w } = L.map.size;
    const { x0 } = L.map;
    if (w === was.w && x0 === was.x0) return;
    const rekey = (k: number) => {
      const col = k % was.w;
      return ((k - col) / was.w) * w + col + was.x0 - x0;
    };
    const cells = [...L.sporeCells];
    L.sporeCells.clear();
    for (const k of cells) L.sporeCells.add(rekey(k));
    L.base = L.base.map(rekey);
  }

  /** Cells of the fungus's base (root) on `map` (layer 0). */
  get base(): readonly number[] {
    return (this.#layers[0] as SporeLayer).base;
  }

  /** Buy the next level of upgrade `id` (evolution.UPGRADES) with the fungus's biomass; false when it can't. */
  upgrade(id: string): boolean {
    if (!this.#evolution?.buy(id)) return false;
    this.#evolved();
    return true;
  }

  /**
   * The levels a host of strain index `s` runs for these wanted levels: held to the fungus's reach (levers.hold) when it
   * carries the evolving strain; another strain's host (painted in by a test or script) runs them as they are. What the
   * panel shows as enacted.
   */
  held(levels: LeverLevels, s: number): LeverLevels {
    return this.#evolution && s === this.#evolution.strain ? hold(levels, this.#reach) : levels;
  }

  /** The evolution's traits onto its strain, and its reach and evasion onto every host from the next step. */
  #evolved(): void {
    const e = this.#evolution;
    if (!e) {
      // No evolution (a load of a save without one): every strain as listed again (PR #43 review, N4).
      this.strains.forEach((s, k) => {
        const listed = this.#listed[k] as Strain;
        s.transmission = listed.transmission;
        s.decay = listed.decay;
      });
      this.#reach = null;
      this.#evade = 1;
      return;
    }
    const t = e.traits();
    const s = this.strains[e.strain] as Strain;
    s.transmission = t.transmission;
    s.decay = t.decay;
    this.#evade = 1 - t.evasion;
    this.#reach = e.reach();
  }

  /** The local rule with the player's settings. */
  local(s: FungalSituation): string {
    return localFungusRule(this.rule)(s);
  }

  /** The levers Jev is asked to set in a worker, in table order: what the menu has on (ja-lo8.4). */
  get asked(): string[] {
    return askedLevers(this.#menu, false);
  }

  /** The levers asked for a host in situation s: a queen's (ja-lo8.7) or a worker's, of what the menu has on. */
  askedFor(s: FungalSituation): string[] {
    return askedLevers(this.#menu, s.task === "queen");
  }

  /**
   * The levels a host of strain index `s` runs in situation `sit`: the policy's answer (Jev's levels over the levers
   * asked, or a preset's id), else the strain's own default preset. Levers the menu has off are left as they are when
   * the levels are expressed (levers.compose), so a host never pulls a lever the player has off, whatever any policy
   * answers.
   */
  choose(sit: FungalSituation, s: number): LeverLevels {
    return this.resolve((this.policy ?? ((x: FungalSituation) => this.local(x)))(sit), s, sit.task === "queen");
  }

  /** A policy's answer (Jev's levels, a preset's id, or STRAIN_DEFAULT) as levels, for a host of strain index `s` (a queen: `queen`). */
  resolve(answer: string, s: number, queen = false): LeverLevels {
    const fallback = (this.strains[s] as Strain | undefined)?.expresses ?? "dormant";
    const id = answer === STRAIN_DEFAULT ? fallback : answer;
    const p = PRESETS.find((x) => x.id === id);
    if (p) return p.levels;
    return (
      decodeLevels(answer, queen ? askedLevers(this.#menu, true) : this.asked) ?? (PRESETS.find((x) => x.id === fallback) as Preset).levels
    );
  }

  /** Run preset e (an index into PRESETS) in ant i of colony c at load l, whatever the menu says: a lab and test helper (the step goes through expressLevels under the menu). */
  express(c: Colony, i: number, e: number, l: number): void {
    this.expressLevels(c, i, (PRESETS[e] as Preset | undefined)?.levels ?? {}, l, null);
  }

  /**
   * Run these levels in ant i of colony c at load l: each lever on `menu` at its level held to the fungus's reach
   * (levers.hold, levers.compose), the host's perception and emission the lerp from as-is to those values by l. `expr`
   * names the preset they are, as held, or CUSTOM.
   */
  expressLevels(c: Colony, i: number, wanted: LeverLevels, l: number, menu: ReadonlySet<string> | null = this.#menu): void {
    // Held to the fungus's reach (ja-lo8.12) in a host of the evolving strain, except where a lab or test runs a preset
    // whatever the menu says.
    const levels = menu ? this.held(wanted, c.strain[i]) : wanted;
    c.expr[i] = presetOf(levels, menu ?? undefined);
    if (l <= 0) {
      c.asIs(i);
      return;
    }
    const v = compose(levels, menu ?? undefined);
    c.gainFood[i] = 1 + (v.food - 1) * l;
    c.gainHome[i] = 1 + (v.home - 1) * l;
    c.gainAlarm[i] = 1 + (v.alarm - 1) * l;
    c.foreignFood[i] = v.foreignFood * l;
    c.clock[i] = 1 + (v.clock - 1) * l;
    c.calm[i] = v.calm * l;
    c.tolerance[i] = c.params.tolerance + v.tolerance * l;
    c.mask[i] = v.mask * l;
    c.layGain[i] = 1 + (v.lay - 1) * l;
    c.crossLay[i] = v.crossLay * l;
    c.quiet[i] = v.quiet * l;
    // Cull is all or nothing in effect (an odour pushed half-way is still within tolerance of its nest's), so it
    // takes full effect from a high load, where the local rule culls, instead of from a full one.
    c.estrange[i] = v.estrange * Math.min(1, l / HIGH_LOAD);
    c.gainMarks[i] = 1 + (v.marks - 1) * l;
    c.swapMarks[i] = v.swap * l;
    c.scentGain[i] = 1 + (v.queenScent - 1) * l;
    // Regicide grows with the load, like the perception levers: the spores a host passes to the queen and brood it tends
    // (review of #27: from a high load only, grooming took every host below it within seconds, and no queen died).
    c.regicide[i] = v.regicide * l;
    // Hiding is not lerped: a dormant host shows a quarter at any load, as before (DORMANT_SHOW).
    c.show[i] = v.show;
  }

  /** How far the fungus is into colony c, and how far c has answered it. */
  census(c: Colony): Census {
    let living = 0;
    let infected = 0;
    let load = 0;
    let resist = 0;
    for (let i = 0; i < c.n; i++) {
      if (!c.alive[i]) continue;
      living++;
      resist += c.resist[i];
      const l = c.load[i];
      if (l >= INFECTED) {
        infected++;
        load += l;
      }
    }
    return { infected, living, meanLoad: infected ? load / infected : 0, meanResist: living ? resist / living : 0 };
  }

  /** The fungus's state for a save (save.ts): the ground's spores, its settings, its menu and clock. Its policy is the page's to wire. */
  saveState(): Record<string, unknown> {
    const L = this.#layers[0] as SporeLayer;
    const out: Record<string, unknown> = {
      spores: encode(this.spores),
      sporeStrain: encode(this.sporeStrain),
      sporeCells: encode(L.sporeCells),
      hosts: this.hosts,
      rule: encode(this.rule),
      params: encode(this.params),
      menu: encode(this.#menu),
      clock: this.#clock,
      evolution: this.#evolution?.save() ?? null,
      base: [...L.base],
      hyphae: this.#hyphae.map((h) => h?.save() ?? null),
      corpses: this.#corpses.map((m) => [...m]),
    };
    // One world (U4b): every other map's spores, their cells and the base there (SPORE_LAYER_STATE), from layer 1 on.
    if (this.#layers.length > 1)
      out.layers = this.#layers.slice(1).map((M) => ({
        spores: encode(M.spores),
        sporeStrain: encode(M.sporeStrain),
        sporeCells: encode(M.sporeCells),
        base: [...M.base],
      }));
    return out;
  }

  loadState(r: Record<string, unknown>): void {
    fillLike(this.spores, r.spores);
    fillLike(this.sporeStrain, r.sporeStrain);
    const L = this.#layers[0] as SporeLayer;
    fillLike(L.sporeCells, r.sporeCells);
    this.hosts = r.hosts as number;
    this.rule = decode(r.rule) as FungusRule;
    this.params = { ...DEFAULT_FUNGUS, ...(decode(r.params) as Partial<FungusParams>) };
    this.menu = decode(r.menu) as Set<string>;
    this.#clock = r.clock as number;
    const e = r.evolution as EvolutionSave | null | undefined;
    this.#evolution = e ? Evolution.load(e) : null;
    L.base = [...((r.base as number[] | undefined) ?? [])];
    const layers = r.layers as Record<string, unknown>[] | undefined;
    if (layers) {
      if (layers.length !== this.#layers.length - 1)
        throw new Error(`save: the fungus saved on ${layers.length + 1} maps, here ${this.#layers.length}`);
      layers.forEach((x, k) => {
        const M = this.#layers[k + 1] as SporeLayer;
        for (const key of SPORE_LAYER_STATE)
          if (key === "base") M.base = [...((x.base as number[] | undefined) ?? [])];
          else fillLike(M[key], x[key]);
      });
    }
    const hy = (r.hyphae as (HyphaeSave | null)[] | undefined) ?? [];
    this.#hyphae.forEach((_, l) => {
      const x = hy[l];
      this.#hyphae[l] = x ? Hyphae.load(x) : null;
    });
    this.#sporeSpots = [];
    const corpses = (r.corpses as [number, number][][] | undefined) ?? [];
    this.#corpses.forEach((m, l) => {
      m.clear();
      for (const [k, v] of corpses[l] ?? []) m.set(k, v);
    });
    this.#evolved();
  }
}
