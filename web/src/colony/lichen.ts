import { cellKey, keyCell, nx, ny } from "./hex.ts";
import { hash01, ROCK, rockAt, type WorldMap } from "./world.ts";

// A lichen partner (docs/lichen.md §1–2, PRD §90, ja-vlla.11.3), pure. The world holds scarce alga films on rock cells
// beside non-rock ground, and a few wild lichens (small discs on rock). Both are a hash of the seed and the cell, so
// nothing is stored, no random number is drawn and the endless plane needs no chunk of its own. A hypha beside one makes
// it lichen (the fungus took the alga); lichen then spreads over rock from its rim, one cell a LICHEN.every seconds.
// Off (no `lichen` level) nothing here runs and the game is as it was.

/**
 * Design numbers, tuned against P1 (PRD §63.4):
 * - `block`: films and wild lichens lie in blocks this many cells across (clusters, not scatter);
 * - `blockOdds`: the share of blocks that hold algae at all; `filmOdds`: the share of a block's edge cells that are films;
 * - `wildOdds`: the share of `wildBlock`-cell blocks that hold a wild lichen, a disc of `wildRadius` cells at its centre;
 * - `keepOut`: cells round the landing with none (so a game's first contact is a find, not a gift);
 * - `light` (L2, ja-vlla.11.4): growth a second that each lichen cell in light adds to the free pool, as mutations only and not
 *   body mass; every lichen cell is on the plane (layer 0) and so in light; the crust's area, at most `cap` cells, bounds it;
 * - `every`: seconds between rim steps; `cap`: most lichen cells a map's fungus holds (a bound on work, not a rule).
 */
export const LICHEN = {
  light: 0.01,
  block: 4,
  blockOdds: 0.12,
  filmOdds: 0.6,
  wildBlock: 16,
  wildOdds: 0.06,
  wildRadius: 2,
  keepOut: 10,
  every: 20,
  cap: 600,
} as const;

/** What the world holds on a rock cell: a film, part of a wild lichen, or nothing. */
export type Alga = "film" | "wild" | null;

const SALT = 90;

/** Whether the rock cell (x, y) has a non-rock neighbour (an alga film grows where the light and the rain reach). */
function onEdge(map: WorldMap, x: number, y: number): boolean {
  for (let d = 0; d < 6; d++) if (rockAt(map, nx(x, y, d), ny(y, d)) !== ROCK) return true;
  return false;
}

/** The centre of the wild lichen whose block holds (x, y), or null. */
function wildCentre(map: WorldMap, x: number, y: number): [number, number] | null {
  const B = LICHEN.wildBlock;
  const bx = Math.floor(x / B),
    by = Math.floor(y / B);
  if (hash01(map.seed, SALT + 1, bx, by) >= LICHEN.wildOdds) return null;
  const cx = bx * B + 2 + Math.floor(hash01(map.seed, SALT + 2, bx, by) * (B - 4));
  const cy = by * B + 2 + Math.floor(hash01(map.seed, SALT + 3, bx, by) * (B - 4));
  return [cx, cy];
}

/** What the world holds on cell (x, y): see Alga. Pure in the seed. Only rock holds algae. */
export function algaAt(map: WorldMap, x: number, y: number): Alga {
  if (rockAt(map, x, y) !== ROCK) return null;
  const w = wildCentre(map, x, y);
  if (w && Math.max(Math.abs(x - w[0]), Math.abs(y - w[1])) <= LICHEN.wildRadius) return "wild";
  const B = LICHEN.block;
  if (hash01(map.seed, SALT + 4, Math.floor(x / B), Math.floor(y / B)) >= LICHEN.blockOdds) return null;
  if (hash01(map.seed, SALT + 5, x, y) >= LICHEN.filmOdds) return null;
  return onEdge(map, x, y) ? "film" : null;
}

/** One fungus's lichen on one map: the rock cells it holds, by cell, with the time since each last grew (the rim steps on a clock). */
export class Lichen {
  /** lichen cells (hex.ts cellKey) */
  readonly cells = new Set<number>();
  /** seconds since the game began that the first lichen formed, or null (an assay's metric, saved) */
  first: number | null = null;
  /** seconds toward the next rim step */
  clock = 0;
  /** rim steps taken (picks the direction a cell grows in: no random number) */
  rounds = 0;

  /**
   * The contact: every rock cell beside a hypha cell that holds an alga becomes lichen (a wild one takes its whole disc),
   * unless it lies within LICHEN.keepOut of the landing `near` (x, y). Returns the cells made.
   */
  touch(map: WorldMap, hyphaCells: Iterable<number>, near: readonly [number, number] | null, now: number): number {
    let made = 0;
    for (const k of hyphaCells) {
      const [x, y] = keyCell(k);
      for (let d = 0; d < 6; d++) {
        const cx = nx(x, y, d),
          cy = ny(y, d);
        const ck = cellKey(cx, cy);
        if (this.cells.has(ck)) continue;
        const a = algaAt(map, cx, cy);
        if (!a) continue;
        if (near && Math.max(Math.abs(cx - near[0]), Math.abs(cy - near[1])) < LICHEN.keepOut) continue;
        if (a === "film") made += this.#add(ck);
        else {
          const w = wildCentre(map, cx, cy) as [number, number];
          const R = LICHEN.wildRadius;
          for (let yy = w[1] - R; yy <= w[1] + R; yy++)
            for (let xx = w[0] - R; xx <= w[0] + R; xx++) if (rockAt(map, xx, yy) === ROCK) made += this.#add(cellKey(xx, yy));
        }
      }
    }
    if (made > 0 && this.first === null) this.first = now;
    return made;
  }

  #add(k: number): number {
    if (this.cells.size >= LICHEN.cap || this.cells.has(k)) return 0;
    this.cells.add(k);
    return 1;
  }

  /** The rim: every LICHEN.every seconds each lichen cell with a free rock neighbour grows into one of them (the direction turns each step). */
  step(map: WorldMap, dt: number): void {
    if (this.cells.size === 0) return;
    this.clock += dt;
    while (this.clock >= LICHEN.every) {
      this.clock -= LICHEN.every;
      const grow: number[] = [];
      for (const k of this.cells) {
        const [x, y] = keyCell(k);
        for (let i = 0; i < 6; i++) {
          const d = (i + this.rounds) % 6;
          const cx = nx(x, y, d),
            cy = ny(y, d);
          if (rockAt(map, cx, cy) !== ROCK || this.cells.has(cellKey(cx, cy))) continue;
          grow.push(cellKey(cx, cy));
          break;
        }
      }
      for (const k of grow) this.#add(k);
      this.rounds++;
    }
  }

  save(): { cells: number[]; first: number | null; clock: number; rounds: number } {
    return { cells: [...this.cells], first: this.first, clock: this.clock, rounds: this.rounds };
  }

  static load(r: { cells: number[]; first: number | null; clock: number; rounds: number }): Lichen {
    const l = new Lichen();
    for (const k of r.cells) l.cells.add(k);
    l.first = r.first;
    l.clock = r.clock;
    l.rounds = r.rounds;
    return l;
  }
}
