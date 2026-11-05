import { BLOCK_BITS, ChunkLayer } from "./chunks.ts";
import { ENEMY, type Colony } from "./colony.ts";
import { CELL, discOffsets } from "./hex.ts";
import type { Recognition } from "./recognition.ts";
import type { WorldSize } from "./world.ts";

// Fights, pure. An ant with enemies in its own cell or the six around it is in a fight:
// it lays alarm in its own colony's field (so allies smell it and, by stance
// or doctrine, come or keep away) and may die. Its chance of dying in dt is
// Lanchester-like: rate × dt × enemies around ÷ allies around, so equal
// numbers trade and the bigger crowd wins. Deaths are decided for everyone
// before anyone is removed, so the order colonies are listed in is no edge.
//
// With a Recognition (the game always passes one), enemies are strangers by
// odour, judged at the healthy tolerance: an ant whose odour has drifted can
// be fought by its own colony, and two colonies that have come to smell
// alike stop fighting. A calming cue counts against both sides: a calm
// neighbour is (1 − calm) of an enemy, and a calm ant takes (1 − calm) of the
// hazard. Allies are still the ant's own colony around it.

export interface FightParams {
  /** deaths per second for an ant facing as many enemies as allies */
  rate: number;
  /** alarm laid per second by an ant in a fight */
  alarm: number;
  /**
   * the most ants of a side that one cell brings to a fight (behaviour MR 4, docs/combat.md): a crowd can't all reach
   * the ant at once, so where few cells are open round it, as in a pass, few engage (Lymbery et al. 2023). Infinity:
   * every ant in the seven cells counts, as before.
   */
  perCell: number;
  /**
   * the harm a stranger does that isn't fighting (in fight mode), as a share of a fighter's (behaviour MR 4,
   * docs/combat.md): a forager on its way, or one turning to flee, doesn't attack. 1: every stranger in reach harms, as before.
   */
  passive: number;
}

export const DEFAULT_FIGHT: FightParams = { rate: 1.5, alarm: 8, perCell: Infinity, passive: 1 };

/** Fighters per cell, per colony (resolveFights builds them only when `passive` < 1). */
const fighterGrids = new WeakMap<Colony, CountGrid>();
const FIGHT_MODE = 3;

/**
 * Ants per cell over a map of any size: a chunked Uint16 layer that remembers which cells it
 * touched, so a reset clears only those (a few thousand ants), never the whole map.
 */
export class CountGrid {
  readonly layer = new ChunkLayer((n) => new Uint16Array(n), 0);
  /** the same counts summed over 8×8 blocks, so an empty neighbourhood is ruled out in a read or two */
  readonly #blocks = new ChunkLayer((n) => new Uint16Array(n), 0);
  #touched: number[] = [];

  /** Every count back to zero. */
  reset(): void {
    const t = this.#touched;
    for (let k = 0; k < t.length; k += 2) {
      const x = t[k] as number;
      const y = t[k + 1] as number;
      this.layer.set(x, y, 0);
      this.#blocks.set(x >> BLOCK_BITS, y >> BLOCK_BITS, 0);
    }
    t.length = 0;
  }

  add(x: number, y: number, n = 1): void {
    const v = this.layer.get(x, y);
    if (v === 0) this.#touched.push(x, y);
    this.layer.set(x, y, v + n);
    const bx = x >> BLOCK_BITS;
    const by = y >> BLOCK_BITS;
    this.#blocks.set(bx, by, this.#blocks.get(bx, by) + n);
  }

  get(x: number, y: number): number {
    return this.layer.get(x, y);
  }

  any(x0: number, y0: number, x1: number, y1: number): boolean {
    for (let by = y0 >> BLOCK_BITS; by <= y1 >> BLOCK_BITS; by++) for (let bx = x0 >> BLOCK_BITS; bx <= x1 >> BLOCK_BITS; bx++) if (this.#blocks.get(bx, by)) return true;
    return false;
  }
}

/** Ants per cell, one grid per colony. */
export function occupancy(colony: Colony, out: CountGrid): CountGrid {
  out.reset();
  const { w, h } = colony.map.size;
  for (let i = 0; i < colony.n; i++) {
    if (!colony.alive[i]) continue;
    colony.antCell(i);
    out.add(Math.min(w - 1, Math.max(0, CELL[0] as number)), Math.min(h - 1, Math.max(0, CELL[1] as number)));
  }
  return out;
}

/**
 * Sum of a grid over the cells within `r` steps of (cx, cy) (r = 1: the cell and its six neighbours), clipped to the map,
 * each cell counting at most `perCell`.
 */
export function around(grid: CountGrid, size: WorldSize, cx: number, cy: number, r = 1, perCell = Infinity): number {
  let s = 0;
  const o = discOffsets(r)[cy & 1] as Int16Array;
  for (let k = 0; k < o.length; k += 2) {
    const x = cx + (o[k] as number);
    const y = cy + (o[k + 1] as number);
    if (x >= 0 && y >= 0 && x < size.w && y < size.h) s += Math.min(perCell, grid.get(x, y));
  }
  return s;
}

/**
 * Resolve one dt of fighting between colonies; `grids[k]` is colony k's occupancy. With `rec` (built this
 * tick), enemies are strangers by odour; without it, every ant of another colony. Returns the deaths per colony.
 */
export function resolveFights(colonies: Colony[], grids: CountGrid[], dt: number, rng: () => number, p: FightParams = DEFAULT_FIGHT, rec: Recognition | null = null): number[] {
  const deaths: number[][] = colonies.map(() => []);
  const passive = p.passive ?? 1;
  const fighters =
    passive < 1
      ? colonies.map((c) => {
          let g = fighterGrids.get(c);
          if (!g) fighterGrids.set(c, (g = new CountGrid()));
          g.reset();
          const { w, h } = c.map.size;
          for (let i = 0; i < c.n; i++) {
            if (!c.alive[i] || c.mode[i] !== FIGHT_MODE) continue;
            c.antCell(i);
            g.add(Math.min(w - 1, Math.max(0, CELL[0] as number)), Math.min(h - 1, Math.max(0, CELL[1] as number)));
          }
          return g;
        })
      : null;
  colonies.forEach((c, k) => {
    const size = c.map.size;
    for (let i = 0; i < c.n; i++) {
      if (!c.alive[i]) continue;
      c.antCell(i);
      const cx = Math.min(size.w - 1, Math.max(0, CELL[0] as number));
      const cy = Math.min(size.h - 1, Math.max(0, CELL[1] as number));
      let enemies = 0;
      if (rec) {
        rec.look(c.odour[i] as number, rec.params.tolerance);
        enemies = rec.around(cx, cy, size.w, size.h, 1, false, p.perCell) * (1 - (c.calm[i] as number));
        if (enemies < 1e-6) continue;
      } else {
        for (let j = 0; j < grids.length; j++) {
          const g = grids[j] as CountGrid;
          if (j !== k && g.any(cx - 1, cy - 1, cx + 1, cy + 1)) enemies += around(g, size, cx, cy, 1, p.perCell);
        }
        if (enemies === 0) continue;
      }
      const allies = Math.max(1, around(grids[k] as CountGrid, size, cx, cy, 1, p.perCell));
      // A calmed encounter (under half an enemy) does not raise the alarm; with no fungus every enemy is whole.
      // A quiet ant (the fungus's, C3) lays (1 − quiet) of it: a skirmish need not recruit the colony.
      // How loudly is its raiseAlarm response (locally: always, × 1).
      if (enemies >= ENEMY) {
        const loud = (1 - (c.quiet[i] as number)) * c.responses.raiseAlarm(c.touch(i, true));
        if (loud > 0) c.ph.deposit("alarm", c.x[i] as number, c.y[i] as number, p.alarm * dt * loud);
      }
      // Meeting strangers raised the alarm (above) whether they fight or not; the harm is theirs if they fight.
      let harm = enemies;
      // Strangers that aren't fighting harm at `passive` of a fighter's rate: the share of them in reach that fight, by colony.
      if (fighters) {
        let all = 0;
        let fight = 0;
        for (let j = 0; j < grids.length; j++) {
          if (j === k) continue;
          all += around(grids[j] as CountGrid, size, cx, cy);
          fight += around(fighters[j] as CountGrid, size, cx, cy);
        }
        if (all > 0) harm *= (fight + passive * (all - fight)) / all;
      }
      if (rng() < 1 - Math.exp((-p.rate * dt * harm) / allies)) deaths[k]!.push(i);
    }
  });
  colonies.forEach((c, k) => {
    for (const i of deaths[k]!) c.kill(i);
  });
  return deaths.map((d) => d.length);
}
