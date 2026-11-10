import type { Role } from "../colony/chambers.ts";
import type { Colony } from "../colony/colony.ts";
import { CELL, cellOf, centreX, centreY, R } from "../colony/hex.ts";

// The nest as the player sees it, pure, for the Learn drawer's Nest tab and
// the field's chamber labels. This is the whole map's view, read from the
// chamber table: an ant senses none of it except the role of the chamber it
// stands in (docs/vision.md, the sense table), and the drawer says so.

export interface ChamberView {
  id: number;
  role: Role;
  /** rows below the ground line (the entrance's row), to its floor */
  depth: number;
  cells: number;
  floor: number;
  brood: number;
  food: number;
  /** ants of its colony in it now */
  ants: number;
  /** its centre, in world units */
  x: number;
  y: number;
  queen: boolean;
}

export interface NestView {
  chambers: ChamberView[];
  queen: "alive" | "dead" | null;
  /** eggs, larvae, pupae */
  brood: [number, number, number];
  /** the dead on the midden */
  midden: number;
  /** ants inside the nest, and outside */
  inside: number;
  outside: number;
}

/** What each role is for, in a few words (COLONY_LEGEND's glosses). */
export const ROLE_TEXT: Record<Role, string> = {
  royal: "the queen's: she lays her eggs here",
  brood: "where larvae are fed and pupae lie",
  store: "food kept, below the queen",
  reception: "where foragers bring food in, above the queen",
  midden: "refuse",
  none: "not given a use yet",
};

/** The row a world y lies on. */
const rowOf = (y: number) => Math.round(y / R - 0.5);

/** Colony col's nest, or null on a map without chambers (the top-down maps). */
export function nestView(col: Colony): NestView | null {
  const chambers = col.map.chambers;
  if (!chambers) return null;
  const k = col.params.nest;
  const ground = col.nest.entrance ? rowOf(col.nest.entrance.y) : 0;
  const ants = new Map<number, number>();
  for (let i = 0; i < col.n; i++) {
    // Only ants on the nest's layer (one world: the curtain; an ant on the plane over a chamber is not in it).
    if (!col.alive[i] || col.layer[i] !== col.home) continue;
    cellOf(col.x[i] as number, col.y[i] as number);
    const id = chambers.at(CELL[0] as number, CELL[1] as number);
    if (id >= 0) ants.set(id, (ants.get(id) ?? 0) + 1);
  }
  let queenIn = -1;
  if (col.queen) {
    cellOf(col.queen.x, col.queen.y);
    queenIn = chambers.at(CELL[0] as number, CELL[1] as number);
  }
  const list: ChamberView[] = [];
  for (const ch of chambers.list) {
    if (ch.colony !== k || ch.cells === 0) continue;
    const cx = ch.sumX / ch.cells;
    const cy = ch.sumY / ch.cells;
    list.push({
      id: ch.id,
      role: ch.role,
      depth: ch.floorRow - ground,
      cells: ch.cells,
      floor: ch.floor,
      brood: ch.brood,
      food: ch.food,
      ants: ants.get(ch.id) ?? 0,
      x: centreX(Math.round(cx), Math.round(cy)),
      y: centreY(cy),
      queen: ch.id === queenIn,
    });
  }
  list.sort((a, b) => a.depth - b.depth || a.x - b.x);
  let midden = 0;
  for (const n of col.midden.values()) midden += n;
  return { chambers: list, queen: col.queen ? (col.queen.alive ? "alive" : "dead") : null, brood: col.brood.counts(), midden, inside: col.inNest, outside: col.outside };
}
