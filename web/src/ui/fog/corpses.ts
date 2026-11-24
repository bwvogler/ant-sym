import { cellKey, type Colony, type Game } from "../../colony/index.ts";
import { type DecayStage, visibleCadavers } from "../cadaverVisual.ts";
import { LIVE, type Knowledge } from "./knowledge.ts";

// The dead the fungus has seen, kept as ground items (owner, 2026-11-23; docs/fog-of-war.md §4.3): a corpse lies where it fell, so a cell nobody senses
// now still shows the corpses it held when last sensed, as they were then (their decay frozen), and loses them only when an observer senses the cell
// again and finds them gone. A picture only: nothing in the simulation reads it.

export interface RememberedCorpse {
  /** the cell */
  x: number;
  y: number;
  heading: number | undefined;
  /** the decay stage when last seen (cadaverVisual decayStage) */
  stage: DecayStage;
  /** the colony it belonged to, for the nest sprite's colour */
  colony: number;
}

export class CorpseMemory {
  /** per layer, the corpses in each cell, by cellKey */
  readonly #layers = new Map<number, Map<number, RememberedCorpse[]>>();

  /** Call once after each sim step, after the fog's sight is stamped. */
  update(game: Game, knowledge: Knowledge, decay: (time: number, died: number) => DecayStage): void {
    game.layers.forEach((_, l) => {
      let cells = this.#layers.get(l);
      if (!cells) this.#layers.set(l, (cells = new Map()));
      // What an observer senses now replaces what was remembered there.
      for (const [key, list] of cells) if (knowledge.state(l, list[0]!.x, list[0]!.y) === LIVE) cells.delete(key);
      game.colonies.forEach((col: Colony, n) => {
        for (const d of visibleCadavers(col, l)) {
          if (knowledge.state(l, d.x, d.y) !== LIVE) continue;
          const key = cellKey(d.x, d.y);
          let list = cells.get(key);
          if (!list) cells.set(key, (list = []));
          list.push({ x: d.x, y: d.y, heading: d.heading, stage: decay(col.time, d.died), colony: n });
        }
      });
    });
  }

  /** Every corpse remembered on layer `l`. */
  on(l: number): Iterable<RememberedCorpse> {
    const cells = this.#layers.get(l);
    return cells ? [...cells.values()].flat() : [];
  }

  /** Forget everything (time went back: a restart, a load). */
  clear(): void {
    this.#layers.clear();
  }
}
