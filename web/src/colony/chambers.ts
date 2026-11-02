import { ChunkLayer } from "./chunks.ts";
import { nx, ny } from "./hex.ts";

// Nest chambers, pure (nest slice 2, docs/nest-and-home.md §3.2). A chamber is a widening off a shaft that the ants
// dig: a few cells of open ground with a floor, belonging to one colony. In the side view a cell of a chamber knows
// its chamber, and each chamber counts its cells and its floor (cells with no open ground under them: where ants,
// brood and food can lie). Floor per worker is what regulates digging (Odontomachus: ~2 cm² of floor per worker,
// whatever the nest's size), and where chambers lie is what the depth profile measures (Tschinkel: largest near the
// top, the gaps between them growing with depth).

/** What a chamber is for (slice 3 gives each its role; until then every chamber is "none" but the founding one). */
export type Role = "none" | "royal" | "brood" | "store" | "reception" | "midden";

export interface Chamber {
  id: number;
  /** the colony (its nest's index in WorldMap.nests) */
  colony: number;
  /** the row its floor was started on: chambers widen along it, at most CHAMBER_HEIGHT rows up */
  floorRow: number;
  /** the columns it spans (its westmost and eastmost cells) */
  x0: number;
  x1: number;
  /** cells in it */
  cells: number;
  /** of them, cells with ground under them to stand on (floor) */
  floor: number;
  role: Role;
  /** brood lying in it (slice 4): digging is drawn to it */
  brood: number;
}

/** A chamber is this many rows high: it widens along its floor and the row above, and no higher (chambers are ~1 cm high whatever their area). */
export const CHAMBER_HEIGHT = 2;

export class Chambers {
  /** per cell, the chamber's id + 1 (0 = in no chamber) */
  readonly cell = new ChunkLayer((n) => new Uint16Array(n), 0);
  /** per cell, 1 if it is counted as its chamber's floor */
  readonly #floor = new ChunkLayer((n) => new Uint8Array(n), 0);
  readonly list: Chamber[] = [];
  /** floor cells per colony, over all its chambers */
  readonly floorOf: number[] = [];

  /** The chamber cell (x, y) is in, or −1. */
  at(x: number, y: number): number {
    return this.cell.get(x, y) - 1;
  }

  /** A new chamber for `colony`, its floor on row `floorRow` (no cells yet: claim them). */
  add(colony: number, floorRow: number, role: Role = "none"): Chamber {
    const c: Chamber = { id: this.list.length, colony, floorRow, x0: Infinity, x1: -Infinity, cells: 0, floor: 0, role, brood: 0 };
    this.list.push(c);
    while (this.floorOf.length <= colony) this.floorOf.push(0);
    return c;
  }

  /** Open cell (x, y) becomes part of chamber `id`. `open(x, y)`: whether a cell is open ground. */
  claim(id: number, x: number, y: number, open: (x: number, y: number) => boolean): void {
    if (this.at(x, y) >= 0) return;
    const c = this.list[id] as Chamber;
    this.cell.set(x, y, id + 1);
    c.cells++;
    c.x0 = Math.min(c.x0, x);
    c.x1 = Math.max(c.x1, x);
    this.#refloor(x, y, open);
  }

  /** Cell (x, y) was dug or filled: the chamber cells above it (and it) may have gained or lost their floor. */
  changed(x: number, y: number, open: (x: number, y: number) => boolean): void {
    this.#refloor(x, y, open);
    this.#refloor(nx(x, y, 4), ny(y, 4), open); // north-west
    this.#refloor(nx(x, y, 5), ny(y, 5), open); // north-east
  }

  /** A filled chamber cell leaves its chamber (backfill never fills one; a test or a cave-in might). */
  release(x: number, y: number): void {
    const id = this.at(x, y);
    if (id < 0) return;
    const c = this.list[id] as Chamber;
    if (this.#floor.get(x, y)) {
      this.#floor.set(x, y, 0);
      c.floor--;
      this.floorOf[c.colony] = (this.floorOf[c.colony] as number) - 1;
    }
    this.cell.set(x, y, 0);
    c.cells--;
  }

  #refloor(x: number, y: number, open: (x: number, y: number) => boolean): void {
    const id = this.at(x, y);
    if (id < 0) return;
    const c = this.list[id] as Chamber;
    // Floor: open itself, with ground under it to stand on (south-west or south-east closed). Both, and every tunnel
    // dug down out of a chamber took two floor cells with it: the founding chamber's floor wore away to nothing.
    const floor = open(x, y) && (!open(nx(x, y, 1), ny(y, 1)) || !open(nx(x, y, 2), ny(y, 2))) ? 1 : 0;
    const was = this.#floor.get(x, y);
    if (floor === was) return;
    this.#floor.set(x, y, floor);
    const d = floor - was;
    c.floor += d;
    this.floorOf[c.colony] = (this.floorOf[c.colony] as number) + d;
  }
}
