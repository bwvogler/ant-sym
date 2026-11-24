import { INFECTED, PLANE, type Colony, type Game } from "../../colony/index.ts";
import type { Knowledge } from "./knowledge.ts";

// The colonies the fungus knows of (docs/fog-of-war.md §4.4, PRD §89, ja-1ypq.2; owner, 2026-11-23). A colony is known once its
// hole has been sensed or it holds a host. Its readout is live while it holds a host, and otherwise stays as of the step its last
// host left. A colony known by its hole alone has no readout yet: the fungus learned the nest is there, not its counts.
// A picture only: nothing in the simulation reads it.

export interface KnownColony<T> {
  /** the readout as of `asOf`; null for a colony known by its hole alone, before any host */
  readout: T | null;
  /** the sim time of the readout; for one known by its hole alone, when it was first sensed */
  asOf: number;
  /** whether the colony holds a host now, so the readout is the present */
  live: boolean;
}

/** How many ants of `c` are hosts now. */
export function hostsOf(c: Colony): number {
  let n = 0;
  for (let i = 0; i < c.n; i++) if (c.alive[i] && c.load[i] >= INFECTED) n++;
  return n;
}

export class KnownColonies<T> {
  readonly #read: (c: Colony, game: Game) => T;
  readonly #known = new Map<number, KnownColony<T>>();

  /** `read` takes the numbers a readout shows from a colony: it is called only while the colony holds a host. */
  constructor(read: (c: Colony, game: Game) => T) {
    this.#read = read;
  }

  /** Call once after each sim step, after the fog's sight is stamped. Time gone back (a restart, a load) forgets everything. */
  update(game: Game, knowledge: Knowledge): void {
    if (this.#known.size && [...this.#known.values()].some((k) => k.asOf > game.time)) this.#known.clear();
    game.colonies.forEach((c, i) => {
      const k = this.#known.get(i);
      if (hostsOf(c) > 0) {
        this.#known.set(i, { readout: this.#read(c, game), asOf: game.time, live: true });
      } else if (k) {
        if (k.live) k.live = false; // the last host left: the readout stays as it was
      } else {
        const hole = c.holeCells[0];
        if (hole && knowledge.explored(PLANE, hole.col, hole.row)) this.#known.set(i, { readout: null, asOf: game.time, live: false });
      }
    });
  }

  /** What the fungus knows of colony `i`; null while it does not know it. */
  get(i: number): KnownColony<T> | null {
    return this.#known.get(i) ?? null;
  }

  /** The indexes of the known colonies, in order. */
  list(): number[] {
    return [...this.#known.keys()].sort((a, b) => a - b);
  }
}
