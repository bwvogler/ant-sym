import type { CountGrid } from "./battle.ts";
import { CHUNK, CHUNK_BITS, ChunkLayer } from "./chunks.ts";
import type { Colony } from "./colony.ts";
import { rockAt, type WorldMap } from "./world.ts";

// The fungus, pure: the player. It has no body on the map of its own, only
// spores on the ground and load inside ants (docs/fungus-policy.md). This
// module is how it gets there and how it moves (ja-t4d.1): the spore brush,
// contact transmission across colonies, and the colony's answer to it,
// grooming, which clears visible load and primes the groomers against it.
// It never touches an ant's choices: later slices bend what an infected ant
// perceives, and its own policy still decides.
//
// Every ant carries `load` (0..1), `strain` (which trait set infected it),
// `resist` (immune priming, 0..1) and `expr` (the intervention the fungus
// runs in it). An intervention is a bundle of levers on the host; the levers
// so far bend what the host perceives (ja-t4d.2, docs/fungus-policy.md §2):
// scent gains, smelling the rival's food trail, and its sense of time out.
// The host's own policy then decides from that bent state. Until the fungus
// policy lands (ja-t4d.5), a host runs its strain's default intervention.
//
// One step reads only grids built from everyone's load before the step, and
// each ant writes only its own load, so the order colonies are listed in is no
// edge (compare ja-slv). Spores taken from the ground are pooled and taken
// after everyone has read the cell. Nothing here draws a random number, so a
// game with no spores painted runs exactly as it did before.

/**
 * What an intervention does to a host at full load; a host at load l gets the lerp from "as it is" by l.
 * Each lever is one of Colony's perception arrays.
 */
export interface Levers {
  /** food scent gain (A1) */
  food: number;
  /** home scent gain (A2) */
  home: number;
  /** alarm gain (A4) */
  alarm: number;
  /** the rival's food trail smelled as food scent, × this (A3) */
  foreignFood: number;
  /** the host's sense of time out: tired after patience × this (A10) */
  clock: number;
  /** the calming cue the host gives off, 0..1: lowers the aggression it receives and gives (B1, Rickia's n-C23) */
  calm: number;
  /** added to the host's tolerance: it perceives fewer ants as strangers (B4) */
  tolerance: number;
  /** the fungal share of the host's odour, 0..MAX_MASK: the fungus's own odour, between the colonies' (B3/B7) */
  mask: number;
}

/** The world as it is. */
export const AS_IS: Levers = { food: 1, home: 1, alarm: 1, foreignFood: 0, clock: 1, calm: 0, tolerance: 0, mask: 0 };

/** One thing the fungus can run in a host: a bundle of levers (docs/fungus-policy.md §5.2). */
export interface Intervention {
  id: string;
  name: string;
  /** what it does, for the panel and the follow card */
  blurb: string;
  levers: Levers;
}

/**
 * The interventions the levers so far can express. Index 0 is dormant (a host's `expr` starts there).
 * Later slices extend the levers (recognition, emission, body) and add the rest of §5.2's menu
 * (sporulate, blend, cull); new ones are appended so a host's index keeps its meaning.
 */
export const INTERVENTIONS: readonly Intervention[] = [
  { id: "dormant", name: "dormant", blurb: "does nothing to its host", levers: AS_IS },
  { id: "soothe", name: "soothe", blurb: "its host gives off a calming cue, tolerates strangers and barely smells alarm", levers: { ...AS_IS, alarm: 0.25, calm: 0.8, tolerance: 0.3 } },
  { id: "share", name: "share", blurb: "its host smells the rival's food trail as its own, and food scent strongly", levers: { ...AS_IS, food: 1.5, foreignFood: 1 } },
  { id: "roam", name: "roam", blurb: "its host barely smells home and feels its time out slowly, so it ranges far", levers: { ...AS_IS, home: 0.35, clock: 2.5 } },
  { id: "blend", name: "blend", blurb: "its host carries the fungus's own odour, between the colonies', and tolerates the odours in between", levers: { ...AS_IS, mask: 0.6, tolerance: 0.15 } },
];

/** The index of an intervention by id. */
export function intervention(id: string): number {
  const k = INTERVENTIONS.findIndex((v) => v.id === id);
  if (k < 0) throw new Error(`no intervention "${id}"`);
  return k;
}

/** A strain: one trait set of the fungus. The brush paints with one; later organisms are other trait sets (§5.1). */
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
  /** the intervention (an id in INTERVENTIONS) its hosts run until the fungus policy chooses (ja-t4d.5) */
  expresses: string;
}

/**
 * Strains from the two ends of the stealth-against-potency dial (§6), and one between:
 * Lockpick after *Rickia wasmannii* (non-lethal, colony-wide, barely groomed; calms),
 * Bloom after *Metarhizium* (spreads fast, visible, groomed off, immunises the groomers),
 * Garden after the leafcutter's cultivar, whose odour becomes the colony's (blends odours).
 */
export const STRAINS: readonly Strain[] = [
  { id: "lockpick", name: "Lockpick", blurb: "spreads slowly, hides, never clears on its own; its hosts barely smell alarm", transmission: 0.15, decay: 0, visibility: 0.1, expresses: "soothe" },
  { id: "bloom", name: "Bloom", blurb: "spreads fast, shows, is groomed off and leaves the groomers resistant; its hosts smell the rival's food trail as their own", transmission: 0.6, decay: 0.01, visibility: 0.8, expresses: "share" },
  { id: "garden", name: "Garden", blurb: "spreads steadily and half-shows; its hosts carry its own odour, so colonies that grow it come to smell alike", transmission: 0.3, decay: 0, visibility: 0.3, expresses: "blend" },
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
  /** resistance gained per second at full visible load on the nestmates around (immune priming, Konrad et al. 2012) */
  priming: number;
  /** below this a host is clean again */
  clear: number;
  /** seconds between steps when the game advances the fungus (Game.tick) */
  interval: number;
}

export const DEFAULT_FUNGUS: FungusParams = { pickup: 0.3, sporeDecay: 0.03, maxSpores: 6, grooming: 0.12, groomers: 4, priming: 0.02, clear: 0.002, interval: 0.1 };

/** Load at or above which an ant counts as infected in the panel and the renderer. */
export const INFECTED = 0.05;

/**
 * Below this, a neighbourhood's load (less the ant's own) is nothing. The grids sum in Float32, so
 * taking an ant's own float64 load back out leaves ~1e-8 behind; real contributions are ≥ ~2e-4.
 */
const NOTHING = 1e-6;

/** Ground spores below this are gone. */
const SPORE_GONE = 1e-3;

const BLOCK_BITS = 3;
/** The last local coordinate in a chunk. */
const EDGE = CHUNK - 1;
/** Offsets of the 3×3 cells around a cell, inside one chunk's array. */
const AROUND = [-CHUNK - 1, -CHUNK, -CHUNK + 1, -1, 0, 1, CHUNK - 1, CHUNK, CHUNK + 1];

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
      const x = t[k] as number;
      const y = t[k + 1] as number;
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
    for (let by = y0 >> BLOCK_BITS; by <= y1 >> BLOCK_BITS; by++) for (let bx = x0 >> BLOCK_BITS; bx <= x1 >> BLOCK_BITS; bx++) if (this.#blocks.get(bx, by) > 0) return true;
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

export class Fungus {
  readonly map: WorldMap;
  params: FungusParams;
  readonly strains: readonly Strain[];
  /** spores on the ground, per cell */
  readonly spores = new ChunkLayer((n) => new Float32Array(n), 0);
  /** the strain of the spores on each cell (the last one painted there) */
  readonly sporeStrain = new ChunkLayer((n) => new Uint8Array(n), 0);
  /** cells holding spores, as y * w + x */
  readonly #sporeCells = new Set<number>();
  /** everyone's load, for transmission */
  readonly #all = new LoadGrid();
  /** each colony's visible load, for grooming's priming */
  #visible: LoadGrid[] = [];
  /** spores taken this step, as x, y, amount: taken after every ant has read its cell */
  #taken: number[] = [];
  /** loaded ants after the last step or paint: zero (and no spores) means the step has nothing to do */
  hosts = 0;
  /** seconds owed since the last step (advance) */
  #clock = 0;
  /** what #gather read around the ant being stepped */
  readonly #nb = { load: 0, topX: 0, topY: 0, visible: 0, ants: 0, own: 0 };

  constructor(map: WorldMap, params: Partial<FungusParams> = {}, strains: readonly Strain[] = STRAINS) {
    this.map = map;
    this.params = { ...DEFAULT_FUNGUS, ...params };
    this.strains = strains;
  }

  /** Whether there is anything for a step to do: spores on the ground or load in any ant. */
  get active(): boolean {
    return this.hosts > 0 || this.#sporeCells.size > 0;
  }

  /** Cells holding spores. */
  get sporeCells(): number {
    return this.#sporeCells.size;
  }

  /**
   * The spore brush: spores on every open cell within `radius` of (x, y), and a direct dose of
   * load into every living ant there, of either colony, with strain `strain`. An ant already
   * carrying another strain keeps it (first in holds the host); the dose still adds load.
   */
  paint(colonies: readonly Colony[], x: number, y: number, radius: number, spores: number, dose: number, strain: number): void {
    const { w, h } = this.map.size;
    const s = Math.max(0, Math.min(this.strains.length - 1, Math.floor(strain)));
    const r2 = radius * radius;
    for (let cy = Math.max(0, Math.floor(y - radius)); cy <= Math.min(h - 1, Math.floor(y + radius)); cy++)
      for (let cx = Math.max(0, Math.floor(x - radius)); cx <= Math.min(w - 1, Math.floor(x + radius)); cx++) {
        const dx = cx + 0.5 - x;
        const dy = cy + 0.5 - y;
        if (dx * dx + dy * dy > r2 || rockAt(this.map, cx, cy)) continue;
        this.spores.set(cx, cy, Math.min(this.params.maxSpores, this.spores.get(cx, cy) + spores));
        this.sporeStrain.set(cx, cy, s);
        this.#sporeCells.add(cy * w + cx);
      }
    for (const c of colonies)
      for (let i = 0; i < c.n; i++) {
        if (!c.alive[i]) continue;
        const dx = (c.x[i] as number) - x;
        const dy = (c.y[i] as number) - y;
        if (dx * dx + dy * dy > r2) continue;
        const l = c.load[i] as number;
        if (l === 0) c.strain[i] = s;
        const nl = Math.min(1, l + dose * (1 - (c.resist[i] as number)));
        if (l === 0 && nl > 0) this.hosts++;
        c.load[i] = nl;
      }
  }

  /**
   * Let dt seconds pass. `grids[k]` is colony k's occupancy, current for this tick. For every
   * living ant: load from the ground and from the ants around it (any colony), less what its
   * nestmates groom off and what it clears on its own; and resistance from grooming visible
   * nestmates. Then the ground's spores fade.
   */
  step(colonies: readonly Colony[], grids: readonly CountGrid[], dt: number): void {
    if (!this.active) return;
    const p = this.params;
    const { w, h } = this.map.size;
    while (this.#visible.length < colonies.length) this.#visible.push(new LoadGrid());

    // Everyone's load before the step: what every ant reads.
    const all = this.#all;
    all.reset();
    colonies.forEach((c, k) => {
      const vis = this.#visible[k] as LoadGrid;
      vis.reset();
      for (let i = 0; i < c.n; i++) {
        const l = c.load[i] as number;
        if (!c.alive[i] || l === 0) continue;
        const cx = Math.min(w - 1, Math.max(0, Math.floor(c.x[i] as number)));
        const cy = Math.min(h - 1, Math.max(0, Math.floor(c.y[i] as number)));
        const s = c.strain[i] as number;
        all.add(cx, cy, l, s);
        vis.add(cx, cy, l * (this.strains[s] as Strain).visibility, s);
      }
    });

    let hosts = 0;
    const taken = this.#taken;
    taken.length = 0;
    const nb = this.#nb;
    colonies.forEach((c, k) => {
      const vis = this.#visible[k] as LoadGrid;
      for (let i = 0; i < c.n; i++) {
        if (!c.alive[i]) continue;
        const cx = Math.min(w - 1, Math.max(0, Math.floor(c.x[i] as number)));
        const cy = Math.min(h - 1, Math.max(0, Math.floor(c.y[i] as number)));
        const l = c.load[i] as number;
        const ground = this.spores.get(cx, cy);
        const near = all.any(cx - 1, cy - 1, cx + 1, cy + 1);
        const seen = vis.any(cx - 1, cy - 1, cx + 1, cy + 1);
        if (l === 0 && ground === 0 && !near && !seen) continue;
        const r = c.resist[i] as number;
        const s = c.strain[i] as number;
        const st = this.strains[s] as Strain;
        this.#gather(cx, cy, k, grids, vis, near, seen);

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

        const susceptible = (1 - r) * (1 - l);
        const gain = (contactGain + groundGain) * susceptible * dt;
        let strain = s;
        if (l === 0 && gain > 0) strain = contactGain >= groundGain ? contactStrain : this.sporeStrain.get(cx, cy);

        // Grooming by nestmates around (at most p.groomers of them), and the host's own clearing.
        const mates = Math.max(0, nb.own - 1);
        const loss = l > 0 ? (p.grooming * st.visibility * Math.min(p.groomers, mates) + st.decay) * l * dt : 0;
        // Priming: grooming visible nestmates leaves an ant resistant (its own visible load does not count).
        if (seen) {
          const v = nb.visible - l * st.visibility;
          if (v > NOTHING) c.resist[i] = Math.min(1, r + p.priming * Math.min(1, v / Math.max(1, mates)) * (1 - r) * dt);
        }

        let nl = Math.min(1, Math.max(0, l + gain - loss));
        if (nl < p.clear) nl = 0;
        c.load[i] = nl;
        c.strain[i] = nl > 0 ? strain : 0;
        if (nl > 0) {
          hosts++;
          this.express(c, i, this.#expression(strain), nl);
        } else if (l > 0) this.express(c, i, 0, 0);
      }
    });

    // Spores taken, then the ground fades.
    for (let k = 0; k < taken.length; k += 3) {
      const x = taken[k] as number;
      const y = taken[k + 1] as number;
      this.spores.set(x, y, Math.max(0, this.spores.get(x, y) - (taken[k + 2] as number)));
    }
    const keep = Math.exp(-p.sporeDecay * dt);
    for (const key of this.#sporeCells) {
      const x = key % w;
      const y = (key - x) / w;
      const v = this.spores.get(x, y) * keep;
      if (v < SPORE_GONE) {
        this.spores.set(x, y, 0);
        this.#sporeCells.delete(key);
      } else this.spores.set(x, y, v);
    }
    this.hosts = hosts;
  }

  /**
   * The 3×3 cells around (cx, cy), read in one pass: everyone's load and its most loaded cell
   * (when `load`), colony k's visible load (when `visible`), ants of every colony, and colony
   * k's own. Where the 3×3 lies inside one chunk (~94 % of cells) each layer's chunk array is
   * fetched once and indexed; cells past a ragged map edge inside a chunk are never written,
   * so they read 0 like the clipped slow path.
   */
  #gather(cx: number, cy: number, k: number, grids: readonly CountGrid[], vis: LoadGrid, load: boolean, visible: boolean): void {
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
      for (let j = 0; j < grids.length; j++) {
        const a = (grids[j] as CountGrid).layer.chunk(bx, by);
        if (!a) continue;
        let n = 0;
        for (const d of AROUND) n += a[o + d] as number;
        nb.ants += n;
        if (j === k) nb.own = n;
      }
      const la = load ? this.#all.sum.chunk(bx, by) : undefined;
      if (la) {
        let top = 0;
        for (const d of AROUND) {
          const v = la[o + d] as number;
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
      if (va) for (const d of AROUND) nb.visible += va[o + d] as number;
      return;
    }
    const { w, h } = this.map.size;
    let top = 0;
    for (let y = Math.max(0, cy - 1); y <= Math.min(h - 1, cy + 1); y++)
      for (let x = Math.max(0, cx - 1); x <= Math.min(w - 1, cx + 1); x++) {
        for (let j = 0; j < grids.length; j++) {
          const n = (grids[j] as CountGrid).get(x, y);
          nb.ants += n;
          if (j === k) nb.own += n;
        }
        if (load) {
          const v = this.#all.get(x, y);
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
  advance(colonies: readonly Colony[], grids: readonly CountGrid[], dt: number): boolean {
    this.#clock += dt;
    if (this.#clock + 1e-9 < this.params.interval) return false;
    const owed = this.#clock;
    this.#clock = 0;
    this.step(colonies, grids, owed);
    return true;
  }

  /** Whether the next advance by dt would step: a caller can skip building grids it would not use. */
  due(dt: number): boolean {
    return this.active && this.#clock + dt + 1e-9 >= this.params.interval;
  }

  /**
   * The intervention a host of strain s runs. Until the fungus policy (ja-t4d.5) this is the strain's
   * default; the policy replaces this one method.
   */
  #expression(s: number): number {
    return intervention((this.strains[s] as Strain).expresses);
  }

  /** Run intervention e in ant i of colony c at load l: its perception is the lerp from as-is to the levers by l. */
  express(c: Colony, i: number, e: number, l: number): void {
    c.expr[i] = e;
    if (e === 0 || l <= 0) {
      c.asIs(i);
      return;
    }
    const v = (INTERVENTIONS[e] as Intervention).levers;
    c.gainFood[i] = 1 + (v.food - 1) * l;
    c.gainHome[i] = 1 + (v.home - 1) * l;
    c.gainAlarm[i] = 1 + (v.alarm - 1) * l;
    c.foreignFood[i] = v.foreignFood * l;
    c.clock[i] = 1 + (v.clock - 1) * l;
    c.calm[i] = v.calm * l;
    c.tolerance[i] = c.params.tolerance + v.tolerance * l;
    c.mask[i] = v.mask * l;
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
      resist += c.resist[i] as number;
      const l = c.load[i] as number;
      if (l >= INFECTED) {
        infected++;
        load += l;
      }
    }
    return { infected, living, meanLoad: infected ? load / infected : 0, meanResist: living ? resist / living : 0 };
  }
}
