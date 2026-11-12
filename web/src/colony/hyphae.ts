import { hexDistance, nx, ny } from "./hex.ts";

// The mycelium as hyphae (docs/hyphal-growth.md, PRD §63, ja-2bw), pure. A hypha is a chain of cells, each with its
// parent, so the mycelium is a tree; its tips are where it grows. Every TIP_STEP seconds each tip senses its situation
// (what is ahead, how exposed it is, its supply) and the growth policy answers grow, left, right, turn (the tip picks the
// side), branch, rest, fuse or fruit: the growth lane's Jev answer under the aim (growthBrain.ts), or the local rule.
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
/** The local rule fruits where a tunnel is reached only if no spore spot of its own lies within this many cells (design: keeps spots few, so the patch keeps an infecting dose, PRD §63.1). */
export const FRUIT_GAP = 12;
/**
 * Cords (a web, ja-2bw.8, docs/hyphal-growth.md §7): a hypha cell that feeds at least this many tips downstream is a
 * cord (design: Heaton et al. 2010 found a cord's thickness tracks the flow it carries).
 */
export const CORD_FLOW = 4;
/** Dead-end hypha cells that fade each round once cords are grown: unused links recycled (design: Bebber et al. 2007). */
export const REGRESS_PER_ROUND = 1;
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
/** What a tip does: `turn` is a turn to whichever side the tip finds free (the growth lane's, ja-2bw.5: only the tip knows its sides). */
export const GROWTH_ANSWERS = ["grow", "left", "right", "turn", "branch", "rest", "fuse", "fruit"] as const;
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
  /** spore spots: dug cells where a tip fruited (the `fruit` answer), each taking a patch cell's share of the spores */
  fruits: number[] = [];
  /** hypha cells that were soil when it grew into them (the curtain's): one the ants dig open is cut (ja-2bw.4) */
  readonly soil = new Set<number>();
  /** hypha cells lost to cuts, over the game */
  cutCells = 0;
  /** cords (ja-2bw.8): cells feeding CORD_FLOW tips or more, refreshed each round at a web; a dig doesn't cut a cord */
  cords = new Set<number>();
  /** hypha cells faded away unused, over the game (regress) */
  fadedCells = 0;
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

  /** A root cell with no tip of its own (a landing's patch: the base). Not paid from `spent`, but it embodies HYPHA_MASS like any cell. */
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

  /**
   * `tip` fruits (PRD §63.1, owner 2026-11-12): it ends as a spore spot on the dug cell it touches: its own cell if dug,
   * else the first dug cell beside it (hex.ts order). Nothing where it touches none (`ground` says what is dug).
   */
  fruit(tip: Tip, ground: Ground): boolean {
    let spot = -1;
    if (ground.kind(tip.x, tip.y) === "open") spot = cellKey(tip.x, tip.y);
    else
      for (let d = 0; d < 6 && spot < 0; d++) {
        const x = nx(tip.x, tip.y, d);
        const y = ny(tip.y, d);
        if (ground.kind(x, y) === "open") spot = cellKey(x, y);
      }
    if (spot < 0 || ground.topsoil) return false;
    if (!this.fruits.includes(spot)) this.fruits.push(spot);
    this.tips = this.tips.filter((t) => t !== tip);
    return true;
  }

  /** Whether a spore spot of its own lies within `gap` cells of (x, y). */
  fruitNear(x: number, y: number, gap: number): boolean {
    return this.fruits.some((k) => {
      const [fx, fy] = keyCell(k);
      return hexDistance(x, y, fx, fy) <= gap;
    });
  }

  /** Hypha cells: the mycelium's length in cells. */
  get length(): number {
    return this.parent.size;
  }

  /**
   * The ants have dug cell `k` open (ja-2bw.4, design): the hypha there is cut. The cell dies, and so does everything
   * that grew from it, with their tips and the spore spots only they touched, except the cells a loop closed by fusion
   * still joins to the rest (Simonin et al. 2012: fusion carries the network round a break): those reached through a
   * fusion pair to a cell outside the cut-off part, and on from them along the hypha and other fusion pairs. A survivor
   * whose parent died starts afresh as a root, fed by the loop. Returns the cells lost.
   */
  cut(k: number): number {
    if (!this.parent.has(k)) return 0;
    const children = new Map<number, number[]>();
    for (const [c, p] of this.parent)
      if (p !== ROOT) {
        const list = children.get(p);
        if (list) list.push(c);
        else children.set(p, [c]);
      }
    // The part cut off: k and everything that grew from it.
    const beyond = new Set<number>([k]);
    const stack = [k];
    while (stack.length) {
      for (const c of children.get(stack.pop()!) ?? []) {
        if (beyond.has(c)) continue;
        beyond.add(c);
        stack.push(c);
      }
    }
    // Its links inside (hypha and fusion, k left out), and the cells a fusion pair joins to the rest.
    const links = new Map<number, number[]>();
    const link = (a: number, b: number) => {
      if (a === k || b === k || !beyond.has(a) || !beyond.has(b)) return;
      (links.get(a) ?? links.set(a, []).get(a)!).push(b);
      (links.get(b) ?? links.set(b, []).get(b)!).push(a);
    };
    for (const c of beyond) {
      const p = this.parent.get(c)!;
      if (p !== ROOT) link(c, p);
    }
    const reached = new Set<number>();
    for (let i = 0; i + 1 < this.fusions.length; i += 2) {
      const a = this.fusions[i]!;
      const b = this.fusions[i + 1]!;
      link(a, b);
      for (const [inside, outside] of [
        [a, b],
        [b, a],
      ] as const)
        if (inside !== k && beyond.has(inside) && !beyond.has(outside) && this.parent.has(outside)) reached.add(inside);
    }
    const walk = [...reached];
    while (walk.length) {
      for (const c of links.get(walk.pop()!) ?? []) {
        if (reached.has(c)) continue;
        reached.add(c);
        walk.push(c);
      }
    }
    const dead = new Set([...beyond].filter((c) => !reached.has(c)));
    for (const c of dead) {
      this.parent.delete(c);
      this.soil.delete(c);
    }
    for (const c of reached) if (dead.has(this.parent.get(c)!)) this.parent.set(c, ROOT);
    this.tips = this.tips.filter((t) => !dead.has(cellKey(t.x, t.y)));
    const kept: number[] = [];
    for (let i = 0; i + 1 < this.fusions.length; i += 2)
      if (!dead.has(this.fusions[i]!) && !dead.has(this.fusions[i + 1]!)) kept.push(this.fusions[i]!, this.fusions[i + 1]!);
    this.fusions = kept;
    this.fruits = this.fruits.filter((f) => {
      if (this.parent.has(f)) return true;
      const [x, y] = keyCell(f);
      for (let d = 0; d < 6; d++) if (this.parent.has(cellKey(nx(x, y, d), ny(y, d)))) return true;
      return false;
    });
    this.cutCells += dead.size;
    return dead.size;
  }

  /**
   * Cut every hypha cell that was soil and the ants have dug open since (`ground` says what is dug now), except a cord,
   * which spans the dug cell (ja-2bw.8). Returns the cells lost.
   */
  cutDug(ground: Ground): number {
    let lost = 0;
    for (const k of [...this.soil]) {
      if (!this.soil.has(k) || this.cords.has(k)) continue;
      const [x, y] = keyCell(k);
      if (ground.kind(x, y) === "open") lost += this.cut(k);
    }
    return lost;
  }

  /**
   * Cords (ja-2bw.8): count the tips each cell feeds (every cell from a tip back to its root carries it) and make every
   * cell feeding CORD_FLOW or more a cord; one that no longer does thins back to a hypha. Returns how many are cords.
   */
  thicken(): number {
    const flow = new Map<number, number>();
    for (const t of this.tips) {
      let k = cellKey(t.x, t.y);
      for (let guard = this.parent.size; guard >= 0 && k !== ROOT; guard--) {
        flow.set(k, (flow.get(k) ?? 0) + 1);
        k = this.parent.get(k) ?? ROOT;
      }
    }
    this.cords = new Set([...flow].filter(([, n]) => n >= CORD_FLOW).map(([k]) => k));
    return this.cords.size;
  }

  /**
   * Unused hypha fades (Bebber et al. 2007: links that carry nothing are recycled): up to REGRESS_PER_ROUND dead ends a
   * round, a cell no tip stands on and nothing grew from, unless it is a root, a cord, in a fusion, touching a spore spot,
   * or `keep` holds it (a corpse). Its mass is the body's to spend again (it no longer counts in `length`). Returns the cells faded.
   */
  regress(keep: (k: number) => boolean = () => false): number {
    const parents = new Set(this.parent.values());
    const tipCells = new Set(this.tips.map((t) => cellKey(t.x, t.y)));
    const fused = new Set(this.fusions);
    const nearSpot = (k: number) => {
      if (this.fruits.length === 0) return false;
      const [x, y] = keyCell(k);
      for (let d = 0; d < 6; d++) if (this.fruits.includes(cellKey(nx(x, y, d), ny(y, d)))) return true;
      return this.fruits.includes(k);
    };
    let faded = 0;
    for (const [k, p] of this.parent) {
      if (faded >= REGRESS_PER_ROUND) break;
      if (p === ROOT || parents.has(k) || tipCells.has(k) || this.cords.has(k) || fused.has(k) || nearSpot(k) || keep(k)) continue;
      this.parent.delete(k);
      this.soil.delete(k);
      faded++;
    }
    this.fadedCells += faded;
    return faded;
  }

  /** The hyphae for a save (save.ts): plain arrays. */
  save(): HyphaeSave {
    return {
      parent: [...this.parent],
      soil: [...this.soil],
      cutCells: this.cutCells,
      tips: this.tips.map((t) => [t.x, t.y, t.heading, t.first, t.run]),
      fusions: [...this.fusions],
      fruits: [...this.fruits],
      cords: [...this.cords],
      fadedCells: this.fadedCells,
      spent: this.spent,
      steps: this.steps,
      selfHits: this.selfHits,
      clock: this.clock,
    };
  }

  static load(r: HyphaeSave): Hyphae {
    const h = new Hyphae();
    for (const [k, p] of r.parent) h.parent.set(k, p);
    for (const k of r.soil) h.soil.add(k);
    h.cutCells = r.cutCells;
    h.tips = r.tips.map(([x, y, heading, first, run]) => ({ x, y, heading, first, run }) as Tip);
    h.fusions = [...r.fusions];
    h.fruits = [...r.fruits];
    h.cords = new Set(r.cords);
    h.fadedCells = r.fadedCells;
    h.spent = r.spent;
    h.steps = r.steps;
    h.selfHits = r.selfHits;
    h.clock = r.clock;
    return h;
  }
}

export interface HyphaeSave {
  parent: [number, number][];
  soil: number[];
  cutCells: number;
  tips: [number, number, number, number, number][];
  fusions: number[];
  fruits: number[];
  cords: number[];
  fadedCells: number;
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
  if (s.ahead === "own") return sideFor(h, g, tip, s, level, false);
  if (s.ahead === "rock") {
    // Hit and split (Held et al. 2019): a point ahead, split round it; a flat wall, split along it both ways; a glance, slide.
    const free = freeAt(h, g, tip, level);
    if ((free(-1) && free(1)) || (free(-2) && free(2))) return "branch";
    return sideFor(h, g, tip, s, level);
  }
  // Where it reaches a tunnel, it fruits, unless a spot of its own is near (conidiation where hyphae meet the air, §6).
  if ((s.ahead === "open" || s.exposed === "open") && !h.fruitNear(tip.x, tip.y, FRUIT_GAP)) return "fruit";
  // Thigmotropism: from the soil, keep to it along the tunnel's wall.
  if (s.ahead === "open" && s.exposed !== "open") return sideFor(h, g, tip, s, level);
  if (tip.run >= BRANCH_RUN) return "branch";
  if (tip.heading !== tip.first) {
    const k = turn(tip.first - tip.heading, 0) <= 3 ? 1 : -1;
    if (freeAt(h, g, tip, level)(k)) return k > 0 ? "right" : "left";
  }
  return "grow";
}

/** Whether the cell `k` turns from `tip`'s heading is one it may grow into. */
function freeAt(h: Hyphae, g: Ground, tip: Tip, level: number): (k: number) => boolean {
  return (k) => {
    const [x, y] = ahead(tip.x, tip.y, turn(tip.heading, k));
    return enterable(h, g, x, y, level);
  };
}

/**
 * Which way `tip` turns (`turn`, or the local rule's slide): from the soil toward a tunnel, the side that keeps it in
 * the soil along the wall; else a free side one turn off, or (`wide`) two, along a flat wall; both free, by its own count
 * of steps. The local rule turns from its own hypha only one turn off (`wide` false).
 */
export function sideFor(h: Hyphae, g: Ground, tip: Tip, s: GrowthSituation, level: number, wide = true): GrowthAnswer {
  const free = freeAt(h, g, tip, level);
  const sideWith = (want: (k: number) => boolean): GrowthAnswer => {
    const l = want(-1);
    const r = want(1);
    if (l && r) return h.steps % 2 ? "left" : "right";
    return l ? "left" : r ? "right" : "rest";
  };
  if (s.ahead === "open" && s.exposed !== "open")
    return sideWith((k) => {
      const [x, y] = ahead(tip.x, tip.y, turn(tip.heading, k));
      return free(k) && g.kind(x, y) === "soil";
    });
  const near = sideWith(free);
  return near !== "rest" || !wide ? near : sideWith((k) => free(2 * k));
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
    if (!g.topsoil && g.kind(x, y) === "soil") h.soil.add(cellKey(x, y));
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
    case "turn": {
      const side = sideFor(h, g, tip, s, level);
      if (side === "left") veer(turn(d, -1));
      else if (side === "right") veer(turn(d, 1));
      break;
    }
    case "left":
      veer(turn(d, -1));
      break;
    case "right":
      veer(turn(d, 1));
      break;
    case "branch": {
      // Short of mass, a branch rests: a tip costs nothing to put out, so a policy that branched while short would double the
      // tips every round without growing a cell (review of #115, S1: 5.2 million tips 40 s into a game). The local rule never does.
      if (s.supply === "short") break;
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
    case "fruit":
      if (s.exposed !== "buried" && h.fruit(tip, g)) budget.tips--;
      break;
    case "rest":
      break;
  }
  return grown;
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
