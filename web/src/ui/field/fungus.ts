// The fungus in the map (ja-fnd.6.3.6, docs/field-split.md): the mycelium's hyphae, cords, twigs, tips, the mass in transit, the knots and fruits,
// the corpses it has colonised and the stalks raised on them. Plain functions over FieldCtx: no React, no DOM (a path comes from FieldEnv).
// The spore wash is not here: it is painted into the ground's chunks (paintChunk), and moves with them.

import {
  HYPHA_MASS,
  HYPHA_ROOT,
  cellKey,
  centreX,
  centreY,
  hyphaCell,
  nx as neighbourX,
  ny as neighbourY,
  PLANE,
  type Hyphae,
} from "../../colony/index.ts";
import { visibleCadavers } from "../cadaverVisual.ts";
import { toScreen } from "../camera.ts";
import { HYPHA_COLOURS } from "../hyphaVisual.ts";
import { type Chain, chainsOf, hash, smoothThrough, twigsOf, wander } from "../hyphaeLook.ts";
import { workerLod } from "../workerSprites.ts";
import { UNKNOWN } from "../fog/knowledge.ts";
import type { FieldCtx } from "./ctx.ts";
import { HEX_ZOOM } from "./zoom.ts";

/** The cells in view: rows ry0 … ry1 and columns rx0 … rx1 (a cell's margin is added by the layers). */
export interface CellWindow {
  rx0: number;
  rx1: number;
  ry0: number;
  ry1: number;
}

/** What the ground stage found about the fungus that the raised stalks need later in the frame. */
export interface FungusFrame {
  /** the cells of this layer's corpses that have a stalk now */
  stalks: ReadonlySet<number>;
  /** the Stalks upgrade's level: none, a stalk, a tall stalk */
  stalkLevel: number;
}

/** A run of hyphae with what drawing it needs that does not change with the camera: its cells' bent world positions, and the box of cells it spans. */
interface DrawnChain extends Chain {
  /** the bent world positions of its cells: x0, y0, x1, y1, … (ui/hyphaeLook.ts wander) */
  world: number[];
  /** the box of grid cells it spans */
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

/**
 * The runs of a hyphal tree (ui/hyphaeLook.ts chainsOf) with their bent positions, kept between frames: found again when the
 * tree's size changes, but no sooner than REBUILD_MIN ms after the last time (a growing tree changes every tick), and at the
 * latest every REBUILD_MAX ms (a cut and a sprout that leave the size alone show a moment late). A cell never moves, so only the
 * tree's shape needs finding again, not the camera's view of it.
 */
export const REBUILD_MIN = 60;
export const REBUILD_MAX = 150;
const chainCache = new WeakMap<Hyphae, { size: number; cords: number; at: number; chains: DrawnChain[] }>();
function chainsFor(h: Hyphae, nowMs: number): DrawnChain[] {
  const hit = chainCache.get(h);
  if (hit) {
    const age = nowMs - hit.at;
    if (age < REBUILD_MIN || (age < REBUILD_MAX && hit.size === h.parent.size && hit.cords === h.cords.size)) return hit.chains;
  }
  const spot = [0, 0];
  const chains = chainsOf(h.parent, h.cords, HYPHA_ROOT).map((ch): DrawnChain => {
    const world: number[] = [];
    let x0 = Infinity;
    let x1 = -Infinity;
    let y0 = Infinity;
    let y1 = -Infinity;
    for (const k of ch.cells) {
      const [kx, ky] = hyphaCell(k);
      wander(centreX(kx, ky), centreY(ky), spot);
      world.push(spot[0]!, spot[1]!);
      x0 = Math.min(x0, kx);
      x1 = Math.max(x1, kx);
      y0 = Math.min(y0, ky);
      y1 = Math.max(y1, ky);
    }
    return { ...ch, world, x0, x1, y0, y1 };
  });
  chainCache.set(h, { size: h.parent.size, cords: h.cords.size, at: nowMs, chains });
  return chains;
}

/**
 * The mycelium's hyphae (ja-2bw.3, docs/hyphal-growth.md): each run of cells between branch points as one wandering curve
 * through the cells' centres (bent by a smooth seeded warp, so no hex-to-hex straights: ui/hyphaeLook.ts), the loops
 * fusion closed, short fuzz twigs off the thin hyphae when zoomed in, and a dot at each tip. On the plane (`under`) faint,
 * as threads just under the surface; in the curtain plainer. Only the cells in view (rows ry0…ry1, columns rx0…rx1, a
 * cell's margin).
 */
export function drawHyphae(k: FieldCtx, h: Hyphae, under: boolean, win: CellWindow): void {
  const { ctx, c, v, d, env } = k;
  const { rx0, rx1, ry0, ry1 } = win;
  const fungalSprites = k.sprites.fungal;
  const inView = (x: number, y: number) => x >= rx0 - 1 && x <= rx1 + 1 && y >= ry0 - 1 && y <= ry1 + 1;
  const distant = c.zoom < HEX_ZOOM * d;
  {
    const spot = [0, 0];
    /** the screen position of cell (x, y)'s centre, bent by the warp */
    const at = (x: number, y: number): [number, number] => {
      wander(centreX(x, y), centreY(y), spot);
      return toScreen(c, v, spot[0]!, spot[1]!);
    };
    const path = env.newPath();
    // Cords (a web, ja-2bw.8): the runs of cord cells, drawn thicker.
    const cords = env.newPath();
    const pts: number[] = [];
    for (const ch of chainsFor(h, env.now())) {
      if (ch.x1 < rx0 - 1 || ch.x0 > rx1 + 1 || ch.y1 < ry0 - 1 || ch.y0 > ry1 + 1) continue;
      pts.length = 0;
      for (let i = 0; i < ch.world.length; i += 2)
        pts.push((ch.world[i]! - c.x) * c.zoom + v.w / 2, (ch.world[i + 1]! - c.y) * c.zoom + v.h / 2);
      smoothThrough(ch.cord ? cords : path, pts);
    }
    // The loops fusion closed: a gently bowed curve from one cell to the other.
    for (let i = 0; i + 1 < h.fusions.length; i += 2) {
      const a = h.fusions[i]!;
      const b = h.fusions[i + 1]!;
      const [ax, ay] = hyphaCell(a);
      const [bx, by] = hyphaCell(b);
      if (!inView(ax, ay) && !inView(bx, by)) continue;
      const [sx, sy] = at(ax, ay);
      const [tx, ty] = at(bx, by);
      const bow = (hash(a, b, 3) - 0.5) * 0.7;
      path.moveTo(sx, sy);
      path.quadraticCurveTo((sx + tx) / 2 - (ty - sy) * bow, (sy + ty) / 2 + (tx - sx) * bow, tx, ty);
    }
    // A patch's own cells (a landing's, a flower's): roots with no hypha between them, so they would show as separate islands beside
    // hyphae that run out of them. Each pair of neighbouring cells of the patch that no hypha joins already gets the same short
    // bowed curve as a loop, so the patch reads as connected (owner, 2026-11-23). Drawing only: the tree is unchanged.
    for (const a of h.sources) {
      const [ax, ay] = hyphaCell(a);
      for (let dir = 0; dir < 6; dir++) {
        const bx = neighbourX(ax, ay, dir);
        const by = neighbourY(ay, dir);
        const b = cellKey(bx, by);
        if (b <= a || !h.sources.has(b)) continue;
        if (h.parent.get(a) === b || h.parent.get(b) === a) continue;
        if (!inView(ax, ay) && !inView(bx, by)) continue;
        const [sx, sy] = at(ax, ay);
        const [tx, ty] = at(bx, by);
        const bow = (hash(a, b, 4) - 0.5) * 0.7;
        path.moveTo(sx, sy);
        path.quadraticCurveTo((sx + tx) / 2 - (ty - sy) * bow, (sy + ty) / 2 + (tx - sx) * bow, tx, ty);
      }
    }
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = HYPHA_COLOURS.body;
    const thin = Math.max(1 * d, Math.min(3 * d, c.zoom * 0.12));
    ctx.globalAlpha = under ? 0.45 : 0.9;
    ctx.lineWidth = thin;
    ctx.stroke(path);
    ctx.lineWidth = Math.max(2.5 * d, Math.min(8 * d, c.zoom * 0.32));
    ctx.stroke(cords);
    ctx.restore();
    if (!distant) {
      const twigs = env.newPath();
      for (const ch of chainsFor(h, env.now())) {
        if (ch.cord || ch.x1 < rx0 - 1 || ch.x0 > rx1 + 1 || ch.y1 < ry0 - 1 || ch.y0 > ry1 + 1) continue;
        for (let i = 1; i < ch.cells.length; i++) {
          const j = 2 * i;
          const x = ch.world[j]!,
            y = ch.world[j + 1]!;
          const [hx, hy] = hyphaCell(ch.cells[i]!);
          if (!inView(hx, hy)) continue;
          const [sx, sy] = toScreen(c, v, x, y);
          const angle = Math.atan2(y - ch.world[j - 1]!, x - ch.world[j - 2]!);
          twigsOf(twigs, ch.cells[i]!, sx, sy, angle, c.zoom * 0.12, 0.65);
        }
      }
      ctx.save();
      ctx.strokeStyle = HYPHA_COLOURS.core;
      ctx.lineWidth = Math.max(d, c.zoom * 0.025);
      ctx.stroke(twigs);
      ctx.restore();
    }
  }
  const bent = (x: number, y: number): [number, number] => {
    const point = [0, 0];
    wander(centreX(x, y), centreY(y), point);
    return toScreen(c, v, point[0]!, point[1]!);
  };
  ctx.save();
  ctx.fillStyle = HYPHA_COLOURS.body;
  ctx.globalAlpha = 1;
  const r = Math.max(1.5 * d, Math.min(4 * d, c.zoom * 0.18));
  for (const t of h.tips) {
    if (!inView(t.x, t.y)) continue;
    const [x, y] = bent(t.x, t.y),
      dx = centreX(neighbourX(t.x, t.y, t.heading), neighbourY(t.y, t.heading)) - centreX(t.x, t.y),
      dy = centreY(neighbourY(t.y, t.heading)) - centreY(t.y);
    fungalSprites.draw(ctx, { tips: [[dx, dy]] }, 0, x, y, c.zoom);
  }
  // Mass in transit (ja-tgw9, flow on): a soft glow on each cell it fills, brighter and wider the more there is, so the
  // player sees where the mycelium is feeding and a front cut off from it going dim.
  for (const [cell, load] of h.loads) {
    if (load < HYPHA_MASS * 0.1) continue;
    const [lx, ly] = hyphaCell(cell);
    if (!inView(lx, ly)) continue;
    const [x, y] = bent(lx, ly);
    const full = Math.min(1, load / (HYPHA_MASS * 2));
    ctx.globalAlpha = (under ? 0.3 : 0.5) * full;
    ctx.beginPath();
    ctx.arc(x, y, r * (1 + full), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  const fruits = new Set(h.fruits);
  for (const cell of new Set([...h.knots.keys(), ...fruits])) {
    const [kx, ky] = hyphaCell(cell);
    if (!inView(kx, ky)) continue;
    const [x, y] = bent(kx, ky);
    fungalSprites.draw(
      ctx,
      { knot: h.knots.has(cell), knotSprouted: h.knots.get(cell)?.sprouted ?? false, fruit: fruits.has(cell) },
      cell,
      x,
      y,
      c.zoom,
    );
  }
  ctx.restore();
}

/**
 * The fungus on the ground, before the ants: the hyphae of this layer, then each corpse it has colonised (a bare mark, or a stalk where the
 * Stalks upgrade has raised one, with the cadaver under it when no colony's visible cadaver lies on that cell). Returns what the raised stalks
 * need later.
 */
export function drawFungusGround(k: FieldCtx, win: CellWindow): FungusFrame {
  const { ctx, c, v, d, lv, colonies, fungus, sprites } = k;
  const { rx0, rx1, ry0, ry1 } = win;
  const hy = fungus.hyphaeOn(lv);
  if (hy) drawHyphae(k, hy, lv === PLANE, win);
  const corpseCells = new Set(colonies.flatMap((col) => visibleCadavers(col, lv).map((cadaver) => cellKey(cadaver.x, cadaver.y))));
  const stalks = new Set(fungus.stalksOn(lv)),
    stalkLevel = fungus.evolution?.level("stalks") ?? 0;
  for (const [cell, left] of fungus.corpsesOn(lv)) {
    const [sx, sy] = hyphaCell(cell);
    if (k.fog && k.fog.state(lv, sx, sy) === UNKNOWN) continue; // a corpse nothing has sensed is not shown
    if (sx < rx0 - 1 || sx > rx1 + 1 || sy < ry0 - 1 || sy > ry1 + 1) continue;
    const [x, y] = toScreen(c, v, centreX(sx, sy), centreY(sy));
    sprites.fungal.draw(
      ctx,
      { colonised: true, sporulating: left > 0, stalkLevel: stalks.has(cell) ? stalkLevel : 0 },
      cell,
      x,
      y,
      c.zoom,
      "ground",
    );
    if (stalks.has(cell) && !corpseCells.has(cell)) sprites.cadaver.draw(ctx, workerLod(c.zoom, d), 1, x, y, c.zoom);
  }
  return { stalks, stalkLevel };
}

/** Tall structures occlude bodies in the aerial view, just as they do in 3D inspection: each stalk again, raised, over the ants. */
export function drawStalksRaised(k: FieldCtx, win: CellWindow, f: FungusFrame): void {
  const { ctx, c, v } = k;
  const { rx0, rx1, ry0, ry1 } = win;
  for (const cell of f.stalks) {
    const [sx, sy] = hyphaCell(cell);
    if (k.fog && k.fog.state(k.lv, sx, sy) === UNKNOWN) continue;
    if (sx < rx0 - 1 || sx > rx1 + 1 || sy < ry0 - 1 || sy > ry1 + 1) continue;
    const [x, y] = toScreen(c, v, centreX(sx, sy), centreY(sy));
    k.sprites.fungal.draw(ctx, { stalkLevel: f.stalkLevel }, cell, x, y, c.zoom, "raised");
  }
}
