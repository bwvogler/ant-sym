// Many lines (docs/endless-world.md §5, PRD §66 E3.1, `ja-qpv.2`), pure: the founding rule over every line of the world and every wild site, and
// each line's salt. The world holds a list of lines; each is a `Transect` (transect.ts) with its own curtain. A colony far from every line
// starts a new line; one near an end grows that line, as one world's rules say. No simulation here: a point and the lines in, a verdict out.
//
// The rule, for a point p, in this order:
//  1. farther than NEW_LINE_GAP (140) from every hole, of every line and every wild site, and on open ground: it starts a new line of one
//     hole, provided that line, its margins included, keeps the clearance from every line and every site's reserved line;
//  2. else, if the nearest hole is an end of its line (never a wild site's, woken or not): that line grows by today's rules (transect.ts
//     canFound), provided the grown line keeps the clearance from every other line and every site's reserved line;
//  3. else it is refused.
// The new-line test runs first because today's rule 1 has no length limit and would send every far point to the nearest line's end.

import { centreX, centreY } from "./hex.ts";
import { holeLine, pointGap, type Site } from "./endlessPlane.ts";
import { hash4 } from "./world.ts";
import { canFound, CLEARANCE, type Cell, type End, type FoundCheck, grow, makeTransect, type Refusal, type Transect } from "./transect.ts";

/** A new line starts only farther than this from every hole of every line and site (docs/endless-world.md §5): one unit. */
export const NEW_LINE_GAP = 140;

/** One line of the world: its transect, and the salt of its ground (0 for the first line, so today's seeds hold). */
export interface Line {
  readonly transect: Transect;
  readonly salt: number;
}

/** A wild site's reserved line, as the world holds it from the start: its hole and heading (endlessPlane.ts Site). */
export type Reserved = Pick<Site, "x" | "y" | "heading">;

/** Why a founding is refused, beyond today's rules. */
export type LineRefusal = Refusal | "site" | "line-clearance";

export type Founding =
  { ok: true; kind: "new"; heading: number } | { ok: true; kind: "grow"; line: number; end: End } | { ok: false; reason: LineRefusal };

const cx = (c: Cell): number => centreX(c.x, c.y);
const cy = (c: Cell): number => centreY(c.y);

/**
 * A line's salt: a hash of its first hole's plane cell, mixed into its ground and food seeds, so no two lines share stones or pockets under
 * their first holes. The first line's is 0 (its ground and food keep today's seeds); the first hole never changes as a line grows, so the salt
 * is fixed for the line's life.
 */
export function lineSalt(seed: number, firstHole: Cell, first: boolean): number {
  if (first) return 0;
  // never 0: a later line's salt must differ from the first's
  return hash4(seed, 99, firstHole.x, firstHole.y) | 1;
}

/** A line of one hole at `cell`, its margins along `heading`: a wild colony's, or a far founding's. */
export function oneHoleLine(seed: number, cell: Cell, heading: number): Line {
  return { transect: makeTransect([cell], { heading }), salt: lineSalt(seed, cell, false) };
}

/** Whether every tile of `cells` (flat x, y pairs) keeps the clearance from every tile of `other` and every reserved line. */
function clearOf(cells: Int32Array, others: readonly Transect[], sites: readonly Reserved[]): boolean {
  const near2 = CLEARANCE * CLEARANCE;
  for (const t of others) {
    // a quick reject by bounding box: a tile 12 away needs a box that near
    let x0 = Infinity;
    let x1 = -Infinity;
    let y0 = Infinity;
    let y1 = -Infinity;
    for (let i = 0; i < t.cells.length; i += 2) {
      const x = cx({ x: t.cells[i]!, y: t.cells[i + 1]! });
      const y = cy({ x: t.cells[i]!, y: t.cells[i + 1]! });
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y);
    }
    for (let i = 0; i < cells.length; i += 2) {
      const x = cx({ x: cells[i]!, y: cells[i + 1]! });
      const y = cy({ x: cells[i]!, y: cells[i + 1]! });
      if (x < x0 - CLEARANCE || x > x1 + CLEARANCE || y < y0 - CLEARANCE || y > y1 + CLEARANCE) continue;
      for (let j = 0; j < t.cells.length; j += 2) {
        const dx = x - cx({ x: t.cells[j]!, y: t.cells[j + 1]! });
        const dy = y - cy({ x: t.cells[j]!, y: t.cells[j + 1]! });
        if (dx * dx + dy * dy < near2) return false;
      }
    }
  }
  for (const s of sites) {
    const seg = holeLine(s.x, s.y, s.heading);
    for (let i = 0; i < cells.length; i += 2)
      if (pointGap(cx({ x: cells[i]!, y: cells[i + 1]! }), cy({ x: cells[i]!, y: cells[i + 1]! }), seg) < CLEARANCE) return false;
  }
  return true;
}

/**
 * Whether a colony may be founded with its hole at plane cell `p`, and what it does: starts a line (along `heading`, drawn by the caller from the
 * game's stream or a site's hash) or grows an end of line `line`. `open` is rule 4's local test (open ground that leaves a disc of about 1 U).
 */
export function canFoundIn(
  lines: readonly Line[],
  sites: readonly Reserved[],
  p: Cell,
  open: (x: number, y: number) => boolean,
  heading: number,
): Founding {
  const px = cx(p);
  const py = cy(p);
  // The nearest hole of any line, and the nearest site's.
  let farLines = true;
  let nearLine = -1;
  let nearD = Infinity;
  lines.forEach((l, i) => {
    for (const h of l.transect.holes) {
      const d = Math.hypot(cx(h) - px, cy(h) - py);
      if (d <= NEW_LINE_GAP) farLines = false;
      if (d < nearD) {
        nearD = d;
        nearLine = i;
      }
    }
  });
  let nearSite = Infinity;
  for (const s of sites) nearSite = Math.min(nearSite, Math.hypot(s.x - px, s.y - py));
  // A founding never lands within a unit of a wild site, woken or not (a site is a reserved line; its colony is there before anyone is).
  if (nearSite <= NEW_LINE_GAP) return { ok: false, reason: "site" };
  // 1. Far from every hole: a new line, if it keeps the clearance.
  if (farLines && open(p.x, p.y)) {
    const t = makeTransect([p], { heading });
    if (
      clearOf(
        t.cells,
        lines.map((l) => l.transect),
        sites,
      )
    )
      return { ok: true, kind: "new", heading };
  }
  // 2. The nearest hole is an end of a line (a site's is more than a unit away, so a line's is nearer when one is within reach).
  if (nearLine < 0) return { ok: false, reason: "site" };
  const line = lines[nearLine]!;
  const r: FoundCheck = canFound(line.transect, p, open);
  if (!r.ok) return { ok: false, reason: r.reason };
  const grown = grow(line.transect, r.end, p);
  const others = lines.filter((_, i) => i !== nearLine).map((l) => l.transect);
  if (!clearOf(grown.cells, others, sites)) return { ok: false, reason: "line-clearance" };
  return { ok: true, kind: "grow", line: nearLine, end: r.end };
}

/** The world's lines after a founding at `p` that `canFoundIn` allowed (a new line, or the line grown at its end). */
export function applyFounding(seed: number, lines: readonly Line[], p: Cell, f: Founding & { ok: true }): Line[] {
  if (f.kind === "new") return [...lines, oneHoleLine(seed, p, f.heading)];
  return lines.map((l, i) => (i === f.line ? { transect: grow(l.transect, f.end, p), salt: l.salt } : l));
}

/** The cell nearest `p` within `radius` (world units) where `canFoundIn` holds, nearest by exact distance then a fixed order; null if none. */
export function nearestValidIn(
  lines: readonly Line[],
  sites: readonly Reserved[],
  p: Cell,
  radius: number,
  open: (x: number, y: number) => boolean,
  heading: number,
): { cell: Cell; founding: Founding & { ok: true } } | null {
  // Candidates by distance: every cell within the radius, nearest first, ties in scan order.
  const cands: [number, Cell][] = [];
  const reach = Math.ceil(radius / (Math.sqrt(3) / 2)) + 1;
  const px = cx(p);
  const py = cy(p);
  for (let dy = -reach; dy <= reach; dy++)
    for (let dx = -reach; dx <= reach; dx++) {
      const c = { x: p.x + dx, y: p.y + dy };
      const d = Math.hypot(cx(c) - px, cy(c) - py);
      if (d <= radius) cands.push([d, c]);
    }
  cands.sort((a, b) => a[0] - b[0] || a[1].y - b[1].y || a[1].x - b[1].x);
  for (const [, cell] of cands) {
    const f = canFoundIn(lines, sites, cell, open, heading);
    if (f.ok) return { cell, founding: f };
  }
  return null;
}
