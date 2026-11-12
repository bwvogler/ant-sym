import { nx, ny } from "./hex.ts";

// The mycelium as hyphae (docs/hyphal-growth.md, PRD §61, ja-2bw), pure. A hypha is a chain of cells, each with its
// parent, so the mycelium is a tree; its tips are where it grows. This first slice (ja-2bw.1) is the shape and the
// assays' measures, with no behaviour: nothing in the game builds a Hyphae yet. The tips' stepping on the local rule,
// paid out of the mycelium's mass, comes with ja-2bw.2.

/** A hyphal tip: its cell, its heading (a hex direction, hex.ts E…NE), the heading it set out on, and its run since it last branched. */
export interface Tip {
  x: number;
  y: number;
  heading: number;
  /** the heading it first set out on: directional memory (Held et al. 2019) */
  first: number;
  /** cells grown since its last branch: the local rule branches at HGU (the hyphal growth unit, Trinci 1974) */
  run: number;
}

/** A cell as one number (columns may be negative: one world's curtain). */
export const cellKey = (x: number, y: number): number => (y + 32768) * 131072 + (x + 32768);
/** A key's cell. */
export const keyCell = (k: number): [number, number] => [(k % 131072) - 32768, Math.floor(k / 131072) - 32768];

/** No parent: a cell the mycelium rooted in. */
export const ROOT = -1;

/** The hyphae of one mycelium, and the counts its assays read. */
export class Hyphae {
  /** each hypha cell (cellKey) and the cell it grew from (ROOT for a root) */
  readonly parent = new Map<number, number>();
  tips: Tip[] = [];
  /** mass spent on hypha (each cell at its price) */
  spent = 0;
  /** tip extensions tried, and how many of them ran into the mycelium's own cells (assay H3) */
  steps = 0;
  selfHits = 0;

  /** Root a hypha at (x, y), its tip heading `heading`. */
  root(x: number, y: number, heading: number): void {
    const k = cellKey(x, y);
    if (!this.parent.has(k)) this.parent.set(k, ROOT);
    this.tips.push({ x, y, heading, first: heading, run: 0 });
  }

  /** Whether (x, y) is a hypha cell. */
  has(x: number, y: number): boolean {
    return this.parent.has(cellKey(x, y));
  }

  /**
   * Grow `tip` one cell along direction `d`, at `price` mass. Counted as a step; into a cell of its own it is a self-hit
   * and grows nothing. Returns whether it grew. (The measures' fixtures use it; ja-2bw.2's local rule chooses `d`.)
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

  /** A new tip from `tip`'s cell, heading `d`; the parent's run starts again (it has just branched). */
  branch(tip: Tip, d: number): Tip {
    const t: Tip = { x: tip.x, y: tip.y, heading: d, first: d, run: 0 };
    tip.run = 0;
    this.tips.push(t);
    return t;
  }

  /** Hypha cells: the mycelium's length in cells. */
  get length(): number {
    return this.parent.size;
  }
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
