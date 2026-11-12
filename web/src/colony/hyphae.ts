import { nx, ny } from "./hex.ts";

// The mycelium as hyphae (docs/hyphal-growth.md, PRD §61, ja-2bw), pure. A hypha is a chain of cells, each with its
// parent, so the mycelium is a tree; its tips are where it grows. Every TIP_STEP seconds each tip senses its situation
// (what is ahead, how exposed it is, its supply) and the growth policy answers grow, left, right, branch, rest or fuse.
// The local rule here is the biology of docs/hyphal-growth.md §1–4: slide along a wall met at a glance, split against
// one met head on, turn from its own hyphae, branch once its run reaches the growth unit, drift back to its first
// heading, rest on short supply. The hyphae embody the mycelium's mass (evolution.ts): they are at most mass ÷
// HYPHA_MASS cells long, so a tip extends only on mass the body has grown and not yet spent on hypha. Nothing here draws
// a random number: a choice between two sides goes by the tip's own count of steps.

/** A hyphal tip: its cell, its heading (a hex direction, hex.ts E…NE), the heading it set out on, and its run since it last branched. */
export interface Tip {
  x: number;
  y: number;
  heading: number;
  /** the heading it first set out on: directional memory (Held et al. 2019) */
  first: number;
  /** cells grown since its last branch: the local rule branches at BRANCH_RUN, so length ÷ tips settles at HGU (Trinci 1974) */
  run: number;
}

/** A cell as one number (columns may be negative: one world's curtain). */
export const cellKey = (x: number, y: number): number => (y + 32768) * 131072 + (x + 32768);
/** A key's cell. */
export const keyCell = (k: number): [number, number] => [(k % 131072) - 32768, Math.floor(k / 131072) - 32768];

/** No parent: a cell the mycelium rooted in. */
export const ROOT = -1;

/** Mass one cell of hypha embodies (design: docs/hyphal-growth.md §4). */
export const HYPHA_MASS = 0.25;
/** The hyphal growth unit the local rule settles to, length ÷ tips (design: Trinci 1974 gives no value here). */
export const HGU = 8;
/**
 * Cells a tip grows between branches, and how far into its run a new branch starts (staggered, so a mycelium's tips
 * don't all branch on the same round). Chosen so that, with every tip growing a cell a round, length ÷ tips settles
 * within a few percent of HGU (7.9–8.3) instead of see-sawing: with no stagger and a run of 8 it swings 8.7–15.
 */
export const BRANCH_RUN = 7;
export const BRANCH_START = 2;
/** Seconds between a tip's steps, by Mycelium level (a thread, a borer, a web): the growth factor (design). */
export const TIP_STEP: readonly number[] = [2, 1.5, 1];
/** A tip's supply is ample while the free mass would pay for this many steps of every tip; less is short. */
export const AMPLE_STEPS = 2;

/** What a tip meets ahead. */
export const AHEADS = ["soil", "open", "rock", "own"] as const;
export type Ahead = (typeof AHEADS)[number];
/** Where a tip is: buried in soil, in soil with a dug cell beside it (a tunnel's wall), or out in a dug cell. */
export const EXPOSURES = ["buried", "wall", "open"] as const;
export type Exposure = (typeof EXPOSURES)[number];
export const SUPPLIES = ["short", "ample"] as const;
export type Supply = (typeof SUPPLIES)[number];
/** What a tip senses at its step (the growth lane's situation, ja-2bw.5): 4 × 3 × 2 = 24. */
export interface GrowthSituation {
  ahead: Ahead;
  exposed: Exposure;
  supply: Supply;
}
/** What a tip does at its step. */
export const GROWTH_ANSWERS = ["grow", "left", "right", "branch", "rest", "fuse"] as const;
export type GrowthAnswer = (typeof GROWTH_ANSWERS)[number];

/**
 * The ground a mycelium grows in, as a tip can feel it. `kind`: what (x, y) is to a hypha: soil to grow through, open
 * (a dug cell: a tunnel or chamber, air) or rock (rock, sky, off the map). `topsoil`: the map is the plane, read as the
 * topsoil just under the surface (owner, 2026-11-12): every open cell there is soil to a hypha, and nothing is exposed.
 */
export interface Ground {
  kind(x: number, y: number): "soil" | "open" | "rock";
  topsoil: boolean;
}

/** The six directions round from `d` by `k` (positive: clockwise, the hex.ts order). */
export const turn = (d: number, k: number): number => (((d + k) % 6) + 6) % 6;

/** The hyphae of one mycelium on one map, and the counts its assays read. */
export class Hyphae {
  /** each hypha cell (cellKey) and the cell it grew from (ROOT for a root) */
  readonly parent = new Map<number, number>();
  tips: Tip[] = [];
  /** loops closed by fusion: pairs of cell keys, the tip's cell and the hypha it fused into */
  fusions: number[] = [];
  /** mass spent on hypha (each cell at its price) */
  spent = 0;
  /** tip extensions tried, and how many of them ran into the mycelium's own cells (assay H3) */
  steps = 0;
  selfHits = 0;
  /** seconds owed toward the next round of tip steps */
  clock = 0;

  /** Root a hypha at (x, y), its tip heading `heading`. */
  root(x: number, y: number, heading: number): void {
    this.addCell(x, y);
    this.tips.push({ x, y, heading, first: heading, run: 0 });
  }

  /** A root cell with no tip of its own (a landing's patch: the base). Free: the landing's start pays for it. */
  addCell(x: number, y: number): void {
    const k = cellKey(x, y);
    if (!this.parent.has(k)) this.parent.set(k, ROOT);
  }

  /** Whether (x, y) is a hypha cell. */
  has(x: number, y: number): boolean {
    return this.parent.has(cellKey(x, y));
  }

  /**
   * Grow `tip` one cell along direction `d`, at `price` mass. Counted as a step; into a cell of its own it is a self-hit
   * and grows nothing. Returns whether it grew.
   */
  extend(tip: Tip, d: number, price: number): boolean {
    this.steps++;
    const x = nx(tip.x, tip.y, d);
    const y = ny(tip.y, d);
    const k = cellKey(x, y);
    if (this.parent.has(k)) {
      this.selfHits++;
      return false;
    }
    this.parent.set(k, cellKey(tip.x, tip.y));
    tip.x = x;
    tip.y = y;
    tip.heading = d;
    tip.run++;
    this.spent += price;
    return true;
  }

  /**
   * A new tip from `tip`'s cell, heading `d`; the parent's run starts again (it has just branched), and the branch's
   * starts `start` cells in (BRANCH_START), so a mycelium's tips don't all branch on the same round.
   */
  branch(tip: Tip, d: number, start = 0): Tip {
    const t: Tip = { x: tip.x, y: tip.y, heading: d, first: d, run: start };
    tip.run = 0;
    this.tips.push(t);
    return t;
  }

  /** `tip` joins the hypha ahead of it along `d`, closing a loop: the tip is done (§7, fusion). */
  fuse(tip: Tip, d: number): void {
    this.fusions.push(cellKey(tip.x, tip.y), cellKey(nx(tip.x, tip.y, d), ny(tip.y, d)));
    this.tips = this.tips.filter((t) => t !== tip);
  }

  /** Hypha cells: the mycelium's length in cells. */
  get length(): number {
    return this.parent.size;
  }

  /** The hyphae for a save (save.ts): plain arrays. */
  save(): HyphaeSave {
    return {
      parent: [...this.parent],
      tips: this.tips.map((t) => [t.x, t.y, t.heading, t.first, t.run]),
      fusions: [...this.fusions],
      spent: this.spent,
      steps: this.steps,
      selfHits: this.selfHits,
      clock: this.clock,
    };
  }

  static load(r: HyphaeSave): Hyphae {
    const h = new Hyphae();
    for (const [k, p] of r.parent) h.parent.set(k, p);
    h.tips = r.tips.map(([x, y, heading, first, run]) => ({ x, y, heading, first, run }) as Tip);
    h.fusions = [...r.fusions];
    h.spent = r.spent;
    h.steps = r.steps;
    h.selfHits = r.selfHits;
    h.clock = r.clock;
    return h;
  }
}

export interface HyphaeSave {
  parent: [number, number][];
  tips: [number, number, number, number, number][];
  fusions: number[];
  spent: number;
  steps: number;
  selfHits: number;
  clock: number;
}

/** The cell `d` from (x, y). */
const ahead = (x: number, y: number, d: number): [number, number] => [nx(x, y, d), ny(y, d)];

/** Whether (x, y) is soil with a dug cell beside it: a tunnel's or the shaft's wall. */
export function isWall(g: Ground, x: number, y: number): boolean {
  if (g.kind(x, y) !== "soil") return false;
  for (let d = 0; d < 6; d++) if (g.kind(nx(x, y, d), ny(y, d)) === "open") return true;
  return false;
}

/** Where a tip at (x, y) is (§3): out in a dug cell, on a wall, or buried; on the plane, buried (under the surface). */
export function exposureAt(g: Ground, x: number, y: number): Exposure {
  if (g.topsoil) return "buried";
  if (g.kind(x, y) === "open") return "open";
  return isWall(g, x, y) ? "wall" : "buried";
}

/**
 * Whether a tip may grow into (x, y) at Mycelium level `level`: never rock or its own hypha; the plane's topsoil and dug
 * cells always; soil in the curtain only along a wall at a thread (level 0), anywhere from a borer (level 1) on.
 */
export function enterable(h: Hyphae, g: Ground, x: number, y: number, level: number): boolean {
  if (h.has(x, y)) return false;
  const k = g.kind(x, y);
  if (k === "rock") return false;
  if (k === "open" || g.topsoil) return true;
  return level >= 1 || isWall(g, x, y);
}

/** What `tip` senses: the cell ahead, its exposure, and its supply (`free` mass shared among `tips`). */
export function situationOf(h: Hyphae, g: Ground, tip: Tip, level: number, free: number, tips: number): GrowthSituation {
  const [ax, ay] = ahead(tip.x, tip.y, tip.heading);
  const k = g.kind(ax, ay);
  const what: Ahead = h.has(ax, ay) ? "own" : k === "rock" || !enterable(h, g, ax, ay, level) ? "rock" : g.topsoil ? "soil" : k;
  return {
    ahead: what,
    exposed: exposureAt(g, tip.x, tip.y),
    supply: free >= HYPHA_MASS * AMPLE_STEPS * Math.max(1, tips) ? "ample" : "short",
  };
}

/**
 * The local rule (docs/hyphal-growth.md §3): what a tip does, from its situation and its own body (its heading, first
 * heading, run, and the cells it touches). Short supply: rest. Its own hypha ahead: turn away (autotropism). Blocked
 * ahead: both sides free, split (branch); one, slide to it; none, rest. A tunnel ahead from the soil: slide along its
 * wall. Run at the growth unit: branch. Off its first heading: drift back one turn. Else grow on.
 */
export function localGrowth(h: Hyphae, g: Ground, tip: Tip, s: GrowthSituation, level: number): GrowthAnswer {
  if (s.supply === "short") return "rest";
  const free = (k: number) => {
    const [x, y] = ahead(tip.x, tip.y, turn(tip.heading, k));
    return enterable(h, g, x, y, level);
  };
  const sideWith = (want: (k: number) => boolean): GrowthAnswer => {
    const l = want(-1);
    const r = want(1);
    if (l && r) return h.steps % 2 ? "left" : "right";
    return l ? "left" : r ? "right" : "rest";
  };
  if (s.ahead === "own") return sideWith(free);
  if (s.ahead === "rock") {
    // Hit and split (Held et al. 2019): a point ahead, split round it; a flat wall, split along it both ways; a glance, slide.
    if ((free(-1) && free(1)) || (free(-2) && free(2))) return "branch";
    const near = sideWith(free);
    if (near !== "rest") return near;
    return sideWith((k) => free(2 * k));
  }
  if (s.ahead === "open" && s.exposed !== "open") {
    // Thigmotropism: keep to the soil along the tunnel's wall.
    const along = (k: number) => {
      const [x, y] = ahead(tip.x, tip.y, turn(tip.heading, k));
      return free(k) && g.kind(x, y) === "soil";
    };
    return sideWith(along);
  }
  if (tip.run >= BRANCH_RUN) return "branch";
  if (tip.heading !== tip.first) {
    const k = turn(tip.first - tip.heading, 0) <= 3 ? 1 : -1;
    if (free(k)) return k > 0 ? "right" : "left";
  }
  return "grow";
}

/** How a step went: cells grown, for the caller's mass. */
export interface StepOut {
  grown: number;
}

/**
 * One round of tip steps on every map's hyphae (`maps`, each with its ground): the tips take turns across the maps
 * (the first tip of each map, then the second…; new branches wait for the next round), so no map's tips eat the free
 * mass before another's step. Each tip senses, the policy answers (the local rule when `policy` is null or has
 * nothing), and the answer is carried out where the ground and the mass allow: a growth into a cell the tip may not
 * enter, or past the free mass, rests instead. `budget.free` is the mass the body may still spend on hypha and
 * `budget.tips` every map's tips; both are kept up to date. Returns what was grown.
 */
export function stepRound(
  maps: readonly { h: Hyphae; g: Ground }[],
  level: number,
  budget: { free: number; tips: number },
  policy: ((s: GrowthSituation) => GrowthAnswer | null) | null = null,
): StepOut {
  let grown = 0;
  // Supply is judged once, at the round's start: every tip feels the same share, whoever steps first.
  const start = { free: budget.free, tips: budget.tips };
  const lists = maps.map(({ h }) => h.tips.slice());
  const most = Math.max(0, ...lists.map((l) => l.length));
  for (let i = 0; i < most; i++)
    maps.forEach(({ h, g }, m) => {
      const tip = lists[m]![i];
      if (tip) grown += stepTip(h, g, tip, level, budget, start, policy);
    });
  return { grown };
}

/** stepRound on one map's hyphae. */
export function stepTips(
  h: Hyphae,
  g: Ground,
  level: number,
  budget: { free: number; tips: number },
  policy: ((s: GrowthSituation) => GrowthAnswer | null) | null = null,
): StepOut {
  return stepRound([{ h, g }], level, budget, policy);
}

/** One tip's step (see stepRound); returns the cells it grew. */
function stepTip(
  h: Hyphae,
  g: Ground,
  tip: Tip,
  level: number,
  budget: { free: number; tips: number },
  start: { free: number; tips: number },
  policy: ((s: GrowthSituation) => GrowthAnswer | null) | null,
): number {
  let grown = 0;
  // A veer the ground blocks turns the tip where it stands, so a wall it slides along is followed over a few steps.
  const veer = (d: number) => {
    if (!grow(tip, d) && budget.free >= HYPHA_MASS) tip.heading = d;
  };
  const grow = (t: Tip, d: number): boolean => {
    if (budget.free < HYPHA_MASS) return false;
    const [x, y] = ahead(t.x, t.y, d);
    if (h.has(x, y)) {
      h.steps++;
      h.selfHits++;
      return false;
    }
    if (!enterable(h, g, x, y, level)) return false;
    if (!h.extend(t, d, HYPHA_MASS)) return false;
    budget.free -= HYPHA_MASS;
    grown++;
    return true;
  };
  const s = situationOf(h, g, tip, level, start.free, start.tips);
  const a = policy?.(s) ?? localGrowth(h, g, tip, s, level);
  const d = tip.heading;
  switch (a) {
    case "grow":
      grow(tip, d);
      break;
    case "left":
      veer(turn(d, -1));
      break;
    case "right":
      veer(turn(d, 1));
      break;
    case "branch": {
      // A branch one turn aside (60°, §2); blocked ahead, the tip splits: the branch one way, the tip the other.
      const side = h.steps % 2 ? 1 : -1;
      const open = (k: number) => {
        const [x, y] = ahead(tip.x, tip.y, turn(d, k));
        return enterable(h, g, x, y, level);
      };
      // Blocked ahead, split as wide as it must: one turn each way round a point, two along a flat wall.
      const k = s.ahead === "rock" && !(open(-1) && open(1)) ? 2 : 1;
      const b = h.branch(tip, turn(d, side * k), BRANCH_START);
      budget.tips++;
      if (s.ahead === "rock") veer(turn(d, -side * k));
      else grow(tip, d);
      grow(b, b.heading);
      break;
    }
    case "fuse":
      if (s.ahead === "own") {
        h.fuse(tip, d);
        budget.tips--;
      }
      break;
    case "rest":
      break;
  }
  return grown;
}

/** The cells a mycelium puts its spores out on (§6): on the plane every hypha cell (the surface above it); in the curtain a hypha out in a dug cell, and the dug cells beside a hypha in a wall. */
export function sporeCellsOf(h: Hyphae, g: Ground): number[] {
  const out = new Set<number>();
  for (const k of h.parent.keys()) {
    const [x, y] = keyCell(k);
    const kind = g.kind(x, y);
    if (g.topsoil) {
      if (kind !== "rock") out.add(k);
      continue;
    }
    if (kind === "open") out.add(k);
    else if (kind === "soil")
      for (let d = 0; d < 6; d++) {
        const ax = nx(x, y, d);
        const ay = ny(y, d);
        if (g.kind(ax, ay) === "open") out.add(cellKey(ax, ay));
      }
  }
  return [...out].sort((a, b) => a - b);
}

/** Assay H1: the hyphal growth unit, length ÷ tips (Trinci 1974); 0 with no tips. */
export function growthUnit(h: Hyphae): number {
  return h.tips.length ? h.length / h.tips.length : 0;
}

/** Assay H3: the share of tip steps that ran into the mycelium's own cells (negative autotropism keeps it low). */
export function selfHitShare(h: Hyphae): number {
  return h.steps ? h.selfHits / h.steps : 0;
}

/** Assay H4: whether the hypha grown costs no more than the mass the mycelium has grown (to a rounding). */
export function withinBudget(h: Hyphae, grown: number): boolean {
  return h.spent <= grown + 1e-9;
}

/**
 * Assay H2's reading: the headings of the tips standing on (x, y), in order. A head-on meeting with rock should leave
 * two tips there going opposite ways (hit and split, Held et al. 2019); a glancing one, one tip turned along it.
 */
export function tipsAt(h: Hyphae, x: number, y: number): number[] {
  return h.tips.filter((t) => t.x === x && t.y === y).map((t) => t.heading);
}

/** Two hex directions are opposite. */
export const opposite = (a: number, b: number): boolean => (a - b + 6) % 6 === 3;
