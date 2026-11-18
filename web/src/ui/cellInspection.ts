import { chamberFoodSpots } from "./chamberFood.ts";
import { decayStage, visibleCadavers, type DecayStage, type InspectedCadaver } from "./cadaverVisual.ts";
import type { FungalStructures } from "./fungalStructures.ts";
import {
  CELL,
  CORPSE_ROT,
  HYPHA_ROOT,
  INFECTED,
  PLANE,
  OPEN,
  rockAt,
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
  odour?: number;
  cargo?: "none" | "food" | "soil" | "corpse" | "brood";
  broodStage?: number;
  corpseStage?: DecayStage;
}
export interface InspectedQueen {
  k: number;
  x: number;
  y: number;
  alive: boolean;
  infected: boolean;
  odour?: number;
}
export interface CellInspectionState extends FungalStructures {
  cell: [number, number];
  place: LensProbe;
  quality: number;
  /** Estimated aphids per cell from aggregate clumps, not a literal local population. */
  aphidDensity: number;
  ants: InspectedAnt[];
  /** Local thread directions to real connected neighbours, in map-world offsets. */
  threads: [number, number][];
  knot: boolean;
  cord?: boolean;
  stalk: boolean;
  queens: InspectedQueen[];
  /** Loose brood has cell coordinates only; floor icons are grouped by stage. Held brood is attached to its carrier. */
  brood: [number, number, number];
  cadavers?: InspectedCadaver[];
  recentRemains?: number;
  storedFoodMarks?: number;
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
    cadavers: [],
    recentRemains: 0,
    storedFoodMarks: 0,
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
        odour: c.odour[i],
        cargo: c.item(i),
      });
    }
    const carriers = new Map(out.ants.filter((a) => a.k === k).map((a) => [a.i, a]));
    const home = layer < 0 || layer === c.home;
    if (home && map.chambers)
      for (const ch of map.chambers.list) {
        if (ch.colony !== c.params.nest) continue;
        for (const [xx, yy] of chamberFoodSpots(ch, (xx, yy) => map.chambers!.at(xx, yy) === ch.id && rockAt(map, xx, yy) === OPEN))
          if (xx === gx && yy === gy) out.storedFoodMarks!++;
      }
    if (home && c.queen) {
      cellOf(c.queen.x, c.queen.y);
      if (CELL[0] === gx && CELL[1] === gy)
        out.queens.push({
          k,
          x: c.queen.x - cx,
          y: c.queen.y - cy,
          alive: c.queen.alive,
          infected: c.queen.load >= INFECTED,
          odour: c.nestOdour,
        });
    }
    for (const b of c.brood.items) {
      if (b.held >= 0) {
        const a = carriers.get(b.held);
        if (a?.cargo === "brood") a.broodStage = b.stage;
      } else if (home && b.x === gx && b.y === gy) out.brood[b.stage]++;
    }
    for (const dead of visibleCadavers(c, layer))
      if (dead.x === gx && dead.y === gy) out.cadavers!.push({ stage: decayStage(c.time, dead.died), fungal: false });
    for (const dead of c.remains)
      if (c.time - dead.died <= CORPSE_ROT && (layer < 0 || (dead.layer ?? c.home) === layer) && dead.x === gx && dead.y === gy)
        out.recentRemains!++;
    for (const dead of c.corpses)
      if (dead.held >= 0) {
        const a = carriers.get(dead.held);
        if (a) a.corpseStage = decayStage(c.time, dead.died);
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
    out.knotSprouted = h.knots.get(key)?.sprouted ?? false;
    out.cord = h.cords.has(key);
    out.fruit = h.fruits.includes(key);
    out.tips = h.tips
      .filter((t) => t.x === gx && t.y === gy)
      .map((t) => [centreX(nx(gx, gy, t.heading), ny(gy, t.heading)) - cx, centreY(ny(gy, t.heading)) - cy]);
  }
  out.stalk = g.fungus.stalksOn(lv).includes(key);
  const left = g.fungus.corpsesOn(lv).get(key);
  out.colonised = left !== undefined;
  out.sporulating = (left ?? 0) > 0;
  out.stalkLevel = out.stalk ? Math.max(1, g.fungus.evolution?.level("stalks") ?? 1) : 0;
  // Legacy saves and aggregate fungal sites still record a colonised cadaver resource, even without a loose-body record.
  if (out.stalk && !out.cadavers!.length) out.cadavers!.push({ stage: 1, fungal: true });
  return out;
}
