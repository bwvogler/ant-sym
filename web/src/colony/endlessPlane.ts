// The endless plane's generator (docs/endless-world.md §2-§4, PRD §66 E2, `ja-r84`), pure: a chunk of ground is a function of
// (seed, chunk) and nothing else, so any order of visits gives the same world and a dropped chunk comes back the same.
//
//   rock     chunkRock(seed, cx, cy): the terrain from the seed alone (world.ts)
//   food     patches from each chunk's own stream (the bounded generator's draw), kept when their centre joins open ground that leaves the
//            chunk's 3×3 neighbourhood (read before any patch clears it) and keeps clear of the nests the WORLD placed: the start nests and
//            the wild sites, never a founding (history)
//   nests    the two start nests near the origin, and one wild site per region of REGION_CHUNKS × REGION_CHUNKS chunks, each drawn from
//            hash(seed, region), judged against its neighbours' raw candidates (pure, so a region is judged alone)
//
// The bounded generator (world.ts generateWorld) is untouched: S2 retires it, E6 switches the page. This is code beside it, with its own tests.

import { chunkKey, CHUNK, CHUNK_BITS, local } from "./chunks.ts";
import { cellOf, CELL, centreX, centreY, hexDistance, nx, ny, R } from "./hex.ts";
import { chunkRock, hash01, hash4, mulberry32, type Nest, ROCK, rockCut } from "./world.ts";

/** A new line starts only farther than this from every hole of every line and site (docs/endless-world.md §5): one unit, 140 cells. */
export const NEW_LINE_GAP = 140;
/** How far a line reaches past its end holes: the margin the transect keeps (one-world §3). */
export const LINE_MARGIN = 64;
/** The clearance between two lines, margins included (one-world §3 rule 2). */
export const LINE_CLEARANCE = 12;
/** A hole must join open ground that leaves a disc of this many steps: the local form of the bounded generator's `mainGround`. */
export const NEST_ESCAPE = 48;

export interface EndlessOptions {
  /** share of the ground that is rock, roughly */
  rockiness: number;
  /** food patches per 64×64 chunk, on average */
  patchesPerChunk: number;
  /** food units in each cell of a patch */
  foodPerCell: number;
  /** cells between the two start nests that the placement aims for */
  nestGap: number;
  /** no food patch closer than this to a nest the world placed, in cells */
  foodMinDist: number;
  /** a region is this many chunks on a side (at least 3, so a site's reserved line reaches only the 8 regions its check reads) */
  regionChunks: number;
  /** no two wild sites closer than this, in cells */
  wildGap: number;
  /** the share of regions whose candidate is kept (the density draw): 1 is one site per region where the ground allows */
  density: number;
  /** how many chunks, patch lists and sites each cache holds before it is dropped (the caches only save work; a small number is for tests) */
  cacheChunks: number;
}

/** The plane's numbers (PRD §12's plane), and the wild sites' proposed ones (docs/endless-world.md §4, set by E6's assay). */
export const ENDLESS_PLANE: EndlessOptions = {
  rockiness: 0.22,
  patchesPerChunk: 1.5,
  foodPerCell: 12,
  nestGap: 140,
  foodMinDist: 24,
  regionChunks: 4,
  wildGap: 140,
  density: 1,
  cacheChunks: 2048,
};

/** A wild colony's nest before it wakes (§4): a point, and the heading of the one-hole line it will start (radians, a line has no direction). */
export interface Site extends Nest {
  rx: number;
  ry: number;
  heading: number;
}

/** A chunk of the endless plane as generated: terrain after the patches clear it, and the food on it. */
export interface PlaneChunk {
  rock: Uint8Array;
  food: Float32Array;
}

interface Patch {
  x: number;
  y: number;
  radius: number;
}

/** The cells of a chunk's 3×3 window that join open ground leaving it (a flood from the window's border). */
interface Reach {
  mask: Uint8Array;
  x0: number;
  y0: number;
  w: number;
}

type Segment = readonly [number, number, number, number];

/** The distance between two segments (0 when they cross). */
export function segmentGap(a: Segment, b: Segment): number {
  const cross = (ax: number, ay: number, bx: number, by: number) => ax * by - ay * bx;
  const [x1, y1, x2, y2] = a;
  const [x3, y3, x4, y4] = b;
  const d1 = cross(x2 - x1, y2 - y1, x3 - x1, y3 - y1);
  const d2 = cross(x2 - x1, y2 - y1, x4 - x1, y4 - y1);
  const d3 = cross(x4 - x3, y4 - y3, x1 - x3, y1 - y3);
  const d4 = cross(x4 - x3, y4 - y3, x2 - x3, y2 - y3);
  if (d1 * d2 < 0 && d3 * d4 < 0) return 0;
  return Math.min(pointGap(x1, y1, b), pointGap(x2, y2, b), pointGap(x3, y3, a), pointGap(x4, y4, a));
}

function pointGap(px: number, py: number, s: Segment): number {
  const [x1, y1, x2, y2] = s;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / len2));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

/** The reserved line of a one-hole line at (x, y) along `heading`: its hole and its margin each way. */
export function holeLine(x: number, y: number, heading: number): Segment {
  const c = Math.cos(heading) * LINE_MARGIN;
  const s = Math.sin(heading) * LINE_MARGIN;
  return [x - c, y - s, x + c, y + s];
}

/** The start line: through the two start holes, its margins past each. */
function startLine(a: Nest, b: Nest): Segment {
  const d = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const ux = ((b.x - a.x) / d) * LINE_MARGIN;
  const uy = ((b.y - a.y) / d) * LINE_MARGIN;
  return [a.x - ux, a.y - uy, b.x + ux, b.y + uy];
}

/**
 * One seed's endless plane. Everything it returns is a pure function of the seed and the question; the caches only save work, and are
 * dropped when they grow (so a long walk does not hold the world).
 */
export class EndlessPlane {
  readonly seed: number;
  readonly options: EndlessOptions;
  readonly #cut: number;
  #rocks = new Map<number, Uint8Array>();
  #patches = new Map<number, Patch[]>();
  #candidates = new Map<string, Site | null>();
  #sites = new Map<string, Site | null>();
  #start: readonly [Nest, Nest] | null = null;

  constructor(seed: number, opts: Partial<EndlessOptions> = {}) {
    this.seed = seed;
    this.options = { ...ENDLESS_PLANE, ...opts };
    // A region is judged by its eight neighbours alone, which holds while everything it can conflict with lies within a region's span: another
    // site within `wildGap`, or a reserved line (margin each way, plus the clearance) near this one's.
    const span = this.options.regionChunks * CHUNK * R;
    const reach = Math.max(this.options.wildGap, 2 * LINE_MARGIN + LINE_CLEARANCE);
    if (this.options.regionChunks < 3 || reach > span)
      throw new Error(
        `EndlessPlane: a region (${span.toFixed(0)} cells across) must hold the ${reach} a site's conflicts reach; use at least 3 chunks, and more as wildGap grows`,
      );
    this.#cut = rockCut(this.options.rockiness);
  }

  /** Chunk (cx, cy)'s terrain from the seed alone, before any patch or nest clears it. Cached; never modify the array. */
  rockOf(cx: number, cy: number): Uint8Array {
    const k = chunkKey(cx, cy);
    let r = this.#rocks.get(k);
    if (!r) {
      if (this.#rocks.size >= this.options.cacheChunks) this.#rocks.clear();
      r = chunkRock(this.seed, cx, cy, this.#cut);
      this.#rocks.set(k, r);
    }
    return r;
  }

  /** Whether the cell (x, y) is rock in the seed's terrain. */
  isRock(x: number, y: number): boolean {
    return this.rockOf(x >> CHUNK_BITS, y >> CHUNK_BITS)[local(x & (CHUNK - 1), y & (CHUNK - 1))] === ROCK;
  }

  /** Whether an ant on open ground at world (x, y) can walk at least `radius` steps away (a bounded search over the seed's terrain). */
  walksOut(x: number, y: number, radius: number): boolean {
    cellOf(x, y);
    const sx = CELL[0]!;
    const sy = CELL[1]!;
    if (this.isRock(sx, sy)) return false;
    const side = 2 * radius + 3;
    const half = radius + 1;
    const seen = new Uint8Array(side * side);
    const queue = new Int32Array(side * side);
    const at = (cx: number, cy: number) => (cy - sy + half) * side + (cx - sx + half);
    let head = 0;
    let tail = 0;
    queue[tail++] = at(sx, sy);
    seen[at(sx, sy)] = 1;
    while (head < tail) {
      const c = queue[head++]!;
      const cx = (c % side) - half + sx;
      const cy = Math.floor(c / side) - half + sy;
      for (let d = 0; d < 6; d++) {
        const ax = nx(cx, cy, d);
        const ay = ny(cy, d);
        if (this.isRock(ax, ay)) continue;
        if (hexDistance(sx, sy, ax, ay) >= radius) return true;
        const n = at(ax, ay);
        if (seen[n]) continue;
        seen[n] = 1;
        queue[tail++] = n;
      }
    }
    return false;
  }

  /** The two start nests: the first open spot near the origin that walks out, and a second about `nestGap` from it (never under 70 % of it). */
  startNests(): readonly [Nest, Nest] {
    if (this.#start) return this.#start;
    const { nestGap } = this.options;
    const spot = (salt: number, k: number, cx: number, cy: number, span: number): Nest => ({
      x: cx + (hash01(this.seed, salt, k, 0) * 2 - 1) * span,
      y: cy + (hash01(this.seed, salt, k, 1) * 2 - 1) * span,
      r: 3,
    });
    const ok = (n: Nest) => this.walksOut(n.x, n.y, NEST_ESCAPE);
    let first: Nest | null = null;
    for (let k = 0; k < 400 && !first; k++) {
      const n = spot(91, k, 0, 0, 100);
      if (ok(n)) first = n;
    }
    if (!first) throw new Error(`EndlessPlane: no open ground near the origin (seed ${this.seed})`);
    let second: Nest | null = null;
    let score = Infinity;
    for (let k = 0; k < 400; k++) {
      const n = spot(92, k, first.x, first.y, nestGap * 1.6);
      const d = Math.hypot(n.x - first.x, n.y - first.y);
      const s = Math.abs(d - nestGap);
      if (d < 0.7 * nestGap || s >= score || !ok(n)) continue; // the cheap tests first: a walk-out search is the costly one
      score = s;
      second = n;
    }
    if (!second) throw new Error(`EndlessPlane: no second start nest (seed ${this.seed})`);
    this.#start = [first, second];
    return this.#start;
  }

  /** The start line's segment (the line through the two start holes, its margins included). */
  startSegment(): Segment {
    const [a, b] = this.startNests();
    return startLine(a, b);
  }

  /** Region (rx, ry)'s raw candidate: a point drawn from the seed that is open ground, walks out, and keeps off the start nests; or null. */
  #candidate(rx: number, ry: number): Site | null {
    const key = `${rx},${ry}`;
    if (this.#candidates.has(key)) return this.#candidates.get(key)!;
    const { regionChunks, density } = this.options;
    const span = regionChunks * CHUNK;
    const x = rx * span + hash01(this.seed, 93, rx, ry) * span;
    const y = (ry * span + hash01(this.seed, 94, rx, ry) * span) * R;
    let site: Site | null = { x, y, r: 3, rx, ry, heading: hash01(this.seed, 95, rx, ry) * Math.PI };
    if (hash01(this.seed, 96, rx, ry) >= density || !this.walksOut(x, y, NEST_ESCAPE)) site = null;
    else if (this.startNests().some((n) => Math.hypot(n.x - x, n.y - y) <= NEW_LINE_GAP)) site = null;
    else if (segmentGap(holeLine(x, y, site.heading), this.startSegment()) < LINE_CLEARANCE) site = null;
    if (this.#candidates.size >= this.options.cacheChunks) this.#candidates.clear();
    this.#candidates.set(key, site);
    return site;
  }

  /**
   * Region (rx, ry)'s wild site, or null: its candidate, unless a neighbouring region's raw candidate is closer than `wildGap` or its reserved
   * line comes within the clearance of this one's, in which case the candidate of the higher hash wins. Raw candidates only, so no region's
   * answer depends on another's final one.
   */
  site(rx: number, ry: number): Site | null {
    const key = `${rx},${ry}`;
    if (this.#sites.has(key)) return this.#sites.get(key)!;
    const me = this.#candidate(rx, ry);
    let keep = me;
    if (me) {
      const mine = hash4(this.seed, 97, rx, ry);
      for (let dy = -1; dy <= 1 && keep; dy++)
        for (let dx = -1; dx <= 1 && keep; dx++) {
          if (!dx && !dy) continue;
          const o = this.#candidate(rx + dx, ry + dy);
          if (!o) continue;
          const close =
            Math.hypot(o.x - me.x, o.y - me.y) < this.options.wildGap ||
            segmentGap(holeLine(me.x, me.y, me.heading), holeLine(o.x, o.y, o.heading)) < LINE_CLEARANCE;
          if (!close) continue;
          const theirs = hash4(this.seed, 97, o.rx, o.ry);
          if (theirs > mine || (theirs === mine && (o.ry < ry || (o.ry === ry && o.rx < rx)))) keep = null;
        }
    }
    if (this.#sites.size >= this.options.cacheChunks) this.#sites.clear();
    this.#sites.set(key, keep);
    return keep;
  }

  /** The wild sites whose regions overlap the box of world units [x0, x1] × [y0, y1]. */
  sitesIn(x0: number, y0: number, x1: number, y1: number): Site[] {
    const span = this.options.regionChunks * CHUNK;
    const out: Site[] = [];
    for (let ry = Math.floor(y0 / R / span); ry <= Math.floor(y1 / R / span); ry++)
      for (let rx = Math.floor(x0 / span); rx <= Math.floor(x1 / span); rx++) {
        const s = this.site(rx, ry);
        if (s && s.x >= x0 && s.x <= x1 && s.y >= y0 && s.y <= y1) out.push(s);
      }
    return out;
  }

  /** The nests the world placed within `d` of world (x, y): the start nests and the wild sites. */
  nestsNear(x: number, y: number, d: number): Nest[] {
    const near = (n: Nest) => Math.hypot(n.x - x, n.y - y) <= d;
    return [...this.startNests().filter(near), ...this.sitesIn(x - d, y - d, x + d, y + d).filter(near)];
  }

  /** Which cells of chunk (cx, cy)'s 3×3 neighbourhood join open ground that leaves it: a flood from the window's border over the seed's terrain. */
  #reach(cx: number, cy: number): Reach {
    const w = 3 * CHUNK;
    const x0 = (cx - 1) << CHUNK_BITS;
    const y0 = (cy - 1) << CHUNK_BITS;
    const open = new Uint8Array(w * w);
    for (let ly = 0; ly < 3; ly++)
      for (let lx = 0; lx < 3; lx++) {
        const r = this.rockOf(cx - 1 + lx, cy - 1 + ly);
        for (let j = 0; j < CHUNK; j++)
          for (let i = 0; i < CHUNK; i++) open[(ly * CHUNK + j) * w + lx * CHUNK + i] = r[local(i, j)] === ROCK ? 0 : 1;
      }
    const mask = new Uint8Array(w * w);
    const queue = new Int32Array(w * w);
    let tail = 0;
    for (let j = 0; j < w; j++)
      for (let i = 0; i < w; i++) {
        const o = j * w + i;
        if ((i === 0 || j === 0 || i === w - 1 || j === w - 1) && open[o]) {
          mask[o] = 1;
          queue[tail++] = o;
        }
      }
    for (let head = 0; head < tail; head++) {
      const o = queue[head]!;
      const i = o % w;
      const j = (o - i) / w;
      for (let d = 0; d < 6; d++) {
        const ax = nx(i + x0, j + y0, d) - x0;
        const ay = ny(j + y0, d) - y0;
        if (ax < 0 || ay < 0 || ax >= w || ay >= w) continue;
        const n = ay * w + ax;
        if (!open[n] || mask[n]) continue;
        mask[n] = 1;
        queue[tail++] = n;
      }
    }
    return { mask, x0, y0, w };
  }

  /** The food patches chunk (cx, cy)'s stream draws that are kept: reachable (in its 3×3 window) and clear of the world's nests. */
  patchesOf(cx: number, cy: number): readonly Patch[] {
    const key = chunkKey(cx, cy);
    const have = this.#patches.get(key);
    if (have) return have;
    const o = this.options;
    const r = mulberry32(hash4(this.seed, 77, cx, cy));
    const count = Math.floor(o.patchesPerChunk) + (r() < o.patchesPerChunk % 1 ? 1 : 0);
    const out: Patch[] = [];
    let reach: Reach | null = null;
    for (let p = 0; p < count; p++) {
      for (let tries = 0; tries < 12; tries++) {
        const y = ((cy << CHUNK_BITS) + r() * CHUNK) * R;
        const x = (cx << CHUNK_BITS) + r() * CHUNK;
        const radius = 2 + r() * 2;
        reach ??= this.#reach(cx, cy);
        cellOf(x, y);
        const ix = CELL[0]! - reach.x0;
        const iy = CELL[1]! - reach.y0;
        if (ix < 0 || iy < 0 || ix >= reach.w || iy >= reach.w || !reach.mask[iy * reach.w + ix]) continue;
        // every cell of the patch, not just its centre
        if (this.nestsNear(x, y, o.foodMinDist + radius + 1).some((n) => Math.hypot(x - n.x, y - n.y) - radius - 1 < o.foodMinDist))
          continue;
        out.push({ x, y, radius });
        break;
      }
    }
    if (this.#patches.size >= this.options.cacheChunks) this.#patches.clear();
    this.#patches.set(key, out);
    return out;
  }

  /** Chunk (cx, cy) as generated: the seed's terrain, cleared under every nest and patch that touches it, with the patches' food. */
  chunk(cx: number, cy: number): PlaneChunk {
    const rock = Uint8Array.from(this.rockOf(cx, cy));
    const food = new Float32Array(CHUNK * CHUNK);
    const { foodPerCell } = this.options;
    const x0 = cx << CHUNK_BITS;
    const y0 = cy << CHUNK_BITS;
    const paint = (px: number, py: number, radius: number, fed: boolean) => {
      const ya = Math.max(y0, Math.floor(py / R - radius / R - 1));
      const yb = Math.min(y0 + CHUNK - 1, Math.ceil(py / R + radius / R));
      const xa = Math.max(x0, Math.floor(px - radius - 1));
      const xb = Math.min(x0 + CHUNK - 1, Math.ceil(px + radius));
      for (let y = ya; y <= yb; y++)
        for (let x = xa; x <= xb; x++)
          if (Math.hypot(centreX(x, y) - px, centreY(y) - py) <= radius) {
            const i = local(x - x0, y - y0);
            rock[i] = 0;
            if (fed) food[i] = foodPerCell;
          }
    };
    // A nest clears its mound's ground (the bounded generator's `clear`: radius + 4).
    const reach = 3 + 4;
    const bx0 = x0 - reach;
    const by0 = y0 * R - reach;
    const bx1 = x0 + CHUNK + reach;
    const by1 = (y0 + CHUNK) * R + reach;
    for (const n of [
      ...this.startNests().filter((n) => n.x >= bx0 && n.x <= bx1 && n.y >= by0 && n.y <= by1),
      ...this.sitesIn(bx0, by0, bx1, by1),
    ])
      paint(n.x, n.y, n.r + 4, false);
    for (let j = -1; j <= 1; j++)
      for (let i = -1; i <= 1; i++) for (const p of this.patchesOf(cx + i, cy + j)) paint(p.x, p.y, p.radius, true);
    return { rock, food };
  }
  /**
   * The food first generated within `d` of world (x, y): the cells of the chunks the disc covers whose centres lie within it, over the food the
   * generator places (never what has been eaten or grown since). A fixed disc, the same in any order of generation: `foodHome` divides a colony's
   * stores by this over 2 U round its hole (docs/endless-world.md §3).
   */
  foodWithin(x: number, y: number, d: number): number {
    let total = 0;
    const cx0 = Math.floor((x - d - 1) / CHUNK);
    const cx1 = Math.floor((x + d + 1) / CHUNK);
    const cy0 = Math.floor((y - d - 1) / R / CHUNK);
    const cy1 = Math.floor((y + d + 1) / R / CHUNK);
    for (let cy = cy0; cy <= cy1; cy++)
      for (let cx = cx0; cx <= cx1; cx++) {
        const { food } = this.chunk(cx, cy);
        for (let j = 0; j < CHUNK; j++)
          for (let i = 0; i < CHUNK; i++) {
            const v = food[local(i, j)]!;
            if (v && Math.hypot(centreX((cx << CHUNK_BITS) + i, (cy << CHUNK_BITS) + j) - x, centreY((cy << CHUNK_BITS) + j) - y) <= d)
              total += v;
          }
      }
    return total;
  }
}
