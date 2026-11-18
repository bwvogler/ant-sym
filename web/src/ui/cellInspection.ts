import {
  CELL,
  HYPHA_ROOT,
  INFECTED,
  PLANE,
  aphidCount,
  cellKey,
  cellOf,
  centreX,
  centreY,
  hyphaCell,
  nx,
  ny,
  type AphidClump,
} from "../colony/index.ts";
import { probe, type LensProbe, type LensWorld } from "./lens.ts";
import type { SensedMap } from "./fungusSight.ts";

export interface InspectedAnt {
  k: number;
  i: number;
  gen: number;
  x: number;
  y: number;
  heading: number;
  carrying: boolean;
  quality: number;
  infected: boolean;
  cargo?: "none" | "food" | "soil" | "corpse" | "brood";
  broodStage?: number;
}
export interface InspectedQueen {
  k: number;
  x: number;
  y: number;
  alive: boolean;
  infected: boolean;
}
export interface CellInspectionState {
  cell: [number, number];
  place: LensProbe;
  quality: number;
  /** Estimated aphids per cell from aggregate clumps, not a literal local population. */
  aphidDensity: number;
  ants: InspectedAnt[];
  /** Local thread directions to real connected neighbours, in map-world offsets. */
  threads: [number, number][];
  knot: boolean;
  stalk: boolean;
  queens: InspectedQueen[];
  /** Loose brood has cell coordinates only; floor icons are grouped by stage. Held brood is attached to its carrier. */
  brood: [number, number, number];
  fallen: number;
  buried: number;
}

/** Read-only: no relocation, caps, random calls, or extra trail visibility. Cell membership uses the game hex geometry. */
export function inspectCell(
  g: LensWorld,
  sensed: SensedMap,
  layer: number,
  x: number,
  y: number,
  trails: { food: boolean; home: boolean },
  clumps: readonly AphidClump[] = [],
): CellInspectionState {
  cellOf(x, y);
  const gx = CELL[0],
    gy = CELL[1],
    cx = centreX(gx, gy),
    cy = centreY(gy);
  const place = probe(g, sensed, layer, cx, cy, trails);
  const map = g.world ? (layer === PLANE ? g.world.plane : g.world.curtain) : g.colonies[0]!.map;
  const out: CellInspectionState = {
    cell: [gx, gy],
    place,
    quality: map.quality?.get(gx, gy) ?? 1,
    aphidDensity: 0,
    ants: [],
    threads: [],
    knot: false,
    stalk: false,
    queens: [],
    brood: [0, 0, 0],
    fallen: 0,
    buried: 0,
  };
  for (let k = 0; k < g.colonies.length; k++) {
    const c = g.colonies[k];
    for (let i = 0; i < c.n; i++) {
      if (!c.alive[i] || (layer >= 0 && c.layer[i] !== layer)) continue;
      cellOf(c.x[i], c.y[i]);
      if (CELL[0] !== gx || CELL[1] !== gy) continue;
      out.ants.push({
        k,
        i,
        gen: c.gen[i],
        x: c.x[i] - cx,
        y: c.y[i] - cy,
        heading: c.heading[i],
        carrying: !!c.carrying[i],
        quality: c.quality[i],
        infected: c.load[i] >= INFECTED,
        cargo: c.item(i),
      });
    }
    const carriers = new Map(out.ants.filter((a) => a.k === k).map((a) => [a.i, a]));
    const home = layer < 0 || layer === c.home;
    if (home && c.queen) {
      cellOf(c.queen.x, c.queen.y);
      if (CELL[0] === gx && CELL[1] === gy)
        out.queens.push({ k, x: c.queen.x - cx, y: c.queen.y - cy, alive: c.queen.alive, infected: c.queen.load >= INFECTED });
    }
    for (const b of c.brood.items) {
      if (b.held >= 0) {
        const a = carriers.get(b.held);
        if (a?.cargo === "brood") a.broodStage = b.stage;
      } else if (home && b.x === gx && b.y === gy) out.brood[b.stage]++;
    }
    for (const dead of c.corpses)
      if (dead.held < 0 && (layer < 0 || (dead.layer ?? c.home) === layer) && dead.x === gx && dead.y === gy) out.fallen++;
    if (layer < 0 || layer === PLANE) out.buried += c.midden.get(cellKey(gx, gy)) ?? 0;
  }
  const lv = layer < 0 ? 0 : layer;
  for (const c of clumps) {
    if (c.layer !== lv || !c.cells.length) continue;
    for (let j = 0; j < c.cells.length; j += 2)
      if (c.cells[j] === gx && c.cells[j + 1] === gy) {
        out.aphidDensity += aphidCount(c) / (c.cells.length / 2);
        break;
      }
  }
  const h = g.fungus.hyphaeOn(lv),
    key = cellKey(gx, gy);
  if (h?.has(gx, gy)) {
    const linked = new Set<number>();
    const parent = h.parent.get(key);
    if (parent !== undefined && parent !== HYPHA_ROOT) linked.add(parent);
    for (let d = 0; d < 6; d++) {
      const n = cellKey(nx(gx, gy, d), ny(gy, d));
      if (h.parent.get(n) === key) linked.add(n);
    }
    for (let j = 0; j + 1 < h.fusions.length; j += 2) {
      if (h.fusions[j] === key) linked.add(h.fusions[j + 1]);
      else if (h.fusions[j + 1] === key) linked.add(h.fusions[j]);
    }
    for (const n of linked) {
      const [xx, yy] = hyphaCell(n);
      out.threads.push([centreX(xx, yy) - cx, centreY(yy) - cy]);
    }
    out.knot = h.knots.has(key);
  }
  out.stalk = g.fungus.stalksOn(lv).includes(key);
  return out;
}
